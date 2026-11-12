import { buildRoster } from '../ai/roster';
import { AI, CAREER, FUEL, PHYSICS, TYRES, WEATHER } from '../config/balance';
import { loadAssets, loadMarshal, loadSafetyCar, type Assets } from '../core/assets';
import type { AudioState } from '../audio/audio';
import type { Input, InputState } from '../core/input';
import { t } from '../i18n';
import { Background } from '../render/background';
import { CarRenderer } from '../render/car';
import { Effects, SpeedFx } from '../render/fx';
import { GantryLights } from '../render/gantry';
import { drawHud } from '../render/hud';
import { RoadRenderer } from '../render/road';
import { Field } from '../sim/field';
import { PitController } from '../sim/pit';
import { Player } from '../sim/player';
import { Race } from '../sim/race';
import type { Compound } from '../sim/tyres';
import { decorate } from '../track/decor';
import { estimateLap, type Estimate } from './estimate';
import { generateTrack, validateTrack, type TrackParams } from '../track/generator';
import { buildMinimap, type Minimap } from '../track/minimap';
import type { Track } from '../track/segments';
import type { RaceSummary } from '../ui/screens';

/** Tout ce qu'il faut pour lancer une course (carrière ou essai libre). */
export interface RaceSetup {
  carId: string;
  level: string;
  params: TrackParams;
  laps: number;
  startTyre?: Compound;
  startFuel?: number;
  /** Performances de la voiture de la catégorie (appliquées à la config de physique) et niveau des adversaires */
  maxSpeed?: number;
  accel?: number;
  gripLimit?: number;
  stability?: number;
  tank?: number;
  aiDifficulty?: number;
  /** Time attack : seul en piste, pas de safety car, tours illimités ; `onLap` renvoie true si le tour bat le record */
  solo?: boolean;
  onLap?: (lapTime: number) => boolean;
  /** Meilleur tour déjà enregistré (affiché en course) */
  recordLap?: number | null;
}

/**
 * Une course : circuit, joueur, adversaires, rendu et HUD. Créée par `RaceSession.create`, pilotée par
 * `update` (pas fixe) et `draw`.
 */
export class RaceSession {
  race: Race;
  readonly player = new Player();
  readonly pit: PitController;
  readonly field: Field;
  private readonly bg = new Background();
  private readonly road: RoadRenderer;
  private readonly car = new CarRenderer();
  private readonly effects = new Effects();
  private readonly speedFx = new SpeedFx();
  private readonly gantry: GantryLights;
  private fps = 60;
  private st: InputState;
  /** Temps écoulé depuis l'arrivée du joueur (s), -1 tant qu'il court */
  finishedFor = -1;
  /** Time attack : meilleur tour enregistré et temps restant d'affichage de « nouveau record » (s) */
  record: number | null = null;
  recordFlash = 0;
  /** Estimation de consommation / usure par tour (écran de stratégie) */
  estimate!: Estimate;
  private lastLapSeen: number | null = null;

  private constructor(
    readonly setup: RaceSetup, readonly assets: Assets, readonly track: Track, private readonly minimap: Minimap,
    field: (s: RaceSession) => Field, private readonly input: Input,
  ) {
    this.race = new Race(track, setup.laps);
    this.pit = new PitController(track);
    this.pit.askPlayer = true;
    this.field = field(this);
    this.road = new RoadRenderer(assets);
    this.gantry = new GantryLights(assets);
    this.st = input.read();
    this.restart();
  }

