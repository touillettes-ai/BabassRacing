import { AUDIO } from '../config/balance';

const BASE = import.meta.env.BASE_URL + 'assets/';
const MUTE_KEY = 'babass-racing-muted';
const SETTINGS_KEY = 'babass-racing-audio';

/** Réglages sonores choisis par le joueur (0..1), sauvegardés dans le localStorage. */
export interface AudioSettings {
  master: number;
  music: number;
  sfx: number;
}

/**
 * Audio WebAudio sans dépendance : moteur synthétisé selon le régime, dérapages, stand, chocs, bips des feux, et musiques
 * (fichiers OGG du pack, bouclés sans coupure). Le contexte audio n'est créé qu'au premier geste du joueur (politique des navigateurs).
 * Emplacements de musiques : `AUDIO.music` dans la config (menus) et `music` de chaque ambiance (levels.json) pour les courses.
 */
export class Audio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicGain!: GainNode;
  private sfxGain!: GainNode;
  private noise!: AudioBuffer;
  muted = false;
  settings: AudioSettings = { master: AUDIO.master, music: AUDIO.musicVolume, sfx: AUDIO.sfxVolume };

  // moteur
  private osc1: OscillatorNode | null = null;
  private osc2: OscillatorNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineGain: GainNode | null = null;
  // bruits continus
  private skidGain: GainNode | null = null;
  private rumbleGain: GainNode | null = null;
  private hissGain: GainNode | null = null;
  // musique
  private music: { src: AudioBufferSourceNode; gain: GainNode; path: string } | null = null;
  private buffers = new Map<string, Promise<AudioBuffer | null>>();
  private wantedMusic: string | null = null;
  private nextWrench = 0;

  constructor() {
    try {
      this.muted = localStorage.getItem(MUTE_KEY) === '1';
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) this.settings = { ...this.settings, ...(JSON.parse(raw) as Partial<AudioSettings>) };
    } catch {
      /* ignoré */
    }
    const unlock = () => this.unlock();
    window.addEventListener('keydown', unlock, { once: true });
    window.addEventListener('pointerdown', unlock, { once: true });
  }

  /** Crée le contexte audio (premier geste) ; lance la musique demandée entre-temps. */
  unlock(): void {
    if (this.ctx) return;
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = this.muted ? 0 : this.settings.master;
    this.master.connect(c.destination);
    this.musicGain = c.createGain();
    this.musicGain.gain.value = this.settings.music;
    this.musicGain.connect(this.master);
    this.sfxGain = c.createGain();
    this.sfxGain.gain.value = this.settings.sfx;
    this.sfxGain.connect(this.master);
    // bruit blanc partagé (dérapages, vibreurs, chocs, pistolets)
    this.noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    void c.resume();
    this.startEngine();
    if (this.wantedMusic) void this.playMusic(this.wantedMusic);
  }

  toggleMute(): void {
    this.muted = !this.muted;
    try {
      localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0');
    } catch {
      /* ignoré */
    }
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : this.settings.master, this.ctx.currentTime, 0.05);
  }

  /** Change un volume (0..1), l'applique tout de suite et le sauvegarde. Un bip de test accompagne le réglage des effets. */
  setVolume(k: keyof AudioSettings, v: number): void {
    this.settings[k] = Math.max(0, Math.min(1, Math.round(v * 20) / 20));
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch {
      /* ignoré */
    }
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (k === 'master') this.master.gain.setTargetAtTime(this.muted ? 0 : this.settings.master, t, 0.03);
    else if (k === 'music') this.musicGain.gain.setTargetAtTime(this.settings.music, t, 0.03);
    else {
      this.sfxGain.gain.setTargetAtTime(this.settings.sfx, t, 0.03);
      this.burst(0.12, 0.4, 'bandpass', 1500); // test des effets
    }
  }

  // ------------------------------------------------------------------ musique
  private load(path: string): Promise<AudioBuffer | null> {
    let p = this.buffers.get(path);
    if (!p) {
      p = fetch(BASE + path)
        .then((r) => r.arrayBuffer())
        .then((b) => this.ctx!.decodeAudioData(b))
        .catch(() => null);
      this.buffers.set(path, p);
    }
    return p;
  }

  /** Joue (en boucle, fondu enchaîné) la musique `path` ; null = silence. Sans effet si c'est déjà celle-là. */
  async playMusic(path: string | null): Promise<void> {
    this.wantedMusic = path;
    const c = this.ctx;
    if (!c || (this.music?.path ?? null) === path) return;
    const old = this.music;
    this.music = null;
    if (old) {
      old.gain.gain.setTargetAtTime(0, c.currentTime, AUDIO.fadeS / 3);
      setTimeout(() => old.src.stop(), AUDIO.fadeS * 1000);
    }
    if (!path) return;
    const buf = await this.load(path);
    if (!buf || this.wantedMusic !== path) return;
    const gain = c.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(1, c.currentTime, AUDIO.fadeS / 3);
    gain.connect(this.musicGain);
    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(gain);
    src.start();
    this.music = { src, gain, path };
  }

  // ------------------------------------------------------------------ moteur et bruits continus
  private noiseSource(filterType: BiquadFilterType, freq: number, q = 1): { gain: GainNode } {
    const c = this.ctx!;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = filterType;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.value = 0;
    src.connect(f).connect(g).connect(this.sfxGain);
    src.start();
    return { gain: g };
  }

  private startEngine(): void {
    const c = this.ctx!;
    this.osc1 = c.createOscillator();
    this.osc1.type = 'sawtooth';
    this.osc2 = c.createOscillator();
    this.osc2.type = 'square';
    this.engineFilter = c.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 500;
    this.engineGain = c.createGain();
    this.engineGain.gain.value = 0;
    const mix2 = c.createGain();
    mix2.gain.value = 0.5;
    this.osc1.connect(this.engineFilter);
    this.osc2.connect(mix2).connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain).connect(this.sfxGain);
    this.osc1.start();
    this.osc2.start();
    this.skidGain = this.noiseSource('bandpass', 1800, 2).gain;
    this.rumbleGain = this.noiseSource('lowpass', 220).gain;
    this.hissGain = this.noiseSource('highpass', 3500).gain;
  }

  /** Sons continus de la voiture du joueur, à appeler à chaque image pendant la course. */
  update(s: AudioState): void {
    const c = this.ctx;
    if (!c || !this.engineGain) return;
    const t = c.currentTime;
    const r = Math.max(0, Math.min(1, (s.rpm - 1200) / 7000));
    this.osc1!.frequency.setTargetAtTime(38 + r * 190, t, 0.03);
    this.osc2!.frequency.setTargetAtTime((38 + r * 190) * 1.5, t, 0.03);
    this.engineFilter!.frequency.setTargetAtTime(380 + 1900 * (0.25 + 0.75 * s.throttle) * (0.4 + 0.6 * r), t, 0.05);
    this.engineGain.gain.setTargetAtTime(s.running ? 0.09 + 0.17 * s.throttle + 0.05 * r : 0, t, 0.08);
    this.skidGain!.gain.setTargetAtTime(s.sliding ? 0.18 : s.braking && s.speedRatio > 0.4 ? 0.05 * s.speedRatio : 0, t, 0.05);
    this.rumbleGain!.gain.setTargetAtTime(s.offroad ? 0.25 * Math.min(1, s.speedRatio * 3) : 0, t, 0.08);
    this.hissGain!.gain.setTargetAtTime(s.refueling ? 0.12 : s.punctured && s.speedRatio > 0.1 ? 0.05 : 0, t, 0.08);
    // pistolets à écrous pendant le changement de roues
    if (s.wrenching && t > this.nextWrench) {
      this.burst(0.07, 0.25, 'bandpass', 2600);
      this.nextWrench = t + 0.16;
    }
    if (this.music) this.music.gain.gain.setTargetAtTime(s.musicDuck ? 0.5 : 1, t, 0.2);
  }

  /** Bruit bref (choc, pistolet…). */
  burst(dur: number, vol: number, type: BiquadFilterType = 'lowpass', freq = 900): void {
    const c = this.ctx;
    if (!c) return;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    src.connect(f).connect(g).connect(this.sfxGain);
    src.start(c.currentTime, Math.random());
    src.stop(c.currentTime + dur + 0.05);
  }

  /** Bip (feux de départ, alertes). */
  beep(freq: number, dur: number, vol = 0.25, type: OscillatorType = 'square'): void {
    const c = this.ctx;
    if (!c) return;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    o.connect(g).connect(this.sfxGain);
    o.start();
    o.stop(c.currentTime + dur + 0.05);
  }

  crash(hard: boolean): void {
    this.burst(hard ? 0.4 : 0.2, hard ? 0.7 : 0.4, 'lowpass', hard ? 700 : 1200);
  }
  /** Tête-à-queue : long crissement. */
  spin(): void {
    this.burst(1.2, 0.35, 'bandpass', 1500);
  }
  /** Feu de départ : bip aigu pour chaque feu rouge, plus long et plus haut au vert. */
  light(frame: number): void {
    if (frame >= 1 && frame <= 5) this.beep(440, 0.15);
    else if (frame === 6) this.beep(880, 0.6, 0.3);
  }
  /** Alerte de neutralisation (safety car). */
  alert(): void {
    this.beep(660, 0.12);
    setTimeout(() => this.beep(880, 0.12), 150);
  }
  /** Silence des sons continus (menus). */
  silence(): void {
    this.update({ rpm: 1200, throttle: 0, speedRatio: 0, sliding: false, braking: false, offroad: false, punctured: false, refueling: false, wrenching: false, running: false, musicDuck: false });
  }
}

/** Ce que l'audio doit savoir de la voiture du joueur à chaque image. */
export interface AudioState {
  rpm: number;
  throttle: number;
  speedRatio: number;
  sliding: boolean;
  braking: boolean;
  offroad: boolean;
  punctured: boolean;
  refueling: boolean;
  wrenching: boolean;
  running: boolean;
  musicDuck: boolean;
}
