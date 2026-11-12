const KEY = 'babass-racing-records-v1';

/** Records du mode Time Attack : meilleur tour par couple circuit + modèle de voiture (localStorage). */
export class Records {
  private best: Record<string, number> = {};

  static load(): Records {
    const r = new Records();
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) r.best = JSON.parse(raw) as Record<string, number>;
    } catch {
      /* stockage indisponible ou corrompu : pas de records */
    }
    return r;
  }

  private key(raceId: string, model: string): string {
    return `${raceId}|${model}`;
  }

  get(raceId: string, model: string): number | null {
    return this.best[this.key(raceId, model)] ?? null;
  }

  /** Enregistre un tour ; renvoie true s'il bat le record (ou s'il n'y en avait pas). */
  submit(raceId: string, model: string, lapTime: number): boolean {
    const k = this.key(raceId, model);
    const old = this.best[k];
    if (old !== undefined && old <= lapTime) return false;
    this.best[k] = lapTime;
    try {
      localStorage.setItem(KEY, JSON.stringify(this.best));
    } catch {
      /* ignoré */
    }
    return true;
  }
}
