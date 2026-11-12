import { Driver } from '../ai/driver';
import type { DriverProfile, RosterEntry } from '../ai/roster';
import { SafetyCar } from '../ai/safetycar';
import { AI, COLLISION, DRAFT, PHYSICS, SC, TOW, WEATHER } from '../config/balance';
import type { Assets, CarSheets, MarshalAssets, SafetyCarAssets } from '../core/assets';
import type { InputState } from '../core/input';
import { t } from '../i18n';
import { pickCarFrame } from '../render/car';
import type { DynSprite } from '../render/road';
import type { Track } from '../track/segments';
import { PitController } from './pit';
import { Player } from './player';
import type { RaceState } from './race';
import type { Compound } from './tyres';

/** Un concurrent : le joueur ou un adversaire (même type de voiture `Player`, piloté autrement). */
export interface Entry {
  id: string;
  name: string;
  isPlayer: boolean;
  car: Player;
  pit: PitController;
  driver: Driver | null;
  sheets: CarSheets | null;
  /** Distance parcourue depuis la ligne d'arrivée (m, non bouclée ; négative sur la grille) */
  progress: number;
  prevZ: number;
  /** Temps d'arrivée (s, pénalités comprises) ou null */
  finishTime: number | null;
  /** Temps restant à l'arrêt sur le bas-côté après un incident (s) */
  stoppedT: number;
  wasSpinning: boolean;
}

export interface AheadInfo {
  distance: number;
  speed: number;
  x: number;
  isSC: boolean;
  stopped: boolean;
  /** La voiture concernée (absente pour la safety car) */
  entry?: Entry;
}

/** Écart signé le plus court entre deux distances le long de la piste. */
export function wrapDz(from: number, to: number, L: number): number {
  return ((((to - from) % L) + L + L / 2) % L) - L / 2;
}

/**
 * Le peloton : joueur + adversaires. Gère la grille, les pilotes IA, les contacts, le classement,
 * les incidents, la safety car (et la pénalité de dépassement sous neutralisation) et fournit les sprites à dessiner.
 */
export class Field {
  readonly entries: Entry[] = [];
  readonly player: Entry;
  readonly sc = new SafetyCar();
  /** Classement courant (1er en tête) */
  ranking: Entry[] = [];
  laps = 0;
  raceState: RaceState = 'countdown';
  /** Pénalités accumulées par le joueur (s) et temps d'affichage du message */
  penaltyS = 0;
  penaltyFlash = 0;
  /** Choc récent : secousse d'écran (s restantes) et étincelles */
  hitFlash = 0;
  /** Safety car possible (désactivée en time attack) */
  scEnabled = true;
  /** Pilote auto du joueur : actif sous safety car quand le peloton est reformé, et pendant le remorquage */
  playerAuto = false;
  /** Panne sèche : la dépanneuse remorque la voiture du joueur jusqu'à sa boîte */
  towActive = false;
  /** Plafond de vitesse du pilote auto (m/s) ou null */
  autoCap: number | null = null;
  private readonly assist: Driver;
  private formedT = 0;
  private dryT = 0;
  private towStops = 0;
  /** Dépanneuse qui s'éloigne une fois la voiture déposée au stand : position (m le long de la piste), latérale, vitesse */
  private truck: { z: number; x: number; speed: number; progress: number } | null = null;
  private time = 0;
  private clock = 0;
  private playerFinishedAt: number | null = null;
  private readonly prevAhead = new Map<string, boolean>();
  private penaltyCooldown = 0;
  private scRequestedBy: Entry | null = null;

  constructor(
    readonly track: Track,
    playerCar: Player,
    playerPit: PitController,
    roster: RosterEntry[],
    private readonly scAssets: SafetyCarAssets,
    private readonly marshal: MarshalAssets,
    playerName: string,
  ) {
    this.player = {
      id: 'player', name: playerName, isPlayer: true, car: playerCar, pit: playerPit, driver: null, sheets: null,
      progress: 0, prevZ: 0, finishTime: null, stoppedT: 0, wasSpinning: false,
    };
    this.entries.push(this.player);
    this.assist = new Driver(this.player, ASSIST_PROFILE, 4242, false, true);
    roster.forEach((r, i) => {
      const car = new Player();
      const e: Entry = {
        id: r.profile.id, name: t(r.profile.nameKey as never), isPlayer: false, car,
        pit: new PitController(track, r.boxIndex), driver: null, sheets: r.sheets,
        progress: 0, prevZ: 0, finishTime: null, stoppedT: 0, wasSpinning: false,
      };
      e.driver = new Driver(e, r.profile, 1000 + i * 77, r.profile.id === 'kevin');
      this.entries.push(e);
    });
  }

