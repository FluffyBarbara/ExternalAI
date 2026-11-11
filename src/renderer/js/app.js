import { Reactor, startParticles } from './reactor.js';
import { Recognizer, Speaker, Sounds } from './speech.js';
import { createCommands, formatDuration, getWeather, describeWeather } from './commands.js';

const { normalize, similarity, translit } = window.TextUtils;
const ext = window.ext;
const $ = (id) => document.getElementById(id);

// ───────────────────────── состояние ─────────────────────────
let settings = await ext.settings.get();
const info = await ext.app.info();

const reactor = new Reactor($('reactor'));
const particles = startParticles($('particles'));
const recognizer = new Recognizer();
const speaker = new Speaker();

const state = {
  mode: 'boot',          // boot | idle | awake | busy | speaking | muted | nomodel
  ears: true,            // слушать микрофон
  awakeUntil: 0,         // до какого времени ждём команду без ключевого слова
  lastAnswer: '',
  confirm: null,         // ожидающее подтверждение { resolve }
  voiceReady: false,
};

// ───────────────────────── интерфейс: базовое ─────────────────────────
function setCore(label, sub, reactorState) {
  $('coreLabel').textContent = label;
  $('coreSub').textContent = sub || '';
  if (reactorState) reactor.setState(reactorState);
}

function setPill(id, cls, title) {
  const el = $(id);
  el.classList.remove('ok', 'warn', 'err', 'busy');
  if (cls) el.classList.add(cls);
  if (title) el.title = title;
}

function toast(title, text = '', kind = '') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.innerHTML = `<b></b><span></span>`;
  el.querySelector('b').textContent = title;
  el.querySelector('span').textContent = text;
  $('toasts').appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .4s'; }, 4200);
  setTimeout(() => el.remove(), 4700);
}

function timeStr() {
  const d = new Date();
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function logMsg(kind, text, extra = '') {
  const log = $('log');
  const el = document.createElement('div');
  if (kind === 'sys') {
    el.className = `msg msg-sys ${extra}`;
    el.textContent = text;
    el.title = text;
  } else {
    el.className = `msg ${kind === 'user' ? 'msg-user' : 'msg-bot'} ${extra}`;
    if (kind === 'bot') {
      const who = document.createElement('span');
      who.className = 'who';
      who.textContent = 'EXTERNALAI';
      el.appendChild(who);
    }
    el.appendChild(document.createTextNode(text));
    const t = document.createElement('span');
    t.className = 'msg-time';
    t.textContent = timeStr();
    el.appendChild(t);
  }
  log.appendChild(el);
  log.scrollTop = log.scrollHeight;
  while (log.children.length > 200) log.firstChild.remove();
  return el;
}

function typingIndicator() {
  const el = document.createElement('div');
  el.className = 'msg msg-bot';
  el.innerHTML = '<span class="who">EXTERNALAI</span><span class="typing"><i></i><i></i><i></i></span>';
  $('log').appendChild(el);
  $('log').scrollTop = $('log').scrollHeight;
  return () => el.remove();
}

function setTranscript(text, kind = 'final') {
  const el = $('transcript');
  el.innerHTML = '';
  if (!text) {
    const p = document.createElement('span');
    p.className = 'placeholder';
    p.textContent = wakeHint();
    el.appendChild(p);
    return;
  }
  const s = document.createElement('span');
  s.className = kind;
  s.textContent = text;
  el.appendChild(s);
}

function wakeHint() {
  if (!state.voiceReady) return 'Напишите команду в поле справа';
  const w = settings.voice.wakeWords[0] || 'Джарвис';
  return settings.voice.wakeWordEnabled ? `Скажите «${cap(w)}» и команду` : 'Говорите команду';
}
const cap = (s) => String(s).replace(/^./, (c) => c.toUpperCase());

function idleCore() {
  if (!state.ears) return setCore('ТИШИНА', 'микрофон выключен', 'muted');
  if (!state.voiceReady) return setCore('ГОТОВ', 'текстовый режим', 'idle');
  if (Date.now() < state.awakeUntil || !settings.voice.wakeWordEnabled) return setCore('СЛУШАЮ', 'говорите команду', 'listening');
  return setCore('ОЖИДАНИЕ', `скажите «${cap(settings.voice.wakeWords[0] || 'джарвис')}»`, 'idle');
}

// ───────────────────────── настройки ─────────────────────────
function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
}
function buildPatch(path, value) {
  const keys = path.split('.');
  const out = {};
  let cur = out;
  keys.forEach((k, i) => { cur[k] = i === keys.length - 1 ? value : {}; cur = cur[k]; });
  return out;
}

async function saveSettings(partial) {
  settings = await ext.settings.patch(partial);
  applySettings();
  return settings;
}

function applySettings() {
  speaker.configure(settings.voice);
  Sounds.enabled = settings.voice.sounds;
  const accent = settings.ui.accent || '#22d3ee';
  const n = parseInt(accent.slice(1), 16);
  document.documentElement.style.setProperty('--accent', accent);
  document.documentElement.style.setProperty('--accent-rgb', `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`);
  reactor.setAccent(accent);
  reactor.reduceMotion = settings.ui.reduceMotion;
  particles.setReduce(settings.ui.reduceMotion);
  document.body.classList.toggle('reduce-motion', settings.ui.reduceMotion);
  const hasKey = !!settings.ai.apiKey;
  setPill('pillAi', hasKey ? 'ok' : 'warn', hasKey ? `ИИ подключён: ${settings.ai.model}` : 'ИИ не подключён — добавьте ключ в настройках');
  const hk = (settings.system.hotkey || '').replace('CommandOrControl', 'Ctrl').split('+').map((k) => `<kbd>${k}</kbd>`).join('+');
  const w = cap(settings.voice.wakeWords[0] || 'джарвис');
  $('hint').innerHTML = settings.voice.wakeWordEnabled
    ? `Ключевое слово — <b>«${w}»</b> · кнопка — ${hk}`
    : `Режим без ключевого слова · кнопка — ${hk}`;
  if (state.mode === 'idle') idleCore();
}

