import { AI, WEATHER, COLLISION, FUEL, PHYSICS, PIT, RENDER, SC, TYRES } from '../config/balance';
import type { InputState } from '../core/input';
import { Rng } from '../core/rng';
import type { Entry, Field } from '../sim/field';
import type { Compound } from '../sim/tyres';
import type { DriverProfile } from './roster';

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const NEUTRAL: InputState = {
  steer: 0, throttle: false, brake: false, debugToggled: false, restart: false, debugActions: [], pitActions: [],
};

/**
 * Pilote IA. Il fabrique des COMMANDES (braquage, gaz, frein) qu'il applique à une vraie voiture `Player` :
 * il subit donc la même physique que le joueur (adhérence, usure, tête-à-queue si on force trop…).
 *
 *  - vitesse visée : limite d'adhérence dans les virages à venir (marge propre au pilote), avec anticipation du freinage ;
 *  - dépassements : suit la voiture devant, tente de la passer par le côté si elle est plus lente et si la place existe
 *    (les agressifs osent plus près et plus tôt) ;
 *  - rubber-banding léger : la vitesse visée varie de quelques % selon l'écart avec le joueur ;
 *  - stratégie stand : décide au passage de la boucle (usure, carburant, restant à courir) ;
 *  - incidents : après un tête-à-queue, il se gare sur le bas-côté puis repart.
 */
export class Driver {
  readonly margin: number;
  readonly power: number;
  private readonly rng: Rng;
  /** Dérapage / virage : état de l'erreur en cours */
  private inCorner = false;
  private mistake = false;
  /** Décalage latéral préféré (m) et cible courante */
  private readonly preferredX: number;
  private laneTarget: number;
  /** Voiture en cours de dépassement (on garde la trajectoire jusqu'à l'avoir passée) */
  private passTarget: Entry | null = null;
  /** Incident : état */
  private wasSpinning = false;
  private shoulderSide = 1;
  /** Mesures pour la stratégie */
  private planLap = -1;
  private lapStartFuel = FUEL.capacity;
  private fuelPerM = AI.fuelPerMeterGuess;
  private fitProgress = 0;
  private wearPerM = 0;
  private fitWear = 0;
  private lastLapIndex = 0;

  /** `assist` : ce pilote conduit la voiture du JOUEUR (safety car, dépanneuse) : pas de stratégie, pas d'incident, pas de stand (géré par main). */
  constructor(private readonly entry: Entry, readonly profile: DriverProfile, seed: number, private readonly isRival: boolean, private readonly assist = false) {
    this.rng = new Rng(seed);
    const dMargin = (AI.difficulty - 0.5) * 2 * AI.difficultyMargin * (isRival ? 0.3 : 1);
    const dPower = (AI.difficulty - 0.5) * 2 * AI.difficultyPower * (isRival ? 0.3 : 1);
    this.margin = profile.margin + dMargin;
    this.power = Math.min(1, profile.power + dPower);
    this.preferredX = this.rng.range(-1.6, 1.6);
    this.laneTarget = this.preferredX;
  }

  /** Remise à zéro pour une nouvelle course. */
  reset(): void {
    this.inCorner = false;
    this.mistake = false;
    this.laneTarget = this.preferredX;
    this.passTarget = null;
    this.wasSpinning = false;
    this.planLap = -1;
    this.lapStartFuel = FUEL.capacity;
    this.fuelPerM = AI.fuelPerMeterGuess;
    this.fitProgress = 0;
    this.fitWear = 0;
    this.wearPerM = 0;
    this.lastLapIndex = 0;
    this.entry.stoppedT = 0;
  }

