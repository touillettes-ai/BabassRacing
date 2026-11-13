import type { Career, Ending } from '../career/career';
import type { Records } from '../career/records';
import type { AudioSettings } from '../audio/audio';
import { TEAMS, pickColor } from '../config/teams';
import { loadJSON } from '../core/assets';
import type { Compound } from '../sim/tyres';
import { FUEL, RENDER, SEASON, TYRES } from '../config/balance';
import { ALL_RACES, CATEGORIES } from '../config/categories';
import { loadImage } from '../core/assets';
import { formatTime, t } from '../i18n';
import type { TextKey } from '../i18n/fr';
import type { MenuEvent } from './menuInput';
import { drawBackdrop, drawText, drawTextCentered, panel, type UiAssets } from './ui';
import { money } from './garage';
import type { SeasonSummary } from '../career/career';

const W = RENDER.width, H = RENDER.height;
const tk = (k: string, v?: Record<string, string | number>) => t(k as TextKey, v);

// ---------------------------------------------------------------- Écran titre
export type TitleAction = 'continue' | 'new' | 'timeattack' | 'options' | null;

export class TitleScreen {
  private stage: 'press' | 'menu' = 'press';
  private cursor = 0;
  private clock = 0;
  private options: ('continue' | 'new' | 'timeattack' | 'options' | 'erase')[] = [];

  constructor(private readonly hasSave: () => boolean, private readonly erase: () => void) {
    this.refresh();
  }
  private refresh(): void {
    this.options = this.hasSave() ? ['continue', 'new', 'timeattack', 'options', 'erase'] : ['new', 'timeattack', 'options'];
    this.cursor = 0;
  }

  update(dt: number, events: MenuEvent[]): TitleAction {
    this.clock += dt;
    for (const e of events) {
      if (this.stage === 'press') {
        if (e.type === 'confirm' || e.type === 'tap') this.stage = 'menu';
        continue;
      }
      if (e.type === 'up') this.cursor = (this.cursor + this.options.length - 1) % this.options.length;
      else if (e.type === 'down') this.cursor = (this.cursor + 1) % this.options.length;
      else if (e.type === 'back') this.stage = 'press';
      else if (e.type === 'tap') {
        const i = Math.floor((e.y - (H - 20 - this.options.length * 20)) / 20);
        if (i >= 0 && i < this.options.length) {
          if (i === this.cursor) return this.choose();
          this.cursor = i;
        }
      } else if (e.type === 'confirm') return this.choose();
    }
    return null;
  }
  private choose(): TitleAction {
    const o = this.options[this.cursor];
    if (o === 'erase') {
      this.erase();
      this.refresh();
      return null;
    }
    return o;
  }

  draw(ctx: CanvasRenderingContext2D, ui: UiAssets): void {
    ctx.drawImage(ui.title, 0, 0, RENDER.width, RENDER.height);
    if (this.stage === 'press') {
      if (Math.floor(this.clock * 2) % 2 === 0) drawTextCentered(ctx, ui, tk('title.press'), W / 2, H - 24);
      return;
    }
    const h = this.options.length * 20 + 12;
    panel(ctx, W / 2 - 110, H - 20 - this.options.length * 20 - 6, 220, h);
    this.options.forEach((o, i) => {
      const label = tk(o === 'continue' ? 'title.continue' : o === 'new' ? 'title.new' : o === 'timeattack' ? 'title.timeattack' : o === 'options' ? 'title.options' : 'title.erase');
      const y = H - 20 - this.options.length * 20 + i * 20;
      drawTextCentered(ctx, ui, (i === this.cursor ? '> ' : '  ') + label + (i === this.cursor ? ' <' : '  '), W / 2, y);
    });
  }
}

// ---------------------------------------------------------------- Sélection de course
export type SelectAction = { start: number } | 'title' | null;

const previews = new Map<string, HTMLImageElement | null>();
function preview(model: string, color: string): HTMLImageElement | null {
  const key = `${model}_${color}`;
  if (!previews.has(key)) {
    previews.set(key, null);
    loadImage(`cars/${key}_spin.png`).then((img) => previews.set(key, img)).catch(() => undefined);
  }
  return previews.get(key) ?? null;
}