function bindSettingsForm() {
  document.querySelectorAll('[data-key]').forEach((el) => {
    const key = el.dataset.key;
    const type = el.dataset.type;
    const v = getPath(settings, key);
    if (el.type === 'checkbox') el.checked = !!v;
    else if (type === 'list') el.value = (v || []).join(', ');
    else el.value = v ?? '';
    if (el.dataset.bound) return;
    el.dataset.bound = '1';
    const handler = async () => {
      let value;
      if (el.type === 'checkbox') value = el.checked;
      else if (type === 'number') value = parseFloat(el.value) || 0;
      else if (type === 'list') value = el.value.split(',').map((s) => normalize(s)).filter(Boolean);
      else value = el.value;
      await saveSettings(buildPatch(key, value));
      if (key === 'system.city') loadWeather();
    };
    el.addEventListener('change', handler);
    if (el.type === 'range') el.addEventListener('input', handler);
  });
}

function fillVoices() {
  const sel = $('voiceSelect');
  const voices = speaker.voices.slice().sort((a, b) => (/^ru/i.test(b.lang) - /^ru/i.test(a.lang)) || a.name.localeCompare(b.name));
  sel.innerHTML = '';
  const auto = document.createElement('option');
  auto.value = '';
  auto.textContent = speaker.ruVoices().length ? 'Автоматически (русский)' : 'Автоматически — русский голос не найден';
  sel.appendChild(auto);
  for (const v of voices) {
    const o = document.createElement('option');
    o.value = v.voiceURI;
    o.textContent = `${v.name} (${v.lang})`;
    sel.appendChild(o);
  }
  sel.value = settings.voice.ttsVoice || '';
}
speaker.addEventListener('voices', fillVoices);

function openModal(id) {
  $(id).classList.remove('hidden');
}
function closeModal(id) {
  $(id).classList.add('hidden');
}

function openSettings(tab) {
  bindSettingsForm();
  renderLearning();
  fillVoices();
  refreshModelState();
  if (tab) selectTab(tab);
  openModal('settings');
}

function selectTab(name) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('active', p.dataset.panel === name));
}

// ───────────────────────── команды ─────────────────────────
const commands = createCommands({
  ext,
  settings: () => settings,
  saveSettings,
  hasAI: () => !!settings.ai.apiKey,
  ui: {
    openHelp: () => openHelp(),
    openSettings: (tab) => openSettings(tab),
    clearLog: () => clearDialog(),
    voice: (action) => voiceControl(action),
    stopSpeaking: () => speaker.stop(),
    lastAnswer: () => state.lastAnswer,
    hideWindow: () => ext.win.hide(),
    maximize: () => { ext.win.show(); ext.win.toggleMaximize(); },
    setEars: (v) => setEars(v),
    confirm: (opts) => askConfirm(opts),
  },
  timers: {
    add: (sec, label, alarm) => addTimer(sec, label, alarm),
    clear: () => clearTimers(),
    list: () => timers.map((t) => ({ label: t.label, left: Math.max(0, (t.end - Date.now()) / 1000) })),
  },
  notes: {
    add: async (text) => { await saveSettings({ notes: [...(settings.notes || []), { text: cap(text), at: Date.now() }] }); renderNotes(); },
    list: () => settings.notes || [],
    clear: async () => { await saveSettings({ notes: [] }); renderNotes(); },
  },
  learning: {
    list: () => settings.learned || [],
    save: async (list) => { await saveSettings({ learned: list }); renderLearning(); },
  },
  facts: {
    list: () => settings.facts || [],
    add: async (text) => { await saveSettings({ facts: [...(settings.facts || []), { text, at: Date.now() }].slice(-200) }); renderLearning(); },
    clear: async () => { await saveSettings({ facts: [] }); renderLearning(); },
  },
  // Для своих команд, которые встроенные правила не понимают.
  ai: async (text) => {
    if (!settings.ai.apiKey) return null;
    const res = await ext.ai.ask(text);
    const note = await commands.afterAI(text, res);
    if (note) logMsg('sys', '⚡ ' + note, 'ok');
    return res;
  },
});

// Управление голосом ассистента командами.
async function voiceControl(action) {
  const v = settings.voice;
  if (action === 'быстрее') { await saveSettings({ voice: { ttsRate: Math.min(1.6, +(v.ttsRate + 0.15).toFixed(2)) } }); return 'Говорю быстрее.'; }
  if (action === 'медленнее') { await saveSettings({ voice: { ttsRate: Math.max(0.6, +(v.ttsRate - 0.15).toFixed(2)) } }); return 'Говорю медленнее.'; }
  if (action === 'громче') { await saveSettings({ voice: { ttsVolume: Math.min(1, +(v.ttsVolume + 0.2).toFixed(2)) } }); return 'Говорю громче.'; }
  if (action === 'тише') { await saveSettings({ voice: { ttsVolume: Math.max(0.2, +(v.ttsVolume - 0.2).toFixed(2)) } }); return 'Говорю тише.'; }
  if (action === 'off') { await saveSettings({ voice: { ttsEnabled: false } }); return 'Хорошо, буду отвечать только текстом.'; }
  if (action === 'on') { await saveSettings({ voice: { ttsEnabled: true } }); return 'Голос включён.'; }
  const list = speaker.ruVoices().length ? speaker.ruVoices() : speaker.voices;
  if (list.length < 2) return 'Другого голоса в системе нет. Русские голоса добавляются в настройках Windows: Время и язык, Речь.';
  const current = speaker.pickVoice();
  const next = list[(list.indexOf(current) + 1) % list.length];
  await saveSettings({ voice: { ttsVoice: next.voiceURI } });
  return `Теперь я говорю голосом ${next.name.replace(/Microsoft |Google /, '').split(' - ')[0]}.`;
}

