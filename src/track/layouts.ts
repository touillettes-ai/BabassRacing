import { RENDER, TRACKGEN as G } from '../config/balance';
import { appendOfficial, OFFICIAL } from './official';
import type { TrackBuilder } from './segments';

/**
 * Circuits INSPIRÉS des tracés officiels (F1 et WEC) : succession schématique des virages et des lignes droites, dans l'ordre du
 * tour à partir de la ligne droite des stands. Ce n'est pas un relevé topographique : l'ordre, le type et le sens des virages
 * (et quelques dénivelés marquants) sont repris de mémoire pour donner des circuits plus complexes que la génération aléatoire.
 *
 * Syntaxe des jetons (séparés par des espaces) :
 *   S<n>[^dy]   ligne droite de n segments de 5 m (dy = dénivelé en m, ex. S26^-6)
 *   R<k>|L<k>[^dy]  virage à droite / gauche : g = léger, m = moyen, t = serré, h = épingle, w = grande courbe, c = chicane (enchaîne le sens opposé)
 * Les lignes droites sont recalibrées pour atteindre la longueur visée ; les virages gardent leur taille.
 */
export interface LayoutDef {
  id: string;
  /** Clé i18n du nom du circuit */
  nameKey: string;
  /** Facteur de longueur par rapport à la longueur de base de la course (circuits longs / courts) */
  lengthFactor: number;
  tokens: string;
}

