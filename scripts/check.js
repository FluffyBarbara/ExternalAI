// Быстрая проверка синтаксиса всех JS-файлов проекта.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const files = [];
(function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) walk(full);
    else if (/\.(m?js)$/.test(f)) files.push(full);
  }
})(path.join(root, 'src'));
files.push(...fs.readdirSync(__dirname).map((f) => path.join(__dirname, f)));

let failed = 0;
for (const f of files) {
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
  } catch (e) {
    failed++;
    console.error(`✕ ${path.relative(root, f)}\n${e.stderr}`);
  }
}
console.log(failed ? `Ошибки в ${failed} файлах` : `✓ ${files.length} файлов без синтаксических ошибок`);
process.exit(failed ? 1 : 0);
