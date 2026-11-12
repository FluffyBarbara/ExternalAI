// Проверка разбора русских голосовых команд без запуска Electron.
import { createRequire } from 'module';
import assert from 'assert/strict';

const require = createRequire(import.meta.url);
globalThis.window = { TextUtils: require('../src/shared/text.js') };
const { createCommands, parseDuration } = await import('../src/renderer/js/commands.js');

const calls = [];
const timers = [];
const notes = [];
let learnedStore = [];
let factsStore = [];
const toolRuns = [];
const ctx = {
  ext: {
    action: async (name, args) => {
      calls.push({ name, args });
      if (name === 'systemInfo') return { cpu: 12, memUsedGB: 4, memTotalGB: 16 };
      if (name === 'openApp') {
        if (args.strict) return /^(телеграм|steam|стим)$/.test(args.name) ? { ok: true, message: 'Запускаю ' + args.name } : { ok: false, message: 'Не нашёл' };
        return /^(несуществующая штука|мой проект)$/.test(args.name) ? { ok: false, message: 'Не нашёл' } : { ok: true, message: 'Запускаю ' + args.name };
      }
      if (name === 'diskInfo') return { ok: true, disks: [{ name: 'C:', freeGB: 120.5, totalGB: 500 }] };
      return { ok: true, message: 'ok' };
    },
    update: { check: async () => {} },
    ai: { runTool: async (name, input) => { toolRuns.push({ name, input }); return { ok: true }; } },
  },
  settings: () => ({ userName: '', system: { city: 'Москва' }, learning: { autoLearn: true } }),
  saveSettings: async () => {},
  hasAI: () => true,
  ui: { openHelp() {}, openSettings() {}, clearLog() {}, stopSpeaking() {}, lastAnswer: () => 'x', hideWindow() {}, maximize() {}, setEars() {}, confirm: async () => true, voice: async (a) => 'voice:' + a },
  learning: { list: () => learnedStore, save: async (l) => { learnedStore = l; } },
  facts: { list: () => factsStore, add: async (t) => factsStore.push({ text: t }), clear: async () => { factsStore = []; } },
  ai: async () => ({ ok: true, text: 'ии' }),
  timers: { add: (s, l) => timers.push({ s, l }), clear: () => 0, list: () => [] },
  notes: { add: async (t) => notes.push(t), list: () => notes.map((text) => ({ text })), clear: async () => {} },
};
const cmd = createCommands(ctx);

async function expectAction(text, name, check = () => true) {
  calls.length = 0;
  const r = await cmd.handle(text);
  const call = calls.find((c) => c.name === name);
  assert.ok(r.handled, `«${text}» не обработано`);
  assert.ok(call, `«${text}» → ожидалось действие ${name}, получено ${JSON.stringify(calls)}`);
  assert.ok(check(call.args), `«${text}» → неверные аргументы ${JSON.stringify(call.args)}`);
}
async function expectSay(text, re) {
  const r = await cmd.handle(text);
  assert.ok(r.handled, `«${text}» не обработано`);
  assert.match(r.say, re, `«${text}» → «${r.say}»`);
}

assert.equal(parseDuration('25 минут и 30 секунд'), 1530);
assert.equal(parseDuration('полчаса'), 1800);
assert.equal(parseDuration('1.5 часа'), 5400);

await expectAction('Открой ютуб', 'openUrl', (a) => a.url.includes('youtube.com'));
await expectAction('открой сайт хабр точка ком', 'openUrl', (a) => a.url === 'habr.com');
await expectAction('запусти телеграм', 'openApp', (a) => a.name === 'телеграм');
await expectAction('открой загрузки', 'openPath', (a) => a.path === 'downloads');
await expectAction('найди на ютубе котиков', 'openUrl', (a) => a.url.includes('youtube.com/results') && a.url.includes(encodeURIComponent('котиков')));
await expectAction('загугли курс доллара', 'openUrl', (a) => a.url.includes('google.com/search'));
await expectAction('сделай громче на двадцать', 'volume', (a) => a.action === 'up' && a.amount === 20);
await expectAction('тише', 'volume', (a) => a.action === 'down');
await expectAction('выключи звук', 'volume', (a) => a.action === 'mute');
await expectAction('громкость пятьдесят процентов', 'volume', (a) => a.action === 'set' && a.amount === 50);
await expectAction('пауза', 'media', (a) => a.action === 'playpause');
await expectAction('следующий трек', 'media', (a) => a.action === 'next');
await expectAction('сделай скриншот', 'screenshot');
await expectAction('выключи компьютер через тридцать минут', 'power', (a) => a.action === 'shutdown' && a.delay === 1800);
await expectAction('заблокируй компьютер', 'power', (a) => a.action === 'lock');
await expectAction('закрой блокнот', 'closeApp', (a) => a.name === 'блокнот');
await expectAction('напечатай привет мир', 'typeText', (a) => a.text === 'привет мир');
await expectAction('открой ютуб а потом сделай громче', 'volume');

