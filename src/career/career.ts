import { CAREER, SEASON, UPGRADES } from '../config/balance';
import { ALL_RACES, CATEGORIES } from '../config/categories';

export interface RaceResult {
  /** Place finale du joueur (1 = vainqueur) et de Kevin */
  position: number;
  kevinPosition: number;
  beatKevin: boolean;
  /** Temps total (s, pénalités comprises) ou null s'il n'a pas terminé */
  time: number | null;
}

export type Ending = 'good' | 'mid' | 'bad';
export type UpgradeKey = 'refuel' | 'tyre' | 'engine' | 'clutch' | 'brakes' | 'stratTyre' | 'stratFuel';

/** Améliorations possédées. `carCat` = catégorie à laquelle appartiennent moteur / embrayage / freins (remis à zéro en changeant). */
export interface Upgrades {
  refuel: number;
  tyre: number;
  engine: number;
  clutch: number;
  brakes: number;
  stratTyre: boolean;
  stratFuel: boolean;
  carCat: number;
}

export interface StandingRow {
  id: string;
  name: string;
  points: number;
}

export interface SeasonSummary {
  catIndex: number;
  /** Classement du championnat (1er en tête) */
  table: StandingRow[];
  /** Rang du joueur et de Kevin (1 = premier) */
  rank: number;
  kevinRank: number;
  promoted: boolean;
  /** Le joueur termine devant Kevin au championnat */
  playerAhead: boolean;
  /** Dernière catégorie réussie : la carrière est terminée */
  champion: boolean;
}

interface SaveData {
  version: 2;
  results: Record<string, RaceResult>;
  seen: string[];
  team: string;
  pilot: string;
  teamName: string;
  money: number;
  catUnlocked: number;
  standings: Record<string, Record<string, number>>;
  names: Record<string, string>;
  upgrades: Upgrades;
  complete: boolean;
}

const freshUpgrades = (): Upgrades => ({
  refuel: 0, tyre: 0, engine: 0, clutch: 0, brakes: 0, stratTyre: false, stratFuel: false, carCat: 0,
});

