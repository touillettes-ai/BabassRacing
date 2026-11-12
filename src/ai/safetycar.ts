import { SC } from '../config/balance';

export type ScState = 'none' | 'pending' | 'out' | 'ending';

/**
 * Safety car : neutralisation de la course après un incident.
 *
 *  - `pending` : l'incident vient d'avoir lieu ; elle est appelée (délai `deployDelayS`) ;
 *  - `out`     : elle roule devant le leader à vitesse réduite ; personne ne dépasse, le peloton se regroupe.
 *                Elle reste au moins `minDurationS`, puis rentre quand le leader repasse la ligne ;
 *  - `ending`  : gyrophares éteints, elle s'éloigne (« feu vert ») puis disparaît.
 * La distance `progress` est la distance parcourue depuis la ligne d'arrivée (comme pour les voitures).
 */
export class SafetyCar {
  state: ScState = 'none';
  /** Distance parcourue depuis la ligne d'arrivée (m, non bouclée) */
  progress = 0;
  speed = 0;
  /** Temps passé dans l'état courant (s) */
  t = 0;
  /** Temps d'affichage du « feu vert » après la fin (s) */
  greenFlash = 0;
  private lastLap = 0;

  get active(): boolean {
    return this.state === 'out';
  }

  reset(): void {
    this.state = 'none';
    this.speed = 0;
    this.t = 0;
    this.greenFlash = 0;
  }

  /** Demande un déploiement (ignoré s'il y en a déjà un). */
  request(): void {
    if (this.state !== 'none') return;
    this.state = 'pending';
    this.t = 0;
  }

  /** Avance d'un pas ; `leaderProgress` = distance du leader, `trackLength` = longueur du circuit. */
  update(dt: number, leaderProgress: number, trackLength: number): void {
    if (this.greenFlash > 0) this.greenFlash -= dt;
    switch (this.state) {
      case 'pending':
        this.t += dt;
        if (this.t >= SC.deployDelayS) {
          this.state = 'out';
          this.t = 0;
          this.progress = leaderProgress + SC.aheadM;
          this.speed = SC.speed;
          this.lastLap = Math.floor(leaderProgress / trackLength);
        }
        break;
      case 'out': {
        this.t += dt;
        this.progress += this.speed * dt;
        const lap = Math.floor(leaderProgress / trackLength);
        // rentre au premier passage du leader sur la ligne après la durée minimale
        if (this.t >= SC.minDurationS && lap > this.lastLap) {
          this.state = 'ending';
          this.t = 0;
          this.greenFlash = 2;
        }
        this.lastLap = lap;
        break;
      }
      case 'ending':
        this.t += dt;
        this.speed = Math.min(SC.exitSpeed, this.speed + 15 * dt);
        this.progress += this.speed * dt;
        if (this.t >= SC.endingS) this.state = 'none';
        break;
      default:
    }
  }

  /** Rangée de la planche : le gyrophare alterne gauche/droite tant qu'elle est « active ». */
  flashRow(clock: number): number {
    return this.state === 'ending' ? 0 : Math.floor(clock / SC.flashPeriodS) % 2;
  }
}

