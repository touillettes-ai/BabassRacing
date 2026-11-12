import { FUEL } from '../config/balance';

/** Réservoir : se vide selon l'accélération et la vitesse. */
export class Fuel {
  level: number = FUEL.capacity * FUEL.startFraction;

  get fraction(): number {
    return this.level / FUEL.capacity;
  }
  get empty(): boolean {
    return this.level <= 0;
  }
  get low(): boolean {
    return this.fraction <= FUEL.lowThreshold;
  }

  update(dt: number, throttle: boolean, speedRatio: number): void {
    if (this.level <= 0) return;
    const use = throttle ? FUEL.full * (FUEL.throttleBase + (1 - FUEL.throttleBase) * speedRatio) : 0;
    this.level = Math.max(0, this.level - (FUEL.idle + use) * dt);
  }

  /** Ravitaillement (litres) ; renvoie les litres réellement ajoutés. */
  add(liters: number): number {
    const added = Math.min(liters, FUEL.capacity - this.level);
    this.level += added;
    return added;
  }

  reset(fraction: number = FUEL.startFraction): void {
    this.level = FUEL.capacity * fraction;
  }
}
