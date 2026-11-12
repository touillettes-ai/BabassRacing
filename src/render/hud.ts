import { FUEL, HUD, MINIMAP, PIT, RENDER, SC, TOW, TYRES, WEATHER } from '../config/balance';
import type { Assets } from '../core/assets';
import { formatTime, t } from '../i18n';
import type { Player } from '../sim/player';
import type { Field } from '../sim/field';
import type { PitController } from '../sim/pit';
import type { Race } from '../sim/race';
import type { Minimap } from '../track/minimap';

/** Texte bitmap (polices du pack : hud/fonts.json). */
function text(
  ctx: CanvasRenderingContext2D, img: HTMLImageElement, str: string, x: number, y: number,
  cell: { w: number; h: number }, columns: number, indexOf: (ch: string) => number,
): void {
  const adv = cell.w - 1;
  for (let i = 0; i < str.length; i++) {
    const idx = indexOf(str[i]);
    if (idx < 0) continue;
    ctx.drawImage(img, (idx % columns) * cell.w, Math.floor(idx / columns) * cell.h, cell.w, cell.h, x + i * adv, y, cell.w, cell.h);
  }
}

const BIG_CHARS = "0123456789:.'/ ";

export function drawSmall(ctx: CanvasRenderingContext2D, a: Assets, s: string, x: number, y: number): void {
  // police petite : ASCII 32..95, 16 colonnes, majuscules uniquement
  text(ctx, a.fontSmall, s.toUpperCase(), x, y, { w: 10, h: 14 }, 16, (ch) => {
    const c = ch.charCodeAt(0) - 32;
    return c >= 0 && c < 64 ? c : -1;
  });
}
export function drawBig(ctx: CanvasRenderingContext2D, a: Assets, s: string, x: number, y: number): void {
  text(ctx, a.fontBig, s, x, y, { w: 20, h: 30 }, 15, (ch) => BIG_CHARS.indexOf(ch));
}

function sprite(ctx: CanvasRenderingContext2D, a: Assets, name: string, x: number, y: number): void {
  const d = a.hud.sprites[name];
  ctx.drawImage(a.hud.img, d.x, d.y, d.w, d.h, x, y, d.w, d.h);
}
function needle(ctx: CanvasRenderingContext2D, a: Assets, value: number, max: number, x: number, y: number, size = 96): void {
  const f = Math.max(0, Math.min(27, Math.round((value / max) * 27)));
  ctx.drawImage(a.needle, f * 96, 0, 96, 96, x, y, size, size);
}

