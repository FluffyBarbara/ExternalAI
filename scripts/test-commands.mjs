// Проверка разбора русских голосовых команд без запуска Electron.
import { createRequire } from 'module';
import assert from 'assert/strict';

const require = createRequire(import.meta.url);
globalThis.window = { TextUtils: require('../src/shared/text.js') };
const { createCommands, parseDuration } = await import('../src/renderer/js/commands.js');

const calls = [];
const timers = [];
const notes = [];
const ctx = {
  ext: {
    action: async (name, args) => {
      calls.push({ name, args });
      if (name === 'systemInfo') return { cpu: 12, memUsedGB: 4, memTotalGB: 16 };
      if (name === 'openApp') return args.name === 'несуществующая штука' ? { ok: false, message: 'Не нашёл' } : { ok: true, message: 'Запускаю ' + args.name };
      return { ok: true, message: 'ok' };
    },
    update: { check: async () => {} },
  },
  settings: () => ({ userName: '', system: { city: 'Москва' } }),
  saveSettings: async () => {},
  hasAI: () => true,
  ui: { openHelp() {}, openSettings() {}, clearLog() {}, stopSpeaking() {}, lastAnswer: () => 'x', hideWindow() {}, maximize() {}, setEars() {}, confirm: async () => true },
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
