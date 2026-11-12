# Babass Racing

Jeu de course old school façon OutRun — TypeScript + Vite + Canvas 2D, aucune dépendance au runtime.
État : **jalon 7 (version jouable complète)** (conduite, circuits à seed, tours, carburant, pneus, stands, adversaires IA, safety car). Voir la feuille de route plus bas.

## Lancer

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + build de production dans dist/
```

Contrôles : flèches / WASD (ZQSD) pour diriger et accélérer, **Espace** ou ↓ = frein, **P** = armer/annuler l'arrêt au stand, **1** = pneus (garder/tendre/dur), **2** = carburant (aucun/⅓/⅔/plein), **R** = relancer la course, **F3** = compteur FPS et touches de test (T = pneus tendres neufs, Y = pneus durs neufs, G = plein).
Sur mobile : boutons tactiles à l'écran.

Paramètres d'URL de debug : `?car=gt3_blue` (modèle_coloris, cf. `public/assets/cars/`), `?level=ville_nuit`
(cf. `public/assets/levels.json`) le circuit : `?seed=7&length=3600&corners=10&elev=14&diff=0.5`, et la course : `?laps=8&tyre=hard&fuel=0.5`.

## Structure

```
src/
  config/balance.ts   TOUTES les valeurs d'équilibrage et de réglage (rendu, physique, effets)
  core/               boucle à pas fixe 60 Hz, entrées clavier/tactile, chargement d'assets, RNG à seed
  track/segments.ts   segments de route, TrackBuilder (sections entrée/plateau/sortie), repères du stand
  track/generator.ts  génération d'un circuit en boucle à partir d'une seed + validation
  track/decor.ts      arbres, panneaux, chevrons, portique, tribunes, zone des stands
  track/minimap.ts    mini-carte schématique (cap intégré, boucle refermée)
  sim/fuel.ts         réservoir (conso selon accélération/vitesse, panne sèche)
  sim/tyres.ts        4 pneus : usure par roue, gommes tendre/dure, adhérence, crevaison
  sim/pit.ts          arrêt au stand : entrée guidée, limiteur, stationnement, service, sortie
  sim/field.ts        le peloton : grille, classement, contacts, incidents, safety car, sprites
  ai/driver.ts        pilote IA (commandes envoyées à une vraie voiture : même physique que le joueur)
  ai/roster.ts        composition des adversaires (profils, coloris, boîtes)
  ai/safetycar.ts     safety car (déploiement, peloton regroupé, sortie)
  audio/audio.ts      WebAudio : moteur synthétisé, dérapages, stand, chocs, bips des feux, musiques OGG en boucle
  sim/race.ts         décompte, tours, chronos, arrivée
  i18n/               textes (fr.ts) et fonction t()
  sim/player.ts       conduite : accélération, direction, force centrifuge, hors-piste, boîte auto
  render/road.ts      projection pseudo-3D de la route (voir le commentaire de tête : à lire)
  render/background   ciel, nuages, horizon en parallaxe
  render/car.ts       voiture du joueur (braquage, freinage, pentes)
  render/fx.ts        fumées, poussière, flamme, secousse caméra, rayures de vitesse
  render/pitcrew.ts   mécaniciens animés (séquence du pack) + voiture sur vérins
  render/hud.ts       compteurs et polices bitmap
