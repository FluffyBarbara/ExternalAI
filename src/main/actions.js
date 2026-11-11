'use strict';
// Системные действия ExternalAI: запуск программ, сайты, громкость, медиа,
// питание, скриншоты, ввод текста, выполнение команд. Работает на Windows,
// Linux и macOS (основной упор — Windows).
const { app, shell, clipboard, desktopCapturer, screen, Notification } = require('electron');
const { exec, execFile, spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { translit, similarity, normalize } = require('../shared/text');

const IS_WIN = process.platform === 'win32';
const IS_MAC = process.platform === 'darwin';

// ───────────────────────── helpers ─────────────────────────

function runCmd(command, { timeout = 60000, cwd } = {}) {
  return new Promise((resolve) => {
    exec(command, { timeout, cwd, windowsHide: true, maxBuffer: 8 * 1024 * 1024, encoding: 'utf8' },
      (error, stdout, stderr) => {
        resolve({ code: error ? (error.code ?? 1) : 0, stdout: String(stdout || ''), stderr: String(stderr || error?.message || '') });
      });
  });
}

// PowerShell через -EncodedCommand: никаких проблем с кавычками и кириллицей.
function ps(script, { timeout = 60000 } = {}) {
  const prefix = '[Console]::OutputEncoding=[System.Text.Encoding]::UTF8;$ProgressPreference="SilentlyContinue";';
  const encoded = Buffer.from(prefix + script, 'utf16le').toString('base64');
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
      { timeout, windowsHide: true, maxBuffer: 16 * 1024 * 1024, encoding: 'utf8' },
      (error, stdout, stderr) => {
        resolve({ code: error ? (error.code ?? 1) : 0, stdout: String(stdout || ''), stderr: String(stderr || error?.message || '') });
      });
  });
}

function detached(cmd, args = []) {
  const child = spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: false });
  child.on('error', () => {});
  child.unref();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (message, extra = {}) => ({ ok: true, message, ...extra });
const fail = (message, extra = {}) => ({ ok: false, message, ...extra });

// ───────────────────────── URLs & folders ─────────────────────────

