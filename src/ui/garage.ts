import type { Career, UpgradeKey } from '../career/career';
import { RENDER, SEASON, UPGRADES } from '../config/balance';
import { ALL_RACES, CATEGORIES } from '../config/categories';
import { pickColor } from '../config/teams';
import { listCarColors, loadImage, loadJSON } from '../core/assets';
import { t } from '../i18n';
import type { TextKey } from '../i18n/fr';
import type { MenuEvent } from './menuInput';
import { drawText, drawTextCentered, panel, wrap, type UiAssets } from './ui';

const W = RENDER.width, H = RENDER.height;
const tk = (k: string, v?: Record<string, string | number>) => t(k as TextKey, v);
/** 12500 → « 12 500 » */
export const money = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

type HotspotId = 'car' | 'mechanics' | 'parts' | 'office' | 'board' | 'exit' | 'tv' | 'sponsors';
interface Hotspot {
  rect: [number, number, number, number];
  highlight: { image: string; x: number; y: number };
}
interface GarageJson {
  car_anchor_screen: { x: number; y: number };
  mechanic_spots: { x: number; y: number; flip: boolean }[];
  cars: Record<string, { anchor: { x: number; y: number } }>;
  hotspots: Record<HotspotId, Hotspot>;
  animations: {
    tv: { x: number; y: number; frame: { w: number; h: number }; count: number; fps: number };
    door_light: { x: number; y: number; frame: { w: number; h: number }; count: number; fps: number };
  };
}

/** Ressources du garage (chargées une fois). */
export class GarageAssets {
  private constructor(
    readonly json: GarageJson,
    readonly bg: Record<'day' | 'night', HTMLImageElement>,
    readonly fg: Record<'day' | 'night', HTMLImageElement>,
    readonly tv: HTMLImageElement,
    readonly door: HTMLImageElement,
    readonly mech: HTMLImageElement[],
    readonly hl: Record<string, HTMLImageElement>,
  ) {}

  static async load(): Promise<GarageAssets> {
    const json = await loadJSON<GarageJson>('garage/garage.json');
    const img = (f: string) => loadImage(`garage/${f}`);
    const ids = Object.keys(json.hotspots) as HotspotId[];
    const [bgD, bgN, fgD, fgN, tv, door, m1, m2, m3, ...hls] = await Promise.all([
      img('garage_bg_day.png'), img('garage_bg_night.png'), img('garage_fg_day.png'), img('garage_fg_night.png'),
      img('garage_anim_tv.png'), img('garage_anim_doorlight.png'),
      img('garage_mechanic_red.png'), img('garage_mechanic_blue.png'), img('garage_mechanic_black.png'),
      ...ids.map((id) => img(json.hotspots[id].highlight.image)),
    ]);
    const hl: Record<string, HTMLImageElement> = {};
    ids.forEach((id, i) => (hl[id] = hls[i]));
    return new GarageAssets(json, { day: bgD, night: bgN }, { day: fgD, night: fgN }, tv, door, [m1, m2, m3], hl);
  }
}

export type GarageAction = 'race' | 'title' | null;
type View = 'hub' | 'car' | 'mech' | 'office' | 'board' | 'tv' | 'sponsors';

/** Ordre de parcours des zones au clavier (gauche → droite). */
const ORDER: HotspotId[] = ['tv', 'parts', 'mechanics', 'car', 'exit', 'board', 'office', 'sponsors'];
const VIEW_OF: Record<HotspotId, View> = {
  car: 'car', parts: 'car', mechanics: 'mech', office: 'office', board: 'board', exit: 'hub', tv: 'tv', sponsors: 'sponsors',
};
const PANEL_ROWS: Record<'car' | 'mech' | 'office', UpgradeKey[]> = {
  car: ['engine', 'clutch', 'brakes'],
  mech: ['refuel', 'tyre'],
  office: ['stratTyre', 'stratFuel'],
};

/**
 * Garage entre deux courses : la scène du pack (garage.json) avec zones cliquables ; chaque zone ouvre un panneau
 * (améliorations de la voiture, des mécaniciens, du mur des stands, classement de la saison) ou lance la course.
 */
export class GarageScreen {
  private view: View = 'hub';
  private cursor = ORDER.indexOf('exit');
  private row = 0;
  private clock = 0;
  private msg = '';
  private msgT = 0;
  private happy = 0;
  private car: HTMLImageElement | null = null;
  private carModel = '';

  constructor(private readonly career: Career, private readonly g: GarageAssets) {
    void this.loadCar();
  }

  private async loadCar(): Promise<void> {
    const model = CATEGORIES[Math.min(this.career.catUnlocked, CATEGORIES.length - 1)].model;
    this.carModel = model;
    try {
      const colors = await listCarColors(model);
      this.car = await loadImage(`garage/garage_${model}_${pickColor(this.career.team, colors)}.png`);
    } catch {
      this.car = null;
    }
  }

  private open(id: HotspotId): GarageAction {
    if (id === 'exit') return 'race';
    this.view = VIEW_OF[id];
    this.row = 0;
    return null;
  }

