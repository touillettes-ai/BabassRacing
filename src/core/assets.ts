/** Chargement des assets du pack (images, atlas JSON, textures de route). */
import { RENDER } from '../config/balance';

const BASE = import.meta.env.BASE_URL + 'assets/';

export interface SpriteDef {
  x: number; y: number; w: number; h: number;
  anchor: { x: number; y: number };
  pixels_per_meter: number;
}
export interface Atlas { img: CanvasImageSource; sprites: Record<string, SpriteDef> }

export interface Strip {
  img: HTMLImageElement;
  frame: { w: number; h: number };
  count: number;
  anchor: { x: number; y: number };
  fps: number;
  loop: boolean;
}

export interface CarSpec {
  pixels_per_meter: number;
  frame: { w: number; h: number };
  anchor: { x: number; y: number };
  slope: { frame: { w: number; h: number }; anchor: { x: number; y: number } };
  spin: { frame: { w: number; h: number }; count: number; anchor: { x: number; y: number } };
}
export interface CarSheets {
  id: string;
  spec: CarSpec;
  normal: HTMLImageElement;
  brake: HTMLImageElement;
  up: HTMLImageElement;
  down: HTMLImageElement;
  spin: HTMLImageElement;
  puncture: HTMLImageElement;
  /** Carrosserie abîmée : même format que la planche de virage */
  damaged: HTMLImageElement;
  /** Planche de stand : 2 frames 160×96 (0 = sur vérins, 1 = roues démontées) */
  pit: HTMLImageElement;
}

export interface LevelDef {
  label: string;
  sky_clear: string;
  clouds_far: string;
  clouds_near: string;
  horizon: string;
  road: string;
  atlases: Record<string, string>;
  roadside: string[];
  music: string;
  /** Météo (levels.json) : pluie, éclairs, teinte, flaques… */
  weather?: { overlay?: string; lightning?: string; tint?: number[] };
  /** Marquages au sol posés par le jeu (surcouches `roads/overlay_*.png`), choisis dans circuits.json */
  overlays?: string[];
}

export interface Assets {
  level: LevelDef;
  sky: HTMLImageElement;
  cloudsFar: HTMLImageElement;
  cloudsNear: HTMLImageElement;
  horizon: HTMLImageElement;
  /** Texture de route 512×64, pixels RGBA packés (Uint32) */
  roadTex: Uint32Array;
  /** Surcouche ligne de départ 512×64 (64 lignes = 10 m) */
  overlayStart: Uint32Array;
  /** Mipmaps verticales des textures de route (64, 32, 16… 1 lignes) : évitent le scintillement des bandes au loin */
  roadMips: Uint32Array[];
  pitMips: Uint32Array[];
  /** Feux de départ : 7 frames de 108×31 (off, red1…red5, green) à coller dans le portique */
  startLights: HTMLImageElement;
  gantryStart: HTMLImageElement;
  lightsSlot: { x: number; y: number; w: number; h: number };
  /** Texture de la voie des stands + marquage de boîte (512×64, 64 lignes = 10 m) */
  pitRoadTex: Uint32Array;
  pitBoxOverlay: Uint32Array;
  /** Mécaniciens : 17 frames de 96×84 (planche rouge) */
  mechanic: HTMLImageElement;
  groundColor: string;
  /** Surcouches de marquage choisies (512×64, 64 lignes = 10 m), dans l'ordre de `level.overlays` */
  overlayPix: Uint32Array[];
  /** Effets météo : pluie (4 frames 128×128), éclair (3 frames 96×160), teinte à multiplier */
  weatherFx: { rain: HTMLImageElement | null; lightning: HTMLImageElement | null; tint: number[] | null };
  atlases: Record<string, Atlas>;
  car: CarSheets;
  fx: Record<string, Strip>;
  hud: Atlas;
  needle: HTMLImageElement;
  fontSmall: HTMLImageElement;
  fontBig: HTMLImageElement;
}

export function loadImage(path: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image introuvable : ' + path));
    img.src = BASE + path;
  });
}
export async function loadJSON<T>(path: string): Promise<T> {
  const r = await fetch(BASE + path);
  if (!r.ok) throw new Error('JSON introuvable : ' + path);
  return (await r.json()) as T;
}

async function loadAtlas(png: string): Promise<Atlas> {
  const [img, json] = await Promise.all([
    loadImage(png),
    loadJSON<{ sprites: Record<string, SpriteDef> }>(png.replace(/\.png$/, '.json')),
  ]);
  return { img, sprites: json.sprites };
}

