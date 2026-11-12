/**
 * CONFIG UNIQUE — toutes les valeurs d'équilibrage et de réglage du jeu.
 * (Jalon 1 : rendu + conduite. Carburant, pneus, stands, IA s'ajouteront ici.)
 * Unités : mètres, secondes, m/s (1 m/s = 3,6 km/h).
 */

export const RENDER = {
  /** Résolution interne (pixel art, upscalé sans lissage). */
  width: 480,
  height: 270,
  /** Réglages calibrés sur le pack d'assets (cf. README des assets). */
  horizon: 130,
  focal: 300,
  camHeight: 3.2,
  /** Longueur d'un segment de route (m). Doit rester un diviseur de 10 (période de la texture). */
  segmentLength: 5,
  /** Nombre de segments projetés devant la caméra (1200 m). */
  drawDistance: 240,
  /** Au-delà de ce nombre de segments, le décor de bord de route n'est plus dessiné. */
  spriteDrawDistance: 220,
  nearPlane: 1,
  /** La voiture du joueur est dessinée à l'échelle 1 = 36 px/m. */
  carPixelsPerMeter: 36,
  roadTex: { width: 512, height: 64, pxPerMeter: 27, bandMeters: 5, bandRows: 32, centerPx: 256 },
  /**
   * Gain visuel des virages : la route plie 1,9× plus à l'écran que sa courbure physique (la physique, les collisions
   * et la mini-carte ne changent pas). Sans cela, un virage « physiquement serré » paraît presque droit en pseudo-3D.
   */
  curveVisualGain: 1.9,
  /** Brume de distance : dégradé posé sous la ligne d'horizon. */
  fog: { height: 44, maxAlpha: 0.85 },
  /** Parallaxe (facteur de décalage selon le cumul de courbure). */
  parallax: {
    sky: 0.1,
    cloudsFar: 0.2,
    cloudsNear: 0.35,
    horizon: 0.6,
    /** Dérive naturelle des nuages (px/s). */
    cloudDrift: 4,
    /** px de défilement par (courbure × m/s × s). */
    scrollPerCurveSpeed: 300,
  },
  /** Pas fixe de la simulation. */
  fixedDt: 1 / 60,
};

export const PLAYER = {
  /** Voiture de test du jalon 1 (modèle_coloris). Le tier 1 de la carrière sera la `retro`. */
  defaultCar: 'retro_red',
  defaultLevel: 'circuit_jour',
};

export const PHYSICS = {
  maxSpeed: 75, // ≈ 270 km/h
  accel: 24, // m/s² à l'arrêt
  accelCurvePower: 1.4, // plus grand = accélère plus longtemps à fond
  brakeDecel: 46,
  brakeDecelBase: 46,
  coastDecel: 7,
  /** Direction */
  steerResponse: 10, // lissage de la valeur `steer` (README : 10)
  lateralSpeed: 9, // m/s latéraux à plein braquage
  steerFullSpeedRatio: 0.25, // fraction de vmax à partir de laquelle la direction est pleine
  /** Force centrifuge : m/s latéraux = courbure × (v/vmax)² × centrifugal */
  centrifugal: 120,
  /** Pente : décélération = pente × gravité (montée) */
  hillGravity: 90,
  /** Hors piste */
  roadHalfWidth: 7.2, // au-delà : herbe
  offroadMaxSpeed: 26,
  offroadDecel: 38,
  maxOverrun: 14, // distance max au-delà du bord
  /** Écart latéral absolu max (m) — assez large pour atteindre la voie des stands */
  maxLateral: 32,
  /** Boîte auto : bornes hautes de chaque rapport (fraction de vmax) */
  gearTops: [0.2, 0.36, 0.52, 0.68, 0.84, 1.0] as number[],
  /** Rétrogradage hors accélération : fraction de vitesse « retirée » pour choisir le rapport (0 = boîte normale). Réglé par modèle (DOWNSHIFT). */
  downshift: 0,
  idleRpm: 1200,
  redlineRpm: 8200,
  /** Voiture : choix de la planche selon la pente */
  slopeThreshold: 0.03,

  // --- Adhérence (jalon 3) ---
  /** Charge latérale (m/s) que la voiture tient avec une adhérence de 1,0 */
  gripLimit: 7,
  /** Une direction braquée à fond ajoute cette part de charge latérale */
  steerLoadFactor: 0.35,
  /** Efficacité de la direction = adhérence avant ^ exposant (sous-virage quand les pneus avant sont usés) */
  steerGripExp: 1.0,
  /** Adhérence de référence : la poussée centrifuge est divisée par (grip / référence) */
  gripRef: 1.0,
  /** Part de l'adhérence qui compte pour le freinage (0 = indifférent) */
  brakeGripShare: 0.3,
  /** Au-delà de ratio = charge/limite = 1 : survirage, poussée supplémentaire */
  slidePush: 1.2,
  slidePushBase: 1.2,
  /** Ratio à partir duquel les pneus frottent (perte de vitesse en virage) et décélération (m/s² par unité de ratio) */
  scrubStart: 0.6,
  scrub: 5,
  /** Tête-à-queue : ratio mini, durée de dérapage soutenu (s) avant de partir, vitesse mini */
  spinRatio: 1.45,
  spinRatioBase: 1.45,
  spinTime: 0.7, // laisse ~0,7 s pour lever le pied / corriger après la fumée de dérapage (était 0,45)
  spinMinSpeed: 15,
  spinDuration: 1.5,
  spinDecel: 28,
  spinExitSpeed: 4,
  spinFps: 16,
};