type Row = { header: true; cat: number } | { header: false; index: number };
const ROWS: Row[] = [];
ALL_RACES.forEach((r) => {
  if (r.raceIndex === 0) ROWS.push({ header: true, cat: r.catIndex });
  ROWS.push({ header: false, index: r.index });
});
const ROW_H = 14, LIST_TOP = 34, LIST_ROWS = 14;

export class SelectScreen {
  cursor: number;
  private clock = 0;

  constructor(private readonly career: Career) {
    this.cursor = career.nextRaceIndex();
  }

  private rowOf(index: number): number {
    return ROWS.findIndex((r) => !r.header && r.index === index);
  }
  private scrollTop(): number {
    const row = this.rowOf(this.cursor);
    return Math.max(0, Math.min(ROWS.length - LIST_ROWS, row - Math.floor(LIST_ROWS / 2)));
  }

  update(dt: number, events: MenuEvent[]): SelectAction {
    this.clock += dt;
    for (const e of events) {
      if (e.type === 'up') this.cursor = Math.max(0, this.cursor - 1);
      else if (e.type === 'down') this.cursor = Math.min(ALL_RACES.length - 1, this.cursor + 1);
      else if (e.type === 'back') return 'title';
      else if (e.type === 'confirm') {
        if (this.career.isUnlocked(this.cursor)) return { start: this.cursor };
      } else if (e.type === 'tap') {
        const i = Math.floor((e.y - LIST_TOP) / ROW_H);
        const row = ROWS[this.scrollTop() + i];
        if (e.x < 250 && row && !row.header) {
          if (row.index === this.cursor && this.career.isUnlocked(row.index)) return { start: row.index };
          this.cursor = row.index;
        } else if (e.x >= 250 && this.career.isUnlocked(this.cursor)) return { start: this.cursor };
      }
    }
    return null;
  }

  draw(ctx: CanvasRenderingContext2D, ui: UiAssets): void {
    drawBackdrop(ctx, ui, this.clock * 4);
    drawTextCentered(ctx, ui, tk('select.title'), W / 2, 8);
    panel(ctx, 8, 28, 246, LIST_ROWS * ROW_H + 12);
    const top = this.scrollTop();
    for (let i = 0; i < LIST_ROWS; i++) {
      const row = ROWS[top + i];
      if (!row) break;
      const y = LIST_TOP + i * ROW_H;
      if (row.header) {
        drawText(ctx, ui, tk(ALL_RACES.find((r) => r.catIndex === row.cat)!.cat.nameKey), 16, y - 2);
        continue;
      }
      const r = ALL_RACES[row.index];
      const res = this.career.results[r.race.id];
      const locked = !this.career.isUnlocked(row.index);
      const mark = row.index === this.cursor ? '>' : ' ';
      const stars = res ? ` ${res.position}E${res.beatKevin ? ' +' : ''}` : '';
      const name = tk(r.race.nameKey, { elle: tk('name.elle') });
      ctx.globalAlpha = locked ? 0.45 : 1;
      drawText(ctx, ui, `${mark} ${name.slice(0, 22)}`, 16, y - 2);
      if (stars) drawText(ctx, ui, stars.trim(), 254 - 8 - stars.trim().length * 8, y - 2);
      ctx.globalAlpha = 1;
    }

    // détail
    const sel = ALL_RACES[this.cursor];
    panel(ctx, 262, 28, 210, LIST_ROWS * ROW_H + 12);
    const img = preview(sel.cat.model, sel.cat.playerColor);
    if (img) ctx.drawImage(img, 8 * 240 * RENDER.hd, 0, 240 * RENDER.hd, 112 * RENDER.hd, 262 + 105 - 120, 40, 240, 112);
    drawTextCentered(ctx, ui, tk(sel.cat.nameKey), 262 + 105, 150);
    drawTextCentered(ctx, ui, tk('select.car', { v: tk(`car.${sel.cat.model}`) }), 262 + 105, 164);
    drawTextCentered(ctx, ui, tk('select.vmax', { n: Math.round(sel.cat.maxSpeed * 3.6) }), 262 + 105, 178);
    drawTextCentered(ctx, ui, tk(sel.race.nameKey, { elle: tk('name.elle') }).slice(0, 25), 262 + 105, 192);
    drawTextCentered(ctx, ui, tk('select.laps', { n: sel.race.laps }), 262 + 105, 206);
    const res = this.career.results[sel.race.id];
    if (!this.career.isUnlocked(this.cursor)) drawTextCentered(ctx, ui, tk('select.locked'), 262 + 105, 220);
    else if (res) drawTextCentered(ctx, ui, tk('select.result', { p: res.position }) + (res.beatKevin ? ' - ' + tk('select.kevinWin') : ''), 262 + 105, 220);
    drawTextCentered(ctx, ui, tk('select.hint'), W / 2, H - 20);
  }
}

