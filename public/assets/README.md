# Babass Racing — pack d'assets, guide d'intégration

Pixel art, PNG transparents, à afficher en **nearest-neighbor** (pas de lissage).
Toutes les marques des panneaux sont inventées.

## Conventions communes

- Chaque sprite a une **ancre** (`anchor.x`, `anchor.y`, en px dans la frame) : c'est le point de contact au sol, à poser sur la position écran de l'objet.
- Chaque sprite a une échelle `pixels_per_meter` (ppm). Pour un objet à la profondeur `z` (mètres devant la caméra) :
  `scale = (f / z) / ppm`, `screenX = W/2 + (x - camX) * f / z`, `screenY = horizon + camH * f / z`.
- Réglages utilisés pour les aperçus : écran 480×270, `horizon = 130`, `f = 300`, `camH = 3.2 m`. La voiture du joueur est dessinée à l'échelle 1 (36 ppm), soit `z = f / 36 ≈ 8.33 m`, ancre à `screenY = 130 + 3.2 * 36 = 245`.
- Dessiner du plus loin au plus près (tri par `z` décroissant).

## cars/

`cars.json` : pour chaque voiture (`safetycar`, `hothatch`, `gt3`, `f1`, `hypercar`, `muscle`, `retro`, `wedge`, `futur`, `supercar`, `pickup`) → `sheets` (6 coloris, 1 seul pour la safety car), `brake_sheets`, `frame` 160×96, `anchor`, `pixels_per_meter` (36), `frames`, `yaw_deg`, `pit_sheets`, `pit_frames`.

**Planche de virage** `<car>_<couleur>.png` : 7 frames horizontales de 160 px.

| index | 0 | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|---|
| nom | left3 | left2 | left1 | center | right1 | right2 | right3 |

Animation de braquage : garder une valeur `steer` dans [-1, 1] lissée dans le temps (par ex. `steer += (input - steer) * 10 * dt`), puis `frame = round(3 + steer * 3)`. Pas de boucle : c'est l'entrée du joueur qui pilote la frame. Les mêmes planches servent pour les adversaires (frame choisie selon la courbure de la route et leur décalage latéral).

**Planche stand** `<car>_<couleur>_pit.png` : 2 frames de 160 px, même ancre. `0 = jacked` (levée sur vérins, roues en place), `1 = no_wheels` (levée, roues démontées).

**Feux de frein** `<car>_<couleur>_brake.png` : même planche, feux arrière allumés avec halo. Afficher cette planche à la place de la normale tant que le joueur freine (même index de frame).

**Safety car** `safetycar_silver.png` (et `_brake`) : **2 rangées** de 7 frames. Rangée 0 = `flash_a` (lampe gauche allumée), rangée 1 = `flash_b` (lampe droite). Alterner les rangées toutes les 150–200 ms pour le gyrophare ; la colonne suit le braquage comme les autres voitures. Pas de planche `_pit`.

**Montées / descentes** `<car>_<couleur>_up.png` et `_down.png` : 7 frames de braquage comme la planche normale, mais en **160×112** avec leur propre ancre (`slope.anchor` dans `cars.json`). `up` = voiture cabrée de 7° (on voit moins le dessus), `down` = plongeante de 7° (on voit plus le toit). Choisir la planche selon la pente du segment sous la voiture (seuil conseillé : pente > +3 % → `up`, < −3 % → `down`), même index de frame que le braquage.

**Tête-à-queue** `<car>_<couleur>_spin.png` : 16 frames de **240×112** (ancre `spin.anchor`), une tous les 22,5°. Frame 0 = vue de dos, frame 4 = profil (nez à droite), frame 8 = vue de face, frame 12 = profil (nez à gauche). Lire dans l'ordre pour une rotation vers la droite, à l'envers pour la gauche ; 15–20 fps, ralentir sur le dernier tour. La frame 8 sert aussi de vue de face (rétroviseur, écran de sélection).

**Dégâts** `<car>_<couleur>_damaged.png` : planche de braquage (7 frames, même format et même ancre que la normale) avec éraflures, feu arrière gauche cassé et aileron tordu. **Crevaison** `<car>_<couleur>_puncture.png` : idem, pneu arrière gauche à plat et caisse penchée. Remplacer la planche normale tant que l'état dure. La safety car n'en a pas.

