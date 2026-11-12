import { AI, COLLISION, DRAFT, FUEL, PHYSICS, PIT, SC, TYRES } from '../config/balance';
import type { InputState } from '../core/input';
import type { Track } from '../track/segments';
import { Fuel } from './fuel';
import { Tyres, type Compound } from './tyres';

/** État de la voiture du joueur : conduite, carburant, pneus. */
export class Player {
  /** Distance le long de la piste (m), modulo la longueur de la piste. */
  z = 0;
  /** Position latérale (m) par rapport à l'axe de la route. */
  x = 0;
  speed = 0; // m/s
  /** Braquage lissé, -1..1 */
  steer = 0;
  rpm: number = PHYSICS.idleRpm;
  gear = 1;
  offroad = false;
  braking = false;
  throttle = false;
  /** Pente sous la voiture (m/m) */
  slope = 0;
  /** Courbure du segment courant */
  curve = 0;
  /** Vitesse latérale due à la force centrifuge (m/s, signée) */
  lateralForce = 0;
  /** Distance totale parcourue sans bouclage (m) */
  odometer = 0;

  readonly fuel = new Fuel();
  readonly tyres = new Tyres();
  /** charge latérale / limite d'adhérence : > 1 = la voiture dérape */
  slideRatio = 0;
  sliding = false;
  /** Tête-à-queue : temps écoulé (s), -1 si inactif ; sens (+1 droite, -1 gauche) */
  spinT = -1;
  spinDir = 1;
  private slideAccum = 0;

  /** Dégâts de carrosserie 0..1 (chocs) : réduisent la vitesse max ; réparés au stand */
  damage = 0;
  /** Plafond de vitesse imposé par la safety car (m/s) ou null */
  scCap: number | null = null;
  /** Aspiration 0..1 (1 = collé derrière une voiture) : posée par Field avant chaque pas */
  draft = 0;
  /** Améliorations de la voiture (garage) : multiplicateurs propres à CETTE voiture (les adversaires gardent la physique de la catégorie) */
  perf = { engine: 1, accel: 1, brake: 1, spin: 0 };
  /** Remorquée (panne sèche) : les limites de panne sèche ne s'appliquent plus */
  towed = false;

  /** Consommation (L/m) et usure par mètre (à gomme de référence ×1), moyennes glissantes : pour estimer les tours restants */
  fuelPerM: number = AI.fuelPerMeterGuess;
  wearPerM = 3.7e-5;

  // --- Stands : pilotés par PitController
  /** Limiteur de vitesse (m/s) ou null */
  speedCap: number | null = null;
  /** Position latérale imposée (auto-guidage dans la voie des stands) ou null */
  guideX: number | null = null;
  /** Voiture immobilisée au stand (service en cours) */
  hold = false;
  /** Frame de la planche `_pit` (-1 = voiture normale) */
  pitFrame = -1;

  get spinning(): boolean {
    return this.spinT >= 0;
  }
  get dry(): boolean {
    return this.fuel.empty;
  }

  /** Vitesse maximale du moment : pneus usés, crevaison, dégâts, panne sèche. */
  vmaxNow(): number {
    let vmax = PHYSICS.maxSpeed * this.perf.engine * TYRES.compounds[this.tyres.compound].speed * (1 - TYRES.maxSpeedWearLoss * this.tyres.avgWear);
    if (this.tyres.anyPunctured) vmax = Math.min(vmax, TYRES.punctureMaxSpeed);
    vmax *= 1 - COLLISION.damageSpeedLoss * this.damage;
    if (this.dry && !this.towed) vmax = Math.min(vmax, FUEL.emptyMaxSpeed);
    // moins d'essence = voiture plus légère = plus rapide
    const light = 1 + FUEL.speedBonusEmpty * (1 - this.fuel.fraction);
    return vmax * light * (1 + DRAFT.speedBonus * this.draft);
  }