public/assets/        pack d'assets (voir public/assets/README.md pour les formats)
```

## Principes de rendu

- Résolution interne 480×270 (celle pour laquelle le pack est calibré), upscale CSS `image-rendering: pixelated`.
- Route : segments de 5 m projetés du plus proche au plus lointain ; virages = accumulation de courbure ;
  collines = altitude par segment ; chaque ligne écran échantillonne la texture de route (27 px = 1 m).
- Sprites : échelle = `(focal / profondeur) / pixels_per_meter`, ancre posée au sol, masqués par les crêtes.

## Circuits inspirés des tracés officiels (F1 / WEC)

La carrière utilise 16 circuits inspirés de tracés réels (Red Bull Ring, Zandvoort, Hungaroring, Fuji, Barcelone, Sakhir, Imola, Nürburgring GP,
COTA, Silverstone, Interlagos, Monza, Suzuka, Monaco, Spa-Francorchamps, Le Mans) définis dans `track/layouts.ts` par une petite syntaxe
(`S34^+6 Rh S28 Rt Lm Rc …` : droites, virages à droite/gauche léger/moyen/serré/épingle/courbe/chicane, dénivelés). Ce sont des
**approximations schématiques faites de mémoire** (ordre, sens et type des virages, quelques dénivelés), pas des relevés : les droites sont
recalibrées pour atteindre la longueur de la course. Pour affiner un circuit, modifier sa chaîne de jetons ; pour en ajouter un, ajouter une
entrée à `LAYOUTS`, son nom `circuit.<id>` dans `i18n/fr.ts`, puis l'id dans `LAYOUT_ORDER` de `config/categories.ts`.
`?layout=spa&length=5200&car=f1_red` lance un circuit directement.

## Circuits générés

`generateTrack({ seed, lengthM, corners, elevation, difficulty, theme })` — même seed = même circuit.
Structure : ligne droite des stands plate (seg 0-83, ligne d'arrivée au seg 36, entrée des stands au seg 0,
12 garages) → virages séparés par des droites avec collines/bosses → droite finale qui ramène l'altitude à 0.
Contraintes (réglées dans `TRACKGEN`) : pente ≤ 8,5 %, pas deux virages serrés d'affilée, droite mini
avant/après un serré, pas de dénivelé dans un serré. `validateTrack()` vérifie la faisabilité.

## Carburant et pneus

Tout est réglé dans `config/balance.ts` (`FUEL`, `TYRES`, `PHYSICS`).
- **Carburant** : conso = ralenti + pleine charge × (0,35 + 0,65 × vitesse) en accélérant. Panne sèche : vitesse plafonnée
  à ~32 km/h. Réservoir vide = voiture plus légère (léger bonus d'accélération) ; plein = usure des pneus un peu plus forte.
- **Pneus** : usure par roue selon la vitesse, les virages (pneus extérieurs et avant surtout), les freinages
  (avant), les accélérations (arrière), l'herbe et les dérapages. Adhérence = gomme × (1 − usure linéaire − « falaise » en
  fin de vie) ; réglée douce (`TYRES.gripLossLinear` 0,14, `gripLossCliff` 0,25 : environ −27 % d'adhérence à 90 % d'usure). Tendre : plus d'adhérence, usure ×1,6 ; dur : usure ×0,75.
- **Effets** : moins d'adhérence → direction moins efficace (sous-virage), poussée vers l'extérieur plus forte, perte de
  vitesse en virage ; au-delà de la limite d'adhérence, dérapage (fumée) puis tête-à-queue si on insiste. Un pneu usé à
  plus de 97 % peut éclater : vitesse plafonnée à ~86 km/h jusqu'au stand.

## Arrêts au stand

Config : `PIT` dans `config/balance.ts` (limiteur, durées, débit de ravitaillement, boîtes…).
1. **Choisir** (en roulant) : `P` arme l'arrêt, `1` choisit les pneus (garder / tendre / dur), `2` le carburant visé
   (aucun / 33 % / 67 % / plein). Le HUD indique les litres à ajouter et la durée d'immobilisation estimée.
2. **Entrer** : on freine soi-même avant l'entrée (le HUD rappelle de ralentir) ; le limiteur (80 km/h) ne s'enclenche qu'une fois sur la voie des stands, et la voiture est guidée jusqu'à la voie
   des stands (2ᵉ route à droite de la piste : un biseau de 100 m s'ouvre depuis le bord de la piste à l'entrée, et se referme de même à la sortie).
3. **S'arrêter** : l'aide au stationnement amène la voiture pile dans la boîte (`PIT.autoPark`; désactivée, il faut
   freiner à la main dans la zone ±5 m, sinon l'arrêt est raté).
4. **Service** : voiture immobilisée ; pneus = 2,2 s (voiture sur vérins), ravitaillement = 0,4 s + litres ÷ 7 L/s ;
   les deux se font en parallèle (durée = le plus long). Les mécaniciens suivent la séquence du pack.
5. **Repartir** : feu vert, la voiture repart seule jusqu'au bout de la rampe de sortie, puis le joueur reprend la main.
Ajouter une boîte : augmenter `TRACKGEN.pitBoxCount` ; rival = `PIT.rivalBox` (utilisé au jalon 5).

## Adversaires et safety car

Config : `AI`, `SC`, `COLLISION` dans `config/balance.ts`.
- **Même physique que le joueur** : chaque adversaire est une vraie voiture (adhérence, usure, carburant, tête-à-queue, stands). Le
  « pilote » envoie braquage/gaz/frein : il vise la vitesse que permet l'adhérence dans les virages à venir (marge propre au pilote),
  freine à temps, suit la voiture devant (distance de suivi qui grandit avec la vitesse) et la dépasse par le côté s'il est plus rapide.
- **Kevin** : plus agressif (marge 0,95, dépasse plus près et plus tôt) et régulier (peu d'erreurs, rubber-banding réduit),
  gère carburant et pneus et s'arrête aux stands (boîte 5, à côté de celle du joueur). Les autres pilotes ont des marges, une
  régularité et des seuils d'arrêt différents (`AI.drivers`) ; `AI.difficulty` décale tout le monde (par catégorie plus tard).
- **Stratégie stand** : une décision par tour (usure projetée, carburant pour le tour suivant / pour finir, crevaison) ; gomme choisie
  selon les tours restants ; sous safety car ils profitent de l'arrêt « bon marché » plus tôt.
- **Rubber-banding léger** : ± 3,5 % de vitesse visée selon l'écart avec le joueur (Kevin : 40 % de cet effet).
- **Contacts** : les voitures s'écartent, celle de derrière perd de la vitesse ; le joueur subit des dégâts (carrosserie abîmée,
  vitesse max réduite, réparée à tout arrêt au stand) ; un gros choc entre adversaires peut provoquer un tête-à-queue.
- **Safety car** : un tête-à-queue (d'un adversaire ou du joueur) peut la déclencher. Elle apparaît très vite (`SC.deployDelayS` = 1 s) et juste devant le leader (`SC.aheadM` = 60 m, ~108 km/h),
  le peloton se regroupe derrière (chacun peut combler l'écart avec la voiture de devant mais pas la dépasser), la voiture accidentée
  se gare sur le bas-côté avec un commissaire au drapeau jaune, puis repart. Dépasser sous safety car coûte 5 s de pénalité
  (sauf voiture garée / au stand). Elle rentre au premier passage du leader sur la ligne après `SC.minDurationS`.
  S'arrêter pendant la neutralisation coûte moins cher : le reste du peloton roule lentement.

## Départ, menu de stand, pilote auto, dépanneuse

- **Départ** : feux rouges du portique (un de plus par seconde, 5 feux, pause aléatoire 0,5–2 s) puis extinction = départ (`RACE`).
- **Menu de stand** : en entrant dans la voie des stands (arrêt armé avec `P`), le jeu se met en pause ; `1` pneus, `2` essence,
  `Entrée` valide. Il indique les tours de course restants, les tours que permet l'essence actuelle / après ravitaillement et les
  tours de gomme du choix (estimés sur ta conso et ton usure mesurées).
- **Pilote auto** : sous safety car, dès que tout le peloton est reformé, la voiture suit toute seule jusqu'au feu vert.
- **Panne sèche** : après 2 s à l'arrêt, une dépanneuse (sprite `towtruck_yellow`, `TOW`) remorque la voiture à 108 km/h
  jusqu'à sa boîte, ravitaille (⅓ de réservoir) et ajoute une pénalité de 10 s.
- Crevaison : dérapages et tête-à-queue beaucoup plus fréquents (`TYRES.puncture*`).

## Carrière, histoire, menus

Parcours : écran titre → (nouvelle partie : couleur d'écurie → **nom du pilote et de l'écurie** → introduction) → **garage** → porte =
sélection de course → (briefing) → course → résultats (podium, classement, **points et prime d'argent**) → scène d'après-course → garage…
Chaque catégorie est une **saison** de 4 à 6 courses (`RACES_PER_TIER` dans `config/categories.ts`, circuits pris dans `LAYOUT_POOL`, 24 tracés).
À chaque course, tous les pilotes marquent des points selon leur place (`SEASON.points`) ; à la fin de la saison, il faut être dans les
**3 premiers du classement** (`SEASON.promotionRank`) pour monter, sinon on **rejoue toute la catégorie** (argent et améliorations conservés).
Une scène de fin de saison (différente selon promu/non promu et devant/derrière Kevin) suit l'écran de classement final.
**Échap** en course = retour à la sélection. Sauvegarde : `localStorage` (`CAREER.saveKey`, format v2 ; une ancienne sauvegarde redémarre la carrière).
Les paramètres d'URL de debug (`?seed=…`, `?laps=…`, `?car=…`) lancent directement une course libre sans menus.

### Garage et améliorations (`ui/garage.ts`, `UPGRADES` / `SEASON` dans `config/balance.ts`)
Scène du pack `garage/garage.json` : zones sélectionnables aux flèches ou au clic (voiture/pièces, mécanos, bureau, tableau, porte, télé, sponsors).
- **Mécaniciens** (conservés d'une catégorie à l'autre) : vitesse de ravitaillement, vitesse de changement de pneus (5 niveaux).
- **Mur des stands** (conservé, cher, débloqué à partir de la catégorie 5) : stratège pneus (gomme préréglée à l'entrée au stand), stratège essence
  (plein préréglé et appel « rentre au stand » au moment idéal).
- **Voiture** (remise à zéro à chaque changement de catégorie) : moteur (vitesse max +3,5 %/niveau), embrayage (accélération +8 %), freins (freinage +6 %, seuil de tête-à-queue +0,08). La fiche affiche 4 jauges (vitesse max, accélération, freinage, tenue) : bleu = valeur de base, vert = gain des améliorations (valeurs lues dans `UPGRADES.effects`, les textes du jeu aussi).
  Ces bonus sont propres à la voiture du joueur (`Player.perf`), les adversaires gardent la physique de la catégorie.
- **Tableau** : classement de la saison ; prix = base × (1 + croissance × niveau) × (1 + croissance catégorie).

### Écurie, réglages du son, éditeur de dialogues
- **Couleur d'écurie** : choisie à la « Nouvelle partie » (8 couleurs, `config/teams.ts`) ; chaque modèle de voiture prend le coloris disponible le plus proche.
- **Réglages du son** : depuis l'écran titre (« Réglages du son ») : volume général, musique, effets, son coupé ; sauvegardés dans le `localStorage`.
- **Dialogues** : `src/story/dialogues.json` (noms des personnages, introduction, 3 fins, fin de saison par catégorie, et pour chaque course « avant » et « après » ;
  chaque réplique a un personnage, une expression, un texte et une condition `if` facultative : `result` won/podium/noPodium, `rival` ahead/behind, `season` promoted/notPromoted).
  Variables : `{pilote}` `{ecurie}` `{kevin}` `{elle}` `{marcel}` `{leo}` `{cat}` `{pos}` `{rival}` `{n}`.
  Éditeur local (non versionné, dossier `tools/` ignoré par git) : `npm run dev` puis ouvrir `http://localhost:5173/tools/dialogue-editor.html` :
  ajouter, supprimer, réordonner, dupliquer des répliques, **renommer les personnages**, choisir qui parle, son expression et les conditions, et prévisualiser selon le résultat / le rival / la saison.