  /** Commandes de ce pas (déjà passées par le contrôleur de stand). */
  update(dt: number, f: Field): InputState {
    const e = this.entry;
    const car = e.car;
    const T = f.track;
    const L = T.length;

    // Départ arrêté : on attend le feu vert
    if (f.raceState === 'countdown') return { ...NEUTRAL, brake: true };

    if (this.assist && car.spinning) return { ...NEUTRAL, brake: true };

    // --- Panne rare (jamais le rival) : voiture hors service, garée sur le bas-côté pour de bon
    if (!this.assist && !this.isRival && e.stoppedT <= 0 && f.raceState === 'racing' && f.scEnabled && car.speed > 10 && e.pit.phase === 'none'
      && Math.random() < AI.breakdownPerS * dt) {
      this.shoulderSide = car.x >= 0 ? 1 : -1;
      e.stoppedT = Infinity;
      f.reportBreakdown(e);
    }

    // --- Incident : tête-à-queue puis arrêt sur le bas-côté, puis reprise
    if (!this.assist && car.spinning) {
      this.wasSpinning = true;
      return { ...NEUTRAL, brake: true };
    }
    if (!this.assist && this.wasSpinning) {
      this.wasSpinning = false;
      e.stoppedT = AI.recoverS;
      this.shoulderSide = car.x >= 0 ? 1 : -1;
    }
    if (!this.assist && e.stoppedT > 0) {
      e.stoppedT -= dt;
      const gx = this.shoulderSide * AI.shoulderX;
      car.guideX = gx;
      car.hold = car.speed < 6 && Math.abs(car.x - gx) < 0.6;
      if (e.stoppedT <= 0) {
        car.guideX = null;
        car.hold = false;
        this.laneTarget = this.shoulderSide * 4; // rejoint la piste en douceur
      }
      return { ...NEUTRAL, brake: true };
    }

    // --- Grandeurs courantes
    const vmaxNow = car.vmaxNow();
    const vr = car.speed / PHYSICS.maxSpeed;
    const grip = car.tyres.grip;
    const lapIndex = Math.floor(e.progress / L);
    this.trackLap(lapIndex, e, L);

    // Stratégie de stand : une décision par tour, avant la ligne droite des stands
    if (!this.assist && e.finishTime === null && car.z > L - 700 && this.planLap !== lapIndex) {
      this.planLap = lapIndex;
      this.planPit(f, e, L);
    }

    // --- Vitesse visée : puissance, rubber-banding, virages à venir
    let vTop = vmaxNow * this.power;
    {
      // rubber-banding léger : devant le joueur on lève un peu le pied, derrière on pousse un peu (Kevin : moins)
      const gap = e.progress - f.player.progress; // > 0 : devant le joueur
      const rb = this.assist ? 0 : -clamp(gap / AI.rubber.rangeM, -1, 1) * AI.rubber.max * (this.isRival ? 0.4 : 1);
      vTop *= 1 + rb;
    }
    const seg = T.segmentAt(car.z);
    const margin = this.margin * (this.mistake ? AI.mistakeOvershoot : 1);
    const brakeGrip = 1 - PHYSICS.brakeGripShare + PHYSICS.brakeGripShare * (grip / PHYSICS.gripRef);
    const brakeDecel = PHYSICS.brakeDecel * brakeGrip * AI.brakeFactor;
    let vt = vTop;
    for (let j = 0; j < AI.lookaheadSegs; j++) {
      const c = Math.abs(T.segmentAt(car.z + j * RENDER.segmentLength).curve);
      if (c < 0.004) continue;
      const vrj = Math.sqrt((margin * PHYSICS.gripLimit * grip) / (1.3 * c * PHYSICS.centrifugal));
      const vj = Math.min(1, vrj) * PHYSICS.maxSpeed;
      vt = Math.min(vt, Math.sqrt(vj * vj + 2 * brakeDecel * j * RENDER.segmentLength));
    }

    // Erreur de pilotage : dans un virage serré, un pilote irrégulier peut passer trop vite
    const cNow = Math.abs(seg.curve);
    const cAhead = Math.abs(T.segmentAt(car.z + 3 * RENDER.segmentLength).curve);
    if (!this.inCorner && cAhead > 0.06) {
      this.inCorner = true;
      this.mistake = this.rng.chance(this.profile.mistake);
    } else if (this.inCorner && cNow < 0.02 && cAhead < 0.02) {
      this.inCorner = false;
      this.mistake = false;
    }

    // Arrivée franchie : on ralentit ; pilote auto du joueur : plafond éventuel (remorquage)
    if (e.finishTime !== null && !this.assist) vt = Math.min(vt, AI.finishCoastSpeed);
    if (this.assist && f.autoCap !== null) vt = Math.min(vt, f.autoCap);

    // Approche des stands : on arrive au limiteur à l'entrée
    if (e.pit.intent && e.pit.phase === 'none') {
      const d = (((T.pitEntryZ - car.z) % L) + L) % L;
      if (d < 450) vt = Math.min(vt, Math.sqrt(PIT.speedLimit * PIT.speedLimit + 2 * brakeDecel * d));
    }

    // --- Voitures autour : suivre ou dépasser. Sous safety car on voit loin pour se regrouper derrière elle.
    // la vue s'allonge avec la vitesse : il faut pouvoir freiner depuis la vitesse actuelle avec une décélération de confort
    const sight = AI.sightM + (car.speed * car.speed) / (2 * 18);
    const ahead = f.carAhead(e, f.sc.active ? 900 : sight);
    // Dépassement en cours : on le garde tant que la voiture visée n'est pas dépassée (12 m) ni trop loin ni hors de portée
    if (this.passTarget) {
      const rel = f.ahead(e, this.passTarget.car.z);
      if (rel < -12 || rel > 120 || f.sc.active || e.pit.phase !== 'none') this.passTarget = null;
    }
    const passing = this.passTarget !== null;
    if (ahead) {
      const gap = ahead.distance - COLLISION.length;
      // distance de suivi : celle du pilote, allongée avec la vitesse (il faut pouvoir s'arrêter si l'autre freine fort)
      const desired = (ahead.isSC || f.sc.active ? SC.followGapM : this.profile.followGapM) + car.speed * AI.followGapPerMs;
      const faster = vt > ahead.speed + 1.5;
      const aggr = this.profile.aggression;
      const roomOK = cNow < 0.09 + aggr * 0.06;
      // plus on arrive vite sur la voiture, plus tôt on se décale
      const decide = 14 + aggr * 18 + Math.max(0, car.speed - ahead.speed) * 1.2;
      const canPass = !f.sc.active && !ahead.stopped && !ahead.isSC && faster && gap < decide && roomOK && e.pit.phase === 'none';
      if (canPass && !passing && ahead.entry) {
        const side = ahead.x >= 0 ? -1 : 1; // du côté où il y a le plus de place
        const target = clamp(ahead.x + side * AI.passOffsetM, -AI.roadLimit, AI.roadLimit);
        if (Math.abs(target - ahead.x) > 1.8 && f.laneFree(e, target, 14)) {
          this.laneTarget = target;
          this.passTarget = ahead.entry;
        }
      }
      const clearOfAhead = Math.abs(car.x - ahead.x) > COLLISION.width * 1.25;
      if (!this.passTarget || !clearOfAhead) {
        // pas de dépassement, ou pas encore décalé : on se cale derrière (distance de suivi réduite si on est déjà en train de passer)
        const want = this.passTarget ? 3 : desired;
        const vFollow = ahead.speed + Math.sqrt(2 * AI.followDecel * Math.max(0, gap - want)) - (gap < want ? (want - gap) * 2 : 0);
        vt = Math.min(vt, Math.max(0, vFollow));
      }
    }
    if (!this.passTarget) this.laneTarget += (this.preferredX - this.laneTarget) * Math.min(1, dt * 1.5);

    // --- Braquage : compense la poussée centrifuge puis corrige la position latérale
    const push = (seg.curve * vr * vr * PHYSICS.centrifugal) / Math.max(0.35, grip / PHYSICS.gripRef);
    const steerEff = Math.min(1, vr / PHYSICS.steerFullSpeedRatio) * Math.pow(Math.max(0.2, car.tyres.gripFront), PHYSICS.steerGripExp);
    const ff = vr < 0.03 ? 0 : push / (PHYSICS.lateralSpeed * Math.max(0.05, steerEff));
    const steer = clamp(ff + (this.laneTarget - car.x) * AI.laneP, -1, 1);

    const input: InputState = {
      ...NEUTRAL,
      steer,
      throttle: car.speed < vt - 0.3,
      brake: car.speed > vt + 1.0,
    };
    // Stand : le contrôleur peut reprendre la main (guidage, limiteur, stationnement)
    return f.raceState === 'racing' && !this.assist ? e.pit.update(dt, car, input) : input;
  }

