// Общие текстовые утилиты (main + renderer): нормализация, транслит,
// нечёткое сравнение и разбор русских числительных.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TextUtils = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function normalize(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/ё/g, 'е')
      .replace(/[«»"“”„'`’]/g, '')
      .replace(/[^\p{L}\p{N}\s.:+\-*/%,]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  const MAP = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm',
    н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch',
    ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  };
  function translit(s) {
    return String(s || '').toLowerCase().split('').map((c) => (c in MAP ? MAP[c] : c)).join('');
  }

  function levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[b.length];
  }

  function similarity(a, b) {
    a = String(a || ''); b = String(b || '');
    const len = Math.max(a.length, b.length);
    return len ? 1 - levenshtein(a, b) / len : 1;
  }

  // ───── русские числительные → число ─────
  const UNITS = {
    ноль: 0, нуль: 0, один: 1, одна: 1, одну: 1, одного: 1, два: 2, две: 2, двух: 2, три: 3, трех: 3,
    четыре: 4, четырех: 4, пять: 5, пяти: 5, шесть: 6, шести: 6, семь: 7, семи: 7, восемь: 8, восьми: 8,
    девять: 9, девяти: 9, десять: 10, десяти: 10, одиннадцать: 11, двенадцать: 12, тринадцать: 13,
    четырнадцать: 14, пятнадцать: 15, шестнадцать: 16, семнадцать: 17, восемнадцать: 18, девятнадцать: 19,
    двадцать: 20, двадцати: 20, тридцать: 30, тридцати: 30, сорок: 40, сорока: 40, пятьдесят: 50, пятидесяти: 50,
    шестьдесят: 60, семьдесят: 70, восемьдесят: 80, девяносто: 90, сто: 100, двести: 200, триста: 300,
    четыреста: 400, пятьсот: 500, шестьсот: 600, семьсот: 700, восемьсот: 800, девятьсот: 900,
    полтора: 1.5, полторы: 1.5,
  };
  const MULT = { тысяча: 1000, тысячи: 1000, тысяч: 1000, тысячу: 1000, миллион: 1e6, миллиона: 1e6, миллионов: 1e6, миллиард: 1e9, миллиарда: 1e9, миллиардов: 1e9 };

  // Заменяет последовательности слов-чисел на цифры: «двадцать пять минут» → «25 минут».
  function wordsToNumbers(text) {
    const words = String(text || '').split(' ');
    const out = [];
    let total = 0, current = 0, active = false;
    const flush = () => {
      if (active) out.push(String(total + current));
      total = 0; current = 0; active = false;
    };
    for (const w of words) {
      if (w in UNITS) { current += UNITS[w]; active = true; }
      else if (w in MULT) { total += (current || 1) * MULT[w]; current = 0; active = true; }
      else if (/^\d+([.,]\d+)?$/.test(w)) {
        if (active) flush();
        out.push(w.replace(',', '.'));
      } else { flush(); out.push(w); }
    }
    flush();
    return out.join(' ').replace(/(\d+) (и|с) половиной/g, (_, n) => String(+n + 0.5));
  }

  return { normalize, translit, levenshtein, similarity, wordsToNumbers };
});
