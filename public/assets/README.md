# Babass Racing — pack d'assets, guide d'intégration

Pixel art, PNG transparents, à afficher en **nearest-neighbor** (pas de lissage).
Toutes les marques des panneaux sont inventées.

## ⚠️ v23 à v25 — Tout le pack en HD ×2 + roues animées (à lire en premier)
Tous les éléments qui composent un circuit (v23) puis les voitures (v24) sont passés en **résolution ×2** avec des détails retravaillés. Les tailles citées plus bas dans ce README datent d'avant la v23 : **les valeurs des JSON font foi** (`w`, `h`, `anchor`, `pixels_per_meter`, `px`, `band_h`, `lights_slot`, `frame`).

| Famille | Avant | v23 |
|---|---|---|
| `roads/*.png`, `pit/road_pitlane.png`, surcouches `overlay_*` | 512×64, 27 px/m, bandes de 32 lignes | **1024×128, 54 px/m, bandes de 64 lignes** (axe de la route à x = 512, surcouches : 128 lignes = 10 m) |
| `backgrounds/sky_*.png` | 1024×256 | **2048×512** |
| `backgrounds/horizon_*.png` | 1024×128 | **2048×256** |
| `backgrounds/clouds_*_far/near.png`, `clouds.png` | 1024×96 / 1024×128 | **2048×192 / 2048×256** (atlas ×2) |
| `scenery/` : `trees`, `billboards`, `signs`, `buildings`, `overhead` (+ versions `_night`), `grandstand_anim` | ppm 4 à 36 | **ppm doublé** (atlas, ancres et cadres ×2) |
| `start/` : portiques, `start_lights` | ppm 19 | **ppm 38**, `lights_slot` et cadres ×2 |
| `pit/pit_buildings` (garages, muret, passerelle, sucette) | ppm 20 à 30 | **ppm doublé** |
| `cars/*.png` (v24) | cadres 160×96, pentes 160×112, tête-à-queue 240×112 | **320×192, 320×224, 480×224**, ppm et ancres ×2 (`cars.json`) |

**v25 : tout le reste est aussi en ×2** — mécaniciens, accessoires de stand, commissaires, pilotes, photographes, podium, FX, HUD et polices, portraits et boîte de dialogue, logo et écran titre, hub garage (960×540). Ces familles sont agrandies avec lissage des contours (pas re-rendues) ; leurs JSON (`x, y, w, h, dx, dy, anchor, frame, cell, rect, line_h, pixels_per_meter`) sont doublés et portent `"hd": "x2"`. Seules les minimaps de `circuits/` (64 et 128 px) et `logo/babass_racing_logo_x3.png` gardent leur taille.

**v25 : roues qui tournent** — chaque planche de voiture (`sheets`, `brake_sheets`, `sheets_up`, `sheets_down`, `damaged_sheets`, `puncture_sheets`) contient maintenant **3 lignes** : la ligne `r` (à `y = r × hauteur_de_cadre`) est une phase de rotation des roues (sculptures du pneu et bâtons de jante décalés). `cars.json` → `wheel_phases: 3` et `wheel_anim`.
- Animation : `phase = floor(distance_parcourue_m / 0.25) % 3` (ou une cadence proportionnelle à la vitesse, plafonnée à ~20 images/s) ; à l'arrêt, garder la phase courante ; en marche arrière, parcourir 2,1,0.
- Cadre à dessiner : `x = index_braquage × frame.w`, `y = phase × frame.h` (pour les pentes : `slope.frame.h`).
- Safety car : 6 lignes = gyrophare (a, b) × 3 phases, ligne = `flash × 3 + phase` (`rows` dans `cars.json`).
- Tête-à-queue (`spin`) et stand (`pit`) : une seule ligne, roues fixes.

**Intégration**
- La formule de projection ne change pas : `échelle = (focale / z) / pixels_per_meter`. Comme le ppm est doublé, un décor HD occupe la même taille à l'écran qu'avant, avec deux fois plus de pixels source.
- Pour en profiter, rendre le jeu en **960×540** (au lieu de 480×270) : focale ×2, horizon ×2, et tout le pack est désormais à la même densité de pixels : plus aucun facteur ×2 à appliquer.
- Les valeurs en pixels citées plus bas dans ce README (décalages de l'arrêt au stand, positions du HUD, tailles de cadres) datent d'avant la HD : les doubler, ou lire les JSON.
- Route : `tx = 512 + x_m * 54`, `ligne = floor(z / 10 * 128) % 128`. Parallaxe des fonds : modulo 2048.
- Si le jeu reste en 480×270, tout fonctionne aussi (les décors sont simplement réduits de moitié), mais le gain n'est visible que sur les objets proches de la caméra.
- Routes : grain d'asphalte fin, traces de roulage, joints, vibreurs bombés avec stries et traces de gomme, peinture usée, herbe en brins. Décors 2D redessinés en vectoriel ×2 (textes et courbes nets, liserés d'éclairage). Arbres re-rendus en 3D à 40 px/m avec un feuillage plus découpé. Fonds agrandis avec lissage des contours, dégradés à trame fine, étoiles fines, liseré de lumière sur les crêtes.
- Aperçus : `previews/preview_hd_scenes.png`, `preview_hd_roads.png`, `preview_hd_backgrounds.png`.