await expectSay('который час', /^Сейчас \d+:\d\d/);
await expectSay('какое сегодня число', /^Сегодня/);
await expectSay('сколько будет двадцать пять умножить на четыре', /100/);
await expectSay('посчитай сто разделить на восемь', /12,5/);
await expectSay('сколько будет 15 процентов от 200', /30/);
await expectSay('поставь таймер на пять минут', /5 минут/);
assert.equal(timers.at(-1).s, 300);
await expectSay('напомни через десять минут выключить чайник', /выключить чайник/);
assert.equal(timers.at(-1).s, 600);
assert.equal(timers.at(-1).l, 'выключить чайник');
await expectSay('запомни что ключи в куртке', /Записал/);
assert.equal(notes.at(-1), 'ключи в куртке');
await expectSay('привет', /(утро|день|вечер|ночи)/);
await expectSay('расскажи анекдот', /.{10,}/);
await expectSay('загрузка процессора', /12 процентов/);

// Непонятное — уходит ИИ.
let r = await cmd.handle('создай на рабочем столе папку проекты');
assert.equal(r.handled, false);
r = await cmd.handle('открой несуществующая штука');
assert.equal(r.handled, false);

console.log('✓ все проверки команд пройдены');

await expectSay('сколько будет 2 плюс 3 умножить на 4', /14/);
await expectSay('посчитай скобка открывается 2 плюс 3 скобка закрывается умножить на 4', /20/);
await expectSay('сколько будет 2 в 10 степени', /1.?024/);
console.log('✓ калькулятор');

// ── понимание с полуслова ──
await expectAction('можешь открыть ютуб пожалуйста', 'openUrl', (a) => a.url.includes('youtube'));
await expectAction('слушай а открой-ка ютуб', 'openUrl', (a) => a.url.includes('youtube'));
await expectAction('ютуб открой', 'openUrl', (a) => a.url.includes('youtube'));
await expectAction('ютуб', 'openUrl', (a) => a.url.includes('youtube'));
await expectAction('телеграм', 'openApp', (a) => a.name === 'телеграм' && a.strict);
await expectAction('я хочу послушать музыку', 'media', (a) => a.action === 'playpause');
await expectAction('звук побольше', 'volume', (a) => a.action === 'up');
await expectAction('сделай звук потише', 'volume', (a) => a.action === 'down');
await expectAction('трек другой', 'media', (a) => a.action === 'next');
await expectAction('отключи звук', 'volume', (a) => a.action === 'mute');
await expectAction('экран сфоткай', 'screenshot');
calls.length = 0;
let r0 = await cmd.handle('да');
assert.ok(!calls.some((c) => c.name === 'openApp'), '«да» не должно запускать программу');

// ── контекст ──
await expectAction('громче', 'volume', (a) => a.action === 'up');
await expectAction('еще', 'volume', (a) => a.action === 'up');
await expectAction('еще тише', 'volume', (a) => a.action === 'down');

// ── новые команды ──
await expectAction('новая вкладка', 'keys', (a) => a.combo === 'ctrl+t');
await expectAction('закрой вкладку', 'keys', (a) => a.combo === 'ctrl+w');
await expectAction('прокрути вниз', 'keys', (a) => a.combo === 'pagedown');
await expectAction('нажми энтер 3 раза', 'keys', (a) => a.combo === 'enter' && a.times === 3);
await expectAction('нажми контрол шифт т', 'keys', (a) => a.combo === 'ctrl+shift+t');
await expectAction('обнови страницу', 'keys', (a) => a.combo === 'f5');
await expectAction('сверни окно', 'activeWindow', (a) => a.action === 'minimize');
await expectAction('сделай ярче на 30', 'brightness', (a) => a.action === 'up' && a.amount === 30);
await expectAction('яркость 70', 'brightness', (a) => a.action === 'set' && a.amount === 70);
await expectAction('найди файл договор', 'openFile', (a) => a.query === 'договор' && a.reveal);
await expectAction('создай папку проекты на рабочем столе', 'createItem', (a) => a.kind === 'folder' && a.name === 'проекты');
await expectAction('открой настройки звука', 'settingsPage', (a) => a.what === 'звука');
await expectAction('сгенерируй пароль из 20 символов', 'copyText', (a) => a.text.length === 20);
await expectSay('сколько места на диске', /свободно 120,5 из 500/);
await expectSay('который час в токио', /^В Токио сейчас \d+:\d\d/);
await expectSay('сколько дней до нового года', /^До нового года \d+/);
await expectSay('выбери пиццу или суши', /(пиццу|суши)/);
await expectSay('запусти секундомер', /запущен/);
await expectSay('говори быстрее', /voice:быстрее/);
await expectSay('смени голос', /voice:next/);

