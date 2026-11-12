import { RENDER, TRACKGEN } from '../config/balance';
import type { Assets, SpriteDef } from '../core/assets';
import type { Player } from '../sim/player';
import type { RoadSprite, Track } from '../track/segments';

/** Sprite dynamique posé dans le monde (mécanicien, voiture adverse…) : position en m le long de la piste et latérale. */
export interface DynSprite {
  img: CanvasImageSource;
  sx: number; sy: number; sw: number; sh: number; // rectangle source
  ax: number; ay: number; // ancre (px dans la frame)
  ppm: number;
  /** distance le long de la piste (m, modulo la longueur) et décalage latéral (m) */
  z: number;
  x: number;
  flip?: boolean;
}

/** Projection d'un segment (bord proche = 1, bord loin = 2). */
interface Proj {
  visible: boolean;
  sx: number; sy: number; scale: number; // bord proche : centre de la route, y écran, px par mètre
  sx2: number; sy2: number;
  dz1: number; dz2: number; // profondeurs des deux bords (après recoupe sur le plan proche)
  clip: number; // ligne écran sous laquelle le décor de ce segment est masqué (colline devant)
}

/**
 * Rendu pseudo-3D de la route.
 *
 * Principe (cf. README des assets + technique « segments projetés »):
 *  - On parcourt les segments de PROCHE à LOIN. Chacun est projeté : écran = centre + décalage × focal / profondeur.
 *  - Courbes : on accumule la courbure d'un segment à l'autre (`dx += curve`, `x += dx`) — le décalage latéral
 *    de la route croît donc quadratiquement avec la distance, sans aucune image de virage.
 *  - Collines : l'altitude de chaque segment décale sa ligne écran. Un segment dont le sommet n'est pas
 *    au-dessus de ce qui est déjà dessiné est masqué par la crête (test `sy2 >= top`).
 *  - Entre les deux bords d'un segment, 1/profondeur est LINÉAIRE en y écran (vrai pour un plan incliné) :
 *    on interpole donc 1/z ligne par ligne, d'où la profondeur exacte → échelle, centre et ligne de texture.
 *  - Chaque pixel d'une ligne est échantillonné dans la texture de route (27 px = 1 m, 64 lignes = 10 m).
 *  - Voie des stands : 2e texture échantillonnée à droite, décalée de l'axe de la voie (qui bouge dans les rampes).
 *  - Sprites : décor fixe par segment + sprites dynamiques (interpolés dans leur segment grâce à 1/z linéaire).
 */