async function openUrl(url) {
  let target = String(url || '').trim();
  if (!target) return fail('Не указан адрес');
  if (!/^[a-z][a-z0-9+.-]*:/i.test(target)) target = 'https://' + target;
  const scheme = target.split(':')[0].toLowerCase();
  const allowed = ['http', 'https', 'mailto', 'tg', 'steam', 'discord', 'spotify', 'ms-settings', 'zoommtg', 'vk'];
  if (!allowed.includes(scheme)) return fail('Этот тип ссылок запрещён: ' + scheme);
  await shell.openExternal(target);
  return ok('Открываю ' + target.replace(/^https?:\/\//, '').replace(/\/$/, ''));
}

const FOLDERS = {
  downloads: 'downloads', загрузки: 'downloads', документы: 'documents', documents: 'documents',
  desktop: 'desktop', 'рабочий стол': 'desktop', изображения: 'pictures', картинки: 'pictures',
  фото: 'pictures', pictures: 'pictures', музыка: 'music', music: 'music', видео: 'videos',
  videos: 'videos', home: 'home', 'домашняя папка': 'home',
};

async function openPath(target) {
  let p = String(target || '').trim();
  const key = FOLDERS[p.toLowerCase()];
  if (key) p = app.getPath(key);
  p = p.replace(/^~(?=$|[\\/])/, os.homedir());
  if (!fs.existsSync(p)) return fail('Путь не найден: ' + p);
  const err = await shell.openPath(p);
  return err ? fail(err) : ok('Открываю ' + path.basename(p) || p);
}

// ───────────────────────── applications ─────────────────────────

// Русские названия → «каноничные» имена приложений.
const APP_ALIASES = {
  'блокнот': 'notepad', 'калькулятор': 'calculator', 'проводник': 'explorer', 'диспетчер задач': 'task manager',
  'панель управления': 'control panel', 'параметры': 'settings', 'настройки': 'settings',
  'настройки windows': 'settings', 'командная строка': 'cmd', 'консоль': 'terminal', 'терминал': 'terminal',
  'пауэршелл': 'powershell', 'паинт': 'paint', 'пэйнт': 'paint', 'ножницы': 'snipping tool',
  'хром': 'chrome', 'гугл хром': 'chrome', 'браузер': 'browser', 'эдж': 'edge', 'опера': 'opera',
  'файрфокс': 'firefox', 'фаерфокс': 'firefox', 'мозилла': 'firefox', 'яндекс браузер': 'yandex',
  'яндекс': 'yandex', 'телеграм': 'telegram', 'телеграмм': 'telegram', 'дискорд': 'discord',
  'стим': 'steam', 'спотифай': 'spotify', 'ворд': 'word', 'эксель': 'excel', 'ексель': 'excel',
  'пауэрпоинт': 'powerpoint', 'повер поинт': 'powerpoint', 'аутлук': 'outlook', 'тимс': 'teams',
  'зум': 'zoom', 'скайп': 'skype', 'вайбер': 'viber', 'ватсап': 'whatsapp', 'вотсап': 'whatsapp',
  'фотошоп': 'photoshop', 'обс': 'obs', 'вс код': 'visual studio code', 'визуал студио код': 'visual studio code',
  'вижуал студио': 'visual studio', 'майнкрафт': 'minecraft', 'эпик геймс': 'epic games',
  'торрент': 'torrent', 'винрар': 'winrar', 'семь зип': '7-zip', 'вк': 'vk', 'вконтакте': 'vk',
  'аймп': 'aimp', 'вэлс': 'vlc', 'влс': 'vlc', 'медиаплеер': 'media player', 'камера': 'camera',
  'почта': 'mail', 'календарь': 'calendar', 'магазин': 'microsoft store', 'часы': 'clock',
  'фотографии': 'photos', 'ютуб музыка': 'youtube music', 'гитхаб десктоп': 'github desktop',
  'блендер': 'blender', 'юнити': 'unity', 'кубейс': 'cubase', 'фл студио': 'fl studio',
};

// Встроенные программы Windows: короткий путь без поиска.
const WIN_BUILTIN = {
  notepad: ['notepad.exe'], calculator: ['calc.exe'], explorer: ['explorer.exe'], 'task manager': ['taskmgr.exe'],
  'control panel': ['control.exe'], settings: ['explorer.exe', 'ms-settings:'], cmd: ['cmd.exe', '/k'],
  powershell: ['powershell.exe'], terminal: ['wt.exe'], paint: ['mspaint.exe'], 'snipping tool': ['snippingtool.exe'],
  browser: null,
};

let appIndex = null;
let appIndexTime = 0;

async function buildAppIndex() {
  if (appIndex && Date.now() - appIndexTime < 10 * 60 * 1000) return appIndex;
  const list = [];
  try {
    if (IS_WIN) {
      const r = await ps('Get-StartApps | Select-Object Name, AppID | ConvertTo-Json -Compress', { timeout: 20000 });
      const parsed = JSON.parse(r.stdout || '[]');
      for (const item of [].concat(parsed)) {
        if (item?.Name && item?.AppID) list.push({ name: item.Name, id: item.AppID, kind: 'win' });
      }
    } else if (IS_MAC) {
      for (const dir of ['/Applications', '/System/Applications', path.join(os.homedir(), 'Applications')]) {
        try {
          for (const f of fs.readdirSync(dir)) if (f.endsWith('.app')) list.push({ name: f.replace(/\.app$/, ''), id: path.join(dir, f), kind: 'mac' });
        } catch { /* нет папки */ }
      }
    } else {
      const dirs = ['/usr/share/applications', '/usr/local/share/applications', path.join(os.homedir(), '.local/share/applications'), '/var/lib/flatpak/exports/share/applications', '/var/lib/snapd/desktop/applications'];
      for (const dir of dirs) {
        let files = [];
        try { files = fs.readdirSync(dir); } catch { continue; }
        for (const f of files) {
          if (!f.endsWith('.desktop')) continue;
          try {
            const txt = fs.readFileSync(path.join(dir, f), 'utf8');
            if (/^NoDisplay=true/m.test(txt)) continue;
            const name = (txt.match(/^Name=(.+)$/m) || [])[1];
            const nameRu = (txt.match(/^Name\[ru\]=(.+)$/m) || [])[1];
            const id = f.replace(/\.desktop$/, '');
            if (name) list.push({ name, id, kind: 'linux' });
            if (nameRu) list.push({ name: nameRu, id, kind: 'linux' });
          } catch { /* пропускаем */ }
        }
      }
    }
  } catch (e) {
    console.warn('app index failed', e);
  }
  appIndex = list;
  appIndexTime = Date.now();
  return list;
}

function scoreName(query, name) {
  const q = normalize(query);
  const qLat = translit(q);
  const n = normalize(name);
  const nLat = translit(n);
  if (!q) return 0;
  if (n === q || nLat === qLat) return 1;
  let best = 0;
  for (const [a, b] of [[q, n], [qLat, nLat]]) {
    if (b.startsWith(a)) best = Math.max(best, 0.92 - Math.min(0.2, (b.length - a.length) / 60));
    else if (b.split(' ').includes(a)) best = Math.max(best, 0.88);
    else if (b.includes(a) && a.length >= 3) best = Math.max(best, 0.8);
    best = Math.max(best, similarity(a, b));
    for (const word of b.split(' ')) if (word.length >= 3) best = Math.max(best, similarity(a, word) - 0.05);
  }
  return best;
}

async function findApp(query) {
  const index = await buildAppIndex();
  let best = null;
  for (const item of index) {
    const s = scoreName(query, item.name);
    if (!best || s > best.score) best = { ...item, score: s };
  }
  return best && best.score >= 0.72 ? best : null;
}

async function openApp(name) {
  const raw = normalize(name);
  if (!raw) return fail('Не понял, что открыть');
  const canon = APP_ALIASES[raw] || raw;

  if (canon === 'browser') return openUrl('https://www.google.com');

  if (IS_WIN && WIN_BUILTIN[canon]) {
    const [cmd, ...args] = WIN_BUILTIN[canon];
    detached(cmd, args);
    return ok('Открываю ' + name);
  }

  const found = (await findApp(canon)) || (canon !== raw ? await findApp(raw) : null);
  if (found) {
    if (found.kind === 'win') detached('explorer.exe', ['shell:AppsFolder\\' + found.id]);
    else if (found.kind === 'mac') detached('open', [found.id]);
    else detached('gtk-launch', [found.id]);
    return ok('Запускаю ' + found.name, { app: found.name });
  }

  // Последняя попытка — системный запуск по имени (App Paths, PATH).
  if (IS_WIN) {
    // Только если программа точно есть в PATH или в реестре App Paths — иначе Windows покажет окно ошибки.
    const bin = canon.replace(/[^a-z0-9._-]/gi, '');
    if (bin) {
      const exe = bin.endsWith('.exe') ? bin : bin + '.exe';
      const where = await runCmd(`where ${exe}`, { timeout: 5000 });
      const reg = where.code === 0 ? where : await runCmd(`reg query "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${exe}" || reg query "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${exe}"`, { timeout: 5000 });
      if (reg.code === 0) {
        await runCmd(`start "" "${exe}"`, { timeout: 8000 });
        return ok('Запускаю ' + name);
      }
    }
  } else if (IS_MAC) {
    const r = await runCmd(`open -a "${canon.replace(/"/g, '')}"`, { timeout: 8000 });
    if (r.code === 0) return ok('Запускаю ' + name);
  } else {
    const bin = canon.replace(/[^a-z0-9._-]/gi, '');
    if (bin) {
      const r = await runCmd(`command -v ${bin}`);
      if (r.code === 0) { detached(bin); return ok('Запускаю ' + name); }
    }
  }
  return fail(`Не нашёл программу «${name}»`);
}

const PROTECTED = ['system', 'csrss', 'winlogon', 'wininit', 'lsass', 'services', 'smss', 'svchost', 'dwm',
  'explorer', 'init', 'systemd', 'kernel_task', 'launchd', 'windowserver', 'loginwindow', 'externalai', 'electron'];

async function listProcesses() {
  if (IS_WIN) {
    const r = await runCmd('tasklist /FO CSV /NH');
    return [...new Set(r.stdout.split(/\r?\n/).map((l) => (l.match(/^"([^"]+)"/) || [])[1]).filter(Boolean))];
  }
  const r = await runCmd('ps -A -o comm=');
  return [...new Set(r.stdout.split('\n').map((l) => path.basename(l.trim())).filter(Boolean))];
}

async function closeApp(name) {
  const raw = normalize(name);
  const canon = APP_ALIASES[raw] || raw;
  const procs = await listProcesses();
  let best = null;
  for (const p of procs) {
    const base = p.replace(/\.exe$/i, '');
    const s = Math.max(scoreName(canon, base), scoreName(raw, base));
    if (!best || s > best.score) best = { name: p, score: s };
  }
  if (!best || best.score < 0.72) return fail(`Не нашёл запущенную программу «${name}»`);
  const base = best.name.replace(/\.exe$/i, '').toLowerCase();
  if (PROTECTED.includes(base)) return fail('Этот процесс системный, закрывать его опасно');
  const r = IS_WIN ? await runCmd(`taskkill /IM "${best.name}" /F`) : await runCmd(`pkill -x "${best.name}"`);
  return r.code === 0 ? ok('Закрыл ' + best.name.replace(/\.exe$/i, '')) : fail('Не получилось закрыть ' + best.name);
}

// ───────────────────────── volume & media ─────────────────────────

async function winKeys(code, times = 1) {
  return ps(`$w=New-Object -ComObject WScript.Shell; for($i=0;$i -lt ${times};$i++){ $w.SendKeys([char]${code}); Start-Sleep -Milliseconds 15 }`);
}

async function volume(action, amount = 10) {
  const steps = Math.max(1, Math.round(amount / 2)); // одно нажатие клавиши громкости ≈ 2%
  if (IS_WIN) {
    if (action === 'up') await winKeys(175, steps);
    else if (action === 'down') await winKeys(174, steps);
    else if (action === 'mute' || action === 'unmute' || action === 'toggle') await winKeys(173);
    else if (action === 'set') { await winKeys(174, 50); await winKeys(175, Math.round(Math.min(100, Math.max(0, amount)) / 2)); }
  } else if (IS_MAC) {
    const scripts = {
      up: `set volume output volume ((output volume of (get volume settings)) + ${amount})`,
      down: `set volume output volume ((output volume of (get volume settings)) - ${amount})`,
      mute: 'set volume with output muted', unmute: 'set volume without output muted',
      toggle: 'set volume output muted (not (output muted of (get volume settings)))',
      set: `set volume output volume ${amount}`,
    };
    await runCmd(`osascript -e '${scripts[action]}'`);
  } else {
    const cmds = {
      up: `pactl set-sink-volume @DEFAULT_SINK@ +${amount}%`, down: `pactl set-sink-volume @DEFAULT_SINK@ -${amount}%`,
      mute: 'pactl set-sink-mute @DEFAULT_SINK@ 1', unmute: 'pactl set-sink-mute @DEFAULT_SINK@ 0',
      toggle: 'pactl set-sink-mute @DEFAULT_SINK@ toggle', set: `pactl set-sink-volume @DEFAULT_SINK@ ${amount}%`,
    };
    const r = await runCmd(cmds[action]);
    if (r.code !== 0) await runCmd(`amixer -D pulse sset Master ${action === 'up' ? amount + '%+' : action === 'down' ? amount + '%-' : action === 'set' ? amount + '%' : 'toggle'}`);
  }
  const text = { up: 'Делаю громче', down: 'Делаю тише', mute: 'Звук выключен', unmute: 'Звук включён', toggle: 'Переключаю звук', set: `Громкость ${amount} процентов` };
  return ok(text[action] || 'Готово');
}

async function media(action) {
  const winCodes = { playpause: 179, next: 176, prev: 177, stop: 178 };
  if (IS_WIN) await winKeys(winCodes[action] || 179);
  else if (IS_MAC) {
    const map = { playpause: 'playpause', next: 'next track', prev: 'previous track', stop: 'pause' };
    await runCmd(`osascript -e 'tell application "Music" to ${map[action]}'`);
  } else {
    const map = { playpause: 'play-pause', next: 'next', prev: 'previous', stop: 'stop' };
    await runCmd(`playerctl ${map[action]}`);
  }
  const text = { playpause: 'Пауза или воспроизведение', next: 'Следующий трек', prev: 'Предыдущий трек', stop: 'Остановил' };
  return ok(text[action] || 'Готово');
}

// ───────────────────────── power ─────────────────────────

async function power(action, delaySeconds = 0) {
  const d = Math.max(0, Math.round(delaySeconds));
  const cmds = IS_WIN ? {
    shutdown: `shutdown /s /t ${d}`, restart: `shutdown /r /t ${d}`, cancel: 'shutdown /a',
    sleep: 'rundll32.exe powrprof.dll,SetSuspendState 0,1,0', lock: 'rundll32.exe user32.dll,LockWorkStation',
    logoff: 'shutdown /l', hibernate: 'shutdown /h',
  } : IS_MAC ? {
    shutdown: `osascript -e 'tell app "System Events" to shut down'`, restart: `osascript -e 'tell app "System Events" to restart'`,
    sleep: 'pmset sleepnow', lock: 'pmset displaysleepnow', logoff: `osascript -e 'tell app "System Events" to log out'`, cancel: 'true', hibernate: 'pmset sleepnow',
  } : {
    shutdown: d ? `shutdown -h +${Math.ceil(d / 60)}` : 'systemctl poweroff', restart: d ? `shutdown -r +${Math.ceil(d / 60)}` : 'systemctl reboot',
    cancel: 'shutdown -c', sleep: 'systemctl suspend', hibernate: 'systemctl hibernate', lock: 'loginctl lock-session', logoff: 'loginctl terminate-user $USER',
  };
  if (!cmds[action]) return fail('Неизвестное действие питания');
  const r = await runCmd(cmds[action]);
  const text = { shutdown: d ? `Компьютер выключится через ${Math.round(d / 60)} мин.` : 'Выключаю компьютер', restart: 'Перезагружаю', cancel: 'Выключение отменено', sleep: 'Перевожу в спящий режим', hibernate: 'Гибернация', lock: 'Блокирую компьютер', logoff: 'Выхожу из системы' };
  return r.code === 0 ? ok(text[action]) : fail('Команда не выполнилась: ' + r.stderr.trim().slice(0, 200));
}

// ───────────────────────── screenshot ─────────────────────────

async function screenshot(win) {
  const display = screen.getPrimaryDisplay();
  const { width, height } = display.size;
  const sf = display.scaleFactor || 1;
  const wasVisible = win && win.isVisible() && !win.isMinimized();
  if (wasVisible) { win.hide(); await sleep(350); }
  try {
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: Math.round(width * sf), height: Math.round(height * sf) } });
    const src = sources.find((s) => String(s.display_id) === String(display.id)) || sources[0];
    if (!src) return fail('Не удалось получить изображение экрана');
    const dir = path.join(app.getPath('pictures'), 'ExternalAI');
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const file = path.join(dir, `Скриншот-${stamp}.png`);
    fs.writeFileSync(file, src.thumbnail.toPNG());
    clipboard.writeImage(src.thumbnail);
    return ok('Скриншот сохранён и скопирован в буфер', { path: file });
  } finally {
    if (wasVisible) win.show();
  }
}

// ───────────────────────── typing & clipboard ─────────────────────────

async function typeText(text, win) {
  const value = String(text || '');
  if (!value) return fail('Нечего печатать');
  const prev = clipboard.readText();
  clipboard.writeText(value);
  if (win && win.isFocused()) { win.minimize(); await sleep(450); }
  let r;
  if (IS_WIN) r = await ps('$w=New-Object -ComObject WScript.Shell; $w.SendKeys("^v")');
  else if (IS_MAC) r = await runCmd(`osascript -e 'tell application "System Events" to keystroke "v" using command down'`);
  else r = await runCmd('xdotool key --clearmodifiers ctrl+v');
  setTimeout(() => clipboard.writeText(prev), 1500);
  return r.code === 0 ? ok('Напечатал') : fail('Не удалось вставить текст, но он в буфере обмена');
}

function copyText(text) {
  clipboard.writeText(String(text || ''));
  return ok('Скопировал в буфер обмена');
}

function readClipboard() {
  return ok('Буфер обмена', { text: clipboard.readText().slice(0, 4000) });
}

async function minimizeAll() {
  if (IS_WIN) await ps('(New-Object -ComObject Shell.Application).MinimizeAll()');
  else if (IS_MAC) await runCmd(`osascript -e 'tell application "System Events" to key code 103'`);
  else await runCmd('xdotool key super+d');
  return ok('Сворачиваю все окна');
}

// ───────────────────────── shell ─────────────────────────

async function runShell(command, timeoutSec = 60) {
  const cmd = String(command || '').trim();
  if (!cmd) return fail('Пустая команда');
  const timeout = Math.min(300, Math.max(5, timeoutSec)) * 1000;
  const r = IS_WIN ? await ps(cmd, { timeout }) : await runCmd(cmd, { timeout, cwd: os.homedir() });
  const cut = (s) => (s.length > 6000 ? s.slice(0, 6000) + '\n…(обрезано)' : s);
  return { ok: r.code === 0, message: r.code === 0 ? 'Команда выполнена' : 'Команда завершилась с ошибкой', exitCode: r.code, stdout: cut(r.stdout), stderr: cut(r.stderr) };
}

// ───────────────────────── system info ─────────────────────────

let lastCpu = null;
function cpuUsage() {
  const cpus = os.cpus();
  const total = cpus.reduce((acc, c) => {
    const t = Object.values(c.times).reduce((a, b) => a + b, 0);
    return { idle: acc.idle + c.times.idle, total: acc.total + t };
  }, { idle: 0, total: 0 });
  let usage = 0;
  if (lastCpu) {
    const dt = total.total - lastCpu.total;
    usage = dt > 0 ? Math.round(100 * (1 - (total.idle - lastCpu.idle) / dt)) : 0;
  }
  lastCpu = total;
  return Math.max(0, Math.min(100, usage));
}

function systemInfo() {
  const total = os.totalmem();
  const free = os.freemem();
  return {
    ok: true,
    platform: process.platform,
    os: `${os.type()} ${os.release()}`,
    host: os.hostname(),
    cpuModel: os.cpus()[0]?.model || 'CPU',
    cores: os.cpus().length,
    cpu: cpuUsage(),
    memTotalGB: +(total / 1024 ** 3).toFixed(1),
    memUsedGB: +((total - free) / 1024 ** 3).toFixed(1),
    memPercent: Math.round(100 * (1 - free / total)),
    uptimeMin: Math.round(os.uptime() / 60),
    user: os.userInfo().username,
  };
}

function notify(title, body) {
  if (Notification.isSupported()) new Notification({ title, body, silent: false }).show();
  return ok('Уведомление показано');
}

module.exports = {
  openUrl, openPath, openApp, closeApp, volume, media, power, screenshot, typeText, copyText, readClipboard,
  minimizeAll, runShell, systemInfo, notify, buildAppIndex, IS_WIN, IS_MAC,
};