  /** Remise à zéro pour (re)démarrer une course. */
  reset(z: number, compound: Compound = TYRES.startCompound, fuelFraction: number = FUEL.startFraction): void {
    this.z = z; this.x = 0; this.speed = 0; this.steer = 0;
    this.spinT = -1; this.slideAccum = 0; this.slideRatio = 0; this.sliding = false;
    this.speedCap = null; this.guideX = null; this.hold = false; this.pitFrame = -1;
    this.damage = 0; this.scCap = null; this.towed = false;
    this.fuelPerM = AI.fuelPerMeterGuess;
    this.wearPerM = 3.7e-5;
    this.odometer = 0;
    this.fuel.reset(fuelFraction);
    this.tyres.fit(compound);
  }

  update(dt: number, input: InputState, track: Track): void {
    const P = PHYSICS;
    const seg = track.segmentAt(this.z);
    this.curve = seg.curve;
    this.slope = track.slopeAt(this.z);

    const vr = this.speed / P.maxSpeed;
    const fuelFrac = this.fuel.fraction;
    const grip = this.tyres.grip;
    const gripFront = this.tyres.gripFront;

    this.throttle = input.throttle && !this.spinning;
    this.braking = input.brake;

    // Arrêt au stand : la voiture est immobile pendant le service
    if (this.hold) {
      this.speed = 0;
      this.throttle = false;
      this.braking = false;
      this.offroad = false;
      this.sliding = false;
      this.fuel.update(dt, false, 0);
      this.updateGear();
      return;
    }

    const vmax = this.vmaxNow();

    if (this.spinning) {
      this.updateSpin(dt, track, seg.curve, vr);
      return;
    }

    // --- Longitudinal
    // moins lourd = plus vif ; en panne sèche, juste de quoi se traîner vers les stands
    const accelMult = (this.dry && !this.towed ? FUEL.emptyAccelFactor : 1 + FUEL.accelBonusEmpty * (1 - fuelFrac)) * (1 + DRAFT.accelBonus * this.draft) * (1 - TYRES.accelWearLoss * this.tyres.avgWear);
    if (input.brake) {
      const brakeGrip = 1 - P.brakeGripShare + P.brakeGripShare * (grip / P.gripRef);
      this.speed -= P.brakeDecel * this.perf.brake * brakeGrip * dt;
    } else if (this.throttle) {
      const r = Math.min(1, this.speed / vmax);
      this.speed += P.accel * this.perf.accel * accelMult * (1 - Math.pow(r, P.accelCurvePower)) * dt;
    } else {
      this.speed -= P.coastDecel * dt;
    }
    if (this.speed > vmax) this.speed = Math.max(vmax, this.speed - (this.dry && !this.towed ? FUEL.emptyDecel : P.brakeDecel * 0.4) * dt);
    this.speed -= this.slope * P.hillGravity * dt;
    // Safety car : on ne dépasse pas sa vitesse (freinage doux)
    if (this.scCap !== null && this.speed > this.scCap) {
      this.speed = Math.max(this.scCap, this.speed - SC.playerDecel * dt);
    }
    // Limiteur de la voie des stands
    if (this.speedCap !== null && this.speed > this.speedCap) {
      this.speed = Math.max(this.speedCap, this.speed - PIT.limiterDecel * dt);
    }

    if (this.guideX !== null) {
      // Auto-guidage (entrée/sortie des stands) : la position latérale suit la consigne. Le braquage affiché
      // se déduit de la vitesse latérale réelle, pour que la voiture TOURNE (frames de virage) au lieu de glisser.
      const step = PIT.guideRate * dt;
      const before = this.x;
      this.x += Math.max(-step, Math.min(step, this.guideX - this.x));
      const vx = (this.x - before) / dt;
      const visual = Math.max(-1, Math.min(1, (vx / P.lateralSpeed) * PIT.steerVisualGain));
      this.steer += (visual - this.steer) * P.steerResponse * dt;
      this.slideRatio = 0;
      this.sliding = false;
      this.lateralForce = 0;
      this.slideAccum = 0;
    } else {
      // --- Charge latérale vs adhérence
      const curveLoad = Math.abs(seg.curve) * vr * vr * P.centrifugal;
      const steerLoad = P.steerLoadFactor * Math.abs(this.steer) * P.lateralSpeed * vr;
      const limit = P.gripLimit * grip;
      this.slideRatio = (curveLoad + steerLoad) / Math.max(0.1, limit);
      if (this.tyres.anyPunctured) {
        // une jante qui racle : la voiture déstabilise beaucoup plus facilement, et peut partir en tête-à-queue d'un coup
        this.slideRatio *= TYRES.punctureSlideBoost;
        if (this.speed > TYRES.punctureSpinMinSpeed && !this.spinning) {
          const stress = 0.4 + Math.min(1, Math.abs(this.steer) + Math.abs(seg.curve) * 8);
          if (Math.random() < TYRES.punctureSpinRatePerS * stress * dt) {
            this.spinT = 0;
            this.spinDir = this.steer !== 0 ? Math.sign(this.steer) : Math.random() < 0.5 ? 1 : -1;
          }
        }
      }
      this.sliding = this.slideRatio > 1 && this.speed > 5;

      // --- Direction : lissée ; l'efficacité baisse avec la vitesse faible et les pneus avant usés (sous-virage)
      this.steer += (input.steer - this.steer) * P.steerResponse * dt;
      // pneus usés : direction moins précise (en plus de la perte d'adhérence avant)
      const steerEff = Math.min(1, vr / P.steerFullSpeedRatio) * Math.pow(Math.max(0.2, gripFront), P.steerGripExp) * (1 - TYRES.steerWearLoss * this.tyres.avgWear);
      this.x += this.steer * P.lateralSpeed * steerEff * dt;

      // --- Force centrifuge : moins d'adhérence = plus de poussée vers l'extérieur ; en dérapage, encore plus
      let push = (seg.curve * vr * vr * P.centrifugal) / Math.max(0.35, grip / P.gripRef);
      if (this.sliding) push *= 1 + P.slidePush * (this.slideRatio - 1);
      this.lateralForce = -push;
      this.x += this.lateralForce * dt;

      // --- Frottement des pneus qui glissent : on perd de la vitesse dans le virage
      if (this.slideRatio > P.scrubStart) this.speed -= P.scrub * (this.slideRatio - P.scrubStart) * dt;

      // --- Tête-à-queue après un dérapage soutenu
      if (this.slideRatio > P.spinRatio + this.perf.spin && this.speed > P.spinMinSpeed) this.slideAccum += dt;
      else this.slideAccum = Math.max(0, this.slideAccum - dt * 2);
      if (this.slideAccum > P.spinTime) {
        this.spinT = 0;
        this.spinDir = this.lateralForce >= 0 ? 1 : -1; // l'arrière part vers l'extérieur du virage
        this.slideAccum = 0;
      }

    }

    // --- Hors piste
    this.offroad = this.guideX === null && !track.isOnRoad(this.z, this.x);
    if (this.offroad && this.speed > P.offroadMaxSpeed) {
      this.speed = Math.max(P.offroadMaxSpeed, this.speed - P.offroadDecel * dt);
    }
    // hors de la voie des stands, on ne s'éloigne pas à plus de maxOverrun du bord de piste
    const lim = Number.isNaN(track.pitAxisAt(this.z)) ? P.roadHalfWidth + P.maxOverrun : P.maxLateral;
    this.x = Math.max(-lim, Math.min(lim, this.x));

    this.advance(dt, track);
    this.consume(dt, seg.curve, vr);
    this.updateGear();
  }

