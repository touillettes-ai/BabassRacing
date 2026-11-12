import { FUEL, PHYSICS } from '../config/balance';
import { Player } from '../sim/player';
import type { Track } from '../track/segments';

export interface Estimate {
  /** Carburant consommé par tour (L) et usure par tour à la gomme de référence (×1), temps de tour approximatif (s) */
  fuelPerLap: number;
  wearPerLap: number;
  lapS: number;
}

/**
 * Estime la consommation et l'usure par tour en faisant rouler une voiture virtuelle (pilote prudent, seule en piste)
 * sur le circuit avec la physique de la catégorie. Sert à afficher les « tours d'essence / de gomme » de l'écran de stratégie.
 * Ce n'est qu'une estimation : trafic, aspiration et style de conduite la font varier.
 */
export function estimateLap(track: Track): Estimate {
  const dt = 1 / 60;
  const p = new Player();
  p.reset(0, 'medium', 1);
  const L = track.length;
  const vm = PHYSICS.maxSpeed;
  let steps = 0;
  while (p.odometer < L && steps < 60 * 300) {
    const vr = p.speed / vm;
    let cmax = 0;
    for (let j = 0; j < 16; j++) cmax = Math.max(cmax, Math.abs(track.segmentAt(p.z + j * 5).curve));
    const grip = p.tyres.grip;
    const vt = Math.max(24, Math.min(vm, vm * (1 - 2.6 * cmax / Math.max(0.5, grip))));
    const c = track.segmentAt(p.z).curve;
    const ff = (c * vr * vr * PHYSICS.centrifugal) / Math.max(0.35, grip) / (PHYSICS.lateralSpeed * Math.min(1, Math.max(0.05, vr / PHYSICS.steerFullSpeedRatio)));
    p.update(dt, {
      steer: Math.max(-1, Math.min(1, ff - p.x * 0.35)), throttle: p.speed < vt, brake: p.speed > vt + 4,
      debugToggled: false, restart: false, debugActions: [], pitActions: [],
    }, track);
    steps++;
  }
  return { fuelPerLap: FUEL.capacity - p.fuel.level, wearPerLap: p.tyres.avgWear, lapS: steps / 60 };
}
