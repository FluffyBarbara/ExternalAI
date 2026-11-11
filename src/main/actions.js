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
  const allowed = ['http', 'https', 'mailto', 'tg', 'steam', 'discord', 'spotify', 'ms-settings', 'zoommtg', 'vk', 'search-ms', 'ms-windows-store', 'yandexmusic'];
  if (!allowed.includes(scheme)) return fail('Этот тип ссылок запрещён: ' + scheme);
  await shell.openExternal(target);
  return ok('Открываю ' + target.replace(/^https?:\/\//, '').replace(/\/$/, ''));
}

const FOLDERS = {
  downloads: 'downloads', загрузки: 'downloads', документы: 'documents', documents: 'documents',
  desktop: 'desktop', 'рабочий стол': 'desktop', изображения: 'pictures', картинки: 'pictures',
  фото: 'pictures', pictures: 'pictures', музыка: 'music', music: 'music', видео: 'videos',
  videos: 'videos', home: 'home', 'домашняя папка': 'home', screenshots: 'screenshots', скриншоты: 'screenshots',
};

async function openPath(target) {
  let p = String(target || '').trim();
  const key = FOLDERS[p.toLowerCase()];
  if (key === 'screenshots') {
    p = path.join(app.getPath('pictures'), 'ExternalAI');
    fs.mkdirSync(p, { recursive: true });
  } else if (key) p = app.getPath(key);
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
  'диспетчер устройств': 'device manager', 'управление дисками': 'disk management', 'службы': 'services',
  'редактор реестра': 'regedit', 'реестр': 'regedit', 'корзину': 'recycle bin', 'корзина': 'recycle bin',
  'мой компьютер': 'this pc', 'этот компьютер': 'this pc', 'компьютер': 'this pc', 'сведения о системе': 'system info',
  'монитор ресурсов': 'resource monitor', 'экранную клавиатуру': 'on-screen keyboard', 'экранная клавиатура': 'on-screen keyboard',
  'лупу': 'magnifier', 'лупа': 'magnifier', 'микшер': 'sound control', 'сетевые подключения': 'network connections',
  'программы и компоненты': 'programs and features', 'удаление программ': 'programs and features', 'вордпад': 'wordpad',
  'таблицу символов': 'character map', 'удаленный рабочий стол': 'remote desktop', 'диспетчер': 'task manager',
  'гугл диск': 'google drive', 'ван драйв': 'onedrive', 'нотепад': 'notepad++', 'нотпад': 'notepad++',
  'идея': 'intellij idea', 'пайчарм': 'pycharm', 'андроид студио': 'android studio', 'постман': 'postman',
  'ватсапп': 'whatsapp', 'вк мессенджер': 'vk messenger', 'макс': 'max', 'батл нет': 'battle.net', 'юбисофт': 'ubisoft connect',
  'кс': 'counter-strike', 'контра': 'counter-strike', 'дота': 'dota 2', 'гта': 'grand theft auto', 'роблокс': 'roblox',
  'эпик': 'epic games launcher', 'фортнайт': 'fortnite', 'валорант': 'valorant', 'лига легенд': 'league of legends',
  'ворд пад': 'wordpad', 'аудасити': 'audacity', 'гимп': 'gimp', 'кейпкат': 'capcut', 'премьер': 'premiere pro',
  'афтер эффектс': 'after effects', 'иллюстратор': 'illustrator', 'фигма': 'figma', 'ноушн': 'notion', 'обсидиан': 'obsidian',
};

// Встроенные программы Windows: короткий путь без поиска.
const WIN_BUILTIN = {
  notepad: ['notepad.exe'], calculator: ['calc.exe'], explorer: ['explorer.exe'], 'task manager': ['taskmgr.exe'],
  'control panel': ['control.exe'], settings: ['explorer.exe', 'ms-settings:'], cmd: ['cmd.exe', '/k'],
  powershell: ['powershell.exe'], terminal: ['wt.exe'], paint: ['mspaint.exe'], 'snipping tool': ['snippingtool.exe'],
  'device manager': ['mmc.exe', 'devmgmt.msc'], 'disk management': ['mmc.exe', 'diskmgmt.msc'], services: ['mmc.exe', 'services.msc'],
  regedit: ['regedit.exe'], 'recycle bin': ['explorer.exe', 'shell:RecycleBinFolder'], 'this pc': ['explorer.exe', 'shell:MyComputerFolder'],
  'system info': ['msinfo32.exe'], 'resource monitor': ['resmon.exe'], 'on-screen keyboard': ['osk.exe'], magnifier: ['magnify.exe'],
  'sound control': ['control.exe', 'mmsys.cpl'], 'network connections': ['control.exe', 'ncpa.cpl'], 'programs and features': ['control.exe', 'appwiz.cpl'],
  wordpad: ['write.exe'], 'character map': ['charmap.exe'], 'remote desktop': ['mstsc.exe'],
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

// Часто запускаемые программы слегка поднимаются в поиске — ассистент «привыкает».
const usage = new Map();

async function findApp(query, minScore = 0.72) {
  const index = await buildAppIndex();
  let best = null;
  for (const item of index) {
    const s = scoreName(query, item.name) + Math.min(0.06, (usage.get(item.name) || 0) * 0.01);
    if (!best || s > best.score) best = { ...item, score: s };
  }
  return best && best.score >= minScore ? best : null;
}

async function openApp(name, { strict = false } = {}) {
  const raw = normalize(name);
  if (!raw) return fail('Не понял, что открыть');
  const canon = APP_ALIASES[raw] || raw;

  if (canon === 'browser') return openUrl('https://www.google.com');

  if (IS_WIN && WIN_BUILTIN[canon]) {
    const [cmd, ...args] = WIN_BUILTIN[canon];
    detached(cmd, args);
    return ok('Открываю ' + name);
  }

  const min = strict ? 0.86 : 0.72;
  const found = (await findApp(canon, min)) || (canon !== raw ? await findApp(raw, min) : null);
  if (found) {
    usage.set(found.name, (usage.get(found.name) || 0) + 1);
    if (found.kind === 'win') detached('explorer.exe', ['shell:AppsFolder\\' + found.id]);
    else if (found.kind === 'mac') detached('open', [found.id]);
    else detached('gtk-launch', [found.id]);
    return ok('Запускаю ' + found.name, { app: found.name });
  }

  // Последняя попытка — системный запуск по имени (App Paths, PATH).
  if (strict) return fail(`Не нашёл программу «${name}»`);
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

// ───────────────────────── клавиши ─────────────────────────

// Если окно ассистента активно — убираем его, чтобы клавиши ушли в нужную программу.
async function releaseFocus(win) {
  if (win && !win.isDestroyed() && win.isFocused()) {
    win.minimize();
    await sleep(450);
  }
}

const SENDKEYS_SPECIAL = {
  enter: '{ENTER}', tab: '{TAB}', esc: '{ESC}', escape: '{ESC}', space: ' ', backspace: '{BACKSPACE}', delete: '{DELETE}',
  up: '{UP}', down: '{DOWN}', left: '{LEFT}', right: '{RIGHT}', home: '{HOME}', end: '{END}', pageup: '{PGUP}', pagedown: '{PGDN}',
  plus: '{ADD}', minus: '{SUBTRACT}', insert: '{INSERT}', printscreen: '{PRTSC}',
};
for (let i = 1; i <= 12; i++) SENDKEYS_SPECIAL['f' + i] = `{F${i}}`;
const XDO_SPECIAL = {
  enter: 'Return', tab: 'Tab', esc: 'Escape', escape: 'Escape', space: 'space', backspace: 'BackSpace', delete: 'Delete',
  up: 'Up', down: 'Down', left: 'Left', right: 'Right', home: 'Home', end: 'End', pageup: 'Prior', pagedown: 'Next',
  plus: 'plus', minus: 'minus', insert: 'Insert', printscreen: 'Print',
};
const MAC_CODES = { enter: 36, tab: 48, esc: 53, escape: 53, space: 49, backspace: 51, delete: 117, up: 126, down: 125, left: 123, right: 124, home: 115, end: 119, pageup: 116, pagedown: 121 };

/** Нажать сочетание клавиш, например «ctrl+shift+t», «alt+f4», «enter». */
async function pressKeys(combo, win, times = 1) {
  const parts = String(combo || '').toLowerCase().replace(/\s+/g, '').split('+').filter(Boolean);
  if (!parts.length) return fail('Не указаны клавиши');
  const key = parts.pop();
  const mods = parts;
  const n = Math.max(1, Math.min(50, times | 0));
  await releaseFocus(win);
  let r;
  if (IS_WIN) {
    if (mods.includes('win')) {
      // SendKeys не умеет клавишу Win — нажимаем её через keybd_event.
      const vk = { d: 0x44, e: 0x45, r: 0x52, l: 0x4c, up: 0x26, down: 0x28, left: 0x25, right: 0x27, tab: 0x09, a: 0x41, i: 0x49, s: 0x53, v: 0x56, p: 0x50, m: 0x4d }[key];
      if (!vk) return fail('Такое сочетание с Win не поддерживается');
      const shift = mods.includes('shift');
      const down = (k) => `[W.K]::keybd_event(${k},0,0,[UIntPtr]::Zero);`;
      const up = (k) => `[W.K]::keybd_event(${k},0,2,[UIntPtr]::Zero);`;
      r = await ps(`Add-Type -Name K -Namespace W -MemberDefinition '[DllImport("user32.dll")] public static extern void keybd_event(byte b,byte s,uint f,System.UIntPtr e);'; ` +
        down(0x5b) + (shift ? down(0x10) : '') + down(vk) + up(vk) + (shift ? up(0x10) : '') + up(0x5b));
    } else {
      const modStr = mods.map((m) => ({ ctrl: '^', control: '^', alt: '%', shift: '+' }[m] || '')).join('');
      const k = SENDKEYS_SPECIAL[key] || (key.length === 1 ? key.replace(/[+^%~(){}[\]]/g, '{$&}') : null);
      if (!k) return fail('Неизвестная клавиша: ' + key);
      const seq = (modStr + k).replace(/"/g, '`"');
      r = await ps(`$w=New-Object -ComObject WScript.Shell; for($i=0;$i -lt ${n};$i++){ $w.SendKeys("${seq}"); Start-Sleep -Milliseconds 40 }`);
    }
  } else if (IS_MAC) {
    const using = mods.map((m) => ({ ctrl: 'command down', control: 'control down', cmd: 'command down', alt: 'option down', shift: 'shift down' }[m])).filter(Boolean);
    const u = using.length ? ` using {${using.join(', ')}}` : '';
    const action = MAC_CODES[key] !== undefined ? `key code ${MAC_CODES[key]}${u}` : `keystroke "${key.replace(/"/g, '')}"${u}`;
    r = await runCmd(`osascript -e 'tell application "System Events" to repeat ${n} times' -e '${action}' -e 'end repeat'`);
  } else {
    const xmods = mods.map((m) => ({ ctrl: 'ctrl', control: 'ctrl', alt: 'alt', shift: 'shift', win: 'super' }[m])).filter(Boolean);
    const k = XDO_SPECIAL[key] || key;
    r = await runCmd(`xdotool key --repeat ${n} --clearmodifiers ${[...xmods, k].join('+')}`);
  }
  return r.code === 0 ? ok('Нажал ' + combo) : fail('Не удалось нажать клавиши' + (IS_WIN || IS_MAC ? '' : ' (нужен xdotool)'));
}

// Свернуть / развернуть / закрыть активное окно другой программы.
async function activeWindow(action, win) {
  if (win && !win.isDestroyed() && win.isFocused()) {
    // Активно окно ассистента — действуем с ним, а не с окном позади.
    if (action === 'minimize') { win.minimize(); return ok('Сворачиваю'); }
    if (action === 'maximize') { win.maximize(); return ok('Разворачиваю'); }
    win.hide();
    return ok('Убрал окно ассистента в трей');
  }
  if (action === 'close') return pressKeys(IS_MAC ? 'ctrl+w' : 'alt+f4', null);
  if (IS_WIN) {
    const cmd = action === 'minimize' ? 6 : 3;
    const r = await ps(`Add-Type -Name U -Namespace W -MemberDefinition '[DllImport("user32.dll")] public static extern System.IntPtr GetForegroundWindow(); [DllImport("user32.dll")] public static extern bool ShowWindow(System.IntPtr h,int c);'; [W.U]::ShowWindow([W.U]::GetForegroundWindow(), ${cmd}) | Out-Null`);
    return r.code === 0 ? ok(action === 'minimize' ? 'Свернул окно' : 'Развернул окно') : fail('Не получилось');
  }
  if (IS_MAC) return pressKeys(action === 'minimize' ? 'ctrl+m' : 'ctrl+control+f', null);
  const r = await runCmd(action === 'minimize' ? 'xdotool getactivewindow windowminimize' : 'wmctrl -r :ACTIVE: -b add,maximized_vert,maximized_horz');
  return r.code === 0 ? ok('Готово') : fail('Не получилось (нужен xdotool/wmctrl)');
}

// Выделенный текст в активной программе: Ctrl+C и чтение буфера.
async function selectedText(win) {
  const prev = clipboard.readText();
  clipboard.writeText('');
  await pressKeys(IS_MAC ? 'ctrl+c' : 'ctrl+c', win);
  await sleep(350);
  const text = clipboard.readText();
  setTimeout(() => clipboard.writeText(prev), 300);
  return text ? ok('Выделенный текст', { text: text.slice(0, 8000) }) : fail('Ничего не выделено');
}

// ───────────────────────── яркость ─────────────────────────

async function brightness(action, amount = 10) {
  if (IS_WIN) {
    const cur = await ps('(Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness -ErrorAction Stop | Select-Object -First 1).CurrentBrightness');
    const now = parseInt(cur.stdout, 10);
    if (cur.code !== 0 || Number.isNaN(now)) return fail('Яркость этого монитора нельзя изменить программно — так бывает на внешних мониторах');
    let next = action === 'up' ? now + amount : action === 'down' ? now - amount : amount;
    next = Math.max(0, Math.min(100, Math.round(next)));
    const r = await ps(`$m=Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods | Select-Object -First 1; Invoke-CimMethod -InputObject $m -MethodName WmiSetBrightness -Arguments @{Timeout=1;Brightness=[byte]${next}} | Out-Null`);
    return r.code === 0 ? ok(`Яркость ${next} процентов`) : fail('Не удалось изменить яркость');
  }
  if (IS_MAC) return fail('На macOS яркость меняется клавишами F1 и F2');
  const arg = action === 'up' ? `+${amount}%` : action === 'down' ? `${amount}%-` : `${amount}%`;
  const r = await runCmd(`brightnessctl set ${arg}`);
  return r.code === 0 ? ok('Яркость изменена') : fail('Не удалось изменить яркость (нужен brightnessctl)');
}

// ───────────────────────── диски и файлы ─────────────────────────

async function diskInfo() {
  const disks = [];
  if (IS_WIN) {
    const r = await ps('Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | Select-Object DeviceID,Size,FreeSpace | ConvertTo-Json -Compress');
    try {
      for (const d of [].concat(JSON.parse(r.stdout || '[]'))) {
        if (d?.Size) disks.push({ name: d.DeviceID, totalGB: +(d.Size / 1024 ** 3).toFixed(0), freeGB: +(d.FreeSpace / 1024 ** 3).toFixed(1) });
      }
    } catch { /* нет данных */ }
  } else {
    try {
      const st = fs.statfsSync('/');
      disks.push({ name: '/', totalGB: +((st.blocks * st.bsize) / 1024 ** 3).toFixed(0), freeGB: +((st.bavail * st.bsize) / 1024 ** 3).toFixed(1) });
    } catch { /* нет данных */ }
  }
  return disks.length ? ok('Диски', { disks }) : fail('Не удалось получить сведения о дисках');
}

function searchRoots() {
  const home = os.homedir();
  const roots = ['desktop', 'documents', 'downloads', 'pictures', 'music', 'videos'].map((k) => {
    try { return app.getPath(k); } catch { return null; }
  });
  roots.push(path.join(home, 'OneDrive'), path.join(home, 'OneDrive', 'Desktop'), path.join(home, 'OneDrive', 'Documents'), path.join(home, 'Yandex.Disk'));
  return [...new Set(roots.filter((r) => r && fs.existsSync(r)))];
}

/** Поиск файлов и папок по названию в папках пользователя. */
async function findFiles(query, { limit = 8, dirsOnly = false } = {}) {
  const q = normalize(query);
  if (!q) return fail('Что искать?');
  const started = Date.now();
  const results = [];
  let seen = 0;
  const skip = new Set(['node_modules', '.git', 'appdata', '$recycle.bin', 'library', '.cache', 'cache']);
  async function walk(dir, depth) {
    if (depth > 6 || seen > 60000 || Date.now() - started > 4000) return;
    let entries;
    try { entries = await fs.promises.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      seen++;
      if (e.name.startsWith('.') || skip.has(e.name.toLowerCase())) continue;
      const full = path.join(dir, e.name);
      const isDir = e.isDirectory();
      if (!dirsOnly || isDir) {
        const base = e.name.replace(/\.[^.]+$/, '');
        const score = Math.max(scoreName(q, base), scoreName(q, e.name));
        if (score >= 0.7) results.push({ path: full, name: e.name, isDir, score });
      }
      if (isDir) await walk(full, depth + 1);
    }
  }
  for (const root of searchRoots()) await walk(root, 0);
  results.sort((a, b) => b.score - a.score || a.path.length - b.path.length);
  const top = results.slice(0, limit);
  return top.length ? ok(`Нашёл: ${top[0].name}`, { files: top }) : fail(`Не нашёл «${query}» в ваших папках`);
}

async function openFile(query, { reveal = false } = {}) {
  const r = await findFiles(query, { limit: 5 });
  if (!r.ok) {
    if (IS_WIN) {
      await shell.openExternal(`search-ms:query=${encodeURIComponent(query)}&crumb=location:${encodeURIComponent(os.homedir())}`);
      return ok(`Точного совпадения нет, открыл поиск Windows по «${query}»`);
    }
    return r;
  }
  const best = r.files[0];
  if (reveal) shell.showItemInFolder(best.path);
  else {
    const err = await shell.openPath(best.path);
    if (err) return fail(err);
  }
  return ok(`${reveal ? 'Показываю' : 'Открываю'} ${best.name}`, { files: r.files });
}

function resolvePlace(where) {
  const w = normalize(where || '');
  if (/документ/.test(w)) return app.getPath('documents');
  if (/загрузк|закачк/.test(w)) return app.getPath('downloads');
  if (/изображ|картин|фото/.test(w)) return app.getPath('pictures');
  if (/музык/.test(w)) return app.getPath('music');
  if (/видео/.test(w)) return app.getPath('videos');
  return app.getPath('desktop');
}

async function createItem(kind, name, where) {
  const clean = String(name || '').replace(/[<>:"/\\|?*]/g, '').trim() || (kind === 'folder' ? 'Новая папка' : 'Новый документ');
  const dir = resolvePlace(where);
  let target = path.join(dir, kind === 'folder' ? clean : (/\.[a-z0-9]{1,5}$/i.test(clean) ? clean : clean + '.txt'));
  let i = 2;
  while (fs.existsSync(target)) {
    const ext = path.extname(target);
    target = path.join(dir, `${clean.replace(/\.[^.]+$/, '')} (${i++})${kind === 'folder' ? '' : ext}`);
  }
  if (kind === 'folder') fs.mkdirSync(target, { recursive: true });
  else fs.writeFileSync(target, '', 'utf8');
  shell.showItemInFolder(target);
  return ok(`${kind === 'folder' ? 'Папка' : 'Файл'} «${path.basename(target)}» создан${kind === 'folder' ? 'а' : ''}`, { path: target });
}

async function lastScreenshot() {
  const dir = path.join(app.getPath('pictures'), 'ExternalAI');
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.png')).map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs })); } catch { /* нет папки */ }
  if (!files.length) return fail('Скриншотов пока нет');
  files.sort((a, b) => b.t - a.t);
  await shell.openPath(path.join(dir, files[0].f));
  return ok('Открываю последний скриншот');
}

async function emptyTrash() {
  const r = IS_WIN ? await ps('Clear-RecycleBin -Force -ErrorAction SilentlyContinue')
    : IS_MAC ? await runCmd(`osascript -e 'tell application "Finder" to empty trash'`)
      : await runCmd('gio trash --empty');
  return r.code === 0 ? ok('Корзина очищена') : fail('Не удалось очистить корзину');
}

// Разделы настроек Windows.
const SETTINGS_PAGES = [
  [/звук|аудио|динамик/, 'sound'], [/микрофон/, 'privacy-microphone'], [/экран|дисплей|монитор|разрешени/, 'display'],
  [/вай ?фай|wi ?fi|wifi|беспроводн/, 'network-wifi'], [/сет|интернет/, 'network-status'], [/блютуз|bluetooth|устройств/, 'bluetooth'],
  [/обновлени/, 'windowsupdate'], [/приложени|программ/, 'appsfeatures'], [/автозагруз|автозапуск/, 'startupapps'],
  [/батаре|питани|энерги/, 'powersleep'], [/фон|обои|персонализ/, 'personalization-background'], [/цвет|тем/, 'personalization-colors'],
  [/мыш|тачпад/, 'mousetouchpad'], [/клавиатур|язык|раскладк/, 'regionlanguage'], [/дат|врем/, 'dateandtime'],
  [/принтер|печат/, 'printers'], [/уведомлени/, 'notifications'], [/хранилищ|памят|диск/, 'storagesense'],
  [/конфиденциальн|приватн/, 'privacy'], [/учетн|аккаунт/, 'yourinfo'], [/ночн/, 'nightlight'], [/игр/, 'gaming-gamemode'],
  [/по умолчанию/, 'defaultapps'], [/камер/, 'privacy-webcam'], [/безопасн|защитник|антивирус/, 'windowsdefender'],
];

async function openSettingsPage(what) {
  const w = normalize(what);
  const hit = SETTINGS_PAGES.find(([re]) => re.test(w));
  if (!hit) return fail('Не знаю такого раздела настроек');
  if (!IS_WIN) return fail('Разделы настроек открываю только в Windows');
  await shell.openExternal('ms-settings:' + hit[1]);
  return ok('Открываю настройки');
}

module.exports = {
  openUrl, openPath, openApp, closeApp, volume, media, power, screenshot, typeText, copyText, readClipboard,
  minimizeAll, runShell, systemInfo, notify, buildAppIndex, pressKeys, activeWindow, selectedText, brightness,
  diskInfo, findFiles, openFile, createItem, lastScreenshot, emptyTrash, openSettingsPage, IS_WIN, IS_MAC,
};
