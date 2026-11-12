// Движок русских голосовых команд. Всё, что не распознано здесь, уходит в ИИ.
import { cleanCommand, guessIntent, phraseSimilarity, parseTeach, canonVerb, VERBS } from './nlu.js';
import { catalogRules, catalogStats } from './catalog.js';

const { normalize, translit } = window.TextUtils;
export { cleanCommand };

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
  'скриншоты': 'screenshots', 'папку со скриншотами': 'screenshots',
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
  t = String(t);
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
export function parseClock(t) {
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

// ───────────────────────── ещё справочники ─────────────────────────

const CITY_TZ = [
  [/^(москв|мск)/, 'Europe/Moscow', 'Москве'], [/^(питер|санкт|петербург|спб)/, 'Europe/Moscow', 'Петербурге'],
  [/^лондон/, 'Europe/London', 'Лондоне'], [/^париж/, 'Europe/Paris', 'Париже'], [/^берлин/, 'Europe/Berlin', 'Берлине'],
  [/^рим/, 'Europe/Rome', 'Риме'], [/^мадрид/, 'Europe/Madrid', 'Мадриде'], [/^(нью йорк|нью-йорк|ньюйорк)/, 'America/New_York', 'Нью-Йорке'],
  [/^(лос анджелес|лос-анджелес)/, 'America/Los_Angeles', 'Лос-Анджелесе'], [/^чикаго/, 'America/Chicago', 'Чикаго'],
  [/^торонто/, 'America/Toronto', 'Торонто'], [/^токио/, 'Asia/Tokyo', 'Токио'], [/^пекин/, 'Asia/Shanghai', 'Пекине'],
  [/^шанха/, 'Asia/Shanghai', 'Шанхае'], [/^сеул/, 'Asia/Seoul', 'Сеуле'], [/^бангкок/, 'Asia/Bangkok', 'Бангкоке'],
  [/^дуба/, 'Asia/Dubai', 'Дубае'], [/^стамбул/, 'Europe/Istanbul', 'Стамбуле'], [/^(киев|кие)/, 'Europe/Kyiv', 'Киеве'],
  [/^минск/, 'Europe/Minsk', 'Минске'], [/^(астан|алмат|казахстан)/, 'Asia/Almaty', 'Казахстане'], [/^ташкент/, 'Asia/Tashkent', 'Ташкенте'],
  [/^тбилис/, 'Asia/Tbilisi', 'Тбилиси'], [/^ереван/, 'Asia/Yerevan', 'Ереване'], [/^баку/, 'Asia/Baku', 'Баку'],
  [/^новосибирск/, 'Asia/Novosibirsk', 'Новосибирске'], [/^екатеринбург/, 'Asia/Yekaterinburg', 'Екатеринбурге'],
  [/^владивосток/, 'Asia/Vladivostok', 'Владивостоке'], [/^калининград/, 'Europe/Kaliningrad', 'Калининграде'],
  [/^(самар|ижевск)/, 'Europe/Samara', 'Самаре'], [/^(омск)/, 'Asia/Omsk', 'Омске'], [/^(красноярск)/, 'Asia/Krasnoyarsk', 'Красноярске'],
  [/^(иркутск)/, 'Asia/Irkutsk', 'Иркутске'], [/^(якутск)/, 'Asia/Yakutsk', 'Якутске'], [/^(хабаровск)/, 'Asia/Vladivostok', 'Хабаровске'],
  [/^(камчатк|петропавловск)/, 'Asia/Kamchatka', 'на Камчатке'], [/^сидне/, 'Australia/Sydney', 'Сиднее'], [/^(дели|инди)/, 'Asia/Kolkata', 'Индии'],
  [/^(амстердам)/, 'Europe/Amsterdam', 'Амстердаме'], [/^(прага|праге)/, 'Europe/Prague', 'Праге'], [/^(варшав)/, 'Europe/Warsaw', 'Варшаве'],
  [/^(сочи)/, 'Europe/Moscow', 'Сочи'], [/^(казан)/, 'Europe/Moscow', 'Казани'], [/^(америк|сша)/, 'America/New_York', 'Нью-Йорке'],
];

const CURRENCIES = [
  [/доллар|бакс|usd/, 'USD', 'доллар'], [/евро|eur/, 'EUR', 'евро'], [/юан|cny/, 'CNY', 'юань'], [/фунт/, 'GBP', 'фунт'],
  [/тенге/, 'KZT', 'тенге'], [/лир/, 'TRY', 'лира'], [/иен|йен/, 'JPY', 'иена'], [/франк/, 'CHF', 'франк'],
  [/гривн|гривен/, 'UAH', 'гривна'], [/белорус/, 'BYN', 'белорусский рубль'], [/дирхам/, 'AED', 'дирхам'], [/вон/, 'KRW', 'вона'],
];

// Голосовые названия клавиш → комбинация.
const KEYMAP = [
  [/^(нажми )?(энтер|ввод|enter|интер)( \d+ раз[а]?)?$/, 'enter'], [/^(нажми )?пробел( \d+ раз[а]?)?$/, 'space'],
  [/^(нажми )?(эскейп|escape|esc|эскейб)$/, 'esc'], [/^(нажми )?(таб|tab)( \d+ раз[а]?)?$/, 'tab'],
  [/^(переключи окно|следующее окно|смени окно|альт таб|переключись на другое окно)$/, 'alt+tab'],
  [/^(новая вкладка|открой новую вкладку|новую вкладку)$/, 'ctrl+t'], [/^(закрой вкладку|закрой эту вкладку)$/, 'ctrl+w'],
  [/^(верни|восстанови|открой) (закрытую|последнюю закрытую) вкладку$|^верни вкладку$/, 'ctrl+shift+t'],
  [/^(следующая вкладка|вкладка вперед|переключи вкладку)$/, 'ctrl+tab'], [/^(предыдущая вкладка|вкладка назад)$/, 'ctrl+shift+tab'],
  [/^(обнови|обнови страницу|перезагрузи страницу|обнови вкладку)$/, 'f5'],
  [/^(назад|вернись назад|страница назад|предыдущая страница)$/, 'alt+left'], [/^(вперед|страница вперед|следующая страница)$/, 'alt+right'],
  [/^((прокрути|листай|пролистай|мотай|крути) ?(вниз)?|ниже)$/, 'pagedown'], [/^((прокрути|листай|пролистай|мотай|крути) вверх|выше)$/, 'pageup'],
  [/^(в начало( страницы)?|наверх|в самый верх)$/, 'home'], [/^(в конец( страницы)?|в самый низ)$/, 'end'],
  [/^сохрани( файл| документ| это)?$/, 'ctrl+s'], [/^(отмени действие|отмени последнее действие|верни как было|контрол з)$/, 'ctrl+z'],
  [/^(повтори действие|верни обратно)$/, 'ctrl+y'], [/^(выдели все|выделить все|выдели весь текст)$/, 'ctrl+a'],
  [/^скопируй( это| выделенное| текст)?$/, 'ctrl+c'], [/^(вставь|вставить)( текст| из буфера| это)?$/, 'ctrl+v'], [/^вырежи( это| выделенное)?$/, 'ctrl+x'],
  [/^(на весь экран|полноэкранный режим|полный экран|выйди из полноэкранного режима)$/, 'f11'],
  [/^(увеличь масштаб|приблизь|крупнее|сделай крупнее)$/, 'ctrl+plus'], [/^(уменьши масштаб|отдали|мельче|сделай мельче)$/, 'ctrl+minus'],
  [/^(сбрось масштаб|обычный масштаб)$/, 'ctrl+0'], [/^(распечатай|печать|напечатай страницу)$/, 'ctrl+p'],
  [/^(новое окно)$/, 'ctrl+n'], [/^(режим инкогнито|инкогнито|открой инкогнито)$/, 'ctrl+shift+n'],
  [/^(окно выполнить|выполнить)$/, 'win+r'], [/^(история буфера|журнал буфера обмена)$/, 'win+v'],
  [/^(открой проводник клавишами|вин е)$/, 'win+e'], [/^(поиск по странице|найди на странице)$/, 'ctrl+f'],
  [/^(удали|удалить|делит)$/, 'delete'], [/^(стрелка вверх)$/, 'up'], [/^(стрелка вниз)$/, 'down'], [/^(стрелка влево|влево)$/, 'left'], [/^(стрелка вправо|вправо)$/, 'right'],
];

// Русские названия клавиш для «нажми контрол шифт т».
const KEY_WORDS = {
  контрол: 'ctrl', контроль: 'ctrl', ctrl: 'ctrl', альт: 'alt', alt: 'alt', шифт: 'shift', shift: 'shift', вин: 'win', виндовс: 'win', win: 'win',
  энтер: 'enter', ввод: 'enter', пробел: 'space', таб: 'tab', эскейп: 'esc', делит: 'delete', бэкспейс: 'backspace',
  вверх: 'up', вниз: 'down', влево: 'left', вправо: 'right', хоум: 'home', энд: 'end', плюс: 'plus', минус: 'minus',
};

// Как произносят латинские буквы.
const LETTER_NAMES = {
  эй: 'a', би: 'b', си: 'c', це: 'c', ди: 'd', дэ: 'd', и: 'e', эф: 'f', джи: 'g', же: 'g', эйч: 'h', аш: 'h', ай: 'i', джей: 'j', жи: 'j',
  кей: 'k', ка: 'k', эль: 'l', эм: 'm', эн: 'n', оу: 'o', пи: 'p', пэ: 'p', кью: 'q', ку: 'q', ар: 'r', эр: 'r', эс: 's', ти: 't', тэ: 't',
  ю: 'u', вэ: 'v', ви: 'v', дабл: 'w', икс: 'x', игрек: 'y', уай: 'y', зет: 'z', зед: 'z',
};

const FACTS = [
  'Мёд не портится: археологи находили съедобный мёд возрастом три тысячи лет.',
  'У осьминога три сердца и голубая кровь.',
  'Первый компьютерный баг был настоящим насекомым — мотыльком, застрявшим в реле в 1947 году.',
  'Свету от Солнца нужно около восьми минут, чтобы долететь до Земли.',
  'Бананы — ягоды, а клубника — нет.',
  'Эйфелева башня летом становится выше примерно на пятнадцать сантиметров из-за теплового расширения.',
  'В космосе нельзя заплакать по-настоящему: слёзы не стекают, а собираются шариком у глаза.',
  'Акулы старше деревьев: они появились около четырёхсот миллионов лет назад.',
  'У человека и банана примерно половина общих генов.',
  'Самая короткая война в истории длилась около сорока минут.',
];

const LEARNABLE = new Set(['open_url', 'open_app', 'close_app', 'open_path', 'set_volume', 'media_control', 'take_screenshot',
  'press_keys', 'window_control', 'set_brightness', 'open_settings_page', 'set_timer', 'create_item']);

// Что можно повторить словом «ещё».
const REPEATABLE = new Set(['Звук', 'Музыка', 'Яркость', 'Клавиши', 'Развлечения', 'Окна']);

const pad2 = (n) => String(n).padStart(2, '0');

// ───────────────────────── команды ─────────────────────────

export function createCommands(ctx) {
  const { ext } = ctx;
  const act = (name, args) => ext.action(name, args);
  const say = (r, fallback) => (r?.ok === false ? r.message : r?.message || fallback);

  // Короткая память разговора и обучение.
  const memory = {
    last: null,            // { text, group } — последняя выполненная команда
    lastLearnedId: null,   // если последняя команда пришла из выученного
    lastPhrase: '',        // последняя фраза пользователя
    pendingCorrection: '', // фраза, которую пользователь просил исправить
    stopwatch: 0,
  };

  const learned = () => ctx.learning.list();
  async function saveLearned(list) {
    await ctx.learning.save(list.slice(-500));
  }
  async function addLearned(entry) {
    const list = learned().filter((e) => e.phrase !== entry.phrase);
    list.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), uses: 0, at: Date.now(), ...entry });
    await saveLearned(list);
  }
  function findLearned(t) {
    let best = null;
    for (const e of learned()) {
      if (e.phrase === t) return e;
      // Фразы с числами — только точное совпадение («таймер на 5» ≠ «таймер на 6»).
      if (/\d/.test(t) || /\d/.test(e.phrase) || t.length < 5) continue;
      const s = phraseSimilarity(t, e.phrase);
      if (s >= 0.86 && (!best || s > best.s)) best = { ...e, s };
    }
    return best;
  }

  const greet = () => {
    const h = new Date().getHours();
    const name = ctx.settings().userName;
    const part = h < 5 ? 'Доброй ночи' : h < 12 ? 'Доброе утро' : h < 18 ? 'Добрый день' : 'Добрый вечер';
    return `${part}${name ? ', ' + name : ', сэр'}. Чем могу помочь?`;
  };

  const openSite = async (target) => {
    const key = target.replace(/^(сайт|страницу|страничку)\s+/, '').trim();
    if (SITES[key]) return say(await act('openUrl', { url: SITES[key] }), 'Открываю');
    const domain = spokenDomain(key);
    if (domain) return say(await act('openUrl', { url: domain }), 'Открываю ' + domain);
    if (/^(сайт|страницу)\s+/.test(target)) {
      // «открой сайт сбербанка» — сразу первый результат поиска
      return say(await act('openUrl', { url: `https://duckduckgo.com/?q=${enc('!ducky ' + key)}` }), `Открываю сайт «${key}»`);
    }
    return null;
  };

  const C = [];
  const add = (group, examples, match, run) => C.push({ group, examples, match, run });

  // ═════════════ обучение (раньше всего остального) ═════════════
  add('Обучение', ['когда я говорю рабочий режим открой телеграм и почту', 'научись: кино — открой кинопоиск и сделай громче'],
    (t) => t.match(/^(?:когда я (?:говорю|скажу)|если я (?:говорю|скажу)|на (?:фразу|слова?|команду)|научись(?: команде)?|выучи(?: команду)?|запомни команду|создай команду|новая команда|добавь команду)[:\s]+(.+)$/),
    async (m) => {
      // Берём исходный текст: в нём сохранились запятые между действиями.
      const raw = (memory.raw || '').match(/(?:когда я (?:говорю|скажу)|если я (?:говорю|скажу)|на (?:фразу|слова?|команду)|научись(?: команде)?|выучи(?: команду)?|запомни команду|создай команду|новая команда|добавь команду)[:\s]+(.+)$/);
      const parsed = parseTeach(raw ? raw[1].replace(/[«»"]/g, '').trim() : m[1]);
      if (!parsed) return 'Не понял, чему научиться. Скажите, например: когда я говорю «рабочий режим», открой телеграм и почту.';
      const phrase = cleanCommand(parsed.phrase);
      await addLearned({ phrase, kind: 'alias', commands: parsed.actions });
      return `Запомнил. На фразу «${phrase}» я буду: ${parsed.actions.join(', ')}.`;
    });
  add('Обучение', ['забудь команду рабочий режим'], (t) => t.match(/^(?:забудь|удали|сотри) (?:команду|фразу)\s+(.+)$/),
    async (m) => {
      const q = cleanCommand(m[1]);
      const list = learned();
      const hit = list.find((e) => e.phrase === q) || list.find((e) => phraseSimilarity(q, e.phrase) >= 0.8);
      if (!hit) return `Я не знаю команды «${q}».`;
      await saveLearned(list.filter((e) => e.id !== hit.id));
      return `Забыл команду «${hit.phrase}».`;
    });
  add('Обучение', ['что ты выучил'], (t) => /^(что ты (выучил|запомнил из команд|умеешь из выученного)|какие команды ты (выучил|знаешь)|мои команды|выученные команды|список выученного)$/.test(t),
    () => {
      const list = learned();
      if (!list.length) return 'Пока ничего. Научите меня: скажите «когда я говорю …, сделай …» — или просто пользуйтесь ИИ, я запоминаю его действия сам.';
      ctx.ui.openSettings('learning');
      return `Я выучил ${list.length} ${plural(list.length, 'команду', 'команды', 'команд')}. Например: ${list.slice(-3).map((e) => '«' + e.phrase + '»').join(', ')}.`;
    });
  add('Обучение', ['забудь всё выученное'], (t) => /^(забудь все выученное|сбрось обучение|забудь все команды|очисти обучение)$/.test(t),
    async () => { await saveLearned([]); return 'Всё выученное стёрто.'; });
  add('Обучение', ['не то', 'неправильно'], (t) => /^(не то|не тот|неправильно|не правильно|не так|ты не понял|ты ошибся|ошибся|я не это имел в виду|я не это просил|ошибка|неверно|не верно|не туда)$/.test(t),
    async () => {
      const wrong = memory.lastPhrase;
      if (!wrong) return 'А что именно было не так?';
      if (memory.lastLearnedId) await saveLearned(learned().filter((e) => e.id !== memory.lastLearnedId));
      memory.pendingCorrection = wrong;
      return `Понял, исправлюсь. Что нужно было сделать на «${wrong}»?`;
    });
  add('Обучение', ['запомни обо мне: я люблю рок'], (t) => t.match(/^(?:запомни обо мне|запомни про меня|знай что|учти что|имей в виду что|запомни что я)\s+(.+)$/),
    async (m) => {
      const fact = /^запомни что я/.test(m[0]) ? 'Пользователь ' + m[1] : cap(m[1]);
      await ctx.facts.add(fact);
      return 'Запомнил о вас.';
    });
  add('Обучение', ['что ты знаешь обо мне'], (t) => /^(что ты (знаешь|помнишь) (обо мне|про меня)|что ты обо мне знаешь)$/.test(t),
    () => {
      const facts = ctx.facts.list();
      const name = ctx.settings().userName;
      if (!facts.length && !name) return 'Пока почти ничего. Расскажите о себе — я запомню.';
      return `${name ? 'Вас зовут ' + name + '. ' : ''}${facts.slice(-6).map((f) => f.text).join('. ')}`;
    });
  add('Обучение', ['забудь всё обо мне'], (t) => /^(забудь все обо мне|забудь все про меня|сотри память о себе)$/.test(t),
    async () => { await ctx.facts.clear(); return 'Готово, я всё забыл.'; });

  // ═════════════ общение ═════════════
  add('Общение', ['привет', 'доброе утро'], (t) => /^(привет[а-я]*|здравствуй[а-я]*|добр(ое|ый) (утро|день|вечер)|хай|хелло|доброй ночи|здорово|салют|приветствую|йо)$/.test(t), greet);
  add('Общение', ['как дела'], (t) => /^(как (ты|дела|поживаешь|жизнь|настроение|сам)|как у тебя дела|ты тут|ты здесь|ты меня слышишь|ты на связи|ты живой)$/.test(t),
    () => ['Все системы работают в штатном режиме. Готов к работе.', 'Отлично, сэр. Жду указаний.', 'На связи и полностью готов.'][Math.floor(Math.random() * 3)]);
  add('Общение', ['кто ты', 'как тебя зовут'], (t) => /^(кто ты|ты кто|как тебя зовут|что ты такое|представься|кто ты такой)$/.test(t),
    () => 'Я ExternalAI, ваш персональный ассистент. Управляю компьютером, отвечаю на вопросы, выполняю поручения и учусь на ваших командах.');
  add('Общение', ['что ты умеешь'], (t) => /^(что ты умеешь|что ты можешь|помощь|справка|список команд|какие (есть )?команды|что умеешь)$/.test(t),
    () => { ctx.ui.openHelp(); return 'Открываю список команд. Я управляю программами, сайтами, файлами, звуком, яркостью и окнами, ставлю таймеры и напоминания, считаю, узнаю погоду и курсы валют. А ещё учусь: скажите «когда я говорю …, сделай …».'; });
  add('Общение', ['спасибо'], (t) => /^(спасибо|благодарю|спс|отлично|молодец|супер|круто|красавчик|умница|класс)( тебе)?( большое)?$/.test(t),
    () => ['Всегда к вашим услугам.', 'Рад помочь, сэр.', 'Обращайтесь.'][Math.floor(Math.random() * 3)]);
  add('Общение', ['меня зовут Алекс'], (t) => t.match(/^(?:меня зовут|называй меня|зови меня|мое имя)\s+(.+)$/),
    async (m) => {
      const name = cap(m[1]);
      await ctx.saveSettings({ userName: name });
      return `Приятно познакомиться, ${name}.`;
    });
  add('Общение', ['как меня зовут'], (t) => /^(как меня зовут|ты знаешь как меня зовут|кто я)$/.test(t),
    () => (ctx.settings().userName ? `Вас зовут ${ctx.settings().userName}.` : 'Вы ещё не представились. Скажите: «меня зовут …».'));
  add('Общение', ['повтори за мной привет'], (t) => t.match(/^(?:повтори за мной|скажи фразу|произнеси|повтори фразу)\s+(.+)$/), (m) => cap(m[1]));

  // ═════════════ развлечения ═════════════
  add('Развлечения', ['расскажи шутку'], (t) => /(шутк|анекдот|пошути|рассмеши|прикол)/.test(t), () => JOKES[Math.floor(Math.random() * JOKES.length)]);
  add('Развлечения', ['расскажи интересный факт'], (t) => /(интересн[а-я]* факт|факт дня|расскажи (что[- ]нибудь|что то) интересное|удиви меня)/.test(t), () => FACTS[Math.floor(Math.random() * FACTS.length)]);
  add('Развлечения', ['подбрось монетку'], (t) => /(монетк|орел или решка)/.test(t), () => (Math.random() < 0.5 ? 'Орёл.' : 'Решка.'));
  add('Развлечения', ['брось кубик'], (t) => /(кубик|кости)/.test(t) && /(брось|кинь|подбрось|бросить)/.test(t), () => `Выпало ${1 + Math.floor(Math.random() * 6)}.`);
  add('Развлечения', ['случайное число от 1 до 100'], (t) => t.match(/случайное число(?: от (-?\d+))?(?: до (-?\d+))?/),
    (m) => {
      const a = m[1] ? +m[1] : 1;
      const b = m[2] ? +m[2] : 100;
      const lo = Math.min(a, b), hi = Math.max(a, b);
      return `Ваше число: ${lo + Math.floor(Math.random() * (hi - lo + 1))}.`;
    });
  add('Развлечения', ['выбери пицца или суши'], (t) => t.match(/^(?:выбери|реши|что выбрать|помоги выбрать)\s+(?:между\s+)?(.+?)\s+или\s+(.+)$/),
    (m) => `Я выбираю: ${Math.random() < 0.5 ? m[1] : m[2]}.`);

  // ═════════════ ассистент ═════════════
  add('Ассистент', ['стоп', 'замолчи'], (t) => /^(стоп|хватит|замолчи|тихо|молчать|помолчи|достаточно|отмена|отбой|заткнись|не надо|все хватит|прекрати)$/.test(t),
    () => { ctx.ui.stopSpeaking(); return { say: '', silent: true }; });
  add('Ассистент', ['повтори'], (t) => /^(повтори|что ты сказал|не расслышал|не понял|еще раз скажи)$/.test(t), () => ctx.ui.lastAnswer() || 'Я ещё ничего не говорил.');
  add('Ассистент', ['открой настройки ассистента'], (t) => /(твои|свои) настройки|настройки (ассистента|программы|экстернал|джарвиса)/.test(t),
    () => { ctx.ui.openSettings(); return 'Открываю настройки.'; });
  add('Ассистент', ['проверь обновления'], (t) => /(провер[а-я]* обновлени|обновись|обнови себя|обнови программу|обнови ассистента|есть ли обновлени)/.test(t),
    async () => { await ext.update.check(); return 'Проверяю обновления.'; });
  add('Ассистент', ['новый диалог'], (t) => /(очисти (чат|журнал|историю)|новый диалог|забудь (наш )?разговор|начни (сначала|заново))/.test(t),
    async () => { await ctx.ui.clearLog(); return 'Начинаем с чистого листа.'; });
  add('Ассистент', ['не слушай'], (t) => /^(не слушай|перестань слушать|выключи микрофон|режим тишины)$/.test(t),
    () => { ctx.ui.setEars(false); return 'Микрофон отключён. Включить его можно кнопкой «Слух».'; });
  add('Ассистент', ['пока'], (t) => /^(пока|до свидания|отдыхай|свободен|можешь идти|спокойной ночи|до связи)$/.test(t),
    () => { setTimeout(() => ctx.ui.hideWindow(), 2500); return 'До связи, сэр. Я буду рядом.'; });
  add('Ассистент', ['говори быстрее', 'смени голос'], (t) => t.match(/^(?:говори (быстрее|медленнее|громче|тише)|(не говори|молчи|без озвучки|выключи голос|выключи озвучку|отвечай текстом)|(включи голос|включи озвучку|говори вслух|отвечай голосом)|(смени голос|поменяй голос|другой голос))$/),
    async (m) => ctx.ui.voice(m[1] || (m[2] ? 'off' : m[3] ? 'on' : 'next')));

  // ═════════════ окна ═════════════
  add('Окна', ['спрячься'], (t) => /^(сверни(сь)? себя|свернись|спрячься|скройся|уйди в трей)$/.test(t), () => { setTimeout(() => ctx.ui.hideWindow(), 900); return 'Сворачиваюсь.'; });
  add('Окна', ['покажись'], (t) => /^(развернись|покажись|появись|вернись)$/.test(t), () => { ctx.ui.maximize(); return 'Я здесь.'; });
  add('Окна', ['сверни окно'], (t) => /^сверни( это| текущее| активное)? окно$|^сверни$/.test(t), async () => say(await act('activeWindow', { action: 'minimize' }), 'Сворачиваю'));
  add('Окна', ['разверни окно'], (t) => /^разверни( это| текущее| активное)? окно$|^разверни$/.test(t), async () => say(await act('activeWindow', { action: 'maximize' }), 'Разворачиваю'));
  add('Окна', ['закрой это окно'], (t) => /^закрой (это|текущее|активное) окно$|^закрой окно$/.test(t), async () => say(await act('activeWindow', { action: 'close' }), 'Закрываю'));
  add('Окна', ['сверни все окна'], (t) => /(сверни все окна|покажи рабочий стол|убери все окна)/.test(t), async () => say(await act('minimizeAll'), 'Сворачиваю все окна'));

  // ═════════════ клавиши ═════════════
  add('Клавиши', ['новая вкладка', 'обнови страницу', 'прокрути вниз', 'сохрани', 'нажми контрол шифт т'],
    (t) => {
      for (const [re, combo] of KEYMAP) if (re.test(t)) return { combo, times: +(t.match(/(\d+) раз/) || [])[1] || 1 };
      const m = t.match(/^нажми (.+?)(?: (\d+) раз[а]?)?$/);
      if (!m) return null;
      const tokens = m[1].replace(/(эф|f) (\d{1,2})/g, '$1$2').split(/[ +]+/);
      const keys = tokens.map((w) => {
        if (KEY_WORDS[w]) return KEY_WORDS[w];
        if (/^(эф|f)\d{1,2}$/.test(w)) return 'f' + w.replace(/\D/g, '');
        if (/^[a-z0-9]$/.test(w)) return w;
        if (LETTER_NAMES[w]) return LETTER_NAMES[w];
        const lat = translit(w);
        return /^[a-z]$/.test(lat) ? lat : null;
      });
      if (!keys.length || keys.some((k) => !k)) return null;
      return { combo: keys.join('+'), times: +m[2] || 1 };
    },
    async ({ combo, times }) => say(await act('keys', { combo, times }), 'Готово'));

  // ═════════════ время и даты ═════════════
  add('Время', ['который час в Токио'], (t) => {
    const m = t.match(/(?:сколько (?:сейчас )?времени|который (?:сейчас )?час|время|сколько время) (?:сейчас )?(?:в|во) (.+)$/);
    if (!m) return null;
    const hit = CITY_TZ.find(([re]) => re.test(m[1]));
    return hit ? { tz: hit[1], name: hit[2] } : null;
  }, ({ tz, name }) => {
    const time = new Intl.DateTimeFormat('ru-RU', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(new Date());
    return `${name.startsWith('на ') ? cap(name) : 'В ' + name} сейчас ${time}.`;
  });
  add('Время', ['сколько времени', 'который час'], (t) => /(сколько (сейчас )?времени|который (сейчас )?час|^время$|точное время|сколько время|^час$)/.test(t),
    () => {
      const d = new Date();
      return `Сейчас ${d.getHours()}:${pad2(d.getMinutes())}.`;
    });
  add('Время', ['какое число будет через 10 дней'], (t) => t.match(/(?:какое|какой) (?:число|день|день недели|дата) будет через (\d+) (дн|недел|месяц)/),
    (m) => {
      const d = new Date();
      if (m[2].startsWith('дн')) d.setDate(d.getDate() + +m[1]);
      else if (m[2].startsWith('недел')) d.setDate(d.getDate() + 7 * m[1]);
      else d.setMonth(d.getMonth() + +m[1]);
      return `Это будет ${WEEKDAYS[d.getDay()]}, ${d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).replace(/ г\.$/, ' года')}.`;
    });
  add('Время', ['какое сегодня число', 'какой день недели'], (t) => !/\d/.test(t) && /(какое (сегодня )?число|какая (сегодня )?дата|какой (сегодня )?день|день недели|сегодняшняя дата|^число$)/.test(t),
    () => {
      const d = new Date();
      return `Сегодня ${WEEKDAYS[d.getDay()]}, ${d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).replace(/ г\.$/, ' года')}.`;
    });
  add('Время', ['сколько дней до нового года'], (t) => t.match(/сколько (?:осталось )?(?:дней )?до (нового года|лета|зимы|весны|осени|выходных|пятницы|субботы|воскресенья|понедельника)/),
    (m) => {
      const now = new Date();
      const y = now.getFullYear();
      const day = { 'пятницы': 5, 'субботы': 6, 'воскресенья': 0, 'понедельника': 1, 'выходных': 6 }[m[1]];
      let target;
      if (day !== undefined) {
        target = new Date(now);
        target.setDate(now.getDate() + ((day - now.getDay() + 7) % 7 || 7));
      } else {
        const months = { 'нового года': 0, 'весны': 2, 'лета': 5, 'осени': 8, 'зимы': 11 };
        const mo = months[m[1]];
        target = new Date(y, mo, 1);
        if (target <= now) target = new Date(y + 1, mo, 1);
      }
      target.setHours(0, 0, 0, 0);
      const days = Math.ceil((target - now) / 86400000);
      return `До ${m[1]} ${days} ${plural(days, 'день', 'дня', 'дней')}.`;
    });
  add('Время', ['запусти секундомер', 'сколько прошло'], (t) => t.match(/^(?:(запусти|включи|начни|старт) секундомер|(засеки время)|(останови|выключи|стоп) секундомер|(сколько прошло(?: времени)?|секундомер))$/),
    (m) => {
      if (m[1] || m[2]) { memory.stopwatch = Date.now(); return 'Секундомер запущен.'; }
      if (!memory.stopwatch) return 'Секундомер не запущен.';
      const sec = (Date.now() - memory.stopwatch) / 1000;
      if (m[3]) memory.stopwatch = 0;
      return `${m[3] ? 'Остановил. ' : ''}Прошло ${formatDuration(sec)}.`;
    });

  // ═════════════ таймеры и напоминания ═════════════
  add('Таймеры', ['отмени таймеры'], (t) => /(отмени|удали|сбрось|выключи|останови|убери) (все )?(таймер|таймеры|будильник|напоминани)/.test(t),
    () => { const n = ctx.timers.clear(); return n ? 'Все таймеры отменены.' : 'Активных таймеров нет.'; });
  add('Таймеры', ['сколько осталось'], (t) => /(сколько (осталось|еще)|когда (сработает|зазвонит))/.test(t) && !/(батаре|заряд|памят|дней)/.test(t),
    () => {
      const list = ctx.timers.list();
      if (!list.length) return 'Активных таймеров нет.';
      return list.map((x) => `${x.label ? x.label + ': ' : ''}осталось ${formatDuration(x.left)}`).join('. ') + '.';
    });
  add('Таймеры', ['напомни через 10 минут выключить чайник', 'напомни в 18 30 позвонить маме'], (t) => t.match(/^напомни(?:\s+мне)?\s+(.+)$/),
    (m) => {
      const rest = m[1];
      const clock = /^(завтра )?в \d/.test(rest) || /\sв \d{1,2}(\s|:|$)/.test(rest) ? parseClock(rest) : null;
      const dur = clock ? null : parseDuration(rest);
      const label = rest
        .replace(/через\s+[\d.\s]*(час[а-я]*|ч|минут[а-я]*|мин|секунд[а-я]*|сек|полчаса|полминуты)(\s+и?\s*[\d.]+\s*(минут[а-я]*|секунд[а-я]*))?/g, '')
        .replace(/(?:в|на)\s+\d{1,2}(?:[:.\s]+\d{1,2})?(?:\s*час[а-я]*)?(?:\s+(утра|дня|вечера|ночи))?/g, '')
        .replace(/^(что|о том что|про|о)\s+/, '').replace(/^\s*(нужно|надо)\s+/, '').trim();
      if (clock) {
        ctx.timers.add((clock - Date.now()) / 1000, label || 'Напоминание');
        return `Напомню в ${clock.getHours()}:${pad2(clock.getMinutes())}${label ? ': ' + label : ''}.`;
      }
      if (!dur) return null;
      ctx.timers.add(dur, label || 'Напоминание');
      return `Хорошо, напомню через ${formatDuration(dur)}${label ? ': ' + label : ''}.`;
    });
  add('Таймеры', ['поставь таймер на 5 минут'], (t) => (/(таймер|засеки|отсчет)/.test(t) || /^(поставь )?на \d/.test(t)) && parseDuration(t) !== null,
    (t) => {
      const sec = parseDuration(t);
      const label = (t.match(/(?:для|на)\s+([а-я ]+?)\s*$/) || [])[1];
      ctx.timers.add(sec, label && !/(минут|секунд|час)/.test(label) ? label : 'Таймер');
      return `Таймер на ${formatDuration(sec)} запущен.`;
    });
  add('Таймеры', ['разбуди меня в 7 30', 'будильник на 8 утра'], (t) => /(будильник|разбуди)/.test(t) && (parseClock(t) || parseDuration(t)),
    (t) => {
      const d = parseClock(t) || new Date(Date.now() + parseDuration(t) * 1000);
      ctx.timers.add((d - Date.now()) / 1000, 'Будильник', true);
      const tomorrow = d.getDate() !== new Date().getDate();
      return `Будильник установлен на ${d.getHours()}:${pad2(d.getMinutes())}${tomorrow ? ' завтра' : ''}.`;
    });

  // ═════════════ заметки ═════════════
  add('Заметки', ['запомни, что ключи в куртке'], (t) => t.match(/^(?:запомни|запиши|сделай заметку|добавь заметку|заметка|запиши себе|отметь)(?:\s+что)?\s+(.+)$/),
    async (m) => { await ctx.notes.add(m[1]); return 'Записал.'; });
  add('Заметки', ['прочитай заметки'], (t) => /((прочитай|покажи|мои|какие|открой) заметки|что ты (запомнил|записал)|что я просил запомнить|список заметок)/.test(t),
    async () => {
      const list = ctx.notes.list();
      return list.length ? 'Ваши заметки: ' + list.map((n, i) => `${i + 1}. ${n.text}`).join('. ') : 'Заметок пока нет.';
    });
  add('Заметки', ['удали заметки'], (t) => /(удали|очисти|сотри) (все )?заметки/.test(t), async () => { await ctx.notes.clear(); return 'Заметки удалены.'; });

  // ═════════════ звук и музыка ═════════════
  add('Звук', ['громче', 'сделай громче на 20'], (t) => /^(сделай )?(по)?громче|прибавь (звук|громкость)|увеличь (звук|громкость)|^громкость (выше|больше)$/.test(t),
    async (t) => say(await act('volume', { action: 'up', amount: +(t.match(/(\d+)/) || [])[1] || 10 }), 'Громче'));
  add('Звук', ['тише', 'сделай тише'], (t) => /^(сделай )?(по)?тише|убавь (звук|громкость)|уменьши (звук|громкость)|^громкость (ниже|меньше)$/.test(t),
    async (t) => say(await act('volume', { action: 'down', amount: +(t.match(/(\d+)/) || [])[1] || 10 }), 'Тише'));
  add('Звук', ['громкость 50'], (t) => t.match(/громкость (?:на )?(\d{1,3})|(максимальная|полная) громкость|громкость на (максимум|полную)/),
    async (m) => say(await act('volume', { action: 'set', amount: m[1] ? Math.min(100, +m[1]) : 100 }), 'Готово'));
  add('Звук', ['выключи звук'], (t) => /^(выключи|убери) звук|^без звука$|^мьют$|^заглуши звук$/.test(t), async () => say(await act('volume', { action: 'mute' }), 'Звук выключен'));
  add('Звук', ['включи звук'], (t) => /^(включи|верни) звук$/.test(t), async () => say(await act('volume', { action: 'unmute' }), 'Звук включён'));
  add('Музыка', ['пауза', 'продолжи'], (t) => /^(пауза|поставь на паузу|на паузу|продолжи[а-я]*|продолжай|играй|воспроизведение|сними с паузы|включи музыку|включи музыка|музыку|останови (музыку|видео)|выключи музыку|стоп музыка|плей)$/.test(t),
    async () => say(await act('media', { action: 'playpause' }), 'Готово'));
  add('Музыка', ['следующий трек'], (t) => /(следующ[а-я]+ (трек|песн[а-я]*|видео)|переключи (трек|песню)|дальше|пропусти( трек| песню)?|некст|другую песню|другой трек)$/.test(t),
    async () => say(await act('media', { action: 'next' }), 'Следующий'));
  add('Музыка', ['предыдущий трек'], (t) => /(предыдущ[а-я]+ (трек|песн[а-я]*|видео)|верни (трек|песню)|прошл[а-я]+ (трек|песн[а-я]*))$/.test(t),
    async () => say(await act('media', { action: 'prev' }), 'Предыдущий'));

  // ═════════════ яркость ═════════════
  add('Яркость', ['ярче', 'сделай темнее', 'яркость 70'], (t) => t.match(/^(?:(?:сделай )?(ярче|светлее)|(?:прибавь|увеличь) яркость|(?:сделай )?(темнее|тусклее)|(?:убавь|уменьши) яркость|яркость (?:на )?(\d{1,3})(?: процентов)?)(?: на (\d+))?$/),
    async (m) => {
      const up = !!m[1] || /прибавь|увеличь/.test(m[0]);
      const action = m[3] ? 'set' : up ? 'up' : 'down';
      return say(await act('brightness', { action, amount: m[3] ? +m[3] : +m[4] || 20 }), 'Готово');
    });

  // ═════════════ поиск и интернет ═════════════
  add('Поиск', ['найди на ютубе котиков', 'включи на ютубе lo-fi'], (t) => t.match(/^(?:найди|включи|поставь|открой|покажи)\s+(?:на|в)\s+(?:ютубе|youtube|ютьюбе|ютуб)\s+(.+)$/) || t.match(/^(?:включи|поставь|найди|покажи)\s+(?:видео|клип|ролик)?\s*(.+?)\s+(?:на|в)\s+(?:ютубе|youtube|ютьюбе|ютуб)$/),
    async (m) => say(await act('openUrl', { url: `https://www.youtube.com/results?search_query=${enc(m[1])}` }), 'Ищу на YouTube'));
  add('Поиск', ['включи песню Imagine Dragons'], (t) => t.match(/^(?:включи|поставь)\s+(?:песню|музыку|трек|альбом|группу|исполнителя)\s+(.+)$/),
    async (m) => say(await act('openUrl', { url: `https://www.youtube.com/results?search_query=${enc(m[1])}` }), `Ищу ${m[1]}`));
  add('Поиск', ['найди в яндексе рецепт борща'], (t) => t.match(/^(?:найди|загугли)\s+(?:в|на)\s+яндексе\s+(.+)$/),
    async (m) => say(await act('openUrl', { url: `https://ya.ru/search/?text=${enc(m[1])}` }), 'Ищу в Яндексе'));
  add('Поиск', ['найди на википедии Тесла'], (t) => t.match(/^(?:найди|открой)\s+(?:в|на)\s+википеди[а-я]+\s+(.+)$/),
    async (m) => say(await act('openUrl', { url: `https://ru.wikipedia.org/w/index.php?search=${enc(m[1])}` }), 'Открываю Википедию'));
  add('Поиск', ['покажи на карте Красная площадь', 'маршрут до аэропорта'], (t) => t.match(/^(?:покажи на карте|найди на карте|где находится|маршрут до|как доехать до|проложи маршрут до|как добраться до)\s+(.+)$/),
    async (m) => say(await act('openUrl', { url: `https://yandex.ru/maps/?text=${enc(m[1])}` }), 'Открываю карту'));
  add('Поиск', ['найди на маркетплейсе наушники'], (t) => t.match(/^(?:найди|закажи|купи|поищи)\s+(?:на|в)\s+(озоне|озон|вайлдберриз|валберис|вб|авито|алиэкспресс|маркете|яндекс маркете|маркетплейсе)\s+(.+)$/),
    async (m) => {
      const shops = { озоне: 'https://www.ozon.ru/search/?text=', озон: 'https://www.ozon.ru/search/?text=', авито: 'https://www.avito.ru/all?q=', алиэкспресс: 'https://aliexpress.ru/wholesale?SearchText=', маркете: 'https://market.yandex.ru/search?text=', 'яндекс маркете': 'https://market.yandex.ru/search?text=' };
      const base = shops[m[1]] || 'https://www.wildberries.ru/catalog/0/search.aspx?search=';
      return say(await act('openUrl', { url: base + enc(m[2]) }), 'Ищу в магазине');
    });
  add('Поиск', ['загугли это'], (t) => /^(загугли|найди|поищи) (это|выделенное|выделенный текст)$/.test(t),
    async () => {
      const r = await act('selectedText');
      if (!r.ok) return 'Сначала выделите текст.';
      return say(await act('openUrl', { url: `https://www.google.com/search?q=${enc(r.text.slice(0, 300))}` }), 'Ищу выделенное');
    });

  // ═════════════ файлы ═════════════
  add('Файлы', ['найди файл отчёт', 'где лежит файл договор'], (t) => t.match(/^(?:найди|где (?:лежит|находится|мой)|покажи)\s+(?:файл|документ|папку|фото|фотографию|картинку|презентацию|таблицу)\s+(.+)$/),
    async (m) => say(await act('openFile', { query: m[1], reveal: true }), 'Показываю'));
  add('Файлы', ['открой файл отчёт'], (t) => t.match(/^открой\s+(?:файл|документ|презентацию|таблицу|фото|фотографию|картинку)\s+(.+)$/),
    async (m) => say(await act('openFile', { query: m[1] }), 'Открываю'));
  add('Файлы', ['открой последний скриншот'], (t) => /(открой|покажи) (последний )?(скриншот|скрин|снимок экрана)$/.test(t), async () => say(await act('lastScreenshot'), 'Открываю'));
  add('Файлы', ['создай папку Проекты', 'создай файл список покупок в документах'], (t) => t.match(/^создай\s+(?:новую\s+)?(папку|файл|текстовый файл|документ|текстовый документ)(?:\s+(?:с названием|под названием|с именем|названием))?\s*(.*?)(?:\s+(?:на|в|во)\s+(рабочем столе|документах|загрузках|изображениях|картинках|музыке|видео))?$/),
    async (m) => say(await act('createItem', { kind: m[1] === 'папку' ? 'folder' : 'file', name: m[2], where: m[3] || 'desktop' }), 'Создал'));
  add('Файлы', ['очисти корзину'], (t) => /(очисти|опустоши|почисти) корзину/.test(t),
    async () => {
      const yes = await ctx.ui.confirm({ title: 'Очистить корзину?', text: 'Файлы удалятся без возможности восстановления', details: '' });
      return yes ? say(await act('emptyTrash'), 'Корзина очищена') : 'Отменено.';
    });
  add('Файлы', ['открой загрузки', 'открой документы'], (t) => {
    const m = t.match(/^(?:открой|покажи|зайди в|перейди в)\s+(?:папку\s+)?(.+)$/);
    return m && FOLDERS[m[1]] ? FOLDERS[m[1]] : null;
  }, async (key) => say(await act('openPath', { path: key }), 'Открываю'));

  // ═════════════ погода, валюта, сеть ═════════════
  add('Погода', ['какая погода', 'погода в Казани завтра'], (t) => /погод|температур[а-я]* (на улице|за окном)|холодно ли|нужен ли зонт|какая на улице|сколько градусов/.test(t),
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
          const umbrella = /зонт/.test(t) ? ((w.daily.precipitation_probability_max?.[0] ?? 0) > 40 ? ' Зонт лучше взять.' : ' Зонт, скорее всего, не понадобится.') : '';
          return `В городе ${place.name} сейчас ${Math.round(c.temperature_2m)}°, ${desc}. Ощущается как ${Math.round(c.apparent_temperature)}°, ветер ${Math.round(c.wind_speed_10m)} метров в секунду.${umbrella}`;
        }
        const d = w.daily;
        const [desc] = describeWeather(d.weather_code[dayIdx]);
        const rain = d.precipitation_probability_max?.[dayIdx];
        return `${dayIdx === 1 ? 'Завтра' : 'Послезавтра'} в городе ${place.name} от ${Math.round(d.temperature_2m_min[dayIdx])}° до ${Math.round(d.temperature_2m_max[dayIdx])}°, ${desc}${rain != null ? `, вероятность осадков ${rain} процентов` : ''}.`;
      } catch {
        return `Не удалось получить погоду для «${city}».`;
      }
    });
  add('Валюта', ['курс доллара', 'сколько будет 100 евро в рублях'], (t) => {
    if (/^(загугли|найди|поищи|поиск)\s/.test(t)) return null;
    const conv = t.match(/(\d+(?:\.\d+)?)\s*([а-я]+)(?:\s+[а-я]+)?\s+(?:в|на)\s+рубл/);
    if (conv) {
      const c = CURRENCIES.find(([re]) => re.test(conv[2]));
      return c ? { amount: +conv[1], code: c[1], name: c[2] } : null;
    }
    if (!/(курс|почем|сколько стоит|сколько сейчас|по чем)/.test(t)) return null;
    if (/\s(к|в|во|на)\s(?!рубл)[а-я]/.test(t)) return null; // пара валют — в каталоге
    const c = CURRENCIES.find(([re]) => re.test(t));
    return c ? { amount: 0, code: c[1], name: c[2] } : null;
  }, async ({ amount, code, name }) => {
    try {
      const j = await (await fetch('https://www.cbr-xml-daily.ru/daily_json.js')).json();
      const v = j.Valute[code];
      const rate = v.Value / v.Nominal;
      if (amount) return `${formatNumber(amount)} — это ${formatNumber(Math.round(amount * rate * 100) / 100)} рублей по курсу ЦБ.`;
      const diff = v.Value - v.Previous;
      return `Курс ЦБ: ${name} — ${formatNumber(Math.round(rate * 100) / 100)} рубля${Math.abs(diff) > 0.005 ? `, за день ${diff > 0 ? 'вырос' : 'снизился'} на ${formatNumber(Math.abs(Math.round(diff / v.Nominal * 100) / 100))}` : ''}.`;
    } catch {
      return 'Не удалось получить курс валют.';
    }
  });
  add('Сеть', ['мой ip'], (t) => /(ip|айпи|айпишник)/.test(t) && !/сайт/.test(t),
    async () => {
      try {
        const j = await (await fetch('https://api.ipify.org?format=json')).json();
        await act('copyText', { text: j.ip });
        return `Ваш внешний IP: ${j.ip.split('.').join(' точка ')}. Скопировал в буфер.`;
      } catch { return 'Не удалось узнать IP — похоже, нет интернета.'; }
    });
  add('Сеть', ['проверь интернет'], (t) => /((проверь|есть ли|работает ли|пропал( ли)?) (интернет|сеть|связь)|скорость интернета|интернет работает)/.test(t),
    async () => {
      const started = performance.now();
      try {
        await fetch('https://www.google.com/generate_204', { mode: 'no-cors', cache: 'no-store' });
        return `Интернет работает, отклик ${Math.round(performance.now() - started)} миллисекунд.`;
      } catch { return 'Интернета нет.'; }
    });

  // ═════════════ большой каталог ═════════════
  const CATALOG_RULES = catalogRules(ctx);
  for (const r of CATALOG_RULES) add(r.group, r.examples, r.match, r.run);

  // ═════════════ сколько команд ═════════════
  add('Ассистент', ['сколько команд ты знаешь'], (t) => /^(сколько (команд|всего команд) ты (знаешь|умеешь)|сколько у тебя команд)$/.test(t),
    async () => {
      const st = stats(await ctx.mainCounts?.());
      ctx.ui.openHelp();
      return `Я знаю ${st.total.toLocaleString('ru-RU')} ${plural(st.total, 'команду', 'команды', 'команд')}, и это число растёт: я учусь на ваших командах.`;
    });

  // ═════════════ калькулятор ═════════════
  add('Калькулятор', ['сколько будет 25 умножить на 4'], (t) => {
    const m = t.match(/^(?:сколько будет|посчитай|вычисли|реши|подсчитай|сколько)\s+(.+)$/);
    if (!m) return null;
    const v = calcExpression(m[1].replace(/\?$/, ''));
    return v === null ? null : { v };
  }, ({ v }) => `Получается ${formatNumber(v)}.`);

  // ═════════════ система ═════════════
  add('Система', ['загрузка процессора', 'сколько памяти'], (t) => /(загрузк[а-я]* (процессора|системы|компьютера)|состояние (системы|компьютера)|сколько (оперативки|памяти|оперативной памяти)|как (себя чувствует|дела у) компьютер[а-я]*)/.test(t),
    async () => {
      const s = await act('systemInfo');
      return `Процессор загружен на ${s.cpu} процентов, занято ${s.memUsedGB} из ${s.memTotalGB} гигабайт памяти.`;
    });
  add('Система', ['какой у меня процессор'], (t) => /(какой у меня (процессор|компьютер)|какая у меня (система|ос|операционная система|версия виндовс|версия windows)|характеристики (компьютера|пк))/.test(t),
    async () => {
      const s = await act('systemInfo');
      return `${s.os}, процессор ${s.cpuModel.replace(/\s+/g, ' ').trim()}, ${s.cores} потоков, ${s.memTotalGB} гигабайт памяти.`;
    });
  add('Система', ['сколько работает компьютер'], (t) => /(сколько (работает|включен) (компьютер|пк)|время работы компьютера|аптайм)/.test(t),
    async () => { const s = await act('systemInfo'); return `Компьютер работает ${formatDuration(s.uptimeMin * 60)}.`; });
  add('Система', ['сколько места на диске'], (t) => /((сколько|много) (свободного )?места|свободное место|место на диске|памяти на диске|заполнен ли диск)/.test(t),
    async () => {
      const r = await act('diskInfo');
      if (!r.ok) return r.message;
      return r.disks.map((d) => `На диске ${d.name.replace(':', '')} свободно ${formatNumber(d.freeGB)} из ${d.totalGB} гигабайт`).join('. ') + '.';
    });
  add('Система', ['заряд батареи'], (t) => /(батаре|заряд|аккумулятор)/.test(t),
    async () => {
      if (!navigator.getBattery) return 'Не могу узнать заряд батареи.';
      const b = await navigator.getBattery();
      if (b.charging && b.level === 1) return 'Батарея заряжена полностью.';
      return `Заряд ${Math.round(b.level * 100)} процентов${b.charging ? ', идёт зарядка' : ''}.`;
    });
  add('Система', ['сделай скриншот'], (t) => /(скриншот|снимок экрана|скрин экрана|сфоткай экран|заскринь)/.test(t),
    async () => say(await act('screenshot'), 'Скриншот готов'));
  add('Система', ['напечатай привет мир'], (t) => t.match(/^(?:напечатай|набери|введи|впиши|напиши текст)\s+(?:текст\s+)?(.+)$/),
    async (m) => say(await act('typeText', { text: m[1] }), 'Напечатал'));
  add('Система', ['скопируй в буфер привет'], (t) => t.match(/^скопируй(?:\s+в буфер(?: обмена)?)\s+(.+)$|^скопируй текст\s+(.+)$/),
    async (m) => say(await act('copyText', { text: m[1] || m[2] }), 'Скопировал'));
  add('Система', ['что в буфере обмена'], (t) => /(что (у меня )?в буфере( обмена)?|прочитай буфер( обмена)?|что я скопировал)/.test(t),
    async () => {
      const r = await act('readClipboard');
      return r.text ? `В буфере: ${r.text.slice(0, 400)}` : 'Буфер обмена пуст.';
    });
  add('Система', ['прочитай выделенное'], (t) => /^(прочитай|озвучь|зачитай) (выделенное|выделенный текст|это|выделение|текст)$/.test(t),
    async () => {
      const r = await act('selectedText');
      return r.ok ? r.text.slice(0, 3000) : 'Сначала выделите текст.';
    });
  add('Система', ['сгенерируй пароль'], (t) => t.match(/(?:сгенерируй|создай|придумай|сделай) (?:мне )?(?:новый )?(?:надежный |сложный )?пароль(?: (?:из|на|длиной) (\d+)(?: символ[а-я]*)?)?/),
    async (m) => {
      const len = Math.max(8, Math.min(64, +m[1] || 16));
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*_-+=';
      const bytes = crypto.getRandomValues(new Uint32Array(len));
      const pass = Array.from(bytes, (b) => chars[b % chars.length]).join('');
      await act('copyText', { text: pass });
      return `Пароль из ${len} символов скопирован в буфер обмена.`;
    });
  add('Система', ['открой настройки звука', 'настройки wifi'], (t) => t.match(/^(?:открой\s+|покажи\s+)?(?:настройки|параметры)\s+(?!ассистента|программы|экстернал|джарвиса)(.+)$/),
    async (m) => {
      const r = await act('settingsPage', { what: m[1] });
      return r.ok ? r.message : { fallthrough: true, message: r.message };
    });

  // ═════════════ питание ═════════════
  const powerCmd = (action, question) => async (t) => {
    const delay = parseDuration(t) || 0;
    const yes = await ctx.ui.confirm({ title: question, text: delay ? `Через ${formatDuration(delay)}` : 'Действие выполнится сразу', details: '' });
    if (!yes) return 'Отменено.';
    return say(await act('power', { action, delay }), 'Выполняю');
  };
  add('Питание', ['выключи компьютер', 'выключи компьютер через 30 минут'], (t) => /(выключи|заверши работу|выруби)\s*(компьютер|пк|комп|систему|ноутбук|ноут)|выключение компьютера/.test(t), powerCmd('shutdown', 'Выключить компьютер?'));
  add('Питание', ['перезагрузи компьютер'], (t) => /(перезагрузи|перезапусти)\s*(компьютер|пк|комп|систему|ноутбук|ноут)|^перезагрузка$/.test(t), powerCmd('restart', 'Перезагрузить компьютер?'));
  add('Питание', ['спящий режим'], (t) => /(спящий режим|режим сна|в сон|усыпи компьютер|переведи компьютер в сон|компьютер спать)/.test(t), powerCmd('sleep', 'Перевести компьютер в сон?'));
  add('Питание', ['заблокируй компьютер'], (t) => /^(заблокируй|блокировка)\s*(компьютер|пк|экран|систему|ноутбук)?$/.test(t), async () => say(await act('power', { action: 'lock' }), 'Блокирую'));
  add('Питание', ['отмени выключение'], (t) => /отмени (выключение|перезагрузку)/.test(t), async () => say(await act('power', { action: 'cancel' }), 'Отменено'));

  // ═════════════ программы ═════════════
  add('Программы', ['закрой блокнот'], (t) => t.match(/^(?:закрой|заверши|выключи|убей)\s+(?:программу|приложение|процесс|игру)?\s*(.+)$/),
    async (m) => {
      const r = await act('closeApp', { name: m[1] });
      return r.ok ? r.message : { fallthrough: true, message: r.message };
    });
  add('Программы', ['открой ютуб', 'запусти телеграм', 'открой сайт хабр точка ком'], (t) => t.match(/^(?:открой|запусти|включи|зайди на|зайди в|перейди на|покажи|открыть|запустить)\s+(.+)$/),
    async (m) => {
      const target = m[1].replace(/^(программу|приложение|игру|прогу)\s+/, '');
      const site = await openSite(target);
      if (site) return site;
      const r = await act('openApp', { name: target });
      if (r.ok) return r.message;
      const web = WEB_FALLBACK[target] || WEB_FALLBACK[translit(target)];
      if (web) return say(await act('openUrl', { url: web }), 'Открываю веб-версию');
      return { fallthrough: true, message: r.message };
    });

  // ═════════════ без ИИ: Википедия / переводчик ═════════════
  add('Поиск', ['что такое квазар'], (t) => !ctx.hasAI() && t.match(/^(?:что такое|кто такой|кто такая|кто такие|что значит|что означает)\s+(.+)$/),
    async (m) => say(await act('openUrl', { url: `https://ru.wikipedia.org/w/index.php?search=${enc(m[1])}` }), `Ищу в Википедии: ${m[1]}`));
  add('Поиск', ['переведи на английский привет'], (t) => !ctx.hasAI() && t.match(/^переведи(?:\s+на\s+(английский|немецкий|французский|испанский|китайский|русский|итальянский|японский|турецкий))?\s+(.+)$/),
    async (m) => {
      const langs = { английский: 'en', немецкий: 'de', французский: 'fr', испанский: 'es', китайский: 'zh-CN', русский: 'ru', итальянский: 'it', японский: 'ja', турецкий: 'tr' };
      let text = m[2];
      if (/^(это|выделенное|выделенный текст)$/.test(text)) {
        const r = await act('selectedText');
        if (!r.ok) return 'Сначала выделите текст.';
        text = r.text;
      }
      return say(await act('openUrl', { url: `https://translate.google.com/?sl=auto&tl=${langs[m[1]] || 'en'}&text=${enc(text.slice(0, 2000))}&op=translate` }), 'Открываю переводчик');
    });
  add('Поиск', ['найди рецепт пиццы', 'загугли курс биткоина'], (t) => t.match(/^(?:найди|загугли|ищи|поиск|найди в интернете|найди в гугле)\s+(?:в интернете\s+|в гугле\s+)?(.+)$/),
    async (m) => (ctx.hasAI() && /^(?:найди|ищи)/.test(m[0]) && !/^(найди в|загугли)/.test(m[0])
      ? { fallthrough: true }
      : say(await act('openUrl', { url: `https://www.google.com/search?q=${enc(m[1])}` }), `Ищу: ${m[1]}`)));

  // ───────────────────────── обработка ─────────────────────────

  function remember(text, group, learnedId = null) {
    memory.last = { text, group };
    memory.lastLearnedId = learnedId;
  }

  async function matchRules(t) {
    for (const cmd of C) {
      const m = cmd.match(t);
      if (!m) continue;
      const res = await cmd.run(m === true ? t : m, t);
      if (res === null || res === undefined) continue;
      if (typeof res === 'object' && res.fallthrough) return { handled: false, hint: res.message, text: t };
      if (cmd.group !== 'Обучение' && cmd.group !== 'Ассистент') remember(t, cmd.group);
      if (typeof res === 'object') return { handled: true, group: cmd.group, ...res };
      return { handled: true, group: cmd.group, say: res };
    }
    return null;
  }

  async function runLearned(entry, depth) {
    const list = learned();
    const item = list.find((e) => e.id === entry.id);
    if (item) { item.uses = (item.uses || 0) + 1; item.lastUsed = Date.now(); saveLearned(list); }
    if (entry.kind === 'alias') {
      const answers = [];
      for (const c of entry.commands) {
        const r = await handle(c, depth + 1);
        if (!r.handled && ctx.hasAI()) {
          const ai = await ctx.ai(c);
          if (ai?.text) answers.push(ai.text);
        } else if (r.say) answers.push(r.say);
      }
      remember(entry.phrase, 'Выученное', entry.id);
      return { handled: true, say: answers.join(' ') || 'Готово.', learned: true };
    }
    for (const step of entry.steps || []) await ext.ai.runTool(step.name, step.input);
    remember(entry.phrase, 'Выученное', entry.id);
    return { handled: true, say: entry.say || 'Готово.', learned: true };
  }

  async function runOne(text, depth = 0) {
    if (depth === 0) memory.raw = normalize(text);
    let t = cleanCommand(text);
    if (!t) return { handled: true, say: '', silent: true };

    // 1) Свои и выученные команды — в приоритете.
    const known = findLearned(t);
    if (known && depth < 3) return runLearned(known, depth);

    // 2) Продолжение разговора: «ещё», «ещё громче», «а в Питере?»
    if (memory.last) {
      if (/^(еще|еще раз|снова|опять|повтори команду|давай еще|и еще|еще разок)$/.test(t) && REPEATABLE.has(memory.last.group)) {
        t = memory.last.text;
      } else if (/^еще\s+/.test(t)) {
        t = t.replace(/^еще\s+/, '');
      } else if (memory.last.group === 'Погода' && /^((в|во) [а-я -]+|завтра|послезавтра|сегодня)( завтра| послезавтра)?$/.test(t)) {
        t = 'погода ' + t;
      } else if (memory.last.group === 'Время' && /^(в|во) [а-я -]+$/.test(t)) {
        t = 'который час ' + t;
      } else if (memory.last.group === 'Валюта' && /^(а )?(евро|доллар[а-я]*|юан[а-я]*|фунт[а-я]*|тенге|лир[а-я]*)$/.test(t)) {
        t = 'курс ' + t;
      }
    }

    // 3) Правила.
    const direct = await matchRules(t);
    if (direct) return direct;

    // 4) Угадывание по ключевым словам: «звук побольше», «трек другой».
    const guess = guessIntent(t);
    if (guess) {
      const g = await matchRules(guess);
      if (g) return g;
    }

    // 5) Одно-два слова без глагола: «ютуб», «телеграм», «загрузки».
    const words = t.split(' ');
    const filler = /^(да|нет|ага|угу|ок|ладно|хорошо|понятно|ясно|норм|нормально|так|вот|это|все|ничего|неважно|ну|ой|ох|эх|блин|подожди|секунду|минуту)$/;
    if (words.length <= 3 && !VERBS.has(words[0]) && t.length >= 3 && !filler.test(t)) {
      if (SITES[t]) { remember(t, 'Программы'); return { handled: true, say: say(await act('openUrl', { url: SITES[t] }), 'Открываю') }; }
      if (FOLDERS[t]) { remember(t, 'Файлы'); return { handled: true, say: say(await act('openPath', { path: FOLDERS[t] }), 'Открываю') }; }
      const r = await act('openApp', { name: t, strict: true });
      if (r.ok) { remember(t, 'Программы'); return { handled: true, say: r.message }; }
    }
    return { handled: false, text: t };
  }

  async function handle(text, depth = 0) {
    const cleaned = cleanCommand(text);
    let result;
    // «открой ютуб, а потом сделай громче» — несколько команд подряд
    const parts = normalize(text).split(/\s+(?:а потом|и потом|затем|после этого)\s+/).filter(Boolean);
    if (parts.length > 1) {
      const answers = [];
      let all = true;
      for (const p of parts) {
        const r = await runOne(p, depth);
        if (!r.handled) { all = false; break; }
        if (r.say) answers.push(r.say);
      }
      result = all ? { handled: true, say: answers.join(' ') } : await runOne(text, depth);
    } else {
      result = await runOne(text, depth);
    }

    if (depth === 0) {
      // Исправление: «не то» → следующая фраза учит, что надо было сделать.
      if (memory.pendingCorrection && result.handled && result.group !== 'Обучение' && memory.pendingCorrection !== cleaned) {
        const wrong = memory.pendingCorrection;
        memory.pendingCorrection = '';
        await addLearned({ phrase: wrong, kind: 'alias', commands: [cleaned] });
        result.say = `${result.say ? result.say + ' ' : ''}Запомнил: «${wrong}» — это «${cleaned}».`;
        result.learnedNow = true;
      }
      if (result.group !== 'Обучение') memory.lastPhrase = cleaned;
      if (!result.learned && result.group !== 'Обучение') memory.lastLearnedId = null;
    }
    return result;
  }

  /**
   * Вызывается после ответа ИИ: запоминает его действия, чтобы в следующий раз
   * выполнить ту же фразу мгновенно и без ИИ. Возвращает текст для журнала или null.
   */
  async function afterAI(text, res) {
    const phrase = cleanCommand(text);
    const notes = [];
    if (memory.pendingCorrection && res?.ok && memory.pendingCorrection !== phrase) {
      const wrong = memory.pendingCorrection;
      memory.pendingCorrection = '';
      await addLearned({ phrase: wrong, kind: 'alias', commands: [phrase] });
      notes.push(`Запомнил: «${wrong}» — это «${phrase}»`);
    }
    memory.lastPhrase = phrase;
    memory.lastLearnedId = null;
    if (ctx.settings().learning?.autoLearn && res?.ok) {
      const steps = (res.actions || []).filter((a) => a.name !== 'web_search');
      if (steps.length && steps.length <= 4 && steps.length === (res.actions || []).length && steps.every((a) => a.ok && LEARNABLE.has(a.name))) {
        await addLearned({ phrase, kind: 'ai', steps: steps.map(({ name, input }) => ({ name, input })), say: res.text });
        notes.push(`Выучил «${phrase}» — в следующий раз выполню без ИИ`);
      }
    }
    return notes.length ? notes.join('. ') : null;
  }

  function help() {
    const groups = {};
    for (const c of C) (groups[c.group] ||= []).push(...c.examples);
    return groups;
  }

  /** Сколько всего команд: каталог + встроенные правила + программы и настройки Windows + выученное. */
  function stats(mainCounts = {}) {
    const extra = {
      'Встроенные команды': C.length - CATALOG_RULES.length,
      'Горячие клавиши': KEYMAP.length,
      'Сайты (быстрый список)': Object.keys(SITES).length,
    };
    if (mainCounts.apps) extra['Программы и системные утилиты'] = mainCounts.apps;
    if (mainCounts.settings) extra['Разделы настроек Windows'] = mainCounts.settings;
    const own = learned().length;
    if (own) extra['Выученные и свои команды'] = own;
    return catalogStats(extra);
  }

  return { handle, help, afterAI, memory, stats };
}

const cap = (s) => String(s).replace(/^./, (c) => c.toUpperCase());