/** HUD : compteurs, tours, chronos, mini-carte. (Carburant, pneus, position : jalons suivants.) */
export function drawHud(
  ctx: CanvasRenderingContext2D, a: Assets, p: Player, race: Race, map: Minimap, pit: PitController, field: Field,
  debug: string | null, ta: { record: number | null; flash: boolean } = { record: null, flash: false },
): void {
  const W = RENDER.width, H = RENDER.height;
  const kmh = p.speed * 3.6;

  // compteur de vitesse unique, réduit (le compte-tours est supprimé)
  const dial = HUD.dialSize;
  const dx = W - dial - 4, dy = H - dial - 4;
  const d0 = a.hud.sprites.dial_speed;
  ctx.drawImage(a.hud.img, d0.x, d0.y, d0.w, d0.h, dx, dy, dial, dial);
  needle(ctx, a, kmh, 320, dx, dy, dial);

  // colonne gauche : rapport, tours, position
  drawSmall(ctx, a, t('hud.gear', { n: p.gear }), 8, 8);
  const solo = field.entries.length === 1; // time attack : seul en piste, tours illimités
  if (solo) {
    drawSmall(ctx, a, t('hud.lapSolo', { n: race.lap }), 8, 24);
  } else {
    drawSmall(ctx, a, t('hud.lap', { n: race.lap, total: race.laps }), 8, 24);
    drawSmall(ctx, a, t('hud.lapsLeft', { n: race.lapsLeft }), 8, 38);
    drawSmall(ctx, a, t('hud.pos', { n: field.playerPosition, total: field.entries.length }), 8, 52);
  }
  if (ta.record !== null) {
    const s = t('hud.record', { t: formatTime(ta.record) });
    drawSmall(ctx, a, s, Math.round(W / 2 - (s.length * 9) / 2), 82);
  }
  if (ta.flash && Math.floor(performance.now() / 300) % 2 === 0) {
    const s = t('ta.newRecord');
    drawSmall(ctx, a, s, Math.round(W / 2 - (s.length * 9) / 2), 100);
  }

  // chrono du tour (haut centre) + meilleur / dernier
  const lt = formatTime(race.lapTime);
  drawBig(ctx, a, lt, Math.round(W / 2 - (lt.length * 19) / 2), 6);
  if (race.bestLap !== null) {
    const s = t('hud.best', { t: formatTime(race.bestLap) });
    drawSmall(ctx, a, s, Math.round(W / 2 - (s.length * 9) / 2), 40);
  }
  if (race.lastLap !== null) {
    const s = t('hud.last', { t: formatTime(race.lastLap) });
    drawSmall(ctx, a, s, Math.round(W / 2 - (s.length * 9) / 2), 54);
  }
  {
    const s = t('hud.total', { t: formatTime(race.time) });
    drawSmall(ctx, a, s, Math.round(W / 2 - (s.length * 9) / 2), 68);
  }

  // mini-carte (haut droite)
  const mx = W - MINIMAP.size - 6, my = 6;
  ctx.drawImage(map.canvas, mx, my);
  const dot = (name: string, z: number) => {
    const pt = map.pointAt(z);
    const d = a.hud.sprites[name];
    ctx.drawImage(a.hud.img, d.x, d.y, d.w, d.h, mx + pt.x - 4, my + pt.y - 4, d.w, d.h);
  };
  for (const e of field.entries) {
    if (e.isPlayer) continue;
    if (e.id === 'kevin') dot('map_dot_rival', e.car.z);
    else {
      const pt = map.pointAt(e.car.z);
      ctx.fillStyle = '#c8cce0';
      ctx.fillRect(mx + pt.x - 1, my + pt.y - 1, 3, 3);
    }
  }
  if (field.sc.state === 'out' || field.sc.state === 'ending') {
    const L = field.track.length;
    dot('map_dot_safety', (((field.track.finishZ + field.sc.progress) % L) + L) % L);
  }
  dot('map_dot_player', p.z);

  // classement en direct (sous la mini-carte)
  field.ranking.forEach((e, i) => {
    const s = `${i + 1}${e.isPlayer ? '>' : ' '}${e.name}`;
    drawSmall(ctx, a, s, mx, my + MINIMAP.size + 4 + i * 13);
  });

  drawFuelAndTyres(ctx, a, p, H, field.track.length);
  drawPit(ctx, a, p, pit, W);

  // alertes clignotantes (la plus grave d'abord)
  const alert = p.tyres.anyPunctured ? 'alert.puncture' : p.dry ? 'alert.dry'
    : p.fuel.low ? 'alert.fuelLow' : p.tyres.avgWear >= TYRES.warnWear ? 'alert.tyres' : null;
  if (alert && Math.floor(performance.now() / 350) % 2 === 0) {
    const s = t(alert);
    drawSmall(ctx, a, s, Math.round(W / 2 - (s.length * 9) / 2), 150);
  }

  if (WEATHER.wetness > 0.3) drawSmall(ctx, a, t('hud.wet'), 8, 80);
  if (p.draft > 0.15 && race.state === 'racing') drawSmall(ctx, a, t('hud.draft'), 8, 66);
  drawPaceNote(ctx, a, p, field);
  drawSafetyCar(ctx, a, field, W);
  drawAutoMessages(ctx, a, field, W);
  if (pit.menuOpen) drawPitMenu(ctx, a, p, pit, race, field, W);
  if (race.state === 'finished') drawResults(ctx, a, field, W);

  if (debug) drawSmall(ctx, a, debug, W - debug.length * 9 - 6, MINIMAP.size + 100);
}

function gaugeColor(frac: number): string {
  return frac > HUD.gaugeGreen ? '#46d246' : frac > HUD.gaugeYellow ? '#f0c828' : '#e03c3c';
}