  /** Place tout le monde sur la grille (Kevin en pole, le joueur à `AI.gridPlayerSlot`). */
  reset(laps: number, startTyre: Compound, startFuel: number): void {
    this.laps = laps;
    this.raceState = 'countdown';
    this.penaltyS = 0;
    this.penaltyFlash = 0;
    this.hitFlash = 0;
    this.hardHits = 0;
    this.time = 0;
    this.playerFinishedAt = null;
    this.prevAhead.clear();
    this.penaltyCooldown = 0;
    this.scRequestedBy = null;
    this.sc.reset();
    this.playerAuto = false;
    this.towActive = false;
    this.truck = null;
    this.autoCap = null;
    this.formedT = 0;
    this.dryT = 0;
    this.player.pit.askPlayer = true;

    const n = this.entries.length;
    const playerSlot = Math.min(AI.gridPlayerSlot, n - 1);
    const slotOf = new Map<Entry, number>();
    // grille : les adversaires du plus rapide (marge × puissance) au plus lent, Kevin en pole ; le joueur à sa place configurée
    const pace = (e: Entry) => (e.driver ? e.driver.margin * e.driver.power : 0) + (e.id === 'kevin' ? 1 : 0);
    const others = this.entries.filter((e) => !e.isPlayer).sort((a, b) => pace(b) - pace(a));
    let k = 0;
    for (let s = 0; s < n; s++) {
      slotOf.set(s === playerSlot ? this.player : others[k++], s);
    }
    const L = this.track.length;
    const fz = this.track.finishZ;
    this.entries.forEach((e, idx) => {
      const slot = slotOf.get(e)!;
      const row = Math.floor(slot / 2);
      const col = slot % 2;
      const back = 12 + row * AI.gridRowGapM + (col === 1 ? AI.gridStaggerM : 0);
      const z = (((fz - back) % L) + L) % L;
      const dry: Compound[] = ['medium', 'hard', 'soft'];
      const compound: Compound = e.isPlayer ? startTyre : WEATHER.wetness > 0.3 ? 'rain' : e.id === 'kevin' ? 'soft' : dry[idx % 3];
      e.car.reset(z, compound, e.isPlayer ? startFuel : 1);
      e.car.x = col === 0 ? -AI.gridColumnX : AI.gridColumnX;
      e.progress = wrapDz(fz, z, L);
      e.prevZ = z;
      e.finishTime = null;
      e.stoppedT = 0;
      e.wasSpinning = false;
      if (!e.isPlayer) {
        e.pit.reset();
        e.driver!.reset();
      }
    });
    this.updateRanking();
  }

  /** Commandes du pilote auto (à utiliser à la place de celles du joueur quand `playerAuto`). */
  autopilot(dt: number): InputState {
    return this.assist.update(dt, this);
  }

  /** Aspiration de `e` : 0 (air libre) … 1 (collé derrière une voiture sur la même ligne). */
  draftFor(e: Entry): number {
    if (this.sc.active || e.car.speed < DRAFT.minSpeed || e.car.hold || e.car.spinning) return 0;
    const a = this.carAhead(e, DRAFT.rangeM);
    if (!a || a.isSC || a.stopped || Math.abs(a.x - e.car.x) > DRAFT.lateralM) return 0;
    const gap = Math.max(0, a.distance - COLLISION.length);
    return Math.max(0, Math.min(1, 1 - gap / DRAFT.rangeM));
  }

