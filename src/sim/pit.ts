import { FUEL, PIT } from '../config/balance';
import type { Assets } from '../core/assets';
import type { InputState } from '../core/input';
import { PitCrew } from '../render/pitcrew';
import type { DynSprite } from '../render/road';
import type { Track } from '../track/segments';
import type { Player } from './player';
import type { Compound } from './tyres';

export type PitPhase = 'none' | 'entry' | 'lane' | 'service' | 'exit';

/** Choix stratégique : gommes (ou rien) et niveau de réservoir visé (indice dans PIT.fuelOptions, 0 = pas de ravitaillement). */
export interface PitPlan {
  tyre: 'none' | Compound;
  fuelStep: number;
}

export interface PitEstimate {
  litres: number;
  tyreS: number;
  fuelS: number;
  /** Durée d'immobilisation (de l'arrêt au feu vert) */
  totalS: number;
}

const smooth = (t: number) => {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
};
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/**
 * Arrêt au stand du joueur.
 *
 *  1. Le joueur arme l'arrêt (intent) et choisit ses pneus / son ravitaillement (plan).
 *  2. Avant l'entrée : le limiteur s'enclenche. À l'entrée : la voiture est guidée latéralement jusqu'à la voie (rampe).
 *  3. Dans la voie : limiteur 80 km/h ; l'aide au stationnement amène la voiture pile dans sa boîte.
 *  4. Service : voiture immobilisée, mécaniciens animés, durée selon ce qu'on change ; pneus puis carburant mis à jour.
 *  5. Feu vert : la voiture repart seule jusqu'à la sortie ; après la rampe de sortie, le joueur reprend la main.
 * Sans intention armée, la voie des stands reste accessible à la main (limiteur seulement, sans arrêt).
 */
export class PitController {
  intent = false;
  plan: PitPlan = { tyre: 'none', fuelStep: 0 };
  phase: PitPhase = 'none';
  crew: PitCrew | null = null;
  /** Nombre d'arrêts effectués et durée du dernier (de l'arrêt au feu vert) */
  stops = 0;
  lastServiceS = 0;
  /** Menu de choix ouvert (le jeu est en pause) : s'ouvre à l'entrée dans la voie des stands si `askPlayer` */
  menuOpen = false;
  askPlayer = false;
  /** Dernier arrêt manqué (boîte dépassée) */
  missed = false;
  /** Temps restant d'affichage du « feu vert » (s) */
  goFlash = 0;

  private served = false;
  private guidedRun = false;
  private xEntry = 0;
  private litres = 0;
  private fuelStart = 0;
  private tyreApplied = false;
  private serviceTyre: 'none' | Compound = 'none';

  constructor(private readonly track: Track, readonly boxIndex: number = PIT.playerBox) {}

  reset(): void {
    this.intent = false;
    this.menuOpen = false;
    this.plan = { tyre: 'none', fuelStep: 0 };
    this.phase = 'none';
    this.crew = null;
    this.served = false;
    this.guidedRun = false;
    this.missed = false;
    this.stops = 0;
    this.lastServiceS = 0;
  }

  // --- Choix du joueur
  toggleIntent(): void {
    if (this.phase !== 'none') return;
    this.intent = !this.intent;
  }
  /** Le plan ne change plus quand l'équipe est déjà en route. */
  private get locked(): boolean {
    return this.phase === 'service' || (this.crew !== null && !this.served);
  }
  cycleTyre(): void {
    if (this.locked) return;
    const o = PIT.tyreOptions;
    this.plan.tyre = o[(o.indexOf(this.plan.tyre) + 1) % o.length];
  }
  cycleFuel(): void {
    if (this.locked) return;
    this.plan.fuelStep = (this.plan.fuelStep + 1) % PIT.fuelOptions.length;
  }

  /** Litres à ajouter pour atteindre le niveau visé (0 si déjà au-dessus). */
  litresFor(player: Player): number {
    const target = PIT.fuelOptions[this.plan.fuelStep] * FUEL.capacity;
    return Math.max(0, target - player.fuel.level);
  }

  /** Estimation de la durée d'immobilisation pour le plan courant. */
  estimate(player: Player): PitEstimate {
    const litres = this.litresFor(player);
    const tyreS = this.plan.tyre !== 'none' ? PIT.tyreServiceS : 0;
    const fuelS = litres > 0.5 ? PIT.refuelSetupS + litres / PIT.refuelRate : 0;
    const totalS = Math.max(tyreS, fuelS > 0 ? 4 * PIT.stepS + fuelS : 0);
    return { litres, tyreS, fuelS, totalS };
  }
  hasService(player: Player): boolean {
    return this.plan.tyre !== 'none' || this.litresFor(player) > 0.5;
  }