/** Carburant (litres, L/s). */
export const FUEL = {
  capacity: 60,
  /** Consommation au ralenti, et à pleine charge (L/s) ; en accélération : full × (throttleBase + (1-throttleBase) × v/vmax) */
  idle: 0.015,
  full: 0.30,
  throttleBase: 0.35,
  /** Panne sèche : vitesse max et décélération (m/s, m/s²) */
  emptyMaxSpeed: 9,
  emptyDecel: 14,
  /** Panne sèche : l'accélération restante (fraction) pour se traîner jusqu'aux stands */
  emptyAccelFactor: 0.2,
  /** Voiture plus légère quand le réservoir se vide : bonus d'accélération et de vitesse max à réservoir VIDE (fractions) */
  accelBonusEmpty: 0.15,
  speedBonusEmpty: 0.08,
  /** Réservoirs de départ proposés avant la course (fractions du réservoir) */
  startOptions: [0.25, 0.4, 0.55, 0.7, 0.85, 1],
  /** Alerte « carburant bas » (fraction du réservoir) */
  lowThreshold: 0.15,
  /** Carburant au départ (fraction) */
  startFraction: 1,
};

/**
 * Météo de la course en cours (posée au lancement selon l'ambiance) : 0 = sec, 1 = piste détrempée.
 */
export const WEATHER = { wetness: 0 };

/**
 * Pneus : quatre gommes. grip = adhérence de base ; wear = vitesse d'usure relative ;
 * wetGrip = part de l'adhérence conservée sur piste détrempée (1 = aucune perte) ; speed = part de la vitesse max permise par la gomme.
 *  - tendre : le plus rapide, le moins durable, glisse sous la pluie ;
 *  - intermédiaire : rapide et durable (moins rapide que le tendre, moins durable que le dur), glisse sous la pluie ;
 *  - dur : le moins rapide, le plus durable, glisse sous la pluie ;
 *  - pluie : se comporte comme un dur au sec, mais ne glisse pas sur le mouillé.
 */