  /** Mesure la consommation et l'usure au fil des tours (pour décider des arrêts). */
  private trackLap(lapIndex: number, e: Entry, L: number): void {
    if (lapIndex === this.lastLapIndex) return;
    this.lastLapIndex = lapIndex;
    const used = this.lapStartFuel - e.car.fuel.level;
    if (used > 0 && e.pit.phase === 'none') this.fuelPerM = used / L;
    this.lapStartFuel = e.car.fuel.level;
    const dist = e.progress - this.fitProgress;
    if (dist > L * 0.6) this.wearPerM = (e.car.tyres.avgWear - this.fitWear) / dist;
  }

  /**
   * Décide d'un arrêt pour le tour qui vient : usure projetée au-delà du seuil du pilote, carburant insuffisant
   * pour le tour suivant ou pour finir, crevaison ; sous safety car on profite de l'arrêt « bon marché » plus tôt.
   */
  private planPit(f: Field, e: Entry, L: number): void {
    const car = e.car;
    if (e.pit.phase !== 'none' || e.pit.intent) return;
    const lapsLeft = (f.laps * L - e.progress) / L;
    if (lapsLeft < 0.4) return;
    const wearRate = this.wearPerM > 0 ? this.wearPerM : TYRES.compounds[car.tyres.compound].wear * 3.7e-5;
    const wearAfterLap = car.tyres.avgWear + wearRate * L * 1.1;
    const fuelNeededToFinish = this.fuelPerM * lapsLeft * L * 1.05;
    const fuelNextLap = this.fuelPerM * L * 1.2;

    const scBonus = f.sc.active || f.sc.state === 'pending';
    const tyresNeeded =
      car.tyres.anyPunctured || (lapsLeft > 1.05 && wearAfterLap >= this.profile.pitWear) || (scBonus && lapsLeft > 1.5 && car.tyres.avgWear > 0.4);
    const fuelNeeded =
      car.fuel.level < fuelNextLap + 1.5 && car.fuel.level < fuelNeededToFinish
      || (scBonus && lapsLeft > 1.5 && car.fuel.level < Math.min(fuelNeededToFinish, FUEL.capacity * 0.5));
    const damaged = car.damage > 0.5;
    if (!tyresNeeded && !fuelNeeded && !damaged) return;

    // Plan : gomme selon ce qu'il reste à courir, carburant juste nécessaire (plus marge) arrondi au palier supérieur
    const remainingAfter = Math.max(0, lapsLeft - 0.3);
    let tyre: 'none' | Compound = 'none';
    if (tyresNeeded || damaged) tyre = chooseTyre(remainingAfter);
    const needL = this.fuelPerM * remainingAfter * L * 1.08;
    let fuelStep = 0;
    if (fuelNeeded || needL > car.fuel.level) {
      fuelStep = PIT.fuelOptions.length - 1;
      for (let s = 1; s < PIT.fuelOptions.length; s++) {
        if (PIT.fuelOptions[s] * FUEL.capacity >= needL) {
          fuelStep = s;
          break;
        }
      }
    }
    // un ravitaillement long rend le changement de pneus « gratuit » : on en profite s'ils sont entamés
    if (tyre === 'none' && fuelStep > 0 && car.tyres.avgWear > 0.3 && (PIT.fuelOptions[fuelStep] * FUEL.capacity - car.fuel.level) / PIT.refuelRate > PIT.tyreServiceS) {
      tyre = chooseTyre(remainingAfter);
    }
    e.pit.plan = { tyre, fuelStep };
    e.pit.intent = true;
    // les mesures d'usure repartent à zéro après l'arrêt
    if (tyre !== 'none') {
      this.fitProgress = e.progress + 0;
      this.fitWear = 0;
      this.wearPerM = 0;
    }
  }
}

/** Gomme choisie à l'arrêt : pluie sur piste mouillée ; sinon tendre pour une course courte, intermédiaire, dur pour longtemps. */
function chooseTyre(lapsLeft: number): Compound {
  if (WEATHER.wetness > 0.3) return 'rain';
  return lapsLeft <= 4.5 ? 'soft' : lapsLeft <= 7 ? 'medium' : 'hard';
}
