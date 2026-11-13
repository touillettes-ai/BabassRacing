import { RENDER } from '../config/balance';
import type { Assets } from '../core/assets';

/** Ciel + nuages + horizon, avec parallaxe selon le cumul de courbure parcouru. */
export class Background {
  /** Cumul de courbure × vitesse (px). Un virage à droite fait défiler le fond vers la gauche. */
  scroll = 0;
  private clock = 0;

  update(dt: number, curve: number, speed: number): void {
    this.clock += dt;
    this.scroll += curve * speed * dt * RENDER.parallax.scrollPerCurveSpeed;
  }

  private layer(ctx: CanvasRenderingContext2D, img: HTMLImageElement, factor: number, bottomY: number, extra = 0): void {
    // images HD (2048 px de large = 1024 px logiques)
    const hd = RENDER.hd;
    const w = img.width / hd, h = img.height / hd;
    const off = (((this.scroll * factor + extra) % w) + w) % w;
    const y = Math.round((bottomY - h) * hd) / hd;
    for (let x = -off; x < RENDER.width; x += w) ctx.drawImage(img, Math.round(x * hd) / hd, y, w + 0.5 / hd, h);
  }

  draw(ctx: CanvasRenderingContext2D, a: Assets): void {
    const P = RENDER.parallax;
    const h = RENDER.horizon;
    ctx.fillStyle = a.groundColor;
    ctx.fillRect(0, h, RENDER.width, RENDER.height - h);
    this.layer(ctx, a.sky, P.sky, h);
    this.layer(ctx, a.cloudsFar, P.cloudsFar, h - 28, this.clock * P.cloudDrift);
    this.layer(ctx, a.cloudsNear, P.cloudsNear, h - 8, this.clock * P.cloudDrift * 2);
    this.layer(ctx, a.horizon, P.horizon, h + 1);
  }
}
