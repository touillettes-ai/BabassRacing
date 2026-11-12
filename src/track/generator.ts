import { RENDER, TRACKGEN as G } from '../config/balance';
import { Rng } from '../core/rng';
import { appendLayout } from './layouts';
import { Track, TrackBuilder, type TrackLayout } from './segments';

/** Paramètres d'un circuit — variables selon la catégorie de course. */
export interface TrackParams {
  seed: number;
  /** Longueur visée (m) */
  lengthM: number;
  /** Nombre de virages (une chicane compte pour 1) */
  corners: number;
  /** Altitude max au-dessus du départ (m). 0 = circuit plat */
  elevation: number;
  /** 0 (facile) … 1 (difficile) : plus de virages serrés / chicanes, courbures plus fortes */
  difficulty: number;
  /** Ambiance (clé de levels.json) */
  theme: string;
  /** Circuit inspiré d'un tracé officiel (id de layouts.ts) : remplace la génération aléatoire des virages */
  layout?: string;
}

export const DEFAULT_PARAMS: TrackParams = {
  seed: 1, lengthM: 3600, corners: 10, elevation: 14, difficulty: 0.4, theme: 'circuit_jour',
};

type Kind = keyof typeof G.corners;
interface Corner { kind: Kind; enter: number; hold: number; leave: number; mag: number; sign: number }

const len = (c: Corner) => c.enter + c.hold + c.leave;

/**
 * Génère un circuit en boucle à partir d'une seed.
 *
 * Structure : [ligne droite des stands, plate] + [virages séparés par des droites (avec collines/bosses)]
 *             + [droite finale qui ramène l'altitude à 0] → le dernier segment se raccorde au premier.
 *
 * Contraintes de cohérence (voir TRACKGEN) :
 *  - pente bornée (la longueur d'une côte dépend de son dénivelé) ;
 *  - jamais deux virages serrés d'affilée ; droite mini avant/après un virage serré ;
 *  - pas de dénivelé dans un virage serré ;
 *  - signes des virages choisis pour que la route tourne globalement d'un tour complet (boucle plausible).
 */
export function generateTrack(params: TrackParams): Track {
  const rng = new Rng(params.seed * 7919 + 17);
  const b = new TrackBuilder();
  const target = Math.round(params.lengthM / RENDER.segmentLength);
  const d = params.difficulty;
  const elev = params.elevation;

  // 1. Ligne droite des stands (plate)
  b.straight(G.startStraightSegs);

  if (params.layout) {
    // Circuit inspiré d'un tracé officiel (F1 / WEC) : virages et droites imposés, longueur ajustée sur les droites
    appendLayout(b, params.layout, target - G.startStraightSegs - G.endStraightMin);
  } else {
    // 2. Plan des virages (types, tailles, signes)
    const kinds: Kind[] = [];
    for (let i = 0; i < params.corners; i++) {
      let k = pickKind(rng, d);
      for (let tries = 0; tries < 4 && k === 'tight' && kinds[kinds.length - 1] === 'tight'; tries++) k = pickKind(rng, d);
      if (k === 'tight' && kinds[kinds.length - 1] === 'tight') k = 'medium';
      kinds.push(k);
    }
    const specs: Corner[][] = [];
    let heading = 0; // cap cumulé approximatif (rad), pour que la route fasse un tour global
    const targetHeading = (rng.chance(0.5) ? 1 : -1) * Math.PI * 2;
    for (const k of kinds) {
      const want = targetHeading - heading > 0 ? 1 : -1;
      const sign = rng.chance(0.7) ? want : -want;
      const c1 = makeCorner(rng, k, d, sign);
      const group = [c1];
      if (k === 'chicane') group.push({ ...makeCorner(rng, k, d, -sign) });
      for (const c of group) heading += (c.sign * c.mag * (c.enter / 3 + c.hold + c.leave / 2)) / RENDER.segmentLength;
      specs.push(group);
    }

    // 3. Si les virages prennent trop de place pour la longueur visée, on les raccourcit proportionnellement
    //    (on garde ~12 segments de droite en moyenne entre deux virages).
    let fixed = specs.reduce((a, g) => a + g.reduce((s, c) => s + len(c), 0), 0);
    const room = target - G.startStraightSegs - G.endStraightMin - specs.length * G.avgGapForFit;
    if (fixed > room && room > 0) {
      const k = Math.max(G.minCornerScale, room / fixed);
      for (const g of specs) {
        for (const c of g) {
          c.enter = Math.max(4, Math.round(c.enter * k));
          c.hold = Math.max(4, Math.round(c.hold * k));
          c.leave = Math.max(4, Math.round(c.leave * k));
        }
      }
      fixed = specs.reduce((a, g) => a + g.reduce((s, c) => s + len(c), 0), 0);
    }

    // 4. Intervalles droits : on répartit la longueur restante
    const leftover = target - G.startStraightSegs - fixed - G.endStraightMin;
    const base = Math.max(G.minGap, leftover / Math.max(1, specs.length));

    let prevTight = false;
    for (const group of specs) {
      const tight = group[0].kind === 'tight';
      let gap = Math.round(base * rng.range(0.55, 1.45));
      gap = Math.max(gap, prevTight ? G.minGapAfterTight : G.minGap);
      if (tight) gap = Math.max(gap, G.minGapBeforeTight);
      straightWithRelief(b, rng, gap, elev);
      for (const c of group) {
        let dy = 0;
        if (c.kind !== 'tight' && c.kind !== 'chicane' && elev > 0 && rng.chance(0.4)) {
          dy = pickDy(rng, b.height, rng.range(0.1, 0.4) * elev, elev);
          if (Math.abs(dy) * G.climbSegsPerM > len(c)) dy = 0; // pente trop forte pour la longueur du virage
        }
        b.section(c.enter, c.hold, c.leave, c.sign * c.mag, dy);
      }
      prevTight = tight;
    }

  }

  // 5. Droite finale : revient à l'altitude 0 pour se raccorder à la ligne droite des stands
  const back = -b.height;
  b.straight(Math.max(G.endStraightMin, Math.ceil(Math.abs(back) * G.climbSegsPerM)), back);
  if (b.segs.length % 2 === 1) b.straight(1);

  const layout: TrackLayout = {
    finishSeg: G.finishSeg,
    pitEntrySeg: G.pitEntrySeg,
    pitLaneStartSeg: G.pitLaneStartSeg,
    pitBoxFirstSeg: G.pitBoxFirstSeg,
    pitBoxCount: G.pitBoxCount,
    pitExitSeg: G.pitExitSeg,
  };
  return new Track(b.segs, layout);
}