async function clearDialog() {
  $('log').innerHTML = '';
  await ext.ai.reset();
  logMsg('sys', 'Новый диалог');
}

// Главная точка: обработать фразу пользователя.
async function processCommand(text, { voice = false } = {}) {
  text = String(text || '').trim();
  if (!text) return;
  speaker.stop();
  state.mode = 'busy';
  state.awakeUntil = 0;
  logMsg('user', text);
  setTranscript(text, 'final');
  setCore('ОБРАБОТКА', 'анализ команды', 'thinking');

  let answer = '';
  let isError = false;
  try {
    const r = await commands.handle(text);
    if (r.handled) {
      if (r.silent) { state.mode = 'idle'; idleCore(); return; }
      if (r.learned) logMsg('sys', '⚡ выученная команда', 'ok');
      answer = r.say;
      Sounds.done();
    } else if (settings.ai.apiKey) {
      setCore('ДУМАЮ', settings.ai.model.replace('claude-', '').replace(/-/g, ' '), 'thinking');
      const stopTyping = typingIndicator();
      const res = await ext.ai.ask(text);
      stopTyping();
      answer = res.text;
      isError = !res.ok;
      if (isError) Sounds.error(); else Sounds.done();
      const note = await commands.afterAI(text, res);
      if (note) logMsg('sys', '⚡ ' + note, 'ok');
    } else {
      const q = r.text || normalize(text);
      await ext.action('openUrl', { url: `https://www.google.com/search?q=${encodeURIComponent(q)}` });
      answer = `${r.hint ? r.hint + '. ' : ''}Такой команды я пока не знаю, поэтому ищу в интернете. Подключите ИИ в настройках — и я смогу выполнить почти любую просьбу.`;
    }
  } catch (e) {
    console.error(e);
    answer = 'Произошла ошибка: ' + (e?.message || e);
    isError = true;
    Sounds.error();
  }
  await respond(answer, { error: isError, voice });
}

async function respond(text, { error = false, voice = true } = {}) {
  if (!text) { state.mode = 'idle'; idleCore(); return; }
  state.lastAnswer = text;
  logMsg('bot', text, error ? 'err' : '');
  state.mode = 'speaking';
  setCore('ОТВЕТ', '', error ? 'error' : 'speaking');
  await speaker.speak(text);
  recognizer.flush();
  state.mode = 'idle';
  // После ответа немного слушаем без ключевого слова — для продолжения диалога.
  if (voice && settings.voice.followUpSeconds > 0) state.awakeUntil = Date.now() + settings.voice.followUpSeconds * 1000;
  idleCore();
  setTimeout(() => { if (state.mode === 'idle') setTranscript(''); }, 6000);
}

// ───────────────────────── ключевое слово ─────────────────────────
function findWake(text) {
  const words = normalize(text).split(' ');
  const wakes = (settings.voice.wakeWords || []).map((w) => normalize(w)).filter(Boolean);
  for (let i = 0; i < words.length; i++) {
    for (const w of wakes) {
      const n = w.split(' ').length;
      const single = words.slice(i, i + n).join(' ');
      const joined = words.slice(i, i + n + 1).join(''); // «джар вис» → «джарвис»
      const s = Math.max(similarity(single, w), similarity(translit(single), translit(w)));
      if (s >= 0.75) return { index: i, end: i + n, words };
      if (n === 1 && i + 1 < words.length && similarity(joined, w.replace(/ /g, '')) >= 0.8) return { index: i, end: i + 2, words };
    }
  }
  return null;
}

const YES = /^(да|ага|конечно|подтверждаю|выполняй|выполнить|давай|верно|угу|ок|окей|точно|разрешаю)(\s|$)/;
const NO = /^(нет|не надо|отмена|отмени|стоп|не|не нужно|отказ|запрещаю)(\s|$)/;

function wake() {
  state.awakeUntil = Date.now() + 8000;
  Sounds.wake();
  setCore('СЛУШАЮ', 'говорите команду', 'listening');
  $('btnTalk').classList.add('active');
}

recognizer.addEventListener('partial', ({ detail }) => {
  if (!state.ears || state.mode === 'busy') return;
  if (state.mode === 'speaking') return;
  const awake = Date.now() < state.awakeUntil || !settings.voice.wakeWordEnabled || state.confirm;
  setTranscript(detail.text, awake ? 'final' : 'partial');
});

recognizer.addEventListener('final', ({ detail }) => {
  const text = detail.text;
  if (!state.ears) return;

  if (state.confirm) {
    if (speaker.speaking) return; // не принимаем собственный голос за ответ
    const t = normalize(text);
    if (YES.test(t)) state.confirm.resolve(true);
    else if (NO.test(t)) state.confirm.resolve(false);
    return;
  }

  const wakeHit = settings.voice.wakeWordEnabled ? findWake(text) : null;

  if (state.mode === 'speaking') {
    // Пока ассистент говорит, слушаем только «стоп» и ключевое слово (защита от эха).
    const t = normalize(text);
    if (/(^|\s)(стоп|хватит|замолчи|тихо)(\s|$)/.test(t) || wakeHit) {
      speaker.stop();
      if (wakeHit) {
        const rest = wakeHit.words.slice(wakeHit.end).join(' ');
        if (rest) processCommand(rest, { voice: true }); else wake();
      }
    }
    return;
  }
  if (state.mode === 'busy') return;

  const awake = Date.now() < state.awakeUntil || !settings.voice.wakeWordEnabled;
  if (wakeHit) {
    const rest = wakeHit.words.slice(wakeHit.end).join(' ').trim();
    if (rest) processCommand(rest, { voice: true });
    else wake();
    return;
  }
  if (awake) {
    $('btnTalk').classList.remove('active');
    processCommand(text, { voice: true });
    return;
  }
  // Фраза без ключевого слова — просто гасим подсказку.
  setTimeout(() => { if (state.mode === 'idle' && Date.now() > state.awakeUntil) setTranscript(''); }, 1500);
});