// ---------------------------------------------------------------- Résultats / podium
export interface ResultRow {
  id: string;
  name: string;
  isPlayer: boolean;
  /** Temps total (s) ou null s'il n'a pas terminé */
  time: number | null;
}
export interface RaceSummary {
  /** Pilote du podium (people/driver_<couleur>) du joueur, selon son écurie */
  playerDriver?: string;
  rows: ResultRow[];
  playerPos: number;
  kevinPos: number;
  beatKevin: boolean;
  passed: boolean;
  unlockedNext: boolean;
  stops: number;
  penaltyS: number;
  playerName: string;
  kevinName: string;
  /** Saison : points gagnés, prime (EUR), rang et total de points au championnat (renseignés après l'enregistrement) */
  points?: number;
  prize?: number;
  seasonRank?: number;
  seasonPoints?: number;
}

const DRIVER_FRAME = { w: 96, h: 108, ax: 48, ay: 100 };
const DRIVER_COLORS: Record<string, string> = { player: 'red', kevin: 'blue' };

export class ResultsScreen {
  private clock = 0;
  constructor(private readonly s: RaceSummary) {}

  update(dt: number, events: MenuEvent[]): boolean {
    this.clock += dt;
    return events.some((e) => e.type === 'confirm' || e.type === 'tap');
  }

  draw(ctx: CanvasRenderingContext2D, ui: UiAssets): void {
    const s = this.s;
    drawBackdrop(ctx, ui, this.clock * 5);
    drawTextCentered(ctx, ui, tk('res.title'), W / 2, 6);

    // podium : pose du pack (podium.png, offsets des marches dans podium.json)
    const cx = 124, cy = 214;
    ctx.drawImage(ui.podium, 302 * RENDER.hd, 0, 232 * RENDER.hd, 46 * RENDER.hd, cx - 117, cy - 47, 232, 46);
    const stand = [{ dx: -1, dy: -44 }, { dx: -77, dy: -26 }, { dx: 75, dy: -18 }];
    let other = 0;
    const others = ['white', 'green'];
    s.rows.slice(0, 3).forEach((r, i) => {
      const color = r.isPlayer ? (s.playerDriver ?? 'red') : r.id === 'kevin' ? (s.playerDriver === 'blue' ? 'white' : 'blue') : others[other++ % 2];
      const img = ui.drivers[color] ?? ui.drivers.white;
      const frame = i === 0 ? 14 + (Math.floor(this.clock * 3) % 2) : 10 + (Math.floor(this.clock * 8) % 4);
      ctx.drawImage(img, frame * DRIVER_FRAME.w * RENDER.hd, 0, DRIVER_FRAME.w * RENDER.hd, DRIVER_FRAME.h * RENDER.hd,
        cx + stand[i].dx - DRIVER_FRAME.ax, cy + stand[i].dy - DRIVER_FRAME.ay, DRIVER_FRAME.w, DRIVER_FRAME.h);
    });
    void DRIVER_COLORS;

    // classement
    panel(ctx, 250, 22, 222, 8 + s.rows.length * 14 + 12);
    s.rows.forEach((r, i) => {
      const time = r.time !== null ? (i === 0 ? formatTime(r.time) : '+' + (r.time - (s.rows[0].time ?? 0)).toFixed(1)) : tk('res.dnf');
      const nm = (r.isPlayer ? '>' : ' ') + r.name;
      drawText(ctx, ui, `${i + 1} ${nm.padEnd(8)} ${time}`, 258, 28 + i * 14);
    });

    // Babass contre Kevin
    const y0 = 28 + s.rows.length * 14 + 18;
    panel(ctx, 250, y0, 222, 84);
    drawTextCentered(ctx, ui, tk('res.vs', { a: s.playerName, b: s.kevinName }), 361, y0 + 6);
    const pt = s.rows.find((r) => r.isPlayer)?.time ?? null;
    const kt = s.rows.find((r) => r.id === 'kevin')?.time ?? null;
    drawText(ctx, ui, `${s.playerName}: ${s.playerPos}E ${pt !== null ? formatTime(pt) : tk('res.dnf')}`, 258, y0 + 24);
    drawText(ctx, ui, `${s.kevinName}: ${s.kevinPos}E ${kt !== null ? formatTime(kt) : tk('res.dnf')}`, 258, y0 + 38);
    if (pt !== null && kt !== null) drawText(ctx, ui, tk('res.gap', { v: Math.abs(pt - kt).toFixed(2) }), 258, y0 + 52);
    drawTextCentered(ctx, ui, s.beatKevin ? tk('res.win', { a: s.playerName, b: s.kevinName }) : tk('res.lose', { a: s.playerName, b: s.kevinName }), 361, y0 + 68);

    if (s.points !== undefined) {
      drawText(ctx, ui, tk('res.points', { p: s.points }), 8, H - 80);
      drawText(ctx, ui, tk('res.prize', { n: money(s.prize ?? 0) }), 8, H - 62);
      drawText(ctx, ui, tk('res.season', { r: s.seasonRank ?? 0, n: s.seasonPoints ?? 0 }), 8, H - 44);
    }
    if (s.penaltyS > 0) drawText(ctx, ui, tk('res.pen', { n: s.penaltyS }), 250, H - 40);
    if (Math.floor(this.clock * 2) % 2 === 0) drawTextCentered(ctx, ui, tk('res.continue'), W / 2, H - 20);
  }
}

