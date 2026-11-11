/**
 * Gera o sw.js com a lista de arquivos do app e uma versão baseada no conteúdo.
 * Rode depois de mudar qualquer arquivo: `npm run build`.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const include = ['index.html', 'manifest.webmanifest', 'styles', 'src', 'icons'];

function walk(p) {
  const st = statSync(p);
  if (st.isDirectory()) return readdirSync(p).sort().flatMap((n) => walk(join(p, n)));
  return [p];
}

const files = include.flatMap((p) => walk(join(root, p))).filter((f) => !/\.(md|map)$/.test(f));
const hash = createHash('sha1');
for (const f of files) hash.update(relative(root, f)).update(readFileSync(f));
const version = hash.digest('hex').slice(0, 10);
const assets = ['./', ...files.map((f) => './' + relative(root, f).split(sep).join('/'))];
const tpl = readFileSync(join(root, 'scripts', 'sw.template.js'), 'utf8');
writeFileSync(join(root, 'sw.js'), tpl.replace('__VERSION__', version).replace('__ASSETS__', JSON.stringify(assets, null, 2)));
console.log(`sw.js: ${assets.length} arquivos · versão ${version}`);
