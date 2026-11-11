// Движок русских голосовых команд. Всё, что не распознано здесь, уходит в ИИ.
const { normalize, wordsToNumbers, translit } = window.TextUtils;

// ───────────────────────── справочники ─────────────────────────

const SITES = {
  'ютуб': 'https://www.youtube.com', 'youtube': 'https://www.youtube.com', 'ютьюб': 'https://www.youtube.com',
  'гугл': 'https://www.google.com', 'google': 'https://www.google.com',
  'яндекс': 'https://ya.ru', 'вк': 'https://vk.com', 'вконтакте': 'https://vk.com', 'в контакте': 'https://vk.com',
  'почту': 'https://mail.google.com', 'почта': 'https://mail.google.com', 'gmail': 'https://mail.google.com', 'джимейл': 'https://mail.google.com',
  'яндекс почту': 'https://mail.yandex.ru', 'яндекс почта': 'https://mail.yandex.ru',
  'карты': 'https://yandex.ru/maps', 'яндекс карты': 'https://yandex.ru/maps', 'гугл карты': 'https://maps.google.com',
  'переводчик': 'https://translate.google.com', 'гугл переводчик': 'https://translate.google.com', 'яндекс переводчик': 'https://translate.yandex.ru',
  'википедию': 'https://ru.wikipedia.org', 'википедия': 'https://ru.wikipedia.org',
  'гитхаб': 'https://github.com', 'github': 'https://github.com', 'чат гпт': 'https://chatgpt.com', 'claude': 'https://claude.ai', 'клод': 'https://claude.ai',
  'кинопоиск': 'https://www.kinopoisk.ru', 'авито': 'https://www.avito.ru', 'озон': 'https://www.ozon.ru',
  'вайлдберриз': 'https://www.wildberries.ru', 'валберис': 'https://www.wildberries.ru', 'вб': 'https://www.wildberries.ru',
  'твич': 'https://www.twitch.tv', 'рутуб': 'https://rutube.ru', 'дзен': 'https://dzen.ru', 'хабр': 'https://habr.com',
  'нетфликс': 'https://www.netflix.com', 'пинтерест': 'https://www.pinterest.com', 'инстаграм': 'https://www.instagram.com',
  'тикток': 'https://www.tiktok.com', 'тик ток': 'https://www.tiktok.com', 'реддит': 'https://www.reddit.com',
  'твиттер': 'https://x.com', 'фейсбук': 'https://www.facebook.com', 'госуслуги': 'https://www.gosuslugi.ru',
  'яндекс музыку': 'https://music.yandex.ru', 'яндекс музыка': 'https://music.yandex.ru', 'кинопоиск hd': 'https://hd.kinopoisk.ru',
  'спортс': 'https://www.sports.ru', 'новости': 'https://news.google.com/?hl=ru&gl=RU&ceid=RU:ru', 'погоду': 'https://yandex.ru/pogoda',
  'стим сайт': 'https://store.steampowered.com', 'сбербанк': 'https://online.sberbank.ru', 'тинькофф': 'https://www.tbank.ru', 'т банк': 'https://www.tbank.ru',
};

// Если программа не установлена — откроем веб-версию.
const WEB_FALLBACK = {
  telegram: 'https://web.telegram.org', телеграм: 'https://web.telegram.org', телеграмм: 'https://web.telegram.org',
  discord: 'https://discord.com/app', дискорд: 'https://discord.com/app', spotify: 'https://open.spotify.com', спотифай: 'https://open.spotify.com',
  whatsapp: 'https://web.whatsapp.com', ватсап: 'https://web.whatsapp.com', вотсап: 'https://web.whatsapp.com',
  word: 'https://www.office.com/launch/word', ворд: 'https://www.office.com/launch/word', excel: 'https://www.office.com/launch/excel', эксель: 'https://www.office.com/launch/excel',
  steam: 'https://store.steampowered.com', стим: 'https://store.steampowered.com', zoom: 'https://app.zoom.us', зум: 'https://app.zoom.us',
};

const FOLDERS = {
  'загрузки': 'downloads', 'закачки': 'downloads', 'документы': 'documents', 'мои документы': 'documents',
  'рабочий стол': 'desktop', 'изображения': 'pictures', 'картинки': 'pictures', 'фото': 'pictures', 'фотографии': 'pictures',
  'музыку': 'music', 'музыка': 'music', 'видео': 'videos', 'домашнюю папку': 'home', 'папку пользователя': 'home',
  'скриншоты': 'pictures',
};

const WEEKDAYS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];

const JOKES = [
  'Программист ставит на тумбочку два стакана: один с водой — если захочет пить, второй пустой — если не захочет.',
  'Оптимист верит, что мы живём в лучшем из миров. Пессимист боится, что так и есть.',
  'Я бы рассказал шутку про UDP, но не уверен, что она до вас дойдёт.',
  'Компьютер обыграл человека в шахматы, но проиграл ему в кикбоксинг.',
  'Сэр, ваш пароль «123456» настолько надёжен, что его знает весь интернет.',
  'Говорят, искусственный интеллект захватит мир. Пока что я захватил только ваш микрофон.',
  'Есть десять типов людей: те, кто понимает двоичную систему, и те, кто нет.',
  'Будильник — это устройство, которое будит людей, у которых нет детей.',
  'Я не ленивый, я в режиме энергосбережения.',
  'Если долго смотреть в код, код начинает смотреть в тебя. И находить баги.',
  'Почему программисты путают Хэллоуин и Рождество? Потому что тридцать один в восьмеричной — это двадцать пять в десятичной.',
  'Лучший способ ускорить компьютер — поднять его повыше. Шутка. Не делайте так.',
];

