// Распознавание речи (Vosk, офлайн), синтез речи и звуковые сигналы.

const MODEL_URL = 'app://externalai/model/ru.tar.gz';

export class Recognizer extends EventTarget {
  constructor() {
    super();
    this.model = null;
    this.recognizer = null;
    this.ctx = null;
    this.stream = null;
    this.analyser = null;
    this.freq = null;
    this.enabled = true;   // пользователь может «выключить уши»
    this.ready = false;
  }

  emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  async loadModel() {
    if (!window.Vosk) throw new Error('Движок Vosk не загрузился');
    this.emit('status', { stage: 'model' });
    // Своя обёртка вместо Vosk.createModel: та не сообщает об ошибке загрузки и ждёт вечно.
    const model = new window.Vosk.Model(MODEL_URL);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Модель речи загружается слишком долго')), 180000);
      model.on('load', (m) => {
        clearTimeout(timer);
        if (m.result) resolve();
        else reject(new Error('Не удалось загрузить модель речи'));
      });
      model.on('error', (m) => {
        clearTimeout(timer);
        reject(new Error('Ошибка модели речи: ' + (m.error || 'неизвестно')));
      });
    });
    this.model = model;
    return model;
  }

  async start() {
    if (!this.model) await this.loadModel();
    this.emit('status', { stage: 'mic' });
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      video: false,
    });
    this.ctx = new AudioContext();
    const source = this.ctx.createMediaStreamSource(this.stream);

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.smoothingTimeConstant = 0.7;
    this.freq = new Uint8Array(this.analyser.frequencyBinCount);
    this.wave = new Uint8Array(this.analyser.fftSize);
    source.connect(this.analyser);

    this.createRecognizer();

    const processor = this.ctx.createScriptProcessor(4096, 1, 1);
    processor.onaudioprocess = (e) => {
      if (!this.enabled || !this.recognizer) return;
      try {
        this.recognizer.acceptWaveform(e.inputBuffer);
      } catch (err) {
        console.warn('acceptWaveform', err);
      }
    };
    source.connect(processor);
    // ScriptProcessor работает, только если подключён к выходу; глушим звук.
    const mute = this.ctx.createGain();
    mute.gain.value = 0;
    processor.connect(mute);
    mute.connect(this.ctx.destination);
    this.processor = processor;

    navigator.mediaDevices.addEventListener?.('devicechange', () => this.emit('devicechange'));
    this.ready = true;
    this.emit('status', { stage: 'ready' });
  }

  createRecognizer() {
    if (this.recognizer) {
      try { this.recognizer.remove(); } catch { /* уже удалён */ }
    }
    const rec = new this.model.KaldiRecognizer(this.ctx.sampleRate);
    rec.on('result', (m) => {
      const text = (m.result?.text || '').trim();
      if (text) this.emit('final', { text });
    });
    rec.on('partialresult', (m) => {
      const text = (m.result?.partial || '').trim();
      if (text) this.emit('partial', { text });
    });
    rec.on('error', (m) => this.emit('error', { error: m.error }));
    this.recognizer = rec;
  }

  // Сбросить незавершённую фразу (например, после озвучивания ответа).
  flush() {
    if (this.recognizer && this.model) this.createRecognizer();
  }

  level() {
    if (!this.analyser) return { level: 0, spectrum: null };
    this.analyser.getByteTimeDomainData(this.wave);
    let sum = 0;
    for (let i = 0; i < this.wave.length; i++) {
      const v = (this.wave[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / this.wave.length);
    this.analyser.getByteFrequencyData(this.freq);
    return { level: Math.min(1, rms * 4.5), spectrum: this.freq };
  }

  setEnabled(v) {
    this.enabled = v;
    if (this.ctx) (v ? this.ctx.resume() : this.ctx.suspend()).catch(() => {});
  }
}

// ───────────────────────── синтез речи ─────────────────────────

export class Speaker extends EventTarget {
  constructor() {
    super();
    this.settings = { ttsEnabled: true, ttsVoice: '', ttsRate: 1, ttsPitch: 1, ttsVolume: 1 };
    this.voices = [];
    this.speaking = false;
    this.queue = 0;
    this.loadVoices();
    speechSynthesis.addEventListener?.('voiceschanged', () => this.loadVoices());
  }

  loadVoices() {
    this.voices = speechSynthesis.getVoices();
    this.dispatchEvent(new CustomEvent('voices', { detail: this.voices }));
  }

  ruVoices() {
    return this.voices.filter((v) => /^ru/i.test(v.lang));
  }

  pickVoice() {
    const wanted = this.settings.ttsVoice;
    if (wanted) {
      const v = this.voices.find((x) => x.voiceURI === wanted || x.name === wanted);
      if (v) return v;
    }
    const ru = this.ruVoices();
    const prefer = ['Natural', 'Online', 'Google', 'Svetlana', 'Dmitry', 'Pavel', 'Irina', 'Milena', 'Yuri'];
    for (const p of prefer) {
      const v = ru.find((x) => x.name.includes(p));
      if (v) return v;
    }
    return ru[0] || null;
  }

  configure(s) {
    Object.assign(this.settings, s);
  }

  // Убираем из текста то, что плохо звучит вслух.
  static clean(text) {
    return String(text || '')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/https?:\/\/\S+/g, 'ссылка')
      .replace(/[*_#>`~|]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  static split(text) {
    const parts = text.match(/[^.!?…]+[.!?…]*/g) || [text];
    const out = [];
    let cur = '';
    for (const p of parts) {
      if ((cur + p).length > 220 && cur) { out.push(cur.trim()); cur = p; } else cur += p;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  }

  speak(text) {
    return new Promise((resolve) => {
      const clean = Speaker.clean(text);
      if (!this.settings.ttsEnabled || !clean) return resolve();
      this.stop();
      const chunks = Speaker.split(clean);
      const voice = this.pickVoice();
      let left = chunks.length;
      this.speaking = true;
      this.dispatchEvent(new Event('start'));
      const done = () => {
        if (--left > 0) return;
        this.speaking = false;
        this.dispatchEvent(new Event('end'));
        resolve();
      };
      for (const chunk of chunks) {
        const u = new SpeechSynthesisUtterance(chunk);
        u.lang = voice?.lang || 'ru-RU';
        if (voice) u.voice = voice;
        u.rate = this.settings.ttsRate;
        u.pitch = this.settings.ttsPitch;
        u.volume = this.settings.ttsVolume;
        u.onend = done;
        u.onerror = done;
        speechSynthesis.speak(u);
      }
      // Подстраховка: если движок «завис», всё равно завершаем.
      setTimeout(() => {
        if (this.speaking && !speechSynthesis.speaking) {
          left = 1;
          done();
        }
      }, 4000 + clean.length * 120);
    });
  }

  stop() {
    if (speechSynthesis.speaking || speechSynthesis.pending) speechSynthesis.cancel();
    if (this.speaking) {
      this.speaking = false;
      this.dispatchEvent(new Event('end'));
    }
  }
}

// ───────────────────────── звуки ─────────────────────────

let audioCtx = null;
function ac() {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

function tone(freq, start, dur, { type = 'sine', gain = 0.12, slide = 0 } = {}) {
  const ctx = ac();
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, ctx.currentTime + start);
  if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, ctx.currentTime + start + dur);
  g.gain.setValueAtTime(0.0001, ctx.currentTime + start);
  g.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + start + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
  o.connect(g).connect(ctx.destination);
  o.start(ctx.currentTime + start);
  o.stop(ctx.currentTime + start + dur + 0.05);
}

export const Sounds = {
  enabled: true,
  wake() { if (this.enabled) { tone(660, 0, 0.12); tone(990, 0.09, 0.18); } },
  done() { if (this.enabled) { tone(880, 0, 0.1, { gain: 0.07 }); } },
  cancel() { if (this.enabled) { tone(520, 0, 0.14, { gain: 0.08, slide: 0.6 }); } },
  error() { if (this.enabled) { tone(300, 0, 0.18, { type: 'triangle', gain: 0.1 }); tone(220, 0.16, 0.25, { type: 'triangle', gain: 0.1 }); } },
  boot() { if (this.enabled) { tone(220, 0, 0.5, { gain: 0.05, slide: 4 }); tone(880, 0.45, 0.25, { gain: 0.06 }); } },
  alarm() { for (let i = 0; i < 6; i++) { tone(1046, i * 0.32, 0.14, { type: 'square', gain: 0.06 }); tone(1318, i * 0.32 + 0.14, 0.14, { type: 'square', gain: 0.06 }); } },
};
