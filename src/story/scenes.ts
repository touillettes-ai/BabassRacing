import type { Ending } from '../career/career';
import { CAREER } from '../config/balance';
import type { TextKey } from '../i18n/fr';

/** Personnages : id de scène → buste du pack (dialogue/char_*.png). Kevin utilise le buste « Viktor », « Elle » celui de Clara. */
export type Who = 'babass' | 'marcel' | 'kevin' | 'elle' | 'leo';
export const BUST_FILE: Record<Who, string> = {
  babass: 'char_babass', marcel: 'char_marcel', kevin: 'char_viktor', elle: 'char_clara', leo: 'char_leo',
};
export type Expr =
  | 'neutral' | 'happy' | 'laugh' | 'talk' | 'talk_happy' | 'angry' | 'determined' | 'surprised' | 'sad' | 'worried' | 'smug' | 'wink';

export interface Line {
  who: Who;
  expr: Expr;
  /** Clé i18n du texte (variables : {kevin} {elle} {cat} {n}) — ou `text` pour un texte libre issu de dialogues.json */
  key?: TextKey;
  text?: string;
}

const L = (who: Who, expr: Expr, key: string): Line => ({ who, expr, key: key as TextKey });

/**
 * Scènes d'histoire. Pour ajouter une ligne : ajouter son texte dans `i18n/fr.ts` (clé `story.…`)
 * puis une entrée `L(personnage, expression, clé)` dans la scène voulue.
 */
export const INTRO: Line[] = [
  L('marcel', 'happy', 'story.intro.1'),
  L('babass', 'surprised', 'story.intro.2'),
  L('marcel', 'neutral', 'story.intro.3'),
  L('kevin', 'angry', 'story.intro.4'),
  L('babass', 'angry', 'story.intro.5'),
  L('elle', 'happy', 'story.intro.6'),
  L('babass', 'happy', 'story.intro.7'),
];

/** Briefing avant la 1re course d'une catégorie (la réplique de Kevin varie avec `n`). */
export function preScene(n: number): Line[] {
  return [
    L('marcel', 'neutral', 'story.pre.1'),
    L('babass', 'neutral', 'story.pre.2'),
    L('kevin', 'angry', `story.pre.kevin.${(n % 3) + 1}`),
  ];
}

/** Après une course : réaction d'« Elle » (et de Kevin) selon que Babass l'a battu ou non ; `passed` = place suffisante. */
export function postScene(beatKevin: boolean, passed: boolean, n: number): Line[] {
  const v = (n % 3) + 1;
  const lines: Line[] = beatKevin
    ? [L('elle', 'happy', `story.post.win.${v}`), L('babass', 'happy', 'story.post.win.babass'), L('kevin', 'angry', 'story.kevin.lost')]
    : [L('kevin', 'happy', 'story.kevin.won'), L('elle', 'neutral', `story.post.lose.${v}`), L('babass', 'surprised', 'story.post.lose.babass')];
  if (!passed) lines.push(L('marcel', 'neutral', 'story.post.fail'));
  return lines;
}
export const FAIL_VARS = { n: CAREER.unlockPosition };

export function endingScene(kind: Ending): Line[] {
  switch (kind) {
    case 'good':
      return [
        L('marcel', 'happy', 'story.end.good.1'), L('elle', 'happy', 'story.end.good.2'), L('babass', 'surprised', 'story.end.good.3'),
        L('elle', 'happy', 'story.end.good.4'), L('kevin', 'angry', 'story.end.good.5'),
      ];
    case 'mid':
      return [L('marcel', 'neutral', 'story.end.mid.1'), L('elle', 'happy', 'story.end.mid.2'), L('babass', 'neutral', 'story.end.mid.3')];
    default:
      return [
        L('marcel', 'neutral', 'story.end.bad.1'), L('kevin', 'happy', 'story.end.bad.2'),
        L('elle', 'neutral', 'story.end.bad.3'), L('babass', 'angry', 'story.end.bad.4'),
      ];
  }
}