export const TYRES = {
  compounds: {
    soft: { grip: 1.08, wear: 1.6, wetGrip: 0.62, speed: 1.0 },
    medium: { grip: 1.02, wear: 1.0, wetGrip: 0.66, speed: 0.99 },
    hard: { grip: 0.96, wear: 0.75, wetGrip: 0.7, speed: 0.975 },
    rain: { grip: 0.96, wear: 0.75, wetGrip: 1.0, speed: 0.975 },
  },
  /** Usure : accélération perdue et direction moins précise à 100 % d'usure (fractions) */
  accelWearLoss: 0.25,
  steerWearLoss: 0.3,
  /** Perte d'adhérence : 1 - A×usure - B×usure^6 (falaise en fin de vie) */
  gripLossLinear: 0.14,
  gripLossCliff: 0.25,
  /** Part de la vitesse max perdue avec des pneus complètement usés */
  maxSpeedWearLoss: 0.12,
  /** Usure (part de 1 par seconde, avant multiplicateur de gomme) */
  wear: {
    base: 0.0006,
    speed: 0.0012, // × (v/vmax)²
    corner: 0.0009, // × (charge/limite)²
    brake: 0.0025, // × v/vmax, pneus avant surtout
    accel: 0.0008, // pneus arrière surtout
    offroad: 0.0025,
    slide: 0.01,
    /** Réservoir plein = voiture plus lourde = usure +x % */
    fuelMass: 0.12,
    /** Répartition avant/arrière et intérieur/extérieur */
    frontCorner: 1.15, rearCorner: 0.85, outer: 1.4, inner: 0.6,
    frontBrake: 1.3, rearBrake: 0.7, frontAccel: 0.7, rearAccel: 1.3,
  },
  /** Crevaison : usure à partir de laquelle un pneu peut éclater, probabilité par seconde */
  punctureStart: 0.97,
  punctureRatePerS: 0.25,
  punctureMaxSpeed: 24,
  punctureGripFactor: 0.45,
  /** Usure moyenne des 4 pneus à partir de laquelle on alerte */
  warnWear: 0.7,
  /** Usure à partir de laquelle on considère les pneus « finis » (avant la falaise) : sert à estimer les tours restants */
  usableWear: 0.9,
  /** Pneu crevé : charge latérale ×, probabilité de tête-à-queue par seconde au-dessus de la vitesse mini (m/s) */
  punctureSlideBoost: 1.6,
  punctureSpinRatePerS: 0.35,
  punctureSpinMinSpeed: 20,
  /** Gomme au départ */
  startCompound: 'medium' as 'soft' | 'medium' | 'hard' | 'rain',
};

/** Affichage : seuils de couleur des jauges (fraction restante). */
export const HUD = {
  gaugeGreen: 0.5,
  gaugeYellow: 0.25,
  /** Taille du compteur de vitesse (px, 96 = taille native) et échelle de la jauge d'essence */
  dialSize: 58,
  gaugeScale: 0.7,
};

export const FX = {
  /** Secousse de caméra : amplitude max (px) à vitesse max, +hors-piste. */
  shakeMax: 1,
  shakeStartRatio: 0.75,
  shakeOffroad: 2,
  /** Secousse supplémentaire (px) lors d'un choc */
  shakeHit: 3,
  /** Rayures de vitesse */
  streakStartRatio: 0.6,
  streakCount: 18,
  /** Fumée de pneus : freinage fort au-dessus de ce ratio de vitesse */
  smokeBrakeRatio: 0.35,
  /** Dérapage : |accélération latérale| (m/s) au-dessus de laquelle on fume */
  smokeLateral: 3.2,
  emitInterval: 0.07,
  rearWheelOffsetPx: 34,
  /** Rebond léger de la voiture à haute vitesse (px) */
  bounceMax: 1,
  /** Flamme d'échappement au lever de pied : vitesse mini (ratio), durée (s), position vs ancre (px) */
  flameMinRatio: 0.4,
  flameDuration: 0.3,
  exhaustOffsetPx: { x: -22, y: -14 },
  /** Dérive vers le bas des particules (px/s) : elles restent « au sol » derrière la voiture */
  particleDrift: 24,
};

/** Générateur de circuits (jalon 2). Longueurs en segments de 5 m sauf mention contraire. */
export const TRACKGEN = {
  /** Ligne droite des stands, plate, en tête de circuit (seg 0 = début de la ligne droite). */
  startStraightSegs: 84,
  finishSeg: 36,
  pitEntrySeg: 0,
  pitLaneStartSeg: 20, // biseau d'entrée de 100 m (segments 0 → 20) : braquage doux, ~17° au plus
  pitBoxFirstSeg: 24,
  pitBoxCount: 12, // un garage tous les 10 m
  pitExitSeg: 50, // biseau de sortie de 100 m (segments 50 → 70)
  /** Droite finale avant la ligne des stands (avec retour à l'altitude 0) */
  endStraightMin: 25,
  minGap: 8,
  /** Droite moyenne réservée entre deux virages pour décider du raccourcissement des virages (segments) */
  avgGapForFit: 12,
  /** Facteur minimal de raccourcissement des virages quand la longueur visée est courte */
  minCornerScale: 0.45,
  minGapAfterTight: 10,
  minGapBeforeTight: 14,
  /** Segments de montée par mètre de dénivelé : borne la pente max (~7,5 %) */
  climbSegsPerM: 4.2,
  /** Probabilités par intervalle droit (si dénivelé > 0) */
  hillChance: 0.55,
  bumpChance: 0.3,
  bumpAmplitude: [1.2, 3],
  /** Altitude minimale autorisée = -elevation × cette part */
  elevationBelow: 0.4,
  /** Tailles par type de virage : courbure (mag) et segments d'entrée / plateau / sortie */
  corners: {
    gentle: { mag: [0.025, 0.05], enter: [15, 25], hold: [20, 45], leave: [15, 25] },
    medium: { mag: [0.05, 0.09], enter: [10, 18], hold: [15, 30], leave: [10, 18] },
    tight: { mag: [0.09, 0.13], enter: [8, 12], hold: [10, 20], leave: [8, 12] },
    sweeper: { mag: [0.02, 0.035], enter: [25, 35], hold: [50, 90], leave: [25, 35] },
    chicane: { mag: [0.07, 0.1], enter: [8, 12], hold: [6, 12], leave: [8, 12] },
  },
  /** Poids de tirage = base + pente × difficulté (0..1) */
  weights: {
    gentle: [3, -2], medium: [2, 0], tight: [0.5, 2.5], sweeper: [1.5, -0.8], chicane: [0.5, 1],
  },
  /** Gain de courbure max des virages serrés avec la difficulté */
  tightMagGain: 0.35,
  /** Tolérances de la validation */
  maxSlope: 0.085,
  maxCurve: 0.2,
};

