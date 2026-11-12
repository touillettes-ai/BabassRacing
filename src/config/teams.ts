/**
 * Couleurs d'écurie proposées au début de la carrière. Chaque modèle de voiture n'existe que dans 6 coloris :
 * on prend le premier coloris disponible parmi les préférences de l'écurie (sinon le premier du modèle).
 */
export interface TeamDef {
  id: string;
  /** Clé i18n du nom */
  nameKey: string;
  /** Coloris préférés (noms de cars.json), par ordre de préférence */
  prefs: string[];
  /** Couleur de repère pour les menus */
  css: string;
  /** Pilote du podium (people/driver_<couleur>) le plus proche */
  driver: 'red' | 'blue' | 'white' | 'green';
}

export const TEAMS: TeamDef[] = [
  { id: 'red', nameKey: 'team.red', prefs: ['red', 'papaya'], css: '#d8302c', driver: 'red' },
  { id: 'blue', nameKey: 'team.blue', prefs: ['blue', 'sky', 'navy'], css: '#2f6fe0', driver: 'blue' },
  { id: 'green', nameKey: 'team.green', prefs: ['green', 'lime', 'olive', 'teal'], css: '#2fb44a', driver: 'green' },
  { id: 'yellow', nameKey: 'team.yellow', prefs: ['yellow', 'sand', 'beige'], css: '#f0c828', driver: 'white' },
  { id: 'orange', nameKey: 'team.orange', prefs: ['orange', 'papaya'], css: '#f08a28', driver: 'red' },
  { id: 'white', nameKey: 'team.white', prefs: ['white', 'silver', 'steel'], css: '#e8ecf4', driver: 'white' },
  { id: 'black', nameKey: 'team.black', prefs: ['black', 'grey'], css: '#303040', driver: 'white' },
  { id: 'purple', nameKey: 'team.purple', prefs: ['purple', 'pink'], css: '#8a4ad8', driver: 'blue' },
];

/** Coloris de `colors` (disponibles pour un modèle) qui correspond à l'écurie `team`. */
export function pickColor(team: string, colors: string[]): string {
  const t = TEAMS.find((x) => x.id === team) ?? TEAMS[0];
  return t.prefs.find((c) => colors.includes(c)) ?? colors[0];
}