// ---------------------------------------------------------------- Fin
export class EndScreen {
  private clock = 0;
  constructor(private readonly kind: Ending) {}
  update(dt: number, events: MenuEvent[]): boolean {
    this.clock += dt;
    return events.some((e) => e.type === 'confirm' || e.type === 'tap' || e.type === 'back');
  }
  draw(ctx: CanvasRenderingContext2D, ui: UiAssets): void {
    drawBackdrop(ctx, ui, this.clock * 8);
    ctx.drawImage(ui.logo, W / 2 - 192, 20, ui.logo.width / RENDER.hd, ui.logo.height / RENDER.hd);
    drawTextCentered(ctx, ui, tk('end.fin'), W / 2, 130);
    drawTextCentered(ctx, ui, tk(`end.${this.kind}`), W / 2, 156);
    drawTextCentered(ctx, ui, tk('end.thanks'), W / 2, 180);
    if (Math.floor(this.clock * 2) % 2 === 0) drawTextCentered(ctx, ui, tk('end.back'), W / 2, H - 24);
  }
}

// ---------------------------------------------------------------- Time Attack : voiture + circuit + pneus
export interface TaChoice {
  /** Indice de la catégorie (voiture) et de la course (circuit, indice global dans ALL_RACES) */
  catIndex: number;
  raceIndex: number;
  tyre: Compound;
}
const TA_TYRES: Compound[] = ['soft', 'medium', 'hard', 'rain'];

export class TimeAttackScreen {
  private row = 0;
  private car = 0;
  private track = 0;
  private tyre = 1;
  private clock = 0;

  constructor(private readonly records: Records) {}

  private change(dir: number): void {
    if (this.row === 0) this.car = (this.car + dir + CATEGORIES.length) % CATEGORIES.length;
    else if (this.row === 1) this.track = (this.track + dir + ALL_RACES.length) % ALL_RACES.length;
    else this.tyre = (this.tyre + dir + TA_TYRES.length) % TA_TYRES.length;
  }

  update(dt: number, events: MenuEvent[]): 'back' | TaChoice | null {
    this.clock += dt;
    for (const e of events) {
      if (e.type === 'up') this.row = (this.row + 2) % 3;
      else if (e.type === 'down') this.row = (this.row + 1) % 3;
      else if (e.type === 'left') this.change(-1);
      else if (e.type === 'right') this.change(1);
      else if (e.type === 'back') return 'back';
      else if (e.type === 'confirm') return { catIndex: this.car, raceIndex: this.track, tyre: TA_TYRES[this.tyre] };
      else if (e.type === 'tap') {
        const r = Math.floor((e.y - 150) / 24);
        if (r >= 0 && r < 3) {
          if (r === this.row) this.change(e.x < W / 2 ? -1 : 1);
          else this.row = r;
        } else return { catIndex: this.car, raceIndex: this.track, tyre: TA_TYRES[this.tyre] };
      }
    }
    return null;
  }

