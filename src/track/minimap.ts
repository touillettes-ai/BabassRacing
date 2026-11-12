import { MINIMAP, RENDER } from '../config/balance';
import type { Track } from './segments';

export interface Minimap {
  canvas: HTMLCanvasElement;
  /** Position (px dans le canvas) du point de la piste à la distance z. */
  pointAt(z: number): { x: number; y: number };
}

/**
 * Mini-carte : on intègre le cap de la route (dθ = courbure / longueur de segment) pour obtenir le tracé,
 * puis on « referme » la boucle pour l'affichage : le cap manquant pour faire 360° est réparti
 * uniformément et l'écart de position résiduel est corrigé linéairement. Le tracé est donc schématique.
 */
export function buildMinimap(track: Track): Minimap {
  const n = track.segments.length;
  const seg = RENDER.segmentLength;

  // Cap : dθ = courbure / longueur de segment. Pour refermer la boucle sans la « rondir », on ne répartit PAS le cap manquant
  // uniformément (tous les circuits deviendraient des ronds) : on amplifie les virages d'un sens et on atténue ceux de l'autre
  // jusqu'à faire un tour complet ; le reste éventuel (bornes de l'amplification) est réparti uniformément.
  // Les virages serrés sont accentués (épingles ≈ 4× plus tournantes que leur courbure brute) : sans cela, la route paraît « ronde »
  // car un virage de 90° dans le jeu ne change le cap que de ~40°. Les droites restent droites.
  const dth = (c: number) => (c / seg) * (1 + 2.8 * Math.pow(Math.min(1, Math.abs(c) / 0.12), 1.5));
  let pos = 0, neg = 0;
  for (const sg of track.segments) {
    const d = dth(sg.curve);
    if (d > 0) pos += d; else neg -= d;
  }
  const dir = pos >= neg ? 1 : -1; // sens dominant du circuit
  const major = dir > 0 ? pos : neg, minor = dir > 0 ? neg : pos;
  const FULL = Math.PI * 2;
  // majeur × a − mineur × 1 = 2π  →  a = (2π + mineur) / majeur, borné
  const a = Math.max(0.5, Math.min(3, major > 1e-6 ? (FULL + minor) / major : 1));
  const turned = a * major - minor;
  const fix = (FULL - turned) / n;

  const pts: { x: number; y: number }[] = [];
  let x = 0, y = 0, th = 0;
  for (let i = 0; i < n; i++) {
    pts.push({ x, y });
    const d = dth(track.segments[i].curve);
    const same = d * dir > 0;
    th += dir * ((same ? a : 1) * Math.abs(d) * (same ? 1 : -1)) + dir * fix;
    x += Math.sin(th) * seg;
    y -= Math.cos(th) * seg;
  }
  const gx = x, gy = y;
  for (let i = 0; i < n; i++) {
    pts[i].x -= (gx * i) / n;
    pts[i].y -= (gy * i) / n;
  }

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  const box = MINIMAP.size - MINIMAP.padding * 2;
  const k = Math.min(box / (maxX - minX || 1), box / (maxY - minY || 1));
  const ox = (MINIMAP.size - (maxX - minX) * k) / 2 - minX * k;
  const oy = (MINIMAP.size - (maxY - minY) * k) / 2 - minY * k;
  const map = pts.map((p) => ({ x: Math.round(p.x * k + ox), y: Math.round(p.y * k + oy) }));

  const canvas = document.createElement('canvas');
  canvas.width = MINIMAP.size;
  canvas.height = MINIMAP.size;
  const c = canvas.getContext('2d')!;
  // fond + contour pixel-art (points plutôt que traits : pas d'anti-aliasing)
  c.fillStyle = 'rgba(8,10,24,0.72)';
  c.fillRect(0, 0, MINIMAP.size, MINIMAP.size);
  c.fillStyle = '#05060f';
  for (const p of map) c.fillRect(p.x - 1, p.y - 1, 3, 3);
  c.fillStyle = '#e8ecff';
  for (const p of map) c.fillRect(p.x, p.y, 1, 1);
  // ligne d'arrivée + entrée des stands
  const fl = map[track.layout.finishSeg];
  c.fillStyle = '#ffd23a';
  c.fillRect(fl.x - 2, fl.y - 2, 4, 4);
  const pe = map[track.layout.pitEntrySeg];
  c.fillStyle = '#4aa3ff';
  c.fillRect(pe.x - 1, pe.y - 1, 2, 2);

  return {
    canvas,
    pointAt(z: number) {
      const i = Math.floor((((z / seg) % n) + n) % n);
      return map[i];
    },
  };
}