/** Course : tours, départ arrêté. */
export const RACE = {
  laps: 3,
  /** Distance de la grille derrière la ligne (m) */
  gridOffsetM: 12,
  /** Feux de départ (portique) : un feu rouge de plus par pas, `lights` feux, puis pause aléatoire avant l'extinction */
  lightStepS: 1,
  lights: 5,
  lightHoldMin: 0.5,
  lightHoldMax: 2,
  /** Durée du feu vert après le départ (s) */
  greenS: 2,
  countdownStepS: 1,
  /** Durée d'affichage de GO ! après le départ (s) */
  goDisplayS: 1,
  /** Freinage automatique après l'arrivée */
  finishBrake: 30,
};

export const MINIMAP = { size: 68, padding: 6 };

/**
 * Stands (jalon 4). Distances en m, temps en s.
 * Géométrie : la voie des stands est une 2e route (texture road_pitlane) à droite de la piste, reliée par
 * deux rampes (entrée/sortie). `laneAxis` = axe de la voie ; le côté box est à axe + boxLaneOffset.
 */
export const PIT = {
  /** Limiteur dans la voie des stands (m/s) = 80 km/h, et décélération du limiteur (m/s²) */
  speedLimit: 22.2,
  limiterDecel: 40,
  /** Distance avant l'entrée (m) à partir de laquelle le HUD rappelle de ralentir quand un arrêt est armé */
  approachHintM: 300,
  /** Axe latéral de la voie (m) : valeur à la rampe (contre la piste) et valeur dans la voie */
  rampAxis: 14.25,
  laneAxis: 17,
  boxLaneOffset: 3,
  /** Largeur de la voie de vibreur à vibreur (m) : 384 px de la texture à 27 px/m */
  roadWidth: 14.2,
  /** Vitesse latérale max de l'auto-guidage dans les rampes (m/s) */
  guideRate: 11,
  /** Braquage affiché = vitesse latérale / vitesse latérale max × ce gain (la voiture s'incline dans les biseaux) */
  steerVisualGain: 2.2,
  /** Position latérale de sortie sur la piste après la rampe */
  exitX: 2,
  /** Numéros de boîtes (0..pitBoxCount-1) : joueur et rival */
  playerBox: 4,
  rivalBox: 5,
  /** Zone d'arrêt valide autour du centre de la boîte (m) */
  stopZoneHalf: 5,
  /** Aide au stationnement : freine tout seul pour s'arrêter pile dans la boîte (décélération en m/s²) */
  autoPark: true,
  parkDecel: 9,
  /** Durée d'un pas de l'animation des mécaniciens (s) — celle de la séquence du pack */
  stepS: 0.11,
  /** Changement des 4 pneus : du vérin levé au vérin baissé = 20 pas de la séquence (s) */
  tyreServiceS: 2.2,
  tyreServiceSBase: 2.2,
  /** Ravitaillement : débit (L/s) et temps de branchement du pistolet (s) */
  refuelRate: 7,
  /** Valeurs de base (sans amélioration des mécaniciens) : `refuelRate` et `tyreServiceS` sont modifiés par le garage */
  refuelRateBase: 7,
  refuelSetupS: 0.4,
  /** Choix du joueur : gommes et niveaux de réservoir visés (fraction ; 0 = pas de ravitaillement) */
  tyreOptions: ['none', 'soft', 'medium', 'hard', 'rain'] as const,
  fuelOptions: [0, 1 / 3, 2 / 3, 1],
  /** Décor */
  wallOffset: 8.6,
  garageOffset: 27,
};

