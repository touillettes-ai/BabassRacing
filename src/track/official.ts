import type { TrackBuilder } from './segments';

/**
 * Tracés « officiels » du pack d'assets (`public/assets/circuits/track_*.json`) : liste de segments de 50 m avec
 * `turn_deg` (variation de cap), `elev_m` (altitude du début de segment) et `event`. Le moteur utilise des segments de 5 m :
 * chaque segment du pack devient 10 segments, la courbure et l'altitude étant interpolées (pas de marche d'escalier).
 */
export interface OfficialSegment { i: number; curve: number; turn_deg: number; elev_m: number; x: number; y: number; event?: string }
export interface OfficialTrack {
  name: string;
  label: string;
  type: string;
  ambiance: string;
  length_m: number;
  laps_suggested: number;
  segments: OfficialSegment[];
}

const files = import.meta.glob('../../public/assets/circuits/track_*.json', { eager: true, import: 'default' }) as Record<string, OfficialTrack>;
export const OFFICIAL: Record<string, OfficialTrack> = Object.fromEntries(Object.values(files).map((t) => [t.name, t]));

/** Courbure du moteur par degré de virage sur 50 m : 16°/50 m ≈ épingle (0,12), 9° ≈ virage moyen (0,07). */
const CURVE_PER_DEG = 0.0075;
const MAX_CURVE = 0.16;
/** Pente max tolérée (validateTrack : 8,5 %) : on aplatit le relief du circuit entier si besoin. */
const MAX_SLOPE = 0.08;
const SUB = 10; // 50 m / 5 m

/** Départ du tour : le plus droit et le plus plat des points de départ possibles (la droite des stands s'y raccorde). */
function startIndex(s: OfficialSegment[]): number {
  const n = s.length;
  let best = 0, bestScore = Infinity;
  for (let i = 0; i < n; i++) {
    let score = 0;
    for (let k = 0; k < 3; k++) score += Math.abs(s[(i + k) % n].turn_deg) + Math.abs(s[(i + k + 1) % n].elev_m - s[(i + k) % n].elev_m) * 0.3;
    if (score < bestScore) { bestScore = score; best = i; }
  }
  return best;
}

/** Ajoute le tracé officiel `id` au constructeur (la longueur est celle du pack). */
export function appendOfficial(b: TrackBuilder, id: string): void {
  const t = OFFICIAL[id];
  if (!t) throw new Error('Tracé inconnu : ' + id);
  const n = t.segments.length;
  const r = startIndex(t.segments);
  const seg = (k: number) => t.segments[(r + k + n * 4) % n];
  const turn = (k: number) => seg(k).turn_deg * CURVE_PER_DEG;
  let maxSlope = 0;
  for (let k = 0; k < n; k++) maxSlope = Math.max(maxSlope, Math.abs(seg(k + 1).elev_m - seg(k).elev_m) / 50);
  const relief = maxSlope > MAX_SLOPE ? MAX_SLOPE / maxSlope : 1;
  const e0 = seg(0).elev_m;
  const elev = (k: number) => (seg(k).elev_m - e0) * relief;
  for (let k = 0; k < n; k++) {
    // la courbure est celle du centre de chaque segment du pack, interpolée linéairement entre deux centres
    for (let j = 0; j < SUB; j++) {
      const pos = k + (j + 0.5) / SUB - 0.5; // en « segments du pack », centres aux entiers
      const a = Math.floor(pos), f = pos - a;
      const c = Math.max(-MAX_CURVE, Math.min(MAX_CURVE, turn(a) * (1 - f) + turn(a + 1) * f));
      const dy = ((elev(k + 1) - elev(k)) / SUB);
      b.section(0, 1, 0, c, dy);
    }
  }
}