function rgbToCss(c: number[]): string {
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/** Charge toutes les planches d'une voiture (ex. `retro_red`) : virage, frein, pentes, tête-à-queue, crevaison, stand, dégâts. */
export async function loadCarSheets(carId: string): Promise<CarSheets> {
  const model = carId.split('_')[0];
  const [cars, imgs] = await Promise.all([
    loadJSON<Record<string, CarSpec>>('cars/cars.json'),
    Promise.all(['', '_brake', '_up', '_down', '_spin', '_puncture', '_pit', '_damaged'].map((s) => loadImage(`cars/${carId}${s}.png`))),
  ]);
  return {
    id: carId, spec: cars[model],
    normal: imgs[0], brake: imgs[1], up: imgs[2], down: imgs[3], spin: imgs[4], puncture: imgs[5], pit: imgs[6], damaged: imgs[7],
  };
}

/** Coloris disponibles pour un modèle (ex. 'retro' → ['white','red','beige',…]). */
export async function listCarColors(model: string): Promise<string[]> {
  const cars = await loadJSON<Record<string, { sheets?: string[] }>>('cars/cars.json');
  return (cars[model]?.sheets ?? []).map((s) => s.replace(/\.png$/, '').split('_')[1]);
}

export interface SafetyCarAssets {
  /** Planche à 2 rangées × 7 frames (gyrophare gauche / droit) */
  sheet: HTMLImageElement;
  spec: CarSpec;
  /** Dépanneuse (planche de virage 7 frames 160×96, vue de dos, même ancre que la safety car) */
  tow: HTMLImageElement;
  /** Échelle de la dépanneuse (27 ppm : camion plus grand que les voitures) */
  towPpm: number;
}
export async function loadSafetyCar(): Promise<SafetyCarAssets> {
  const [cars, sheet, tow] = await Promise.all([
    loadJSON<Record<string, CarSpec>>('cars/cars.json'),
    loadImage('cars/safetycar_silver.png'),
    loadImage('cars/towtruck_yellow.png'),
  ]);
  return { sheet, spec: cars.safetycar, tow, towPpm: (cars.towtruck as unknown as { pixels_per_meter?: number })?.pixels_per_meter ?? 27 };
}

export interface MarshalAssets {
  img: HTMLImageElement;
  frame: { w: number; h: number };
  count: number;
  anchor: { x: number; y: number };
  fps: number;
}
/** Commissaire au drapeau jaune (4 frames, dessiné pour un poste à droite de la piste). */
export async function loadMarshal(): Promise<MarshalAssets> {
  const [spec, img] = await Promise.all([
    loadJSON<{ frame: { w: number; h: number }; count: number; anchor: { x: number; y: number }; fps: number }>('scenery/marshals.json'),
    loadImage('scenery/marshal_yellow.png'),
  ]);
  return { img, frame: spec.frame, count: spec.count, anchor: spec.anchor, fps: spec.fps };
}

export async function loadAssets(levelId: string, carId: string, override?: Partial<LevelDef>): Promise<Assets> {
  const levels = await loadJSON<Record<string, LevelDef>>('levels.json');
  if (!levels[levelId]) throw new Error('Niveau inconnu : ' + levelId);
  // assets choisis pour le circuit (circuits.json) par-dessus l'ambiance
  const level: LevelDef = { ...levels[levelId], ...override };

  const [roadsJson, fxJson] = await Promise.all([
    loadJSON<{ textures: Record<string, { palette: { shoulder: number[] } }> }>('roads/roads.json'),
    loadJSON<Record<string, Omit<Strip, 'img'>>>('fx/fx.json'),
  ]);

  const atlasNames = Object.keys(level.atlases);
  const fxNames = ['fx_smoke', 'fx_dust', 'fx_grass', 'fx_sparks', 'fx_exhaust_flame'];

  const [sky, cloudsFar, cloudsNear, horizon, roadImg, car, hud, needle, fontSmall, fontBig, atlasList, fxImgs, pit, gantryImg, startJson, overlayImg, pitRoadImg, pitBoxImg, mechanic, startLights] =
    await Promise.all([
      loadImage(level.sky_clear),
      loadImage(level.clouds_far),
      loadImage(level.clouds_near),
      loadImage(level.horizon),
      loadImage(level.road),
      loadCarSheets(carId),
      loadAtlas('hud/hud.png'),
      loadImage('hud/needle.png'),
      loadImage('hud/font_small.png'),
      loadImage('hud/font_digits_big.png'),
      Promise.all(atlasNames.map((n) => loadAtlas(level.atlases[n]))),
      Promise.all(fxNames.map((n) => loadImage(`fx/${n}.png`))),
      loadAtlas('pit/pit_buildings.png'),
      loadImage('start/gantry_start.png'),
      loadJSON<Record<string, { w: number; h: number; anchor: { x: number; y: number }; pixels_per_meter: number; lights_slot?: { x: number; y: number; w: number; h: number } }>>('start/start.json'),
      loadImage('roads/overlay_start_line.png'),
      loadImage('pit/road_pitlane.png'),
      loadImage('pit/overlay_pit_box.png'),
      loadImage('pit/mechanic_red.png'),
      loadImage('start/start_lights.png'),
    ]);

  // Texture de route -> tableau de pixels pour l'échantillonnage ligne par ligne
  const c = document.createElement('canvas');
  c.width = RENDER.roadTex.width;
  c.height = RENDER.roadTex.height;
  const cx = c.getContext('2d')!;
  cx.drawImage(roadImg, 0, 0);
  const roadTex = new Uint32Array(cx.getImageData(0, 0, c.width, c.height).data.buffer.slice(0));
  cx.clearRect(0, 0, c.width, c.height);
  cx.drawImage(overlayImg, 0, 0);
  const overlayStart = new Uint32Array(cx.getImageData(0, 0, c.width, c.height).data.buffer.slice(0));
  const pixels = (img: HTMLImageElement) => {
    cx.clearRect(0, 0, c.width, c.height);
    cx.drawImage(img, 0, 0);
    return new Uint32Array(cx.getImageData(0, 0, c.width, c.height).data.buffer.slice(0));
  };
  const pitRoadTex = pixels(pitRoadImg);
  const pitBoxOverlay = pixels(pitBoxImg);

  const ovImgs = await Promise.all((level.overlays ?? []).map((o) => loadImage(o).catch(() => null)));
  const overlayPix = ovImgs.filter((i): i is HTMLImageElement => !!i).map(pixels);
  const wx = level.weather ?? {};
  const [rain, lightning] = await Promise.all([
    wx.overlay ? loadImage(wx.overlay).catch(() => null) : Promise.resolve(null),
    wx.lightning ? loadImage(wx.lightning).catch(() => null) : Promise.resolve(null),
  ]);
  const weatherFx = { rain, lightning, tint: wx.tint ?? null };

  const roadKey = level.road.split('/').pop()!.replace('.png', '');
  const shoulder = roadsJson.textures[roadKey]?.palette.shoulder ?? [72, 160, 72];

  const atlases: Record<string, Atlas> = {};
  atlasNames.forEach((n, i) => (atlases[n] = atlasList[i]));
  atlases.pit = pit;
  // Portique : image seule, présentée comme un atlas d'un seul sprite
  const g = startJson.gantry_start;
  atlases.gantry_finish = {
    img: gantryImg,
    sprites: { gantry_finish: { x: 0, y: 0, w: g.w, h: g.h, anchor: g.anchor, pixels_per_meter: g.pixels_per_meter } },
  };

  const fx: Record<string, Strip> = {};
  fxNames.forEach((n, i) => (fx[n] = { ...fxJson[n], img: fxImgs[i] }));

  return {
    level, sky, cloudsFar, cloudsNear, horizon, roadTex, overlayStart, pitRoadTex, pitBoxOverlay, mechanic,
    roadMips: buildMips(roadTex), pitMips: buildMips(pitRoadTex),
    startLights, gantryStart: gantryImg, lightsSlot: g.lights_slot ?? { x: 156, y: 62, w: 108, h: 31 },
    groundColor: rgbToCss(shoulder),
    overlayPix, weatherFx,
    atlases,
    car,
    fx, hud, needle, fontSmall, fontBig,
  };
}

/**
 * Mipmaps verticales d'une texture de route 512×64 : chaque niveau moyenne 2 lignes du précédent
 * (64 → 32 → … → 1 ligne). Au loin, une ligne écran couvre plusieurs lignes de texture : sans moyenne,
 * les bandes et pointillés scintillent.
 */
function buildMips(base: Uint32Array): Uint32Array[] {
  const W = RENDER.roadTex.width;
  const mips: Uint32Array[] = [base];
  let rows = RENDER.roadTex.height;
  let prev = base;
  while (rows > 1) {
    rows >>= 1;
    const cur = new Uint32Array(rows * W);
    for (let r = 0; r < rows; r++) {
      for (let x = 0; x < W; x++) {
        const a = prev[(2 * r) * W + x], b = prev[(2 * r + 1) * W + x];
        const ch = (sh: number) => ((((a >>> sh) & 255) + ((b >>> sh) & 255)) >> 1) & 255;
        cur[r * W + x] = ((ch(24) << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)) >>> 0;
      }
    }
    mips.push(cur);
    prev = cur;
  }
  return mips;
}
