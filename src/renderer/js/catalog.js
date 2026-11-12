// Большой каталог команд: валюты, единицы измерения, сайты, языки, часовые
// пояса, праздники, математика и работа с текстом. Каждая запись — реальная
// выполнимая команда; их число считается и показывается в справке.
const { normalize, translit, similarity } = window.TextUtils;

const enc = encodeURIComponent;
const fmt = (n, max = 4) => (Math.round(n * 10 ** max) / 10 ** max).toLocaleString('ru-RU', { maximumFractionDigits: max });

function plural(n, forms) {
  const [one, few, many] = forms.split('|');
  if (!Number.isInteger(n)) return few;
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

// ═════════════════════════ единицы измерения ═════════════════════════
// [категория, множитель к базовой единице, формы «один|два|пять», основы слов через «;» (слова — через пробел), точные сокращения]
const U = [
  // длина, метр
  ['длина', 1e-9, 'нанометр|нанометра|нанометров', 'нанометр', 'нм'], ['длина', 1e-6, 'микрометр|микрометра|микрометров', 'микрометр;микрон', 'мкм'],
  ['длина', 1e-3, 'миллиметр|миллиметра|миллиметров', 'миллиметр', 'мм'], ['длина', 0.01, 'сантиметр|сантиметра|сантиметров', 'сантиметр', 'см'],
  ['длина', 0.1, 'дециметр|дециметра|дециметров', 'дециметр', 'дм'], ['длина', 1, 'метр|метра|метров', 'метр', 'м'],
  ['длина', 1000, 'километр|километра|километров', 'километр', 'км'], ['длина', 0.0254, 'дюйм|дюйма|дюймов', 'дюйм', ''],
  ['длина', 0.3048, 'фут|фута|футов', 'фут', ''], ['длина', 0.9144, 'ярд|ярда|ярдов', 'ярд', ''], ['длина', 1609.344, 'миля|мили|миль', 'мил', ''],
  ['длина', 1852, 'морская миля|морские мили|морских миль', 'морск мил', ''], ['длина', 1066.8, 'верста|версты|вёрст', 'верст;верс', ''],
  ['длина', 2.1336, 'сажень|сажени|саженей', 'сажен', ''], ['длина', 0.7112, 'аршин|аршина|аршинов', 'аршин', ''],
  ['длина', 0.04445, 'вершок|вершка|вершков', 'вершок;вершк', ''], ['длина', 0.1778, 'пядь|пяди|пядей', 'пяд', ''],
  ['длина', 1e-10, 'ангстрем|ангстрема|ангстремов', 'ангстрем', ''], ['длина', 1.495978707e11, 'астрономическая единица|астрономические единицы|астрономических единиц', 'астрономическ единиц', 'а е'],
  ['длина', 9.4607304725808e15, 'световой год|световых года|световых лет', 'светов год;светов лет', ''], ['длина', 3.0856775814913673e16, 'парсек|парсека|парсеков', 'парсек', ''],
  ['длина', 185.2, 'кабельтов|кабельтова|кабельтовых', 'кабельтов', ''],
  // масса, килограмм
  ['масса', 1e-9, 'микрограмм|микрограмма|микрограммов', 'микрограм', 'мкг'], ['масса', 1e-6, 'миллиграмм|миллиграмма|миллиграммов', 'миллиграм', 'мг'],
  ['масса', 1e-3, 'грамм|грамма|граммов', 'грам', 'г гр'], ['масса', 1, 'килограмм|килограмма|килограммов', 'килограм', 'кг кило'],
  ['масса', 100, 'центнер|центнера|центнеров', 'центнер', ''], ['масса', 1000, 'тонна|тонны|тонн', 'тонн', 'т'], ['масса', 2e-4, 'карат|карата|карат', 'карат', ''],
  ['масса', 0.028349523125, 'унция|унции|унций', 'унци;унц', ''], ['масса', 0.0311034768, 'тройская унция|тройские унции|тройских унций', 'тройск унц', ''],
  ['масса', 0.45359237, 'фунт|фунта|фунтов', 'фунт', ''], ['масса', 6.35029318, 'стоун|стоуна|стоунов', 'стоун', ''], ['масса', 16.3804964, 'пуд|пуда|пудов', 'пуд', ''],
  ['масса', 0.0042658, 'золотник|золотника|золотников', 'золотник', ''], ['масса', 6.479891e-5, 'гран|грана|гранов', 'гран', ''],
  // объём, литр
  ['объём', 1e-3, 'миллилитр|миллилитра|миллилитров', 'миллилитр', 'мл'], ['объём', 0.1, 'децилитр|децилитра|децилитров', 'децилитр', 'дл'],
  ['объём', 1, 'литр|литра|литров', 'литр', 'л'], ['объём', 100, 'гектолитр|гектолитра|гектолитров', 'гектолитр', ''],
  ['объём', 1e-3, 'кубический сантиметр|кубических сантиметра|кубических сантиметров', 'кубическ сантиметр;куб сантиметр', 'куб см'],
  ['объём', 1000, 'кубический метр|кубических метра|кубических метров', 'кубическ метр;куб метр;кубометр;куб', 'куб м'],
  ['объём', 3.785411784, 'галлон|галлона|галлонов', 'галлон', ''], ['объём', 4.54609, 'британский галлон|британских галлона|британских галлонов', 'британск галлон', ''],
  ['объём', 0.946352946, 'кварта|кварты|кварт', 'кварт', ''], ['объём', 0.473176473, 'пинта|пинты|пинт', 'пинт', ''],
  ['объём', 0.0295735295625, 'жидкая унция|жидкие унции|жидких унций', 'жидк унц', ''], ['объём', 0.2365882365, 'чашка|чашки|чашек', 'чашк;чашек', ''],
  ['объём', 0.25, 'стакан|стакана|стаканов', 'стакан', ''], ['объём', 0.015, 'столовая ложка|столовые ложки|столовых ложек', 'столов ложк;столов ложек', ''],
  ['объём', 0.005, 'чайная ложка|чайные ложки|чайных ложек', 'чайн ложк;чайн ложек', ''], ['объём', 158.987294928, 'баррель|барреля|баррелей', 'баррел', ''],
  ['объём', 12.29941, 'ведро|ведра|вёдер', 'ведр;ведер', ''],
  // площадь, кв. метр
  ['площадь', 1e-6, 'квадратный миллиметр|квадратных миллиметра|квадратных миллиметров', 'квадратн миллиметр', 'кв мм'],
  ['площадь', 1e-4, 'квадратный сантиметр|квадратных сантиметра|квадратных сантиметров', 'квадратн сантиметр', 'кв см'],
  ['площадь', 1, 'квадратный метр|квадратных метра|квадратных метров', 'квадратн метр;квадрат', 'кв м'],
  ['площадь', 1e6, 'квадратный километр|квадратных километра|квадратных километров', 'квадратн километр', 'кв км'],
  ['площадь', 100, 'сотка|сотки|соток', 'сотк;соток', 'ар'], ['площадь', 1e4, 'гектар|гектара|гектаров', 'гектар', 'га'],
  ['площадь', 4046.8564224, 'акр|акра|акров', 'акр', ''], ['площадь', 0.09290304, 'квадратный фут|квадратных фута|квадратных футов', 'квадратн фут', ''],
  ['площадь', 6.4516e-4, 'квадратный дюйм|квадратных дюйма|квадратных дюймов', 'квадратн дюйм', ''],
  ['площадь', 2589988.110336, 'квадратная миля|квадратные мили|квадратных миль', 'квадратн мил', ''],
  // время, секунда
  ['время', 1e-9, 'наносекунда|наносекунды|наносекунд', 'наносекунд', 'нс'], ['время', 1e-6, 'микросекунда|микросекунды|микросекунд', 'микросекунд', 'мкс'],
  ['время', 1e-3, 'миллисекунда|миллисекунды|миллисекунд', 'миллисекунд', 'мс'], ['время', 1, 'секунда|секунды|секунд', 'секунд', 'сек с'],
  ['время', 60, 'минута|минуты|минут', 'минут', 'мин'], ['время', 3600, 'час|часа|часов', 'час', 'ч'], ['время', 86400, 'сутки|суток|суток', 'сутк;суток', ''],
  ['время', 86400, 'день|дня|дней', 'дн;день;дне', ''], ['время', 604800, 'неделя|недели|недель', 'недел', ''], ['время', 2629746, 'месяц|месяца|месяцев', 'месяц', ''],
  ['время', 31556952, 'год|года|лет', 'год;лет', ''], ['время', 315569520, 'десятилетие|десятилетия|десятилетий', 'десятилети', ''],
  ['время', 3155695200, 'век|века|веков', 'век;столети', ''], ['время', 31556952000, 'тысячелетие|тысячелетия|тысячелетий', 'тысячелети', ''],
  // скорость, м/с
  ['скорость', 1, 'метр в секунду|метра в секунду|метров в секунду', 'метр в секунд', 'м с'],
  ['скорость', 1 / 3.6, 'километр в час|километра в час|километров в час', 'километр в час', 'км ч'],
  ['скорость', 0.44704, 'миля в час|мили в час|миль в час', 'мил в час', ''], ['скорость', 0.514444, 'узел|узла|узлов', 'узел;узл', ''],
  ['скорость', 0.3048, 'фут в секунду|фута в секунду|футов в секунду', 'фут в секунд', ''], ['скорость', 340.3, 'мах|маха|махов', 'мах', ''],
  ['скорость', 299792458, 'скорость света|скорости света|скоростей света', 'скорост свет', ''],
  // данные, байт
  ['данные', 0.125, 'бит|бита|бит', 'бит', ''], ['данные', 1, 'байт|байта|байт', 'байт', ''], ['данные', 125, 'килобит|килобита|килобит', 'килобит', 'кбит'],
  ['данные', 1e3, 'килобайт|килобайта|килобайт', 'килобайт', 'кб'], ['данные', 1.25e5, 'мегабит|мегабита|мегабит', 'мегабит', 'мбит'],
  ['данные', 1e6, 'мегабайт|мегабайта|мегабайт', 'мегабайт;мегабайт', 'мб'], ['данные', 1.25e8, 'гигабит|гигабита|гигабит', 'гигабит', 'гбит'],
  ['данные', 1e9, 'гигабайт|гигабайта|гигабайт', 'гигабайт;гиг', 'гб'], ['данные', 1.25e11, 'терабит|терабита|терабит', 'терабит', ''],
  ['данные', 1e12, 'терабайт|терабайта|терабайт', 'терабайт;тер', 'тб'], ['данные', 1e15, 'петабайт|петабайта|петабайт', 'петабайт', 'пб'],
  ['данные', 1024, 'кибибайт|кибибайта|кибибайт', 'кибибайт', ''], ['данные', 1048576, 'мебибайт|мебибайта|мебибайт', 'мебибайт', ''],
  ['данные', 1073741824, 'гибибайт|гибибайта|гибибайт', 'гибибайт', ''], ['данные', 1099511627776, 'тебибайт|тебибайта|тебибайт', 'тебибайт', ''],
  // давление, паскаль
  ['давление', 1, 'паскаль|паскаля|паскалей', 'паскал', 'па'], ['давление', 100, 'гектопаскаль|гектопаскаля|гектопаскалей', 'гектопаскал', 'гпа'],
  ['давление', 1e3, 'килопаскаль|килопаскаля|килопаскалей', 'килопаскал', 'кпа'], ['давление', 1e6, 'мегапаскаль|мегапаскаля|мегапаскалей', 'мегапаскал', 'мпа'],
  ['давление', 1e5, 'бар|бара|бар', 'бар', ''], ['давление', 101325, 'атмосфера|атмосферы|атмосфер', 'атмосфер', 'атм'],
  ['давление', 133.322, 'миллиметр ртутного столба|миллиметра ртутного столба|миллиметров ртутного столба', 'миллиметр ртутн;мм ртутн', 'мм рт ст'],
  ['давление', 6894.757, 'фунт на квадратный дюйм|фунта на квадратный дюйм|фунтов на квадратный дюйм', 'фунт на квадратн дюйм', 'psi пси'],
  // энергия, джоуль
  ['энергия', 1, 'джоуль|джоуля|джоулей', 'джоул', 'дж'], ['энергия', 1e3, 'килоджоуль|килоджоуля|килоджоулей', 'килоджоул', 'кдж'],
  ['энергия', 4.184, 'калория|калории|калорий', 'калори', 'кал'], ['энергия', 4184, 'килокалория|килокалории|килокалорий', 'килокалори', 'ккал'],
  ['энергия', 3600, 'ватт-час|ватт-часа|ватт-часов', 'ватт час', 'втч'], ['энергия', 3.6e6, 'киловатт-час|киловатт-часа|киловатт-часов', 'киловатт час', 'квтч'],
  ['энергия', 1.602176634e-19, 'электронвольт|электронвольта|электронвольт', 'электронвольт', 'эв'], ['энергия', 1055.06, 'британская тепловая единица|британских тепловых единицы|британских тепловых единиц', 'британск теплов', 'бте btu'],
  // мощность, ватт
  ['мощность', 1, 'ватт|ватта|ватт', 'ватт', 'вт'], ['мощность', 1e3, 'киловатт|киловатта|киловатт', 'киловатт', 'квт'],
  ['мощность', 1e6, 'мегаватт|мегаватта|мегаватт', 'мегаватт', 'мвт'], ['мощность', 735.49875, 'лошадиная сила|лошадиные силы|лошадиных сил', 'лошадин сил', 'лс'],
  // угол, градус
  ['угол', 1, 'градус|градуса|градусов', 'градус', ''], ['угол', 57.29577951308232, 'радиан|радиана|радиан', 'радиан', 'рад'],
  ['угол', 360, 'оборот|оборота|оборотов', 'оборот', ''], ['угол', 1 / 60, 'угловая минута|угловые минуты|угловых минут', 'углов минут', ''],
  ['угол', 1 / 3600, 'угловая секунда|угловые секунды|угловых секунд', 'углов секунд', ''], ['угол', 0.9, 'град|града|градов', 'гон', ''],
  // частота, герц
  ['частота', 1, 'герц|герца|герц', 'герц', 'гц'], ['частота', 1e3, 'килогерц|килогерца|килогерц', 'килогерц', 'кгц'],
  ['частота', 1e6, 'мегагерц|мегагерца|мегагерц', 'мегагерц', 'мгц'], ['частота', 1e9, 'гигагерц|гигагерца|гигагерц', 'гигагерц', 'ггц'],
  ['частота', 1 / 60, 'оборот в минуту|оборота в минуту|оборотов в минуту', 'оборот в минут', 'об мин'],
  // температура — особая
  ['температура', 'C', 'градус Цельсия|градуса Цельсия|градусов Цельсия', 'градус цельси;цельси;градус', ''],
  ['температура', 'F', 'градус Фаренгейта|градуса Фаренгейта|градусов Фаренгейта', 'градус фаренгейт;фаренгейт', ''],
  ['температура', 'K', 'кельвин|кельвина|кельвинов', 'кельвин;градус кельвин', ''],
  ['температура', 'R', 'градус Ранкина|градуса Ранкина|градусов Ранкина', 'ранкин;градус ранкин', ''],
].map(([cat, k, forms, stems, abbr]) => ({ cat, k, forms, stems: stems.split(';').map((x) => x.split(' ')), abbr: abbr ? abbr.split(' ') : [] }));

const TEMP = {
  toK: { C: (v) => v + 273.15, F: (v) => (v - 32) * 5 / 9 + 273.15, K: (v) => v, R: (v) => v * 5 / 9 },
  fromK: { C: (v) => v - 273.15, F: (v) => (v - 273.15) * 9 / 5 + 32, K: (v) => v, R: (v) => v * 9 / 5 },
};

const FILLER = new Set(['сколько', 'будет', 'это', 'примерно', 'переведи', 'конвертируй', 'перевести', 'посчитай', 'а', 'всего', 'получится', 'равно']);

// Разбирает часть фразы «5 миль» → [{unit, amount}] (возможны несколько категорий).
function parseUnitPart(text) {
  let words = text.trim().split(' ').filter((w) => w && !FILLER.has(w));
  let amount = null;
  if (words.length && /^-?\d+(?:\.\d+)?$/.test(words[0])) { amount = parseFloat(words[0]); words = words.slice(1); }
  if (!words.length) return [];
  const phrase = words.join(' ');
  const out = [];
  for (const u of U) {
    let score = 0;
    if (u.abbr.includes(phrase)) score = 100;
    for (const st of u.stems) {
      if (st.length !== words.length) continue;
      if (st.every((s, i) => words[i].startsWith(s))) score = Math.max(score, st.join('').length);
    }
    if (score) out.push({ unit: u, amount, score });
  }
  // Лучшее совпадение в каждой категории.
  const best = {};
  for (const o of out) if (!best[o.unit.cat] || o.score > best[o.unit.cat].score) best[o.unit.cat] = o;
  return Object.values(best);
}

function convertUnits(amount, from, to) {
  if (from.cat === 'температура') return TEMP.fromK[to.k](TEMP.toK[from.k](amount));
  return (amount * from.k) / to.k;
}

/** «сколько метров в миле», «5 футов в метрах», «переведи 3 гигабайта в мегабайты» */
export function parseConversion(t) {
  const sk = t.startsWith('сколько ');
  const parts = t.split(' ');
  for (let i = 1; i < parts.length - 1; i++) {
    if (parts[i] !== 'в' && parts[i] !== 'во') continue;
    const left = parts.slice(0, i).join(' ');
    const right = parts.slice(i + 1).join(' ');
    const L = parseUnitPart(left);
    const R = parseUnitPart(right);
    for (const l of L) {
      for (const r of R) {
        if (l.unit.cat !== r.unit.cat || l.unit === r.unit) continue;
        // «сколько метров в 3 милях»: из правой части в левую; иначе — из левой в правую.
        if (sk && l.amount === null) return { amount: r.amount ?? 1, from: r.unit, to: l.unit };
        return { amount: l.amount ?? 1, from: l.unit, to: r.unit };
      }
    }
  }
  return null;
}

// ═════════════════════════ валюты ═════════════════════════
const CUR_PRIORITY = ['RUB', 'USD', 'EUR', 'CNY', 'GBP', 'JPY', 'CHF', 'KZT', 'BYN', 'UAH', 'TRY', 'INR', 'AED', 'THB', 'KRW', 'SEK', 'CZK', 'PLN', 'CAD', 'AUD', 'MXN', 'BRL', 'SAR', 'KWD', 'GEL', 'AMD', 'AZN', 'UZS', 'KGS', 'TJS', 'EGP', 'VND', 'IDR'];
const CUR_SLANG = [
  [/^(бакс|долл|зелен)/, 'USD'], [/^евр/, 'EUR'], [/^руб/, 'RUB'], [/^(юан|жэньминьб)/, 'CNY'], [/^[ий]ен/, 'JPY'], [/^тенг/, 'KZT'],
  [/^гривн|^гривен/, 'UAH'], [/^злот/, 'PLN'], [/^лир/, 'TRY'], [/^вон/, 'KRW'], [/^бат/, 'THB'], [/^рупи/, 'INR'], [/^дирхам/, 'AED'],
  [/^франк/, 'CHF'], [/^фунт/, 'GBP'], [/^лари/, 'GEL'], [/^драм/, 'AMD'], [/^манат/, 'AZN'], [/^сум$|^сумов|^сума/, 'UZS'], [/^сом/, 'KGS'],
  [/^песо/, 'MXN'], [/^реал/, 'BRL'], [/^риял|^риал/, 'SAR'], [/^донг/, 'VND'], [/^рингит/, 'MYR'], [/^шекел/, 'ILS'], [/^крон/, 'SEK'],
  [/^форинт/, 'HUF'], [/^лей|^леев|^лея/, 'RON'], [/^динар/, 'RSD'], [/^ранд/, 'ZAR'], [/^сомон/, 'TJS'], [/^юан/, 'CNY'],
];

let curIndex = null;
function currencyIndex() {
  if (curIndex) return curIndex;
  const dn = new Intl.DisplayNames('ru', { type: 'currency' });
  const nf = (c, n) => { try { return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: c, currencyDisplay: 'name', minimumFractionDigits: 0 }).format(n); } catch { return ''; } };
  curIndex = [];
  for (const code of Intl.supportedValuesOf('currency')) {
    const name = dn.of(code);
    if (!name || name === code) continue;
    const words = new Set();
    for (const s of [name, nf(code, 1), nf(code, 3), nf(code, 5)]) for (const w of normalize(s).split(' ')) if (/[а-я]{3,}/.test(w)) words.add(w);
    curIndex.push({ code, name, words: [...words] });
  }
  return curIndex;
}

