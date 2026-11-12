/** Entrées clavier + tactile fusionnées en un état simple. */
export interface InputState {
  /** -1 (gauche) … +1 (droite) */
  steer: number;
  throttle: boolean;
  brake: boolean;
  /** Touche de debug (F3) basculée */
  debugToggled: boolean;
  /** Touche R pressée (relance la course) */
  restart: boolean;
  /** Touches de debug pressées depuis le dernier pas (actives seulement avec F3) : T/Y/G */
  debugActions: string[];
  /** Actions de stand déclenchées (P : armer l'arrêt, 1 : pneus, 2 : carburant) */
  pitActions: ('pit' | 'tyre' | 'fuel' | 'confirm')[];
}

const KEYS: Record<string, 'left' | 'right' | 'gas' | 'brake'> = {
  ArrowLeft: 'left', KeyA: 'left', KeyQ: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'gas', KeyW: 'gas', KeyZ: 'gas',
  ArrowDown: 'brake', KeyS: 'brake', Space: 'brake',
};

export class Input {
  private down = { left: false, right: false, gas: false, brake: false };
  private debug = false;
  private debugPressed = false;
  private restartPressed = false;
  private actions: string[] = [];
  private pitActions: ('pit' | 'tyre' | 'fuel' | 'confirm')[] = [];

  constructor() {
    window.addEventListener('keydown', (e) => {
      const a = KEYS[e.code];
      if (a) {
        this.down[a] = true;
        e.preventDefault();
      }
      if (e.code === 'KeyR') this.restartPressed = true;
      if (!e.repeat) {
        if (e.code === 'KeyP') this.pitActions.push('pit');
        else if (e.code === 'Digit1' || e.code === 'Numpad1') this.pitActions.push('tyre');
        else if (e.code === 'Digit2' || e.code === 'Numpad2') this.pitActions.push('fuel');
        else if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space') this.pitActions.push('confirm');
      }
      if (this.debug && !e.repeat && ['KeyT', 'KeyY', 'KeyG'].includes(e.code)) this.actions.push(e.code);
      if (e.code === 'F3' && !this.debugPressed) {
        this.debug = !this.debug;
        this.debugPressed = true;
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => {
      const a = KEYS[e.code];
      if (a) this.down[a] = false;
      if (e.code === 'F3') this.debugPressed = false;
    });
    window.addEventListener('blur', () => {
      this.down = { left: false, right: false, gas: false, brake: false };
    });
    // Boutons d'action tactiles (stand)
    document.querySelectorAll<HTMLElement>('.abtn').forEach((el) => {
      el.addEventListener('pointerdown', (e) => {
        this.pitActions.push(el.dataset.act as 'pit' | 'tyre' | 'fuel' | 'confirm');
        e.preventDefault();
      });
    });
    // Boutons tactiles (visibles uniquement sur écrans tactiles, cf. CSS)
    document.querySelectorAll<HTMLElement>('.tbtn').forEach((el) => {
      const act = el.dataset.act as 'left' | 'right' | 'gas' | 'brake';
      const set = (v: boolean) => (e: Event) => {
        this.down[act] = v;
        el.classList.toggle('on', v);
        e.preventDefault();
      };
      el.addEventListener('pointerdown', set(true));
      el.addEventListener('pointerup', set(false));
      el.addEventListener('pointercancel', set(false));
      el.addEventListener('pointerleave', set(false));
    });
  }

  read(): InputState {
    const restart = this.restartPressed;
    this.restartPressed = false;
    const debugActions = this.actions;
    this.actions = [];
    const pitActions = this.pitActions;
    this.pitActions = [];
    return {
      restart,
      debugActions,
      pitActions,
      steer: (this.down.right ? 1 : 0) - (this.down.left ? 1 : 0),
      throttle: this.down.gas,
      brake: this.down.brake,
      debugToggled: this.debug,
    };
  }
}