const WEATHER_CODES = {
  0: ['ясно', '☀️'], 1: ['преимущественно ясно', '🌤️'], 2: ['переменная облачность', '⛅'], 3: ['пасмурно', '☁️'],
  45: ['туман', '🌫️'], 48: ['изморозь и туман', '🌫️'], 51: ['лёгкая морось', '🌦️'], 53: ['морось', '🌦️'], 55: ['сильная морось', '🌧️'],
  56: ['ледяная морось', '🌧️'], 57: ['ледяная морось', '🌧️'], 61: ['небольшой дождь', '🌦️'], 63: ['дождь', '🌧️'], 65: ['ливень', '🌧️'],
  66: ['ледяной дождь', '🌧️'], 67: ['ледяной дождь', '🌧️'], 71: ['небольшой снег', '🌨️'], 73: ['снег', '🌨️'], 75: ['сильный снег', '❄️'],
  77: ['снежная крупа', '🌨️'], 80: ['кратковременный дождь', '🌦️'], 81: ['ливни', '🌧️'], 82: ['сильные ливни', '⛈️'],
  85: ['снегопад', '🌨️'], 86: ['сильный снегопад', '❄️'], 95: ['гроза', '⛈️'], 96: ['гроза с градом', '⛈️'], 99: ['сильная гроза с градом', '⛈️'],
};

// ───────────────────────── утилиты ─────────────────────────

const FILLERS = /^(пожалуйста|а|ну|слушай|скажи|давай|будь добр|будь любезен|можешь|ты можешь|не мог бы ты|не могла бы ты|мне|ка|окей|ок|эй|так)\s+/;

function cleanCommand(text) {
  let t = normalize(text);
  for (let i = 0; i < 4; i++) {
    const next = t.replace(FILLERS, '');
    if (next === t) break;
    t = next;
  }
  t = t.replace(/\s+(пожалуйста|плиз|срочно)$/, '').trim();
  return wordsToNumbers(t);
}

function plural(n, one, few, many) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

export function formatDuration(sec) {
  sec = Math.round(sec);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const parts = [];
  if (h) parts.push(`${h} ${plural(h, 'час', 'часа', 'часов')}`);
  if (m) parts.push(`${m} ${plural(m, 'минуту', 'минуты', 'минут')}`);
  if (s && !h) parts.push(`${s} ${plural(s, 'секунду', 'секунды', 'секунд')}`);
  return parts.join(' ') || '0 секунд';
}

// «5 минут 30 секунд», «полчаса», «1.5 часа», «час», «минуту»
export function parseDuration(t) {
  let total = 0;
  let found = false;
  const re = /(\d+(?:\.\d+)?)\s*(час(?:а|ов)?|ч|минут(?:у|ы)?|мин|секунд(?:у|ы)?|сек)/g;
  let m;
  while ((m = re.exec(t))) {
    const n = parseFloat(m[1]);
    const u = m[2];
    found = true;
    if (u.startsWith('ч')) total += n * 3600;
    else if (u.startsWith('мин')) total += n * 60;
    else total += n;
  }
  if (/полчаса/.test(t)) { total += 1800; found = true; }
  if (/полминуты/.test(t)) { total += 30; found = true; }
  if (!found) {
    if (/(^|\s)(час)(\s|$)/.test(t)) { total = 3600; found = true; }
    else if (/(^|\s)минуту(\s|$)/.test(t)) { total = 60; found = true; }
    else if (/(^|\s)секунду(\s|$)/.test(t)) { total = 1; found = true; }
  }
  return found ? Math.round(total) : null;
}