  private rows(): UpgradeKey[] {
    return this.view === 'car' || this.view === 'mech' || this.view === 'office' ? PANEL_ROWS[this.view] : [];
  }

  private buy(k: UpgradeKey): void {
    const c = this.career;
    if (c.locked(k)) this.say(tk('garage.locked', { n: UPGRADES.stratUnlockCat + 1 }));
    else if (c.level(k) >= c.maxLevel(k)) this.say(tk('garage.max'));
    else if (c.buy(k)) {
      this.say(tk('garage.bought'));
      this.happy = 1.6;
    } else this.say(tk('garage.poor'));
  }
  private say(s: string): void {
    this.msg = s;
    this.msgT = 2;
  }

  update(dt: number, events: MenuEvent[]): GarageAction {
    this.clock += dt;
    if (this.msgT > 0) this.msgT -= dt;
    if (this.happy > 0) this.happy -= dt;
    for (const e of events) {
      if (this.view === 'hub') {
        if (e.type === 'left' || e.type === 'up') this.cursor = (this.cursor + ORDER.length - 1) % ORDER.length;
        else if (e.type === 'right' || e.type === 'down') this.cursor = (this.cursor + 1) % ORDER.length;
        else if (e.type === 'back') return 'title';
        else if (e.type === 'confirm') {
          const a = this.open(ORDER[this.cursor]);
          if (a) return a;
        } else if (e.type === 'tap') {
          const hit = ORDER.findIndex((id) => {
            const [x0, y0, x1, y1] = this.g.json.hotspots[id].rect;
            return e.x >= x0 && e.x <= x1 && e.y >= y0 && e.y <= y1;
          });
          if (hit >= 0) {
            this.cursor = hit;
            const a = this.open(ORDER[hit]);
            if (a) return a;
          }
        }
        continue;
      }
      // panneaux
      const rows = this.rows();
      if (e.type === 'back' || (e.type === 'confirm' && rows.length === 0)) this.view = 'hub';
      else if (e.type === 'up' && rows.length) this.row = (this.row + rows.length - 1) % rows.length;
      else if (e.type === 'down' && rows.length) this.row = (this.row + 1) % rows.length;
      else if (e.type === 'confirm' && rows.length) this.buy(rows[this.row]);
      else if (e.type === 'tap') {
        if (e.x < 70 || e.x > 410 || e.y < 36 || e.y > 236) this.view = 'hub';
        else if (rows.length) {
          const r = Math.floor((e.y - 62) / 46);
          if (r >= 0 && r < rows.length) {
            if (r === this.row) this.buy(rows[r]);
            else this.row = r;
          }
        }
      }
    }
    return null;
  }

  // ------------------------------------------------------------------ dessin
  draw(ctx: CanvasRenderingContext2D, ui: UiAssets): void {
    const g = this.g, js = g.json;
    const time = this.career.catUnlocked % 2 === 0 ? 'day' : 'night';
    ctx.drawImage(g.bg[time], 0, 0);
    // animations : télé, voyant de la porte (vert = course prête)
    const tv = js.animations.tv;
    ctx.drawImage(g.tv, (Math.floor(this.clock * tv.fps) % tv.count) * tv.frame.w, 0, tv.frame.w, tv.frame.h, tv.x, tv.y, tv.frame.w, tv.frame.h);
    const dl = js.animations.door_light;
    ctx.drawImage(g.door, (this.career.complete ? 0 : 1) * dl.frame.w, 0, dl.frame.w, dl.frame.h, dl.x, dl.y, dl.frame.w, dl.frame.h);

    // mécaniciens (frame 0 = repos, 1 = mains sur les hanches, 2 = salut, 3 = pouce levé après un achat)
    js.mechanic_spots.forEach((s, i) => {
      const phase = (this.clock + i * 2.3) % 7;
      const frame = this.happy > 0 ? 3 : phase < 1 ? 2 : phase < 4 ? 0 : phase < 5.5 ? 1 : 0;
      ctx.save();
      ctx.translate(s.x, s.y);
      if (s.flip) ctx.scale(-1, 1);
      ctx.drawImage(g.mech[i % g.mech.length], frame * 96, 0, 96, 112, -48, -104, 96, 112);
      ctx.restore();
    });

    // voiture de la catégorie en cours
    if (this.car) {
      const a = js.cars[this.carModel]?.anchor ?? { x: 112, y: 96 };
      ctx.drawImage(this.car, js.car_anchor_screen.x - a.x, js.car_anchor_screen.y - a.y);
    }
    ctx.drawImage(g.fg[time], 0, 0);

    if (this.view === 'hub') this.drawHub(ctx, ui);
    else this.drawPanel(ctx, ui);
    this.drawBar(ctx, ui);
  }

  private drawBar(ctx: CanvasRenderingContext2D, ui: UiAssets): void {
    const c = this.career;
    panel(ctx, 0, 0, W, 22);
    drawText(ctx, ui, `${c.teamName}`.slice(0, 22), 8, 3);
    const m = `${money(c.money)} EUR`;
    drawText(ctx, ui, m, W - 8 - m.length * 8, 3);
    const cat = tk(CATEGORIES[Math.min(c.catUnlocked, CATEGORIES.length - 1)].nameKey);
    drawTextCentered(ctx, ui, cat.slice(0, 24), W / 2, 3);
  }