  draw(ctx: CanvasRenderingContext2D, ui: UiAssets): void {
    drawBackdrop(ctx, ui, this.clock * 5);
    drawTextCentered(ctx, ui, tk('ta.title'), W / 2, 8);
    const cat = CATEGORIES[this.car];
    const info = ALL_RACES[this.track];
    const img = preview(cat.model, cat.playerColor);
    if (img) ctx.drawImage(img, 8 * 240 * RENDER.hd, 0, 240 * RENDER.hd, 112 * RENDER.hd, W / 2 - 120, 28, 240, 112);

    const lines = [
      [tk('ta.car'), tk(`car.${cat.model}`) + '  ' + Math.round(cat.maxSpeed * 3.6) + ' KM/H'],
      [tk('ta.track'), tk(info.race.nameKey, { elle: tk('name.elle') }).slice(0, 26)],
      [tk('ta.tyres'), tk(`tyre.${TA_TYRES[this.tyre]}`)],
    ];
    panel(ctx, 30, 146, W - 60, 78);
    lines.forEach(([k, v], i) => {
      const y = 152 + i * 24;
      const sel = i === this.row;
      drawText(ctx, ui, (sel ? '> ' : '  ') + k, 40, y);
      drawText(ctx, ui, (sel ? '< ' : '  ') + v + (sel ? ' >' : ''), 150, y);
    });
    const rec = this.records.get(info.race.id, cat.model);
    drawTextCentered(ctx, ui, rec !== null ? tk('ta.record', { t: formatTime(rec) }) : tk('ta.norecord'), W / 2, 232);
    drawTextCentered(ctx, ui, tk('ta.hint'), W / 2, H - 18);
  }
}

// ---------------------------------------------------------------- Stratégie avant la course
export interface StrategyInfo {
  trackName: string;
  laps: number;
  lapS: number;
  fuelPerLap: number;
  wearPerLap: number;
  wet: boolean;
  /** Gomme et réservoir de départ initiaux */
  tyre: Compound;
  fuel: number;
  /** Course à tours illimités (time attack) : pas de verdict « suffisant pour finir » */
  endless: boolean;
}
const STRAT_TYRES: Compound[] = ['soft', 'medium', 'hard', 'rain'];

export class StrategyScreen {
  private row = 0;
  private tyre: number;
  private fuel: number;
  private clock = 0;

  constructor(private readonly info: StrategyInfo) {
    this.tyre = Math.max(0, STRAT_TYRES.indexOf(info.tyre));
    this.fuel = FUEL.startOptions.length - 1;
    FUEL.startOptions.forEach((f, i) => {
      if (Math.abs(f - info.fuel) < Math.abs(FUEL.startOptions[this.fuel] - info.fuel)) this.fuel = i;
    });
  }

  private change(dir: number): void {
    if (this.row === 0) this.tyre = (this.tyre + dir + STRAT_TYRES.length) % STRAT_TYRES.length;
    else this.fuel = (this.fuel + dir + FUEL.startOptions.length) % FUEL.startOptions.length;
  }

  update(dt: number, events: MenuEvent[]): 'back' | { tyre: Compound; fuel: number } | null {
    this.clock += dt;
    for (const e of events) {
      if (e.type === 'up' || e.type === 'down') this.row = 1 - this.row;
      else if (e.type === 'left') this.change(-1);
      else if (e.type === 'right') this.change(1);
      else if (e.type === 'back') return 'back';
      else if (e.type === 'confirm') return { tyre: STRAT_TYRES[this.tyre], fuel: FUEL.startOptions[this.fuel] };
      else if (e.type === 'tap') {
        const r = Math.floor((e.y - 92) / 40);
        if (r >= 0 && r < 2) {
          if (r === this.row) this.change(e.x < W / 2 ? -1 : 1);
          else this.row = r;
        } else return { tyre: STRAT_TYRES[this.tyre], fuel: FUEL.startOptions[this.fuel] };
      }
    }
    return null;
  }

