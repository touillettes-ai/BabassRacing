import type { LevelDef } from '../core/assets';
import { LAYOUTS } from '../track/layouts';
import circuits from './circuits.json';

/**
 * Mode Carrière : catégories de course (du moins rapide au plus rapide), 2 à 3 courses chacune.
 * Chaque course a une SEED FIXE : le circuit est toujours le même (rejouabilité). Pour ajouter une catégorie
 * ou une course : ajouter une entrée ici, puis ses textes (`cat.<id>`, `track.name.<n>`) dans `i18n/fr.ts`.
 */
export interface RaceDef {
  id: string;
  /** Clé i18n du nom du circuit */
  nameKey: string;
  /** Circuit inspiré d'un tracé officiel (id de track/layouts.ts) */
  layout: string;
  seed: number;
  lengthM: number;
  corners: number;
  elevation: number;
  difficulty: number;
  laps: number;
  /** Tours et ambiance par défaut (sans réglage dans circuits.json) */
  defaultLaps: number;
  baseLevel: string;
  /** Ambiance (levels.json) : celle du tracé officiel, sauf réglage dans circuits.json */
  level: string;
  /** Assets choisis pour ce circuit (ciel, horizon, route, musique, décor…) : remplacent ceux de l'ambiance */
  assets?: Partial<LevelDef>;
}

/**
 * Réglages par course (nombre de tours, ambiance, assets) : `circuits.json`, modifiable avec la page locale
 * `tools/circuit-editor.html` (npm run dev, puis http://localhost:5173/tools/circuit-editor.html).
 */
export interface RaceOverride extends Partial<LevelDef> {
  laps?: number;
  level?: string;
}
const OVERRIDES = (circuits as { races: Record<string, RaceOverride> }).races;

export interface CategoryDef {
  id: string;
  /** Clé i18n du nom de la catégorie */
  nameKey: string;
  /** Modèle de voiture (cars/cars.json) et coloris du joueur */
  model: string;
  playerColor: string;
  /** Ambiance (levels.json) */
  level: string;
  /** Performances de la voiture de la catégorie (m/s, m/s²) — tous les concurrents en profitent */
  maxSpeed: number;
  accel: number;
  /** Appui aérodynamique / adhérence max (m/s de charge latérale tenue à adhérence 1,0) : les voitures rapides tournent plus vite */
  gripLimit: number;
  /** Stabilité 0..1 (0 = voiture nerveuse, 1 = collée à la route) : poussée en glissade plus faible, tête-à-queue plus tardif */
  stability: number;
  /** Capacité du réservoir (L) : les voitures rapides consomment plus et ont un plus grand réservoir */
  tank: number;
  /** Niveau des adversaires (0..1), voir `AI.difficulty` */
  aiDifficulty: number;
  races: RaceDef[];
}

const LEVELS = ['circuit_jour', 'cote_coucher_soleil', 'ville_nuit', 'montagne_pluie'];

/** [id du modèle, coloris du joueur] dans l'ordre de progression (moins rapide → plus rapide). */
const TIERS: [string, string][] = [
  ['retro', 'red'], ['hothatch', 'red'], ['pickup', 'red'], ['muscle', 'orange'], ['wedge', 'red'],
  ['supercar', 'red'], ['futur', 'red'], ['gt3', 'red'], ['hypercar', 'red'], ['f1', 'red'],
];
/** Nombre de courses par catégorie, tours par course */
const RACES_PER_TIER = [4, 4, 4, 5, 5, 5, 5, 6, 6, 6];
const LAPS = [3, 3, 4, 4, 5, 5, 6, 6, 7, 8];
/**
 * Circuits réels (track/layouts.ts) triés du plus simple au plus complexe : une catégorie prend une « fenêtre » de circuits consécutifs qui glisse vers les
 * plus difficiles à mesure qu'on monte (jamais deux fois le même circuit dans une catégorie ; d'une catégorie à l'autre ils se recoupent).
 */
