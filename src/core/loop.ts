import { RENDER } from '../config/balance';

/**
 * Boucle à pas fixe (60 Hz) : la simulation avance par pas de `fixedDt`,
 * le rendu est appelé une fois par frame d'affichage.
 */
export function startLoop(update: (dt: number) => void, render: (frameMs: number) => void): void {
  let last = performance.now();
  let acc = 0;
  const dt = RENDER.fixedDt;
  const frame = (now: number) => {
    const frameTime = Math.min(0.25, (now - last) / 1000); // évite la spirale après un onglet en veille
    last = now;
    acc += frameTime;
    while (acc >= dt) {
      update(dt);
      acc -= dt;
    }
    render(frameTime * 1000);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