## pit/

**Mécaniciens** `mechanic_<red|blue|black>.png` : 17 frames de 96×84, ancre (48, 76), 36 ppm. Dessinés **tournés vers la gauche** ; miroir horizontal pour la droite (l'ancre est centrée, donc inchangée).

| animation | frames | cadence conseillée | boucle |
|---|---|---|---|
| idle | 0 | — | — |
| walk | 1–6 | 10 fps | oui |
| carry_tyre (marche avec pneu) | 7–12 | 10 fps | oui (frame 7 seule = debout avec pneu) |
| wheel_gun (à genoux, pistolet) | 13–14 | 9 fps | oui |
| refuel (tuyau) | 15–16 | 4–5 fps | oui |

**Séquence d'arrêt au stand** (celle de `previews/preview_pitstop.gif`, pas de 110 ms, `t` = numéro de pas). Positions en px relatives à l'ancre de la voiture, à l'échelle 1 ; `côté = +1` à droite, `-1` à gauche. Un mécanicien côté droit regarde la voiture donc **sans miroir** ; côté gauche **avec miroir** ; inverser quand il repart.

| acteur | cible (dx, dy) | arrive | action sur place | repart |
|---|---|---|---|---|
| pistolet ×2 (un par côté) | (±60, +7) | walk, t 0→10 depuis ±300 | wheel_gun animé t 10–16 puis t 20–26, figé entre les deux | walk, t 28→38 |
| porteur de pneu ×2 | (±104, +11) | carry_tyre, t 3→14 depuis ±340 | frame 7 figée t 14–28 | carry_tyre, t 28→39 |
| ravitailleur ×1 (gauche) | (−66, −14) | walk, t 1→12 depuis −300 | refuel t 12–27 | walk, t 27→38 |

Voiture pendant la séquence : `center` (t < 8) → `jacked` (8–16) → `no_wheels` (16–20) → `jacked` (20–28) → `center` (t ≥ 28). Ordre d'affichage : voiture d'abord, puis mécaniciens triés par `dy` croissant.

**Autres fichiers**
- `pit_props.png/.json` : `tyre_rear_view`, `tyre_side_view`, `tyre_stack`, `fuel_rig`, `tool_cart`, `jerrycan` (36 ppm).
- `pit_buildings.png/.json` : `garage_red|blue|black|closed` (160 px de large, juxtaposables, 20 ppm), `pit_wall` (juxtaposable), `pit_timing_stand`, `lollipop_stop`.
- `road_pitlane.png` : texture de route (voir roads/). `overlay_pit_box.png` : marquage d'emplacement, transparent, centré sur la voie de droite (à 3 m à droite de l'axe de la route).

## roads/

Textures vues de dessus, 512×64. En largeur : 27 px = 1 m (512 px ≈ 19 m, axe de la route à x = 256). En hauteur : 2 bandes de 32 lignes, chaque bande = 5 m de route (alternance clair/sombre, vibreurs bicolores, pointillés sur la bande 0).

Rendu pseudo-3D, pour chaque ligne écran `y` sous l'horizon :
`z = camH * f / (y - horizon)`, ligne de texture `v = floor(z / 5 * 32) mod 64` (ajouter la distance parcourue à `z` pour faire défiler), puis pour chaque pixel `x` : `u = 256 + ((x - W/2) / (f / z) + camX) * 27`, borné à [0, 511].

`roads.json` donne pour chaque texture la position en px de l'accotement, du vibreur, de la ligne de rive et de la chaussée, ainsi que la palette (utile pour dessiner la route sans texture).

**Surcouches** (`overlay_start_line`, `overlay_grid_slots`, `overlay_pit_box`) : 512×64 transparents, **64 lignes = 10 m**. Pour une surcouche placée à `z0` : `r = floor((z - z0) / 10 * 64)` ; si `0 ≤ r < 64`, dessiner la ligne `r` par-dessus la route. Les deux premières sont calées sur les routes 3 voies (pas sur `road_kart`).

## start/