function pickKind(rng: Rng, d: number): Kind {
  const w = G.weights;
  const keys = Object.keys(w) as Kind[];
  const ws = keys.map((k) => Math.max(0.05, w[k][0] + w[k][1] * d));
  let r = rng.next() * ws.reduce((a, b) => a + b, 0);
  for (let i = 0; i < keys.length; i++) {
    r -= ws[i];
    if (r <= 0) return keys[i];
  }
  return 'medium';
}

function makeCorner(rng: Rng, kind: Kind, d: number, sign: number): Corner {
  const s = G.corners[kind];
  let mag = rng.range(s.mag[0], s.mag[1]);
  if (kind === 'tight') mag *= 1 + G.tightMagGain * d; // plus serré quand c'est difficile
  return {
    kind, sign, mag,
    enter: rng.int(s.enter[0], s.enter[1]),
    hold: rng.int(s.hold[0], s.hold[1]),
    leave: rng.int(s.leave[0], s.leave[1]),
  };
}

/** Choisit le sens d'un dénivelé en restant dans [-elev × elevationBelow, +elev]. */
function pickDy(rng: Rng, y: number, amp: number, elev: number): number {
  let sign = rng.chance(0.5) ? 1 : -1;
  if (y + sign * amp > elev) sign = -1;
  else if (y + sign * amp < -elev * G.elevationBelow) sign = 1;
  return sign * amp;
}

/** Intervalle droit, éventuellement avec une colline ou une bosse (pente bornée). */
function straightWithRelief(b: TrackBuilder, rng: Rng, gap: number, elev: number): void {
  if (elev > 0 && rng.chance(G.hillChance)) {
    // le dénivelé est borné par la longueur de l'intervalle : une colline ne rallonge pas le circuit
    const amp = Math.min(rng.range(0.35, 1) * elev, gap / G.climbSegsPerM);
    const dy = pickDy(rng, b.height, amp, elev);
    b.straight(Math.max(gap, Math.ceil(Math.abs(dy) * G.climbSegsPerM)), dy);
  } else if (elev > 0 && gap >= 30 && rng.chance(G.bumpChance)) {
    const a = rng.range(G.bumpAmplitude[0], G.bumpAmplitude[1]);
    const half = Math.max(14, Math.ceil(a * G.climbSegsPerM));
    b.straight(half, a);
    b.straight(half, -a);
    if (gap > 2 * half) b.straight(gap - 2 * half);
  } else {
    b.straight(gap);
  }
}

/** Vérifie qu'un circuit est faisable ; renvoie la liste des problèmes (vide = OK). */
export function validateTrack(track: Track): string[] {
  const issues: string[] = [];
  const s = track.segments;
  const n = s.length;
  if (n % 2 !== 0) issues.push('nombre de segments impair');
  if (Math.abs(s[n - 1].y1 - s[0].y0) > 1e-6) issues.push('altitude non bouclée');
  let maxSlope = 0, maxCurve = 0;
  for (const g of s) {
    maxSlope = Math.max(maxSlope, Math.abs(g.y1 - g.y0) / RENDER.segmentLength);
    maxCurve = Math.max(maxCurve, Math.abs(g.curve));
  }
  if (maxSlope > G.maxSlope) issues.push(`pente ${(maxSlope * 100).toFixed(1)} % trop forte`);
  if (maxCurve > G.maxCurve) issues.push(`courbure ${maxCurve.toFixed(3)} trop forte`);
  // la ligne droite des stands doit être plate et droite
  for (let i = 0; i < G.startStraightSegs; i++) {
    if (s[i].curve !== 0 || s[i].y0 !== 0 || s[i].y1 !== 0) {
      issues.push('ligne droite des stands non plate/droite');
      break;
    }
  }
  return issues;
}