const prefixMatch = (a, b) => {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i >= 3 && i >= Math.min(a.length, b.length) - 2;
};

/** «таиландских батов» → THB, «доллар» → USD, «евро» → EUR */
export function findCurrency(text, allowed) {
  const words = normalize(text).split(' ').filter((w) => w.length >= 2 && !/^\d/.test(w));
  if (!words.length) return null;
  const scores = new Map();
  for (const c of currencyIndex()) {
    if (allowed && !allowed.has(c.code)) continue;
    let s = 0;
    for (const w of words) if (c.words.some((cw) => prefixMatch(w, cw))) s += 1;
    if (s) scores.set(c.code, s);
  }
  for (const [re, code] of CUR_SLANG) if (words.some((w) => re.test(w)) && (!allowed || allowed.has(code))) scores.set(code, (scores.get(code) || 0) + 0.5);
  if (!scores.size) return null;
  const max = Math.max(...scores.values());
  const top = [...scores].filter(([, v]) => v === max).map(([k]) => k);
  // Все слова фразы должны относиться к валюте — иначе это не валюта.
  if (max < words.length - (words.length > 2 ? 1 : 0)) return null;
  top.sort((a, b) => ((CUR_PRIORITY.indexOf(a) + 1 || 999) - (CUR_PRIORITY.indexOf(b) + 1 || 999)));
  return top[0];
}

