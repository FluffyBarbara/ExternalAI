'use strict';
const { app, BrowserWindow, ipcMain, protocol, Tray, Menu, globalShortcut, nativeImage, session, dialog, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const store = require('./store');
const actions = require('./actions');
const ai = require('./ai');
const model = require('./model');
const updater = require('./updater');
const hot = require('./hot');

// Корень кода: встроенный или скачанный горячим обновлением (см. boot.js).
const BOOT = global.__externalai || { codeRoot: path.join(__dirname, '..', '..'), version: app.getVersion(), hot: false };
const ROOT = BOOT.codeRoot;
const RENDERER = path.join(ROOT, 'src', 'renderer');
const SHARED = path.join(ROOT, 'src', 'shared');
const ICON = path.join(app.getAppPath(), 'build', 'icon.png');
const DEV = process.argv.includes('--dev');

let win = null;
let tray = null;
let quitting = false;

app.setAppUserModelId('com.fluffybarbara.externalai');

// Свой протокол app:// — интерфейс, движок распознавания и модель с одного адреса.
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow());
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json',
  '.gz': 'application/gzip', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
};

function resolveAppPath(urlPath) {
  const clean = decodeURIComponent(urlPath).replace(/^\/+/, '');
  if (clean === 'vendor/vosk.js') return require.resolve('vosk-browser/dist/vosk.js');
  if (clean === 'model/ru.tar.gz') return model.modelFile();
  if (clean === 'CHANGELOG.md') return path.join(ROOT, 'CHANGELOG.md');
  const base = clean.startsWith('shared/') ? SHARED : RENDERER;
  const rel = clean.startsWith('shared/') ? clean.slice(7) : clean || 'index.html';
  const full = path.normalize(path.join(base, rel));
  if (!full.startsWith(base)) return null; // защита от выхода за пределы папки
  return full;
}

