'use strict';
// Автообновление из GitHub Releases репозитория (electron-updater).
const { app } = require('electron');
const { autoUpdater } = require('electron-updater');
const store = require('./store');

let send = () => {};
let state = { status: 'idle', version: app.getVersion() };
let timer = null;

function friendly(error) {
  if (!error) return error;
  const e = String(error);
  if (/No published versions/i.test(e)) return 'В репозитории пока нет опубликованных релизов';
  if (/latest.*\.yml/i.test(e) && /404|Cannot find/i.test(e)) return 'Релиз ещё собирается — попробуйте позже';
  if (/ERR_INTERNET_DISCONNECTED|ENOTFOUND|ERR_NAME_NOT_RESOLVED|ETIMEDOUT|ERR_TUNNEL|ECONNREFUSED/i.test(e)) return 'Нет связи с GitHub';
  if (/\b(401|403)\b/.test(e)) return 'GitHub ограничил доступ, попробуйте позже';
  return e;
}

function emit(patch) {
  if (patch.error) patch.error = friendly(patch.error);
  state = { ...state, ...patch };
  send(state);
}

function init(sender) {
  send = sender;
  const s = store.get().updates;
  autoUpdater.autoDownload = s.autoDownload;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = s.allowPrerelease;
  autoUpdater.logger = console;

  autoUpdater.on('checking-for-update', () => emit({ status: 'checking', error: null }));
  autoUpdater.on('update-available', (info) => emit({ status: s.autoDownload ? 'downloading' : 'available', latest: info.version, notes: notesText(info), percent: 0 }));
  autoUpdater.on('update-not-available', (info) => emit({ status: 'latest', latest: info.version, checkedAt: Date.now() }));
  autoUpdater.on('download-progress', (p) => emit({ status: 'downloading', percent: Math.round(p.percent), speed: p.bytesPerSecond }));
  autoUpdater.on('update-downloaded', (info) => emit({ status: 'ready', latest: info.version, notes: notesText(info) }));
  autoUpdater.on('error', (err) => emit({ status: 'error', error: String(err?.message || err).split('\n')[0].slice(0, 300) }));

  if (!app.isPackaged) {
    emit({ status: 'dev', error: 'Обновления работают только в установленной версии.' });
    return;
  }
  if (s.autoCheck) {
    setTimeout(check, 8000);
    timer = setInterval(check, 4 * 60 * 60 * 1000);
  }
}

function notesText(info) {
  const n = info?.releaseNotes;
  if (!n) return '';
  const raw = Array.isArray(n) ? n.map((x) => x.note).join('\n') : String(n);
  return raw.replace(/<[^>]+>/g, '').trim().slice(0, 2000);
}

async function check() {
  if (!app.isPackaged) {
    emit({ status: 'dev', error: 'Обновления работают только в установленной версии.' });
    return state;
  }
  try {
    const s = store.get().updates;
    autoUpdater.autoDownload = s.autoDownload;
    autoUpdater.allowPrerelease = s.allowPrerelease;
    if (!autoUpdater.isUpdaterActive()) {
      emit({ status: 'error', error: 'Автообновление недоступно для этого формата установки — используйте установщик или AppImage' });
      return state;
    }
    emit({ status: 'checking', error: null });
    await autoUpdater.checkForUpdates();
  } catch (e) {
    emit({ status: 'error', error: String(e?.message || e).split('\n')[0] });
  }
  return state;
}

async function download() {
  try {
    emit({ status: 'downloading', percent: 0 });
    await autoUpdater.downloadUpdate();
  } catch (e) {
    emit({ status: 'error', error: String(e?.message || e).split('\n')[0] });
  }
  return state;
}

function install(beforeQuit) {
  if (beforeQuit) beforeQuit();
  setImmediate(() => autoUpdater.quitAndInstall(false, true));
}

function getState() {
  return state;
}

function dispose() {
  if (timer) clearInterval(timer);
}

module.exports = { init, check, download, install, getState, dispose };
