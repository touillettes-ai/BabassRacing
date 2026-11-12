import { PIT, RENDER } from '../config/balance';
import type { Assets } from '../core/assets';
import type { DynSprite } from './road';

/**
 * Équipe de mécaniciens pour un arrêt au stand. Séquence du pack (previews/preview_pitstop.gif) :
 * `t` = numéro de pas (110 ms). Positions en px relatives à l'ancre de la voiture, à l'échelle 1 ;
 * côté -1 = gauche (vers la piste), +1 = droite (vers les garages).
 *
 *  - pistolets ×2   : (±60, +7)   arrivent t 0→10 depuis ±300 ; travaillent t 10–16 puis 20–26 ; repartent à la fin du service
 *  - porteurs ×2    : (±104, +11) arrivent t 3→14 depuis ±340 avec un pneu (frame 7 figée) ; repartent avec lui
 *  - ravitailleur   : (−66, −14)  arrive t 1→12 depuis −300 ; tuyau t 12→fin du ravitaillement ; repart
 *  - voiture : normale (t<8) → sur vérins (8–16) → sans roues (16–20) → sur vérins (20–28) → normale
 *
 * Avant l'arrêt de la voiture, l'horloge de l'équipe avance jusqu'à t = 8 (début du levage) puis attend.
 * Seul le temps de ravitaillement est variable : il dépend des litres à ajouter.
 */
const STEP = PIT.stepS;
const JACK_T = 8; // pas du levage = « arrêt de la voiture »
const TYRE_END_T = JACK_T + PIT.tyreServiceSBase / STEP; // 28 (animation de base ; accélérée par `scale` si les mécanos sont améliorés)
const WHEELS_ON_T = 20;
const FUEL_START_T = 12;
const PPM = 36; // px par mètre à l'échelle 1
const CAR_DEPTH = RENDER.focal / RENDER.carPixelsPerMeter;

