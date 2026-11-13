import type { Assets } from '../core/assets';
import { RENDER } from '../config/balance';

/**
 * Météo dessinée par-dessus la scène (sous l'interface) : teinte de l'ambiance, pluie animée (4 frames de 128×128, 16 i/s)
 * et éclairs d'orage (3 frames de 96×160 + flash blanc : alpha 160 puis 60 sur 2 images). Un éclair toutes les 4 à 12 s.
 */
export class Weather {
  private t = 0;
  private nextStrike = 5;
  private strikeT = -1;
  private strikeX = 0;
  /** Nombre d'éclairs depuis le début : le son du tonnerre s'en sert pour savoir quand jouer. */
  strikes = 0;

  /** Impacts de gouttes sur la route : position écran logique, âge (s), échelle. */
  private splashes: { x: number; y: number; t: number; k: number }[] = [];
  private splashAcc = 0;

  update(dtMs: number, a: Assets): void {
    const dt = Math.min(0.1, dtMs / 1000);
    this.t += dt;
    const sp = a.fx.fx_rain_splash;
    if (a.level.weather?.splash && sp) {
      this.splashAcc += dt * 45;
      while (this.splashAcc >= 1) {
        this.splashAcc -= 1;
        // plus dense près de l'horizon (perspective), taille croissante vers le bas de l'écran
        const r = Math.random();
        const y = RENDER.horizon + 4 + (RENDER.height - RENDER.horizon - 4) * r * r;
        const k = 0.35 + 0.9 * ((y - RENDER.horizon) / (RENDER.height - RENDER.horizon));
        this.splashes.push({ x: Math.random() * RENDER.width, y, t: 0, k });
      }
      const life = sp.count / sp.fps;
      for (const s of this.splashes) s.t += dt;
      this.splashes = this.splashes.filter((s) => s.t < life);
    }
    if (!a.weatherFx.lightning) return;
    if (this.strikeT >= 0) {
      this.strikeT += dt;
      if (this.strikeT > 0.3) this.strikeT = -1;
    } else if (this.t >= this.nextStrike) {
      this.strikeT = 0;
      this.strikeX = 60 + Math.random() * (RENDER.width - 120);
      this.nextStrike = this.t + 4 + Math.random() * 8;
      this.strikes++;
    }
  }

  draw(ctx: CanvasRenderingContext2D, a: Assets): void {
    const fx = a.weatherFx;
    const W = RENDER.width, H = RENDER.height;
    if (fx.tint) {
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = `rgb(${fx.tint.map((v) => Math.round(v * 255)).join(',')})`;
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
    }
    const sp = a.fx.fx_rain_splash;
    if (sp && this.splashes.length) {
      const hd = RENDER.hd;
      for (const s of this.splashes) {
        const f = Math.min(sp.count - 1, Math.floor(s.t * sp.fps));
        const w = (sp.frame.w / hd) * s.k, h = (sp.frame.h / hd) * s.k;
        ctx.drawImage(sp.img, f * sp.frame.w, 0, sp.frame.w, sp.frame.h, s.x - (sp.anchor.x / hd) * s.k, s.y - (sp.anchor.y / hd) * s.k, w, h);
      }
    }
    if (fx.rain) {
      const frame = Math.floor(this.t * 16) % 4;
      ctx.globalAlpha = 0.7;
      const cell = 128 * RENDER.hd; // planche HD : 4 frames de 256×256, tuiles de 128×128 logiques
      for (let y = 0; y < H; y += 128) for (let x = 0; x < W; x += 128) ctx.drawImage(fx.rain, frame * cell, 0, cell, cell, x, y, 128, 128);
      ctx.globalAlpha = 1;
    }
    if (fx.lightning && this.strikeT >= 0) {
      const f = Math.min(2, Math.floor(this.strikeT * 12));
      if (f < 2) {
        const hd = RENDER.hd;
        ctx.drawImage(fx.lightning, f * 96 * hd, 0, 96 * hd, 160 * hd, this.strikeX - 48, RENDER.horizon - 150, 96, 160);
        ctx.fillStyle = `rgba(255,255,255,${f === 0 ? 160 / 255 : 60 / 255})`;
        ctx.fillRect(0, 0, W, H);
      }
    }
  }
}