/**
 * Adversaires (jalon 5). Ils utilisent EXACTEMENT la même physique que le joueur (adhérence, pneus, carburant,
 * tête-à-queue, stands) : seul le « pilote » diffère (marge en virage, régularité, stratégie).
 * Niveaux de difficulté : `difficulty` (0 facile … 1 difficile) décale marge et puissance de tous sauf Kevin.
 */
export const AI = {
  /** Nombre d'adversaires, Kevin compris (max = nombre de profils ci-dessous) */
  count: 5,
  /** Place du joueur sur la grille (0 = pole ; Kevin y est ; la dernière place = départ en fond de grille pour remonter). Les adversaires sont classés du plus rapide au plus lent. */
  gridPlayerSlot: 5,
  gridRowGapM: 16,
  gridColumnX: 2.6,
  /** Décalage de la colonne droite par rapport à la gauche (m) */
  gridStaggerM: 8,
  difficulty: 0.5,
  /**
   * Suivi : vitesse max = vitesse de la voiture devant + √(2 × décélération de confort × (écart − distance de suivi)).
   * Cette enveloppe permet de combler un écart sans jamais devoir freiner plus fort que `followDecel` (m/s²).
   */
  followDecel: 12,
  /** Peloton « reformé » sous safety car : écart maxi entre voitures consécutives (m) pour passer le joueur en pilote auto */
  packGapM: 45,
  /** Distance de suivi supplémentaire par m/s de vitesse (m) : à 60 m/s on garde ~18 m de plus */
  followGapPerMs: 0.3,
  /** Distance d'anticipation des virages (segments) et part de freinage max utilisée par les pilotes */
  lookaheadSegs: 32,
  brakeFactor: 0.75,
  /** Estimation de consommation avant la 1re mesure (L/m) */
  fuelPerMeterGuess: 0.003,
  /** Vue vers l'avant pour suivre/dépasser (m), décalage latéral d'un dépassement (m), gain de pilotage latéral */
  sightM: 45,
  passOffsetM: 3.4,
  laneP: 0.35,
  /** Limite latérale des trajectoires visées (m) */
  roadLimit: 5.4,
  /** Rubber-banding : au-delà de rangeM d'écart avec le joueur, la vitesse visée varie de ± max (fraction) */
  rubber: { rangeM: 300, max: 0.035 },
  /** Après une sortie de piste : durée à l'arrêt avant de repartir (s) et position d'arrêt (m) */
  recoverS: 14,
  /** Panne définitive d'un adversaire (hors rival) : probabilité par seconde de course ; la voiture reste garée et une safety car sort */
  breakdownPerS: 0.0002,
  shoulderX: 9.2,
  /** Vitesse après l'arrivée (m/s) */
  finishCoastSpeed: 30,
  /** Après l'arrivée du joueur, on attend les adversaires au plus (s) */
  finishWaitS: 25,
  /**
   * Profils : margin = part de la limite d'adhérence qu'ils osent utiliser (plus haut = plus rapide, plus risqué),
   * power = part de la vitesse max utilisée, mistake = probabilité d'une erreur par virage serré,
   * aggression = audace en dépassement (0..1), followGapM = distance de suivi, pitWear = usure à laquelle ils s'arrêtent.
   */
  drivers: [
    { id: 'kevin', nameKey: 'driver.kevin', colors: ['blue', 'sky', 'navy', 'black'], margin: 0.95, power: 0.995, mistake: 0.01, aggression: 0.9, followGapM: 8, pitWear: 0.78 },
    { id: 'raoul', nameKey: 'driver.raoul', colors: ['white', 'yellow', 'beige'], margin: 0.85, power: 0.96, mistake: 0.06, aggression: 0.5, followGapM: 12, pitWear: 0.86 },
    { id: 'lola', nameKey: 'driver.lola', colors: ['green', 'orange', 'teal'], margin: 0.89, power: 0.975, mistake: 0.05, aggression: 0.6, followGapM: 11, pitWear: 0.8 },
    { id: 'mike', nameKey: 'driver.mike', colors: ['grey', 'silver', 'black'], margin: 0.8, power: 0.94, mistake: 0.08, aggression: 0.4, followGapM: 13, pitWear: 0.9 },
    { id: 'junko', nameKey: 'driver.junko', colors: ['beige', 'purple', 'pink'], margin: 0.92, power: 0.985, mistake: 0.04, aggression: 0.7, followGapM: 10, pitWear: 0.82 },
  ],
  /** Boîtes des adversaires (le joueur a PIT.playerBox, Kevin PIT.rivalBox) */
  otherBoxes: [6, 7, 8, 9],
  /** Effet de la difficulté (± par rapport à 0,5) sur marge et puissance */
  difficultyMargin: 0.06,
  difficultyPower: 0.02,
  /** Erreur : facteur appliqué à la marge dans le virage concerné */
  mistakeOvershoot: 1.14,
};

