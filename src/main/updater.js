'use strict';
// Обновления ExternalAI.
//
// 1) Горячее обновление (обычный случай): в релизе лежит update-manifest.json со
//    списком файлов и их хешами. Скачиваются только изменённые файлы — столько,
//    сколько реально поменялось, — затем приложение перезапускается на новом коде.
// 2) Полное обновление (если поменялись Electron или библиотеки): electron-updater
//    качает пакет (по возможности только изменённые блоки) и ставит его тихо.
const fs = require('fs');
const path = require('path');
const { app, net } = require('electron');
const { autoUpdater } = require('electron-updater');
const store = require('./store');
const hot = require('./hot');

const REPO = 'FluffyBarbara/ExternalAI';
// Для проверки можно подменить адрес (например, локальным сервером).
const BASE = process.env.EXTERNALAI_UPDATE_BASE || '';
const MANIFEST_URL = BASE ? `${BASE}/update-manifest.json` : `https://github.com/${REPO}/releases/latest/download/update-manifest.json`;
const fileUrl = (version, rel) => (BASE ? `${BASE}/files/${rel}` : `https://raw.githubusercontent.com/${REPO}/v${version}/${rel}`);

const info = () => global.__externalai || { codeRoot: path.join(__dirname, '..', '..'), version: app.getVersion(), hot: false };
const currentVersion = () => info().version;

let send = () => {};
let state = { status: 'idle', version: currentVersion() };
let timer = null;
let busy = false;
let fullReady = false;

function friendly(error) {
  if (!error) return error;
  const e = String(error);
  if (/No published versions|HTTP 404/i.test(e)) return 'В репозитории пока нет опубликованных обновлений';
  if (/ERR_INTERNET_DISCONNECTED|ENOTFOUND|ERR_NAME_NOT_RESOLVED|ETIMEDOUT|ERR_TUNNEL|ECONNREFUSED|ERR_CONNECTION/i.test(e)) return 'Нет связи с GitHub';
  if (/\b(401|403|429)\b/.test(e)) return 'GitHub временно ограничил доступ, попробую позже';
  if (/хеш|hash/i.test(e)) return 'Файл обновления повреждён, попробую ещё раз позже';
  return e;
}

function emit(patch) {
  if (patch.error) patch.error = friendly(patch.error);
  state = { ...state, ...patch, version: currentVersion() };
  send(state);
}

async function fetchBuffer(url) {
  const res = await net.fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

// ───────────────────────── горячее обновление ─────────────────────────

async function hotUpdate(manifest) {
  const base = info().codeRoot;
  const files = Object.entries(manifest.files || {});
  // Что изменилось по сравнению с текущим кодом.
  const changed = [];
  const same = [];
  for (const [rel, meta] of files) {
    let local = null;
    try { local = fs.readFileSync(path.join(base, rel)); } catch { /* файла нет */ }
    if (local && hot.sha256(local) === meta.sha256) same.push([rel, local]);
    else changed.push([rel, meta]);
  }
  const total = changed.reduce((s, [, m]) => s + m.size, 0);
  emit({ status: 'downloading', kind: 'hot', latest: manifest.version, percent: 0, sizeBytes: total, files: changed.length, notes: manifest.notes || '' });

  const tmp = hot.versionDir(manifest.version) + '.tmp';
  fs.rmSync(tmp, { recursive: true, force: true });
  const write = (rel, buf) => {
    const dest = path.join(tmp, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, buf);
  };
  for (const [rel, buf] of same) write(rel, buf);

  let got = 0;
  for (const [rel, meta] of changed) {
    const buf = await fetchBuffer(fileUrl(manifest.version, rel));
    if (hot.sha256(buf) !== meta.sha256) throw new Error(`Неверный хеш файла ${rel}`);
    write(rel, buf);
    got += meta.size;
    emit({ percent: total ? Math.round((got / total) * 100) : 100 });
  }
  fs.writeFileSync(path.join(tmp, 'version.json'), JSON.stringify({ version: manifest.version, date: manifest.date }));

  const dir = hot.versionDir(manifest.version);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.renameSync(tmp, dir);
  hot.activate(manifest.version);
  emit({ status: 'ready', kind: 'hot', percent: 100, latest: manifest.version, sizeBytes: total });
}

// ───────────────────────── полное обновление ─────────────────────────

function setupFull() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = null;
  autoUpdater.on('update-available', (i) => emit({ status: 'downloading', kind: 'full', latest: i.version, percent: 0 }));
  autoUpdater.on('download-progress', (p) => emit({ status: 'downloading', kind: 'full', percent: Math.round(p.percent), sizeBytes: p.total }));
  autoUpdater.on('update-downloaded', (i) => { fullReady = true; emit({ status: 'ready', kind: 'full', latest: i.version, percent: 100 }); });
  autoUpdater.on('error', (err) => emit({ status: 'error', error: String(err?.message || err).split('\n')[0].slice(0, 300) }));
}

async function fullUpdate(manifest) {
  if (!autoUpdater.isUpdaterActive()) {
    emit({ status: 'error', error: `Доступна версия ${manifest.version}, но для неё нужен новый установщик: скачайте его со страницы релизов` });
    return;
  }
  emit({ status: 'downloading', kind: 'full', latest: manifest.version, percent: 0, notes: manifest.notes || '' });
  await autoUpdater.checkForUpdates();
}

// ───────────────────────── общий цикл ─────────────────────────

async function check() {
  if (!app.isPackaged && !BASE) {
    emit({ status: 'dev', error: 'Обновления работают только в установленной версии.' });
    return state;
  }
  if (busy || state.status === 'ready') return state;
  busy = true;
  try {
    emit({ status: 'checking', error: null });
    const manifest = JSON.parse((await fetchBuffer(MANIFEST_URL)).toString('utf8'));
    if (hot.cmpVersions(manifest.version, currentVersion()) <= 0) {
      emit({ status: 'latest', latest: manifest.version, checkedAt: Date.now() });
      return state;
    }
    let local = '';
    try { local = hot.depsHash(); } catch { /* нет данных */ }
    if (manifest.depsHash && manifest.depsHash === local) await hotUpdate(manifest);
    else await fullUpdate(manifest);
  } catch (e) {
    emit({ status: 'error', error: String(e?.message || e).split('\n')[0] });
  } finally {
    busy = false;
  }
  return state;
}

function init(sender) {
  send = sender;
  setupFull();
  emit({ status: 'idle' });
  if (store.get().updates.autoCheck) {
    setTimeout(check, 6000);
    timer = setInterval(check, 2 * 60 * 60 * 1000);
  }
}

// Перезапуск на новой версии.
function install(beforeQuit) {
  if (state.status !== 'ready') return false;
  if (beforeQuit) beforeQuit();
  store.patch({ updates: { justUpdatedFrom: currentVersion() } });
  if (state.kind === 'full' && fullReady) {
    setImmediate(() => autoUpdater.quitAndInstall(true, true)); // тихая установка и запуск
  } else {
    app.relaunch();
    setImmediate(() => app.exit(0));
  }
  return true;
}

async function download() {
  return check();
}

function getState() {
  return state;
}

function dispose() {
  if (timer) clearInterval(timer);
}

module.exports = { init, check, download, install, getState, dispose, currentVersion };