- `gantry_start.png`, `gantry_finish.png` : portiques 420×170, 19 ppm, à placer à x = 0 (axe de la route).
- `start_lights.png` : 7 frames de 108×31 à coller dans `lights_slot` du portique (voir `start.json`) : `off, red1, red2, red3, red4, red5, green`.
  Séquence de départ : `off` → un feu rouge de plus chaque seconde (`red1`…`red5`) → pause aléatoire 0,5–2 s → `off` (départ) ; `green` est disponible pour une variante.

## scenery/

Atlas + JSON (`x, y, w, h, anchor, pixels_per_meter`) :
- `trees` : `tree_oak`, `tree_oak_autumn`, `tree_cherry`, `tree_pine`, `tree_pine_snow`, `tree_palm`, `tree_cypress`, `bush`, `cactus`, `rock` (20 ppm).
- `billboards` : 8 `billboard_*` (16 ppm) et 3 `banner_*` (20 ppm).
- `signs` : `brake_300|200|100|50`, `chevron_left|right`, `chevron_yellow_left|right`, `pit_entry`, `pit_speed_limit`, `light_panel_yellow|green|red|blue|sc`, `checkered_board`, `cone`, `tyre_wall`, `concrete_barrier`, `grandstand`.

**Commissaires** `marshal_<yellow|green|blue|red|white|checkered>.png` : 4 frames de 144×136 (ancre et cadence dans `marshals.json`), 36 ppm, drapeau agité en boucle à 6 fps. Dessinés pour un poste à droite de la piste ; miroir horizontal pour la gauche.

**Tribune animée** `grandstand_anim.png` : 4 frames de 262×120, boucle à 6 fps (spectateurs qui se lèvent, flashs), même taille et même ancre que `grandstand` de l'atlas `signs` (14 ppm).

Autres objets : pas d'animation, seulement la mise à l'échelle par la profondeur. Placement typique : arbres à ±13–15 m de l'axe, panneaux de freinage et chevrons à ±11–12 m, panneaux pub à ±15–17 m.

