'use strict';
// «Мозг» ExternalAI: Claude с инструментами для управления компьютером.
// Всё, что не покрыто локальными командами, уходит сюда.
const os = require('os');
const Anthropic = require('@anthropic-ai/sdk');
const actions = require('./actions');
const store = require('./store');

const MAX_STEPS = 14;
const MAX_HISTORY = 40; // сообщений; дальше начинаем новый диалог

const SYSTEM_PROMPT = `Ты — ExternalAI, персональный голосовой ассистент в духе J.A.R.V.I.S. из «Железного человека».
Ты работаешь прямо на компьютере пользователя и умеешь им управлять через инструменты.

Как отвечать:
- Всегда по-русски. Ответ будет озвучен синтезатором речи, поэтому пиши обычным разговорным текстом: без markdown, списков, эмодзи, ссылок и кода в ответе.
- Коротко: 1–3 предложения. Длиннее — только если пользователь просит рассказать подробно.
- Тон: вежливый, уверенный, с лёгкой иронией дворецкого. Обращайся к пользователю «сэр», если не указано иное имя.
- Числа, которые надо произнести, пиши словами или простыми цифрами; не используй сложные символы.

Как действовать:
- Если просьба требует действия на компьютере — выполняй её инструментами, а не объясняй, как сделать вручную.
- Для всего, что не покрывают специальные инструменты, используй run_command (на Windows это PowerShell, на Linux/macOS — bash). Пиши надёжные неинтерактивные команды.
- Перед необратимыми действиями (удаление файлов, форматирование, изменение системных настроек) коротко опиши, что собираешься сделать; пользователь подтвердит запуск команды в окне подтверждения.
- Для свежих фактов, новостей, курсов, расписаний используй веб-поиск, если он доступен.
- Если инструмент вернул ошибку — попробуй другой способ, а если не вышло, честно скажи, что не получилось.
- После действия кратко сообщи результат.`;

function toolDefs() {
  const s = store.get();
  const tools = [
    {
      name: 'run_command',
      description: 'Выполнить команду в системной оболочке пользователя (Windows — PowerShell, Linux/macOS — bash) и вернуть stdout/stderr. Используй для любых действий, для которых нет отдельного инструмента: работа с файлами, сетью, настройками, установка программ, получение информации о системе.',
      input_schema: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Команда целиком.' },
          explanation: { type: 'string', description: 'Короткое объяснение по-русски для окна подтверждения: что сделает команда.' },
          timeout_sec: { type: 'integer', description: 'Тайм-аут в секундах (5–300), по умолчанию 60.' },
        },
        required: ['command', 'explanation'],
      },
    },
    {
      name: 'open_url',
      description: 'Открыть сайт или ссылку в браузере по умолчанию. Для поиска используй ссылку поисковика с запросом.',
      input_schema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
    },
    {
      name: 'open_app',
      description: 'Запустить установленную программу по названию (по-русски или по-английски), например «Telegram», «калькулятор», «Steam».',
      input_schema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    },
    {
      name: 'close_app',
      description: 'Закрыть запущенную программу по названию.',
      input_schema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    },
    {
      name: 'open_path',
      description: 'Открыть файл или папку. Можно передать путь или одно из слов: downloads, documents, desktop, pictures, music, videos, home.',
      input_schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
    },
    {
      name: 'set_volume',
      description: 'Управление громкостью системы.',
      input_schema: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['up', 'down', 'mute', 'unmute', 'set'] },
          amount: { type: 'integer', description: 'Шаг или уровень в процентах (0–100).' },
        },
        required: ['action'],
      },
    },
    {
      name: 'media_control',
      description: 'Управление воспроизведением музыки и видео (медиаклавиши).',
      input_schema: { type: 'object', properties: { action: { type: 'string', enum: ['playpause', 'next', 'prev', 'stop'] } }, required: ['action'] },
    },
    {
      name: 'power',
      description: 'Питание компьютера: выключение, перезагрузка, сон, блокировка, выход, отмена запланированного выключения. Всегда требует подтверждения пользователя.',
      input_schema: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['shutdown', 'restart', 'sleep', 'hibernate', 'lock', 'logoff', 'cancel'] },
          delay_seconds: { type: 'integer' },
        },
        required: ['action'],
      },
    },
    {
      name: 'take_screenshot',
      description: 'Сделать снимок экрана, сохранить в «Изображения/ExternalAI» и скопировать в буфер обмена.',
      input_schema: { type: 'object', properties: {} },
    },
    {
      name: 'type_text',
      description: 'Напечатать текст в активное окно (через вставку из буфера).',
      input_schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
    },
    {
      name: 'clipboard',
      description: 'Прочитать или записать буфер обмена.',
      input_schema: { type: 'object', properties: { action: { type: 'string', enum: ['read', 'write'] }, text: { type: 'string' } }, required: ['action'] },
    },
    {
      name: 'system_info',
      description: 'Загрузка процессора, память, ОС, время работы.',
      input_schema: { type: 'object', properties: {} },
    },
    {
      name: 'set_timer',
      description: 'Поставить таймер или напоминание. По окончании ассистент озвучит текст.',
      input_schema: {
        type: 'object',
        properties: { seconds: { type: 'integer' }, label: { type: 'string', description: 'Что напомнить.' } },
        required: ['seconds'],
      },
    },
    {
      name: 'notes',
      description: 'Заметки пользователя: добавить, прочитать все, очистить.',
      input_schema: { type: 'object', properties: { action: { type: 'string', enum: ['add', 'list', 'clear'] }, text: { type: 'string' } }, required: ['action'] },
    },
  ];
  if (s.ai.webSearch) tools.push({ type: 'web_search_20260209', name: 'web_search', max_uses: 5 });
  return tools;
}

