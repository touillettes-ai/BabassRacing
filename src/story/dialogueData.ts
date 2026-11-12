import type { Ending } from '../career/career';
import data from './dialogues.json';
import type { Expr, Line, Who } from './scenes';

/**
 * Dialogues du mode carrière, lus dans `dialogues.json` (modifiable avec l'éditeur local `tools/dialogue-editor.html`).
 * Chaque réplique a un personnage, une expression, un texte et une condition `when` :
 *   always · rivalBehind (Babass a battu Kevin) · rivalAhead (Kevin est devant) · passed (qualifié pour la suite) · failed (non qualifié).
 * Variables du texte : {kevin} {elle} {cat} {pos} {rival} {n}.
 */
export type When = 'always' | 'rivalBehind' | 'rivalAhead' | 'passed' | 'failed';

interface RawLine {
  who: Who;
  expr: Expr;
  text: string;
  when?: When;
}
interface RawScene {
  before?: RawLine[];
  after?: RawLine[];
}
interface Data {
  intro: RawLine[];
  endings: Record<Ending, RawLine[]>;
  races: Record<string, RawScene>;
}
const D = data as unknown as Data;

/** Contexte d'une scène d'après-course. */
export interface AfterContext {
  /** Babass a battu Kevin (Kevin derrière) */
  beatKevin: boolean;
  /** Babass est assez bien classé pour continuer */
  passed: boolean;
}

const toLine = (l: RawLine): Line => ({ who: l.who, expr: l.expr, text: l.text });

export const introLines = (): Line[] => D.intro.map(toLine);
export const endingLines = (kind: Ending): Line[] => (D.endings[kind] ?? []).map(toLine);
export const beforeLines = (raceId: string): Line[] => (D.races[raceId]?.before ?? []).map(toLine);

/** Répliques d'après-course filtrées selon que le rival est devant/derrière et que le joueur est qualifié ou non. */
export function afterLines(raceId: string, ctx: AfterContext): Line[] {
  return (D.races[raceId]?.after ?? [])
    .filter((l) => {
      switch (l.when ?? 'always') {
        case 'rivalBehind': return ctx.beatKevin;
        case 'rivalAhead': return !ctx.beatKevin;
        case 'passed': return ctx.passed;
        case 'failed': return !ctx.passed;
        default: return true;
      }
    })
    .map(toLine);
}

/** Remplace les variables {nom} d'un texte. */
export function fillText(text: string, vars: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}
