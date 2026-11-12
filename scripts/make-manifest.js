// Собирает update-manifest.json для горячих обновлений:
// версия, отпечаток библиотек, список файлов кода с хешами и список изменений.
// Запуск: node scripts/make-manifest.js <версия> [файл-с-изменениями] [выходной файл]
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const version = process.argv[2] || require(path.join(root, 'package.json')).version;
const notesFile = process.argv[3];
const out = process.argv[4] || path.join(root, 'dist', 'update-manifest.json');

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

// Должно совпадать с hot.depsHash() в приложении.
function depsHash() {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const electron = JSON.parse(fs.readFileSync(path.join(root, 'node_modules', 'electron', 'package.json'), 'utf8')).version;
  const deps = Object.keys(pkg.dependencies || {}).sort().map((name) => {
    const v = JSON.parse(fs.readFileSync(path.join(root, 'node_modules', name, 'package.json'), 'utf8')).version;
    return `${name}@${v}`;
  });
  return sha256(Buffer.from(JSON.stringify({ electron, deps })));
}

const files = {};
(function walk(dir) {
  for (const name of fs.readdirSync(dir).sort()) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full);
    else {
      const rel = path.relative(root, full).split(path.sep).join('/');
      const buf = fs.readFileSync(full);
      files[rel] = { sha256: sha256(buf), size: buf.length };
    }
  }
})(path.join(root, 'src'));
for (const extra of ['CHANGELOG.md']) {
  const buf = fs.readFileSync(path.join(root, extra));
  files[extra] = { sha256: sha256(buf), size: buf.length };
}

const manifest = {
  version,
  date: new Date().toISOString(),
  depsHash: depsHash(),
  notes: notesFile && fs.existsSync(notesFile) ? fs.readFileSync(notesFile, 'utf8').trim() : '',
  files,
};
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(manifest, null, 2));
const size = Object.values(files).reduce((s, f) => s + f.size, 0);
console.log(`update-manifest.json: версия ${version}, ${Object.keys(files).length} файлов, ${(size / 1024).toFixed(0)} КБ кода`);
