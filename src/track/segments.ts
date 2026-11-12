import { PHYSICS, PIT, RENDER } from '../config/balance';

/** Objet de décor posé au bord d'un segment (atlas + nom de sprite, décalage latéral en mètres). */
export interface RoadSprite {
  atlas: string;
  name: string;
  offset: number;
  flip?: boolean;
  /** Multiplicateur d'échelle (ex. garages 1,25 pour couvrir exactement 10 m) */
  scale?: number;
  /**
   * Mur à plat le long de la route (garages, mur des stands) : la texture est plaquée sur le segment, en perspective,
   * au lieu d'un panneau face à la caméra. `wallOffsetM` = distance (m) du début du segment au début de la tuile.
   */
  wall?: boolean;
  wallOffsetM?: number;
}

/**
 * Un segment = 5 m de route. `curve` : courbure (>0 = virage à droite), en m de décalage latéral
 * par segment² (voir render/road.ts). `y0`/`y1` : altitude (m) au début / à la fin du segment.
 */
export interface Segment {
  index: number;
  curve: number;
  y0: number;
  y1: number;
  sprites: RoadSprite[];
}

/** Repères de la ligne droite des stands (indices de segments). */
export interface TrackLayout {
  finishSeg: number;
  pitEntrySeg: number;
  pitLaneStartSeg: number;
  pitBoxFirstSeg: number;
  pitBoxCount: number;
  pitExitSeg: number;
}

export class Track {
  /** Longueur totale (m). Toujours un multiple de 10 m (période de la texture de route). */
  readonly length: number;
  constructor(public readonly segments: Segment[], public readonly layout: TrackLayout) {
    this.length = segments.length * RENDER.segmentLength;
  }
  get finishZ(): number {
    return this.layout.finishSeg * RENDER.segmentLength;
  }
  // --- Voie des stands (distances en m le long de la piste)
  get pitEntryZ(): number { return this.layout.pitEntrySeg * RENDER.segmentLength; }
  get pitLaneStartZ(): number { return this.layout.pitLaneStartSeg * RENDER.segmentLength; }
  get pitExitZ(): number { return this.layout.pitExitSeg * RENDER.segmentLength; }
  /** Fin de la rampe de sortie (même longueur que la rampe d'entrée) */
  get pitExitEndZ(): number { return this.pitExitZ + (this.pitLaneStartZ - this.pitEntryZ); }
  /** Centre (z) de la boîte k : au centre de son garage (un garage tous les 10 m) */
  pitBoxZ(k: number): number { return (this.layout.pitBoxFirstSeg + 2 * k) * RENDER.segmentLength; }
  /**
   * Géométrie de la voie des stands à la distance z : bord gauche (vibreur) et largeur de vibreur à vibreur.
   * Entrée : un biseau qui s'ouvre depuis le bord de la piste (largeur 0 → pleine) tout en s'écartant ;
   * sortie : le biseau inverse. Renvoie false hors de la zone.
   */
  pitRoadAt(z: number, out: { left: number; width: number }): boolean {
    const zw = ((z % this.length) + this.length) % this.length;
    const e = this.pitEntryZ, l = this.pitLaneStartZ, x = this.pitExitZ, xe = this.pitExitEndZ;
    if (zw < e || zw > xe) return false;
    const smooth = (t: number) => t * t * (3 - 2 * t);
    let axis: number, wf: number;
    if (zw < l) {
      const t = smooth((zw - e) / (l - e));
      axis = PIT.rampAxis + (PIT.laneAxis - PIT.rampAxis) * t;
      wf = t;
    } else if (zw <= x) {
      axis = PIT.laneAxis;
      wf = 1;
    } else {
      const t = smooth((zw - x) / (xe - x));
      axis = PIT.laneAxis + (PIT.rampAxis - PIT.laneAxis) * t;
      wf = 1 - t;
    }
    out.left = axis - PIT.roadWidth / 2;
    out.width = Math.max(0.05, PIT.roadWidth * wf);
    return true;
  }
  private readonly pitTmp = { left: 0, width: 0 };
  /** Axe de la voie des stands ou NaN s'il n'y en a pas (présence de la voie). */
  pitAxisAt(z: number): number {
    return this.pitRoadAt(z, this.pitTmp) ? this.pitTmp.left + PIT.roadWidth / 2 : NaN;
  }
  /**
   * Position latérale d'une voie de la voie des stands à la distance z : suit le biseau.
   * `box` = voie des boîtes (côté garages, où l'on s'arrête) ; sinon voie rapide (côté piste, pour passer).
   */
  pitLaneXAt(z: number, box = true): number {
    if (!this.pitRoadAt(z, this.pitTmp)) return NaN;
    const wf = this.pitTmp.width / PIT.roadWidth;
    return this.pitTmp.left + this.pitTmp.width / 2 + (box ? 1 : -1) * PIT.boxLaneOffset * wf;
  }
  /** Vrai si (z, x) est sur le bitume de la voie des stands (et non sur la piste). */
  onPitRoad(z: number, x: number): boolean {
    if (Math.abs(x) <= PHYSICS.roadHalfWidth) return false;
    if (!this.pitRoadAt(z, this.pitTmp)) return false;
    return x >= this.pitTmp.left && x <= this.pitTmp.left + this.pitTmp.width;
  }
  /** Vrai si (z, x) est sur du bitume : piste, ou voie des stands. Sinon : herbe. */
  isOnRoad(z: number, x: number): boolean {
    if (Math.abs(x) <= PHYSICS.roadHalfWidth) return true;
    if (!this.pitRoadAt(z, this.pitTmp)) return false;
    return x >= this.pitTmp.left && x <= this.pitTmp.left + this.pitTmp.width;
  }
  segmentAt(z: number): Segment {
    const n = this.segments.length;
    const i = Math.floor(z / RENDER.segmentLength);
    return this.segments[((i % n) + n) % n];
  }
  /** Altitude interpolée linéairement dans le segment. */
  heightAt(z: number): number {
    const seg = this.segmentAt(z);
    const t = (((z / RENDER.segmentLength) % 1) + 1) % 1;
    return seg.y0 + (seg.y1 - seg.y0) * t;
  }
  /** Pente (m/m) du segment sous z. */
  slopeAt(z: number): number {
    const s = this.segmentAt(z);
    return (s.y1 - s.y0) / RENDER.segmentLength;
  }
}

