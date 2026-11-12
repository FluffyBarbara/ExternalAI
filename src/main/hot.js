'use strict';
// Горячие обновления: скачанный код лежит в userData/hot/<версия>.
// Если новая версия не смогла запуститься, при следующем старте
// загрузчик вернётся к предыдущей рабочей версии.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app } = require('electron');

const HOT_DIR = path.join(app.getPath('userData'), 'hot');
const STATE_FILE = path.join(HOT_DIR, 'state.json');

function cmpVersions(a, b) {
  const pa = String(a || '0').split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const pb = String(b || '0').split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function writeState(st) {
  fs.mkdirSync(HOT_DIR, { recursive: true });
  fs.writeFileSync(STATE_FILE + '.tmp', JSON.stringify(st, null, 2));
  fs.renameSync(STATE_FILE + '.tmp', STATE_FILE);
}

function versionDir(version) {
  return path.join(HOT_DIR, version);
}

// Удаляет старые скачанные версии, кроме нужных.
function cleanup(keep = []) {
  let entries = [];
  try { entries = fs.readdirSync(HOT_DIR); } catch { return; }
  for (const name of entries) {
    if (name === 'state.json' || name.endsWith('.tmp') || keep.includes(name)) continue;
    fs.rmSync(path.join(HOT_DIR, name), { recursive: true, force: true });
  }
}

/** Какой код запускать: { dir, version } для скачанной версии или null для встроенной. */
function selectCode() {
  const st = readState();
  const shell = app.getVersion();
  for (let guard = 0; guard < 3 && st.current; guard++) {
    const bad = st.bad || [];
    if (cmpVersions(st.current, shell) <= 0) {
      // Установщик уже поставил версию не хуже скачанной — она больше не нужна.
      writeState({ bad });
      cleanup();
      return null;
    }
    if (bad.includes(st.current) || st.pending === st.current) {
      // Прошлый запуск этой версии не завершился — откатываемся.
      if (!bad.includes(st.current)) bad.push(st.current);
      st.bad = bad;
      st.current = st.previous && !bad.includes(st.previous) ? st.previous : null;
      st.previous = null;
      st.pending = null;
      st.rolledBack = true;
      writeState(st);
      continue;
    }
    const dir = versionDir(st.current);
    if (!fs.existsSync(path.join(dir, 'src', 'main', 'main.js'))) {
      st.current = null;
      writeState(st);
      return null;
    }
    st.pending = st.current;
    writeState(st);
    return { dir, version: st.current };
  }
  return null;
}

/** Код успешно запустился — версия считается рабочей. */
function confirmBoot() {
  const st = readState();
  if (st.pending) {
    st.pending = null;
    writeState(st);
  }
  cleanup([st.current, st.previous].filter(Boolean));
}

function activate(version) {
  const st = readState();
  if (st.current !== version) st.previous = st.current || null;
  st.current = version;
  st.pending = null;
  st.bad = (st.bad || []).filter((v) => v !== version);
  writeState(st);
}

function wasRolledBack() {
  const st = readState();
  if (!st.rolledBack) return false;
  st.rolledBack = false;
  writeState(st);
  return true;
}

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

// Отпечаток встроенных библиотек и Electron: горячее обновление возможно,
// только если новая версия собрана с теми же самыми.
function depsHash(appDir = app.getAppPath(), electronVersion = process.versions.electron) {
  const pkg = JSON.parse(fs.readFileSync(path.join(appDir, 'package.json'), 'utf8'));
  const deps = Object.keys(pkg.dependencies || {}).sort().map((name) => {
    try {
      return `${name}@${JSON.parse(fs.readFileSync(path.join(appDir, 'node_modules', name, 'package.json'), 'utf8')).version}`;
    } catch {
      return `${name}@?`;
    }
  });
  return sha256(Buffer.from(JSON.stringify({ electron: electronVersion, deps })));
}

module.exports = { HOT_DIR, cmpVersions, readState, selectCode, confirmBoot, activate, versionDir, wasRolledBack, sha256, depsHash, cleanup };