function registerProtocol() {
  protocol.handle('app', async (request) => {
    const { pathname } = new URL(request.url);
    const file = resolveAppPath(pathname);
    try {
      if (!file) throw new Error('forbidden');
      const data = await fs.promises.readFile(file);
      return new Response(data, { headers: { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' } });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
}

function createWindow() {
  const s = store.get();
  win = new BrowserWindow({
    width: 1320,
    height: 840,
    minWidth: 1000,
    minHeight: 660,
    show: false,
    frame: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    backgroundColor: '#03060c',
    icon: ICON,
    title: 'ExternalAI',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false, // распознавание речи работает и в фоне
      autoplayPolicy: 'no-user-gesture-required',
    },
  });

  win.loadURL('app://externalai/index.html');

  // Интерфейс загрузился — значит, эта версия кода рабочая.
  win.webContents.once('did-finish-load', () => setTimeout(() => {
    try { hot.confirmBoot(); } catch (e) { console.warn('confirmBoot', e); }
  }, 3000));

  win.once('ready-to-show', () => {
    const hidden = process.argv.includes('--hidden') || s.system.startHidden;
    if (!hidden) win.show();
    if (DEV) win.webContents.openDevTools({ mode: 'detach' });
  });

  win.on('close', (e) => {
    if (!quitting && store.get().system.minimizeToTray) {
      e.preventDefault();
      win.hide();
      if (!store.get().trayHintShown) {
        store.set('trayHintShown', true);
        actions.notify('ExternalAI работает в фоне', 'Я продолжаю слушать. Открыть окно — значок в трее или горячая клавиша.');
      }
    }
  });
  win.on('maximize', () => send('win:state', { maximized: true }));
  win.on('unmaximize', () => send('win:state', { maximized: false }));

  // Ссылки из интерфейса открываем во внешнем браузере.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('app://')) e.preventDefault();
  });
}

function showWindow() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function createTray() {
  let img = nativeImage.createFromPath(ICON);
  if (!img.isEmpty()) img = img.resize({ width: 18, height: 18 });
  tray = new Tray(img);
  tray.setToolTip('ExternalAI');
  const menu = Menu.buildFromTemplate([
    { label: 'Показать ExternalAI', click: showWindow },
    { label: 'Слушать команду', click: () => { showWindow(); send('hotkey', {}); } },
    { type: 'separator' },
    { label: 'Проверить обновления', click: () => updater.check() },
    { type: 'separator' },
    { label: 'Выход', click: () => { quitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu);
  tray.on('click', () => (win.isVisible() && win.isFocused() ? win.hide() : showWindow()));
}

function registerHotkey() {
  globalShortcut.unregisterAll();
  const key = store.get().system.hotkey;
  if (!key) return;
  try {
    globalShortcut.register(key, () => {
      showWindow();
      send('hotkey', {});
    });
  } catch (e) {
    console.warn('hotkey failed', e);
  }
}

function applyAutostart() {
  if (process.platform === 'linux') return;
  const { autostart } = store.get().system;
  app.setLoginItemSettings({ openAtLogin: !!autostart, args: ['--hidden'] });
}

// ───────────── мост к интерфейсу: запросы из main в renderer ─────────────
let rpcSeq = 0;
const rpcPending = new Map();
function rendererCall(method, payload, timeoutMs = 120000) {
  return new Promise((resolve) => {
    const id = ++rpcSeq;
    const t = setTimeout(() => { rpcPending.delete(id); resolve(null); }, timeoutMs);
    rpcPending.set(id, (value) => { clearTimeout(t); resolve(value); });
    send('rpc:request', { id, method, payload });
  });
}
ipcMain.on('rpc:response', (_e, { id, value }) => {
  const fn = rpcPending.get(id);
  if (fn) { rpcPending.delete(id); fn(value); }
});

const bridge = {
  get win() { return win; },
  confirm: async (opts) => {
    showWindow();
    return !!(await rendererCall('confirm', opts, 90000));
  },
  call: (method, payload) => rendererCall(method, payload, 15000),
  log: (event) => send('ai:event', event),
};

// ───────────── IPC ─────────────
function handle(channel, fn) {
  ipcMain.handle(channel, async (_e, ...args) => {
    try {
      return await fn(...args);
    } catch (err) {
      console.error(channel, err);
      return { ok: false, message: String(err?.message || err) };
    }
  });
}

// Действия, которые интерфейс может вызывать напрямую (локальные команды).
const DIRECT_ACTIONS = {
  openUrl: (a) => actions.openUrl(a.url),
  openApp: (a) => actions.openApp(a.name, { strict: !!a.strict }),
  closeApp: (a) => actions.closeApp(a.name),
  openPath: (a) => actions.openPath(a.path),
  volume: (a) => actions.volume(a.action, a.amount),
  media: (a) => actions.media(a.action),
  power: (a) => actions.power(a.action, a.delay),
  screenshot: () => actions.screenshot(win),
  typeText: (a) => actions.typeText(a.text, win),
  copyText: (a) => actions.copyText(a.text),
  minimizeAll: () => actions.minimizeAll(),
  notify: (a) => actions.notify(a.title, a.body),
  systemInfo: () => actions.systemInfo(),
  readClipboard: () => actions.readClipboard(),
  keys: (a) => actions.pressKeys(a.combo, win, a.times || 1),
  activeWindow: (a) => actions.activeWindow(a.action, win),
  selectedText: () => actions.selectedText(win),
  brightness: (a) => actions.brightness(a.action, a.amount),
  diskInfo: () => actions.diskInfo(),
  findFiles: (a) => actions.findFiles(a.query),
  openFile: (a) => actions.openFile(a.query, { reveal: !!a.reveal }),
  createItem: (a) => actions.createItem(a.kind, a.name, a.where),
  lastScreenshot: () => actions.lastScreenshot(),
  emptyTrash: () => actions.emptyTrash(),
  settingsPage: (a) => actions.openSettingsPage(a.what),
};

// Сообщения о прогрессе загрузки не чаще 5 раз в секунду — интерфейс не дёргается.
function throttledProgress() {
  let last = 0;
  let lastStage = '';
  return (p) => {
    const now = Date.now();
    if (p.stage !== lastStage || now - last > 200 || p.stage === 'done') {
      last = now;
      lastStage = p.stage;
      send('model:progress', p);
    }
  };
}

function registerIpc() {
  handle('settings:get', () => store.get());
  handle('settings:patch', (partial) => {
    const before = store.get();
    const prevHotkey = before.system.hotkey;
    const next = store.patch(partial);
    if (partial?.system) {
      if (next.system.hotkey !== prevHotkey) registerHotkey();
      applyAutostart();
    }
    return next;
  });

  handle('action', (name, args = {}) => {
    const fn = DIRECT_ACTIONS[name];
    if (!fn) return { ok: false, message: 'Неизвестное действие' };
    return fn(args);
  });

  handle('ai:ask', (text) => ai.ask(String(text || ''), bridge));
  handle('ai:reset', () => { ai.reset(); return { ok: true }; });
  handle('ai:test', () => ai.testKey());
  // Повтор выученных действий без обращения к ИИ.
  handle('ai:runTool', (name, input) => ai.runLearned(name, input, bridge));

  handle('model:status', () => ({ ready: model.hasModel(), name: model.MODEL_NAME }));
  handle('model:ensure', () => model.ensureModel(throttledProgress()));
  handle('model:import', async () => {
    const r = await dialog.showOpenDialog(win, {
      title: 'Выберите модель Vosk (.zip или .tar.gz)',
      filters: [{ name: 'Модель Vosk', extensions: ['zip', 'gz', 'tgz'] }],
      properties: ['openFile'],
    });
    if (r.canceled || !r.filePaths[0]) return { ok: false, canceled: true };
    return model.importModel(r.filePaths[0], throttledProgress());
  });
  handle('model:remove', () => { model.removeModel(); return { ok: true }; });

  handle('update:check', () => updater.check());
  handle('update:download', () => updater.download());
  handle('update:install', () => ({ ok: updater.install(() => { quitting = true; }) }));
  handle('update:state', () => updater.getState());

  handle('app:info', () => ({
    version: BOOT.version,
    shellVersion: app.getVersion(),
    hot: BOOT.hot,
    rolledBack: (() => { try { return hot.wasRolledBack(); } catch { return false; } })(),
    platform: process.platform,
    electron: process.versions.electron,
    packaged: app.isPackaged,
    userData: app.getPath('userData'),
  }));
  handle('app:openExternal', (url) => (/^https?:\/\//.test(url) ? shell.openExternal(url) : null));
  handle('app:openUserData', () => shell.openPath(app.getPath('userData')));
  handle('app:warmup', () => { actions.buildAppIndex(); return { ok: true }; });
  handle('app:catalog', () => actions.catalogCounts());

  ipcMain.on('win:minimize', () => win?.minimize());
  ipcMain.on('win:toggleMaximize', () => (win?.isMaximized() ? win.unmaximize() : win?.maximize()));
  ipcMain.on('win:close', () => win?.close());
  ipcMain.on('win:hide', () => win?.hide());
  ipcMain.on('win:show', () => showWindow());
  ipcMain.on('app:quit', () => { quitting = true; app.quit(); });
  ipcMain.on('app:relaunch', () => { quitting = true; app.relaunch(); app.exit(0); });
}

app.whenReady().then(() => {
  registerProtocol();

  // Микрофон и уведомления разрешены только нашему интерфейсу.
  const allowed = new Set(['media', 'audioCapture', 'notifications', 'clipboard-sanitized-write', 'clipboard-read']);
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => cb(allowed.has(permission) && wc.getURL().startsWith('app://')));
  session.defaultSession.setPermissionCheckHandler((wc, permission) => allowed.has(permission));

  registerIpc();
  createWindow();
  createTray();
  registerHotkey();
  applyAutostart();
  updater.init((state) => send('update:state', state));

  app.on('activate', showWindow);
});

app.on('before-quit', () => { quitting = true; });
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  updater.dispose();
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
