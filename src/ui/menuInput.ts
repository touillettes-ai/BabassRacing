import { RENDER } from '../config/balance';

export type MenuEvent =
  | { type: 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back' }
  | { type: 'char'; ch: string }
  | { type: 'tap'; x: number; y: number };

/** Entrées des menus : clavier (flèches, Entrée/Espace, Échap) et appui/clic sur le canvas (coordonnées internes 480×270). */
export class MenuInput {
  private queue: MenuEvent[] = [];
  /** Saisie de texte : les lettres, Espace et Retour arrière deviennent des évènements `char` (« \b » = effacer) */
  typing = false;

  constructor(canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      if (e.repeat && !(this.typing && e.code === 'Backspace')) return;
      if (this.typing) {
        if (e.code === 'Enter' || e.code === 'NumpadEnter') this.queue.push({ type: 'confirm' });
        else if (e.code === 'Escape') this.queue.push({ type: 'back' });
        else if (e.code === 'ArrowUp') this.queue.push({ type: 'up' });
        else if (e.code === 'ArrowDown' || e.code === 'Tab') {
          this.queue.push({ type: 'down' });
          e.preventDefault();
        } else if (e.code === 'Backspace') this.queue.push({ type: 'char', ch: '\b' });
        else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
          this.queue.push({ type: 'char', ch: e.key });
          if (e.code === 'Space') e.preventDefault();
        }
        return;
      }
      const map: Record<string, MenuEvent['type']> = {
        ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', ArrowRight: 'right',
        Enter: 'confirm', NumpadEnter: 'confirm', Space: 'confirm', Escape: 'back', Backspace: 'back',
      };
      const t = map[e.code];
      if (t) this.queue.push({ type: t } as MenuEvent);
    });
    canvas.addEventListener('pointerdown', (e) => {
      const r = canvas.getBoundingClientRect();
      this.queue.push({
        type: 'tap',
        x: ((e.clientX - r.left) / r.width) * RENDER.width,
        y: ((e.clientY - r.top) / r.height) * RENDER.height,
      });
    });
  }

  /** Évènements reçus depuis le dernier appel. */
  poll(): MenuEvent[] {
    const q = this.queue;
    this.queue = [];
    return q;
  }
}