/** Jauge de carburant (barre du pack, réduite) + tours d'essence restants ; 4 petites jauges de pneus. */
function drawFuelAndTyres(ctx: CanvasRenderingContext2D, a: Assets, p: Player, H: number, L: number): void {
  const k = HUD.gaugeScale;
  const fy = H - 52;
  sprite(ctx, a, 'icon_fuel', 8, fy - 2);
  const bf = a.hud.sprites.bar_frame;
  ctx.drawImage(a.hud.img, bf.x, bf.y, bf.w, bf.h, 24, fy, Math.round(bf.w * k), Math.round(bf.h * k));
  const frac = p.fuel.fraction;
  const fillName = frac > HUD.gaugeGreen ? 'bar_fill_green' : frac > HUD.gaugeYellow ? 'bar_fill_yellow' : 'bar_fill_red';
  const f = a.hud.sprites[fillName];
  const w = Math.round(f.w * frac);
  if (w > 0) ctx.drawImage(a.hud.img, f.x, f.y, w, f.h, 24 + Math.round(3 * k), fy + Math.round(3 * k), Math.round(w * k), Math.round(f.h * k));
  // tours d'essence restants (au lieu des litres)
  drawSmall(ctx, a, t('hud.fuelLaps', { n: p.fuelLaps(L).toFixed(1) }), 24 + Math.round(bf.w * k) + 4, fy - 1);

  const ty = H - 36;
  sprite(ctx, a, 'icon_tyre', 8, ty);
  const gx = [24, 33], gy = [ty, ty + 15];
  for (let i = 0; i < 4; i++) {
    const x = gx[i % 2], y = gy[i < 2 ? 0 : 1];
    const left = 1 - p.tyres.wear[i];
    ctx.fillStyle = '#05060f';
    ctx.fillRect(x - 1, y - 1, 9, 15);
    ctx.fillStyle = '#2a2d44';
    ctx.fillRect(x, y, 7, 13);
    const h = Math.round(13 * left);
    ctx.fillStyle = p.tyres.punctured[i] ? '#ff2020' : gaugeColor(left);
    ctx.fillRect(x, y + 13 - h, 7, h);
  }
  const name = t(`tyre.${p.tyres.compound}` as never);
  drawSmall(ctx, a, name, 46, ty);
  drawSmall(ctx, a, `${p.tyreLaps(L).toFixed(1)} T`, 46, ty + 14);
}

/** Panneau de stratégie (choix pneus / carburant), indicateurs de la voie des stands et du service. */
function drawPit(ctx: CanvasRenderingContext2D, a: Assets, p: Player, pit: PitController, W: number): void {
  const cx = (s: string) => Math.round(W / 2 - (s.length * 9) / 2);
  const blink = Math.floor(performance.now() / 350) % 2 === 0;

  // En course : seul l'état de l'arrêt (armé ou non) est rappelé ; pneus et essence se règlent à l'entrée dans la voie des stands
  if (pit.phase === 'none') {
    drawSmall(ctx, a, t(pit.intent ? 'pit.requested' : 'pit.request'), 8, 108);
    if (pit.intent) sprite(ctx, a, 'banner_pit', Math.round(W / 2 - 75), 140);
  } else if (pit.phase !== 'service') {
    sprite(ctx, a, 'banner_pit', Math.round(W / 2 - 75), 140);
  }

  if (p.speedCap !== null && pit.phase !== 'service' && blink) {
    const s = t('pit.limiter', { n: Math.round(PIT.speedLimit * 3.6) });
    drawSmall(ctx, a, s, cx(s), 126);
  }
  const ed = pit.entryDistance(p);
  if (ed !== null && blink) {
    const s = t('pit.entryIn', { n: Math.ceil(ed / 10) * 10 });
    drawSmall(ctx, a, s, cx(s), 126);
    if (p.speed > PIT.speedLimit * 1.4) {
      const s2 = t('pit.slowDown', { n: Math.round(PIT.speedLimit * 3.6) });
      drawSmall(ctx, a, s2, cx(s2), 140);
    }
  }
  const d = pit.boxDistance(p);
  if (d !== null) {
    const s = t('pit.box', { n: Math.ceil(d) });
    drawSmall(ctx, a, s, cx(s), 140);
  }
  if (pit.missed && pit.phase !== 'none' && blink) {
    const s = t('pit.missed');
    drawSmall(ctx, a, s, cx(s), 154);
  }

  // Service en cours : compte à rebours + détail
  if (pit.phase === 'service') {
    const rem = pit.remainingS.toFixed(1);
    drawBig(ctx, a, rem, Math.round(W / 2 - (rem.length * 19) / 2), 100);
    const s0 = t('pit.service');
    drawSmall(ctx, a, s0, cx(s0), 134);
    if (pit.crew?.plan.tyres) {
      const s = t('pit.serviceTyres', { v: pit.crew.tyresFitted ? 'OK' : '...' });
      drawSmall(ctx, a, s, cx(s), 150);
    }
    if (pit.crew && pit.crew.plan.fuelSeconds > 0) {
      const s = t('pit.serviceFuel', { v: Math.round(p.fuel.level) + '/' + FUEL.capacity });
      drawSmall(ctx, a, s, cx(s), 164);
    }
  } else if (pit.goFlash > 0 && blink) {
    sprite(ctx, a, 'countdown_go', Math.round(W / 2 - 55), 100);
  }
}

