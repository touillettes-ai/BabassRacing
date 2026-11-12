import { TYRES, WEATHER } from '../config/balance';

export type Compound = keyof typeof TYRES.compounds;

/** Contexte d'un pas de simulation pour l'usure. */
export interface WearContext {
  speedRatio: number;
  /** charge latérale / limite d'adhérence */
  loadRatio: number;
  /** sens du virage (+1 droite, -1 gauche, 0 aucun) : les pneus extérieurs travaillent plus */
  turnDir: number;
  braking: boolean;
  throttle: boolean;
  offroad: boolean;
  sliding: boolean;
  fuelFraction: number;
}

/** Les quatre pneus : indices 0 = avant gauche, 1 = avant droit, 2 = arrière gauche, 3 = arrière droit. */
export class Tyres {
  compound: Compound = TYRES.startCompound;
  /** Usure 0 (neuf) … 1 (fini) */
  wear: [number, number, number, number] = [0, 0, 0, 0];
  punctured: [boolean, boolean, boolean, boolean] = [false, false, false, false];

  /** Adhérence d'un pneu : gomme × (1 - usure linéaire - falaise) × crevaison. */
  wheelGrip(i: number): number {
    const w = this.wear[i];
    const comp = TYRES.compounds[this.compound];
    // piste mouillée : les gommes sèches glissent, la gomme pluie non
    const wet = 1 - (1 - comp.wetGrip) * WEATHER.wetness;
    const g = comp.grip * wet * (1 - TYRES.gripLossLinear * w - TYRES.gripLossCliff * Math.pow(w, 6));
    return this.punctured[i] ? g * TYRES.punctureGripFactor : g;
  }
  get gripFront(): number {
    return (this.wheelGrip(0) + this.wheelGrip(1)) / 2;
  }
  get gripRear(): number {
    return (this.wheelGrip(2) + this.wheelGrip(3)) / 2;
  }
  get grip(): number {
    return (this.gripFront + this.gripRear) / 2;
  }
  get avgWear(): number {
    return (this.wear[0] + this.wear[1] + this.wear[2] + this.wear[3]) / 4;
  }
  get maxWear(): number {
    return Math.max(...this.wear);
  }
  get anyPunctured(): boolean {
    return this.punctured.some(Boolean);
  }

  update(dt: number, c: WearContext): void {
    const W = TYRES.wear;
    const k = TYRES.compounds[this.compound].wear * (1 + W.fuelMass * c.fuelFraction);
    const load = Math.min(2, c.loadRatio);
    for (let i = 0; i < 4; i++) {
      const front = i < 2;
      const left = i % 2 === 0;
      // virage à droite : les pneus de gauche sont à l'extérieur
      const outer = c.turnDir === 0 ? null : c.turnDir > 0 ? left : !left;
      const loadMult = outer === null ? 1 : outer ? W.outer : W.inner;
      let rate = W.base + W.speed * c.speedRatio * c.speedRatio;
      rate += W.corner * load * load * loadMult * (front ? W.frontCorner : W.rearCorner);
      if (c.braking) rate += W.brake * c.speedRatio * (front ? W.frontBrake : W.rearBrake);
      if (c.throttle) rate += W.accel * (front ? W.frontAccel : W.rearAccel);
      if (c.offroad) rate += W.offroad;
      // glissade : usure proportionnelle à l'excès de charge (10 % au-dessus de la limite = plein effet / 4)
      if (c.sliding) rate += W.slide * Math.min(1, Math.max(0, (c.loadRatio - 1) * 4));
      this.wear[i] = Math.min(1, this.wear[i] + rate * k * dt);
      // un pneu au bout de sa vie peut éclater
      if (!this.punctured[i] && this.wear[i] >= TYRES.punctureStart && Math.random() < TYRES.punctureRatePerS * dt) {
        this.punctured[i] = true;
      }
    }
  }

  /** Changement de pneus (arrêt au stand) : neufs, gomme au choix. */
  fit(compound: Compound): void {
    this.compound = compound;
    this.wear = [0, 0, 0, 0];
    this.punctured = [false, false, false, false];
  }
}
