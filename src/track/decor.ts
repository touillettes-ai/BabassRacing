import { PIT } from '../config/balance';
import { Rng } from '../core/rng';
import type { Track } from './segments';

const BILLBOARDS = [
  'billboard_kola_boom', 'billboard_gommax', 'billboard_glisseo', 'billboard_voltix',
  'billboard_cafe_paddock', 'billboard_radio_apex', 'billboard_zenix', 'billboard_air_pixel',
];
const GARAGES = ['garage_red', 'garage_blue', 'garage_black', 'garage_closed'];

/**
 * Pose le décor : arbres, panneaux, chevrons, panneaux de freinage, puis la zone de départ/arrivée
 * (portique, tribunes) et la zone des stands (mur, garages, panneaux).
 * `roadside` = noms de sprites de l'atlas `trees` listés dans levels.json (selon le thème).
 */
export function decorate(track: Track, roadsideAll: string[], seed: number): void {
  // « bush_flowers » : buisson vert et rose qui jure avec le reste du décor, écarté
  const roadside = roadsideAll.filter((n) => n !== 'bush_flowers');
  const rng = new Rng(seed * 104729 + 3);
  const segs = track.segments;
  const n = segs.length;
  const L = track.layout;
  const pitFirst = L.pitEntrySeg;
  const pitLast = L.pitExitSeg + (L.pitLaneStartSeg - L.pitEntrySeg) + 2; // jusqu'à la fin de la rampe de sortie
  // la zone des stands commence juste avant la ligne de départ du circuit : on réserve aussi la fin de la boucle précédente
  const inPitZone = (i: number) => (i >= pitFirst && i <= pitLast) || i >= n - 4;

  for (let i = 0; i < n; i++) {
    const s = segs[i];
    if (i % 3 === 0) {
      const side = rng.chance(0.5) ? -1 : 1;
      // côté droit de la ligne des stands : réservé aux installations
      if (!(inPitZone(i) && side > 0)) {
        s.sprites.push({ atlas: 'trees', name: rng.pick(roadside), offset: side * rng.range(13, 17.5) });
      }
      if (rng.chance(0.55) && !(inPitZone(i) && -side > 0)) {
        s.sprites.push({ atlas: 'trees', name: rng.pick(roadside), offset: -side * rng.range(13, 19) });
      }
    }
    if (i % 45 === 20 && !inPitZone(i)) {
      const side = (i / 45) % 2 < 1 ? 1 : -1;
      s.sprites.push({ atlas: 'billboards', name: rng.pick(BILLBOARDS), offset: side * 17, flip: side < 0 });
    }
    if (Math.abs(s.curve) > 0.05 && i % 3 === 0) {
      const right = s.curve > 0;
      s.sprites.push({ atlas: 'signs', name: right ? 'chevron_right' : 'chevron_left', offset: right ? -11 : 11 });
    }
    // panneau de freinage 200 m avant un virage serré
    const ahead = segs[(i + 40) % n];
    if (Math.abs(ahead.curve) > 0.09 && Math.abs(segs[(i + 39) % n].curve) <= 0.09 && !inPitZone(i)) {
      s.sprites.push({ atlas: 'signs', name: 'brake_200', offset: 11.5 });
    }
  }

  // --- Départ / arrivée
  const f = segs[L.finishSeg];
  f.sprites.push({ atlas: 'gantry_finish', name: 'gantry_finish', offset: 0 });
  // Tribunes : tuiles de 20 m (échelle 1,077 : 260 px / 14 px·m⁻¹ ≈ 18,6 m) plaquées à plat sur 4 segments, côté gauche
  for (let k = 0; k < 3; k++) {
    const s0 = L.finishSeg - 6 + k * 4;
    for (let j = 0; j < 4; j++) {
      segs[s0 + j].sprites.push({ atlas: 'signs', name: 'grandstand', offset: -19, scale: 20 / (260 / 14), wall: true, wallOffsetM: 5 * j });
    }
  }

  // --- Zone des stands (côté droit) : mur, garages, panneaux
  // Mur et garages : tuiles de 10 m plaquées à plat sur 2 segments (moitié de tuile par segment)
  for (let i = L.pitLaneStartSeg; i + 1 <= L.pitExitSeg; i += 2) {
    segs[i].sprites.push({ atlas: 'pit', name: 'pit_wall', offset: PIT.wallOffset, wall: true, wallOffsetM: 0 });
    segs[i + 1].sprites.push({ atlas: 'pit', name: 'pit_wall', offset: PIT.wallOffset, wall: true, wallOffsetM: 5 });
  }
  for (let k = 0; k < L.pitBoxCount; k++) {
    // le garage k est centré sur z = (premier + 2k) × 5 m : il couvre le segment d'avant (1re moitié) et celui-ci (2e moitié)
    const c = L.pitBoxFirstSeg + k * 2;
    const name = GARAGES[k % GARAGES.length];
    segs[c - 1].sprites.push({ atlas: 'pit', name, offset: PIT.garageOffset, scale: 1.25, wall: true, wallOffsetM: 0 });
    segs[c].sprites.push({ atlas: 'pit', name, offset: PIT.garageOffset, scale: 1.25, wall: true, wallOffsetM: 5 });
  }
  segs[L.pitEntrySeg].sprites.push({ atlas: 'signs', name: 'pit_entry', offset: 10 });
  segs[L.pitLaneStartSeg].sprites.push({ atlas: 'signs', name: 'pit_speed_limit', offset: 9 });
  segs[L.pitBoxFirstSeg + 2 * (PIT.playerBox - 2)].sprites.push({ atlas: 'pit', name: 'pit_timing_stand', offset: 25 });
  // « PIT » annoncé sur la droite finale de la boucle précédente
  segs[n - 10].sprites.push({ atlas: 'signs', name: 'pit_entry', offset: 10 });
}