const RATES_KEY = 'fxRates';
async function getRates() {
  let cached = null;
  try { cached = JSON.parse(localStorage.getItem(RATES_KEY) || 'null'); } catch { /* нет хранилища */ }
  if (cached && Date.now() - cached.at < 3 * 3600 * 1000) return cached;
  try {
    const j = await (await fetch('https://open.er-api.com/v6/latest/USD')).json();
    if (j.result !== 'success') throw new Error('rates');
    const data = { at: Date.now(), rates: j.rates };
    try { localStorage.setItem(RATES_KEY, JSON.stringify(data)); } catch { /* нет хранилища */ }
    return data;
  } catch (e) {
    if (cached) return cached;
    throw e;
  }
}

const money = (code, n) => {
  const digits = Math.abs(n) >= 100 ? 0 : Math.abs(n) >= 1 ? 2 : 4;
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: code, currencyDisplay: 'name', minimumFractionDigits: 0, maximumFractionDigits: digits }).format(n);
};

/** «100 батов в рублях», «курс юаня к евро», «сколько стоит доллар в тенге» */
export function parseCurrency(t) {
  let m = t.match(/^(?:сколько будет |переведи |конвертируй |сколько это |посчитай )?(\d+(?:\.\d+)?)\s+(.+?)\s+(?:в|во|на)\s+(.+?)(?:\s+по курсу)?$/);
  if (m) {
    const from = findCurrency(m[2]);
    const to = findCurrency(m[3]);
    if (from && to && from !== to) return { amount: +m[1], from, to };
    return null;
  }
  m = t.match(/^(?:курс|какой курс|почем|по чем|сколько стоит|сколько сейчас стоит|стоимость)\s+(.+?)(?:\s+(?:к|в|во|на)\s+(.+))?$/);
  if (m) {
    const from = findCurrency(m[1]);
    const to = m[2] ? findCurrency(m[2]) : 'RUB';
    if (from && to && from !== to) return { amount: 1, from, to };
  }
  return null;
}

