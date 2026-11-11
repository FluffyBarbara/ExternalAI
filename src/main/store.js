'use strict';
// Простое хранилище настроек в JSON-файле внутри папки пользователя.
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const DEFAULTS = {
  voice: {
    wakeWordEnabled: true,
    wakeWords: ['джарвис', 'jarvis', 'экстернал', 'компьютер'],
    continuous: true,            // слушать постоянно (с ключевым словом)
    followUpSeconds: 8,          // после ответа слушать без ключевого слова N секунд
    ttsEnabled: true,
    ttsVoice: '',
    ttsRate: 1.05,
    ttsPitch: 0.9,
    ttsVolume: 1,
    sounds: true,
  },
  ai: {
    apiKey: '',
    model: 'claude-opus-5-5',
    effort: 'low',
    baseURL: '',
    webSearch: true,
    fallbacks: true,
    shellPolicy: 'ask',          // ask | always | never
    persona: '',
  },
  system: {
    autostart: false,
    startHidden: false,
    minimizeToTray: true,
    hotkey: 'CommandOrControl+Shift+Space',
    city: 'Москва',
  },
  updates: {
    autoCheck: true,
    autoDownload: true,
    allowPrerelease: false,
  },
  ui: {
    accent: '#22d3ee',
    reduceMotion: false,
  },
  notes: [],
  userName: '',
  firstRun: true,
};

let cache = null;

function file() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function deepMerge(base, extra) {
  if (Array.isArray(base) || typeof base !== 'object' || base === null) {
    return extra === undefined ? base : extra;
  }
  const out = { ...base };
  for (const key of Object.keys(extra || {})) {
    out[key] = key in base ? deepMerge(base[key], extra[key]) : extra[key];
  }
  return out;
}

function load() {
  if (cache) return cache;
  let saved = {};
  try {
    saved = JSON.parse(fs.readFileSync(file(), 'utf8'));
  } catch {
    saved = {};
  }
  cache = deepMerge(structuredClone(DEFAULTS), saved);
  return cache;
}

function save() {
  const target = file();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const tmp = target + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cache, null, 2), 'utf8');
  fs.renameSync(tmp, target);
}

function get() {
  return load();
}

function patch(partial) {
  cache = deepMerge(load(), partial);
  save();
  return cache;
}

function set(key, value) {
  load()[key] = value;
  save();
  return cache;
}

module.exports = { get, patch, set, DEFAULTS };