let client = null;
let clientKey = '';
let history = [];
let lastActivity = 0;

function getClient() {
  const { apiKey, baseURL } = store.get().ai;
  const key = `${apiKey}|${baseURL}`;
  if (!client || key !== clientKey) {
    client = new Anthropic({ apiKey, baseURL: baseURL || undefined, timeout: 120000, maxRetries: 2 });
    clientKey = key;
  }
  return client;
}

function reset() {
  history = [];
}

function contextLine() {
  const now = new Date();
  const s = store.get();
  const name = s.userName ? `Пользователя зовут ${s.userName}. ` : '';
  return `[Контекст: ${now.toLocaleString('ru-RU', { dateStyle: 'full', timeStyle: 'short' })}; ОС: ${os.type()} ${os.release()} (${process.platform}); пользователь системы: ${os.userInfo().username}; город: ${s.system.city}. ${name}]`;
}

/**
 * Выполняет инструмент. `bridge` даёт доступ к окну:
 *   bridge.confirm({title, text, details}) → Promise<boolean>
 *   bridge.call(method, payload) → Promise<any> (таймеры и т. п. в интерфейсе)
 *   bridge.win → BrowserWindow
 *   bridge.log(event) → показать действие в интерфейсе
 */
async function runTool(name, input, bridge) {
  const s = store.get();
  input = input || {};
  switch (name) {
    case 'run_command': {
      if (typeof input.command !== 'string' || !input.command.trim()) return { ok: false, message: 'Пустая команда' };
      if (s.ai.shellPolicy === 'never') return { ok: false, message: 'Пользователь запретил выполнение команд в настройках.' };
      if (s.ai.shellPolicy !== 'always') {
        const yes = await bridge.confirm({ title: 'Выполнить команду?', text: input.explanation || 'ИИ хочет выполнить команду', details: input.command });
        if (!yes) return { ok: false, message: 'Пользователь отклонил выполнение команды.' };
      }
      bridge.log({ type: 'command', text: input.command });
      return actions.runShell(input.command, input.timeout_sec || 60);
    }
    case 'open_url': return actions.openUrl(input.url);
    case 'open_app': return actions.openApp(input.name);
    case 'close_app': return actions.closeApp(input.name);
    case 'open_path': return actions.openPath(input.path);
    case 'set_volume': return actions.volume(input.action, input.amount ?? 10);
    case 'media_control': return actions.media(input.action);
    case 'power': {
      const labels = { shutdown: 'Выключить компьютер', restart: 'Перезагрузить компьютер', sleep: 'Перевести в сон', hibernate: 'Гибернация', lock: 'Заблокировать', logoff: 'Выйти из системы', cancel: 'Отменить выключение' };
      if (input.action !== 'cancel' && input.action !== 'lock') {
        const yes = await bridge.confirm({ title: labels[input.action] || 'Питание', text: 'Подтвердите действие', details: input.delay_seconds ? `Через ${input.delay_seconds} сек.` : 'Сейчас' });
        if (!yes) return { ok: false, message: 'Пользователь отменил.' };
      }
      return actions.power(input.action, input.delay_seconds || 0);
    }
    case 'take_screenshot': return actions.screenshot(bridge.win);
    case 'type_text': return actions.typeText(input.text, bridge.win);
    case 'clipboard': return input.action === 'write' ? actions.copyText(input.text) : actions.readClipboard();
    case 'system_info': return actions.systemInfo();
    case 'set_timer': return bridge.call('timer', { seconds: input.seconds, label: input.label || '' });
    case 'notes': {
      const notes = s.notes || [];
      if (input.action === 'add' && input.text) {
        store.set('notes', [...notes, { text: input.text, at: Date.now() }]);
        bridge.call('notesChanged', {});
        return { ok: true, message: 'Заметка сохранена' };
      }
      if (input.action === 'clear') {
        store.set('notes', []);
        bridge.call('notesChanged', {});
        return { ok: true, message: 'Заметки удалены' };
      }
      return { ok: true, notes: notes.map((n) => n.text) };
    }
    default:
      return { ok: false, message: 'Неизвестный инструмент ' + name };
  }
}