export const LAYOUTS: LayoutDef[] = [
  { id: 'sebring', nameKey: 'circuit.sebring', lengthFactor: 1.0, tokens: 'S30 Rm S10 Lt Rt S12 Lm S18 Rh S16 Lm Rm S20 Lh S12 Rm S22 Lc S12 Rt' },
  { id: 'paulricard', nameKey: 'circuit.paulricard', lengthFactor: 1.1, tokens: 'S40 Rm S10 Lm Rg S60 Lc S40 Rt S12 Lm S10 Rm S14 Rw S12 Lt' },
  { id: 'portimao', nameKey: 'circuit.portimao', lengthFactor: 1.0, tokens: 'S20 Rm Lm S12^+5 Rt S10^-4 Lh S10 Rm S14^+6 Rw S10^-6 Lt Rt S14 Lm Rh S12 Lc' },
  { id: 'montreal', nameKey: 'circuit.montreal', lengthFactor: 0.95, tokens: 'S30 Rc S30 Lh S34 Rc S34 Lm Rm S10 Lt S40 Rh S26 Lc' },
  { id: 'melbourne', nameKey: 'circuit.melbourne', lengthFactor: 1.0, tokens: 'S24 Rm S10 Lt S14 Rg S20 Lm Rm S16 Lw S12 Rt S10 Lm Rt S18 Lw Rm S10' },
  { id: 'singapore', nameKey: 'circuit.singapore', lengthFactor: 0.85, tokens: 'S14 Rt S8 Lt S10 Rm Lm Rt S10 Lh S8 Rm S10 Lc S8 Rt Lt S10 Rm S8 Lh S10 Rt Lm S8' },
  { id: 'baku', nameKey: 'circuit.baku', lengthFactor: 1.1, tokens: 'S60 Rt S20 Lt Rm S10 Lm Rt S12 Lt Rh S10 Lm Rt S14 Lt S10 Rm S40 Lm' },
  { id: 'bathurst', nameKey: 'circuit.bathurst', lengthFactor: 1.1, tokens: 'S30^+8 Rm S8 Lt^+4 Rg S12^+6 Lm Rt S10^-6 Lh^-4 S10 Rm Lm S24^-8 Rt S10 Lm S20 Rh S30 Lc' },
  { id: 'redbullring', nameKey: 'circuit.redbullring', lengthFactor: 0.8, tokens: 'S34^+6 Rh S28^+4 Rt S26^-4 Lm S24 Rm S12 Lm S14' },
  { id: 'zandvoort', nameKey: 'circuit.zandvoort', lengthFactor: 0.85, tokens: 'S14 Rm S8 Lt Rg S14 Lw Rt S10 Lt Rm S10 Lm S12 Rm S10 Rw' },
  { id: 'hungaroring', nameKey: 'circuit.hungaroring', lengthFactor: 0.9, tokens: 'S22 Rm S8 Lm Rm S14 Lt S10 Rm Lm S12 Rt Lt S10 Rt Lm' },
  { id: 'fuji', nameKey: 'circuit.fuji', lengthFactor: 1.05, tokens: 'S60 Rt S18 Rm S14 Lm S22 Rw Rm S12 Lh S16 Rm S10 Lt S18 Rt Lc' },
  { id: 'barcelona', nameKey: 'circuit.barcelona', lengthFactor: 1.0, tokens: 'S40 Rm S12 Lt S10 Rm S22^+4 Lt Rt S18 Rm Lm S12 Rt Lc' },
  { id: 'bahrain', nameKey: 'circuit.bahrain', lengthFactor: 1.0, tokens: 'S30 Rh Lm Rm Rt S40 Lm Rg S30 Lh S22 Rm S12 Lm Rm S10 Rt' },
  { id: 'imola', nameKey: 'circuit.imola', lengthFactor: 1.0, tokens: 'S14 Rg Lg S12 Rc S16 Lh S12 Rm S10 Lm S16^+3 Lt Rt S12 Rw S10 Lc' },
  { id: 'nurburgring', nameKey: 'circuit.nurburgring', lengthFactor: 1.05, tokens: 'S12 Rm Lm Rt S10 Lm S16 Rt Lt S8 Rm S22 Lw Rm S12 Lh S14 Rm S10 Lc' },
  { id: 'cota', nameKey: 'circuit.cota', lengthFactor: 1.1, tokens: 'S30^+8 Lh S12 Rm Lm Rm Lm Rg S14 Lh S36 Rm Lw S16 Rt Lc S12 Rm Lm Rm' },
  { id: 'silverstone', nameKey: 'circuit.silverstone', lengthFactor: 1.1, tokens: 'S14 Rm S10 Lg Rg Lg Rg S20 Rg S22 Rt S12 Lm S10 Rt S14 Lw Rm S12' },
  { id: 'interlagos', nameKey: 'circuit.interlagos', lengthFactor: 0.95, tokens: 'Lc Lw S14 Lt S16 Rm S10 Lm S20^-5 Lh S12^+5 Rm Lg S22 Lt S10 Lm S12 Rt Lg' },
  { id: 'monza', nameKey: 'circuit.monza', lengthFactor: 1.15, tokens: 'Rc S28 Rw S20 Lc S16 Rm S12 Rm S34 Lc S26 Rw Rm' },
  { id: 'suzuka', nameKey: 'circuit.suzuka', lengthFactor: 1.15, tokens: 'S12 Rm Lm Rm Lm Rg S10 Lt Lm S14 Rm S18 Rh S24 Lw Rw S10 Rt Lc S16 Rm Lm S14 Rt S10' },
  { id: 'monaco', nameKey: 'circuit.monaco', lengthFactor: 0.7, tokens: 'Rm S6^+4 Lm S6^+3 Rg S8 Lt Rt S10 Rh S8 Rm S10 Lc S6 Lm Rc S6 Lt Rt S8 Rc' },
  { id: 'spa', nameKey: 'circuit.spa', lengthFactor: 1.3, tokens: 'Rh S6 S26^-6 Lm Rm^+8 S50^+8 Rc S20 Rm S14 Rt S18^-4 Lw S16 Rm Lm S18 Rm S28 Lw S22 Lc S10' },
  { id: 'lemans', nameKey: 'circuit.lemans', lengthFactor: 1.5, tokens: 'Lg Rm S14 Lc S8 Rt S34 S70 Rc S70 Lc S34 Rt S14 Lm S18 Rt S12 Lg Rg Lg Rg S10 Rc S8 Lm Rm' },
];

