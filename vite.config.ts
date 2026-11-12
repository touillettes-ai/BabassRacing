import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const root = path.dirname(fileURLToPath(import.meta.url));

/**
 * Éditeur de dialogues LOCAL (dev uniquement, jamais dans le build) : sert `src/story/dialogues.json` à
 * `tools/dialogue-editor.html` et le sauvegarde. Ouvrir http://localhost:5173/tools/dialogue-editor.html pendant `npm run dev`.
 */
function dialogueEditor(): Plugin {
  const file = path.join(root, 'src/story/dialogues.json');
  return {
    name: 'dialogue-editor',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__editor/load', (_req, res) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(fs.readFileSync(file, 'utf-8'));
      });
      // liste des courses (catégorie, circuit) pour l'éditeur, lue depuis la config du jeu
      server.middlewares.use('/__editor/meta', async (_req, res) => {
        try {
          const cats0 = (await server.ssrLoadModule('/src/config/categories.ts')) as typeof import('./src/config/categories');
          const fr = ((await server.ssrLoadModule('/src/i18n/fr.ts')) as { fr: Record<string, string> }).fr;
          const races = cats0.ALL_RACES.map((r) => ({
            id: r.race.id, index: r.index, laps: r.race.laps,
            catId: r.cat.id, category: fr[r.cat.nameKey] ?? r.cat.id, circuit: fr[r.race.nameKey] ?? r.race.layout,
          }));
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          const cats = cats0.CATEGORIES.map((c) => ({ id: c.id, name: fr[c.nameKey] ?? c.id }));
          res.end(JSON.stringify({ races, cats }));
        } catch (e) {
          res.statusCode = 500;
          res.end(String(e));
        }
      });
      server.middlewares.use('/__editor/save', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('POST attendu');
          return;
        }
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          try {
            const json = JSON.parse(body); // valide avant d'écrire
            fs.writeFileSync(file, JSON.stringify(json, null, 2) + '\n', 'utf-8');
            res.end('ok');
          } catch (e) {
            res.statusCode = 400;
            res.end('JSON invalide : ' + String(e));
          }
        });
      });
    },
  };
}


/**
 * Page de réglage des circuits LOCALE (dev uniquement) : `tools/circuit-editor.html` lit et écrit `src/config/circuits.json`
 * (nombre de tours, ambiance et assets par course). Ouvrir http://localhost:5173/tools/circuit-editor.html pendant `npm run dev`.
 */
function circuitEditor(): Plugin {
  const file = path.join(root, 'src/config/circuits.json');
  const assets = path.join(root, 'public/assets');
  const ls = (dir: string, re: RegExp) =>
    fs.readdirSync(path.join(assets, dir)).filter((f) => re.test(f)).sort().map((f) => `${dir}/${f}`);
  return {
    name: 'circuit-editor',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__circuits/load', (_req, res) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(fs.readFileSync(file, 'utf-8'));
      });
      server.middlewares.use('/__circuits/meta', async (_req, res) => {
        try {
          const cats = (await server.ssrLoadModule('/src/config/categories.ts')) as typeof import('./src/config/categories');
          const fr = ((await server.ssrLoadModule('/src/i18n/fr.ts')) as { fr: Record<string, string> }).fr;
          const races = cats.ALL_RACES.map((r) => ({
            id: r.race.id, category: fr[r.cat.nameKey] ?? r.cat.id, circuit: fr[r.race.nameKey] ?? r.race.layout,
            // valeurs par défaut (sans réglage dans circuits.json)
            defaultLaps: r.race.defaultLaps, baseLevel: r.race.baseLevel,
          }));
          const trees = JSON.parse(fs.readFileSync(path.join(assets, 'scenery/trees.json'), 'utf-8')).sprites;
          const list = {
            levels: JSON.parse(fs.readFileSync(path.join(assets, 'levels.json'), 'utf-8')),
            sky_clear: ls('backgrounds', /^sky_.*_clear\.png$/),
            horizon: ls('backgrounds', /^horizon_.*\.png$/),
            clouds_far: ls('backgrounds', /^clouds_.*_far\.png$/),
            clouds_near: ls('backgrounds', /^clouds_.*_near\.png$/),
            road: ls('roads', /^road_.*\.png$/),
            overlays: ls('roads', /^overlay_(arrows|chevrons|crosswalk|oil|logo_asphalt|runoff_stripes|skid_marks)\.png$/),
            music: ls('music', /\.ogg$/),
            roadside: Object.keys(trees),
          };
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ races, list }));
        } catch (e) {
          res.statusCode = 500;
          res.end(String(e));
        }
      });
      server.middlewares.use('/__circuits/save', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('POST attendu');
          return;
        }
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          try {
            const json = JSON.parse(body);
            if (typeof json?.races !== 'object') throw new Error('champ « races » manquant');
            fs.writeFileSync(file, JSON.stringify(json, null, 2) + '\n', 'utf-8');
            res.end('ok');
          } catch (e) {
            res.statusCode = 400;
            res.end('JSON invalide : ' + String(e));
          }
        });
      });
    },
  };
}

/**
 * Page de réglage des moteurs LOCALE (dev uniquement) : `tools/engine-editor.html` lit et écrit `src/config/engines.json`.
 * Ouvrir http://localhost:5173/tools/engine-editor.html pendant `npm run dev`.
 */
function engineEditor(): Plugin {
  const file = path.join(root, 'src/config/engines.json');
  return {
    name: 'engine-editor',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__engines/load', (_req, res) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(fs.readFileSync(file, 'utf-8'));
      });
      server.middlewares.use('/__engines/save', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end('POST attendu'); return; }
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          try {
            const json = JSON.parse(body);
            if (typeof json !== 'object' || !json.gt3) throw new Error('profil « gt3 » manquant');
            fs.writeFileSync(file, JSON.stringify(json, null, 2) + '\n', 'utf-8');
            res.end('ok');
          } catch (e) {
            res.statusCode = 400;
            res.end('JSON invalide : ' + String(e));
          }
        });
      });
    },
  };
}

// base './' : le build peut être hébergé dans n'importe quel sous-dossier.
export default defineConfig({
  base: './',
  server: { port: 5173 },
  plugins: [dialogueEditor(), circuitEditor(), engineEditor()],
});