  /** Tête-à-queue : la voiture tourne sur elle-même en perdant sa vitesse, puis repart. */
  private updateSpin(dt: number, track: Track, curve: number, vr: number): void {
    const P = PHYSICS;
    this.spinT += dt;
    this.speed = Math.max(0, this.speed - P.spinDecel * dt);
    this.steer *= 0.9;
    this.lateralForce = 0;
    this.sliding = true;
    this.offroad = Math.abs(this.x) > P.roadHalfWidth;
    this.x += this.spinDir * this.speed * 0.1 * dt; // glisse vers l'extérieur
    const lim = P.roadHalfWidth + P.maxOverrun;
    this.x = Math.max(-lim, Math.min(lim, this.x));
    this.advance(dt, track);
    this.consume(dt, curve, vr);
    if (this.spinT >= P.spinDuration) {
      this.spinT = -1;
      this.speed = Math.min(this.speed, P.spinExitSpeed);
    }
    this.updateGear();
  }

  private advance(dt: number, track: Track): void {
    this.speed = Math.max(0, Math.min(PHYSICS.maxSpeed * this.perf.engine * (1 + FUEL.speedBonusEmpty) * (1 + DRAFT.speedBonus), this.speed));
    this.z += this.speed * dt;
    this.odometer += this.speed * dt;
    this.z = ((this.z % track.length) + track.length) % track.length;
  }

