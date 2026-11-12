import type { Assets } from '../core/assets';

/**
 * Portique de départ avec ses feux : les feux (frames de `start_lights.png`) sont collés dans l'emplacement prévu
 * du portique. Le résultat est un canvas qui remplace l'image du portique dans l'atlas de décor.
 * Séquence (README) : feux éteints → un feu rouge de plus chaque seconde (1…5) → pause aléatoire → extinction = départ.
 */
export class GantryLights {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private frame = -1;

  constructor(private readonly a: Assets) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = a.gantryStart.width;
    this.canvas.height = a.gantryStart.height;
    this.ctx = this.canvas.getContext('2d')!;
    a.atlases.gantry_finish.img = this.canvas;
    this.set(0);
  }

  /** frame : 0 = éteints, 1..5 = feux rouges, 6 = vert */
  set(frame: number): void {
    if (frame === this.frame) return;
    this.frame = frame;
    const s = this.a.lightsSlot;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.drawImage(this.a.gantryStart, 0, 0);
    this.ctx.drawImage(this.a.startLights, frame * s.w, 0, s.w, s.h, s.x, s.y, s.w, s.h);
  }
}