// ═════════════════════════ сайты ═════════════════════════
// «названия=адрес», поиск — шаблон с {q}
const SITE_LIST = `
ютуб|ютьюб|youtube|ютубчик=youtube.com|youtube.com/results?search_query={q}
гугл|google=google.com|google.com/search?q={q}
яндекс=ya.ru|ya.ru/search/?text={q}
вк|вконтакте|в контакте|vk=vk.com|vk.com/search?c%5Bq%5D={q}
одноклассники|ок ру=ok.ru
телеграм веб|веб телеграм=web.telegram.org
ватсап веб|веб ватсап=web.whatsapp.com
почту|почта|gmail|джимейл|гугл почту=mail.google.com
яндекс почту|яндекс почта=mail.yandex.ru
мейл ру|майл ру|mail ru=mail.ru
outlook|аутлук веб=outlook.live.com
гугл диск|google drive=drive.google.com
гугл документы|google docs=docs.google.com
гугл таблицы|google sheets=sheets.google.com
гугл презентации=slides.google.com
гугл календарь|календарь гугл=calendar.google.com
гугл фото=photos.google.com
гугл карты=maps.google.com|google.com/maps/search/{q}
яндекс карты|карты=yandex.ru/maps|yandex.ru/maps/?text={q}
два гис|2гис|дубль гис=2gis.ru|2gis.ru/search/{q}
яндекс диск=disk.yandex.ru
яндекс музыку|яндекс музыка=music.yandex.ru|music.yandex.ru/search?text={q}
яндекс маркет|маркет=market.yandex.ru|market.yandex.ru/search?text={q}
яндекс еду|яндекс еда=eda.yandex.ru
яндекс такси=taxi.yandex.ru
яндекс погоду|погоду=yandex.ru/pogoda
яндекс новости|новости=dzen.ru/news
яндекс переводчик=translate.yandex.ru
переводчик|гугл переводчик=translate.google.com
дзен=dzen.ru
кинопоиск=kinopoisk.ru|kinopoisk.ru/index.php?kp_query={q}
кинопоиск hd|кинопоиск эйчди=hd.kinopoisk.ru
иви|ivi=ivi.ru|ivi.ru/search/?q={q}
окко|okko=okko.tv
кион|kion=kion.ru
премьер|premier=premier.one
старт|start=start.ru
нетфликс|netflix=netflix.com
рутуб|rutube=rutube.ru|rutube.ru/search/?query={q}
твич|twitch=twitch.tv|twitch.tv/search?term={q}
вк видео=vkvideo.ru|vkvideo.ru/?q={q}
тикток|тик ток=tiktok.com|tiktok.com/search?q={q}
инстаграм=instagram.com
фейсбук=facebook.com
твиттер|икс=x.com|x.com/search?q={q}
реддит|reddit=reddit.com|reddit.com/search/?q={q}
пинтерест=pinterest.com|pinterest.com/search/pins/?q={q}
линкедин=linkedin.com
дискорд веб=discord.com/app
спотифай веб=open.spotify.com|open.spotify.com/search/{q}
саундклауд=soundcloud.com|soundcloud.com/search?q={q}
звук|сбер звук=zvuk.com
википедию|википедия=ru.wikipedia.org|ru.wikipedia.org/w/index.php?search={q}
английскую википедию=en.wikipedia.org|en.wikipedia.org/w/index.php?search={q}
гитхаб|github=github.com|github.com/search?q={q}
гитлаб=gitlab.com
стак оверфлоу|stackoverflow=stackoverflow.com|stackoverflow.com/search?q={q}
хабр=habr.com|habr.com/ru/search/?q={q}
чат гпт|chatgpt=chatgpt.com
клод|claude=claude.ai
перплексити=perplexity.ai
дипсик=chat.deepseek.com
гигачат=giga.chat
озон|ozon=ozon.ru|ozon.ru/search/?text={q}
вайлдберриз|валберис|вб|wildberries=wildberries.ru|wildberries.ru/catalog/0/search.aspx?search={q}
авито=avito.ru|avito.ru/all?q={q}
алиэкспресс|али=aliexpress.ru|aliexpress.ru/wholesale?SearchText={q}
амазон=amazon.com|amazon.com/s?k={q}
мегамаркет=megamarket.ru|megamarket.ru/catalog/?q={q}
днс|dns=dns-shop.ru|dns-shop.ru/search/?q={q}
эльдорадо=eldorado.ru
мвидео|м видео=mvideo.ru|mvideo.ru/product-list-page?q={q}
ситилинк=citilink.ru|citilink.ru/search/?text={q}
ламода=lamoda.ru|lamoda.ru/catalogsearch/result/?q={q}
золотое яблоко=goldapple.ru
летуаль=letu.ru
лента=lenta.com
перекресток|перекрёсток=perekrestok.ru
пятерочку|пятерочка=5ka.ru
вкусвилл=vkusvill.ru
самокат=samokat.ru
купер|сбермаркет=kuper.ru
деливери=market-delivery.yandex.ru
стим|steam=store.steampowered.com|store.steampowered.com/search/?term={q}
эпик геймс|epic games=store.epicgames.com
госуслуги=gosuslugi.ru
налоговую|фнс=nalog.gov.ru
мос ру|мосру=mos.ru
пенсионный фонд|соцфонд=sfr.gov.ru
сбербанк|сбер|сбербанк онлайн=online.sberbank.ru
тинькофф|т банк|тбанк=tbank.ru
альфа банк=alfabank.ru
втб=vtb.ru
газпромбанк=gazprombank.ru
райффайзен=raiffeisen.ru
почту россии=pochta.ru|pochta.ru/tracking#{q}
сдек|cdek=cdek.ru
боксберри=boxberry.ru
ржд=ticket.rzd.ru
туту|tutu=tutu.ru
авиасейлс=aviasales.ru
аэрофлот=aeroflot.ru
букинг=booking.com
островок=ostrovok.ru
суточно=sutochno.ru
циан=cian.ru
дом клик=domclick.ru
авто ру=auto.ru
дром=drom.ru
хедхантер|хх|хх ру|hh=hh.ru|hh.ru/search/vacancy?text={q}
суперджоб=superjob.ru
профи ру=profi.ru
литрес=litres.ru|litres.ru/search/?q={q}
флибусту=flibusta.is
лабиринт=labirint.ru
читай город=chitai-gorod.ru
ютуб музыку|youtube music=music.youtube.com|music.youtube.com/search?q={q}
гугл переводчик английский=translate.google.com/?sl=ru&tl=en
спортс|спортс ру=sports.ru
чемпионат=championat.com
матч тв=matchtv.ru
лента ру=lenta.ru
риа новости|риа=ria.ru
тасс=tass.ru
рбк=rbc.ru
коммерсант=kommersant.ru
известия=iz.ru
медузу|медуза=meduza.io
би би си|bbc=bbc.com
си эн эн|cnn=cnn.com
пикабу=pikabu.ru|pikabu.ru/search?q={q}
ятакси=go.yandex
кинотеатр|афишу|афиша=afisha.ru
кассир=kassir.ru
яндекс афишу=afisha.yandex.ru
гисметео=gismeteo.ru
погоду мейл=pogoda.mail.ru
вентуски|ventusky=ventusky.com
флайтрадар=flightradar24.com
спидтест|speedtest|скорость интернета=speedtest.net
2ip|два ip=2ip.ru
канву|canva=canva.com
фигму|figma=figma.com
ноушн|notion=notion.so
трелло=trello.com
мир|миро|miro=miro.com
зум|zoom веб=zoom.us
гугл мит|google meet=meet.google.com
яндекс телемост|телемост=telemost.yandex.ru
кодпен=codepen.io
реплит=replit.com
ликод|leetcode=leetcode.com
кодварс=codewars.com
степик=stepik.org
курсеру=coursera.org
юдеми=udemy.com
дуолинго=duolingo.com
кхан академи=khanacademy.org
вольфрам альфа=wolframalpha.com|wolframalpha.com/input?i={q}
десмос=desmos.com/calculator
грамматику|грамота=gramota.ru
мультитран=multitran.com
реверсо=context.reverso.net
кембридж словарь=dictionary.cambridge.org
вебархив=web.archive.org
пастебин=pastebin.com
имдб|imdb=imdb.com|imdb.com/find?q={q}
кинориум=kinorium.com
шикимори=shikimori.one
анимего=animego.org
крунчиролл=crunchyroll.com
диснеи=disneyplus.com
эпл мьюзик=music.apple.com
айклауд=icloud.com
майкрософт аккаунт=account.microsoft.com
офис|office=office.com
ворд онлайн=office.com/launch/word
эксель онлайн=office.com/launch/excel
ван драйв=onedrive.live.com
дропбокс=dropbox.com
мега|mega=mega.nz
яндекс браузер скачать=browser.yandex.ru
хром скачать=google.com/chrome
файрфокс скачать=mozilla.org/firefox
ноутбукчек=notebookcheck.net
3dnews|три дэ ньюс=3dnews.ru
ixbt|айксбт=ixbt.com
стопгейм=stopgame.ru|stopgame.ru/search?s={q}
игромания=igromania.ru
рокет лига=rocketleague.com
фэндом=fandom.com
нексус модс=nexusmods.com
гугл трендс=trends.google.com
гугл новости=news.google.com
ютуб студию=studio.youtube.com
гугл аналитику=analytics.google.com
вордстат=wordstat.yandex.ru
яндекс вебмастер=webmaster.yandex.ru
`.trim().split('\n').map((line) => {
  const [names, rest] = line.split('=');
  const [url, search] = rest.split('|');
  return { names: names.split('|'), url: 'https://' + url, search: search ? 'https://' + search : null };
});