/** Bannière « safety car », consigne de ne pas dépasser, feu vert, pénalité. */
function drawSafetyCar(ctx: CanvasRenderingContext2D, a: Assets, field: Field, W: number): void {
  const cx = (s: string) => Math.round(W / 2 - (s.length * 9) / 2);
  const blink = Math.floor(performance.now() / 350) % 2 === 0;
  const sc = field.sc;
  if (sc.state === 'out' || sc.state === 'pending') {
    if (blink || sc.state === 'out') sprite(ctx, a, 'banner_safety_car', Math.round(W / 2 - 75), 84);
    if (sc.state === 'out' && blink) drawSmall(ctx, a, t('sc.noOvertake'), cx(t('sc.noOvertake')), 112);
  } else if (sc.state === 'ending' && blink) {
    drawSmall(ctx, a, t('sc.ending'), cx(t('sc.ending')), 112);
  }
  // cause de la neutralisation
  if ((sc.state === 'out' || sc.state === 'pending') && field.scCause) {
    const s = t('sc.cause', { name: field.scCause.name });
    drawSmall(ctx, a, s, cx(s), 126);
  }
  if (sc.greenFlash > 0 && blink) drawSmall(ctx, a, t('sc.green'), cx(t('sc.green')), 140);
  if (field.penaltyFlash > 0 && blink) {
    const s = t('sc.penalty', { n: SC.overtakePenaltyS });
    drawSmall(ctx, a, s, cx(s), 140);
  }
}

/** Classement final (provisoire : l'écran de résultats complet arrive au jalon 6). */
function drawResults(ctx: CanvasRenderingContext2D, a: Assets, field: Field, W: number): void {
  const rows = field.ranking;
  const w = 200, h = 24 + rows.length * 13;
  const x = Math.round(W / 2 - w / 2), y = 92;
  ctx.fillStyle = 'rgba(8,10,24,0.82)';
  ctx.fillRect(x, y, w, h);
  const title = t('result.title');
  drawSmall(ctx, a, title, Math.round(W / 2 - (title.length * 9) / 2), y + 4);
  const best = rows[0]?.finishTime ?? null;
  rows.forEach((e, i) => {
    let time = t('result.dnf');
    if (e.finishTime !== null) time = i === 0 || best === null ? formatTime(e.finishTime) : '+' + (e.finishTime - best).toFixed(2);
    const name = (e.isPlayer ? '>' : ' ') + e.name;
    drawSmall(ctx, a, `${i + 1}${name.padEnd(8)}${time}`, x + 6, y + 20 + i * 13);
  });
  if (field.penaltyS > 0) drawSmall(ctx, a, t('sc.penalty', { n: field.penaltyS }), x + 6, y + 22 + rows.length * 13);
}

/** Menu de l'arrêt au stand (jeu en pause) : tours que permettent l'essence et les pneus choisis. */
function drawPitMenu(
  ctx: CanvasRenderingContext2D, a: Assets, p: Player, pit: PitController, race: Race, field: Field, W: number,
): void {
  const L = field.track.length;
  const lines: string[] = [];
  const raceLeft = Math.max(0, (field.laps * L - field.player.progress) / L);
  const est = pit.estimate(p);

  const tyreName = pit.plan.tyre === 'none' ? t('pit.tyreNone') : t(`tyre.${pit.plan.tyre}` as never);
  const tyreLaps = pit.plan.tyre === 'none' ? p.tyreLaps(L) : p.tyreLaps(L, pit.plan.tyre, 0);
  const target = Math.max(p.fuel.level, PIT.fuelOptions[pit.plan.fuelStep] * FUEL.capacity);
  const fuelAfter = p.fuelLaps(L, target);
  const fuelName = pit.plan.fuelStep === 0 ? t('pit.fuelNone') : `${Math.round(PIT.fuelOptions[pit.plan.fuelStep] * 100)}%`;
  const enough = (n: number) => (n >= raceLeft ? t('menu.enough') : t('menu.short'));

  lines.push(t('menu.race', { n: raceLeft.toFixed(1) }));
  lines.push(t('menu.fuelNow', { n: p.fuelLaps(L).toFixed(1) }));
  lines.push('');
  lines.push(t('menu.tyre', { v: tyreName }));
  lines.push(t('menu.tyreLaps', { n: tyreLaps.toFixed(1) }) + '  ' + enough(tyreLaps));
  lines.push(t('menu.fuel', { v: fuelName }));
  lines.push(t('menu.fuelLaps', { n: fuelAfter.toFixed(1) }) + '  ' + enough(fuelAfter));
  lines.push('');
  lines.push(t('menu.estimate', { s: est.totalS.toFixed(1) }));
  lines.push(t('menu.ok'));

  const w = 300, h = 28 + lines.length * 14;
  const x = Math.round(W / 2 - w / 2), y = 60;
  ctx.fillStyle = 'rgba(8,10,24,0.88)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#e8ecff';
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  const title = t('menu.title');
  drawSmall(ctx, a, title, Math.round(W / 2 - (title.length * 9) / 2), y + 6);
  lines.forEach((s, i) => drawSmall(ctx, a, s, x + 8, y + 24 + i * 14));
  void race;
}

