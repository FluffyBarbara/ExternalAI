// Печатает список изменений версии из CHANGELOG.md.
// Если раздела нет — берёт заголовки коммитов с прошлого тега.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const version = String(process.argv[2] || '').replace(/^v/, '');
const text = fs.readFileSync(path.join(__dirname, '..', 'CHANGELOG.md'), 'utf8');
const re = new RegExp(`^## \\[?${version.replace(/\./g, '\\.')}\\]?[^\\n]*\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, 'm');
const m = text.match(re);
if (m && m[1].trim()) {
  process.stdout.write(m[1].trim() + '\n');
} else {
  let log = '';
  try {
    const prev = execSync('git describe --tags --abbrev=0 HEAD^', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    log = execSync(`git log ${prev}..HEAD --pretty=format:"- %s" --no-merges`).toString();
  } catch {
    log = execSync('git log -20 --pretty=format:"- %s" --no-merges').toString();
  }
  process.stdout.write((log.split('\n').filter((l) => !/^- Версия \d/.test(l)).join('\n') || '- Исправления и улучшения') + '\n');
}