### Ajouter un circuit ou une catégorie (`src/config/categories.ts`)
- **Circuit** : ajouter une course à une catégorie en augmentant son nombre dans `RACES_PER_TIER` ; la seed est fixe
  (`100 + n×13`) donc le circuit est toujours le même. Son nom : clé `track.name.<n>` dans `i18n/fr.ts`.
- **Catégorie** : ajouter `[modèle, coloris]` dans `TIERS` (+ nombre de courses, tours), le nom `cat.<modèle>` et `car.<modèle>` dans
  `i18n/fr.ts`. Performances (vitesse, accélération) et niveau des adversaires se déduisent de la position dans la liste.

### Ajouter une ligne de dialogue (`src/story/scenes.ts` + `src/i18n/fr.ts`)
1. Écrire le texte dans `i18n/fr.ts` (clé `story.…`, variables `{kevin}` `{elle}` `{cat}`).
2. L'ajouter à la scène voulue : `L('elle', 'happy', 'story.ma.cle')` (personnages : babass, marcel, kevin, elle, leo ;
   expressions : neutral, happy, laugh, angry, determined, surprised, sad, worried, smug, wink ; `talk`/`talk_happy` sont alternées automatiquement pendant la frappe du texte). Le prénom d'« Elle » se change avec `name.elle`.

