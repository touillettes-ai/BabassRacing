import { CAREER, RENDER } from '../config/balance';
import { t } from '../i18n';
import type { TextKey } from '../i18n/fr';
import { fillText } from '../story/dialogueData';
import type { Line, Who } from '../story/scenes';
import { drawBackdrop, drawBust, drawText, wrap, type UiAssets } from './ui';

/**
 * Scène de dialogue façon visual novel : buste de celui qui parle à gauche (alterne neutre/bouche ouverte pendant
 * que le texte défile), interlocuteur à droite en miroir et assombri, boîte de dialogue avec onglet de nom.
 */
export class Dialogue {
  private idx = 0;
  private chars = 0;
  private clock = 0;
  private other: Who | null = null;
  done = false;

  constructor(private readonly lines: Line[], private readonly vars: Record<string, string | number>) {
    this.enter();
  }

  private get line(): Line {
    return this.lines[this.idx];
  }
  private get text(): string {
    return this.line.text !== undefined ? fillText(this.line.text, this.vars) : t(this.line.key as TextKey, this.vars);
  }
  private enter(): void {
    this.chars = 0;
  }

  update(dt: number): void {
    this.clock += dt;
    if (!this.done) this.chars = Math.min(this.text.length, this.chars + CAREER.textCps * dt);
  }

  /** Entrée / appui : complète la ligne en cours, sinon passe à la suivante. */
  confirm(): void {
    if (this.done) return;
    if (this.chars < this.text.length) {
      this.chars = this.text.length;
      return;
    }
    const cur = this.line.who;
    if (this.idx + 1 >= this.lines.length) {
      this.done = true;
      return;
    }
    // l'ancien locuteur devient l'interlocuteur s'il change
    if (this.lines[this.idx + 1].who !== cur) this.other = cur;
    this.idx++;
    this.enter();
  }

  draw(ctx: CanvasRenderingContext2D, ui: UiAssets): void {
    const W = RENDER.width, H = RENDER.height;
    drawBackdrop(ctx, ui, this.clock * 6);
    const line = this.line;
    const typing = this.chars < this.text.length;
    const talk = typing && Math.floor(this.clock * 8) % 2 === 1;
    const boxY = H - 80;

    if (this.other && this.other !== line.who) drawBust(ctx, ui, this.other, 'neutral', W - 144, boxY - 140, 'right', true);
    drawBust(ctx, ui, line.who, talk ? (line.expr === 'happy' || line.expr === 'laugh' || line.expr === 'wink' ? 'talk_happy' : 'talk') : line.expr, 16, boxY - 140, 'left', false);

    ctx.drawImage(ui.box, 8, boxY);
    drawText(ctx, ui, String(this.vars[`name.${line.who}`] ?? t(`name.${line.who}` as TextKey, this.vars)), 8 + 22, boxY + 2);
    // mise en page du texte COMPLET (les mots ne sautent pas de ligne pendant l'écriture), affichée progressivement
    let left = Math.floor(this.chars);
    wrap(this.text, 53).forEach((l, i) => {
      if (left > 0) drawText(ctx, ui, l.slice(0, left), 8 + 16, boxY + 24 + i * 15);
      left -= l.length + 1;
    });
    if (!typing && Math.floor(this.clock * 2) % 2 === 0) drawText(ctx, ui, t('ui.next'), W - 8 - 16 - 8 * 9, boxY + 58);
  }
}