const LAYOUT_POOL = [
  'redbullring', 'zandvoort', 'hungaroring', 'fuji', 'barcelona', 'sebring', 'bahrain', 'paulricard', 'imola', 'melbourne',
  'montreal', 'nurburgring', 'cota', 'silverstone', 'portimao', 'interlagos', 'monza', 'baku', 'suzuka', 'bathurst',
  'singapore', 'monaco', 'spa', 'lemans',
];
const layoutFor = (tier: number, j: number): string => {
  const n = RACES_PER_TIER[tier];
  const base = Math.floor((tier * (LAYOUT_POOL.length - n)) / (TIERS.length - 1));
  return LAYOUT_POOL[base + j];
};

let trackNumber = 0;

export const CATEGORIES: CategoryDef[] = TIERS.map(([model, playerColor], i) => {
  const f = i / (TIERS.length - 1); // 0 → 1 le long de la carrière
  const races: RaceDef[] = Array.from({ length: RACES_PER_TIER[i] }, (_, j) => {
    trackNumber++;
    const id = `${model}-${j + 1}`;
    const { laps: ovLaps, level: ovLevel, ...ovAssets } = OVERRIDES[id] ?? {};
    const baseLevel = i === TIERS.length - 1 ? 'montagne_pluie' : LEVELS[i % LEVELS.length];
    const defaultLaps = LAPS[i];
    return {
      id,
      nameKey: `circuit.${layoutFor(i, j)}`,
      layout: layoutFor(i, j),
      seed: 100 + trackNumber * 13,
      // longueur de base croissante, ajustée par le caractère du circuit (Monaco court, Le Mans long)
      lengthM: Math.round((2400 + 1400 * f + j * 150) * (LAYOUTS.find((l) => l.id === layoutFor(i, j))?.lengthFactor ?? 1)),
      corners: Math.round(7 + 7 * f + j),
      elevation: Math.round(6 + 16 * f),
      difficulty: Math.min(0.9, 0.15 + 0.65 * f + j * 0.05),
      defaultLaps,
      laps: ovLaps ?? defaultLaps,
      baseLevel,
      level: ovLevel ?? baseLevel,
      assets: Object.keys(ovAssets).length ? (ovAssets as Partial<LevelDef>) : undefined,
    };
  });
  return {
    id: model,
    nameKey: `cat.${model}`,
    model,
    playerColor,
    level: i === TIERS.length - 1 ? 'montagne_pluie' : LEVELS[i % LEVELS.length],
    // de la citadine rétro (~150 km/h) à la F1 (~280 km/h) : l'écart entre catégories est net, en vitesse de pointe,
    // en accélération et en vitesse de passage en virage (appui)
    maxSpeed: Math.round((42 + i * 4) * 10) / 10,
    accel: Math.round((22 + i * 1.6) * 10) / 10,
    // plus on monte en catégorie, plus la voiture « colle » à la route : plus d'appui, et elle décroche moins brutalement
    gripLimit: Math.round((7 + i * 0.55) * 100) / 100,
    // la 1re voiture ne doit pas être la plus nerveuse (trop de têtes-à-queue pour débuter) : base 0,45, puis progression jusqu'à 1
    stability: Math.round((0.45 + 0.55 * f) * 100) / 100,
    tank: 60 + i * 2,
    aiDifficulty: Math.round((0.3 + 0.5 * f) * 100) / 100,
    races,
  };
});

export const TRACK_COUNT = trackNumber;

/** Toutes les courses à plat : [catégorie, course, indice global]. */
export const ALL_RACES: { cat: CategoryDef; race: RaceDef; catIndex: number; raceIndex: number; index: number }[] = [];
CATEGORIES.forEach((cat, catIndex) =>
  cat.races.forEach((race, raceIndex) => ALL_RACES.push({ cat, race, catIndex, raceIndex, index: ALL_RACES.length })),
);