  /** À appeler avant la mise à jour du joueur : plafonne sa vitesse sous safety car. */
  beforePlayer(): void {
    // Sous safety car le joueur suit le peloton comme les adversaires : il peut combler l'écart avec la voiture qui
    // le précède (le peloton se regroupe) mais pas la dépasser ; sans voiture devant, il est limité à la vitesse de la safety car.
    const car = this.player.car;
    car.draft = this.draftFor(this.player);
    if (!this.sc.active) {
      car.scCap = null;
      return;
    }
    const ahead = this.carAhead(this.player, 900);
    if (!ahead) car.scCap = SC.speed;
    else {
      const gap = ahead.distance - COLLISION.length;
      const closing = Math.sqrt(2 * AI.followDecel * Math.max(0, gap - SC.followGapM));
      car.scCap = Math.max(0, ahead.speed + closing - (gap < SC.followGapM ? (SC.followGapM - gap) * 2 : 0));
    }
  }

  /** Avance les adversaires d'un pas et gère contacts, incidents, safety car, classement. */
  update(dt: number, raceState: RaceState, raceTime: number): void {
    this.clock += dt;
    this.raceState = raceState;
    this.time = raceTime;
    const L = this.track.length;

    // Joueur : progression, arrivée
    this.advanceProgress(this.player, L);
    if (raceState === 'finished' && this.player.finishTime === null) {
      this.player.finishTime = raceTime + this.penaltyS;
      this.playerFinishedAt = raceTime;
    }

    // Adversaires
    for (const e of this.entries) {
      if (e.isPlayer) continue;
      e.car.draft = this.draftFor(e);
      const input = e.driver!.update(dt, this);
      e.car.scCap = null;
      e.car.update(dt, input, this.track);
      this.advanceProgress(e, L);
      if (e.finishTime === null && e.progress >= this.laps * L) e.finishTime = raceTime;
    }

    this.collide(L);
    this.detectIncidents();
    this.updateAuto(dt);

    // Safety car
    const leader = this.leaderProgress();
    this.sc.update(dt, leader, L);
    this.updatePenalty(dt);
    if (this.hitFlash > 0) this.hitFlash -= dt;
    if (this.penaltyFlash > 0) this.penaltyFlash -= dt;
    this.updateRanking();
  }

  /** Nombre de chocs forts depuis le départ (statistique de test) */
  hardHits = 0;
  /** Dernier choc fort (avant, arrière, vitesse relative, écarts, état de la safety car) : pour le debug */
  lastHit: { a: string; b: string; rel: number; dz: number; dx: number; sc: string } | null = null;

  /** Tout le monde a franchi l'arrivée, ou le temps d'attente après le joueur est écoulé. */
  get raceOver(): boolean {
    if (this.playerFinishedAt === null) return false;
    return this.entries.every((e) => e.finishTime !== null) || this.time - this.playerFinishedAt > AI.finishWaitS;
  }

  get playerPosition(): number {
    return this.ranking.indexOf(this.player) + 1;
  }

  /** Voiture (ou safety car) la plus proche devant `e`, à moins de `maxDist` m, sur une ligne proche. */
  carAhead(e: Entry, maxDist: number): AheadInfo | null {
    let best: AheadInfo | null = null;
    // De près (< NEAR m) on ne considère que les voitures sur une ligne proche. De loin (peloton qui se regroupe
    // sous safety car) on suit la voiture qui précède quelle que soit sa ligne, sauf si elle est hors piste
    // (garée, au stand), car elle ne fait pas partie du peloton.
    const NEAR = 60;
    const consider = (d: number, speed: number, x: number, isSC: boolean, stopped: boolean, offTrack: boolean, entry?: Entry) => {
      if (d <= 0 || d > maxDist) return;
      // hors safety car, seules comptent les voitures sur une ligne proche, quelle que soit la distance
      const sameLine = Math.abs(x - e.car.x) <= COLLISION.width * 1.4;
      if (d < NEAR || !this.sc.active ? !sameLine : offTrack) return;
      if (!best || d < best.distance) best = { distance: d, speed, x, isSC, stopped, entry };
    };
    for (const o of this.entries) {
      if (o === e) continue;
      const offTrack = o.stoppedT > 0 || o.car.hold || o.pit.phase !== 'none';
      // distance le long de la PISTE (et non de la course) : une voiture doublée d'un tour est quand même devant nous
      consider(this.ahead(e, o.car.z), o.car.speed, o.car.x, false, o.stoppedT > 0 || o.car.hold, offTrack, o);
    }
    if (this.sc.active) {
      const zc = (((this.track.finishZ + this.sc.progress) % this.track.length) + this.track.length) % this.track.length;
      consider(this.ahead(e, zc), this.sc.speed, 0, true, false, false);
    }
    return best;
  }