  draw(ctx: CanvasRenderingContext2D, ui: UiAssets): void {
    const i = this.info;
    drawBackdrop(ctx, ui, this.clock * 4);
    drawTextCentered(ctx, ui, tk('strat.title'), W / 2, 10);
    drawTextCentered(ctx, ui, tk('strat.race', { track: i.trackName }), W / 2, 34);
    drawTextCentered(ctx, ui, i.endless ? tk('strat.lapOnly', { t: formatTime(i.lapS) }) : tk('strat.laps', { n: i.laps, t: formatTime(i.lapS) }), W / 2, 52);
    if (i.wet) drawTextCentered(ctx, ui, tk('strat.wet'), W / 2, 70);

    const tyre = STRAT_TYRES[this.tyre];
    const fuelFrac = FUEL.startOptions[this.fuel];
    const fuelL = fuelFrac * FUEL.capacity;
    const tyreLaps = TYRES.usableWear / Math.max(1e-6, i.wearPerLap * TYRES.compounds[tyre].wear);
    const fuelLaps = fuelL / Math.max(1e-6, i.fuelPerLap);
    const verdict = (n: number) => (i.endless ? '' : '  ' + (n >= i.laps ? tk('strat.ok') : tk('strat.short')));

    panel(ctx, 30, 88, W - 60, 90);
    const rows: [string, string, string][] = [
      [tk('strat.tyre'), tk(`tyre.${tyre}`), tk('strat.tyreLaps', { n: tyreLaps.toFixed(1) }) + verdict(tyreLaps)],
      [tk('strat.fuel'), `${Math.round(fuelFrac * 100)}%`, tk('strat.fuelLaps', { n: fuelLaps.toFixed(1), l: Math.round(fuelL) }) + verdict(fuelLaps)],
    ];
    rows.forEach(([k, v, extra], r) => {
      const y = 96 + r * 40;
      const sel = r === this.row;
      drawText(ctx, ui, (sel ? '> ' : '  ') + k, 40, y);
      drawText(ctx, ui, (sel ? '< ' : '  ') + v + (sel ? ' >' : ''), 150, y);
      drawText(ctx, ui, extra, 60, y + 18);
    });
    if (!i.endless) {
      const need = tyreLaps < i.laps || fuelLaps < i.laps;
      drawTextCentered(ctx, ui, need ? tk('strat.stop') : tk('strat.nostop'), W / 2, 192);
    }
    drawTextCentered(ctx, ui, tk('strat.light'), W / 2, 214);
    drawTextCentered(ctx, ui, tk('strat.hint'), W / 2, H - 18);
  }
}

// ---------------------------------------------------------------- Réglages du son
export interface AudioPort {
  settings: AudioSettings;
  muted: boolean;
  setVolume(k: keyof AudioSettings, v: number): void;
  toggleMute(): void;
}

export class OptionsScreen {
  private row = 0;
  private clock = 0;
  private static readonly KEYS: (keyof AudioSettings | 'mute')[] = ['master', 'music', 'sfx', 'mute'];

  constructor(private readonly audio: AudioPort) {}

  update(dt: number, events: MenuEvent[]): 'back' | null {
    this.clock += dt;
    const k = OptionsScreen.KEYS[this.row];
    for (const e of events) {
      if (e.type === 'up') this.row = (this.row + 3) % 4;
      else if (e.type === 'down') this.row = (this.row + 1) % 4;
      else if (e.type === 'back') return 'back';
      else if (e.type === 'left' && k !== 'mute') this.audio.setVolume(k, this.audio.settings[k] - 0.05);
      else if (e.type === 'right' && k !== 'mute') this.audio.setVolume(k, this.audio.settings[k] + 0.05);
      else if (e.type === 'confirm' && k === 'mute') this.audio.toggleMute();
      else if (e.type === 'tap') {
        const r = Math.floor((e.y - 70) / 34);
        if (r >= 0 && r < 4) {
          this.row = r;
          const kk = OptionsScreen.KEYS[r];
          if (kk === 'mute') this.audio.toggleMute();
          else if (e.x >= 190 && e.x <= 400) this.audio.setVolume(kk, (e.x - 190) / 210);
        }
      }
    }
    return null;
  }