function friendlyError(e) {
  if (e instanceof Anthropic.AuthenticationError) return 'API-ключ Claude неверный. Проверьте его в настройках.';
  if (e instanceof Anthropic.PermissionDeniedError) return 'Доступ к Claude запрещён для этого ключа или региона. Можно указать адрес прокси в настройках ИИ.';
  if (e instanceof Anthropic.NotFoundError) return 'Модель не найдена. Выберите другую модель в настройках.';
  if (e instanceof Anthropic.RateLimitError) return 'Слишком много запросов к Claude, попробуйте через минуту.';
  if (e instanceof Anthropic.BadRequestError) return 'Claude отклонил запрос: ' + (e.message || '').slice(0, 200);
  if (e instanceof Anthropic.APIConnectionError) return 'Нет связи с сервером Claude. Проверьте интернет.';
  if (e instanceof Anthropic.APIError) return `Ошибка Claude (${e.status}).`;
  return 'Ошибка: ' + (e?.message || String(e));
}

/**
 * Задать вопрос ИИ. Возвращает { ok, text }.
 */
async function ask(text, bridge) {
  const s = store.get();
  if (!s.ai.apiKey) {
    return { ok: false, needsKey: true, text: 'Чтобы я мог выполнять любые просьбы, подключите ИИ: вставьте API-ключ Claude в настройках.' };
  }
  if (Date.now() - lastActivity > 30 * 60 * 1000 || history.length > MAX_HISTORY) history = [];
  lastActivity = Date.now();

  const persona = s.ai.persona ? `\n\nДополнительные указания пользователя:\n${s.ai.persona}` : '';
  const messages = history.slice();
  messages.push({ role: 'user', content: `${contextLine()}\n${text}` });

  const anthropic = getClient();
  const tools = toolDefs();
  let finalText = '';

  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      const params = {
        model: s.ai.model || 'claude-opus-5-5',
        max_tokens: 16000,
        system: SYSTEM_PROMPT + persona,
        cache_control: { type: 'ephemeral' },
        output_config: { effort: s.ai.effort || 'low' },
        tools,
        messages,
      };
      let response;
      if (s.ai.fallbacks) {
        // Если модель откажется по правилам безопасности, сервер сам повторит запрос на запасной модели.
        response = await anthropic.beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' });
      } else {
        response = await anthropic.messages.create(params);
      }

      messages.push({ role: 'assistant', content: response.content });
      const textNow = response.content.filter((b) => b.type === 'text').map((b) => b.text).join(' ').trim();
      if (textNow) finalText = textNow;

      if (response.stop_reason === 'refusal') {
        finalText = finalText || 'Извините, с этим я помочь не могу.';
        break;
      }
      if (response.stop_reason === 'pause_turn') continue; // веб-поиск ещё идёт
      if (response.stop_reason === 'max_tokens') {
        finalText = finalText || 'Ответ получился слишком длинным, переформулируйте, пожалуйста.';
        break;
      }

      const calls = response.content.filter((b) => b.type === 'tool_use');
      if (response.stop_reason !== 'tool_use' || calls.length === 0) break;

      const results = [];
      for (const call of calls) {
        bridge.log({ type: 'tool', name: call.name, input: call.input });
        let result;
        try {
          result = await runTool(call.name, call.input, bridge);
        } catch (e) {
          result = { ok: false, message: String(e?.message || e) };
        }
        bridge.log({ type: 'tool-result', name: call.name, ok: result?.ok !== false, message: result?.message });
        results.push({
          type: 'tool_result',
          tool_use_id: call.id,
          content: JSON.stringify(result ?? { ok: true }).slice(0, 12000),
          is_error: result?.ok === false,
        });
      }
      messages.push({ role: 'user', content: results });
    }
  } catch (e) {
    console.error('AI error', e);
    return { ok: false, text: friendlyError(e) };
  }

  // Сохраняем диалог целиком (включая блоки размышлений), чтобы следующий
  // запрос продолжил его без правок истории.
  history = messages;
  return { ok: true, text: finalText || 'Готово.' };
}

async function testKey() {
  try {
    const s = store.get();
    const r = await getClient().messages.create({
      model: s.ai.model || 'claude-opus-5-5',
      max_tokens: 200,
      output_config: { effort: 'low' },
      messages: [{ role: 'user', content: 'Ответь одним словом: работает?' }],
    });
    const t = r.content.filter((b) => b.type === 'text').map((b) => b.text).join(' ');
    return { ok: true, text: t || 'OK' };
  } catch (e) {
    return { ok: false, text: friendlyError(e) };
  }
}

module.exports = { ask, reset, testKey };
