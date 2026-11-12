import { Audio } from './audio/audio';
import { Career, type SeasonSummary } from './career/career';
import { Records } from './career/records';
import { AUDIO, FUEL, SEASON, PLAYER, RACE, RENDER, TYRES, WEATHER } from './config/balance';
import { ALL_RACES, CATEGORIES } from './config/categories';
import { Input } from './core/input';
import { startLoop } from './core/loop';
import { RaceSession, type RaceSetup } from './game/session';
import { t } from './i18n';
import { Dialogue } from './ui/dialogue';
import { MenuInput } from './ui/menuInput';
import { EndScreen, NameScreen, OptionsScreen, ResultsScreen, SeasonScreen, SelectScreen, StrategyScreen, TeamScreen, TimeAttackScreen, TitleScreen } from './ui/screens';
import { GarageAssets, GarageScreen } from './ui/garage';
import { TEAMS, pickColor } from './config/teams';
import { listCarColors } from './core/assets';
import { drawTextCentered, loadUiAssets, type UiAssets } from './ui/ui';
import { afterLines, beforeLines, characterNames, endingLines, introLines, seasonEndLines } from './story/dialogueData';
import type { Line } from './story/scenes';
import { generateTrack, validateTrack, DEFAULT_PARAMS } from './track/generator';
import type { TextKey } from './i18n/fr';