const easeIn = (a: number, b: number, p: number) => a + (b - a) * p * p;
const easeInOut = (a: number, b: number, p: number) => a + (b - a) * (-Math.cos(p * Math.PI) / 2 + 0.5);

/**
 * Construit une piste par sections « entrée / plateau / sortie » : la courbure monte en douceur,
 * reste constante, puis redescend — pas de brusque changement de rayon. Le relief est lissé
 * (easeInOut) sur toute la section.
 */
export class TrackBuilder {
  readonly segs: Segment[] = [];
  private y = 0;

  /** curve : courbure du plateau (signée) ; dy : dénivelé total (m) de la section. */
  section(enter: number, hold: number, leave: number, curve: number, dy: number): this {
    const total = enter + hold + leave;
    const startY = this.y;
    for (let n = 0; n < total; n++) {
      let c: number;
      if (n < enter) c = easeIn(0, curve, n / enter);
      else if (n < enter + hold) c = curve;
      else c = easeInOut(curve, 0, (n - enter - hold) / leave);
      this.segs.push({
        index: this.segs.length,
        curve: c,
        y0: startY + easeInOut(0, dy, n / total),
        y1: startY + easeInOut(0, dy, (n + 1) / total),
        sprites: [],
      });
    }
    this.y = startY + dy;
    return this;
  }
  straight(n: number, dy = 0): this {
    return this.section(0, n, 0, 0, dy);
  }
  /** Altitude actuelle. */
  get height(): number {
    return this.y;
  }
}