  /** Carburant et usure des pneus pour ce pas. */
  private consume(dt: number, curve: number, vr: number): void {
    const fuelBefore = this.fuel.level;
    const wearBefore = this.tyres.avgWear;
    this.fuel.update(dt, this.throttle, vr);
    const turnDir = Math.abs(curve) > 0.005 ? Math.sign(curve) : Math.sign(this.steer) * (Math.abs(this.steer) > 0.2 ? 1 : 0);
    this.tyres.update(dt, {
      speedRatio: vr,
      loadRatio: this.slideRatio,
      turnDir,
      braking: this.braking && this.speed > 1,
      throttle: this.throttle,
      offroad: this.offroad && this.speed > 4,
      sliding: this.sliding,
      fuelFraction: this.fuel.fraction,
    });
    // moyennes glissantes sur ~2 km : consommation et usure par mètre (usure ramenée à la gomme de référence)
    const dist = this.speed * dt;
    if (dist > 0.01) {
      const k = Math.min(1, dist / 2000);
      this.fuelPerM += ((fuelBefore - this.fuel.level) / dist - this.fuelPerM) * k;
      const dw = Math.max(0, this.tyres.avgWear - wearBefore) / dist / TYRES.compounds[this.tyres.compound].wear;
      this.wearPerM += (dw - this.wearPerM) * k;
    }
  }

  /** Tours que permet le carburant `level` (L) sur un circuit de longueur `L` m. */
  fuelLaps(L: number, level: number = this.fuel.level): number {
    return level / Math.max(1e-6, this.fuelPerM * L);
  }

  /** Tours que permettent des pneus de gomme `compound` à l'usure `wear` (jusqu'à `usableWear`). */
  tyreLaps(L: number, compound: keyof typeof TYRES.compounds = this.tyres.compound, wear: number = this.tyres.avgWear): number {
    const rate = this.wearPerM * TYRES.compounds[compound].wear * L;
    return Math.max(0, TYRES.usableWear - wear) / Math.max(1e-6, rate);
  }

  /** Boîte automatique : rapport et régime déduits de la vitesse. */
  private updateGear(): void {
    const P = PHYSICS;
    // hors accélération (pied levé, freinage) : le rapport est choisi comme si on roulait moins vite, donc on rétrograde plus tôt
    // et le régime remonte (frein moteur) ; la boîte retombe vite quand la vitesse chute
    const vr = (this.speed / P.maxSpeed) * (this.throttle ? 1 : 1 - P.downshift);
    let g = 0;
    while (g < P.gearTops.length - 1 && vr > P.gearTops[g]) g++;
    const lo = g === 0 ? 0 : P.gearTops[g - 1];
    const hi = P.gearTops[g];
    // le régime retombe à ~55 % de la plage après chaque changement de rapport
    const frac = Math.max(0, Math.min(1, (vr - lo) / (hi - lo)));
    this.gear = g + 1;
    const floor = g === 0 ? 0 : 0.5;
    this.rpm = P.idleRpm + (floor + (1 - floor) * frac) * (P.redlineRpm - P.idleRpm);
  }
}