**Structures au-dessus de la piste** `overhead.png/.json` (19 ppm, à placer à x = 0) : `tunnel_entrance` (ouverture transparente), `tunnel_ring` (intérieur sombre avec lampes : en placer un tous les 8–10 m derrière l'entrée, et remplacer ciel/horizon par du noir tant que la caméra est dans le tunnel), `bridge`, `ad_gantry_gommax|voltix|air_pixel`.

**Bâtiments et décors variés** `buildings.png/.json` : `control_tower`, `paddock`, `big_screen`, `house`, `floodlight`, `lamppost`, `tv_tower`, `marshal_post`, `hay_bale`, `fence` (juxtaposable), `ferris_wheel`, `wind_turbine`, `lighthouse`, `snowman`, et deux objets volants à poser dans le ciel (ancre = bas du sprite) : `hot_air_balloon`, `blimp`. Arbres ajoutés à l'atlas `trees` : `tree_birch`, `tree_dead`, `bush_flowers`.

**Versions nuit** `trees_night`, `billboards_night`, `signs_night`, `buildings_night` : mêmes sprites et mêmes rectangles que les atlas de jour (JSON identiques), assombris ; les faces des panneaux pub, panneaux lumineux, chevrons, projecteurs, lampadaire et écran géant restent éclairés.

## people/

- `driver_<red|blue|white|green>.png` : 16 frames de 96×108 (`people.json` → `drivers`). `idle` 0, `walk` 1–6, `get_up` 7–9 (accroupi → debout : à jouer à côté de la portière pour la sortie de voiture, 6 fps), `cheer` 10–13 (face caméra, boucle 8 fps), `trophy` 14–15 (coupe levée, boucle 3 fps).
- `photographer_<green|blue>.png` : 4 frames de 96×84 : `stand`, `stand_flash`, `kneel`, `kneel_flash`. Afficher la frame `_flash` pendant 1 frame à intervalles aléatoires (0,5–2 s).
- `podium.png/.json` : `podium` (avec `stand.p1|p2|p3` = décalage en px de l'ancre de chaque pilote par rapport à l'ancre du podium), `podium_backdrop`, `trophy_gold|silver|bronze`.
- Confettis : `fx/fx_confetti.png`, 6 frames de 96×96 en boucle (10 fps), juxtaposables pour couvrir l'écran.

Séquence de fin de course type : voiture arrêtée → `get_up` à côté de la voiture → `walk` vers le podium → `cheer` sur sa marche → `trophy` pour le vainqueur, confettis par-dessus, photographes devant avec flashs.

## Virages et relief (pas de sprite nécessaire)

Les virages ne sont pas des images : ils se fabriquent par code à partir de la texture de route droite. Chaque segment de piste a une `curve` (courbure) et une pente. En dessinant de bas en haut, accumuler un décalage horizontal : `dx += curve_du_segment` puis `x_offset += dx` à chaque ligne, et ajouter `x_offset` (en mètres) au `camX` de la formule de la section roads/. Les sprites de décor du segment reçoivent le même décalage. Pour le relief, faire varier la hauteur du sol par segment et décaler `screenY` en conséquence. Les chevrons, panneaux de freinage et planches `left*/right*`, `_up/_down` des voitures servent à habiller ces virages et ces pentes.

## backgrounds/

- `sky_*.png` : 1024×256, opaques, raccord horizontal. Coller le bas du ciel sur la ligne d'horizon.
- `horizon_*.png` : 1024×128, transparents, raccord horizontal, bas posé sur l'horizon.
- `sky_*_clear.png` : les mêmes ciels sans nuages, à combiner avec les couches de nuages.
- `clouds_<day|sunset|night|storm>_far.png` (1024×96) et `_near.png` (1024×128) : couches de nuages transparentes à raccord horizontal. `clouds.png/.json` : 6 nuages isolés par ambiance (`cloud_<ambiance>_1..6`).
- Parallaxe à plusieurs couches conseillée : ciel × 0,1, nuages lointains × 0,2, nuages proches × 0,35, horizon × 0,6 ; les nuages peuvent en plus dériver lentement avec le temps.
- Parallaxe simple : décaler en x selon le cumul de courbure de la route, par ex. ciel × 0,3 et horizon × 0,6, avec répétition (modulo 1024).

## fx/

Bandes horizontales, détails dans `fx.json` (`frame`, `count`, `anchor`, `fps`, `loop`).

| fichier | frames | usage |
|---|---|---|
| `fx_smoke` | 6 × 48×48 | fumée de pneus (freinage fort, dérapage) : un nuage par roue arrière, joué une fois puis supprimé |
| `fx_dust`, `fx_grass` | 6 × 48×48 | roue sur le sable / l'herbe |
| `fx_spray` | 6 × 48×48 | projections d'eau sur piste mouillée |
| `fx_sparks` | 6 × 64×40 | étincelles sous la caisse (bosse, contact), ancre = point d'impact |
| `fx_exhaust_flame` | 4 × 24×24 | flamme d'échappement (lever de pied, rétrogradage), en boucle courte |

Poser l'ancre de l'effet sur le point au sol voulu ; pour la fumée, ±34 px de part et d'autre de l'ancre de la voiture à l'échelle 1. Dessiner fumée/poussière **derrière** la voiture (avant elle), étincelles et flammes **devant**.

## hud/

- `hud.png/.json` (atlas) : `dial_speed` (0–320 km/h), `dial_rpm` (0–9, zone rouge à 7,5), `bar_frame` (70×14) et `bar_fill_green|yellow|red` (64×8, à rogner en largeur selon la valeur, à poser à +3,+3 dans le cadre), `icon_fuel`, `icon_tyre`, `rev_bar_off` / `rev_bar_on` (122×12 + contour ; dessiner `off` puis `on` rogné en largeur), `panel_9slice` (24×24, coins de 6 px), `map_dot_player|rival|safety`, `countdown_3|2|1|go`, `banner_pit|final_lap|finish|safety_car`.
- `needle.png` : 28 frames de 96×96 à superposer à un cadran. `frame = round(valeur / max * 27)` (balayage de 270°).
- `font_digits_big.png` (cellules 20×30 : `0123456789:.'/ `) et `font_small.png` (cellules 10×14, ASCII 32–95, 16 colonnes) : polices bitmap blanches à contour sombre ; `fonts.json` donne cellule, colonnes et liste des caractères. Avancer de `cell.w - 1` px par caractère.

- `portrait_player.png` : portrait du pilote, 3 frames de 96×96 (`neutral`, `happy`, `surprised`) avec cadre et fond ; `portrait_player_cutout.png` : le même détouré sur fond transparent. Usage type : `neutral` en course, `happy` à un dépassement ou à la victoire, `surprised` sur un choc ou un tête-à-queue.

## dialogue/

- `char_<babass|leo|clara|marcel|viktor>.png` : bustes de dialogue détourés, 5 frames de 128×144 : `neutral`, `happy`, `angry`, `surprised`, `talk`. Pendant qu'un personnage parle, alterner `neutral`/`talk` à 8 fps (ou l'expression voulue/`talk`). Personnage qui parle à gauche ; l'interlocuteur à droite en miroir horizontal et assombri (RGB × 0,55).
  Babass : pilote chauve à barbe de 3 jours (sans écouteur) · Léo : le beau gosse · Clara : pilote rousse · Marcel : vieux directeur d'écurie (casque radio, moustache) · Viktor : le rival blond.
