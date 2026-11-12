import { RACE } from '../config/balance';
import type { InputState } from '../core/input';
import type { Track } from '../track/segments';
import type { Player } from './player';

export type RaceState = 'countdown' | 'racing' | 'finished';

/** Déroulé de la course : décompte, tours, chronos, arrivée. */
export class Race {
  state: RaceState = 'countdown';
  readonly laps: number;
  /** Tour en cours (1…laps) */
  lap = 1;
  /** Temps depuis le feu vert (s) */
  time = 0;
  lapTime = 0;
  bestLap: number | null = null;
  lastLap: number | null = null;
  /** Temps d'horloge (décompte puis affichage de GO) */
  private clock = 0;
  private crossings = 0;
  /** Durée totale des feux rouges + pause aléatoire avant l'extinction (s) */
  private readonly startDelay = RACE.lights * RACE.lightStepS + RACE.lightHoldMin + Math.random() * (RACE.lightHoldMax - RACE.lightHoldMin);
  private prevZ: number;

  constructor(private readonly track: Track, laps = RACE.laps) {
    this.laps = laps;
    this.prevZ = this.startZ();
  }

  /** Position de grille : un peu derrière la ligne d'arrivée. */
  startZ(): number {
    const L = this.track.length;
    return (((this.track.finishZ - RACE.gridOffsetM) % L) + L) % L;
  }

  get lapsLeft(): number {
    return this.laps - this.lap;
  }
  /** Frame des feux de départ (0 = éteints, 1..5 = feux rouges allumés, 6 = vert) */
  get lightsFrame(): number {
    if (this.state === 'countdown') return Math.min(RACE.lights, Math.floor(this.clock / RACE.lightStepS) + 1);
    // départ : les feux rouges s'éteignent et le feu VERT s'allume un instant (frame 6)
    return this.state === 'racing' && this.clock < RACE.greenS ? 6 : 0;
  }
  /** Chiffre du décompte à afficher (3,2,1), 0 = GO, null = rien */
  get countdownDisplay(): number | null {
    if (this.state === 'countdown') return Math.max(1, 3 - Math.floor(this.clock / RACE.countdownStepS));
    if (this.state === 'racing' && this.clock < RACE.goDisplayS) return 0;
    return null;
  }

  /** Neutralise les commandes tant que la course n'est pas lancée / après l'arrivée. */
  controls(input: InputState): InputState {
    if (this.state === 'racing') return input;
    return { ...input, steer: 0, throttle: false, brake: true };
  }

  update(dt: number, player: Player): void {
    if (this.state === 'countdown') {
      this.clock += dt;
      if (this.clock >= this.startDelay) {
        this.state = 'racing';
        this.clock = 0;
      }
      this.prevZ = player.z;
      return;
    }
    if (this.state === 'racing') this.clock += dt;
    if (this.state === 'finished') return;

    this.time += dt;
    this.lapTime += dt;

    const L = this.track.length;
    const fz = this.track.finishZ;
    const a = this.prevZ, b = player.z;
    // gère le bouclage de z (un vrai recul est impossible : on ne considère un bouclage que si z a sauté de > L/2)
    const crossed = a <= b ? a < fz && fz <= b : a - b > L / 2 && (fz > a || fz <= b);
    this.prevZ = b;
    if (!crossed) return;

    this.crossings++;
    if (this.crossings === 1) {
      this.lapTime = 0; // franchissement de la ligne de départ : le 1er tour commence
      return;
    }
    // tour terminé
    this.lastLap = this.lapTime;
    if (this.bestLap === null || this.lapTime < this.bestLap) this.bestLap = this.lapTime;
    this.lapTime = 0;
    if (this.lap >= this.laps) this.state = 'finished';
    else this.lap++;
  }
}