/** Safety car (jalon 5). */
export const SC = {
  /** Vitesse de la safety car (m/s) = 108 km/h */
  speed: 30,
  /** Elle apparaît à cette distance devant le leader (m) */
  aheadM: 60,
  /** Délai entre l'incident et son déploiement (s) ; durée minimale en piste (s) ; temps pour disparaître (s) */
  deployDelayS: 1,
  minDurationS: 20,
  endingS: 9,
  /** Probabilité de neutralisation après un incident d'un adversaire / du joueur, et temps de course minimal (s) */
  chanceAi: 0.8,
  chancePlayer: 0.4,
  minRaceTimeS: 12,
  /** Le joueur est plafonné (vitesse de la voiture devant / de la safety car) : décélération douce (m/s²) */
  playerDecel: 30,
  /** Distance de suivi du peloton derrière la voiture qui précède (m) */
  followGapM: 16,
  /** Dépasser sous safety car : pénalité (s) ajoutée au temps */
  overtakePenaltyS: 5,
  flashPeriodS: 0.17,
  /** La vitesse de départ de la safety car (m/s) quand elle rentre */
  exitSpeed: 60,
};

/** Contacts entre voitures. */
export const COLLISION = {
  /** Longueur et largeur de contact (m) */
  length: 4.4,
  width: 2.1,
  /** Part de l'écart de recouvrement corrigée par pas de côté */
  push: 0.6,
  /** Dégâts du joueur par m/s de vitesse relative, et vitesse perdue (fraction de vmax) à 100 % de dégâts */
  damagePerMs: 0.012,
  /** Part des dégâts subis quand le joueur est la voiture de DEVANT (percuté par l'arrière) */
  damageRearEnded: 0.3,
  damageSpeedLoss: 0.15,
  /** Dégâts à partir desquels la planche « carrosserie abîmée » s'affiche */
  damagedSheetAt: 0.3,
  /** Vitesse relative (m/s) à partir de laquelle un choc est « fort » (étincelles, secousse) */
  hardHit: 6,
};

/** Panne sèche : dépanneuse (jalon 6 : remplacer le sprite provisoire). */
export const TOW = {
  /** Immobile (< 2 m/s) en panne sèche pendant ce délai (s) avant l'arrivée de la dépanneuse */
  dryDelayS: 2,
  /** Vitesse de remorquage (m/s), pénalité (s), palier de carburant mis au stand (indice de PIT.fuelOptions) */
  speed: 30,
  penaltyS: 10,
  refuelStep: 1,
  /** Une fois la voiture déposée, la dépanneuse repart sans attendre : vitesse max (m/s) et accélération (m/s²) */
  /** Distance entre les ancres de la dépanneuse et de la voiture remorquée (m) : pare-chocs presque en contact */
  hitchM: 5,
  leaveSpeed: 25,
  leaveAccel: 10,
};

/** Mode Carrière. */
export const CAREER = {
  saveKey: 'babass-racing-save-v1',
  /** Place maximale (1 = vainqueur) pour débloquer la course suivante */
  unlockPosition: 4,
  /** Part de courses où Babass bat Kevin pour obtenir la bonne fin / la fin moyenne */
  endingGoodRatio: 0.65,
  endingMidRatio: 0.35,
  /** Délai entre l'arrivée du joueur et l'écran de résultats (s), raccourci par Entrée */
  resultsDelayS: 4,
  /** Vitesse du texte des dialogues (caractères par seconde) */
  textCps: 55,
};