export class RoadRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly cctx: CanvasRenderingContext2D;
  private readonly img: ImageData;
  private readonly px: Uint32Array;
  private readonly proj: Proj[];
  private fog = 'rgb(200,220,240)';
  // état de la dernière image (pour projeter les sprites dynamiques)
  private camZ = 0;
  private basePct = 0;

  constructor(assets: Assets) {
    const { width: W, height: H } = RENDER;
    this.canvas = document.createElement('canvas');
    this.canvas.width = W;
    this.canvas.height = H;
    this.cctx = this.canvas.getContext('2d')!;
    this.img = this.cctx.createImageData(W, H);
    this.px = new Uint32Array(this.img.data.buffer);
    this.proj = Array.from({ length: RENDER.drawDistance }, () => ({
      visible: false, sx: 0, sy: 0, scale: 0, sx2: 0, sy2: 0, dz1: 1, dz2: 2, clip: 0,
    }));
    this.fog = sampleBottomColor(assets.sky);
  }

  draw(ctx: CanvasRenderingContext2D, a: Assets, track: Track, player: Player, dyn: DynSprite[]): void {
    const R = RENDER;
    const W = R.width, H = R.height;
    const segs = track.segments;
    const n = segs.length;
    const segLen = R.segmentLength;
    const T = R.roadTex;
    const rowsPerMeter = T.bandRows / T.bandMeters;

    // La voiture est dessinée à ~8,3 m devant la caméra (échelle 1 = 36 px/m).
    const carDepth = R.focal / R.carPixelsPerMeter;
    const camZ = (((player.z - carDepth) % track.length) + track.length) % track.length;
    const base = Math.floor(camZ / segLen);
    const basePct = camZ / segLen - base;
    const camY = R.camHeight + track.heightAt(camZ);
    const camX = player.x;
    this.camZ = camZ;
    this.basePct = basePct;

    this.px.fill(0);
    const mips = a.roadMips;
    const pitMips = a.pitMips;
    const ov = a.overlayStart;
    const pitOv = a.pitBoxOverlay;
    const px = this.px;
    // Ligne de départ : surcouche de 10 m centrée sur la ligne d'arrivée
    const startZ0 = track.finishZ - 5;
    // Marquage des boîtes : une surcouche de 10 m par boîte, centrée sur le garage
    const boxZ0 = track.pitBoxZ(0) - 5;
    const boxSpan = TRACKGEN.pitBoxCount * 10;
    const L = track.length;
    const pitGeo = { left: 0, width: 0 };

    let x = 0;
    const cg = R.curveVisualGain;
    let dx = -segs[base % n].curve * cg * basePct;
    let top = H; // première ligne déjà couverte par un segment plus proche

    for (let i = 0; i < R.drawDistance; i++) {
      const idx = base + i;
      const seg = segs[idx % n];
      const p = this.proj[i];
      p.visible = false;

      let dz1 = idx * segLen - camZ;
      const dz2 = dz1 + segLen;
      let rx1 = x - camX;
      const rx2 = x + dx - camX;
      let ry1 = seg.y0 - camY;
      const ry2 = seg.y1 - camY;
      x += dx;
      dx += seg.curve * cg;

      if (dz2 <= R.nearPlane) continue; // entièrement derrière la caméra
      if (dz1 < R.nearPlane) {
        // recoupe le segment sur le plan proche
        const f = (R.nearPlane - dz1) / (dz2 - dz1);
        rx1 += (rx2 - rx1) * f;
        ry1 += (ry2 - ry1) * f;
        dz1 = R.nearPlane;
      }
      const s1 = R.focal / dz1;
      const s2 = R.focal / dz2;
      const sx1 = W / 2 + rx1 * s1;
      const sy1 = R.horizon - ry1 * s1;
      const sx2 = W / 2 + rx2 * s2;
      const sy2 = R.horizon - ry2 * s2;

      p.sx = sx1; p.sy = sy1; p.scale = s1; p.clip = top;
      p.sx2 = sx2; p.sy2 = sy2; p.dz1 = dz1; p.dz2 = dz2;
      if (sy2 >= top || sy1 <= sy2) continue; // masqué par une crête, ou face arrière
      p.visible = true;

      const yTop = Math.max(0, Math.ceil(sy2 - 0.5));
      const yBot = Math.min(top, Math.ceil(sy1 - 0.5));
      if (yTop < yBot) {
        const inv1 = 1 / dz1, inv2 = 1 / dz2;
        const den = sy1 - sy2;
        for (let y = yTop; y < yBot; y++) {
          const t = (sy1 - (y + 0.5)) / den;
          const invz = inv1 + (inv2 - inv1) * t;
          const s = R.focal * invz;
          const cx = sx1 + (sx2 - sx1) * t;
          const zAbs = camZ + 1 / invz;
          // anticrénelage : au loin, une ligne écran couvre `trpr` lignes de texture → on prend la mipmap moyennée
          const zr = 1 / invz;
          const trpr = (rowsPerMeter * zr * zr) / (R.camHeight * R.focal);
          const m = trpr <= 1 ? 0 : Math.min(6, Math.ceil(Math.log2(trpr)));
          const tex = mips[m], pitTex = pitMips[m];
          const v = (Math.floor(zAbs * rowsPerMeter) >> m) & ((T.height >> m) - 1);
          const rowTex = v * T.width;
          const du = T.pxPerMeter / s;
          const u0 = T.centerPx + (0.5 - cx) * du;
          const rowOut = y * W;
          const zw = ((zAbs % L) + L) % L;
          // surcouche de départ : r = floor((z - z0) / 10 m × 64) ; -1 si hors de la ligne
          const dOv = (((zAbs - startZ0) % L) + L) % L;
          const ovRow = dOv < 10 ? Math.floor((dOv / 10) * 64) * T.width : -1;
          // voie des stands : axe latéral à cette distance (NaN = aucune) et ligne de marquage de boîte
          const hasPit = track.pitRoadAt(zw, pitGeo);
          // texture des stands, étirée de vibreur à vibreur (64 → 448 px) sur la largeur courante de la voie :
          // u_pit = 64 + (m − bord gauche) × 384/largeur, avec m = (u_piste − 256)/27  →  u_pit = c0 + u_piste × sc
          const sc = hasPit ? 384 / pitGeo.width / T.pxPerMeter : 0;
          const c0 = hasPit ? 64 - pitGeo.left * (384 / pitGeo.width) - T.centerPx * sc : 0;
          const dBox = zw - boxZ0;
          const boxRow = hasPit && dBox >= 0 && dBox < boxSpan ? Math.floor(((dBox % 10) / 10) * 64) * T.width : -1;
          for (let xx = 0; xx < W; xx++) {
            const uf = u0 + xx * du;
            let u = uf | 0;
            if (u < 0) u = 0; else if (u >= T.width) u = T.width - 1;
            let col = tex[rowTex + u];
            if (ovRow >= 0) col = blend(col, ov[ovRow + u]);
            if (hasPit) {
              // à partir du vibreur gauche de la voie (u = 64 dans sa texture)
              const up = c0 + uf * sc;
              if (up >= 64 && up < T.width) {
                const upi = up | 0;
                col = pitTex[rowTex + upi];
                if (boxRow >= 0) col = blend(col, pitOv[boxRow + upi]);
              }
            }
            px[rowOut + xx] = col;
          }
        }
        top = yTop;
      }
    }

    this.cctx.putImageData(this.img, 0, 0);
    ctx.drawImage(this.canvas, 0, 0);

    // Brume sous l'horizon
    const g = ctx.createLinearGradient(0, R.horizon, 0, R.horizon + R.fog.height);
    g.addColorStop(0, this.fog.replace('rgb', 'rgba').replace(')', `,${R.fog.maxAlpha})`));
    g.addColorStop(1, this.fog.replace('rgb', 'rgba').replace(')', ',0)'));
    ctx.fillStyle = g;
    ctx.fillRect(0, R.horizon, W, R.fog.height);

    this.drawSprites(ctx, a, track, base, dyn, player.z);
  }

  /** Décor fixe + sprites dynamiques situés derrière la voiture (z > z joueur), du plus loin au plus proche. */
  private drawSprites(
    ctx: CanvasRenderingContext2D, a: Assets, track: Track, base: number, dyn: DynSprite[], playerZ: number,
  ): void {
    const R = RENDER;
    const n = track.segments.length;
    // classe les sprites dynamiques par segment projeté
    const buckets = new Map<number, DynSprite[]>();
    for (const d of dyn) {
      if (this.isFront(d, track, playerZ)) continue;
      const i = this.segIndexOf(d, track);
      if (i < 0) continue;
      const b = buckets.get(i);
      if (b) b.push(d); else buckets.set(i, [d]);
    }

    for (let i = R.drawDistance - 1; i >= 0; i--) {
      const p = this.proj[i];
      if (!p.visible) continue;
      if (i >= 1 && i < R.spriteDrawDistance) {
        const seg = track.segments[(base + i) % n];
        for (const sp of seg.sprites) {
          const atlas = a.atlases[sp.atlas];
          const def = atlas?.sprites[sp.name];
          if (!def) continue;
          if (sp.wall) {
            this.drawWall(ctx, atlas.img, def, sp, p);
            continue;
          }
          const k = (p.scale / def.pixels_per_meter) * (sp.scale ?? 1);
          blit(ctx, atlas.img, def.x, def.y, def.w, def.h, def.anchor.x, def.anchor.y, k,
            p.sx + sp.offset * p.scale, p.sy, p.clip, !!sp.flip);
        }
      }
      const list = buckets.get(i);
      if (list) for (const d of list) this.drawDyn(ctx, d, p, track);
    }
  }

  /**
   * Mur à plat le long de la route : la tuile est plaquée sur le segment, colonne par colonne, en perspective.
   * Sur le segment, x écran, y écran et 1/z sont linéaires entre eux : chaque colonne a donc sa profondeur exacte,
   * d'où sa hauteur (échelle) et la colonne de texture à afficher.
   */
  private drawWall(ctx: CanvasRenderingContext2D, img: CanvasImageSource, def: SpriteDef, sp: RoadSprite, p: Proj): void {
    const R = RENDER;
    const mul = sp.scale ?? 1;
    const tileLen = (def.w / def.pixels_per_meter) * mul; // longueur de la tuile le long de la route (m)
    const t0 = (sp.wallOffsetM ?? 0) / tileLen;
    const t1 = t0 + R.segmentLength / tileLen;
    const xa = p.sx + sp.offset * (R.focal / p.dz1);
    const xb = p.sx2 + sp.offset * (R.focal / p.dz2);
    if (Math.abs(xb - xa) < 0.5) return;
    const inv1 = 1 / p.dz1, inv2 = 1 / p.dz2;
    const xMin = Math.max(0, Math.floor(Math.min(xa, xb)));
    const xMax = Math.min(R.width, Math.ceil(Math.max(xa, xb)));
    for (let x = xMin; x < xMax; x++) {
      const t = (x + 0.5 - xa) / (xb - xa);
      if (t < 0 || t > 1) continue;
      const invz = inv1 + (inv2 - inv1) * t;
      const fracZ = (1 / invz - p.dz1) / (p.dz2 - p.dz1); // 0 = bord proche, 1 = bord loin
      const tz = t0 + (t1 - t0) * fracZ; // position le long de la tuile, dans le sens de la route
      const fu = Math.max(0, Math.min(0.9999, sp.offset > 0 ? 1 - tz : tz)); // façade lue de l'arrière vers l'avant côté droit
      const k = (R.focal * invz) / def.pixels_per_meter * mul;
      const sy = p.sy + (p.sy2 - p.sy) * t;
      const dyT = sy - def.anchor.y * k;
      const dh = def.h * k;
      const cut = dyT + dh - p.clip;
      const srcH = cut > 0 ? def.h - cut / k : def.h;
      if (srcH <= 0 || dh < 1) continue;
      ctx.drawImage(img, def.x + Math.floor(fu * def.w), def.y, 1, srcH, x, Math.round(dyT), 1, Math.max(1, Math.round(srcH * k)));
    }
  }

  /** Sprites dynamiques plus proches que la voiture du joueur : à dessiner APRÈS elle. */
  drawFront(ctx: CanvasRenderingContext2D, track: Track, dyn: DynSprite[], playerZ: number): void {
    for (const d of dyn) {
      if (!this.isFront(d, track, playerZ)) continue;
      const i = this.segIndexOf(d, track);
      if (i < 0) continue;
      this.drawDyn(ctx, d, this.proj[i], track);
    }
  }

  private isFront(d: DynSprite, track: Track, playerZ: number): boolean {
    const L = track.length;
    let dz = d.z - playerZ;
    dz = ((dz + L / 2) % L + L) % L - L / 2; // écart signé le plus court
    return dz < -0.02;
  }

  /** Indice (relatif à la caméra) du segment qui contient le sprite, ou -1 s'il est hors champ. */
  private segIndexOf(d: DynSprite, track: Track): number {
    const L = track.length;
    const zRel = (((d.z - this.camZ) % L) + L) % L;
    if (zRel < RENDER.nearPlane) return -1;
    const i = Math.floor((zRel + this.basePct * RENDER.segmentLength) / RENDER.segmentLength);
    if (i >= RENDER.drawDistance || !this.proj[i].visible) return -1;
    return i;
  }

  private drawDyn(ctx: CanvasRenderingContext2D, d: DynSprite, p: Proj, track: Track): void {
    const L = track.length;
    const zRel = (((d.z - this.camZ) % L) + L) % L;
    const invz = 1 / zRel;
    const inv1 = 1 / p.dz1, inv2 = 1 / p.dz2;
    const t = Math.max(0, Math.min(1, (invz - inv1) / (inv2 - inv1)));
    const sx = p.sx + (p.sx2 - p.sx) * t;
    const sy = p.sy + (p.sy2 - p.sy) * t;
    const scale = RENDER.focal * invz;
    blit(ctx, d.img, d.sx, d.sy, d.sw, d.sh, d.ax, d.ay, scale / d.ppm, sx + d.x * scale, sy, p.clip, !!d.flip);
  }
}

