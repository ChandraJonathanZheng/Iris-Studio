// Writes dist/_redirects for Netlify (runs at the end of `npm run build:netlify`).
// Why a script instead of netlify.toml: the API address differs per environment, and netlify.toml
// can't read environment variables in redirect rules. A script can.
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const api = (process.env.API_ORIGIN ?? '').trim().replace(/\/+$/, '');

const lines = [];
if (api) {
  if (!/^https:\/\//.test(api)) throw new Error(`API_ORIGIN must start with https:// (got "${api}")`);
  // 200 = proxy (rewrite), not a redirect: the URL in the browser stays on Netlify. `!` = apply even if a file matches.
  lines.push(`/api/*  ${api}/api/:splat  200!`);
} else {
  console.warn('⚠ API_ORIGIN is not set: /api calls will fail until you set it in Netlify and redeploy.');
  // Answer API calls with a clear 502 instead of the HTML page (the SPA rule below would otherwise catch them).
  lines.push('/api/*  /api-unavailable.json  502!');
  writeFileSync(
    resolve(root, 'dist/api-unavailable.json'),
    JSON.stringify({ title: '伺服器尚未連線，請稍後再試。', code: 'api_unavailable' }),
  );
}
// Every other path is a React Router route → serve the app shell.
lines.push('/*  /index.html  200');

writeFileSync(resolve(root, 'dist/_redirects'), lines.join('\n') + '\n');
console.log(`Wrote dist/_redirects (API → ${api || 'not configured'})`);
