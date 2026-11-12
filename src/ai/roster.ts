import { AI, PIT } from '../config/balance';
import { listCarColors, loadCarSheets, type CarSheets } from '../core/assets';

export type DriverProfile = (typeof AI.drivers)[number];

export interface RosterEntry {
  profile: DriverProfile;
  sheets: CarSheets;
  boxIndex: number;
}

/**
 * Compose la liste des adversaires : même modèle de voiture que le joueur, un coloris par pilote
 * (préférences du profil, sans doublon, jamais le coloris du joueur). Kevin a la boîte voisine de celle du joueur.
 */
export async function buildRoster(playerCarId: string): Promise<RosterEntry[]> {
  const [model, playerColor] = playerCarId.split('_');
  const colors = await listCarColors(model);
  const used = new Set<string>([playerColor]);
  const n = Math.min(AI.count, AI.drivers.length);

  const picks = AI.drivers.slice(0, n).map((profile, i) => {
    const color = profile.colors.find((c) => colors.includes(c) && !used.has(c)) ?? colors.find((c) => !used.has(c)) ?? colors[0];
    used.add(color);
    const boxIndex = profile.id === 'kevin' ? PIT.rivalBox : AI.otherBoxes[(i - 1) % AI.otherBoxes.length];
    return { profile, color, boxIndex };
  });
  const sheets = await Promise.all(picks.map((p) => loadCarSheets(`${model}_${p.color}`)));
  return picks.map((p, i) => ({ profile: p.profile, sheets: sheets[i], boxIndex: p.boxIndex }));
}
