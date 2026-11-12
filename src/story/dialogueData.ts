import type { Ending } from '../career/career';
import data from './dialogues.json';
import type { Expr, Line, Who } from './scenes';

/**
 * Dialogues du mode carrière, lus dans `dialogues.json` (modifiables avec l'éditeur local `tools/dialogue-editor.html`).
 * Chaque réplique a un personnage, une expression, un texte et une condition `if` facultative (toutes les clés doivent correspondre) :
 *   result : won | podium | noPodium (place du joueur à la course) ·
 *   rival : ahead (le rival est devant le joueur) | behind (le rival est derrière) ·
 *   season : promoted | notPromoted (fin de saison).
 * Variables du texte : {pilote} {ecurie} {kevin} {elle} {marcel} {leo} {cat} {pos} {rival} {n}.
 */
export interface Cond {
  result?: 'won' | 'podium' | 'noPodium';
  rival?: 'ahead' | 'behind';
  season?: 'promoted' | 'notPromoted';
}
interface RawLine {
  who: Who;
  expr: Expr;
  text: string;
  if?: Cond;
}
interface RawScene {
  before?: RawLine[];
  after?: RawLine[];
}
interface Data {
  names: Record<Who, string>;
  intro: RawLine[];
  endings: Record<Ending, RawLine[]>;
  seasonEnd: Record<string, RawLine[]>;
  races: Record<string, RawScene>;
}
const D = data as unknown as Data;

/** Contexte de filtrage d'une scène. */
export interface Context {
  /** Le rival (Kevin) est devant le joueur (course ou classement du championnat) */
  rivalAhead?: boolean;
  /** Place du joueur à la course (1 = victoire) */
  position?: number;
  /** Fin de saison : le joueur monte de catégorie */
  promoted?: boolean;
}

function matches(c: Cond | undefined, ctx: Context): boolean {
  if (!c) return true;
  if (c.rival && ctx.rivalAhead !== undefined && (c.rival === 'ahead') !== ctx.rivalAhead) return false;
  if (c.result && ctx.position !== undefined) {
    const r = ctx.position === 1 ? 'won' : ctx.position <= 3 ? 'podium' : 'noPodium';
    // « podium » = 2ᵉ ou 3ᵉ place (la victoire a sa propre condition)
    if (c.result !== r) return false;
  }
  if (c.season && ctx.promoted !== undefined && (c.season === 'promoted') !== ctx.promoted) return false;
  return true;
}

const toLine = (l: RawLine): Line => ({ who: l.who, expr: l.expr, text: l.text });
const pick = (lines: RawLine[] | undefined, ctx: Context): Line[] => (lines ?? []).filter((l) => matches(l.if, ctx)).map(toLine);

/** Noms affichés des personnages (modifiables dans l'éditeur). */
export const characterNames = (): Record<Who, string> => ({ ...D.names });

export const introLines = (): Line[] => pick(D.intro, {});
export const endingLines = (kind: Ending, ctx: Context = {}): Line[] => pick(D.endings[kind], ctx);
export const beforeLines = (raceId: string, ctx: Context = {}): Line[] => pick(D.races[raceId]?.before, ctx);
export const afterLines = (raceId: string, ctx: Context): Line[] => pick(D.races[raceId]?.after, ctx);
export const seasonEndLines = (catId: string, ctx: Context): Line[] => pick(D.seasonEnd[catId], ctx);

/** Remplace les variables {nom} d'un texte. */
export function fillText(text: string, vars: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}
