import { CAREER } from '../config/balance';
import { ALL_RACES } from '../config/categories';

export interface RaceResult {
  /** Place finale de Babass (1 = vainqueur) et de Kevin */
  position: number;
  kevinPosition: number;
  beatKevin: boolean;
  /** Temps total (s, pénalités comprises) ou null s'il n'a pas terminé */
  time: number | null;
}

export type Ending = 'good' | 'mid' | 'bad';

interface SaveData {
  version: 1;
  results: Record<string, RaceResult>;
  /** Écurie choisie (couleur) */
  team?: string;
  /** Scènes déjà vues (introduction, briefing de catégorie) */
  seen: string[];
}

/** Progression de la carrière, sauvegardée dans le localStorage. */
export class Career {
  results: Record<string, RaceResult> = {};
  seen = new Set<string>();
  /** Couleur d'écurie choisie au début de la carrière (config/teams.ts) */
  team = 'red';

  static hasSave(): boolean {
    try {
      return localStorage.getItem(CAREER.saveKey) !== null;
    } catch {
      return false;
    }
  }

  static load(): Career {
    const c = new Career();
    try {
      const raw = localStorage.getItem(CAREER.saveKey);
      if (raw) {
        const d = JSON.parse(raw) as SaveData;
        if (d.version === 1) {
          c.results = d.results ?? {};
          c.seen = new Set(d.seen ?? []);
          c.team = d.team ?? 'red';
        }
      }
    } catch {
      /* stockage indisponible ou corrompu : on repart de zéro */
    }
    return c;
  }

  static erase(): void {
    try {
      localStorage.removeItem(CAREER.saveKey);
    } catch {
      /* ignoré */
    }
  }

  save(): void {
    try {
      const d: SaveData = { version: 1, results: this.results, team: this.team, seen: [...this.seen] };
      localStorage.setItem(CAREER.saveKey, JSON.stringify(d));
    } catch {
      /* ignoré : la partie reste jouable sans sauvegarde */
    }
  }

  /** Une course est jouable si la précédente a été terminée dans les `unlockPosition` premiers. */
  isUnlocked(index: number): boolean {
    if (index === 0) return true;
    const prev = this.results[ALL_RACES[index - 1].race.id];
    return !!prev && prev.position <= CAREER.unlockPosition;
  }

  /** Première course non encore réussie (jouable) : le curseur de départ du menu. */
  nextRaceIndex(): number {
    for (let i = 0; i < ALL_RACES.length; i++) {
      const r = this.results[ALL_RACES[i].race.id];
      if (!r || r.position > CAREER.unlockPosition) return this.isUnlocked(i) ? i : Math.max(0, i - 1);
    }
    return ALL_RACES.length - 1;
  }

  record(raceId: string, r: RaceResult): void {
    const old = this.results[raceId];
    // on garde le meilleur résultat
    if (!old || r.position < old.position || (r.position === old.position && r.beatKevin && !old.beatKevin)) this.results[raceId] = r;
    this.save();
  }

  /** La carrière est terminée : toutes les courses réussies. */
  get finished(): boolean {
    return ALL_RACES.every((r) => {
      const x = this.results[r.race.id];
      return x && x.position <= CAREER.unlockPosition;
    });
  }

  /** Fin de l'histoire selon la part de courses où Babass a battu Kevin. */
  ending(): Ending {
    const done = ALL_RACES.filter((r) => this.results[r.race.id]);
    if (done.length === 0) return 'bad';
    const wins = done.filter((r) => this.results[r.race.id].beatKevin).length;
    const ratio = wins / done.length;
    return ratio >= CAREER.endingGoodRatio ? 'good' : ratio >= CAREER.endingMidRatio ? 'mid' : 'bad';
  }
}