/** Mélange alpha d'un pixel de surcouche (ABGR little-endian) sur un pixel opaque. */
function blend(col: number, o: number): number {
  const al = o >>> 24;
  if (al === 0) return col;
  if (al === 255) return o;
  const ia = 255 - al;
  const r = ((o & 255) * al + (col & 255) * ia) / 255;
  const g = (((o >>> 8) & 255) * al + ((col >>> 8) & 255) * ia) / 255;
  const b = (((o >>> 16) & 255) * al + ((col >>> 16) & 255) * ia) / 255;
  return ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

/** Dessine un sprite posé au sol en (sxc, syGround), échelle k (px écran par px sprite), masqué sous la ligne `clip`. */
function blit(
  ctx: CanvasRenderingContext2D, img: CanvasImageSource,
  srcX: number, srcY: number, sw: number, sh: number, ax: number, ay: number,
  k: number, sxc: number, syGround: number, clip: number, flip: boolean,
): void {
  const dw = sw * k;
  const dh = sh * k;
  if (dw > RENDER.width * 8 || dw < 1 || dh < 1) return; // hors écran de toute façon, ou invisible
  const dyT = syGround - ay * k;
  const dxL = sxc - ax * k;
  if (dxL + dw < 0 || dxL > RENDER.width) return;
  // Masque la partie du sprite située sous la ligne de crête (colline devant lui)
  const cut = dyT + dh - clip;
  const srcH = cut > 0 ? sh - cut / k : sh;
  if (srcH <= 0) return;
  const outH = srcH * k;
  if (flip) {
    ctx.save();
    ctx.translate(Math.round(dxL + dw), 0);
    ctx.scale(-1, 1);
    ctx.drawImage(img, srcX, srcY, sw, srcH, 0, Math.round(dyT), Math.round(dw), Math.round(outH));
    ctx.restore();
  } else {
    ctx.drawImage(img, srcX, srcY, sw, srcH, Math.round(dxL), Math.round(dyT), Math.round(dw), Math.round(outH));
  }
}

/** Couleur moyenne de la dernière ligne du ciel (pour que la brume se fonde dans l'horizon). */
function sampleBottomColor(img: HTMLImageElement): string {
  const c = document.createElement('canvas');
  c.width = 1;
  c.height = 1;
  const cx = c.getContext('2d')!;
  cx.drawImage(img, 0, img.height - 2, img.width, 1, 0, 0, 1, 1);
  const d = cx.getImageData(0, 0, 1, 1).data;
  return `rgb(${d[0]},${d[1]},${d[2]})`;
}