/** Progression de la carrière : résultats, saison en cours (points), argent, améliorations ; sauvegardée dans le localStorage. */
export class Career {
  results: Record<string, RaceResult> = {};
  seen = new Set<string>();
  /** Couleur d'écurie (config/teams.ts), nom du pilote et de l'écurie (variables {pilote} et {ecurie} des dialogues) */
  team = 'red';
  pilot = 'Babass';
  teamName = 'Babass Racing';
  money = 0;
  /** Catégorie en cours (indice) : seules ses courses sont jouables */
  catUnlocked = 0;
  /** Points du championnat par catégorie et par pilote, et noms affichés */
  standings: Record<string, Record<string, number>> = {};
  names: Record<string, string> = {};
  upgrades: Upgrades = freshUpgrades();
  /** Toutes les catégories réussies */
  complete = false;

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
        if (d.version === 2) {
          c.results = d.results ?? {};
          c.seen = new Set(d.seen ?? []);
          c.team = d.team ?? 'red';
          c.pilot = d.pilot ?? 'Babass';
          c.teamName = d.teamName ?? 'Babass Racing';
          c.money = d.money ?? 0;
          c.catUnlocked = d.catUnlocked ?? 0;
          c.standings = d.standings ?? {};
          c.names = d.names ?? {};
          c.upgrades = { ...freshUpgrades(), ...(d.upgrades ?? {}) };
          c.complete = d.complete ?? false;
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
      const d: SaveData = {
        version: 2, results: this.results, seen: [...this.seen], team: this.team, pilot: this.pilot, teamName: this.teamName,
        money: this.money, catUnlocked: this.catUnlocked, standings: this.standings, names: this.names, upgrades: this.upgrades,
        complete: this.complete,
      };
      localStorage.setItem(CAREER.saveKey, JSON.stringify(d));
    } catch {
      /* ignoré : la partie reste jouable sans sauvegarde */
    }
  }

  // ------------------------------------------------------------------ saison
  done(index: number): boolean {
    return !!this.results[ALL_RACES[index].race.id];
  }

  /** Jouable : catégorie en cours, course pas encore courue, et la précédente de la saison terminée. */
  isUnlocked(index: number): boolean {
    const r = ALL_RACES[index];
    if (this.complete || r.catIndex !== this.catUnlocked || this.done(index)) return false;
    return r.raceIndex === 0 || this.done(index - 1);
  }

  /** Prochaine course de la saison en cours (curseur de départ du menu). */
  nextRaceIndex(): number {
    const first = ALL_RACES.findIndex((r) => r.catIndex === this.catUnlocked);
    for (let i = first; i < ALL_RACES.length && ALL_RACES[i].catIndex === this.catUnlocked; i++) if (!this.done(i)) return i;
    return Math.max(0, first);
  }

  /**
   * Enregistre une course : résultat, points du championnat pour TOUS les pilotes (selon leur place) et prime d'argent du joueur.
   * `finalOrder` = classement final de la course (le 1er en tête).
   */
  recordRace(index: number, result: RaceResult, finalOrder: { id: string; name: string }[]): { points: number; prize: number } {
    const info = ALL_RACES[index];
    const table = (this.standings[info.cat.id] ??= {});
    finalOrder.forEach((e, i) => {
      table[e.id] = (table[e.id] ?? 0) + (SEASON.points[i] ?? 0);
      this.names[e.id] = e.name;
    });
    const points = SEASON.points[result.position - 1] ?? 0;
    const base = SEASON.prize[result.position - 1] ?? 0;
    const prize = Math.round((base * (1 + SEASON.prizeCatGrowth * info.catIndex) * (result.beatKevin ? 1 + SEASON.beatKevinBonus : 1)) / 50) * 50;
    this.money += prize;
    this.results[info.race.id] = result;
    this.save();
    return { points, prize };
  }

  /** La saison de la catégorie en cours est terminée (toutes ses courses courues). */
  seasonOver(): boolean {
    return CATEGORIES[this.catUnlocked].races.every((r) => this.results[r.id]);
  }

  /** Classement actuel du championnat de la catégorie `catIndex`. */
  table(catIndex: number): StandingRow[] {
    const pts = this.standings[CATEGORIES[catIndex].id] ?? {};
    return Object.keys(pts)
      .map((id) => ({ id, name: this.names[id] ?? id, points: pts[id] }))
      .sort((a, b) => b.points - a.points || (a.id === 'player' ? 1 : b.id === 'player' ? -1 : 0));
  }

  /**
   * Clôt la saison : promotion si le joueur est dans les `promotionRank` premiers (la voiture repart de zéro dans la catégorie
   * supérieure), sinon la catégorie entière est à rejouer (résultats et points effacés ; argent et améliorations conservés).
   */
  endSeason(): SeasonSummary {
    const catIndex = this.catUnlocked;
    const table = this.table(catIndex);
    const rank = table.findIndex((r) => r.id === 'player') + 1;
    const kevinRank = table.findIndex((r) => r.id === 'kevin') + 1;
    const promoted = rank > 0 && rank <= SEASON.promotionRank;
    const champion = promoted && catIndex === CATEGORIES.length - 1;
    if (promoted) {
      if (champion) this.complete = true;
      else {
        this.catUnlocked = catIndex + 1;
        this.upgrades.engine = this.upgrades.clutch = this.upgrades.brakes = 0;
        this.upgrades.carCat = this.catUnlocked;
      }
    } else {
      for (const r of CATEGORIES[catIndex].races) delete this.results[r.id];
      delete this.standings[CATEGORIES[catIndex].id];
    }
    this.save();
    return { catIndex, table, rank, kevinRank, promoted, playerAhead: rank > 0 && (kevinRank === 0 || rank < kevinRank), champion };
  }

  /** Fin de l'histoire selon la part de courses où le joueur a battu Kevin (courses de la dernière tentative de chaque catégorie). */
  ending(): Ending {
    const done = ALL_RACES.filter((r) => this.results[r.race.id]);
    if (done.length === 0) return 'mid';
    const wins = done.filter((r) => this.results[r.race.id].beatKevin).length;
    const ratio = wins / done.length;
    return ratio >= CAREER.endingGoodRatio ? 'good' : ratio >= CAREER.endingMidRatio ? 'mid' : 'bad';
  }

  // ------------------------------------------------------------------ améliorations
  level(k: UpgradeKey): number {
    const v = this.upgrades[k];
    return typeof v === 'boolean' ? (v ? 1 : 0) : v;
  }
  maxLevel(k: UpgradeKey): number {
    return k === 'stratTyre' || k === 'stratFuel' ? 1 : UPGRADES.maxLevel;
  }
  /** Prix du prochain niveau (€), arrondi à 100. */
  cost(k: UpgradeKey): number {
    const base = UPGRADES.costBase[k];
    return Math.round((base * (1 + UPGRADES.costGrowth * this.level(k)) * (1 + UPGRADES.costCatGrowth * this.catUnlocked)) / 100) * 100;
  }
  /** Les stratèges ne sont proposés qu'à partir du milieu du jeu. */
  locked(k: UpgradeKey): boolean {
    return (k === 'stratTyre' || k === 'stratFuel') && this.catUnlocked < UPGRADES.stratUnlockCat;
  }
  canBuy(k: UpgradeKey): boolean {
    return !this.locked(k) && this.level(k) < this.maxLevel(k) && this.money >= this.cost(k);
  }
  buy(k: UpgradeKey): boolean {
    if (!this.canBuy(k)) return false;
    this.money -= this.cost(k);
    if (k === 'stratTyre' || k === 'stratFuel') this.upgrades[k] = true;
    else this.upgrades[k] += 1;
    this.save();
    return true;
  }
}