  /** Distance (m, signée, sur le tour) de `e` jusqu'à la position `z` : positive = devant. */
  ahead(e: Entry, z: number): number {
    return wrapDz(e.car.z, z, this.track.length);
  }

  /** Vrai si aucune autre voiture ne gêne la ligne `x` autour de `e` (± `range` m le long de la piste). */
  laneFree(e: Entry, x: number, range: number): boolean {
    for (const o of this.entries) {
      if (o === e) continue;
      if (Math.abs(this.ahead(e, o.car.z)) < range && Math.abs(o.car.x - x) < COLLISION.width * 1.3) return false;
    }
    return true;
  }

  private leaderProgress(): number {
    let m = -Infinity;
    for (const e of this.entries) if (e.finishTime === null || !e.isPlayer) m = Math.max(m, e.progress);
    return m;
  }

  private advanceProgress(e: Entry, L: number): void {
    e.progress += wrapDz(e.prevZ, e.car.z, L);
    e.prevZ = e.car.z;
  }

  private updateRanking(): void {
    this.ranking = [...this.entries].sort((a, b) => {
      if (a.finishTime !== null && b.finishTime !== null) return a.finishTime - b.finishTime;
      if (a.finishTime !== null) return -1;
      if (b.finishTime !== null) return 1;
      return b.progress - a.progress;
    });
  }