/**
 * Aspiration : derrière une autre voiture (même ligne, à moins de `rangeM`), l'air est « coupé » : plus de vitesse de pointe
 * et d'accélération, d'autant plus qu'on est près. Elle vaut pour le joueur comme pour les adversaires.
 */
export const DRAFT = {
  rangeM: 30,
  /** Écart latéral maxi (m) entre les deux voitures pour être dans le sillage */
  lateralM: 1.8,
  /** Vitesse minimale (m/s) pour profiter du sillage */
  minSpeed: 25,
  /** Bonus à pleine aspiration : vitesse max (fraction) et accélération (fraction) */
  speedBonus: 0.06,
  accelBonus: 0.5,
};

/**
 * Audio (jalon 7). Volumes (0..1) et musiques. Emplacements de musiques : `music.theme` = menus, titre, histoire ;
 * en course c'est la musique de l'ambiance (`music` dans levels.json). `null` = silence.
 */
export const AUDIO = {
  master: 0.8,
  musicVolume: 0.2,
  sfxVolume: 0.8,
  /** Durée du fondu enchaîné entre deux musiques (s) */
  fadeS: 1.2,
  music: { theme: 'music/babass_racing_theme.ogg' as string | null },
};

/** Saison : points par place (6 voitures), places qualificatives pour monter, gains d'argent. */
export const SEASON = {
  points: [25, 18, 15, 12, 10, 8],
  /** Rang final au championnat (inclus) pour passer en catégorie supérieure ; sinon on rejoue toute la catégorie */
  promotionRank: 3,
  /** Prime par place (€) pour la catégorie 1 ; croît de `prizeCatGrowth` par catégorie ; bonus si Kevin est battu */
  prize: [12000, 8000, 5500, 3500, 2000, 1000],
  prizeCatGrowth: 0.3,
  beatKevinBonus: 0.15,
};

/**
 * Améliorations achetées au garage avec l'argent des courses.
 *  - mécaniciens (conservés de catégorie en catégorie) : remplissage d'essence, changement de pneus ;
 *  - pit wall (conservé) : stratège pneus (stratégie de pit préréglée à l'entrée au stand), stratège essence (appel au stand idéal) ;
 *  - voiture (remise à zéro à chaque changement de catégorie) : moteur (vitesse max), embrayage (accélération), freins (freinage, moins de tête-à-queue).
 */
export const UPGRADES = {
  maxLevel: 5,
  /** Prix de base (€) du niveau 1 ; chaque niveau coûte (1 + growth × niveau) fois plus ; × (1 + catGrowth × catégorie) */
  costBase: { refuel: 4000, tyre: 4000, engine: 5000, clutch: 4000, brakes: 4000, stratTyre: 70000, stratFuel: 70000 },
  costGrowth: 0.9,
  costCatGrowth: 0.2,
  /** Les stratèges se débloquent au milieu du jeu : à partir de cette catégorie (indice, 4 = la 5ᵉ) */
  stratUnlockCat: 4,
  /** Effet par niveau (fraction) */
  effects: {
    refuelRate: 0.12, // débit d'essence +12 % par niveau
    tyreService: 0.08, // durée de changement des pneus −8 % par niveau
    engineSpeed: 0.035, // vitesse max +3,5 % par niveau (≈ +5 km/h sur la 1re voiture)
    clutchAccel: 0.08, // accélération +8 %
    brakeDecel: 0.06, // freinage +6 %
    brakeSpin: 0.08, // seuil de tête-à-queue +0,08 de ratio
  },
};

/** Nombre de rapports de la boîte par modèle de voiture (6 par défaut). */
export const GEAR_COUNT: Record<string, number> = { f1: 8, hypercar: 8 };

/** Bornes hautes des rapports (fraction de vmax) pour `n` rapports : 6 rapports = 0.2, 0.36, … 1.0 ; 8 rapports commencent plus bas. */
export function gearTopsFor(n: number): number[] {
  const t0 = n >= 8 ? 0.15 : 0.2;
  return Array.from({ length: n }, (_, i) => t0 + (1 - t0) * (i / (n - 1)));
}

/** Rapports qui retombent plus vite quand on lève le pied ou freine (voitures sportives à boîte courte). */
export const DOWNSHIFT: Record<string, number> = { f1: 0.22, hypercar: 0.2, gt3: 0.18 };