// «7 30», «7:30», «7 утра», «8 вечера», «19 часов 15 минут»
function parseClock(t) {
  const m = t.match(/(?:в|на)\s+(\d{1,2})(?:[:.\s]+(\d{1,2}))?(?:\s*(?:час(?:а|ов)?))?(?:\s*(\d{1,2})\s*минут[а-я\w]*)?(?:\s+(утра|дня|вечера|ночи))?/);
  if (!m) return null;
  let h = +m[1];
  const min = +(m[2] || m[3] || 0);
  const part = m[4];
  if (part === 'вечера' || part === 'дня') { if (h < 12) h += 12; }
  if (part === 'ночи' && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  const d = new Date();
  d.setHours(h, min, 0, 0);
  if (d <= new Date()) d.setDate(d.getDate() + 1);
  return d;
}

// Произнесённый адрес сайта: «хабр точка ком» → habr.com
function spokenDomain(s) {
  let t = s.replace(/\s*(точка|dot)\s*/g, '.').replace(/\s+/g, '');
  if (!/\./.test(t)) return null;
  t = t.replace(/\.ру$/, '.ru').replace(/\.ком$/, '.com').replace(/\.рф$/, '.рф').replace(/\.нет$/, '.net').replace(/\.орг$/, '.org').replace(/\.ио$/, '.io');
  if (/[а-я]/.test(t.replace(/\.рф$/, ''))) t = translit(t);
  return /^[a-z0-9а-я.-]+\.[a-zа-я]{2,}$/i.test(t) ? t : null;
}

const enc = encodeURIComponent;

function calcExpression(raw) {
  let t = ' ' + raw + ' ';
  const pct = t.match(/(\d+(?:\.\d+)?)\s*процент[а-я\w]*\s+от\s+(\d+(?:\.\d+)?)/);
  if (pct) return (+pct[1] * +pct[2]) / 100;
  const sqrt = t.match(/корень\s+(?:квадратный\s+)?из\s+(\d+(?:\.\d+)?)/);
  if (sqrt) return Math.sqrt(+sqrt[1]);
  t = t
    .replace(/\s(в\s+квадрате)\s/g, ' ** 2 ')
    .replace(/\s(в\s+кубе)\s/g, ' ** 3 ')
    .replace(/\sв\s+(\d+)\s+степени\s/g, ' ** $1 ')
    .replace(/\s(плюс|прибавить|добавить|и)\s/g, ' + ')
    .replace(/\s(минус|отнять|вычесть)\s/g, ' - ')
    .replace(/\s(разделить на|делить на|поделить на|деленное на|раздели на|поделенное на)\s/g, ' / ')
    .replace(/\s(умножить на|умножить|помножить на|умноженное на|умножь на|х|x|на|раз)\s/g, ' * ')
    .replace(/скобка открывается/g, '(').replace(/скобка закрывается/g, ')')
    .replace(/\s(в\s+степени)\s/g, ' ** ')
    .replace(/,/g, '.');
  const expr = t.replace(/\s+/g, ' ').trim();
  if (!/^[\d+\-*/(). ]+$/.test(expr) || !/\d/.test(expr) || !/[+\-*/]/.test(expr)) return null;
  try {
    const v = evaluate(expr);
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

// Небольшой безопасный вычислитель: + - * / ** и скобки, без eval.
function evaluate(expr) {
  const tokens = expr.match(/\d+(?:\.\d+)?|\*\*|[+\-*/()]/g) || [];
  let i = 0;
  const peek = () => tokens[i];
  const next = () => tokens[i++];
  function primary() {
    const t = next();
    if (t === '(') { const v = sum(); if (next() !== ')') throw new Error('скобка'); return v; }
    if (t === '-') return -power();
    if (t === '+') return power();
    if (t !== undefined && /^\d/.test(t)) return parseFloat(t);
    throw new Error('ожидалось число');
  }
  function power() {
    const base = primary();
    if (peek() === '**') { next(); return base ** power(); }
    return base;
  }
  function product() {
    let v = power();
    while (peek() === '*' || peek() === '/') v = next() === '*' ? v * power() : v / power();
    return v;
  }
  function sum() {
    let v = product();
    while (peek() === '+' || peek() === '-') v = next() === '+' ? v + product() : v - product();
    return v;
  }
  const v = sum();
  if (i !== tokens.length) throw new Error('лишние символы');
  return v;
}

function formatNumber(n) {
  const r = Math.round(n * 1e6) / 1e6;
  return r.toLocaleString('ru-RU', { maximumFractionDigits: 6 });
}

function wordVariants(w) {
  const out = [w];
  if (/ем$/.test(w)) out.push(w.replace(/ем$/, 'ий'));
  if (/ом$/.test(w)) out.push(w.replace(/ом$/, 'ый'), w.replace(/ом$/, 'ой'));
  if (/ой$/.test(w)) out.push(w.replace(/ой$/, 'ая'));
  if (/е$/.test(w)) out.push(w.replace(/е$/, ''), w.replace(/е$/, 'а'), w.replace(/е$/, 'ь'));
  if (/и$/.test(w)) out.push(w.replace(/и$/, 'ь'), w.replace(/и$/, 'а'), w.replace(/и$/, 'ы'));
  if (/у$/.test(w)) out.push(w.replace(/у$/, ''));
  return out;
}

// Город в предложном падеже («в нижнем новгороде») → варианты именительного.
function cityCandidates(city) {
  let combos = [''];
  for (const w of city.trim().split(/\s+/)) {
    const next = [];
    for (const c of combos) for (const v of wordVariants(w)) next.push((c + ' ' + v).trim());
    combos = next.slice(0, 16);
  }
  return [...new Set(combos)];
}

export async function getWeather(city, opts = {}) {
  let place = null;
  for (const cand of cityCandidates(city)) {
    const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${enc(cand)}&count=1&language=ru&format=json`);
    const j = await r.json();
    if (j.results?.length) { place = j.results[0]; break; }
  }
  if (!place) throw new Error('город не найден');
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}` +
    '&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m' +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=4&wind_speed_unit=ms';
  const w = await (await fetch(url)).json();
  return { place, w, ...opts };
}

export function describeWeather(code) {
  return WEATHER_CODES[code] || ['без осадков', '🌡️'];
}

// ───────────────────────── команды ─────────────────────────

export function createCommands(ctx) {
  const { ext } = ctx;
  const act = (name, args) => ext.action(name, args);
  const say = (r, fallback) => (r?.ok === false ? r.message : r?.message || fallback);

  const greet = () => {
    const h = new Date().getHours();
    const name = ctx.settings().userName;
    const part = h < 5 ? 'Доброй ночи' : h < 12 ? 'Доброе утро' : h < 18 ? 'Добрый день' : 'Добрый вечер';
    return `${part}${name ? ', ' + name : ', сэр'}. Чем могу помочь?`;
  };

  const openSite = async (target) => {
    const key = target.replace(/^(сайт|страницу)\s+/, '').trim();
    if (SITES[key]) return say(await act('openUrl', { url: SITES[key] }), 'Открываю');
    const domain = spokenDomain(key);
    if (domain) return say(await act('openUrl', { url: domain }), 'Открываю ' + domain);
    return null;
  };

  const C = [];
  const add = (group, examples, match, run) => C.push({ group, examples, match, run });

  // ── разговор ──
  add('Общение', ['привет', 'доброе утро'], (t) => /^(привет[а-я\w]*|здравствуй[а-я\w]*|добр(ое|ый) (утро|день|вечер)|хай|хелло|доброй ночи)$/.test(t), greet);
  add('Общение', ['как дела'], (t) => /^(как (ты|дела|поживаешь|жизнь|настроение)|как у тебя дела|ты тут|ты здесь|ты меня слышишь)$/.test(t),
    () => 'Все системы работают в штатном режиме. Готов к работе.');
  add('Общение', ['кто ты', 'как тебя зовут'], (t) => /^(кто ты|ты кто|как тебя зовут|что ты такое|представься)$/.test(t),
    () => 'Я ExternalAI, ваш персональный ассистент. Управляю компьютером, отвечаю на вопросы и выполняю поручения голосом.');
  add('Общение', ['что ты умеешь'], (t) => /^(что ты умеешь|что ты можешь|помощь|справка|список команд|какие (есть )?команды)$/.test(t),
    () => { ctx.ui.openHelp(); return 'Вот что я умею. Открываю программы и сайты, ищу в интернете, управляю звуком и музыкой, ставлю таймеры, делаю скриншоты, а с подключённым ИИ — почти всё остальное.'; });
  add('Общение', ['спасибо'], (t) => /^(спасибо|благодарю|спс|отлично|молодец|супер|круто)( тебе)?( большое)?$/.test(t),
    () => ['Всегда к вашим услугам.', 'Рад помочь, сэр.', 'Обращайтесь.'][Math.floor(Math.random() * 3)]);
  add('Общение', ['меня зовут Алекс'], (t) => t.match(/^(?:меня зовут|называй меня|зови меня)\s+(.+)$/),
    async (m) => {
      const name = m[1].replace(/^./, (c) => c.toUpperCase());
      await ctx.saveSettings({ userName: name });
      return `Приятно познакомиться, ${name}.`;
    });
  add('Общение', ['расскажи шутку'], (t) => /(шутк|анекдот|пошути|рассмеши)/.test(t), () => JOKES[Math.floor(Math.random() * JOKES.length)]);
  add('Общение', ['подбрось монетку'], (t) => /(монетк|орел или решка)/.test(t), () => (Math.random() < 0.5 ? 'Орёл.' : 'Решка.'));
  add('Общение', ['брось кубик'], (t) => /(кубик|кости)/.test(t) && /(брось|кинь|подбрось)/.test(t), () => `Выпало ${1 + Math.floor(Math.random() * 6)}.`);
  add('Общение', ['случайное число от 1 до 100'], (t) => t.match(/случайное число(?: от (-?\d+))?(?: до (-?\d+))?/),
    (m) => {
      const a = m[1] ? +m[1] : 1;
      const b = m[2] ? +m[2] : 100;
      const lo = Math.min(a, b), hi = Math.max(a, b);
      return `Ваше число: ${lo + Math.floor(Math.random() * (hi - lo + 1))}.`;
    });

  // ── управление ассистентом ──
  add('Ассистент', ['стоп', 'замолчи'], (t) => /^(стоп|хватит|замолчи|тихо|молчать|помолчи|достаточно|отмена|отбой|заткнись|не надо)$/.test(t),
    () => { ctx.ui.stopSpeaking(); return { say: '', silent: true }; });
  add('Ассистент', ['повтори'], (t) => /^(повтори|еще раз|что ты сказал|не расслышал)$/.test(t), () => ctx.ui.lastAnswer() || 'Я ещё ничего не говорил.');
  add('Ассистент', ['открой настройки ассистента'], (t) => /(твои|свои) настройки|настройки (ассистента|программы|экстернал|джарвиса)/.test(t),
    () => { ctx.ui.openSettings(); return 'Открываю настройки.'; });
  add('Ассистент', ['проверь обновления'], (t) => /(провер[а-я\w]* обновлени|обнови(сь)?( себя)?$|есть ли обновлени)/.test(t),
    async () => { await ext.update.check(); return 'Проверяю обновления.'; });
  add('Ассистент', ['новый диалог'], (t) => /(очисти (чат|журнал|историю)|новый диалог|забудь (наш )?разговор|начни (сначала|заново))/.test(t),
    async () => { await ctx.ui.clearLog(); return 'Начинаем с чистого листа.'; });
  add('Ассистент', ['не слушай'], (t) => /^(не слушай|перестань слушать|выключи микрофон|отключи микрофон|режим тишины)$/.test(t),
    () => { ctx.ui.setEars(false); return 'Микрофон отключён. Включить его можно кнопкой «Слух».'; });
  add('Ассистент', ['пока'], (t) => /^(пока|до свидания|отдыхай|свободен|можешь идти|спокойной ночи)$/.test(t),
    () => { setTimeout(() => ctx.ui.hideWindow(), 2500); return 'До связи, сэр. Я буду рядом.'; });
  add('Окна', ['сверни окно'], (t) => /^(сверни(сь)?|спрячься|скройся)( окно)?$/.test(t), () => { setTimeout(() => ctx.ui.hideWindow(), 900); return 'Сворачиваюсь.'; });
  add('Окна', ['разверни окно'], (t) => /^(разверни(сь)?|покажись|на весь экран)( окно)?$/.test(t), () => { ctx.ui.maximize(); return 'Готово.'; });
  add('Окна', ['сверни все окна'], (t) => /(сверни все окна|покажи рабочий стол)/.test(t), async () => say(await act('minimizeAll'), 'Сворачиваю все окна'));

  // ── время и дата ──
  add('Время', ['сколько времени', 'который час'], (t) => /(сколько (сейчас )?времени|который (сейчас )?час|^время$|точное время|сколько время)/.test(t),
    () => {
      const d = new Date();
      return `Сейчас ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}.`;
    });
  add('Время', ['какое сегодня число', 'какой день недели'], (t) => /(какое (сегодня )?число|какая (сегодня )?дата|какой (сегодня )?день|день недели|сегодняшняя дата)/.test(t),
    () => {
      const d = new Date();
      return `Сегодня ${WEEKDAYS[d.getDay()]}, ${d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}.`;
    });

  // ── таймеры и напоминания ──
  add('Таймеры', ['отмени таймеры'], (t) => /(отмени|удали|сбрось|выключи|останови) (все )?(таймер|таймеры|будильник|напоминани)/.test(t),
    () => { const n = ctx.timers.clear(); return n ? 'Все таймеры отменены.' : 'Активных таймеров нет.'; });
  add('Таймеры', ['сколько осталось'], (t) => /(сколько (осталось|еще)|когда (сработает|зазвонит))/.test(t) && !/(батаре|заряд|памят)/.test(t),
    () => {
      const list = ctx.timers.list();
      if (!list.length) return 'Активных таймеров нет.';
      return list.map((x) => `${x.label ? x.label + ': ' : ''}осталось ${formatDuration(x.left)}`).join('. ') + '.';
    });
  add('Таймеры', ['напомни через 10 минут выключить чайник'], (t) => t.match(/^напомни(?:\s+мне)?\s+(.+)$/),
    (m) => {
      const rest = m[1];
      const clock = /^(завтра )?в \d/.test(rest) || /\sв \d{1,2}(\s|:|$)/.test(rest) ? parseClock(rest) : null;
      const dur = clock ? null : parseDuration(rest);
      const label = rest
        .replace(/через\s+[\d.\s]*(час[а-я\w]*|ч|минут[а-я\w]*|мин|секунд[а-я\w]*|сек|полчаса|полминуты)(\s+и?\s*[\d.]+\s*(минут[а-я\w]*|секунд[а-я\w]*))?/g, '')
        .replace(/(?:в|на)\s+\d{1,2}(?:[:.\s]+\d{1,2})?(?:\s*час[а-я\w]*)?(?:\s+(утра|дня|вечера|ночи))?/g, '')
        .replace(/^(что|о том что|про|о)\s+/, '').replace(/^\s*(нужно|надо)\s+/, '').trim();
      if (clock) {
        ctx.timers.add((clock - Date.now()) / 1000, label || 'Напоминание');
        return `Напомню в ${clock.getHours()}:${String(clock.getMinutes()).padStart(2, '0')}${label ? ': ' + label : ''}.`;
      }
      if (!dur) return null;
      ctx.timers.add(dur, label || 'Напоминание');
      return `Хорошо, напомню через ${formatDuration(dur)}${label ? ': ' + label : ''}.`;
    });
  add('Таймеры', ['поставь таймер на 5 минут'], (t) => /(таймер|засеки|отсчет)/.test(t) && parseDuration(t) !== null,
    (t) => {
      const sec = parseDuration(t);
      const label = (t.match(/(?:для|на)\s+([а-я ]+?)\s*$/) || [])[1];
      ctx.timers.add(sec, label && !/(минут|секунд|час)/.test(label) ? label : 'Таймер');
      return `Таймер на ${formatDuration(sec)} запущен.`;
    });
  add('Таймеры', ['разбуди меня в 7 30', 'будильник на 8 утра'], (t) => /(будильник|разбуди)/.test(t) && parseClock(t),
    (t) => {
      const d = parseClock(t);
      ctx.timers.add((d - Date.now()) / 1000, 'Будильник', true);
      const tomorrow = d.getDate() !== new Date().getDate();
      return `Будильник установлен на ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}${tomorrow ? ' завтра' : ''}.`;
    });

  // ── заметки ──
  add('Заметки', ['запомни, что ключи в куртке'], (t) => t.match(/^(?:запомни|запиши|сделай заметку|добавь заметку|заметка|запиши себе)(?:\s+что)?\s+(.+)$/),
    async (m) => { await ctx.notes.add(m[1]); return 'Записал.'; });
  add('Заметки', ['прочитай заметки'], (t) => /((прочитай|покажи|мои|какие) заметки|что ты (запомнил|записал)|что я просил запомнить)/.test(t),
    async () => {
      const list = ctx.notes.list();
      return list.length ? 'Ваши заметки: ' + list.map((n, i) => `${i + 1}. ${n.text}`).join('. ') : 'Заметок пока нет.';
    });
  add('Заметки', ['удали заметки'], (t) => /(удали|очисти|сотри) (все )?заметки/.test(t), async () => { await ctx.notes.clear(); return 'Заметки удалены.'; });

  // ── громкость и медиа ──
  add('Звук', ['громче', 'сделай громче на 20'], (t) => /^(сделай )?(по)?громче|прибавь (звук|громкость)|увеличь (звук|громкость)/.test(t),
    async (t) => say(await act('volume', { action: 'up', amount: +(t.match(/(\d+)/) || [])[1] || 10 }), 'Громче'));
  add('Звук', ['тише', 'сделай тише'], (t) => /^(сделай )?(по)?тише|убавь (звук|громкость)|уменьши (звук|громкость)/.test(t),
    async (t) => say(await act('volume', { action: 'down', amount: +(t.match(/(\d+)/) || [])[1] || 10 }), 'Тише'));
  add('Звук', ['громкость 50'], (t) => t.match(/громкость (?:на )?(\d{1,3})|(максимальная|полная) громкость/),
    async (m) => say(await act('volume', { action: 'set', amount: m[1] ? Math.min(100, +m[1]) : 100 }), 'Готово'));
  add('Звук', ['выключи звук'], (t) => /^(выключи|отключи|убери) звук|^без звука$|^мьют$/.test(t), async () => say(await act('volume', { action: 'mute' }), 'Звук выключен'));
  add('Звук', ['включи звук'], (t) => /^(включи|верни) звук$/.test(t), async () => say(await act('volume', { action: 'unmute' }), 'Звук включён'));
  add('Музыка', ['пауза', 'продолжи'], (t) => /^(пауза|поставь на паузу|на паузу|продолжи[а-я\w]*|продолжай|играй|воспроизведение|сними с паузы|включи музыку|останови (музыку|видео)|выключи музыку|стоп музыка)$/.test(t),
    async () => say(await act('media', { action: 'playpause' }), 'Готово'));
  add('Музыка', ['следующий трек'], (t) => /(следующ[а-я\w]+ (трек|песн[а-я\w]*|видео)|переключи (трек|песню)|дальше|пропусти( трек| песню)?|некст)$/.test(t),
    async () => say(await act('media', { action: 'next' }), 'Следующий'));
  add('Музыка', ['предыдущий трек'], (t) => /(предыдущ[а-я\w]+ (трек|песн[а-я\w]*|видео)|верни (трек|песню)|прошл[а-я\w]+ (трек|песн[а-я\w]*))$/.test(t),
    async () => say(await act('media', { action: 'prev' }), 'Предыдущий'));

  // ── поиск ──
  add('Поиск', ['найди на ютубе котиков', 'включи на ютубе lo-fi'], (t) => t.match(/^(?:найди|поищи|включи|поставь|открой|покажи)\s+(?:на|в)\s+(?:ютубе|youtube|ютьюбе)\s+(.+)$/) || t.match(/^(?:включи|поставь|найди)\s+(?:видео|клип|ролик)?\s*(.+?)\s+(?:на|в)\s+(?:ютубе|youtube|ютьюбе)$/),
    async (m) => say(await act('openUrl', { url: `https://www.youtube.com/results?search_query=${enc(m[1])}` }), 'Ищу на YouTube'));
  add('Поиск', ['включи песню Imagine Dragons'], (t) => t.match(/^(?:включи|поставь)\s+(?:песню|музыку|трек|альбом)\s+(.+)$/),
    async (m) => say(await act('openUrl', { url: `https://www.youtube.com/results?search_query=${enc(m[1])}` }), `Ищу ${m[1]}`));
  add('Поиск', ['найди в яндексе рецепт борща'], (t) => t.match(/^(?:найди|поищи|загугли)\s+(?:в|на)\s+яндексе\s+(.+)$/),
    async (m) => say(await act('openUrl', { url: `https://ya.ru/search/?text=${enc(m[1])}` }), 'Ищу в Яндексе'));
  add('Поиск', ['найди на википедии Тесла'], (t) => t.match(/^(?:найди|поищи|открой)\s+(?:в|на)\s+википеди[а-я\w]+\s+(.+)$/),
    async (m) => say(await act('openUrl', { url: `https://ru.wikipedia.org/w/index.php?search=${enc(m[1])}` }), 'Открываю Википедию'));
  add('Поиск', ['покажи на карте Красная площадь', 'маршрут до аэропорта'], (t) => t.match(/^(?:покажи на карте|найди на карте|где находится|маршрут до|как доехать до|проложи маршрут до)\s+(.+)$/),
    async (m) => say(await act('openUrl', { url: `https://yandex.ru/maps/?text=${enc(m[1])}` }), 'Открываю карту'));
  add('Поиск', ['найди рецепт пиццы', 'загугли курс доллара'], (t) => t.match(/^(?:найди|поищи|загугли|погугли|ищи|поиск|найди в интернете|поищи в интернете|найди в гугле)\s+(?:в интернете\s+|в гугле\s+)?(.+)$/),
    async (m) => say(await act('openUrl', { url: `https://www.google.com/search?q=${enc(m[1])}` }), `Ищу: ${m[1]}`));

  // ── погода ──
  add('Погода', ['какая погода', 'погода в Казани завтра'], (t) => /погод|температур[а-я\w]* (на улице|за окном)|холодно ли|нужен ли зонт|какая на улице/.test(t),
    async (t) => {
      const m = t.match(/(?:в|во)\s+([а-яa-z-]+(?:\s+[а-яa-z-]+)?)(?:\s+(?:завтра|сегодня|послезавтра))?\s*$/);
      const spoken = m ? m[1].replace(/\s+(завтра|сегодня|послезавтра)$/, '') : '';
      const city = spoken && !/^(субботу|воскресенье|понедельник|выходные)$/.test(spoken) ? spoken : ctx.settings().system.city;
      const dayIdx = /послезавтра/.test(t) ? 2 : /завтра/.test(t) ? 1 : 0;
      try {
        const { place, w } = await getWeather(city);
        if (dayIdx === 0) {
          const c = w.current;
          const [desc] = describeWeather(c.weather_code);
          return `В городе ${place.name} сейчас ${Math.round(c.temperature_2m)}°, ${desc}. Ощущается как ${Math.round(c.apparent_temperature)}°, ветер ${Math.round(c.wind_speed_10m)} метров в секунду.`;
        }
        const d = w.daily;
        const [desc] = describeWeather(d.weather_code[dayIdx]);
        const rain = d.precipitation_probability_max?.[dayIdx];
        return `${dayIdx === 1 ? 'Завтра' : 'Послезавтра'} в городе ${place.name} от ${Math.round(d.temperature_2m_min[dayIdx])}° до ${Math.round(d.temperature_2m_max[dayIdx])}°, ${desc}${rain != null ? `, вероятность осадков ${rain} процентов` : ''}.`;
      } catch {
        return `Не удалось получить погоду для «${city}».`;
      }
    });

  // ── калькулятор ──
  add('Калькулятор', ['сколько будет 25 умножить на 4'], (t) => {
    const m = t.match(/^(?:сколько будет|посчитай|вычисли|реши|подсчитай|сколько)\s+(.+)$/);
    if (!m) return null;
    const v = calcExpression(m[1].replace(/\?$/, ''));
    return v === null ? null : { v };
  }, ({ v }) => `Получается ${formatNumber(v)}.`);

  // ── система ──
  add('Система', ['загрузка процессора', 'сколько памяти'], (t) => /(загрузк[а-я\w]* (процессора|системы|компьютера)|состояние (системы|компьютера)|сколько (оперативки|памяти|оперативной памяти)|как (себя чувствует|дела у) компьютер[а-я\w]*)/.test(t),
    async () => {
      const s = await act('systemInfo');
      return `Процессор загружен на ${s.cpu} процентов, занято ${s.memUsedGB} из ${s.memTotalGB} гигабайт памяти.`;
    });
  add('Система', ['заряд батареи'], (t) => /(батаре|заряд)/.test(t),
    async () => {
      if (!navigator.getBattery) return 'Не могу узнать заряд батареи.';
      const b = await navigator.getBattery();
      if (b.charging && b.level === 1) return 'Батарея заряжена полностью.';
      return `Заряд ${Math.round(b.level * 100)} процентов${b.charging ? ', идёт зарядка' : ''}.`;
    });
  add('Система', ['сделай скриншот'], (t) => /(скриншот|снимок экрана|скрин экрана|сфоткай экран)/.test(t),
    async () => say(await act('screenshot'), 'Скриншот готов'));
  add('Система', ['напечатай привет мир'], (t) => t.match(/^(?:напечатай|набери|введи|впиши|напиши текст)\s+(?:текст\s+)?(.+)$/),
    async (m) => say(await act('typeText', { text: m[1] }), 'Напечатал'));
  add('Система', ['скопируй в буфер привет'], (t) => t.match(/^скопируй(?:\s+в буфер(?: обмена)?)?\s+(.+)$/),
    async (m) => say(await act('copyText', { text: m[1] }), 'Скопировал'));

  // ── питание ──
  const powerCmd = (action, question) => async (t) => {
    const delay = parseDuration(t) || 0;
    const yes = await ctx.ui.confirm({ title: question, text: delay ? `Через ${formatDuration(delay)}` : 'Действие выполнится сразу', details: '' });
    if (!yes) return 'Отменено.';
    return say(await act('power', { action, delay }), 'Выполняю');
  };
  add('Питание', ['выключи компьютер', 'выключи компьютер через 30 минут'], (t) => /(выключи|отключи|заверши работу)\s*(компьютер|пк|комп|систему|ноутбук)|выключение компьютера/.test(t), powerCmd('shutdown', 'Выключить компьютер?'));
  add('Питание', ['перезагрузи компьютер'], (t) => /(перезагрузи|перезапусти)\s*(компьютер|пк|комп|систему|ноутбук)|^перезагрузка$/.test(t), powerCmd('restart', 'Перезагрузить компьютер?'));
  add('Питание', ['спящий режим'], (t) => /(спящий режим|режим сна|в сон|усыпи компьютер|переведи компьютер в сон)/.test(t), powerCmd('sleep', 'Перевести компьютер в сон?'));
  add('Питание', ['заблокируй компьютер'], (t) => /^(заблокируй|блокировка)\s*(компьютер|пк|экран|систему)?$/.test(t), async () => say(await act('power', { action: 'lock' }), 'Блокирую'));
  add('Питание', ['отмени выключение'], (t) => /отмени (выключение|перезагрузку)/.test(t), async () => say(await act('power', { action: 'cancel' }), 'Отменено'));

  // ── папки ──
  add('Файлы', ['открой загрузки', 'открой документы'], (t) => {
    const m = t.match(/^(?:открой|покажи|зайди в)\s+(?:папку\s+)?(.+)$/);
    return m && FOLDERS[m[1]] ? FOLDERS[m[1]] : null;
  }, async (key) => say(await act('openPath', { path: key }), 'Открываю'));

  // ── закрыть программу ──
  add('Программы', ['закрой блокнот'], (t) => t.match(/^(?:закрой|заверши|выключи|убей|выруби)\s+(?:программу|приложение|процесс)?\s*(.+)$/),
    async (m) => {
      const r = await act('closeApp', { name: m[1] });
      return r.ok ? r.message : { fallthrough: true, message: r.message };
    });

  // ── открыть сайт / программу ──
  add('Программы', ['открой ютуб', 'запусти телеграм', 'открой сайт хабр точка ком'], (t) => t.match(/^(?:открой|запусти|включи|зайди на|перейди на|покажи|открыть|запустить)\s+(.+)$/),
    async (m) => {
      const target = m[1].replace(/^(программу|приложение|игру)\s+/, '');
      const site = await openSite(target);
      if (site) return site;
      const r = await act('openApp', { name: target });
      if (r.ok) return r.message;
      const web = WEB_FALLBACK[target] || WEB_FALLBACK[translit(target)];
      if (web) return say(await act('openUrl', { url: web }), 'Открываю веб-версию');
      return { fallthrough: true, message: r.message };
    });

  // ── вопросы без ИИ: Википедия / переводчик ──
  add('Поиск', ['что такое квазар'], (t) => !ctx.hasAI() && t.match(/^(?:что такое|кто такой|кто такая|кто такие|что значит)\s+(.+)$/),
    async (m) => say(await act('openUrl', { url: `https://ru.wikipedia.org/w/index.php?search=${enc(m[1])}` }), `Ищу в Википедии: ${m[1]}`));
  add('Поиск', ['переведи на английский привет'], (t) => !ctx.hasAI() && t.match(/^переведи(?:\s+на\s+(английский|немецкий|французский|испанский|китайский|русский))?\s+(.+)$/),
    async (m) => {
      const langs = { английский: 'en', немецкий: 'de', французский: 'fr', испанский: 'es', китайский: 'zh-CN', русский: 'ru' };
      return say(await act('openUrl', { url: `https://translate.google.com/?sl=auto&tl=${langs[m[1]] || 'en'}&text=${enc(m[2])}&op=translate` }), 'Открываю переводчик');
    });

  // ───────────────────────── обработка ─────────────────────────

  async function runOne(text) {
    const t = cleanCommand(text);
    if (!t) return { handled: true, say: '', silent: true };
    for (const cmd of C) {
      const m = cmd.match(t);
      if (!m) continue;
      const res = await cmd.run(m === true ? t : m, t);
      if (res === null || res === undefined) continue;
      if (typeof res === 'object' && res.fallthrough) return { handled: false, hint: res.message, text: t };
      if (typeof res === 'object') return { handled: true, ...res };
      return { handled: true, say: res };
    }
    return { handled: false, text: t };
  }

  async function handle(text) {
    // «открой ютуб, а потом сделай громче» — несколько команд подряд
    const parts = normalize(text).split(/\s+(?:а потом|и потом|затем|после этого)\s+/).filter(Boolean);
    if (parts.length > 1) {
      const answers = [];
      for (const p of parts) {
        const r = await runOne(p);
        if (!r.handled) return runOne(text); // не всё понятно — отдадим целиком
        if (r.say) answers.push(r.say);
      }
      return { handled: true, say: answers.join(' ') };
    }
    return runOne(text);
  }

  function help() {
    const groups = {};
    for (const c of C) (groups[c.group] ||= []).push(...c.examples);
    return groups;
  }

  return { handle, help };
}