/** Pilote auto sous safety car, dépanneuse. */
function drawAutoMessages(ctx: CanvasRenderingContext2D, a: Assets, field: Field, W: number): void {
  const cx = (s: string) => Math.round(W / 2 - (s.length * 9) / 2);
  const blink = Math.floor(performance.now() / 350) % 2 === 0;
  if (field.towActive && blink) {
    const s = t('tow.msg', { n: TOW.penaltyS });
    drawSmall(ctx, a, s, cx(s), 140);
  } else if (field.playerAuto && blink) {
    const s = t('auto.sc');
    drawSmall(ctx, a, s, cx(s), 140);
  }
}

/**
 * Annonce du prochain virage (comme un copilote de rallye) : pictogramme coudé, sens, sévérité et distance.
 * Affichée pour les virages marqués dans les ~300 m qui viennent ; aide à voir le virage arriver et à décider du freinage.
 */
function drawPaceNote(ctx: CanvasRenderingContext2D, a: Assets, p: Player, field: Field): void {
  const T = field.track;
  const seg = RENDER.segmentLength;
  let found = -1;
  for (let j = 1; j < 64; j++) {
    if (Math.abs(T.segmentAt(p.z + j * seg).curve) > 0.04) {
      found = j;
      break;
    }
  }
  if (found < 0 || p.spinning || p.hold) return;
  // sévérité et sens sur les 14 segments suivants
  let cmax = 0, sign = 0;
  for (let j = found; j < found + 14; j++) {
    const c = T.segmentAt(p.z + j * seg).curve;
    if (Math.abs(c) > Math.abs(cmax)) cmax = c;
  }
  sign = Math.sign(cmax);
  const m = Math.abs(cmax);
  const k = m < 0.05 ? 'g' : m < 0.09 ? 'm' : m < 0.13 ? 't' : 'h';
  const dist = Math.max(0, Math.round((found * seg - 8) / 10) * 10);
  const x0 = 12, y0 = 150;
  // pictogramme : tronçon droit puis coude (de plus en plus fermé), en pixels pleins
  const bend = { g: 0.45, m: 0.8, t: 1.15, h: 1.5 }[k];
  ctx.save();
  ctx.fillStyle = 'rgba(8,10,24,0.78)';
  ctx.fillRect(x0 - 4, y0 - 4, 118, 44);
  ctx.strokeStyle = k === 'h' || k === 't' ? '#ff5a4a' : k === 'm' ? '#ffd23a' : '#7be07b';
  ctx.lineWidth = 3;
  ctx.beginPath();
  const bx = x0 + 18, by = y0 + 34;
  ctx.moveTo(bx, by);
  ctx.lineTo(bx, by - 14);
  const ex = bx + sign * Math.sin(bend) * 16, ey = by - 14 - Math.cos(bend) * 16;
  ctx.lineTo(Math.round(ex), Math.round(ey));
  ctx.stroke();
  ctx.restore();
  drawSmall(ctx, a, t(sign > 0 ? 'pace.right' : 'pace.left'), x0 + 40, y0);
  drawSmall(ctx, a, t(`pace.${k}` as never), x0 + 40, y0 + 13);
  drawSmall(ctx, a, `${dist} M`, x0 + 40, y0 + 26);
}
