import { COLLISION, FX, PHYSICS, RENDER } from '../config/balance';
import type { Assets, CarSheets } from '../core/assets';
import type { Player } from '../sim/player';
import { CAR_SCREEN_X, CAR_SCREEN_Y } from './fx';

/** Phase de rotation des roues (0..2, `wheel_phases` du pack) : une phase tous les 0,25 m, cadence plafonnée à ~20 images/s. */
export function wheelPhase(p: Player): number {
  if (p.speed < 5) return Math.floor(p.odometer / 0.25) % 3;
  return Math.floor(performance.now() / 50) % 3;
}

/** Une image à découper dans une planche de voiture, avec son ancre. */
export interface CarFrame {
  img: HTMLImageElement;
  sx: number; sy: number; sw: number; sh: number;
  ax: number; ay: number;
}

/**
 * Choisit la planche et la frame d'une voiture selon son état (joueur ou adversaire).
 *  - tête-à-queue : 16 frames de 240×112 (une tous les 22,5°) ; frame 0 = vue de dos, ordre croissant = rotation à droite ;
 *  - au stand : voiture sur vérins (0) ou sans roues (1) ;
 *  - sinon planche de virage 7 frames [left3 … center … right3] : frame = round(3 + braquage × 3) ; priorité :
 *    pente (> +3 % `_up`, < −3 % `_down`) > freinage `_brake` > crevaison > carrosserie abîmée > normale.
 */
export function pickCarFrame(car: CarSheets, p: Player): CarFrame {
  if (p.spinning) {
    const sp = car.spec.spin;
    const prog = Math.min(1, p.spinT / PHYSICS.spinDuration);
    const eased = 1 - Math.pow(1 - prog, 2); // ralentit sur la fin du tour
    let idx = Math.floor(eased * sp.count) % sp.count;
    if (p.spinDir < 0) idx = (sp.count - idx) % sp.count;
    return { img: car.spin, sx: idx * sp.frame.w, sy: 0, sw: sp.frame.w, sh: sp.frame.h, ax: sp.anchor.x, ay: sp.anchor.y };
  }
  const f = car.spec.frame;
  if (p.pitFrame >= 0) {
    return { img: car.pit, sx: p.pitFrame * f.w, sy: 0, sw: f.w, sh: f.h, ax: car.spec.anchor.x, ay: car.spec.anchor.y };
  }
  const idx = Math.max(0, Math.min(6, Math.round(3 + p.steer * 3)));
  const damaged = p.damage >= COLLISION.damagedSheetAt;
  let img = p.tyres.anyPunctured ? car.puncture : damaged ? car.damaged : car.normal;
  let fr = f;
  let anchor = car.spec.anchor;
  if (p.slope > PHYSICS.slopeThreshold) {
    img = car.up; fr = car.spec.slope.frame; anchor = car.spec.slope.anchor;
  } else if (p.slope < -PHYSICS.slopeThreshold) {
    img = car.down; fr = car.spec.slope.frame; anchor = car.spec.slope.anchor;
  } else if (p.braking && p.speed > 1 && !p.tyres.anyPunctured && !damaged) {
    img = car.brake;
  }
  return { img, sx: idx * fr.w, sy: wheelPhase(p) * fr.h, sw: fr.w, sh: fr.h, ax: anchor.x, ay: anchor.y };
}

/** Voiture du joueur, à l'échelle 1 (36 px/m), posée à position fixe à l'écran. */
export class CarRenderer {
  private clock = 0;

  update(dt: number): void {
    this.clock += dt;
  }

  draw(ctx: CanvasRenderingContext2D, a: Assets, p: Player): void {
    const fr = pickCarFrame(a.car, p);
    const spinOrPit = p.spinning || p.pitFrame >= 0;
    // petit rebond à haute vitesse (2 positions, alternées ~15 Hz)
    const vr = p.speed / PHYSICS.maxSpeed;
    let bounce = !spinOrPit && vr > 0.3 && Math.floor(this.clock * 15) % 2 === 0 ? Math.round(FX.bounceMax * vr) : 0;
    if (!spinOrPit && p.offroad && p.speed > 8) bounce += 1;
    // planches HD : taille logique = taille source / hd ; position alignée sur les pixels du canvas
    const hd = RENDER.hd;
    const snap = (v: number) => Math.round(v * hd) / hd;
    ctx.drawImage(fr.img, fr.sx, fr.sy, fr.sw, fr.sh, snap(CAR_SCREEN_X - fr.ax / hd), snap(CAR_SCREEN_Y - fr.ay / hd - bounce), fr.sw / hd, fr.sh / hd);

    // Crevaison : étincelles accrochées à la jante arrière gauche, qui se décale selon la frame de braquage
    // (positions mesurées sur la planche `_puncture`, en px dans la frame, pour les 7 frames de virage)
    if (p.tyres.anyPunctured && p.speed > 5 && !spinOrPit && fr.sw === 160 * hd) {
      const idx = Math.round(fr.sx / fr.sw);
      const wheelX = ([44, 49, 53, 54, 49, 42, 35][idx] ?? 50) * hd;
      const s = a.fx.fx_sparks;
      const frame = Math.floor(this.clock * s.fps) % s.count;
      const x = CAR_SCREEN_X - fr.ax / hd + wheelX / hd;
      const y = CAR_SCREEN_Y - fr.ay / hd + 87 - bounce;
      ctx.drawImage(s.img, frame * s.frame.w, 0, s.frame.w, s.frame.h, snap(x - s.anchor.x / hd), snap(y - s.anchor.y / hd), s.frame.w / hd, s.frame.h / hd);
    }
  }
}