export const SITE_INDEX = new Map();
for (const s of SITE_LIST) for (const n of s.names) SITE_INDEX.set(n, s);

function findSite(text) {
  const t = text.replace(/^(сайт|страницу|страничку)\s+/, '').trim();
  if (SITE_INDEX.has(t)) return SITE_INDEX.get(t);
  let best = null;
  for (const [name, s] of SITE_INDEX) {
    if (name.length < 4) continue;
    const sc = Math.max(similarity(t, name), similarity(translit(t), translit(name)));
    if (sc >= 0.84 && (!best || sc > best.sc)) best = { s, sc };
  }
  return best?.s || null;
}

// ═════════════════════════ языки перевода ═════════════════════════
const LANG_CODES = 'af sq am ar hy az eu be bn bs bg ca ceb zh co hr cs da nl en eo et fi fr fy gl ka de el gu ht ha haw he hi hmn hu is ig id ga it ja jv kn kk km rw ko ku ky lo la lv lt lb mk mg ms ml mt mi mr mn my ne no ny or ps fa pl pt pa ro ru sm gd sr st sn sd si sk sl so es su sw sv tl tg ta tt te th tr tk uk ur ug uz vi cy xh yi yo zu'.split(' ');
let langIndex = null;
function languages() {
  if (langIndex) return langIndex;
  const dn = new Intl.DisplayNames('ru', { type: 'language' });
  langIndex = LANG_CODES.map((code) => ({ code, name: normalize(dn.of(code) || '') })).filter((l) => l.name && l.name !== l.code);
  return langIndex;
}
function findLanguage(word) {
  const w = normalize(word);
  const list = languages();
  return list.find((l) => l.name === w) || list.find((l) => prefixMatch(w, l.name)) || null;
}

// ═════════════════════════ праздники ═════════════════════════
const HOLIDAYS = [
  ['новый год|нового года', 1, 1], ['рождество|рождества', 1, 7], ['старый новый год|старого нового года', 1, 14], ['татьянин день|татьяниного дня', 1, 25],
  ['день святого валентина|дня святого валентина|дня влюбленных|день влюбленных|валентинов день', 2, 14], ['23 февраля|дня защитника отечества|день защитника отечества', 2, 23],
  ['8 марта|восьмое марта|международный женский день|женского дня', 3, 8], ['1 апреля|дня смеха|день смеха|дня дурака', 4, 1], ['день космонавтики|дня космонавтики', 4, 12],
  ['1 мая|первомая|праздника весны и труда', 5, 1], ['9 мая|дня победы|день победы', 5, 9], ['день защиты детей|дня защиты детей', 6, 1],
  ['день россии|дня россии', 6, 12], ['день семьи|дня семьи любви и верности', 7, 8], ['1 сентября|дня знаний|день знаний', 9, 1],
  ['день программиста|дня программиста', 9, 13], ['день учителя|дня учителя', 10, 5], ['хэллоуин|хэллоуина|хеллоуина', 10, 31],
  ['день народного единства|дня народного единства', 11, 4], ['черная пятница|черной пятницы', 11, 27], ['католическое рождество|католического рождества', 12, 25],
  ['лето|лета', 6, 1], ['осень|осени', 9, 1], ['зима|зимы', 12, 1], ['весна|весны', 3, 1], ['день рождения пушкина', 6, 6], ['день матери|дня матери', 11, 29],
].map(([names, mo, d]) => ({ names: names.split('|'), mo, d }));