- `dialog_box.png` (464×76) : boîte de dialogue avec onglet de nom ; positions du nom et du texte dans `dialogue.json` (`dialog_box`).
- `font_dialog.png` : police bitmap avec minuscules et accents français (cellules 10×16, liste des caractères dans `dialogue.json` → `font_dialog`). Avancer de `cell.w - 2` px par caractère ; 2 lignes d'environ 53 caractères.

## logo/

- `babass_racing_logo.png` (384×168, transparent) et `_x3.png` (agrandi ×3 sans lissage).
- `title_screen.png` (480×270) : écran titre monté (ciel, route, voiture, logo, PRESS START). Pour un titre animé, le recomposer à partir des assets et faire clignoter PRESS START (1 Hz).

## music/

Musiques originales, **stéréo**, en OGG et MP3, conçues pour **boucler sans coupure** (préférer l'OGG pour la boucle : le MP3 ajoute un court silence en début de fichier). Style synthé énergique : grosse caisse sur chaque temps, basse roulante en doubles croches, accords syncopés, arpèges en ping-pong, réverbération. `music.json` donne tempo et durée.

| fichier | usage | tempo | durée |
|---|---|---|---|
| `babass_racing_theme` | écran titre, menus | 138 BPM | 63 s |
| `level_circuit` | circuit de jour, le plus rapide | 172 BPM | 50 s |
| `level_sunset` | côte au coucher du soleil | 152 BPM | 57 s |
| `level_night` | ville de nuit, mineur, basse en octaves | 158 BPM | 55 s |
| `level_rain` | montagne sous la pluie, mineur, mélodie pincée avec écho | 150 BPM | 58 s |

Structure commune : intro 4 mesures (montée), A 8, A renforcé 8, B 8, A renforcé 8.

## Ambiances de niveaux (`levels.json`)

Quatre préréglages prêts à charger : `circuit_jour`, `cote_coucher_soleil`, `ville_nuit`, `montagne_pluie`. Chacun donne le ciel (avec et sans nuages), l'horizon, les deux couches de nuages, la route, les atlas de décor à utiliser (jour ou `_night`), la liste des objets de bord de piste, la musique et une voiture suggérée. `montagne_pluie` ajoute un bloc `weather`.

**Pluie** : `fx/fx_rain.png` (4 frames de 128×128, boucle à 16 fps) se juxtapose dans les deux directions pour couvrir l'écran, dessiné par-dessus tout sauf l'interface. `fx/fx_rain_splash.png` (4 frames de 24×12) : impacts à semer au hasard sur le sol. Ajouter `fx_spray` derrière les roues et multiplier les couleurs de la scène par `weather.tint` pour l'ambiance grise.

**Route mouillée** : `roads/road_wet.png` (asphalte sombre, reflets et flaques intégrés, même mise en page que les routes 3 voies). `roads/overlay_puddles_a.png` et `_b.png` : flaques seules sur fond transparent, à poser comme les autres surcouches (64 lignes = 10 m) sur n'importe quelle route 3 voies. Idée de gameplay : perte d'adhérence quand une roue passe sur une flaque.

## previews/

Images de contrôle uniquement, à ne pas charger dans le jeu.
