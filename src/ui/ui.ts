import { RENDER } from '../config/balance';
import { loadImage } from '../core/assets';
import { BUST_FILE, type Expr, type Who } from '../story/scenes';

const FRAME_W = 128, FRAME_H = 144;
const EXPR_INDEX: Record<Expr | 'talk', number> = { neutral: 0, happy: 1, angry: 2, surprised: 3, talk: 4 };
const CHARS = ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~àâäçéèêëîïôöùûüÀÂÇÉÈÊËÎÏÔÙÛœŒ«»€’…';

/** Ressources des écrans hors course : titre, dialogues, podium, polices. */
export interface UiAssets {
  busts: Record<Who, HTMLImageElement>;
  box: HTMLImageElement;
  font: HTMLImageElement;
  title: HTMLImageElement;
  logo: HTMLImageElement;
  sky: HTMLImageElement;
  horizon: HTMLImageElement;
  podium: HTMLImageElement;
  drivers: Record<string, HTMLImageElement>;
  trophy: HTMLImageElement;
}

export async function loadUiAssets(): Promise<UiAssets> {
  const whos = Object.keys(BUST_FILE) as Who[];
  const driverColors = ['red', 'blue', 'white', 'green'];
  const [busts, drivers, box, font, title, logo, sky, horizon, podium] = await Promise.all([
    Promise.all(whos.map((w) => loadImage(`dialogue/${BUST_FILE[w]}.png`))),
    Promise.all(driverColors.map((c) => loadImage(`people/driver_${c}.png`))),
    loadImage('dialogue/dialog_box.png'),
    loadImage('dialogue/font_dialog.png'),
    loadImage('logo/title_screen.png'),
    loadImage('logo/babass_racing_logo.png'),
    loadImage('backgrounds/sky_sunset.png'),
    loadImage('backgrounds/horizon_city.png'),
    loadImage('people/podium.png'),
  ]);
  const bustMap = {} as Record<Who, HTMLImageElement>;
  whos.forEach((w, i) => (bustMap[w] = busts[i]));
  const driverMap: Record<string, HTMLImageElement> = {};
  driverColors.forEach((c, i) => (driverMap[c] = drivers[i]));
  return { busts: bustMap, box, font, title, logo, sky, horizon, podium, drivers: driverMap, trophy: podium };
}

/** Texte en police bitmap des dialogues (minuscules et accents). Avance de 8 px par caractère. */
export function drawText(ctx: CanvasRenderingContext2D, ui: UiAssets, str: string, x: number, y: number): void {
  for (let i = 0; i < str.length; i++) {
    const idx = CHARS.indexOf(str[i]);
    if (idx < 0 || idx === 0) continue;
    ctx.drawImage(ui.font, (idx % 16) * 10, Math.floor(idx / 16) * 16, 10, 16, x + i * 8, y, 10, 16);
  }
}
export function drawTextCentered(ctx: CanvasRenderingContext2D, ui: UiAssets, str: string, cx: number, y: number): void {
  drawText(ctx, ui, str, Math.round(cx - (str.length * 8) / 2), y);
}
export const textWidth = (s: string) => s.length * 8;

/** Coupe un texte en lignes de `max` caractères au plus (aux espaces). */
export function wrap(str: string, max: number): string[] {
  const lines: string[] = [];
  let cur = '';
  for (const w of str.split(' ')) {
    if ((cur + ' ' + w).trim().length > max) {
      lines.push(cur);
      cur = w;
    } else cur = (cur + ' ' + w).trim();
  }
  if (cur) lines.push(cur);
  return lines;
}

/** Fond commun des écrans : ciel de coucher de soleil + horizon de ville + voile sombre. */
export function drawBackdrop(ctx: CanvasRenderingContext2D, ui: UiAssets, scroll = 0): void {
  const W = RENDER.width, H = RENDER.height;
  ctx.fillStyle = '#10142a';
  ctx.fillRect(0, 0, W, H);
  const off = Math.floor(scroll) % 1024;
  for (let x = -off; x < W; x += 1024) {
    ctx.drawImage(ui.sky, x, 40);
    ctx.drawImage(ui.horizon, x, 168);
  }
  ctx.fillStyle = '#1b1830';
  ctx.fillRect(0, 296 - 128, W, H);
}

export function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = 'rgba(8,10,24,0.86)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#e8ecff';
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

const dim = document.createElement('canvas');
dim.width = FRAME_W;
dim.height = FRAME_H;

/** Buste de personnage : à gauche = celui qui parle, à droite = interlocuteur (miroir et assombri, RGB × 0,55). */
export function drawBust(
  ctx: CanvasRenderingContext2D, ui: UiAssets, who: Who, expr: Expr | 'talk', x: number, y: number, side: 'left' | 'right', dimmed: boolean,
): void {
  const frame = EXPR_INDEX[expr];
  const dc = dim.getContext('2d')!;
  dc.clearRect(0, 0, FRAME_W, FRAME_H);
  dc.save();
  if (side === 'right') {
    dc.translate(FRAME_W, 0);
    dc.scale(-1, 1);
  }
  dc.drawImage(ui.busts[who], frame * FRAME_W, 0, FRAME_W, FRAME_H, 0, 0, FRAME_W, FRAME_H);
  dc.restore();
  if (dimmed) {
    dc.globalCompositeOperation = 'source-atop';
    dc.fillStyle = 'rgba(0,0,0,0.45)';
    dc.fillRect(0, 0, FRAME_W, FRAME_H);
    dc.globalCompositeOperation = 'source-over';
  }
  ctx.drawImage(dim, x, y);
}