## Audio

`AUDIO` dans `config/balance.ts` : volumes et musique des menus (`music.theme`) ; en course, la musique est celle de l'ambiance
(`music` dans `levels.json`). **M** coupe/remet le son (mémorisé). Le contexte audio démarre au premier appui sur une touche ou
un clic (règle des navigateurs). Sons : moteur (oscillateurs selon le régime et les gaz), crissement en dérapage/freinage,
vibreur hors piste, pistolets à écrous et tuyau d'essence au stand, chocs, tête-à-queue, crevaison, bips des feux de départ,
alerte de safety car. Pas de fichier son à ajouter : seuls les OGG de musique du pack sont chargés.

## Stratégie avant la course

Après le chargement (carrière et Time Attack), un écran permet de régler la **gomme de départ** et le **carburant de départ**
(25 % à 100 %, `FUEL.startOptions`). Il affiche les tours de gomme et d'essence que cela permet (estimation par un tour virtuel sur le
circuit) et si un arrêt sera nécessaire. Moins d'essence = voiture plus légère = plus rapide (`FUEL.speedBonusEmpty`,
`accelBonusEmpty`). En course, plus aucun affichage du choix pneus/essence : tout se règle à l'entrée dans la voie des stands (menu en pause).

## Gommes et météo

Quatre gommes (`TYRES.compounds`) : **tendre** (la plus rapide, la moins durable), **intermédiaire** (rapide et durable : un peu moins
rapide que le tendre, moins durable que le dur), **dur** (la moins rapide, la plus durable), **pluie** (comme un dur au sec, mais
ne glisse pas sur le mouillé). Sur piste mouillée (ambiance « pluie », `WEATHER.wetness`), les trois gommes sèches perdent ~30-38 % d'adhérence.
L'usure fait perdre de l'adhérence (falaise en fin de vie), de la vitesse max (−12 % à 100 %), de l'accélération (−25 %) et de la précision
de direction (−30 %). Au stand : `1` fait défiler aucune / tendre / intermédiaire / dur / pluie ; les IA choisissent la gomme selon la météo
et les tours restants.

