// Injects the server-rendered landing page into the built index.html (#7).
// Visitors see real text and layout before JavaScript loads; React then takes over.
import { readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDirs = [resolve(root, 'dist'), resolve(root, '../server/IrisStudio.Api/wwwroot')];
const out = outDirs.find((d) => existsSync(resolve(d, 'index.html')));
if (!out) throw new Error('Run vite build first: no index.html found.');

const { render } = await import(pathToFileURL(resolve(root, 'dist-ssr/entry-server.js')).href);
const file = resolve(out, 'index.html');
const html = readFileSync(file, 'utf8');
writeFileSync(file, html.replace('<!--app-html-->', render()));
rmSync(resolve(root, 'dist-ssr'), { recursive: true, force: true });
console.log(`Pre-rendered landing page into ${file}`);