function daysUntil(mo, d) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  let target = new Date(now.getFullYear(), mo - 1, d);
  if (target < now) target = new Date(now.getFullYear() + 1, mo - 1, d);
  return Math.round((target - now) / 86400000);
}

// ═════════════════════════ работа с текстом ═════════════════════════
const EN = "qwertyuiop[]asdfghjkl;'zxcvbnm,./`QWERTYUIOP{}ASDFGHJKL:\"ZXCVBNM<>?~";
const RU = 'йцукенгшщзхъфывапролджэячсмитьбю.ёЙЦУКЕНГШЩЗХЪФЫВАПРОЛДЖЭЯЧСМИТЬБЮ,Ё';
export function fixLayout(s) {
  const ruCount = (s.match(/[а-яё]/gi) || []).length;
  const enCount = (s.match(/[a-z]/gi) || []).length;
  const [from, to] = enCount >= ruCount ? [EN, RU] : [RU, EN];
  return s.split('').map((c) => { const i = from.indexOf(c); return i >= 0 ? to[i] : c; }).join('');
}

const ROMAN = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
const toRoman = (n) => ROMAN.reduce((acc, [v, s]) => { while (n >= v) { acc += s; n -= v; } return acc; }, '');
const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
const isPrime = (n) => { if (n < 2 || !Number.isInteger(n)) return false; for (let i = 2; i * i <= n; i++) if (n % i === 0) return false; return true; };
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const WEEK = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];