const CORNERS: Record<string, { mag: number; enter: number; hold: number; leave: number }> = {
  g: { mag: 0.038, enter: 20, hold: 30, leave: 20 },
  m: { mag: 0.07, enter: 14, hold: 22, leave: 14 },
  t: { mag: 0.11, enter: 10, hold: 15, leave: 10 },
  h: { mag: 0.16, enter: 9, hold: 16, leave: 9 },
  w: { mag: 0.028, enter: 30, hold: 70, leave: 30 },
  c: { mag: 0.085, enter: 9, hold: 9, leave: 9 },
};

type Tok = { kind: 'S'; n: number; dy: number } | { kind: 'C'; sign: number; k: string; dy: number };

function parse(tokens: string): Tok[] {
  return tokens.trim().split(/\s+/).map((t) => {
    const m = /^S(\d+)(?:\^([+-]?\d+))?$/.exec(t);
    if (m) return { kind: 'S', n: Number(m[1]), dy: m[2] ? Number(m[2]) : 0 };
    const c = /^([RL])([gmthwc])(?:\^([+-]?\d+))?$/.exec(t);
    if (!c) throw new Error('Jeton de circuit inconnu : ' + t);
    return { kind: 'C', sign: c[1] === 'R' ? 1 : -1, k: c[2], dy: c[3] ? Number(c[3]) : 0 };
  });
}

const cornerLen = (k: string) => {
  const c = CORNERS[k];
  const one = c.enter + c.hold + c.leave;
  return k === 'c' ? one * 2 : one;
};

/** Pente maxi : un dénivelé exige `climbSegsPerM` segments par mètre ; sinon on l'écrête. */
const clampDy = (dy: number, segs: number) => Math.sign(dy) * Math.min(Math.abs(dy), segs / G.climbSegsPerM);

/**
 * Ajoute le tracé `id` au constructeur : `avail` = nombre de segments disponibles pour le circuit (hors ligne droite des stands
 * et droite finale). Les lignes droites sont proportionnellement allongées / raccourcies pour atteindre cette longueur.
 */
export function appendLayout(b: TrackBuilder, id: string, avail: number): void {
  if (OFFICIAL[id]) return appendOfficial(b, id);
  const def = LAYOUTS.find((l) => l.id === id);
  if (!def) throw new Error('Circuit inconnu : ' + id);
  const toks = parse(def.tokens);
  let fixed = toks.reduce((a, t) => a + (t.kind === 'C' ? cornerLen(t.k) : 0), 0);
  // si les virages occupent plus de 65 % de la longueur visée, on les raccourcit (mêmes courbures, entrée/plateau/sortie plus courts)
  const cornerScale = fixed > avail * 0.65 ? Math.max(0.55, (avail * 0.65) / fixed) : 1;
  if (cornerScale < 1) fixed = Math.round(fixed * cornerScale);
  const straights = toks.reduce((a, t) => a + (t.kind === 'S' ? t.n : 0), 0);
  const scale = Math.max(0.35, (avail - fixed) / Math.max(1, straights));
  for (const t of toks) {
    if (t.kind === 'S') {
      const n = Math.max(6, Math.round(t.n * scale));
      b.straight(n, clampDy(t.dy, n));
    } else {
      const c = CORNERS[t.k];
      const e = Math.max(4, Math.round(c.enter * cornerScale)), h = Math.max(4, Math.round(c.hold * cornerScale)), l = Math.max(4, Math.round(c.leave * cornerScale));
      b.section(e, h, l, t.sign * c.mag, clampDy(t.dy, e + h + l));
      if (t.k === 'c') b.section(e, h, l, -t.sign * c.mag, 0); // la chicane enchaîne le sens opposé
    }
  }
}

void RENDER;