  static async create(setup: RaceSetup, input: Input): Promise<RaceSession> {
    // Performances de la catégorie et niveau des adversaires (config partagée, appliquée avant de construire quoi que ce soit)
    if (setup.maxSpeed !== undefined) PHYSICS.maxSpeed = setup.maxSpeed;
    if (setup.accel !== undefined) PHYSICS.accel = setup.accel;
    if (setup.gripLimit !== undefined) PHYSICS.gripLimit = setup.gripLimit;
    FUEL.capacity = setup.tank ?? FUEL.capacity;
    // stabilité : en haut de gamme la glissade pousse moins et le tête-à-queue arrive plus tard
    const stab = setup.stability ?? 0;
    PHYSICS.slidePush = PHYSICS.slidePushBase * (1 - 0.5 * stab);
    PHYSICS.spinRatio = PHYSICS.spinRatioBase + 0.35 * stab;
    if (setup.aiDifficulty !== undefined) AI.difficulty = setup.aiDifficulty;

    const assets = await loadAssets(setup.level, setup.carId);
    // météo : l'ambiance « pluie » détrempe la piste (les gommes sèches glissent)
    WEATHER.wetness = assets.level.weather ? 1 : 0;
    const track = generateTrack(setup.params);
    const issues = validateTrack(track);
    if (issues.length) console.warn('Circuit invalide :', issues);
    decorate(track, assets.level.roadside, setup.params.seed);
    const minimap = buildMinimap(track);
    const [roster, scAssets, marshal] = await Promise.all([setup.solo ? Promise.resolve([]) : buildRoster(setup.carId), loadSafetyCar(), loadMarshal()]);
    input.read(); // vide les touches pressées pendant le chargement
    const estimate = estimateLap(track);
    const session = new RaceSession(
      setup, assets, track, minimap,
      (s) => {
        const f = new Field(track, s.player, s.pit, roster, scAssets, marshal, t('driver.babass'));
        f.scEnabled = !setup.solo;
        return f;
      },
      input,
    );
    session.estimate = estimate;
    return session;
  }

  /** Stratégie de départ choisie avant la course : gomme et carburant (fraction du réservoir) ; relance la grille. */
  applyStrategy(tyre: Compound, fuel: number): void {
    this.setup.startTyre = tyre;
    this.setup.startFuel = fuel;
    this.restart();
  }

  restart(): void {
    const s = this.setup;
    this.race = new Race(this.track, s.laps);
    const tyre = s.startTyre ?? (WEATHER.wetness > 0.3 ? 'rain' : TYRES.startCompound);
    const fuel = s.startFuel ?? FUEL.startFraction;
    this.player.reset(this.race.startZ(), tyre, fuel);
    this.pit.reset();
    this.field.reset(s.laps, tyre, fuel);
    this.finishedFor = -1;
    this.record = s.recordLap ?? null;
    this.recordFlash = 0;
    this.lastLapSeen = null;
  }

  /** Un pas de simulation (60 Hz). `confirmPressed` : Entrée/appui pour passer à l'écran de résultats une fois arrivé. */
  update(dt: number): void {
    const { player, pit, field, track } = this;
    this.st = this.input.read();
    const st = this.st;
    if (st.restart) this.restart();
    for (const act of st.debugActions) {
      if (act === 'KeyT') player.tyres.fit('soft');
      else if (act === 'KeyY') player.tyres.fit('hard');
      else if (act === 'KeyG') player.fuel.reset(1);
    }
    for (const act of st.pitActions) {
      if (act === 'tyre') { if (pit.menuOpen) pit.cycleTyre(); }
      else if (act === 'fuel') { if (pit.menuOpen) pit.cycleFuel(); }
      else if (pit.menuOpen && (act === 'confirm' || act === 'pit')) pit.menuOpen = false; // valide le menu : le jeu reprend
      else if (act === 'pit') pit.toggleIntent();
    }
    if (pit.menuOpen) return; // menu du stand : le jeu est en pause

    // pilote auto (safety car, dépanneuse) : remplace les commandes du joueur ; le stand peut reprendre direction/gaz
    const base = field.playerAuto && this.race.state === 'racing' ? field.autopilot(dt) : this.race.controls(st);
    const ctrl = this.race.state === 'racing' ? pit.update(dt, player, base) : base;
    field.beforePlayer();
    player.update(dt, ctrl, track);
    this.race.update(dt, player);
    field.update(dt, this.race.state, this.race.time);
    this.bg.update(dt, player.curve, player.speed);
    this.car.update(dt);
    this.effects.update(dt, player, this.assets);
    // time attack : chaque tour terminé est soumis aux records
    if (this.setup.onLap && this.race.lastLap !== null && this.race.lastLap !== this.lastLapSeen) {
      this.lastLapSeen = this.race.lastLap;
      if (this.setup.onLap(this.race.lastLap)) {
        this.record = this.race.lastLap;
        this.recordFlash = 4;
      }
    }
    if (this.recordFlash > 0) this.recordFlash -= dt;
    if (this.race.state === 'finished') this.finishedFor = Math.max(0, this.finishedFor) + dt;
  }