  draw(ctx: CanvasRenderingContext2D, ui: UiAssets): void {
    drawBackdrop(ctx, ui, this.clock * 5);
    drawTextCentered(ctx, ui, tk('opt.title'), W / 2, 12);
    panel(ctx, 20, 56, W - 40, 150);
    const labels = [tk('opt.master'), tk('opt.music'), tk('opt.sfx'), tk('opt.mute')];
    OptionsScreen.KEYS.forEach((key, i) => {
      const y = 70 + i * 34;
      const sel = i === this.row;
      drawText(ctx, ui, (sel ? '> ' : '  ') + labels[i], 30, y);
      if (key === 'mute') {
        drawText(ctx, ui, this.audio.muted ? tk('opt.on') : tk('opt.off'), 190, y);
        return;
      }
      const v = this.audio.settings[key];
      ctx.fillStyle = '#2a2d44';
      ctx.fillRect(190, y + 4, 210, 8);
      ctx.fillStyle = sel ? '#ffd23a' : '#7be07b';
      ctx.fillRect(190, y + 4, Math.round(210 * v), 8);
      drawText(ctx, ui, `${Math.round(v * 100)}%`, 408, y);
    });
    drawTextCentered(ctx, ui, tk('opt.hint'), W / 2, H - 22);
  }
}

// ---------------------------------------------------------------- Choix de la couleur d'écurie
export class TeamScreen {
  private i = 0;
  private clock = 0;
  /** coloris disponibles par modèle (cars.json), chargés à l'ouverture */
  private colors: Record<string, string[]> = {};

  constructor(initial = 'red') {
    this.i = Math.max(0, TEAMS.findIndex((t) => t.id === initial));
    void loadJSON<Record<string, { sheets?: string[] }>>('cars/cars.json').then((c) => {
      for (const [m, v] of Object.entries(c)) this.colors[m] = (v.sheets ?? []).map((s) => s.replace(/\.png$/, '').split('_')[1]);
    });
  }

  update(dt: number, events: MenuEvent[]): string | null {
    this.clock += dt;
    for (const e of events) {
      if (e.type === 'left') this.i = (this.i + TEAMS.length - 1) % TEAMS.length;
      else if (e.type === 'right') this.i = (this.i + 1) % TEAMS.length;
      else if (e.type === 'confirm') return TEAMS[this.i].id;
      else if (e.type === 'tap') {
        if (e.y > 190) {
          const idx = Math.floor((e.x - 24) / 54);
          if (idx >= 0 && idx < TEAMS.length) {
            if (idx === this.i) return TEAMS[idx].id;
            this.i = idx;
          }
        } else return TEAMS[this.i].id;
      }
    }
    return null;
  }

  draw(ctx: CanvasRenderingContext2D, ui: UiAssets): void {
    drawBackdrop(ctx, ui, this.clock * 5);
    drawTextCentered(ctx, ui, tk('team.title'), W / 2, 12);
    const team = TEAMS[this.i];
    // aperçu : un modèle qui existe dans une couleur de l'écurie
    const model = Object.keys(this.colors).find((m) => team.prefs.some((c) => this.colors[m].includes(c)));
    if (model) {
      const img = preview(model, pickColor(team.id, this.colors[model]));
      if (img) ctx.drawImage(img, 8 * 240 * RENDER.hd, 0, 240 * RENDER.hd, 112 * RENDER.hd, W / 2 - 120, 40, 240, 112);
    }
    drawTextCentered(ctx, ui, tk(team.nameKey), W / 2, 158);
    TEAMS.forEach((tm, i) => {
      const x = 24 + i * 54;
      ctx.fillStyle = tm.css;
      ctx.fillRect(x, 196, 46, 26);
      ctx.strokeStyle = i === this.i ? '#ffffff' : '#10142a';
      ctx.lineWidth = i === this.i ? 3 : 1;
      ctx.strokeRect(x + 0.5, 196.5, 45, 25);
    });
    drawTextCentered(ctx, ui, tk('team.hint'), W / 2, H - 22);
  }
}

// ---------------------------------------------------------------- Nom du pilote et de l'écurie
export interface NameChoice {
  pilot: string;
  teamName: string;
}
const NAME_MAX = 14;

export class NameScreen {
  private row = 0;
  private clock = 0;
  private vals: [string, string];

  constructor(pilot = 'Babass', teamName = 'Babass Racing') {
    this.vals = [pilot, teamName];
  }

  private finish(): NameChoice {
    return { pilot: this.vals[0].trim() || 'Babass', teamName: this.vals[1].trim() || 'Babass Racing' };
  }