recognizer.addEventListener('error', ({ detail }) => console.warn('recognizer', detail));

// Анимация реактора от микрофона + окончание «окна ожидания».
function audioLoop() {
  requestAnimationFrame(audioLoop);
  if (state.voiceReady && state.ears && state.mode !== 'speaking') {
    const { level, spectrum } = recognizer.level();
    reactor.setLevel(level, spectrum);
  } else if (state.mode !== 'speaking') {
    reactor.setLevel(0, null);
  }
  if (state.mode === 'idle' && state.awakeUntil && Date.now() > state.awakeUntil) {
    state.awakeUntil = 0;
    $('btnTalk').classList.remove('active');
    idleCore();
  }
}
audioLoop();

function setEars(on) {
  state.ears = on;
  recognizer.setEnabled(on);
  $('btnMute').classList.toggle('off', !on);
  setPill('pillMic', on ? (state.voiceReady ? 'ok' : 'warn') : 'err', on ? 'Микрофон включён' : 'Микрофон выключен');
  if (state.mode === 'idle') idleCore();
}

function talk() {
  if (!state.voiceReady) {
    $('composerInput').focus();
    toast('Голос недоступен', 'Модель распознавания речи не загружена — используйте текстовое поле.', 'err');
    return;
  }
  if (!state.ears) setEars(true);
  if (state.mode === 'speaking') speaker.stop();
  wake();
}

// ───────────────────────── подтверждения ─────────────────────────
function askConfirm({ title, text, details }) {
  return new Promise((resolve) => {
    if (state.confirm) state.confirm.resolve(false);
    $('confirmTitle').textContent = title || 'Подтвердите действие';
    $('confirmText').textContent = text || '';
    $('confirmDetails').textContent = details || '';
    openModal('confirm');
    Sounds.wake();
    const finish = (v) => {
      closeModal('confirm');
      state.confirm = null;
      logMsg('sys', v ? '✓ подтверждено' : '✕ отменено', v ? 'ok' : 'bad');
      resolve(v);
    };
    state.confirm = { resolve: finish };
    speaker.speak(`${title || 'Подтвердите действие'} Скажите да или нет.`);
  });
}
$('confirmYes').onclick = () => state.confirm?.resolve(true);
$('confirmNo').onclick = () => state.confirm?.resolve(false);

// ───────────────────────── RPC из главного процесса ─────────────────────────
ext.onRpc(async (method, payload) => {
  if (method === 'confirm') return askConfirm(payload);
  if (method === 'timer') {
    addTimer(payload.seconds, payload.label || 'Таймер');
    return { ok: true, message: `Таймер на ${formatDuration(payload.seconds)} запущен` };
  }
  if (method === 'notesChanged' || method === 'memoryChanged') {
    settings = await ext.settings.get();
    renderNotes();
    renderLearning();
    return { ok: true };
  }
  return null;
});

const TOOL_NAMES = {
  run_command: 'команда', open_url: 'открываю сайт', open_app: 'запуск программы', close_app: 'закрытие программы',
  open_path: 'открываю путь', set_volume: 'громкость', media_control: 'медиа', power: 'питание', take_screenshot: 'скриншот',
  type_text: 'ввод текста', clipboard: 'буфер обмена', system_info: 'состояние системы', set_timer: 'таймер', notes: 'заметки',
};
ext.ai.onEvent((e) => {
  if (e.type === 'tool') {
    const arg = e.input?.name || e.input?.url || e.input?.path || e.input?.action || '';
    setCore('ДЕЙСТВУЮ', TOOL_NAMES[e.name] || e.name, 'thinking');
    if (e.name !== 'run_command') logMsg('sys', `⚙ ${TOOL_NAMES[e.name] || e.name}${arg ? ': ' + arg : ''}`);
  } else if (e.type === 'command') {
    logMsg('sys', `$ ${e.text}`);
  } else if (e.type === 'tool-result' && !e.ok) {
    logMsg('sys', `✕ ${e.message || 'ошибка'}`, 'bad');
  }
});

// ───────────────────────── таймеры ─────────────────────────
let timers = [];
try { timers = JSON.parse(localStorage.getItem('timers') || '[]').filter((t) => t.end > Date.now()); } catch { timers = []; }
const saveTimers = () => { try { localStorage.setItem('timers', JSON.stringify(timers)); } catch { /* приватный режим */ } };

function addTimer(seconds, label = 'Таймер', alarm = false) {
  const sec = Math.max(1, Math.round(seconds));
  timers.push({ id: Date.now() + Math.random(), end: Date.now() + sec * 1000, total: sec, label, alarm });
  saveTimers();
  renderTimers();
}

function clearTimers() {
  const n = timers.length;
  timers = [];
  saveTimers();
  renderTimers();
  return n;
}