  /** Vrai quand on peut passer aux résultats : délai écoulé ou tous les concurrents arrivés. */
  get readyForResults(): boolean {
    return this.finishedFor >= CAREER.resultsDelayS || (this.finishedFor > 1.5 && this.field.raceOver);
  }

  draw(ctx: CanvasRenderingContext2D, frameMs: number): void {
    const { player, pit, field, assets } = this;
    this.fps += (1000 / Math.max(1, frameMs) - this.fps) * 0.05;
    this.gantry.set(this.race.lightsFrame);
    const sh = this.speedFx.shake(player, field.hitFlash);
    ctx.save();
    ctx.translate(sh.x, sh.y);
    this.bg.draw(ctx, assets);
    const dyn = [...pit.sprites(assets), ...field.sprites(assets)];
    this.road.draw(ctx, assets, this.track, player, dyn);
    this.effects.draw(ctx, assets, false);
    this.car.draw(ctx, assets, player);
    this.road.drawFront(ctx, this.track, dyn, player.z);
    this.effects.draw(ctx, assets, true);
    this.speedFx.streaks(ctx, player);
    ctx.restore();
    drawHud(ctx, assets, player, this.race, this.minimap, pit, field, this.st.debugToggled ? `FPS ${Math.round(this.fps)}` : null, {
      record: this.record, flash: this.recordFlash > 0,
    });
  }

  /** État sonore de la voiture du joueur (moteur, dérapages, stand…). */
  audioState(): AudioState {
    const p = this.player;
    const crew = this.pit.crew;
    const service = this.pit.phase === 'service' && crew !== null;
    const t = crew?.t ?? 0;
    return {
      rpm: p.rpm,
      throttle: p.throttle ? 1 : 0,
      speedRatio: p.speed / PHYSICS.maxSpeed,
      sliding: p.sliding && p.speed > 5,
      braking: p.braking,
      offroad: p.offroad && p.speed > 4,
      punctured: p.tyres.anyPunctured,
      refueling: service && !!crew && crew.plan.fuelSeconds > 0 && crew.fuelProgress > 0 && crew.fuelProgress < 1,
      wrenching: service && !!crew?.plan.tyres && ((t >= 10 && t < 16) || (t >= 20 && t < 26)),
      running: true,
      musicDuck: this.pit.menuOpen,
    };
  }

  /** Résumé de la course pour l'écran de résultats et la progression. */
  summary(unlockPosition: number, hasNext: boolean): RaceSummary {
    const f = this.field;
    const rows = f.ranking.map((e) => ({ id: e.id, name: e.name, isPlayer: e.isPlayer, time: e.finishTime }));
    const kevin = f.entries.find((e) => e.id === 'kevin');
    const playerPos = f.playerPosition;
    const kevinPos = kevin ? f.ranking.indexOf(kevin) + 1 : f.entries.length;
    const passed = playerPos <= unlockPosition;
    return {
      rows, playerPos, kevinPos, beatKevin: playerPos < kevinPos, passed, unlockedNext: passed && hasNext,
      stops: this.pit.stops, penaltyS: f.penaltyS, playerName: t('driver.babass'), kevinName: kevin?.name ?? t('driver.kevin'),
    };
  }
}