  /** Contacts : écarte les voitures, ralentit celle de derrière, dégâts au joueur, tête-à-queue possible entre adversaires. */
  private collide(L: number): void {
    const n = this.entries.length;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = this.entries[i], b = this.entries[j];
        const ca = a.car, cb = b.car;
        if (ca.hold || cb.hold) continue; // immobilisées (stand, incident garé)
        if (a.pit.phase !== 'none' && b.pit.phase !== 'none') continue; // toutes deux dans la voie des stands
        const dz = wrapDz(ca.z, cb.z, L);
        const dx = cb.x - ca.x;
        if (Math.abs(dz) >= COLLISION.length || Math.abs(dx) >= COLLISION.width) continue;
        const front = dz >= 0 ? b : a;
        const rear = dz >= 0 ? a : b;
        const rel = Math.max(0, rear.car.speed - front.car.speed);
        // écart latéral (sauf voitures guidées)
        const sign = dx >= 0 ? 1 : -1;
        const shift = (COLLISION.width - Math.abs(dx)) * COLLISION.push * 0.5;
        if (ca.guideX === null) ca.x -= sign * shift;
        if (cb.guideX === null) cb.x += sign * shift;
        // quantité de mouvement : celle de derrière perd, celle de devant gagne un peu
        rear.car.speed = Math.max(0, rear.car.speed - rel * 0.7);
        front.car.speed = Math.min(PHYSICS.maxSpeed, front.car.speed + rel * 0.25);
        if (rel > COLLISION.hardHit) {
          this.hitFlash = 0.35;
          this.hardHits++;
          this.lastHit = { a: front.name, b: rear.name, rel, dz, dx, sc: this.sc.state };
          for (const p of [a, b]) {
            if (!p.isPlayer) continue;
            const share = p === front ? COLLISION.damageRearEnded : 1; // percuté par l'arrière : moins sa faute
            p.car.damage = Math.min(1, p.car.damage + rel * COLLISION.damagePerMs * share);
          }
          // gros choc entre adversaires : la voiture de derrière peut partir en tête-à-queue
          if (!rear.isPlayer && rel > 10 && Math.random() < 0.4 && !rear.car.spinning) {
            rear.car.spinT = 0;
            rear.car.spinDir = Math.random() < 0.5 ? 1 : -1;
          }
        }
      }
    }
  }

  /**
   * Pilote auto du joueur :
   *  - sous safety car, dès que toutes les voitures en piste sont revenues les unes derrière les autres (écarts ≤ `AI.packGapM`
   *    entre voitures consécutives, et avec la safety car), pendant 1,5 s : la voiture suit le peloton toute seule ;
   *  - panne sèche : la dépanneuse arrive (2 s à l'arrêt), remorque la voiture jusqu'à sa boîte (ravitaillement), pénalité de temps.
   */
  private updateAuto(dt: number): void {
    const pl = this.player;
    const car = pl.car;
    const racing = this.raceState === 'racing';

    // --- Dépanneuse
    if (!this.towActive) {
      if (racing && car.dry && car.speed < 2 && pl.pit.phase === 'none') this.dryT += dt;
      else this.dryT = 0;
      if (this.dryT > TOW.dryDelayS) {
        this.towActive = true;
        this.truck = null;
        this.towStops = pl.pit.stops;
        car.towed = true;
        pl.pit.askPlayer = false; // pas de menu : le plan est imposé
        pl.pit.plan = { tyre: 'none', fuelStep: TOW.refuelStep };
        pl.pit.intent = true;
        this.penaltyS += TOW.penaltyS;
        this.penaltyFlash = 4;
        this.autoCap = TOW.speed;
        // panne d'essence : voiture hors service sur la piste → safety car
        if (this.scEnabled && this.sc.state === 'none') {
          this.sc.request();
          this.scRequestedBy = this.entries.find((e) => e.isPlayer) ?? null;
        }
      }
    } else if (pl.pit.stops > this.towStops && pl.pit.phase === 'none') {
      this.towActive = false;
      car.towed = false;
      pl.pit.askPlayer = true;
      this.autoCap = null;
      this.truck = null;
    }

    // La dépanneuse ne reste pas : dès que la voiture est déposée à sa boîte (service), elle repart dans la voie rapide
    if (this.towActive && pl.pit.phase === 'service' && !this.truck) {
      this.truck = { z: car.z + TOW.hitchM, x: car.x, speed: 6, progress: 0 };
    }
    if (this.truck) {
      const tk = this.truck;
      const L = this.track.length;
      tk.speed = Math.min(TOW.leaveSpeed, tk.speed + TOW.leaveAccel * dt);
      tk.z = (tk.z + tk.speed * dt) % L;
      tk.progress += tk.speed * dt;
      const fast = this.track.pitLaneXAt(tk.z, false);
      if (!Number.isNaN(fast)) tk.x += Math.max(-8 * dt, Math.min(8 * dt, fast - tk.x));
      if (tk.progress > 420) this.truck = null; // hors de vue
    }

    // --- Peloton reformé sous safety car
    let formed = false;
    if (this.sc.active && !this.towActive && pl.pit.phase === 'none' && !car.spinning && racing) {
      const rk = this.ranking.filter((e) => e.finishTime === null && e.stoppedT <= 0 && !e.car.hold && e.pit.phase === 'none' && !e.car.spinning);
      formed = rk.length > 1;
      for (let i = 1; i < rk.length && formed; i++) {
        if (rk[i - 1].progress - rk[i].progress - COLLISION.length > AI.packGapM) formed = false;
      }
      if (formed && this.sc.progress - rk[0].progress - COLLISION.length > AI.packGapM * 2.5) formed = false;
    }
    if (this.sc.active && !this.towActive) {
      this.formedT = formed ? this.formedT + dt : this.playerAuto ? this.formedT : 0;
      if (this.formedT > 1.5) this.playerAuto = true;
    } else if (!this.towActive) {
      this.formedT = 0;
      this.playerAuto = false;
    }
    if (this.towActive) this.playerAuto = true;
  }

  /** Un adversaire tombe en panne : safety car (si aucune n'est déjà en piste). */
  reportBreakdown(e: Entry): void {
    if (this.sc.state === 'none') {
      this.sc.request();
      this.scRequestedBy = e;
    }
  }

  /** Suit les tête-à-queue (sans safety car : seule une voiture hors service ou une panne d'essence en déclenche une). */
  private detectIncidents(): void {
    for (const e of this.entries) e.wasSpinning = e.car.spinning;
  }

  /** Dépasser sous safety car coûte une pénalité (sauf voiture garée, au stand ou en tête-à-queue). */
  private updatePenalty(dt: number): void {
    if (this.penaltyCooldown > 0) this.penaltyCooldown -= dt;
    const p = this.player;
    for (const e of this.entries) {
      if (e.isPlayer) continue;
      const ahead = e.progress > p.progress;
      const was = this.prevAhead.get(e.id);
      if (this.sc.active && was === true && !ahead && this.penaltyCooldown <= 0) {
        // voitures garées, au stand, en tête-à-queue ou quasi à l'arrêt : les dépasser est normal
        const legit = e.pit.phase !== 'none' || p.pit.phase !== 'none' || e.car.spinning || e.stoppedT > 0 || e.car.hold || e.car.speed < SC.speed * 0.6;
        if (!legit && this.raceState === 'racing') {
          this.penaltyS += SC.overtakePenaltyS;
          this.penaltyFlash = 3;
          this.penaltyCooldown = 4;
        }
      }
      this.prevAhead.set(e.id, ahead);
    }
  }

  /** Tous les sprites dynamiques : adversaires, safety car, commissaires, équipes de stand des adversaires. */
  sprites(a: Assets): DynSprite[] {
    const out: DynSprite[] = [];
    const L = this.track.length;
    const fz = this.track.finishZ;
    for (const e of this.entries) {
      if (e.isPlayer || !e.sheets) continue;
      const fr = pickCarFrame(e.sheets, e.car);
      out.push({ img: fr.img, sx: fr.sx, sy: fr.sy, sw: fr.sw, sh: fr.sh, ax: fr.ax, ay: fr.ay, ppm: 36, z: e.car.z, x: e.car.x });
      out.push(...e.pit.sprites(a));
      // commissaire au drapeau jaune près d'une voiture garée
      if (e.stoppedT > 0 && e.car.speed < 1) {
        const m = this.marshal;
        const frame = Math.floor(this.clock * m.fps) % m.count;
        const left = e.car.x < 0;
        out.push({
          img: m.img, sx: frame * m.frame.w, sy: 0, sw: m.frame.w, sh: m.frame.h, ax: m.anchor.x, ay: m.anchor.y, ppm: 36,
          z: e.car.z - 3, x: e.car.x + (left ? -3.5 : 3.5), flip: left,
        });
      }
    }
    // Dépanneuse : devant la voiture remorquée, puis seule quand elle repart. Gyrophares de la planche non utilisés.
    {
      const s = this.scAssets;
      const f = s.spec.frame;
      let tz: number | null = null, tx = 0;
      if (this.truck) { tz = this.truck.z; tx = this.truck.x; }
      else if (this.towActive) { tz = this.player.car.z + TOW.hitchM; tx = this.player.car.x; }
      if (tz !== null) {
        const seg = this.track.segmentAt(tz);
        const idx = Math.max(0, Math.min(6, Math.round(3 + Math.max(-1, Math.min(1, seg.curve / 0.08)) * 2)));
        out.push({ img: s.tow, sx: idx * f.w, sy: 0, sw: f.w, sh: f.h, ax: s.spec.anchor.x, ay: s.spec.anchor.y, ppm: s.towPpm, z: tz, x: tx });
      }
    }
    if (this.sc.state === 'out' || this.sc.state === 'ending') {
      const s = this.scAssets;
      const zc = (((fz + this.sc.progress) % L) + L) % L;
      const seg = this.track.segmentAt(zc);
      const idx = Math.max(0, Math.min(6, Math.round(3 + Math.max(-1, Math.min(1, seg.curve / 0.08)) * 2)));
      const row = this.sc.flashRow(this.clock);
      const f = s.spec.frame;
      out.push({ img: s.sheet, sx: idx * f.w, sy: row * f.h, sw: f.w, sh: f.h, ax: s.spec.anchor.x, ay: s.spec.anchor.y, ppm: 36, z: zc, x: 0 });
    }
    return out;
  }

  /** Dernier incident à l'origine d'une safety car (pour l'affichage). */
  get scCause(): Entry | null {
    return this.scRequestedBy;
  }
}


/** Profil du pilote auto du joueur (safety car / dépanneuse) : prudent, suit la voiture de devant. */
const ASSIST_PROFILE: DriverProfile = {
  id: 'assist', nameKey: 'driver.babass', colors: [], margin: 0.8, power: 1, mistake: 0, aggression: 0, followGapM: 10, pitWear: 1,
};