/** Décalage vertical écran (px, + = plus près de la caméra) → décalage en profondeur (m, - = plus près). */
function dyToDz(dy: number): number {
  const base = RENDER.camHeight * RENDER.carPixelsPerMeter;
  return (RENDER.camHeight * RENDER.focal) / (base + dy) - CAR_DEPTH;
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.max(0, Math.min(1, t));

interface Pose { dx: number; dy: number; frame: number; flip: boolean }

export interface CrewPlan {
  tyres: boolean;
  /** durée du ravitaillement (s), 0 = pas de ravitaillement */
  fuelSeconds: number;
}

export class PitCrew {
  /** Temps de l'équipe depuis son déclenchement (s) */
  private clock = 0;
  /** Temps depuis l'arrêt de la voiture (s), valable une fois `stopped` */
  private svc = 0;
  private stopped = false;
  readonly fuelEndT: number;
  /** Durée du service, de l'arrêt jusqu'au feu vert (s) */
  readonly totalS: number;
  /** Vitesse de l'équipe une fois la voiture arrêtée (mécaniciens améliorés = séquence jouée plus vite) */
  private readonly scale: number;

  constructor(readonly z: number, readonly x: number, readonly plan: CrewPlan) {
    this.scale = Math.max(0.5, PIT.tyreServiceSBase / PIT.tyreServiceS);
    const fuelSteps = (plan.fuelSeconds * this.scale) / STEP;
    this.fuelEndT = FUEL_START_T + fuelSteps;
    const end = Math.max(plan.tyres ? TYRE_END_T : 0, plan.fuelSeconds > 0 ? this.fuelEndT : 0);
    this.totalS = Math.max(0, ((end - JACK_T) * STEP) / this.scale);
  }

  /** Pas courant de la séquence */
  get t(): number {
    return this.stopped ? JACK_T + (this.svc * this.scale) / STEP : Math.min(this.clock, JACK_T * STEP) / STEP;
  }
  get ready(): boolean {
    return this.t >= JACK_T - 0.01; // l'équipe est en place
  }
  /** Temps écoulé depuis l'arrêt (s) */
  get serviceTime(): number {
    return this.svc;
  }
  get serviceDone(): boolean {
    return this.stopped && this.svc >= this.totalS;
  }
  /** Les 4 pneus neufs sont en place (de ce moment, on peut changer l'état des pneus) */
  get tyresFitted(): boolean {
    return this.plan.tyres && this.t >= WHEELS_ON_T;
  }
  /** Avancement du ravitaillement 0..1 */
  get fuelProgress(): number {
    if (this.plan.fuelSeconds <= 0) return 0;
    return Math.max(0, Math.min(1, (this.t - FUEL_START_T) / ((this.plan.fuelSeconds * this.scale) / STEP)));
  }
  /** Tout le monde est reparti : l'équipe peut être supprimée. */
  get finished(): boolean {
    if (!this.stopped) return false;
    const end = Math.max(this.plan.tyres ? TYRE_END_T + 11 : 0, this.plan.fuelSeconds > 0 ? this.fuelEndT + 11 : 0);
    return this.t >= end;
  }
  /** Frame de la planche `_pit` de la voiture : -1 = planche normale, 0 = sur vérins, 1 = sans roues */
  get carFrame(): number {
    if (!this.plan.tyres || !this.stopped) return -1;
    const t = this.t;
    if (t < 8 || t >= TYRE_END_T) return -1;
    if (t < 16) return 0;
    if (t < 20) return 1;
    return 0;
  }

  update(dt: number, carStopped: boolean): void {
    if (!this.stopped && carStopped && this.clock >= JACK_T * STEP - 1e-6) this.stopped = true;
    if (this.stopped) this.svc += dt; // temps réel ; `t` applique l'échelle
    else this.clock += dt;
  }

  /** Sprites des mécaniciens dans le monde (z, x en mètres). */
  sprites(a: Assets): DynSprite[] {
    const out: DynSprite[] = [];
    const t = this.t;
    const ct = this.stopped ? JACK_T * STEP + this.svc * this.scale : Math.min(this.clock, JACK_T * STEP); // pour les cycles de marche
    const add = (p: Pose | null) => {
      if (!p) return;
      out.push({
        img: a.mechanic, sx: p.frame * 96, sy: 0, sw: 96, sh: 84, ax: 48, ay: 76, ppm: PPM,
        z: this.z + dyToDz(p.dy), x: this.x + p.dx / PPM, flip: p.flip,
      });
    };
    if (this.plan.tyres) {
      for (const side of [-1, 1]) {
        add(gunPose(side, t, ct));
        add(carrierPose(side, t, ct));
      }
    }
    if (this.plan.fuelSeconds > 0) add(refuelerPose(t, ct, this.fuelEndT));
    return out;
  }
}

const walk = (ct: number) => 1 + (Math.floor(ct * 10) % 6);
const carry = (ct: number) => 7 + (Math.floor(ct * 10) % 6);

function gunPose(side: number, t: number, ct: number): Pose | null {
  const start = side * 300, target = side * 60, dy = 7;
  if (t < 10) return { dx: lerp(start, target, t / 10), dy, frame: walk(ct), flip: side < 0 };
  if (t < TYRE_END_T) {
    const working = (t >= 10 && t < 16) || (t >= 20 && t < 26);
    return { dx: target, dy, frame: working ? 13 + (Math.floor(ct * 9) % 2) : 13, flip: side < 0 };
  }
  const u = (t - TYRE_END_T) / 10;
  if (u >= 1) return null;
  return { dx: lerp(target, start, u), dy, frame: walk(ct), flip: side > 0 };
}

function carrierPose(side: number, t: number, ct: number): Pose | null {
  const start = side * 340, target = side * 104, dy = 11;
  if (t < 3) return { dx: start, dy, frame: 7, flip: side < 0 };
  if (t < 14) return { dx: lerp(start, target, (t - 3) / 11), dy, frame: carry(ct), flip: side < 0 };
  if (t < TYRE_END_T) return { dx: target, dy, frame: 7, flip: side < 0 };
  const u = (t - TYRE_END_T) / 11;
  if (u >= 1) return null;
  return { dx: lerp(target, start, u), dy, frame: carry(ct), flip: side > 0 };
}

function refuelerPose(t: number, ct: number, endT: number): Pose | null {
  const start = -300, target = -66, dy = -14;
  if (t < 1) return { dx: start, dy, frame: 0, flip: true };
  if (t < 12) return { dx: lerp(start, target, (t - 1) / 11), dy, frame: walk(ct), flip: true };
  if (t < endT) return { dx: target, dy, frame: 15 + (Math.floor(ct * 4.5) % 2), flip: true };
  const u = (t - endT) / 11;
  if (u >= 1) return null;
  return { dx: lerp(target, start, u), dy, frame: walk(ct), flip: false };
}