function fmtClock(sec) {
  sec = Math.max(0, Math.ceil(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0');
}

function renderTimers() {
  const ul = $('timers');
  $('timerCount').textContent = timers.length;
  if (!timers.length) {
    ul.innerHTML = '<li class="empty">Скажите: «поставь таймер на 5 минут»</li>';
    return;
  }
  ul.innerHTML = '';
  for (const t of timers) {
    const li = document.createElement('li');
    li.className = 'timer';
    li.dataset.id = t.id;
    li.innerHTML = '<div class="timer-top"><span class="timer-time"></span><span class="timer-label"></span><button class="timer-x" title="Отменить">×</button></div><div class="bar"><i></i></div>';
    li.querySelector('.timer-label').textContent = t.label;
    li.querySelector('.timer-x').onclick = () => { timers = timers.filter((x) => x.id !== t.id); saveTimers(); renderTimers(); };
    ul.appendChild(li);
  }
  tickTimers();
}

function tickTimers() {
  const now = Date.now();
  for (const t of timers) {
    const li = document.querySelector(`.timer[data-id="${t.id}"]`);
    if (!li) continue;
    const left = (t.end - now) / 1000;
    li.querySelector('.timer-time').textContent = fmtClock(left);
    li.querySelector('.bar i').style.width = `${Math.max(0, Math.min(100, 100 - (left / t.total) * 100))}%`;
  }
  const due = timers.filter((t) => t.end <= now);
  if (due.length) {
    timers = timers.filter((t) => t.end > now);
    saveTimers();
    renderTimers();
    for (const t of due) fireTimer(t);
  }
}
setInterval(tickTimers, 250);

function fireTimer(t) {
  ext.win.show();
  Sounds.alarm();
  document.body.classList.add('alarm');
  reactor.setState('alarm');
  setTimeout(() => { document.body.classList.remove('alarm'); if (state.mode === 'idle') idleCore(); }, 6000);
  const name = settings.userName || 'сэр';
  const text = t.alarm
    ? `Доброе утро, ${name}. Время просыпаться, сейчас ${timeStr()}.`
    : t.label && !/^(таймер|напоминание)$/i.test(t.label)
      ? `${cap(name)}, напоминаю: ${t.label}.`
      : `${cap(name)}, время вышло.`;
  ext.action('notify', { title: t.alarm ? 'Будильник' : 'ExternalAI', body: text });
  setTimeout(() => respond(text, { voice: true }), 2000);
}

// ───────────────────────── заметки ─────────────────────────
function renderNotes() {
  const ul = $('notes');
  const notes = settings.notes || [];
  if (!notes.length) {
    ul.innerHTML = '<li class="empty">Скажите: «запомни, что…»</li>';
    return;
  }
  ul.innerHTML = '';
  for (const n of notes.slice(-8).reverse()) {
    const li = document.createElement('li');
    li.textContent = n.text;
    li.title = new Date(n.at).toLocaleString('ru-RU');
    ul.appendChild(li);
  }
}
$('notesClear').onclick = async () => { await saveSettings({ notes: [] }); renderNotes(); };

// ───────────────────────── обучение ─────────────────────────
const TOOL_SHORT = {
  open_url: (i) => `сайт ${String(i.url || '').replace(/^https?:\/\/(www\.)?/, '').slice(0, 40)}`, open_app: (i) => `запуск ${i.name}`,
  close_app: (i) => `закрыть ${i.name}`, open_path: (i) => `открыть ${i.path}`, set_volume: (i) => `громкость ${i.action}${i.amount ? ' ' + i.amount : ''}`,
  media_control: (i) => `медиа ${i.action}`, take_screenshot: () => 'скриншот', press_keys: (i) => `клавиши ${i.combo}`,
  window_control: (i) => `окно ${i.action}`, set_brightness: (i) => `яркость ${i.action}`, open_settings_page: (i) => `настройки ${i.what}`,
  set_timer: (i) => `таймер ${i.seconds} с`, create_item: (i) => `создать ${i.name}`,
};

function renderLearning() {
  const list = $('learnedList');
  if (!list) return;
  const learned = (settings.learned || []).slice().reverse();
  $('learnedCount').textContent = learned.length ? `· ${learned.length}` : '';
  list.innerHTML = '';
  if (!learned.length) list.innerHTML = '<li class="empty">Пока пусто. Научите меня голосом или пользуйтесь ИИ — я запоминаю сам.</li>';
  for (const e of learned) {
    const li = document.createElement('li');
    li.innerHTML = '<span class="lk"></span><span class="lp"></span><span class="la"></span><button class="lx" title="Забыть">×</button>';
    li.querySelector('.lk').textContent = e.kind === 'ai' ? 'ИИ' : 'своя';
    li.querySelector('.lp').textContent = `«${e.phrase}»`;
    const what = e.kind === 'alias' ? e.commands.join(' → ') : (e.steps || []).map((st) => (TOOL_SHORT[st.name] || (() => st.name))(st.input || {})).join(' → ');
    li.querySelector('.la').textContent = `${what}${e.uses ? ` · ${e.uses}×` : ''}`;
    li.querySelector('.la').title = what;
    li.querySelector('.lx').onclick = async () => { await saveSettings({ learned: (settings.learned || []).filter((x) => x.id !== e.id) }); renderLearning(); };
    list.appendChild(li);
  }
  const facts = $('factsList');
  facts.innerHTML = '';
  const fl = settings.facts || [];
  if (!fl.length) facts.innerHTML = '<li class="empty">Скажите «запомни обо мне…» — или ИИ запомнит важное сам.</li>';
  fl.forEach((f, idx) => {
    const li = document.createElement('li');
    li.innerHTML = '<span class="la"></span><button class="lx" title="Забыть">×</button>';
    li.querySelector('.la').textContent = f.text;
    li.querySelector('.la').title = f.text;
    li.querySelector('.lx').onclick = async () => { await saveSettings({ facts: fl.filter((_, i) => i !== idx) }); renderLearning(); };
    facts.appendChild(li);
  });
}

$('teachAdd').onclick = async () => {
  const phrase = $('teachPhrase').value.trim();
  const actions = $('teachActions').value.trim();
  if (!phrase || !actions) return toast('Заполните оба поля', 'Фразу и что нужно делать', 'err');
  const r = await commands.handle(`когда я говорю ${phrase}: ${actions}`);
  $('teachPhrase').value = '';
  $('teachActions').value = '';
  toast('Команда добавлена', r.say || '', 'ok');
  renderLearning();
};
$('factAdd').onclick = async () => {
  const text = $('factInput').value.trim();
  if (!text) return;
  await saveSettings({ facts: [...(settings.facts || []), { text, at: Date.now() }] });
  $('factInput').value = '';
  renderLearning();
};

// ───────────────────────── виджеты ─────────────────────────
const WEEK = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
function tickClock() {
  const d = new Date();
  $('clock').innerHTML = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}<span class="clock-sec">:${String(d.getSeconds()).padStart(2, '0')}</span>`;
  $('date').textContent = `${WEEK[d.getDay()]}, ${d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}`;
  const h = d.getHours();
  const name = settings.userName ? `, ${settings.userName}` : '';
  $('greeting').textContent = (h < 5 ? 'Доброй ночи' : h < 12 ? 'Доброе утро' : h < 18 ? 'Добрый день' : 'Добрый вечер') + name;
}
setInterval(tickClock, 1000);
tickClock();

const cpuHistory = [];
function drawSpark() {
  const c = $('cpuSpark');
  const dpr = devicePixelRatio || 1;
  c.width = c.clientWidth * dpr;
  c.height = c.clientHeight * dpr;
  const ctx = c.getContext('2d');
  const W = c.width, H = c.height;
  ctx.clearRect(0, 0, W, H);
  if (cpuHistory.length < 2) return;
  const step = W / 59;
  ctx.beginPath();
  cpuHistory.forEach((v, i) => {
    const x = W - (cpuHistory.length - 1 - i) * step;
    const y = H - (v / 100) * (H - 4) - 2;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  });
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent-rgb').trim();
  ctx.strokeStyle = `rgba(${accent}, 0.9)`;
  ctx.lineWidth = 1.5 * dpr;
  ctx.stroke();
  ctx.lineTo(W, H);
  ctx.lineTo(W - (cpuHistory.length - 1) * step, H);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, `rgba(${accent}, 0.35)`);
  g.addColorStop(1, `rgba(${accent}, 0)`);
  ctx.fillStyle = g;
  ctx.fill();
}

async function tickSystem() {
  try {
    const s = await ext.action('systemInfo');
    $('cpuVal').textContent = `${s.cpu}%`;
    $('cpuBar').style.width = `${s.cpu}%`;
    $('memVal').textContent = `${s.memPercent}%`;
    $('memBar').style.width = `${s.memPercent}%`;
    $('memSub').textContent = `${s.memUsedGB} / ${s.memTotalGB} ГБ · ${s.cores} потоков`;
    $('sysHost').textContent = s.host;
    const up = s.uptimeMin;
    $('upVal').textContent = up >= 1440 ? `${Math.floor(up / 1440)}д ${Math.floor((up % 1440) / 60)}ч` : `${Math.floor(up / 60)}ч ${up % 60}м`;
    cpuHistory.push(s.cpu);
    if (cpuHistory.length > 60) cpuHistory.shift();
    drawSpark();
  } catch { /* окно закрывается */ }
}
setInterval(tickSystem, 2000);
tickSystem();

if (navigator.getBattery) {
  navigator.getBattery().then((b) => {
    const upd = () => { $('batVal').textContent = b.charging && b.level === 1 ? 'сеть' : `${Math.round(b.level * 100)}%${b.charging ? ' ⚡' : ''}`; };
    upd();
    b.addEventListener('levelchange', upd);
    b.addEventListener('chargingchange', upd);
  });
}

async function loadWeather() {
  try {
    const { place, w } = await getWeather(settings.system.city || 'Москва');
    const [desc, icon] = describeWeather(w.current.weather_code);
    $('weatherCity').textContent = place.name;
    $('weatherIcon').textContent = icon;
    $('weatherTemp').textContent = `${Math.round(w.current.temperature_2m)}°`;
    $('weatherDesc').textContent = `${desc}, ощущается ${Math.round(w.current.apparent_temperature)}°, ветер ${Math.round(w.current.wind_speed_10m)} м/с`;
    const days = $('weatherDays');
    days.innerHTML = '';
    for (let i = 1; i < Math.min(4, w.daily.time.length); i++) {
      const d = new Date(w.daily.time[i]);
      const el = document.createElement('div');
      el.innerHTML = `<span></span><b></b><span></span>`;
      el.children[0].textContent = d.toLocaleDateString('ru-RU', { weekday: 'short' });
      el.children[1].textContent = `${describeWeather(w.daily.weather_code[i])[1]} ${Math.round(w.daily.temperature_2m_max[i])}°`;
      el.children[2].textContent = `${Math.round(w.daily.temperature_2m_min[i])}°`;
      days.appendChild(el);
    }
  } catch {
    $('weatherDesc').textContent = 'нет данных о погоде';
  }
}
loadWeather();
setInterval(loadWeather, 30 * 60 * 1000);

// ───────────────────────── справка ─────────────────────────
function openHelp() {
  const grid = $('helpGrid');
  grid.innerHTML = '';
  const groups = commands.help();
  groups['ИИ (Claude)'] = ['создай на рабочем столе папку Проекты', 'сколько места на диске C', 'какие новости сегодня', 'переведи на английский: доброе утро', 'напиши письмо начальнику и скопируй в буфер'];
  for (const [g, list] of Object.entries(groups)) {
    const box = document.createElement('div');
    box.className = 'help-item';
    box.innerHTML = '<h5></h5><ul></ul>';
    box.querySelector('h5').textContent = g;
    for (const ex of [...new Set(list)]) {
      const li = document.createElement('li');
      li.textContent = `«${ex}»`;
      li.title = 'Нажмите, чтобы выполнить';
      li.onclick = () => { closeModal('help'); processCommand(ex); };
      box.querySelector('ul').appendChild(li);
    }
    grid.appendChild(box);
  }
  openModal('help');
}

// ───────────────────────── обновления ─────────────────────────
const UPD_TEXT = {
  idle: 'Обновления ещё не проверялись', checking: 'Проверяю обновления…', available: 'Доступна новая версия',
  downloading: 'Скачиваю обновление…', ready: 'Обновление готово к установке', latest: 'У вас последняя версия',
  error: 'Ошибка обновления', dev: 'Режим разработки — обновления отключены',
};
let lastUpdateStatus = '';
function renderUpdate(u) {
  if (!u) return;
  let text = UPD_TEXT[u.status] || u.status;
  if (u.latest && ['available', 'downloading', 'ready'].includes(u.status)) text += `: v${u.latest}`;
  if (u.status === 'downloading' && u.percent) text += ` — ${u.percent}%`;
  if (u.error && (u.status === 'error' || u.status === 'dev')) text += ` (${u.error})`;
  $('updStatus').textContent = text;
  $('updBar').style.width = `${u.status === 'ready' ? 100 : u.percent || 0}%`;
  $('updNotes').textContent = u.notes || '';
  $('updDownload').classList.toggle('hidden', u.status !== 'available');
  $('updInstall').classList.toggle('hidden', u.status !== 'ready');
  const pill = $('pillUpdate');
  pill.classList.toggle('hidden', !['available', 'downloading', 'ready'].includes(u.status));
  pill.querySelector('span').textContent = u.status === 'ready' ? `v${u.latest} готова` : u.status === 'downloading' ? `Загрузка ${u.percent || 0}%` : `Есть v${u.latest}`;
  setPill('pillUpdate', u.status === 'ready' ? 'ok' : 'busy');
  if (u.status === 'ready' && lastUpdateStatus !== 'ready') {
    toast('Обновление готово', `Версия ${u.latest} установится при перезапуске.`, 'ok');
    logMsg('sys', `Доступна версия ${u.latest} — нажмите «Обновление» вверху`, 'ok');
  }
  lastUpdateStatus = u.status;
}
ext.update.onState(renderUpdate);
ext.update.state().then(renderUpdate);
$('updCheck').onclick = () => ext.update.check();
$('updDownload').onclick = () => ext.update.download();
$('updInstall').onclick = () => ext.update.install();
$('pillUpdate').onclick = () => (lastUpdateStatus === 'ready' ? ext.update.install() : openSettings('updates'));

// ───────────────────────── голосовая модель ─────────────────────────
async function refreshModelState() {
  const st = await ext.model.status();
  $('modelState').textContent = st.ready ? `${st.name} ✓` : 'не загружена';
}

// Карточка загрузки встроена в окно и имеет фиксированный размер — ничего не прыгает.
function showSetup(on) {
  $('coreBottom').classList.toggle('setup', on);
}

function setSetup({ pct, status, failed = false }) {
  const card = $('setupCard');
  card.classList.toggle('failed', failed);
  $('setupNote').textContent = failed
    ? 'Пока можно работать в текстовом режиме — поле справа.'
    : 'Один раз, около 45 МБ. Пока идёт загрузка, можно писать команды в поле справа.';
  if (pct !== undefined) {
    $('setupBar').style.width = `${pct}%`;
    $('setupPct').textContent = failed ? '—' : `${Math.round(pct)}%`;
  }
  if (status !== undefined) $('setupStatus').textContent = status;
}

const mb = (n) => (n / 1048576).toFixed(1).padStart(4, ' ');
function progressText(p) {
  if (p.stage === 'download') return `Скачано ${mb(p.received)}${p.total ? ` из ${mb(p.total)}` : ''} МБ`;
  return { extract: 'Распаковка архива…', pack: 'Подготовка модели…', done: 'Готово' }[p.stage] || '';
}

ext.model.onProgress((p) => {
  const pct = p.stage === 'download' ? (p.percent || 0) * 0.85 : p.stage === 'extract' ? 88 : p.stage === 'pack' ? 94 : 100;
  setSetup({ pct, status: progressText(p) });
  setPill('pillModel', 'busy', `Модель речи: ${Math.round(pct)}%`);
  if (state.mode === 'nomodel') setCore('ЗАГРУЗКА', `модель речи ${Math.round(pct)}%`, 'boot');
});

async function downloadModel() {
  showSetup(true);
  state.mode = 'nomodel';
  $('setupTitle').textContent = 'Загружаю модель распознавания речи';
  setSetup({ pct: 0, status: 'Подключение…' });
  setCore('ЗАГРУЗКА', 'модель речи', 'boot');
  const r = await ext.model.ensure();
  if (r.ok) {
    setSetup({ pct: 100, status: 'Готово, запускаю распознавание…' });
    await startVoice(true);
    showSetup(false);
  } else {
    $('setupTitle').textContent = 'Не удалось скачать модель речи';
    setSetup({ pct: 100, failed: true, status: `${r.error}. Скачайте vosk-model-small-ru-0.22.zip с alphacephei.com и выберите файл.` });
    setPill('pillModel', 'err', 'Модель не загружена');
    state.mode = 'idle';
    idleCore();
  }
}

async function importModel() {
  showSetup(true);
  $('setupTitle').textContent = 'Устанавливаю модель из файла';
  setSetup({ pct: 0, status: 'Выберите файл…' });
  const r = await ext.model.import();
  if (r?.ok) {
    closeModal('settings');
    setSetup({ pct: 100, status: 'Модель установлена. Перезапускаю…' });
    setTimeout(() => ext.app.relaunch(), 800);
  } else {
    if (!state.voiceReady && r?.canceled) setSetup({ pct: 0, failed: true, status: 'Файл не выбран.' });
    else if (state.voiceReady) showSetup(false);
    if (r && !r.canceled) toast('Не удалось импортировать', r.message || r.error || '', 'err');
  }
}

async function startVoice(firstTime = false) {
  setPill('pillModel', 'busy', 'Загрузка модели речи');
  setCore('ЗАГРУЗКА', 'модель распознавания речи', 'boot');
  try {
    await recognizer.start();
    state.voiceReady = true;
    setPill('pillModel', 'ok', 'Распознавание речи: офлайн, русский');
    setPill('pillMic', 'ok', 'Микрофон включён');
    state.mode = 'idle';
    idleCore();
    setTranscript('');
    if (firstTime) {
      Sounds.boot();
      const w = cap(settings.voice.wakeWords[0] || 'джарвис');
      respond(`Системы активны. Я готов. Скажите «${w}» и команду, например: ${w}, который час.`, { voice: false });
    }
  } catch (e) {
    console.error(e);
    state.voiceReady = false;
    state.mode = 'idle';
    const micDenied = /Permission|NotAllowed|NotFound|device/i.test(String(e?.name || e?.message || e));
    setPill(micDenied ? 'pillMic' : 'pillModel', 'err', String(e?.message || e));
    toast(micDenied ? 'Нет доступа к микрофону' : 'Ошибка распознавания речи', String(e?.message || e), 'err');
    idleCore();
    setTranscript('');
  }
}

// ───────────────────────── кнопки и клавиши ─────────────────────────
$('winMin').onclick = () => ext.win.minimize();
$('winMax').onclick = () => ext.win.toggleMaximize();
$('winClose').onclick = () => ext.win.close();
$('btnSettings').onclick = () => openSettings();
$('btnHelp').onclick = openHelp;
$('btnTalk').onclick = talk;
$('btnStop').onclick = () => { speaker.stop(); state.awakeUntil = 0; $('btnTalk').classList.remove('active'); Sounds.cancel(); if (state.mode !== 'busy') { state.mode = 'idle'; idleCore(); } };
$('btnMute').onclick = () => setEars(!state.ears);
$('logClear').onclick = clearDialog;
$('setupRetry').onclick = downloadModel;
$('setupImport').onclick = importModel;
$('setupSkip').onclick = () => {
  try { localStorage.setItem('skipModel', '1'); } catch { /* нет хранилища */ }
  showSetup(false);
  state.mode = 'idle';
  setPill('pillModel', 'warn', 'Голос отключён — только текст');
  idleCore();
  setTranscript('');
};
$('modelImport').onclick = importModel;
$('modelRedownload').onclick = async () => {
  await ext.model.remove();
  closeModal('settings');
  try { localStorage.removeItem('skipModel'); } catch { /* нет хранилища */ }
  downloadModel();
};
$('voiceTest').onclick = () => speaker.speak('Добрый день, сэр. Все системы работают нормально.');
$('aiTest').onclick = async () => {
  $('aiTestResult').textContent = 'Проверяю…';
  const r = await ext.ai.test();
  $('aiTestResult').textContent = r.ok ? `✓ Работает: ${r.text}` : `✕ ${r.text}`;
};
$('openUserData').onclick = () => ext.app.openUserData();
document.querySelectorAll('[data-href]').forEach((el) => {
  el.addEventListener('click', (e) => { e.preventDefault(); ext.app.openExternal(el.dataset.href); });
});
document.querySelectorAll('[data-close]').forEach((el) => { el.onclick = () => closeModal(el.dataset.close); });
document.querySelectorAll('.tab').forEach((t) => { t.onclick = () => selectTab(t.dataset.tab); });
document.querySelectorAll('.overlay').forEach((o) => {
  o.addEventListener('mousedown', (e) => {
    if (e.target === o && (o.id === 'settings' || o.id === 'help')) closeModal(o.id);
  });
});

$('composer').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $('composerInput');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  processCommand(text);
});

const CHIPS = ['Который час', 'Какая погода', 'Открой YouTube', 'Таймер на 5 минут', 'Сделай скриншот', 'Громче', 'Расскажи шутку', 'Что ты умеешь'];
for (const c of CHIPS) {
  const b = document.createElement('button');
  b.className = 'chip';
  b.textContent = c;
  b.onclick = () => processCommand(c);
  $('chips').appendChild(b);
}

ext.onHotkey(() => talk());
ext.win.onState(({ maximized }) => { $('winMax').title = maximized ? 'Восстановить' : 'Развернуть'; });

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (state.confirm) return state.confirm.resolve(false);
    const open = ['help', 'settings'].find((id) => !$(id).classList.contains('hidden'));
    if (open) return closeModal(open);
    speaker.stop();
  }
  if (e.key === 'F1') { e.preventDefault(); openHelp(); }
  if (e.ctrlKey && e.key === ',') { e.preventDefault(); openSettings(); }
  if (e.ctrlKey && e.key.toLowerCase() === 'l') { e.preventDefault(); $('composerInput').focus(); }
});

speaker.addEventListener('start', () => reactor.setState('speaking'));

// ───────────────────────── мини-реакторы ─────────────────────────
const aboutReactor = new Reactor($('aboutReactor'), { mini: true });
aboutReactor.setState('idle');

// ───────────────────────── запуск ─────────────────────────
$('appVersion').textContent = `v${info.version}`;
$('aboutVersion').textContent = `Версия ${info.version} · Electron ${info.electron} · ${info.platform}`;
applySettings();
renderTimers();
renderNotes();
ext.app.warmup();
logMsg('bot', settings.ai.apiKey
  ? 'Системы в сети. Я выполню встроенные команды мгновенно, а всё остальное — с помощью ИИ.'
  : 'Системы в сети. Встроенные команды работают сразу. Чтобы я мог выполнять любые просьбы, добавьте ключ Claude в настройках → «Искусственный интеллект».');

(async () => {
  const st = await ext.model.status();
  let skipped = false;
  try { skipped = localStorage.getItem('skipModel') === '1'; } catch { /* нет хранилища */ }
  if (st.ready) {
    await startVoice(false);
  } else if (skipped) {
    state.mode = 'idle';
    setPill('pillModel', 'warn', 'Голос отключён — только текст');
    setPill('pillMic', 'warn');
    idleCore();
    setTranscript('');
  } else {
    downloadModel();
  }
  if (settings.firstRun) saveSettings({ firstRun: false });
})();
