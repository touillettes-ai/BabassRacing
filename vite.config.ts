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
          const cats = (await server.ssrLoadModule('/src/config/categories.ts')) as typeof import('./src/config/categories');
          const fr = ((await server.ssrLoadModule('/src/i18n/fr.ts')) as { fr: Record<string, string> }).fr;
          const races = cats.ALL_RACES.map((r) => ({
            id: r.race.id, index: r.index, laps: r.race.laps,
            category: fr[r.cat.nameKey] ?? r.cat.id, circuit: fr[r.race.nameKey] ?? r.race.layout,
          }));
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ races }));
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

// base './' : le build peut être hébergé dans n'importe quel sous-dossier.
export default defineConfig({
  base: './',
  server: { port: 5173 },
  plugins: [dialogueEditor()],
});