## Time Attack

Depuis l'écran titre : **Contre-la-montre**. On choisit la voiture (une par catégorie), le circuit (les 25 de la carrière) et la gomme de départ,
puis on tourne seul, sans limite de tours, sans safety car. Le meilleur tour de chaque couple circuit + voiture est sauvegardé
(`localStorage`, `career/records.ts`) et affiché en course ; « NOUVEAU RECORD ! » s'affiche quand on le bat. Échap = retour au choix.

## Pilotage : il faut freiner

La force centrifuge (`PHYSICS.centrifugal` = 120) est telle que les virages moyens et serrés ne passent PAS à pleins gaz : pour chaque virage il
y a une vitesse limite (≈ 80 % de la vitesse max en virage moyen, ≈ 55 % en épingle) ; au-delà la voiture dérape, puis part en tête-à-queue.
Mesure (pilote automatique, 10 catégories) : en lâchant tout sans freiner, 2 à 6 tête-à-queue par tour et deux fois plus d'usure des pneus pour un
gain de temps nul ou négatif. Plus on monte en catégorie, plus la voiture tient la route : appui `gripLimit` 7 → 12 et stabilité 0 → 1 (glissade qui pousse moins, tête-à-queue plus tardif). Sans freiner : retro/hot hatch 4-5 tête-à-queue et ~15-19 s de glissade par tour ; GT3/hypercar/F1 : 0 tête-à-queue et ~4 s de glissade (mais toujours plus d'usure : freiner reste payant).
Le réservoir grandit avec la catégorie (60 → 78 L) : un arrêt devient utile dès la 5ᵉ catégorie et nécessaire en hypercar / F1.

### Lisibilité des virages
La route plie 1,9× plus à l'écran que sa courbure physique (`RENDER.curveVisualGain` ; la physique, les collisions et la mini-carte ne changent
pas), le fond défile 1,4× plus vite en virage (`parallax.scrollPerCurveSpeed`) et une annonce de copilote (« DROITE EPINGLE 120 M », pictogramme
coudé) apparaît pour les virages marqués dans les ~300 m.

