import { FX, PHYSICS, RENDER } from '../config/balance';
import type { Assets } from '../core/assets';
import type { Player } from '../sim/player';

/** Position écran de l'ancre de la voiture du joueur (échelle 1). */
export const CAR_SCREEN_X = RENDER.width / 2;
export const CAR_SCREEN_Y = Math.round(RENDER.horizon + RENDER.camHeight * RENDER.carPixelsPerMeter);

interface Particle {
  strip: string;
  x: number;
  y: number;
  t: number;
  life: number;
  front: boolean;
}

/** Fumées, poussière, flamme d'échappement (planches fx/ du pack). */
export class Effects {
  private list: Particle[] = [];
  private emitT = 0;
  private wasThrottle = false;

  update(dt: number, p: Player, a: Assets): void {
    const vr = p.speed / PHYSICS.maxSpeed;
    this.emitT -= dt;
    if (this.emitT <= 0) {
      this.emitT = FX.emitInterval;
      const hardBrake = p.braking && vr > FX.smokeBrakeRatio;
      const drifting = (p.sliding || Math.abs(p.lateralForce) > FX.smokeLateral) && vr > 0.2;
      if (p.offroad && p.speed > 4) {
        const strip = /desert|coast/.test(a.level.road) ? 'fx_dust' : 'fx_grass';
        this.wheels(strip, false);
      } else if (hardBrake || drifting || p.spinning) {
        this.wheels('fx_smoke', false);
      }
      // (les étincelles de crevaison sont dessinées par CarRenderer, accrochées à la roue)
    }
    // Flamme au lever de pied à haute vitesse
    if (this.wasThrottle && !p.throttle && vr > FX.flameMinRatio) {
      this.list.push({
        strip: 'fx_exhaust_flame',
        x: CAR_SCREEN_X + FX.exhaustOffsetPx.x,
        y: CAR_SCREEN_Y + FX.exhaustOffsetPx.y,
        t: 0, life: FX.flameDuration, front: true,
      });
    }
    this.wasThrottle = p.throttle;

    for (const q of this.list) {
      q.t += dt;
      if (!q.front) q.y += FX.particleDrift * dt;
    }
    this.list = this.list.filter((q) => q.t < q.life);
  }

  private wheels(strip: string, front: boolean): void {
    for (const s of [-1, 1]) {
      this.list.push({
        strip, front,
        x: CAR_SCREEN_X + s * FX.rearWheelOffsetPx + (Math.random() - 0.5) * 6,
        y: CAR_SCREEN_Y,
        t: 0,
        life: 0.5, // sera borné par le nombre de frames de la planche
      });
    }
  }

  draw(ctx: CanvasRenderingContext2D, a: Assets, front: boolean): void {
    for (const q of this.list) {
      if (q.front !== front) continue;
      const s = a.fx[q.strip];
      let frame = Math.floor(q.t * s.fps);
      if (s.loop) frame %= s.count;
      else if (frame >= s.count) continue;
      ctx.drawImage(
        s.img, frame * s.frame.w, 0, s.frame.w, s.frame.h,
        Math.round(q.x - s.anchor.x), Math.round(q.y - s.anchor.y), s.frame.w, s.frame.h,
      );
    }
  }
}

/** Secousse de caméra et rayures de vitesse. */
export class SpeedFx {
  shake(p: Player, hit = 0): { x: number; y: number } {
    const vr = p.speed / PHYSICS.maxSpeed;
    let amp = 0;
    if (vr > FX.shakeStartRatio) amp += FX.shakeMax * ((vr - FX.shakeStartRatio) / (1 - FX.shakeStartRatio));
    if (p.offroad && p.speed > 8) amp += FX.shakeOffroad * Math.min(1, vr * 2);
    if (hit > 0) amp += FX.shakeHit;
    if (amp <= 0) return { x: 0, y: 0 };
    return { x: Math.round((Math.random() * 2 - 1) * amp), y: Math.round((Math.random() * 2 - 1) * amp) };
  }

  /** Traits radiant depuis le point de fuite, de plus en plus longs avec la vitesse. */
  streaks(ctx: CanvasRenderingContext2D, p: Player): void {
    const vr = p.speed / PHYSICS.maxSpeed;
    // aspiration : filets d'air blancs qui filent le long de la voiture, vers l'arrière (plus nombreux quand on est collé)
    if (p.draft > 0.05) {
      const n = Math.round(4 + 8 * p.draft);
      ctx.save();
      ctx.strokeStyle = `rgba(255,255,255,${(0.25 + 0.4 * p.draft).toFixed(2)})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const side = Math.random() < 0.5 ? -1 : 1;
        const x = CAR_SCREEN_X + side * (40 + Math.random() * 70);
        const y = CAR_SCREEN_Y - 60 + Math.random() * 70;
        const len = 10 + Math.random() * 26 * p.draft;
        ctx.moveTo(Math.round(x), Math.round(y));
        ctx.lineTo(Math.round(x + side * len * 0.5), Math.round(y + len));
      }
      ctx.stroke();
      ctx.restore();
    }
    if (vr < FX.streakStartRatio) return;
    const k = (vr - FX.streakStartRatio) / (1 - FX.streakStartRatio);
    const cx = RENDER.width / 2, cy = RENDER.horizon;
    ctx.save();
    ctx.strokeStyle = `rgba(255,255,255,${(0.12 + 0.3 * k).toFixed(2)})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < FX.streakCount; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r1 = 110 + Math.random() * 90;
      const r2 = r1 + 14 + 40 * k * Math.random();
      ctx.moveTo(Math.round(cx + Math.cos(ang) * r1 * 1.6), Math.round(cy + Math.sin(ang) * r1 * 0.9));
      ctx.lineTo(Math.round(cx + Math.cos(ang) * r2 * 1.6), Math.round(cy + Math.sin(ang) * r2 * 0.9));
    }
    ctx.stroke();
    ctx.restore();
  }
}
