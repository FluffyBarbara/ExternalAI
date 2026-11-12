'use strict';
// Загрузчик ExternalAI: запускает самую свежую версию кода —
// встроенную в установщик или скачанную горячим обновлением.
const { app } = require('electron');
const path = require('path');
const Module = require('module');

let target = null;
try {
  target = require('./hot').selectCode();
} catch (e) {
  console.error('hot select failed', e);
}

if (target) {
  // Библиотеки берём из установленного приложения.
  process.env.NODE_PATH = [path.join(app.getAppPath(), 'node_modules'), process.env.NODE_PATH].filter(Boolean).join(path.delimiter);
  Module._initPaths();
  global.__externalai = { codeRoot: target.dir, version: target.version, hot: true };
  try {
    require(path.join(target.dir, 'src', 'main', 'main.js'));
  } catch (e) {
    // Новая версия не загрузилась — следующий запуск откатится автоматически.
    console.error('hot code failed', e);
    app.relaunch();
    app.exit(0);
  }
} else {
  global.__externalai = { codeRoot: path.join(__dirname, '..', '..'), version: app.getVersion(), hot: false };
  require('./main.js');
}
