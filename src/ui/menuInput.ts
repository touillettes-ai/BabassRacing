import { RENDER } from '../config/balance';

export type MenuEvent =
  | { type: 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back' }
  | { type: 'tap'; x: number; y: number };

/** Entrées des menus : clavier (flèches, Entrée/Espace, Échap) et appui/clic sur le canvas (coordonnées internes 480×270). */
export class MenuInput {
  private queue: MenuEvent[] = [];

  constructor(canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
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
