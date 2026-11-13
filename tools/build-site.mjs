// Collect the static site into _site/ (what GitHub Pages publishes).   npm run build
// The page loads three.js and three-vrm from node_modules through the import map in index.html;
// only the library files it actually imports are copied, found by following their imports.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, '_site');

const copy = rel => fs.cpSync(path.join(root, rel), path.join(out, rel), {
  recursive: true,
  filter: src => path.basename(src) !== '_tmp',   // bake leftovers
});

// import specifiers in a module ("import x from '...'", "export * from '...'", "import '...'")
const IMPORT = /(?:\bfrom\s*|\bimport\s*\(?\s*)['"]([^'"]+)['"]/g;
const importsOf = file => [...fs.readFileSync(file, 'utf8').matchAll(IMPORT)].map(m => m[1]);
const sourceFiles = dir => fs.readdirSync(dir, { recursive: true }).filter(f => f.endsWith('.js')).map(f => path.join(dir, f));

// the import map's entries, resolved to files in this folder
const importMap = JSON.parse(fs.readFileSync(path.join(root, 'index.html'), 'utf8').match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;
function resolveBare(spec) {
  if (importMap[spec]) return path.join(root, importMap[spec]);
  const prefix = Object.keys(importMap).find(k => k.endsWith('/') && spec.startsWith(k));
  return prefix ? path.join(root, importMap[prefix], spec.slice(prefix.length)) : null;
}

// every library file reachable from the page's own modules
function libraryFiles() {
  const found = new Set();
  const visit = file => {
    if (found.has(file) || !fs.existsSync(file)) return;   // (doc comments can name files that don't exist)
    found.add(file);
    for (const spec of importsOf(file)) {
      const next = spec.startsWith('.') ? path.resolve(path.dirname(file), spec) : resolveBare(spec);
      if (next) visit(next);
    }
  };
  for (const file of sourceFiles(path.join(root, 'src'))) {
    for (const spec of importsOf(file)) if (!spec.startsWith('.')) { const f = resolveBare(spec); if (f) visit(f); }
  }
  return [...found].map(f => path.relative(root, f));
}

fs.rmSync(out, { recursive: true, force: true });
for (const rel of ['index.html', 'src', 'assets/room', 'assets/rei.vrm', 'assets/pose.json', 'assets/layout.json']) {
  if (fs.existsSync(path.join(root, rel))) copy(rel);
}
const libs = libraryFiles();
for (const rel of libs) copy(rel);
for (const lic of ['node_modules/three/LICENSE', 'node_modules/@pixiv/three-vrm/LICENSE']) if (fs.existsSync(path.join(root, lic))) copy(lic);
fs.writeFileSync(path.join(out, '.nojekyll'), '');

const size = dir => fs.readdirSync(dir, { recursive: true })
  .map(f => fs.statSync(path.join(dir, f))).filter(st => st.isFile()).reduce((n, st) => n + st.size, 0);
console.log(`_site/: ${libs.length} library files, ${(size(out) / 1e6).toFixed(1)} MB`);
