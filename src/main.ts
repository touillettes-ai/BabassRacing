import { Audio } from './audio/audio';
import { Career } from './career/career';
import { Records } from './career/records';
import { AUDIO, CAREER, FUEL, PLAYER, RACE, RENDER, TYRES, WEATHER } from './config/balance';
import { ALL_RACES, CATEGORIES } from './config/categories';
import { Input } from './core/input';
import { startLoop } from './core/loop';
import { RaceSession, type RaceSetup } from './game/session';
import { t } from './i18n';
import { Dialogue } from './ui/dialogue';
import { MenuInput } from './ui/menuInput';
import { EndScreen, OptionsScreen, ResultsScreen, SelectScreen, StrategyScreen, TeamScreen, TimeAttackScreen, TitleScreen } from './ui/screens';
import { TEAMS, pickColor } from './config/teams';
import { listCarColors } from './core/assets';
import { drawTextCentered, loadUiAssets, type UiAssets } from './ui/ui';
import { afterLines, beforeLines, endingLines, introLines } from './story/dialogueData';
import type { Line } from './story/scenes';
import { generateTrack, validateTrack, DEFAULT_PARAMS } from './track/generator';
import type { TextKey } from './i18n/fr';

type Mode = 'loading' | 'title' | 'select' | 'story' | 'race' | 'results' | 'end' | 'ta' | 'strategy' | 'options' | 'team';