## Écart entre catégories

De la catégorie 1 à 10, vitesse max, accélération et appui augmentent (`CATEGORIES` : 150 → 280 km/h, accélération 14 → 32 m/s², appui 6 → 14).
Mesures (pilote automatique, 1 tour) : vitesse moyenne 139 km/h en retro, 189 en muscle, 232 en futur, 262 en hypercar, 275 en F1.
Les menus affichent la vitesse max de la voiture.

## Équilibrage et tests de jouabilité

Toutes les valeurs sont dans `config/balance.ts` (`PHYSICS`, `FUEL`, `TYRES`, `PIT`, `AI`, `SC`, `DRAFT`, `COLLISION`, `CAREER`) et
`config/categories.ts`. Mesures avec un pilote automatique (sans arrêt, pneus tendres / durs) :
- Retro et Hot hatch (3 tours) : on finit sans s'arrêter (pneus tendres à ~65 %).
- Pick-up / Muscle (4 tours) : tendres usés ou crevés en fin de course, durs OK : choix tendre + arrêt ou dur sans arrêt.
- Wedge et au-delà (5 à 8 tours) : panne sèche avant l'arrivée ; en F1 les pneus durs crèvent aussi : l'arrêt est indispensable.
- Les 25 circuits de la carrière sont valides (`validateTrack`) ; 6 courses complètes (retro → F1) se terminent avec tous les
  concurrents ; coût de simulation ≈ 0,01 ms par pas, rendu ≈ 2 ms par image (processeur de bureau).

## Feuille de route

1. ✅ Squelette, route pseudo-3D, voiture contrôlable
2. ✅ Générateur de circuits à seed, tours, mini-carte
3. ✅ Carburant, usure des pneus, HUD
4. ✅ Pit lane et arrêts au stand
5. ✅ IA (Kevin), classement, safety car
6. ✅ Carrière, histoire, menus, sauvegarde
7. ✅ Audio, polish, équilibrage

### Progression des voitures (du moins rapide au plus rapide)

`retro` → `hothatch` → `pickup` → `muscle` → `wedge` → `supercar` → `futur` → `gt3` → `hypercar` → `f1`
(+ `safetycar` pour les neutralisations).

## Ajouter un circuit / une catégorie / une ligne de dialogue

Ces points seront documentés avec les jalons 2 (circuits), 6 (catégories, dialogues, i18n).
