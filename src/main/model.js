'use strict';
// Загрузка офлайн-модели распознавания русской речи (Vosk).
// Vosk публикует модели в .zip, а движок в браузере ждёт .tar.gz —
// поэтому скачиваем zip и перепаковываем его один раз.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { app, net } = require('electron');
const AdmZip = require('adm-zip');
const tar = require('tar');

const MODEL_NAME = 'vosk-model-small-ru-0.22';
const SOURCES = [
  `https://alphacephei.com/vosk/models/${MODEL_NAME}.zip`,
];

function modelDir() {
  return path.join(app.getPath('userData'), 'models');
}

function modelFile() {
  return path.join(modelDir(), 'ru.tar.gz');
}

function hasModel() {
  try {
    return fs.statSync(modelFile()).size > 10 * 1024 * 1024;
  } catch {
    return false;
  }
}

async function download(url, dest, onProgress) {
  const res = await net.fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} при загрузке ${url}`);
  const total = Number(res.headers.get('content-length')) || 0;
  const out = fs.createWriteStream(dest);
  const reader = res.body.getReader();
  let received = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.length;
      if (!out.write(Buffer.from(value))) await new Promise((r) => out.once('drain', r));
      onProgress({ stage: 'download', received, total, percent: total ? Math.round((received / total) * 100) : 0 });
    }
  } finally {
    await new Promise((r) => out.end(r));
  }
}

// Превращает zip (или папку модели) в tar.gz с одной корневой папкой.
async function packFromZip(zipPath, onProgress) {
  onProgress({ stage: 'extract', percent: 0 });
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'externalai-model-'));
  try {
    new AdmZip(zipPath).extractAllTo(work, true);
    let root = work;
    const entries = fs.readdirSync(work);
    if (entries.length === 1 && fs.statSync(path.join(work, entries[0])).isDirectory()) root = path.join(work, entries[0]);
    if (!fs.existsSync(path.join(root, 'am')) && !fs.existsSync(path.join(root, 'conf'))) {
      throw new Error('В архиве нет модели Vosk (ожидались папки am/ и conf/)');
    }
    onProgress({ stage: 'pack', percent: 50 });
    fs.mkdirSync(modelDir(), { recursive: true });
    const tmpOut = modelFile() + '.part';
    await tar.c({ gzip: true, file: tmpOut, cwd: path.dirname(root), portable: true }, [path.basename(root)]);
    fs.renameSync(tmpOut, modelFile());
    onProgress({ stage: 'done', percent: 100 });
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

let pending = null;

function ensureModel(onProgress = () => {}) {
  if (hasModel()) return Promise.resolve({ ok: true, path: modelFile() });
  if (pending) return pending;
  pending = (async () => {
    fs.mkdirSync(modelDir(), { recursive: true });
    const zipPath = path.join(modelDir(), MODEL_NAME + '.zip');
    let lastError = null;
    for (const url of SOURCES) {
      try {
        await download(url, zipPath, onProgress);
        await packFromZip(zipPath, onProgress);
        fs.rmSync(zipPath, { force: true });
        return { ok: true, path: modelFile() };
      } catch (e) {
        lastError = e;
        fs.rmSync(zipPath, { force: true });
      }
    }
    return { ok: false, error: String(lastError?.message || lastError) };
  })().finally(() => {
    pending = null;
  });
  return pending;
}

// Ручной импорт: пользователь выбрал .zip или .tar.gz модели сам.
async function importModel(file, onProgress = () => {}) {
  fs.mkdirSync(modelDir(), { recursive: true });
  if (/\.tar\.gz$|\.tgz$/i.test(file)) {
    fs.copyFileSync(file, modelFile());
    onProgress({ stage: 'done', percent: 100 });
  } else if (/\.zip$/i.test(file)) {
    await packFromZip(file, onProgress);
  } else {
    throw new Error('Нужен файл .zip или .tar.gz');
  }
  return { ok: true, path: modelFile() };
}

function removeModel() {
  fs.rmSync(modelFile(), { force: true });
}

module.exports = { ensureModel, importModel, hasModel, modelFile, removeModel, MODEL_NAME };