async function main(): Promise<void> {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  canvas.width = RENDER.width;
  canvas.height = RENDER.height;
  const ctx = canvas.getContext('2d', { alpha: false })!;
  ctx.imageSmoothingEnabled = false;

  // Mise à l'échelle sans lissage, ratio conservé
  const fit = () => {
    const s = Math.min(window.innerWidth / RENDER.width, window.innerHeight / RENDER.height);
    canvas.style.width = Math.floor(RENDER.width * s) + 'px';
    canvas.style.height = Math.floor(RENDER.height * s) + 'px';
  };
  window.addEventListener('resize', fit);
  fit();

  const input = new Input();
  const menu = new MenuInput(canvas);
  const audio = new Audio();
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyM' && !e.repeat) audio.toggleMute();
  });
  // suivi des évènements sonores (fronts montants)
  let lastMusic: string | null | undefined;
  let lastLight = 0, lastHits = 0, lastSpin = false, lastPunct = false, lastSc = 'none', lastMode: string = '';
  const ui: UiAssets = await loadUiAssets();
  const qs = new URLSearchParams(location.search);
  const num = (k: string, d: number) => (qs.has(k) ? Number(qs.get(k)) : d);

  let mode: Mode = 'title';
  let career = Career.load();
  let title = new TitleScreen(Career.hasSave, Career.erase);
  let select: SelectScreen | null = null;
  let dialogue: Dialogue | null = null;
  let afterStory: (() => void) | null = null;
  let session: RaceSession | null = null;
  let results: ResultsScreen | null = null;
  let end: EndScreen | null = null;
  const records = Records.load();
  let taScreen: TimeAttackScreen | null = null;
  /** Time attack en cours (Échap = retour à son écran) */
  let taActive = false;
  let strategy: StrategyScreen | null = null;
  let optionsScreen: OptionsScreen | null = null;
  let teamScreen: TeamScreen | null = null;
  let strategyBack: () => void = () => undefined;

  /** Écran de stratégie (pneus + essence de départ) entre le chargement et le départ. */
  const openStrategy = (s: RaceSession, endless: boolean, trackName: string, back: () => void) => {
    strategy = new StrategyScreen({
      trackName, laps: s.setup.laps, lapS: s.estimate.lapS, fuelPerLap: s.estimate.fuelPerLap, wearPerLap: s.estimate.wearPerLap,
      wet: WEATHER.wetness > 0.3, tyre: s.player.tyres.compound, fuel: 1, endless,
    });
    strategyBack = back;
    mode = 'strategy';
  };
  let raceIndex = 0;
  let loadingText = '';

  const vars = (extra: Record<string, string | number> = {}) => ({
    kevin: t('name.kevin'), elle: t('name.elle'), babass: t('name.babass'), ...extra,
  });

  // ---------------------------------------------------------------- enchaînement des écrans
  const startStory = (lines: Line[], then: () => void, extra: Record<string, string | number> = {}) => {
    dialogue = new Dialogue(lines, vars(extra));
    afterStory = then;
    mode = 'story';
  };
  const goTitle = () => {
    title = new TitleScreen(Career.hasSave, Career.erase);
    mode = 'title';
  };
  const goSelect = () => {
    select = new SelectScreen(career);
    mode = 'select';
  };

  const hookDebug = (s: RaceSession) => {
    if (!import.meta.env.DEV) return;
    (window as unknown as Record<string, unknown>).__babass = {
      player: s.player, track: s.track, assets: s.assets, draw: (ms: number) => s.draw(ctx, ms), race: () => s.race,
      restart: () => s.restart(), generateTrack, validateTrack, pit: s.pit, field: s.field, session: s,
    };
  };

  /** Lance une course de la carrière : performances de la catégorie, circuit à seed fixe. */
  const launchRace = async (index: number) => {
    const { cat, race } = ALL_RACES[index];
    raceIndex = index;
    mode = 'loading';
    loadingText = t('menu.loading' as TextKey);
    taActive = false;
    const color = pickColor(career.team, await listCarColors(cat.model));
    const setup: RaceSetup = {
      carId: `${cat.model}_${color}`,
      level: cat.level,
      params: { seed: race.seed, lengthM: race.lengthM, corners: race.corners, elevation: race.elevation, difficulty: race.difficulty, theme: cat.level, layout: race.layout },
      laps: race.laps,
      maxSpeed: cat.maxSpeed, accel: cat.accel, gripLimit: cat.gripLimit, stability: cat.stability, tank: cat.tank, aiDifficulty: cat.aiDifficulty,
    };
    session = await RaceSession.create(setup, input);
    hookDebug(session);
    openStrategy(session, false, t(race.nameKey as TextKey, { elle: t('name.elle') }), goSelect);
  };

  const startRace = (index: number) => {
    const { cat, race } = ALL_RACES[index];
    const lines = beforeLines(race.id);
    if (lines.length > 0) {
      startStory(lines, () => void launchRace(index), { cat: t(cat.nameKey as TextKey) });
    } else void launchRace(index);
  };

  /** Time attack : voiture (catégorie) + circuit + pneus choisis ; tours illimités, seul en piste, records sauvegardés. */
  const launchTimeAttack = async (catIndex: number, index: number, tyre: import('./sim/tyres').Compound) => {
    const cat = CATEGORIES[catIndex];
    const { cat: trackCat, race } = ALL_RACES[index];
    mode = 'loading';
    loadingText = t('menu.loading' as TextKey);
    taActive = true;
    const taColor = pickColor(career.team, await listCarColors(cat.model));
    const setup: RaceSetup = {
      carId: `${cat.model}_${taColor}`,
      level: trackCat.level,
      params: { seed: race.seed, lengthM: race.lengthM, corners: race.corners, elevation: race.elevation, difficulty: race.difficulty, theme: trackCat.level, layout: race.layout },
      laps: 999,
      startTyre: tyre,
      maxSpeed: cat.maxSpeed, accel: cat.accel, gripLimit: cat.gripLimit, stability: cat.stability, tank: cat.tank,
      solo: true,
      recordLap: records.get(race.id, cat.model),
      onLap: (lapTime) => records.submit(race.id, cat.model, lapTime),
    };
    session = await RaceSession.create(setup, input);
    hookDebug(session);
    openStrategy(session, true, t(race.nameKey as TextKey, { elle: t('name.elle') }), () => {
      taActive = false;
      taScreen = new TimeAttackScreen(records);
      mode = 'ta';
    });
  };

  /** Fin de course : enregistre le résultat, affiche podium et comparaison. */
  const finishRace = () => {
    if (!session) return;
    const info = ALL_RACES[raceIndex];
    const summary = session.summary(CAREER.unlockPosition, raceIndex + 1 < ALL_RACES.length);
    summary.playerDriver = TEAMS.find((x) => x.id === career.team)?.driver;
    const player = summary.rows.find((r) => r.isPlayer);
    career.record(info.race.id, {
      position: summary.playerPos, kevinPosition: summary.kevinPos, beatKevin: summary.beatKevin, time: player?.time ?? null,
    });
    results = new ResultsScreen(summary);
    mode = 'results';
  };

  const afterResults = () => {
    const info = ALL_RACES[raceIndex];
    const r = career.results[info.race.id];
    const beat = r ? r.beatKevin : false;
    const passed = r ? r.position <= CAREER.unlockPosition : false;
    // la scène de fin n'a lieu qu'une fois : toutes les courses réussies
    const last = career.finished;
    const lines = afterLines(info.race.id, { beatKevin: beat, passed });
    const next = () => {
      if (last) {
        const kind = career.ending();
        startStory(endingLines(kind), () => {
          end = new EndScreen(kind);
          mode = 'end';
        });
      } else goSelect();
    };
    const extra = { n: CAREER.unlockPosition, pos: r?.position ?? 0, rival: r?.kevinPosition ?? 0, cat: t(info.cat.nameKey as TextKey) };
    if (lines.length > 0) startStory(lines, next, extra);
    else next();
  };

  // ---------------------------------------------------------------- démarrage direct (debug/essai libre) ou menus
  const direct = ['seed', 'laps', 'car', 'level', 'corners', 'length', 'elev', 'diff', 'tyre', 'fuel', 'quick', 'layout'].some((k) => qs.has(k));
  if (direct) {
    mode = 'loading';
    const levelId = qs.get('level') ?? PLAYER.defaultLevel;
    const setup: RaceSetup = {
      carId: qs.get('car') ?? PLAYER.defaultCar,
      level: levelId,
      params: {
        seed: num('seed', DEFAULT_PARAMS.seed), lengthM: num('length', DEFAULT_PARAMS.lengthM), corners: num('corners', DEFAULT_PARAMS.corners),
        elevation: num('elev', DEFAULT_PARAMS.elevation), difficulty: num('diff', DEFAULT_PARAMS.difficulty), theme: levelId,
        layout: qs.get('layout') ?? undefined,
      },
      laps: num('laps', RACE.laps),
      startTyre: (['soft', 'medium', 'hard', 'rain'] as const).find((c) => c === qs.get('tyre')) ?? TYRES.startCompound,
      startFuel: num('fuel', FUEL.startFraction),
    };
    session = await RaceSession.create(setup, input);
    hookDebug(session);
    mode = 'race';
  }

  // ---------------------------------------------------------------- boucle
  startLoop(
    (dt) => {
      const events = menu.poll();
      // musique : menus/histoire = thème, course = musique de l'ambiance ; on ne change rien pendant un chargement
      if (mode !== 'loading') {
        const want = mode === 'race' ? session!.assets.level.music : AUDIO.music.theme;
        if (want !== lastMusic) {
          lastMusic = want;
          void audio.playMusic(want);
        }
        if (mode !== 'race' && lastMode === 'race') audio.silence();
      }
      lastMode = mode;
      switch (mode) {
        case 'title': {
          const a = title.update(dt, events);
          if (a === 'new') {
            Career.erase();
            career = new Career();
            teamScreen = new TeamScreen(career.team); // couleur d'écurie, puis introduction
            mode = 'team';
          } else if (a === 'options') {
            optionsScreen = new OptionsScreen(audio);
            mode = 'options';
          } else if (a === 'timeattack') {
            taScreen = new TimeAttackScreen(records);
            mode = 'ta';
          } else if (a === 'continue') {
            career = Career.load();
            goSelect();
          }
          break;
        }
        case 'strategy': {
          const a = strategy!.update(dt, events);
          if (a === 'back') strategyBack();
          else if (a) {
            session!.applyStrategy(a.tyre, a.fuel);
            input.read(); // vide les touches
            mode = 'race';
          }
          break;
        }
        case 'team': {
          const team = teamScreen!.update(dt, events);
          if (team) {
            career.team = team;
            career.save();
            startStory(introLines(), () => {
              career.seen.add('intro');
              career.save();
              goSelect();
            });
          }
          break;
        }
        case 'options': {
          if (optionsScreen!.update(dt, events) === 'back') goTitle();
          break;
        }
        case 'ta': {
          const a = taScreen!.update(dt, events);
          if (a === 'back') goTitle();
          else if (a) void launchTimeAttack(a.catIndex, a.raceIndex, a.tyre);
          break;
        }
        case 'select': {
          const a = select!.update(dt, events);
          if (a === 'title') goTitle();
          else if (a) startRace(a.start);
          break;
        }
        case 'story': {
          const d = dialogue!;
          d.update(dt);
          for (const e of events) if (e.type === 'confirm' || e.type === 'tap') d.confirm();
          if (d.done) {
            const next = afterStory;
            afterStory = null;
            dialogue = null;
            next?.();
          }
          break;
        }
        case 'race': {
          const s = session!;
          s.update(dt);
          // sons de la voiture du joueur et évènements ponctuels
          audio.update(s.audioState());
          const lf = s.race.lightsFrame;
          if (lf !== lastLight) {
            if (lf >= 1) audio.light(lf);
            lastLight = lf;
          }
          if (s.field.hardHits !== lastHits) {
            if (s.field.hardHits > lastHits) audio.crash(s.field.hitFlash > 0);
            lastHits = s.field.hardHits;
          }
          if (s.player.spinning && !lastSpin) audio.spin();
          lastSpin = s.player.spinning;
          const pu = s.player.tyres.anyPunctured;
          if (pu && !lastPunct) audio.burst(0.5, 0.5, 'lowpass', 1500);
          lastPunct = pu;
          const sc = s.field.sc.state;
          if (sc !== lastSc) {
            if (sc === 'out' || sc === 'ending') audio.alert();
            lastSc = sc;
          }
          const confirm = events.some((e) => e.type === 'confirm' || e.type === 'tap');
          // Échap : quitter la course (carrière) ; Entrée/appui après l'arrivée : écran de résultats
          if (!direct && taActive && events.some((e) => e.type === 'back')) {
            taActive = false;
            taScreen = new TimeAttackScreen(records);
            mode = 'ta';
          } else if (!direct && !taActive && events.some((e) => e.type === 'back')) goSelect();
          else if (!direct && !taActive && (s.readyForResults || (confirm && s.finishedFor > 1))) finishRace();
          break;
        }
        case 'results': {
          if (results!.update(dt, events)) afterResults();
          break;
        }
        case 'end': {
          if (end!.update(dt, events)) {
            career = new Career();
            goTitle();
          }
          break;
        }
        default:
      }
    },
    (frameMs) => {
      ctx.fillStyle = '#000';
      switch (mode) {
        case 'title': title.draw(ctx, ui); break;
        case 'select': select!.draw(ctx, ui); break;
        case 'ta': taScreen!.draw(ctx, ui); break;
        case 'team': teamScreen!.draw(ctx, ui); break;
        case 'options': optionsScreen!.draw(ctx, ui); break;
        case 'strategy': strategy!.draw(ctx, ui); break;
        case 'story': dialogue?.draw(ctx, ui); break;
        case 'race': session!.draw(ctx, frameMs); break;
        case 'results': results!.draw(ctx, ui); break;
        case 'end': end!.draw(ctx, ui); break;
        case 'loading':
          ctx.fillRect(0, 0, RENDER.width, RENDER.height);
          drawTextCentered(ctx, ui, loadingText || '...', RENDER.width / 2, RENDER.height / 2 - 8);
          break;
      }
    },
  );
  void CATEGORIES;
}

main().catch((e) => {
  document.body.style.color = '#fff';
  document.body.textContent = 'Erreur : ' + (e as Error).message;
  console.error(e);
});