// ═════════════════════════ команды каталога ═════════════════════════
export function catalogRules(ctx) {
  const { ext } = ctx;
  const act = (name, args) => ext.action(name, args);
  const say = (r, fb) => (r?.ok === false ? r.message : r?.message || fb);
  const rules = [];
  const add = (group, examples, match, run) => rules.push({ group, examples, match, run });

  // Пересчёт единиц.
  add('Единицы измерения', ['сколько метров в миле', 'переведи 5 футов в сантиметры', '100 фаренгейт в цельсии'], (t) => parseConversion(t),
    ({ amount, from, to }) => {
      const v = convertUnits(amount, from, to);
      const a = `${fmt(amount)} ${plural(amount, from.forms)}`;
      const b = `${fmt(v, Math.abs(v) < 0.01 ? 8 : 4)} ${plural(Math.round(v * 1e4) / 1e4, to.forms)}`;
      return `${a} — это ${b}.`;
    });

  // Валюты: любая в любую.
  add('Валюты мира', ['100 батов в рублях', 'курс юаня к евро', 'сколько стоит фунт в тенге'], (t) => parseCurrency(t),
    async ({ amount, from, to }) => {
      try {
        const { rates } = await getRates();
        if (!rates[from] || !rates[to]) return 'Для этой валюты нет курса.';
        const v = (amount / rates[from]) * rates[to];
        return `${money(from, amount)} — это ${money(to, v)}.`;
      } catch {
        return 'Не удалось получить курсы валют — нет интернета.';
      }
    });

  // Сайты: открыть и искать на сайте.
  add('Сайты', ['найди на авито велосипед', 'поищи на хабре нейросети'], (t) => {
    const m = t.match(/^(?:найди|поищи|ищи|поиск|покажи|включи|открой)\s+(?:на|в)\s+(.+?)\s+(.+)$/);
    if (!m) return null;
    // «на хабре» → «хабр», «в вк» → «вк»: подбираем сайт по началу слова
    const words = m[1].split(' ');
    for (let n = Math.min(3, words.length); n >= 1; n--) {
      const name = words.slice(0, n).join(' ');
      const rest = [...words.slice(n), m[2]].join(' ').trim();
      for (const [key, site] of SITE_INDEX) {
        if (!site.search || key.length < 2) continue;
        if (key === name || (key.length >= 3 && name.startsWith(key.slice(0, Math.max(3, key.length - 1))) && name.length - key.length <= 2)) return { site, q: rest };
      }
    }
    return null;
  }, async ({ site, q }) => say(await act('openUrl', { url: site.search.replace('{q}', enc(q)) }), `Ищу: ${q}`));
  add('Сайты', ['открой авито', 'зайди на госуслуги'], (t) => {
    const m = t.match(/^(?:открой|зайди на|зайди в|перейди на|покажи|запусти)\s+(.+)$/);
    const site = m && findSite(m[1]);
    return site ? { site } : null;
  }, async ({ site }) => say(await act('openUrl', { url: site.url }), 'Открываю'));

  // Перевод на любой язык.
  add('Перевод', ['переведи на японский доброе утро', 'переведи выделенное на немецкий'], (t) => {
    const m = t.match(/^переведи(?:\s+(это|выделенное|выделенный текст))?\s+на\s+([а-я]+)(?:\s+язык)?(?:\s+(.+))?$/) || t.match(/^переведи\s+(.+?)\s+на\s+([а-я]+)(?:\s+язык)?$/);
    if (!m) return null;
    const lang = findLanguage(m[2]);
    if (!lang) return null;
    return { lang, text: m[3] || (m[1] && !/^(это|выделенное|выделенный текст)$/.test(m[1]) ? m[1] : ''), selected: !m[3] && (!m[1] || /^(это|выделенное|выделенный текст)$/.test(m[1])) };
  }, async ({ lang, text, selected }) => {
    if (ctx.hasAI()) return { fallthrough: true };
    let src = text;
    if (!src && selected) {
      const r = await act('selectedText');
      if (!r.ok) return 'Скажите, что перевести, или выделите текст.';
      src = r.text;
    }
    return say(await act('openUrl', { url: `https://translate.google.com/?sl=auto&tl=${lang.code}&text=${enc(src.slice(0, 2000))}&op=translate` }), `Перевожу на ${lang.name}`);
  });

  // Время в любом городе мира.
  add('Мировое время', ['который час в Буэнос-Айресе', 'сколько времени в Новой Зеландии'], (t) => {
    const m = t.match(/(?:сколько (?:сейчас )?времени|который (?:сейчас )?час|время|сколько время) (?:сейчас )?(?:в|во|на) (.+)$/);
    return m ? { place: m[1] } : null;
  }, async ({ place }) => {
    let tz = null;
    let name = place;
    try {
      for (const cand of [place, place.replace(/е$/, 'а'), place.replace(/е$/, ''), place.replace(/и$/, 'ь'), place.replace(/ой$/, 'ая')]) {
        const j = await (await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${enc(cand)}&count=1&language=ru&format=json`)).json();
        if (j.results?.[0]?.timezone) { tz = j.results[0].timezone; name = j.results[0].name; break; }
      }
    } catch { /* нет сети — ищем по поясам */ }
    if (!tz) {
      const lat = translit(place).replace(/\s+/g, '');
      let best = null;
      for (const zone of Intl.supportedValuesOf('timeZone')) {
        const city = zone.split('/').pop().toLowerCase().replace(/_/g, '');
        const s = similarity(lat, city);
        if (s > 0.7 && (!best || s > best.s)) best = { zone, s };
      }
      tz = best?.zone;
    }
    if (!tz) return null;
    const time = new Intl.DateTimeFormat('ru-RU', { timeZone: tz, hour: 'numeric', minute: '2-digit', weekday: 'long' }).format(new Date());
    return `${name}: сейчас ${time}.`;
  });

  // Праздники.
  add('Праздники', ['сколько дней до дня победы', 'когда хэллоуин'], (t) => {
    const m = t.match(/^(?:сколько (?:осталось )?(?:дней )?до|через сколько дней|когда)\s+(.+)$/);
    if (!m) return null;
    const h = HOLIDAYS.find((x) => x.names.includes(m[1]));
    return h ? { h, name: m[1] } : null;
  }, ({ h, name }) => {
    const d = daysUntil(h.mo, h.d);
    if (d === 0) return `Это сегодня — ${h.d} ${MONTHS[h.mo - 1]}!`;
    return `До ${name} ${d} ${plural(d, 'день|дня|дней')}: ${h.d} ${MONTHS[h.mo - 1]}.`;
  });
  add('Даты', ['какой день недели был 12 апреля 1961 года'], (t) => {
    const m = t.match(/какой (?:это )?(?:был |будет )?день(?: недели)?(?: был| будет)?\s+(\d{1,2})\s+([а-я]+)(?:\s+(\d{3,4}))?(?:\s+года)?$/);
    if (!m) return null;
    const mo = MONTHS.findIndex((x) => m[2].startsWith(x.slice(0, 3)));
    if (mo < 0) return null;
    return { d: +m[1], mo, y: m[3] ? +m[3] : new Date().getFullYear() };
  }, ({ d, mo, y }) => `${d} ${MONTHS[mo]} ${y} года — ${WEEK[new Date(y, mo, d).getDay()]}.`);
  add('Даты', ['сколько дней прошло с 1 января 2000 года'], (t) => {
    const m = t.match(/сколько (дней|недель|лет) (?:прошло )?(?:с|со)\s+(\d{1,2})\s+([а-я]+)\s+(\d{4})/);
    if (!m) return null;
    const mo = MONTHS.findIndex((x) => m[3].startsWith(x.slice(0, 3)));
    return mo < 0 ? null : { unit: m[1], date: new Date(+m[4], mo, +m[2]) };
  }, ({ unit, date }) => {
    const days = Math.floor((Date.now() - date) / 86400000);
    if (unit === 'недель') return `Прошло ${fmt(Math.floor(days / 7))} недель.`;
    if (unit === 'лет') return `Прошло ${fmt(Math.floor(days / 365.2425))} лет.`;
    return `Прошло ${fmt(days)} ${plural(days, 'день|дня|дней')}.`;
  });

  // Математика.
  const M = [
    [/^(?:квадратный )?корень (?:квадратный )?из (-?\d+(?:\.\d+)?)$/, (m) => `Корень из ${fmt(+m[1])} — ${fmt(Math.sqrt(+m[1]))}.`],
    [/^кубический корень из (-?\d+(?:\.\d+)?)$/, (m) => `Кубический корень из ${fmt(+m[1])} — ${fmt(Math.cbrt(+m[1]))}.`],
    [/^(?:сколько будет )?(-?\d+(?:\.\d+)?) в степени (-?\d+(?:\.\d+)?)$/, (m) => `${fmt(+m[1])} в степени ${fmt(+m[2])} — ${fmt(Math.pow(+m[1], +m[2]))}.`],
    [/^(?:квадрат числа|квадрат) (-?\d+(?:\.\d+)?)$/, (m) => `Квадрат ${fmt(+m[1])} — ${fmt(m[1] * m[1])}.`],
    [/^(?:куб числа|куб) (-?\d+(?:\.\d+)?)$/, (m) => `Куб ${fmt(+m[1])} — ${fmt(m[1] ** 3)}.`],
    [/^факториал (\d+)$/, (m) => { const n = +m[1]; if (n > 170) return 'Слишком большое число.'; let r = 1; for (let i = 2; i <= n; i++) r *= i; return `Факториал ${n} — ${fmt(r, 0)}.`; }],
    [/^(синус|косинус|тангенс|котангенс) (-?\d+(?:\.\d+)?)(?: градус[а-я]*)?$/, (m) => {
      const x = (+m[2] * Math.PI) / 180;
      const v = { синус: Math.sin(x), косинус: Math.cos(x), тангенс: Math.tan(x), котангенс: 1 / Math.tan(x) }[m[1]];
      return `${m[1][0].toUpperCase() + m[1].slice(1)} ${fmt(+m[2])} градусов — ${fmt(v)}.`;
    }],
    [/^(?:десятичный )?логарифм (?:числа )?(\d+(?:\.\d+)?)$/, (m) => `Десятичный логарифм ${fmt(+m[1])} — ${fmt(Math.log10(+m[1]))}.`],
    [/^натуральный логарифм (?:числа )?(\d+(?:\.\d+)?)$/, (m) => `Натуральный логарифм ${fmt(+m[1])} — ${fmt(Math.log(+m[1]))}.`],
    [/^(?:логарифм|лог) (\d+(?:\.\d+)?) по основанию (\d+(?:\.\d+)?)$/, (m) => `Логарифм ${fmt(+m[1])} по основанию ${fmt(+m[2])} — ${fmt(Math.log(+m[1]) / Math.log(+m[2]))}.`],
    [/^сколько процентов (?:составляет )?(\d+(?:\.\d+)?) от (\d+(?:\.\d+)?)$/, (m) => `${fmt(+m[1])} — это ${fmt((m[1] / m[2]) * 100, 2)} процента от ${fmt(+m[2])}.`],
    [/^(\d+(?:\.\d+)?) (?:плюс|прибавить) (\d+(?:\.\d+)?) процент[а-я]*$/, (m) => `${fmt(+m[1])} плюс ${fmt(+m[2])}% — ${fmt(m[1] * (1 + m[2] / 100), 2)}.`],
    [/^(\d+(?:\.\d+)?) минус (\d+(?:\.\d+)?) процент[а-я]*$/, (m) => `${fmt(+m[1])} минус ${fmt(+m[2])}% — ${fmt(m[1] * (1 - m[2] / 100), 2)}.`],
    [/^округли (-?\d+(?:\.\d+)?)(?: до (\d+) знак[а-я]*)?$/, (m) => `Получается ${fmt(+(+m[1]).toFixed(+m[2] || 0), +m[2] || 0)}.`],
    [/^(?:наибольший общий делитель|нод)(?: чисел)? (\d+) и (\d+)$/, (m) => `НОД — ${gcd(+m[1], +m[2])}.`],
    [/^(?:наименьшее общее кратное|нок)(?: чисел)? (\d+) и (\d+)$/, (m) => `НОК — ${(+m[1] * +m[2]) / gcd(+m[1], +m[2])}.`],
    [/^(?:число )?(\d+) простое(?: число)?$|^простое ли (?:число )?(\d+)$/, (m) => { const n = +(m[1] || m[2]); return isPrime(n) ? `Да, ${n} — простое число.` : `Нет, ${n} не простое.`; }],
    [/^(?:переведи )?(\d+) в (двоичн|восьмеричн|шестнадцатеричн)[а-я]*(?: систему| виде| код)?$/, (m) => {
      const base = { двоичн: 2, восьмеричн: 8, шестнадцатеричн: 16 }[m[2]];
      return `В ${{ 2: 'двоичной', 8: 'восьмеричной', 16: 'шестнадцатеричной' }[base]} системе: ${(+m[1]).toString(base).toUpperCase().split('').join(' ')}.`;
    }],
    [/^(?:переведи )?(\d+) (?:в )?римск[а-я]*(?: цифр[а-я]*| числ[а-я]*)?$|^(\d+) римскими цифрами$/, (m) => { const n = +(m[1] || m[2]); return n > 0 && n < 4000 ? `Римскими цифрами: ${toRoman(n).split('').join(' ')}.` : 'Римскими цифрами пишут числа от 1 до 3999.'; }],
    [/^(?:модуль|абсолютное значение) (-?\d+(?:\.\d+)?)$/, (m) => `Модуль — ${fmt(Math.abs(+m[1]))}.`],
    [/^(?:число )?пи$|^чему равно пи$/, () => `Пи примерно равно ${fmt(Math.PI, 10)}.`],
    [/^(\d+(?:\.\d+)?) градус[а-я]* в радиан[а-я]*$/, (m) => `${fmt(+m[1])} градусов — ${fmt((+m[1] * Math.PI) / 180)} радиан.`],
  ];
  add('Математика', ['корень из 144', 'факториал 10', 'синус 30', '255 в шестнадцатеричную', '2024 римскими цифрами'], (t) => {
    const s = t.replace(/^(?:сколько будет|посчитай|вычисли|чему равен|чему равна|чему равно)\s+/, '');
    for (const [re, fn] of M) { const m = s.match(re); if (m) return { m, fn }; }
    return null;
  }, ({ m, fn }) => fn(m));

  // Работа с выделенным текстом.
  const T = [
    [/^(?:исправь|поменяй|смени) раскладку(?: в выделенном| выделенного)?$/, 'Исправил раскладку.', fixLayout],
    [/^(?:сделай )?(?:выделенное |текст )?(?:заглавными|прописными|большими) буквами$|^в верхний регистр$/, 'Сделал заглавными.', (s) => s.toUpperCase()],
    [/^(?:сделай )?(?:выделенное |текст )?(?:строчными|маленькими) буквами$|^в нижний регистр$/, 'Сделал строчными.', (s) => s.toLowerCase()],
    [/^(?:сделай )?(?:каждое слово )?с большой буквы$/, 'Готово.', (s) => s.toLowerCase().replace(/(^|[\s.!?«"(])([a-zа-яё])/g, (a, p, c) => p + c.toUpperCase())],
    [/^(?:транслитерируй|переведи в транслит|транслитом)(?: выделенное)?$/, 'Готово.', (s) => translit(s)],
    [/^переверни (?:текст|выделенное)$/, 'Перевернул.', (s) => s.split('').reverse().join('')],
    [/^убери (?:лишние )?пробелы$/, 'Убрал лишние пробелы.', (s) => s.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim()],
    [/^отсортируй строки$/, 'Отсортировал.', (s) => s.split(/\r?\n/).sort((a, b) => a.localeCompare(b, 'ru')).join('\n')],
  ];
  add('Работа с текстом', ['исправь раскладку', 'сделай заглавными буквами', 'переверни текст'], (t) => {
    for (const [re, msg, fn] of T) if (re.test(t)) return { msg, fn };
    return null;
  }, async ({ msg, fn }) => {
    const r = await act('selectedText');
    if (!r.ok) return 'Сначала выделите текст.';
    await act('typeText', { text: fn(r.text) });
    return msg;
  });
  add('Работа с текстом', ['сколько слов в выделенном'], (t) => /^(?:сколько|посчитай) (?:слов|символов|букв)(?: в выделенном| в тексте)?$/.test(t),
    async () => {
      const r = await act('selectedText');
      if (!r.ok) return 'Сначала выделите текст.';
      const words = (r.text.match(/[\p{L}\p{N}]+/gu) || []).length;
      return `Слов: ${words}, символов: ${r.text.length}, без пробелов: ${r.text.replace(/\s/g, '').length}.`;
    });

  // Генераторы.
  add('Генераторы', ['сгенерируй uuid', 'случайный цвет'], (t) => t.match(/^(?:сгенерируй|создай|дай|придумай)?\s*(uuid|гуид|guid|юид|случайный цвет|случайное имя|случайную букву|случайную карту)$/),
    async (m) => {
      const k = m[1];
      if (/uuid|гуид|guid|юид/.test(k)) { const u = crypto.randomUUID(); await act('copyText', { text: u }); return 'UUID скопирован в буфер обмена.'; }
      if (k === 'случайный цвет') { const c = '#' + crypto.getRandomValues(new Uint8Array(3)).reduce((s, b) => s + b.toString(16).padStart(2, '0'), ''); await act('copyText', { text: c }); return `Цвет ${c.slice(1).split('').join(' ')} скопирован.`; }
      if (k === 'случайное имя') { const n = ['Александр', 'Мария', 'Иван', 'Анна', 'Дмитрий', 'Екатерина', 'Максим', 'София', 'Артём', 'Виктория', 'Михаил', 'Полина']; return n[Math.floor(Math.random() * n.length)] + '.'; }
      if (k === 'случайную букву') return 'Буква ' + 'АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЭЮЯ'[Math.floor(Math.random() * 27)] + '.';
      const suits = ['червей', 'бубен', 'треф', 'пик'];
      const ranks = ['двойка', 'тройка', 'четвёрка', 'пятёрка', 'шестёрка', 'семёрка', 'восьмёрка', 'девятка', 'десятка', 'валет', 'дама', 'король', 'туз'];
      return `${ranks[Math.floor(Math.random() * 13)]} ${suits[Math.floor(Math.random() * 4)]}.`.replace(/^./, (c) => c.toUpperCase());
    });

  return rules;
}

// ═════════════════════════ подсчёт ═════════════════════════
/** Сколько конкретных команд знает каталог (каждая — реально выполнимая). */
export function catalogStats(extra = {}) {
  const cats = {};
  for (const u of U) cats[u.cat] = (cats[u.cat] || 0) + 1;
  const unitPairs = Object.values(cats).reduce((s, n) => s + n * (n - 1), 0);
  let rates = null;
  try { rates = JSON.parse(localStorage.getItem(RATES_KEY) || 'null')?.rates; } catch { /* нет хранилища */ }
  const curCodes = currencyIndex().filter((c) => !rates || rates[c.code]).length;
  const nCur = rates ? curCodes : Math.min(curCodes, 160);
  const siteSearch = SITE_LIST.filter((s) => s.search).length;
  const rows = [
    ['Конвертация валют (любая в любую)', nCur * (nCur - 1)],
    ['Курсы валют', nCur],
    ['Пересчёт единиц измерения', unitPairs],
    ['Время в часовых поясах мира', Intl.supportedValuesOf('timeZone').length],
    ['Открыть сайт', SITE_LIST.length],
    ['Поиск на сайте', siteSearch],
    ['Перевод на язык', languages().length],
    ['Праздники и даты', HOLIDAYS.length + 2],
    ['Математика', 22],
    ['Работа с текстом и генераторы', 15],
    ...Object.entries(extra),
  ];
  return { total: rows.reduce((s, [, n]) => s + n, 0), rows };
}