type Mode = 'loading' | 'title' | 'select' | 'story' | 'race' | 'results' | 'end' | 'ta' | 'strategy' | 'options' | 'team' | 'name' | 'garage' | 'season';

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
  let nameScreen: NameScreen | null = null;
  let garage: GarageScreen | null = null;
  let seasonScreen: SeasonScreen | null = null;
  let afterSeason: (() => void) | null = null;
  const names = characterNames();
  const garageAssets = await GarageAssets.load();
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

  /** Variables des dialogues : noms des personnages (éditables), pilote et écurie du joueur ; `name.<qui>` = nom sur l'onglet de la boîte. */
  const vars = (extra: Record<string, string | number> = {}) => ({
    pilote: career.pilot, ecurie: career.teamName, babass: career.pilot,
    kevin: names.kevin, elle: names.elle, marcel: names.marcel, leo: names.leo,
    'name.babass': career.pilot, 'name.kevin': names.kevin, 'name.elle': names.elle, 'name.marcel': names.marcel, 'name.leo': names.leo,
    ...extra,
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
  const goGarage = () => {
    garage = new GarageScreen(career, garageAssets);
    mode = 'garage';
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
      level: race.level,
      levelOverride: race.assets,
      params: { seed: race.seed, lengthM: race.lengthM, corners: race.corners, elevation: race.elevation, difficulty: race.difficulty, theme: race.level, layout: race.layout },
      laps: race.laps,
      maxSpeed: cat.maxSpeed, accel: cat.accel, gripLimit: cat.gripLimit, stability: cat.stability, tank: cat.tank, aiDifficulty: cat.aiDifficulty,
      upgrades: { ...career.upgrades }, pilotName: career.pilot,
    };
    session = await RaceSession.create(setup, input);
    for (const e of session.field.entries) if (e.id === 'kevin') e.name = names.kevin; // nom du rival choisi dans la partie (classement en course)
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
    const { race } = ALL_RACES[index];
    mode = 'loading';
    loadingText = t('menu.loading' as TextKey);
    taActive = true;
    const taColor = pickColor(career.team, await listCarColors(cat.model));
    const setup: RaceSetup = {
      carId: `${cat.model}_${taColor}`,
      level: race.level,
      levelOverride: race.assets,
      params: { seed: race.seed, lengthM: race.lengthM, corners: race.corners, elevation: race.elevation, difficulty: race.difficulty, theme: race.level, layout: race.layout },
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

  /** Fin de course : enregistre le résultat (points, prime), affiche podium et comparaison. */
  const finishRace = () => {
    if (!session) return;
    const info = ALL_RACES[raceIndex];
    const summary = session.summary(SEASON.promotionRank, false);
    summary.playerDriver = TEAMS.find((x) => x.id === career.team)?.driver;
    summary.kevinName = names.kevin;
    for (const r of summary.rows) if (r.id === 'kevin') r.name = names.kevin;
    const player = summary.rows.find((r) => r.isPlayer);
    const order = summary.rows.map((r) => ({ id: r.id, name: r.name }));
    const gain = career.recordRace(raceIndex, {
      position: summary.playerPos, kevinPosition: summary.kevinPos, beatKevin: summary.beatKevin, time: player?.time ?? null,
    }, order);
    summary.points = gain.points;
    summary.prize = gain.prize;
    const table = career.table(info.catIndex);
    summary.seasonRank = table.findIndex((r) => r.id === 'player') + 1;
    summary.seasonPoints = table.find((r) => r.id === 'player')?.points ?? 0;
    results = new ResultsScreen(summary);
    mode = 'results';
  };

  /** Fin de saison : classement final, verdict (promotion ou catégorie à rejouer), dialogue, puis garage ou fin de l'histoire. */
  const endOfSeason = () => {
    const cat = CATEGORIES[career.catUnlocked];
    const sum: SeasonSummary = career.endSeason();
    const extra = { pos: sum.rank, rival: sum.kevinRank, cat: t(cat.nameKey as TextKey), n: SEASON.promotionRank };
    const next = () => {
      if (sum.champion) {
        const kind = career.ending();
        startStory(endingLines(kind, { rivalAhead: !sum.playerAhead }), () => {
          end = new EndScreen(kind);
          mode = 'end';
        }, extra);
      } else goGarage();
    };
    seasonScreen = new SeasonScreen(sum, t(cat.nameKey as TextKey));
    afterSeason = () => {
      const lines = seasonEndLines(cat.id, { rivalAhead: !sum.playerAhead, promoted: sum.promoted });
      if (lines.length > 0) startStory(lines, next, extra);
      else next();
    };
    mode = 'season';
  };

  const afterResults = () => {
    const info = ALL_RACES[raceIndex];
    const r = career.results[info.race.id];
    const lines = afterLines(info.race.id, { rivalAhead: r ? !r.beatKevin : true, position: r?.position });
    const next = () => (career.seasonOver() ? endOfSeason() : goGarage());
    const extra = { n: SEASON.promotionRank, pos: r?.position ?? 0, rival: r?.kevinPosition ?? 0, cat: t(info.cat.nameKey as TextKey) };
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

  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__dbg = { get career() { return career; }, goGarage, endOfSeason, get mode() { return mode; } };

  // ---------------------------------------------------------------- boucle
  startLoop(
    (dt) => {
      menu.typing = mode === 'name';
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
            if (career.seen.has('intro')) goGarage();
            else {
              // ancienne sauvegarde ou carrière jamais commencée : on repart du début
              career = new Career();
              teamScreen = new TeamScreen(career.team);
              mode = 'team';
            }
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
            nameScreen = new NameScreen(career.pilot, career.teamName);
            mode = 'name';
          }
          break;
        }
        case 'name': {
          const n = nameScreen!.update(dt, events);
          if (n === 'back') {
            teamScreen = new TeamScreen(career.team);
            mode = 'team';
          } else if (n) {
            career.pilot = n.pilot;
            career.teamName = n.teamName;
            career.save();
            startStory(introLines(), () => {
              career.seen.add('intro');
              career.save();
              goGarage();
            });
          }
          break;
        }
        case 'garage': {
          const a = garage!.update(dt, events);
          if (a === 'title') goTitle();
          else if (a === 'race') {
            if (career.complete) goTitle();
            else goSelect();
          }
          break;
        }
        case 'season': {
          if (seasonScreen!.update(dt, events)) afterSeason?.();
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
          if (a === 'title') goGarage();
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
        case 'name': nameScreen!.draw(ctx, ui); break;
        case 'garage': garage!.draw(ctx, ui); break;
        case 'season': seasonScreen!.draw(ctx, ui); break;
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