  /** Distance restante jusqu'à la boîte (m) pendant l'approche guidée, sinon null. */
  boxDistance(player: Player): number | null {
    if (this.phase !== 'lane' || !this.guidedRun || this.served || this.missed) return null;
    const d = this.track.pitBoxZ(this.boxIndex) - player.z;
    return d > 0 ? d : null;
  }

  /** Distance avant l'entrée des stands (m) quand un arrêt est armé et qu'on approche, sinon null. */
  entryDistance(player: Player): number | null {
    if (!this.intent || this.phase !== 'none') return null;
    const L = this.track.length;
    const d = (((this.track.pitEntryZ - player.z) % L) + L) % L;
    return d > 0 && d <= PIT.approachHintM ? d : null;
  }

  /** Temps de service restant (s), pour l'affichage. */
  get remainingS(): number {
    if (!this.crew || this.phase !== 'service') return 0;
    return Math.max(0, this.crew.totalS - this.crew.serviceTime);
  }

  /**
   * À appeler avant `player.update`. Pilote les champs de stand du joueur (limiteur, guidage, immobilisation)
   * et renvoie les commandes à appliquer (braquage/gaz/frein pris en charge pendant les phases guidées).
   */
  update(dt: number, player: Player, input: InputState): InputState {
    const T = this.track;
    const z = player.z;
    const entryZ = T.pitEntryZ, laneZ = T.pitLaneStartZ, exitZ = T.pitExitZ, exitEnd = T.pitExitEndZ;
    const laneX = PIT.laneAxis + PIT.boxLaneOffset; // voie des boîtes (côté garages)
    const fastX = PIT.laneAxis - PIT.boxLaneOffset; // voie rapide (côté piste) : on y passe sans gêner les boîtes
    const boxZ = T.pitBoxZ(this.boxIndex);
    const out: InputState = { ...input };
    const steerTo = (x: number) => clamp((x - player.x) * 0.5, -0.8, 0.8);

    if (this.goFlash > 0) this.goFlash -= dt;
    if (this.crew) {
      this.crew.update(dt, this.phase === 'service');
      if (this.crew.finished) this.crew = null;
    }

    switch (this.phase) {
      case 'none': {
        player.guideX = null; player.hold = false; player.speedCap = null; player.pitFrame = -1;
        // Le limiteur ne s'enclenche qu'une fois dans la voie des stands (pas avant : on freine soi-même).
        if (this.intent && z >= entryZ && z < laneZ) {
          this.phase = 'entry'; // arrêt armé : on prend le biseau d'entrée, la voiture est guidée
          this.guidedRun = true;
          this.served = false;
          this.missed = false;
          this.xEntry = player.x;
          player.speedCap = PIT.speedLimit;
          if (this.askPlayer) this.menuOpen = true; // choix des pneus / de l'essence, jeu en pause
        } else if (T.onPitRoad(z, player.x)) {
          this.phase = 'lane'; // entrée à la main sur le bitume des stands : limiteur seulement
          this.guidedRun = false;
          player.speedCap = PIT.speedLimit;
        }
        break;
      }
      case 'entry': {
        // on rejoint progressivement la voie rapide, qui suit le biseau d'entrée
        const lx = T.pitLaneXAt(z, false);
        const target = this.xEntry + ((Number.isNaN(lx) ? fastX : lx) - this.xEntry) * smooth((z - entryZ) / (laneZ - entryZ));
        player.guideX = target;
        player.speedCap = PIT.speedLimit;
        out.steer = steerTo(target);
        if (z >= laneZ) this.phase = 'lane';
        break;
      }
      case 'lane': {
        player.speedCap = PIT.speedLimit;
        if (this.guidedRun) {
          // voie rapide, sauf dans les 24 derniers mètres avant sa boîte : on se range dans la voie des boîtes
          const toBox = boxZ - z;
          const wantBox = !this.served && !this.missed && this.hasService(player) && toBox < 24 && toBox > -PIT.stopZoneHalf;
          const tx = wantBox ? laneX : fastX;
          player.guideX = tx;
          out.steer = steerTo(tx);
        } else player.guideX = null;

        if (this.guidedRun && !this.served && !this.missed && this.hasService(player)) {
          const dist = boxZ - z;
          if (!this.crew && dist < 40 && dist > 0) this.makeCrew(player, boxZ, laneX);
          if (PIT.autoPark) {
            if (dist > 0.5) {
              const vdes = Math.min(PIT.speedLimit, Math.sqrt(2 * PIT.parkDecel * dist));
              out.throttle = player.speed < vdes - 0.5;
              out.brake = player.speed > vdes + 0.5;
            } else {
              player.z = boxZ;
              this.beginService(player, boxZ, laneX);
            }
          } else if (player.speed < 0.3 && Math.abs(z - boxZ) <= PIT.stopZoneHalf) {
            this.beginService(player, boxZ, laneX);
          } else if (z > boxZ + PIT.stopZoneHalf) {
            this.missed = true; // boîte dépassée
            this.crew = null;
          }
        } else if (this.guidedRun && (this.served || this.missed || !this.hasService(player))) {
          out.throttle = player.speed < PIT.speedLimit - 1; // départ automatique jusqu'au limiteur
        }
        if (this.phase === 'lane' && z >= exitZ) this.phase = 'exit';
        // entrée à la main : le limiteur cesse dès qu'on quitte le bitume des stands (retour piste ou fin de zone)
        if (this.phase === 'lane' && !this.guidedRun && !T.onPitRoad(z, player.x)) this.endRun(player);
        break;
      }
      case 'service': {
        const crew = this.crew!;
        player.hold = true;
        player.speedCap = PIT.speedLimit;
        out.throttle = false; out.brake = false;
        if (this.litres > 0) {
          player.fuel.level = Math.min(FUEL.capacity, this.fuelStart + this.litres * crew.fuelProgress);
        }
        if (crew.tyresFitted && !this.tyreApplied && this.serviceTyre !== 'none') {
          player.tyres.fit(this.serviceTyre);
          this.tyreApplied = true;
        }
        player.pitFrame = crew.carFrame;
        if (crew.serviceDone) {
          if (this.litres > 0) player.fuel.level = Math.min(FUEL.capacity, this.fuelStart + this.litres);
          if (this.serviceTyre !== 'none' && !this.tyreApplied) player.tyres.fit(this.serviceTyre);
          player.hold = false;
          player.pitFrame = -1;
          this.served = true;
          this.stops++;
          this.lastServiceS = crew.totalS;
          this.goFlash = 1.5;
          this.plan = { tyre: 'none', fuelStep: 0 };
          this.intent = false;
          this.phase = 'lane';
        }
        break;
      }
      case 'exit': {
        player.speedCap = PIT.speedLimit;
        if (this.guidedRun) {
          const lx = T.pitLaneXAt(z, false);
          const from = Number.isNaN(lx) ? fastX : lx;
          const target = from + (PIT.exitX - from) * smooth((z - exitZ) / (exitEnd - exitZ));
          player.guideX = target;
          out.steer = steerTo(target);
          out.throttle = player.speed < PIT.speedLimit - 1;
        }
        if (z >= exitEnd || Number.isNaN(T.pitAxisAt(z)) || (!this.guidedRun && !T.onPitRoad(z, player.x))) this.endRun(player);
        break;
      }
    }
    return out;
  }

  private endRun(player: Player): void {
    player.guideX = null;
    player.speedCap = null;
    player.hold = false;
    player.pitFrame = -1;
    this.phase = 'none';
    this.guidedRun = false;
    this.served = false;
    this.intent = false;
  }

  private makeCrew(player: Player, boxZ: number, laneX: number): void {
    const litres = this.litresFor(player);
    const fuelSeconds = litres > 0.5 ? PIT.refuelSetupS + litres / PIT.refuelRate : 0;
    this.crew = new PitCrew(boxZ, laneX, { tyres: this.plan.tyre !== 'none', fuelSeconds });
  }

  private beginService(player: Player, boxZ: number, laneX: number): void {
    if (!this.crew) this.makeCrew(player, boxZ, laneX);
    this.litres = this.litresFor(player);
    this.fuelStart = player.fuel.level;
    this.serviceTyre = this.plan.tyre;
    this.tyreApplied = false;
    player.speed = 0;
    player.hold = true;
    this.phase = 'service';
  }

  /** Sprites dynamiques de l'équipe pour le rendu. */
  sprites(a: Assets): DynSprite[] {
    return this.crew ? this.crew.sprites(a) : [];
  }
}