  update(dt: number, events: MenuEvent[]): 'back' | NameChoice | null {
    this.clock += dt;
    for (const e of events) {
      if (e.type === 'up') this.row = 0;
      else if (e.type === 'down') this.row = 1;
      else if (e.type === 'back') return 'back';
      else if (e.type === 'confirm') {
        if (this.row === 0) this.row = 1;
        else return this.finish();
      } else if (e.type === 'char') {
        if (e.ch === '\b') this.vals[this.row] = this.vals[this.row].slice(0, -1);
        else if (/^[\p{L}\p{N} '-]$/u.test(e.ch) && this.vals[this.row].length < NAME_MAX) this.vals[this.row] += e.ch;
      } else if (e.type === 'tap') {
        const r = Math.floor((e.y - 92) / 44);
        if (r === 0 || r === 1) {
          this.row = r;
          // appui : saisie par la boîte du navigateur (clavier tactile)
          const v = window.prompt(tk(r === 0 ? 'name.pilot' : 'name.team'), this.vals[r]);
          if (v !== null) this.vals[r] = v.slice(0, NAME_MAX);
        } else if (e.y > 190) return this.finish();
      }
    }
    return null;
  }

  draw(ctx: CanvasRenderingContext2D, ui: UiAssets): void {
    drawBackdrop(ctx, ui, this.clock * 5);
    drawTextCentered(ctx, ui, tk('name.title'), W / 2, 20);
    panel(ctx, 40, 84, W - 80, 92);
    const labels = [tk('name.pilot'), tk('name.team')];
    this.vals.forEach((v, i) => {
      const y = 94 + i * 44;
      const sel = i === this.row;
      drawText(ctx, ui, (sel ? '> ' : '  ') + labels[i], 52, y);
      const caret = sel && Math.floor(this.clock * 2) % 2 === 0 ? '_' : ' ';
      ctx.fillStyle = sel ? '#2f3470' : '#1c1f3d';
      ctx.fillRect(52, y + 18, NAME_MAX * 8 + 12, 18);
      drawText(ctx, ui, v + caret, 58, y + 18);
    });
    drawTextCentered(ctx, ui, tk('name.hint'), W / 2, H - 40);
  }
}

// ---------------------------------------------------------------- Fin de saison : classement final et verdict
export class SeasonScreen {
  private clock = 0;
  constructor(private readonly s: SeasonSummary, private readonly catName: string) {}
  update(dt: number, events: MenuEvent[]): boolean {
    this.clock += dt;
    return events.some((e) => e.type === 'confirm' || e.type === 'tap');
  }
  draw(ctx: CanvasRenderingContext2D, ui: UiAssets): void {
    const s = this.s;
    drawBackdrop(ctx, ui, this.clock * 5);
    drawTextCentered(ctx, ui, tk('season.title'), W / 2, 8);
    drawTextCentered(ctx, ui, this.catName.slice(0, 40), W / 2, 28);
    panel(ctx, 70, 52, 340, 8 + s.table.length * 18 + 8);
    s.table.forEach((r, i) => {
      const y = 58 + i * 18;
      if (r.id === 'player') {
        ctx.fillStyle = 'rgba(255,210,58,0.22)';
        ctx.fillRect(76, y - 2, 328, 18);
      }
      drawText(ctx, ui, `${String(i + 1).padStart(2)} ${r.name.padEnd(14).slice(0, 14)}`, 84, y);
      const p = `${r.points} PTS`;
      drawText(ctx, ui, p, 396 - p.length * 8, y);
      if (i === SEASON.promotionRank - 1) {
        ctx.fillStyle = '#7be07b';
        ctx.fillRect(76, y + 16, 328, 1);
      }
    });
    const y0 = 52 + s.table.length * 18 + 24;
    drawTextCentered(ctx, ui, tk('season.rank', { r: s.rank }), W / 2, y0);
    drawTextCentered(ctx, ui, s.champion ? tk('season.champion') : s.promoted ? tk('season.promoted') : tk('season.retry', { n: SEASON.promotionRank }), W / 2, y0 + 22);
    if (Math.floor(this.clock * 2) % 2 === 0) drawTextCentered(ctx, ui, tk('res.continue'), W / 2, H - 20);
  }
}