// ── обучение ──
await expectSay('когда я говорю рабочий режим открой телеграм и открой почту', /рабочий режим/);
assert.deepEqual(learnedStore.at(-1).commands, ['открой телеграм', 'открой почту']);
await expectAction('рабочий режим', 'openUrl', (a) => a.url.includes('mail.google.com'));
await expectSay('научись: кино — открой кинопоиск, громкость 30', /кино/);
assert.deepEqual(learnedStore.at(-1).commands, ['открой кинопоиск', 'громкость 30']);
await expectAction('кино', 'volume', (a) => a.action === 'set' && a.amount === 30);
await expectSay('забудь команду кино', /Забыл/);
assert.ok(!learnedStore.some((e) => e.phrase === 'кино'));

// Самообучение на действиях ИИ
const note = await cmd.afterAI('открой мой проект', { ok: true, text: 'Открываю проект', actions: [{ name: 'open_path', input: { path: 'D:/proj' }, ok: true }] });
assert.match(note, /Выучил/);
toolRuns.length = 0;
const lr = await cmd.handle('открой мой проект');
assert.ok(lr.handled && lr.learned && toolRuns[0]?.name === 'open_path', 'выученное действие ИИ не повторилось');
// Похожая фраза тоже срабатывает
toolRuns.length = 0;
await cmd.handle('открой мои проект');
assert.equal(toolRuns[0]?.name, 'open_path');
// Опасные команды не запоминаются
assert.equal(await cmd.afterAI('удали всё', { ok: true, text: 'ok', actions: [{ name: 'run_command', input: {}, ok: true }] }), null);

// Исправление «не то»
await cmd.handle('открой несуществующая штука');
await expectSay('не то', /Что нужно было сделать/);
await expectAction('открой ютуб', 'openUrl');
assert.equal(learnedStore.at(-1).phrase, 'открой несуществующая штука');
await expectAction('открой несуществующая штука', 'openUrl', (a) => a.url.includes('youtube'));

// Факты о пользователе
await expectSay('запомни обо мне я люблю рок', /Запомнил/);
assert.equal(factsStore.at(-1).text, 'Я люблю рок');
await expectSay('что ты знаешь обо мне', /люблю рок/);

console.log('✓ понимание, контекст, обучение и новые команды');
await expectSay('когда я говорю вечер открой ютуб, открой почту и громкость 30', /вечер/);
assert.deepEqual(learnedStore.at(-1).commands, ['открой ютуб', 'открой почту', 'громкость 30']);
console.log('✓ разбор нескольких действий');

// ── каталог ──
const cat = await import('../src/renderer/js/catalog.js');
await expectSay('сколько метров в миле', /1 миля — это 1[\s ]?609,344 метра/);
await expectSay('переведи 5 футов в сантиметры', /152,4 сантиметра/);
await expectSay('100 градусов фаренгейта в цельсии', /37,7778/);
await expectSay('сколько мегабайт в гигабайте', /1[\s ]?000 мегабайт/);
await expectSay('сколько километров в час в 10 метрах в секунду', /36 километров в час/);
await expectSay('сколько секунд в сутках', /86[\s ]?400 секунд/);
await expectSay('3 фунта в килограммах', /1,3608 килограмма/);
assert.equal(cat.findCurrency('таиландских батов'), 'THB');
assert.equal(cat.findCurrency('долларов'), 'USD');
assert.equal(cat.findCurrency('евро'), 'EUR');
assert.equal(cat.findCurrency('японских иен'), 'JPY');
assert.equal(cat.findCurrency('шведских крон'), 'SEK');
assert.equal(cat.findCurrency('тенге'), 'KZT');
assert.equal(cat.findCurrency('минут'), null);
assert.deepEqual(cat.parseCurrency('100 батов в рублях'), { amount: 100, from: 'THB', to: 'RUB' });
assert.deepEqual(cat.parseCurrency('курс юаня к евро'), { amount: 1, from: 'CNY', to: 'EUR' });
assert.equal(cat.parseCurrency('3 фунта в килограммах'), null);
await expectAction('найди на авито велосипед', 'openUrl', (a) => a.url.includes('avito.ru/all?q='));
await expectAction('поищи на хабре нейросети', 'openUrl', (a) => a.url.includes('habr.com/ru/search'));
await expectAction('открой госуслуги', 'openUrl', (a) => a.url.includes('gosuslugi'));
await expectAction('открой хедхантер', 'openUrl', (a) => a.url.includes('hh.ru'));
await expectSay('корень из 144', /12/);
await expectSay('факториал 10', /3[\s ]?628[\s ]?800/);
await expectSay('синус 30', /0,5/);
await expectSay('255 в шестнадцатеричную систему', /F F/);
await expectSay('2024 римскими цифрами', /M M X X I V/);
await expectSay('сколько процентов 25 от 200', /12,5/);
await expectSay('сколько дней до дня победы', /9 мая/);
await expectSay('какой день недели был 12 апреля 1961 года', /среда/);
assert.equal(cat.fixLayout('ghbdtn'), 'привет');
const st = cmd.stats({ apps: 200, settings: 25 });
assert.ok(st.total > 10000, 'команд меньше 10 000: ' + st.total);
console.log(`✓ каталог: всего ${st.total} команд`);
for (const [l, n] of st.rows) console.log(`   ${String(n).padStart(6)}  ${l}`);