## Conventions communes

- Chaque sprite a une **ancre** (`anchor.x`, `anchor.y`, en px dans la frame) : c'est le point de contact au sol, à poser sur la position écran de l'objet.
- Chaque sprite a une échelle `pixels_per_meter` (ppm). Pour un objet à la profondeur `z` (mètres devant la caméra) :
  `scale = (f / z) / ppm`, `screenX = W/2 + (x - camX) * f / z`, `screenY = horizon + camH * f / z`.
- Réglages utilisés pour les aperçus : écran 480×270, `horizon = 130`, `f = 300`, `camH = 3.2 m`. La voiture du joueur est dessinée à l'échelle 1 (36 ppm), soit `z = f / 36 ≈ 8.33 m`, ancre à `screenY = 130 + 3.2 * 36 = 245`.
- Dessiner du plus loin au plus près (tri par `z` décroissant).

## cars/

`cars.json` : pour chaque voiture (`safetycar`, `hothatch`, `gt3`, `f1`, `hypercar`, `muscle`, `retro`, `wedge`, `futur`, `supercar`, `pickup`, `towtruck`) → `sheets` (6 coloris, 1 seul pour la safety car), `brake_sheets`, `frame` 160×96, `anchor`, `pixels_per_meter` (36 ; **27 pour `towtruck`**, camion plus grand : toujours lire la valeur dans l'atlas), `frames`, `yaw_deg`, `pit_sheets`, `pit_frames`.

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

## Voitures v22 : vitres transparentes et intérieur visible
Les voitures ont été refaites : vitres semi-transparentes laissant voir l'habitacle (sièges, appuie-têtes, volant, tableau de bord), reflets en diagonale sur le verre et contours colorés selon la matière voisine.
- Les PNG de voitures contiennent désormais des pixels **semi-transparents** (alpha 112 pour la vitre seule, 168 pour les reflets). Utiliser l'alpha blending normal (pas de colorkey) et ne pas passer en `nearest` avec seuil alpha.
- Le sol reste visible à travers les vitres quand l'habitacle est vide, comme sur une vraie voiture.
- Le F1 n'a pas de vitres, le pick-up et la dépanneuse montrent la cabine à travers la lunette arrière.

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

- `char_<babass|leo|clara|marcel|viktor>.png` : bustes de dialogue détourés (v2 : visages ombrés, yeux détaillés), **12 frames** de 128×144, dans cet ordre (`dialogue.json` → `frames`) :
  `neutral`, `happy`, `laugh`, `talk`, `talk_happy`, `angry`, `determined`, `surprised`, `sad` (larme), `worried` (goutte de sueur), `smug` (sourire en coin, un sourcil levé), `wink` (clin d'œil).
  Parole : alterner `neutral`/`talk` à 8 fps, ou `happy`/`talk_happy` pour une réplique joyeuse ; pour une réplique en colère ou triste, alterner l'expression voulue et `talk`. Personnage qui parle à gauche ; l'interlocuteur à droite en miroir horizontal et assombri (RGB × 0,55).
- `char_<nom>_helmet.png` : **même personnage avec un casque de course** (casque jet aux couleurs de son équipe, visière relevée, jugulaire), mêmes 12 expressions dans le même ordre. À utiliser dans les scènes sur la grille, dans le stand ou en course (radio).
  Babass : pilote chauve à barbe de 3 jours · Léo : le beau gosse (mèche relevée) · Clara : pilote rousse aux cheveux longs · Marcel : vieux directeur d'écurie (lunettes, moustache blanche, veston et cravate) · Viktor : le rival, cheveux noirs plaqués en arrière, cicatrice sur la joue.
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

Préréglages prêts à charger (4 d'origine : `circuit_jour`, `cote_coucher_soleil`, `ville_nuit`, `montagne_pluie`, puis tous les autres : **voir la section « Compositions de niveaux » en bas de ce fichier**, qui liste les 48 niveaux et les règles pour en composer d'autres). Chacun donne le ciel (avec et sans nuages), l'horizon, les deux couches de nuages, la route, les atlas de décor à utiliser (jour ou `_night`), la liste des objets de bord de piste, la musique et une voiture suggérée. `montagne_pluie` ajoute un bloc `weather`.

**Pluie** : `fx/fx_rain.png` (4 frames de 128×128, boucle à 16 fps) se juxtapose dans les deux directions pour couvrir l'écran, dessiné par-dessus tout sauf l'interface. `fx/fx_rain_splash.png` (4 frames de 24×12) : impacts à semer au hasard sur le sol. Ajouter `fx_spray` derrière les roues et multiplier les couleurs de la scène par `weather.tint` pour l'ambiance grise.

**Route mouillée** : `roads/road_wet.png` (asphalte sombre, reflets et flaques intégrés, même mise en page que les routes 3 voies). `roads/overlay_puddles_a.png` et `_b.png` : flaques seules sur fond transparent, à poser comme les autres surcouches (64 lignes = 10 m) sur n'importe quelle route 3 voies. Idée de gameplay : perte d'adhérence quand une roue passe sur une flaque.

## previews/

Images de contrôle uniquement, à ne pas charger dans le jeu.


## Hub garage (menu entre les courses) — `garage/`
Écran complet **480×270** (même base que l'écran titre ; afficher en x2/x3/x4 au plus proche voisin). Tout est décrit dans `garage/garage.json`.

Ordre des calques, du fond vers l'avant :
1. `garage_bg_day.png` ou `garage_bg_night.png` (fond complet, éclairage compris).
2. Animations à coller aux coordonnées de `animations` : `tv` (4 frames, 6 fps), `door_light` (rouge = course verrouillée, vert = prête).
3. Mécanos : `garage_mechanic_<red|blue|black>.png`, 5 frames (`idle`, `hands_hips`, `wave`, `thumbs_up`, `carry_tyre`), ancre aux pieds, 48 px/m. Emplacements suggérés dans `mechanic_spots` (miroir horizontal pour celui de droite). Le nombre de mécanos affichés peut refléter la taille de l'équipe.
4. Voiture du joueur : `garage_<voiture>_<coloris>.png`, vue 3/4 arrière, ancre au sol à placer en **(240, 240)** écran (`car_anchor_screen`). 48 px/m, donc plus grande que sur la piste.
5. `garage_fg_<day|night>.png` : servante, pneus, câble (devant la voiture et les mécanos).
6. Surbrillance de la zone survolée : `hotspots.<zone>.highlight` donne l'image et sa position ; `rect` est la zone cliquable, `label` une suggestion d'usage (voiture, mécanos, pièces, bureau, tableau, sortie vers la course, TV, sponsors).

`previews/preview_garage.png` montre une composition jour et une nuit.


## Diversité v18 : ciels, horizons, routes, ambiances et circuits

**Ciels** (`backgrounds/`, 1024×256, répétables en X, chacun avec sa version `_clear` sans nuages) : en plus de `day`, `sunset`, `night`, `storm`, `dawn` → `sky_overcast` (couvert), `sky_noon` (midi écrasant), `sky_golden` (heure dorée), `sky_dusk` (crépuscule violet), `sky_aurora` (aurore boréale), `sky_fog` (brume), `sky_tropical`, `sky_ember` (soir de cendres), `sky_winter`.

**Horizons** (`backgrounds/`, 1024×128, transparents, répétables) : en plus de `mountains`, `forest`, `desert`, `city` → `horizon_sea` (mer, phare, voiliers), `horizon_hills` (collines, champs, éoliennes), `horizon_canyon` (mesas), `horizon_alps` (alpes enneigées), `horizon_industrial` (usines, grues, fumées), `horizon_volcano` (volcan en éruption), `horizon_city_day` (ville de jour), `horizon_jungle`, `horizon_dunes`. Ciel, horizon et couches de nuages se combinent librement : `levels.json` donne des combinaisons éprouvées.

**Routes** (`roads/`, 512×64, même format que les autres, décrites dans `roads.json`) : `road_modern` (asphalte neuf, vibreurs bleu/blanc), `road_urban` (asphalte urbain, trottoirs gris), `road_autumn` (feuilles mortes sur les bords), `road_highway` (4 voies, bandes d'arrêt d'urgence, pas de vibreur), `road_lava` (asphalte sombre, bas-côtés de lave), `road_jungle` (asphalte humide), `road_worn` (rustines, fissures). **Toutes les pistes du pack sont en asphalte** (pas de terre, pavés ni glace) : seules les teintes, les vibreurs et les bas-côtés changent.

**Foudre** : `fx/fx_lightning.png` (3 frames 96×160, ancre en haut) + flash blanc plein écran à faire soi-même (alpha 160 puis 60). Utilisée par l'ambiance `orage`.

**Ambiances** : `levels.json` passe de 4 à 16 entrées (puis 48 en v21) (désert à midi, campagne le matin, autoroute à l'heure dorée, glacier, volcan, docks dans la brume, jungle, nuit d'aurore, vieille ville en automne, ville au crépuscule, orage, dunes). Chaque entrée garde le même format (ciel, horizon, nuages, route, atlas, décor de bord de route, musique, voiture suggérée) et liste maintenant les `tracks` qui l'utilisent. `weather.fog_strength` (docks) : renforcer le fondu vers la couleur du ciel avec la distance. `previews/preview_levels.png` montre les 16.

**Types de circuits et tracés** (`circuits/circuits.json`) :
- `types` : 10 types (`permanent`, `urbain`, `montagne`, `rallye` asphalte, `ovale`, `autoroute`, `kart`, `glace` (asphalte glacé), `plage` (route côtière), `industriel`) avec `grip` (0.45 glace → 1.0 permanent, à appliquer à l'adhérence), `width_m`, `road` par défaut, `curbs`, `walls` (murs/rails près de la piste) et une description à afficher dans le hub.
- `tracks` : 14 tracés, chacun avec un fichier `track_<nom>.json` : liste de **segments de 50 m** (`curve` entre −1 et 1, `turn_deg`, `elev_m`, position `x,y` en mètres, `event` = `corner`/`hairpin` pour les zones de freinage et les panneaux), longueur, type, ambiance, tours suggérés. Le tracé est une boucle fermée : enchaîner les segments en boucle, le départ est au segment 0.
- Minimaps : `map_<nom>_64.png` et `_128.png` (tracé blanc, point de départ jaune) + planches `maps_64.png` / `maps_128.png` dans l'ordre `maps_sheet.order`. Pour positionner le joueur sur la minimap, utiliser le `x,y` du segment courant avec la même mise à l'échelle que la planche (bornes min/max des `x,y`, marge de 5 px).
- Pour un tracé OutRun classique (sans boucle), prendre les segments dans l'ordre et s'arrêter à la longueur voulue.


## Pistes v19/v20 : asphalte teinté et marquages au sol (`roads/`)

Textures (512×64, même format, `roads.json`) : `road_classic` (vibreurs jaune/noir), `road_runoff` (vibreurs vert/blanc, dégagement asphalté), `road_night_wet` (nuit, reflets néon), `road_red_asphalt`, et des **asphaltes légèrement teintés** pour varier d'un circuit à l'autre : `road_asphalt_blue`, `_warm`, `_green`, `_purple`, `_black` (neuf, très sombre), `_light` (clair, lignes jaunes), `_teal`, `_orange` (chaleur), `_pink`, `_olive`. Marquages différents : `road_double_yellow` (double ligne centrale), `road_no_lines` (piste large sans voies), `road_rumble_edges` (bandes rugueuses en bord). Trois **routes étroites à 2 voies** : `road_circuit_narrow`, `road_mountain_narrow`, `road_night_narrow` (la route fait 264 px au lieu de 324 : lire `px.road` dans `roads.json`).

Surcouches transparentes (512×64, calées sur la route 3 voies x 94..418, `overlay: true` dans `roads.json`) : `overlay_skid_marks`, `overlay_arrows`, `overlay_chevrons` (zone de freinage), `overlay_crosswalk`, `overlay_finish`, `overlay_pit_entry` (miroir si stands à gauche), `overlay_logo_asphalt`, `overlay_oil` (perte d'adhérence), `overlay_runoff_stripes`. `previews/preview_roads_v19.png`.

## Ciels et fonds v20 (`backgrounds/`)

Ciels (1024×256, avec version `_clear`) : `sky_morning` (bleu pur), `sky_cumulus` (gros nuages d'été), `sky_sunrise` (rose), `sky_sandstorm` (ocre), `sky_milkyway` (nuit sans lune, voie lactée), `sky_fullmoon` (grosse lune), `sky_rainbow` (après la pluie), `sky_violet` (coucher de soleil violet), `sky_rain` (gris bas), `sky_greenstorm` (ciel vert d'orage).
Horizons (1024×128, transparents) : `horizon_vineyards` (coteaux et villages), `horizon_lake` (montagnes et reflet), `horizon_castle` (ruines), `horizon_stadium` (tribunes pleines, pour l'ovale), `horizon_cliffs` (falaises blanches), `horizon_pyramids`, `horizon_metropolis` (ville futuriste), `horizon_farm` (granges et silos), `horizon_mesa` (désert rouge). `previews/preview_backgrounds_v20.png` et `preview_skies_v20.png`. Au total : 24 ciels, 22 horizons.

<!-- COMPOSITIONS:START -->
## Compositions de niveaux (`compositions.json` + `levels.json`)

`levels.json` contient **48 niveaux prêts à l'emploi** (même format, tous testés : fichiers existants, voiture suggérée disponible). `compositions.json` donne les **règles** pour en composer d'autres, par exemple au hasard à chaque course ou selon la progression de la carrière.

### Recette (ordre des calques)
1. **Ambiance** (`moods`) : choisit le ciel, la palette de nuages, les atlas jour ou nuit, la musique et la teinte.
2. **Ciel** de cette ambiance : `sky_*.png` avec ses nuages intégrés, ou `sky_*_clear.png` + `clouds_<palette>_far/near.png` si tu fais défiler les nuages en parallaxe.
3. **Horizon** compatible (`horizons.<nom>.best` liste les ambiances où il est cohérent).
4. **Route** selon le **type de circuit** (`track_types.<type>.roads`) + **surcouches** de marquage (`track_types.<type>.overlays`).
5. **Décor** de bord de route : `roadside` conseillé par horizon (arbres/rochers du `trees.json`), puis panneaux, bâtiments, passerelles à volonté. Atlas `_night` si l'ambiance est `crepuscule` ou `nuit`.
6. **Météo** (`weather_presets`) : `rain`, `storm` (pluie + éclairs), `after_rain` (flaques seules), `fog`. Elle impose la route mouillée (`road_wet`) et la teinte.
7. Voiture du joueur et adversaires : n'importe laquelle, `suggested_car` n'est qu'un exemple.

### Ambiances (`moods`)
| Clé | Nom | Ciels (`sky_…`) | Nuages | Atlas | Musiques | Teinte RGB |
|---|---|---|---|---|---|---|
| `jour` | Plein jour | `day`, `morning`, `cumulus`, `noon`, `tropical`, `dawn`, `rainbow` | `clouds_day` | jour | `level_circuit`, `babass_racing_theme` | — |
| `dore` | Lever / coucher de soleil | `sunrise`, `golden`, `sunset` | `clouds_sunset` | jour | `level_sunset`, `babass_racing_theme` | — |
| `crepuscule` | Crépuscule | `violet`, `dusk` | `clouds_sunset` | nuit | `level_night`, `level_sunset` | — |
| `nuit` | Nuit | `night`, `aurora`, `milkyway`, `fullmoon`, `ember` | `clouds_night` | nuit | `level_night` | — |
| `couvert` | Couvert / brume | `overcast`, `fog`, `winter`, `sandstorm` | `clouds_storm` | jour | `level_rain`, `babass_racing_theme` | [0.9, 0.92, 0.96] |
| `pluie` | Pluie / orage | `storm`, `rain`, `greenstorm` | `clouds_storm` | jour | `level_rain` | [0.82, 0.86, 0.96] |

### Horizons et ambiances où ils fonctionnent
| Horizon | Contenu | Ambiances adaptées | Décor conseillé |
|---|---|---|---|
| `horizon_forest` | Forêt | `jour`, `dore`, `couvert`, `pluie` | `tree_oak`, `tree_pine`, `tree_birch`, `bush_flowers` |
| `horizon_mountains` | Montagnes | `jour`, `dore`, `couvert`, `pluie`, `nuit` | `tree_pine`, `rock`, `tree_dead` |
| `horizon_desert` | Désert / mesas rouges | `jour`, `dore`, `crepuscule` | `cactus`, `rock`, `tree_palm` |
| `horizon_city` | Ville de nuit (fenêtres allumées) | `crepuscule`, `nuit`, `dore` | `tree_cypress`, `tree_cherry`, `tree_oak` |
| `horizon_sea` | Mer, phare, voiliers | `jour`, `dore`, `crepuscule` | `tree_palm`, `bush`, `rock` |
| `horizon_hills` | Collines, champs, éoliennes | `jour`, `dore`, `couvert`, `pluie` | `tree_oak`, `bush_flowers`, `tree_birch` |
| `horizon_canyon` | Canyon / mesas | `jour`, `dore`, `couvert` | `cactus`, `rock`, `tree_dead` |
| `horizon_alps` | Alpes enneigées | `jour`, `couvert`, `nuit`, `pluie` | `tree_pine_snow`, `tree_pine`, `rock` |
| `horizon_industrial` | Zone industrielle | `couvert`, `pluie`, `nuit`, `dore` | `tree_dead`, `bush`, `rock` |
| `horizon_volcano` | Volcan | `nuit`, `dore`, `couvert`, `crepuscule` | `rock`, `tree_dead` |
| `horizon_city_day` | Ville de jour | `jour`, `couvert`, `pluie`, `dore` | `tree_oak`, `tree_cypress`, `bush` |
| `horizon_jungle` | Jungle | `jour`, `pluie`, `dore`, `couvert` | `tree_palm`, `bush`, `bush_flowers` |
| `horizon_dunes` | Dunes | `jour`, `dore`, `couvert` | `tree_palm`, `rock`, `cactus` |
| `horizon_vineyards` | Vignobles et villages | `jour`, `dore`, `couvert` | `tree_cypress`, `tree_oak`, `bush_flowers` |
| `horizon_lake` | Lac et montagnes | `jour`, `dore`, `nuit`, `couvert` | `tree_pine`, `tree_birch`, `rock` |
| `horizon_castle` | Château en ruine | `couvert`, `crepuscule`, `nuit`, `jour` | `tree_oak`, `tree_dead`, `bush` |
| `horizon_stadium` | Tribunes de stade | `jour`, `nuit`, `dore` | `bush` |
| `horizon_cliffs` | Falaises blanches et mer | `jour`, `dore`, `couvert` | `tree_palm`, `bush`, `rock` |
| `horizon_pyramids` | Pyramides et sphinx | `jour`, `dore`, `nuit` | `tree_palm`, `rock`, `cactus` |
| `horizon_metropolis` | Métropole futuriste (néons) | `crepuscule`, `nuit` | `tree_cypress`, `tree_cherry` |
| `horizon_farm` | Ferme, granges, silos | `jour`, `dore`, `couvert`, `pluie` | `tree_oak`, `bush_flowers`, `tree_birch` |
| `horizon_mesa` | Désert rouge (monument valley) | `jour`, `dore`, `crepuscule`, `couvert` | `cactus`, `rock`, `tree_dead` |

Les horizons à fenêtres allumées (`horizon_city`, `horizon_metropolis`) perdent leur sens en plein jour : les réserver à `crepuscule`, `nuit` et `dore`. `horizon_city_day` fait l'inverse.

### Routes par type de circuit
| Type de circuit | Routes possibles (`road_…`) | Surcouches (`overlay_…`) |
|---|---|---|
| `permanent` | `modern`, `circuit`, `classic`, `runoff`, `rumble_edges`, `no_lines`, `asphalt_blue`, `asphalt_warm`, `asphalt_green`, `asphalt_purple`, `asphalt_black`, `asphalt_light`, `asphalt_teal`, `asphalt_orange`, `asphalt_pink`, `asphalt_olive` | `start_line`, `finish`, `pit_entry`, `skid_marks`, `chevrons`, `runoff_stripes`, `logo_asphalt`, `grid_slots` |
| `urbain` | `urban`, `red_asphalt`, `double_yellow`, `night_wet`, `asphalt_black`, `asphalt_light`, `asphalt_blue` | `start_line`, `finish`, `crosswalk`, `arrows`, `oil`, `skid_marks`, `pit_entry` |
| `montagne` | `worn`, `mountain_narrow`, `wet`, `snow`, `asphalt_olive`, `asphalt_teal`, `double_yellow` | `arrows`, `oil`, `skid_marks`, `chevrons`, `finish` |
| `rallye` | `worn`, `mountain_narrow`, `asphalt_warm`, `asphalt_orange`, `jungle`, `autumn` | `arrows`, `skid_marks`, `finish` |
| `ovale` | `modern`, `asphalt_black`, `asphalt_light`, `runoff`, `classic` | `start_line`, `finish`, `grid_slots`, `pit_entry`, `skid_marks`, `logo_asphalt` |
| `autoroute` | `highway`, `asphalt_black`, `asphalt_light`, `asphalt_blue`, `night_wet` | `arrows`, `finish`, `skid_marks` |
| `kart` | `kart`, `circuit_narrow`, `asphalt_green`, `asphalt_blue`, `asphalt_light` | `start_line`, `finish`, `grid_slots`, `skid_marks`, `chevrons` |
| `glace` | `snow`, `asphalt_blue`, `asphalt_light`, `mountain_narrow` | `arrows`, `skid_marks`, `finish` |
| `plage` | `coast`, `asphalt_warm`, `asphalt_light`, `asphalt_orange`, `asphalt_pink` | `arrows`, `finish`, `skid_marks` |
| `industriel` | `worn`, `urban`, `asphalt_black`, `asphalt_olive`, `double_yellow` | `start_line`, `finish`, `oil`, `crosswalk`, `skid_marks` |

Règles utiles : les routes **étroites** (`road_*_narrow`, `road_kart`) ont une chaussée plus petite, donc ne pas y mettre plus de 2 à 3 voitures de front ; les routes **`_night`/`_night_wet`** sont conçues pour les ambiances `crepuscule` et `nuit` ; `road_wet` doit toujours accompagner la météo `rain`, `storm` ou `after_rain`.

### Niveaux prêts à l'emploi (`levels.json`)
| Niveau | Nom | Ciel | Horizon | Route | Ambiance | Musique | Voiture | Circuits liés |
|---|---|---|---|---|---|---|---|---|
| `circuit_jour` | Circuit — plein jour | `day` | `forest` | `circuit` | jour | `level_circuit` | `gt3_green` | `grand_prix_vert` |
| `cote_coucher_soleil` | Côte — coucher de soleil | `sunset` | `desert` | `coast` | dore | `level_sunset` | `wedge_red` | `boucle_cotiere` |
| `ville_nuit` | Ville — nuit | `night` | `city` | `night` | nuit | `level_night` | `futur_white` | `neon_city` |
| `montagne_pluie` | Montagne — pluie | `storm` | `mountains` | `wet` | pluie | `level_rain` | `pickup_steel` | `col_de_la_tempete` |
| `midi_desert` | Désert — plein midi | `noon` | `canyon` | `desert` | jour | `level_circuit` | `muscle_orange` | `speedway`, `rallye_des_dunes` |
| `matin_campagne` | Campagne — matin | `dawn` | `hills` | `circuit` | jour | `babass_racing_theme` | `hothatch_yellow` | `kartodrome` |
| `heure_doree` | Autoroute — heure dorée | `golden` | `sea` | `highway` | dore | `level_sunset` | `retro_white` | `autoroute_66` |
| `hiver` | Glacier — neige | `winter` | `alps` | `snow` | couvert | `level_rain` | `pickup_white` | `glacier` |
| `volcan` | Volcan — soir de cendres | `ember` | `volcano` | `lava` | nuit | `level_night` | `futur_black` | `volcan_rouge` |
| `brume_industrielle` | Docks — brume | `fog` | `industrial` | `worn` | couvert | `level_rain` | `towtruck_orange` | `docks` |
| `jungle` | Jungle — tropicale | `tropical` | `jungle` | `jungle` | jour | `level_circuit` | `supercar_lime` | `jungle_run` |
| `nuit_aurore` | Nuit — aurore boréale | `aurora` | `alps` | `night` | nuit | `level_night` | `hypercar_blue` | `aurore` |
| `automne` | Vieille ville — automne | `overcast` | `city_day` | `urban` | couvert | `babass_racing_theme` | `retro_red` | `vieille_ville` |
| `crepuscule_ville` | Ville — crépuscule | `dusk` | `city` | `urban` | crepuscule | `level_night` | `gt3_black` | — |
| `orage` | Orage — éclairs | `storm` | `hills` | `wet` | pluie | `level_rain` | `safetycar_silver` | — |
| `dunes` | Dunes — sable | `noon` | `dunes` | `coast` | jour | `level_sunset` | `pickup_sand` | — |
| `vignes_matin` | Vignobles — matin clair | `morning` | `vineyards` | `asphalt_warm` | jour | `level_circuit` | `hothatch_blue` | — |
| `lac_ete` | Lac — été | `cumulus` | `lake` | `asphalt_blue` | jour | `level_circuit` | `gt3_blue` | — |
| `falaises_aube` | Falaises — lever de soleil | `sunrise` | `cliffs` | `asphalt_light` | dore | `level_sunset` | `supercar_orange` | — |
| `tempete_sable` | Désert — tempête de sable | `sandstorm` | `mesa` | `asphalt_orange` | couvert | `level_rain` | `muscle_black` | — |
| `pyramides` | Pyramides — plein midi | `noon` | `pyramids` | `desert` | jour | `level_circuit` | `wedge_yellow` | — |
| `voie_lactee` | Nuit — voie lactée | `milkyway` | `lake` | `asphalt_black` | nuit | `level_night` | `hypercar_black` | — |
| `pleine_lune` | Château — pleine lune | `fullmoon` | `castle` | `asphalt_purple` | nuit | `level_night` | `gt3_silver` | — |
| `apres_pluie` | Après la pluie — arc-en-ciel | `rainbow` | `hills` | `wet` | jour | `level_circuit` | `hothatch_red` | — |
| `metropole_violette` | Métropole — crépuscule violet | `violet` | `metropolis` | `night_wet` | crepuscule | `level_night` | `futur_purple` | — |
| `pluie_ferme` | Ferme — pluie battante | `rain` | `farm` | `wet` | pluie | `level_rain` | `pickup_olive` | — |
| `tornade` | Plaines — ciel d'orage vert | `greenstorm` | `farm` | `worn` | pluie | `level_rain` | `pickup_steel` | — |
| `stade_jour` | Ovale — jour de course | `cumulus` | `stadium` | `modern` | jour | `level_circuit` | `f1_red` | — |
| `stade_nuit` | Ovale — sous les projecteurs | `night` | `stadium` | `modern` | nuit | `level_night` | `f1_navy` | — |
| `ville_matin` | Ville — matin | `morning` | `city_day` | `urban` | jour | `level_circuit` | `hothatch_white` | — |
| `neon_futur` | Futur — néons | `dusk` | `metropolis` | `night_wet` | crepuscule | `level_night` | `futur_white` | — |
| `autoroute_aube` | Autoroute — aube rose | `sunrise` | `sea` | `highway` | dore | `level_sunset` | `supercar_white` | — |
| `vignes_dorees` | Vignobles — heure dorée | `golden` | `vineyards` | `asphalt_warm` | dore | `level_sunset` | `retro_beige` | — |
| `lac_hiver` | Lac — hiver | `winter` | `lake` | `snow` | couvert | `level_rain` | `hypercar_white` | — |
| `mesa_coucher` | Désert rouge — coucher de soleil | `sunset` | `mesa` | `asphalt_orange` | dore | `level_sunset` | `muscle_orange` | — |
| `pyramides_nuit` | Pyramides — nuit de pleine lune | `fullmoon` | `pyramids` | `night` | nuit | `level_night` | `supercar_white` | — |
| `chateau_brume` | Château — brume | `fog` | `castle` | `worn` | couvert | `level_rain` | `retro_grey` | — |
| `jungle_pluie` | Jungle — averse tropicale | `rain` | `jungle` | `jungle` | pluie | `level_rain` | `pickup_olive` | — |
| `plage_aube` | Plage — aube | `dawn` | `sea` | `coast` | jour | `level_circuit` | `hothatch_orange` | — |
| `kart_ete` | Kartodrome — été | `cumulus` | `hills` | `kart` | jour | `level_circuit` | `hothatch_green` | — |
| `industriel_nuit` | Zone industrielle — nuit | `night` | `industrial` | `asphalt_black` | nuit | `level_night` | `towtruck_blue` | — |
| `ville_pluie` | Ville — pluie | `rain` | `city_day` | `wet` | pluie | `level_rain` | `gt3_silver` | — |
| `autoroute_nuit` | Autoroute — nuit | `night` | `city` | `asphalt_black` | nuit | `level_night` | `hypercar_red` | — |
| `montagne_pourpre` | Alpes — coucher violet | `violet` | `alps` | `mountain_narrow` | crepuscule | `level_night` | `gt3_red` | — |
| `desert_nuit` | Désert — nuit étoilée | `milkyway` | `canyon` | `desert` | nuit | `level_night` | `muscle_blue` | — |
| `rallye_automne` | Col d'automne | `overcast` | `forest` | `autumn` | couvert | `level_rain` | `hothatch_green` | — |
| `falaises_orage` | Falaises — orage | `storm` | `cliffs` | `wet` | pluie | `level_rain` | `gt3_blue` | — |
| `metropole_jour` | Métropole — plein jour | `noon` | `metropolis` | `asphalt_teal` | jour | `level_circuit` | `futur_teal` | — |

`previews/preview_levels.png` montre tous ces niveaux (une vignette par entrée, avec son nom).

### Générer une composition aléatoire (pseudo-code)
```
mood   = choisir(moods)                       # pondéré par la saison / la progression
sky    = choisir(moods[mood].skies)
horizon= choisir([h for h in horizons if mood in horizons[h].best])
road   = choisir(track_types[type_du_circuit].roads)  # type du circuit choisi dans circuits.json
overlays = track_types[type].overlays
scenery= horizons[horizon].roadside                    # + signs/buildings au choix
suffix = moods[mood].atlas_suffix                      # '' ou '_night'
music  = choisir(moods[mood].music)
weather= weather_presets[x] si mood == 'pluie' (road = road_wet), sinon aucune
```
Pour une combinaison **ambiance × circuit** (ex. le tracé `docks` de nuit), garder la géométrie du circuit (`circuits/track_*.json`) et ne changer que les éléments visuels ci-dessus : l'ambiance d'un circuit n'est qu'un défaut.
<!-- COMPOSITIONS:END -->