  private drawHub(ctx: CanvasRenderingContext2D, ui: UiAssets): void {
    const id = ORDER[this.cursor];
    const hs = this.g.json.hotspots[id];
    if (Math.floor(this.clock * 3) % 3 !== 2) ctx.drawImage(this.g.hl[id], hs.highlight.x, hs.highlight.y);
    panel(ctx, 0, H - 38, W, 38);
    drawTextCentered(ctx, ui, tk(`garage.hs.${id}`), W / 2, H - 35);
    drawTextCentered(ctx, ui, tk('garage.hint.hub'), W / 2, H - 18);
  }

  private upLabel(k: UpgradeKey): { right: string; ok: boolean } {
    const c = this.career;
    if (c.locked(k)) return { right: tk('garage.lockedShort', { n: UPGRADES.stratUnlockCat + 1 }), ok: false };
    if (c.level(k) >= c.maxLevel(k)) return { right: tk('garage.owned'), ok: false };
    const cost = c.cost(k);
    return { right: `${money(cost)} EUR`, ok: c.money >= cost };
  }

  private drawPanel(ctx: CanvasRenderingContext2D, ui: UiAssets): void {
    const v = this.view;
    panel(ctx, 70, 36, 340, 200);
    if (v === 'car' || v === 'mech' || v === 'office') {
      drawTextCentered(ctx, ui, tk(`garage.panel.${v}`), W / 2, 42);
      PANEL_ROWS[v].forEach((k, i) => {
        const y = 62 + i * 46;
        const sel = i === this.row;
        const lvl = this.career.level(k), max = this.career.maxLevel(k);
        const lab = this.upLabel(k);
        drawText(ctx, ui, (sel ? '> ' : '  ') + tk(`up.${k}`), 78, y);
        const pips = max === 1 ? '' : '#'.repeat(lvl) + '.'.repeat(max - lvl);
        drawText(ctx, ui, pips, 78 + 18 * 8, y);
        ctx.globalAlpha = lab.ok || lab.right === tk('garage.owned') ? 1 : 0.6;
        drawText(ctx, ui, lab.right, 402 - lab.right.length * 8, y);
        ctx.globalAlpha = 1;
        wrap(tk(`up.${k}.d`), 34).slice(0, 2).forEach((l, j) => drawText(ctx, ui, l, 94, y + 16 + j * 13));
      });
      if (v === 'car') drawTextCentered(ctx, ui, tk('garage.carReset'), W / 2, 206);
      drawTextCentered(ctx, ui, this.msgT > 0 ? this.msg : tk('garage.hint.panel'), W / 2, 220);
      return;
    }
    if (v === 'board') {
      const c = this.career;
      const catIndex = Math.min(c.catUnlocked, CATEGORIES.length - 1);
      drawTextCentered(ctx, ui, tk('garage.panel.board', { cat: tk(CATEGORIES[catIndex].nameKey) }).slice(0, 40), W / 2, 42);
      const table = c.table(catIndex);
      const races = CATEGORIES[catIndex].races;
      const done = races.filter((r) => c.results[r.id]).length;
      drawTextCentered(ctx, ui, tk('garage.board.progress', { a: done, b: races.length, n: SEASON.promotionRank }), W / 2, 60);
      if (table.length === 0) drawTextCentered(ctx, ui, tk('garage.board.empty'), W / 2, 110);
      table.forEach((r, i) => {
        const y = 82 + i * 18;
        const you = r.id === 'player';
        if (you) {
          ctx.fillStyle = 'rgba(255,210,58,0.22)';
          ctx.fillRect(80, y - 2, 320, 18);
        }
        drawText(ctx, ui, `${String(i + 1).padStart(2)} ${r.name.padEnd(14).slice(0, 14)}`, 88, y);
        const p = `${r.points} PTS`;
        drawText(ctx, ui, p, 392 - p.length * 8, y);
        if (i === SEASON.promotionRank - 1) {
          ctx.fillStyle = '#7be07b';
          ctx.fillRect(80, y + 16, 320, 1);
        }
      });
      const next = ALL_RACES[c.nextRaceIndex()];
      drawTextCentered(ctx, ui, tk('garage.board.next', { name: tk(next.race.nameKey, { elle: tk('name.elle') }).slice(0, 24) }), W / 2, 196);
      drawTextCentered(ctx, ui, tk('garage.hint.back'), W / 2, 216);
      return;
    }
    // tv / sponsors : textes d'ambiance
    drawTextCentered(ctx, ui, tk(v === 'tv' ? 'garage.hs.tv' : 'garage.hs.sponsors'), W / 2, 42);
    wrap(tk(v === 'tv' ? 'garage.tv.text' : 'garage.sponsors.text'), 38).forEach((l, i) => drawTextCentered(ctx, ui, l, W / 2, 80 + i * 18));
    drawTextCentered(ctx, ui, tk('garage.hint.back'), W / 2, 216);
  }
}
