// Анимированное «ядро» ассистента: кольца, деления, спектр голоса.
const STATES = {
  boot: { color: [34, 211, 238], speed: 0.4, glow: 0.4 },
  idle: { color: [34, 211, 238], speed: 0.25, glow: 0.55 },
  listening: { color: [125, 249, 255], speed: 0.9, glow: 1 },
  thinking: { color: [167, 139, 250], speed: 2.4, glow: 0.85 },
  speaking: { color: [34, 211, 238], speed: 0.6, glow: 0.95 },
  muted: { color: [100, 116, 139], speed: 0.08, glow: 0.25 },
  error: { color: [244, 63, 94], speed: 0.5, glow: 0.8 },
  alarm: { color: [251, 191, 36], speed: 1.6, glow: 1 },
};

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export class Reactor {
  constructor(canvas, { mini = false } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.mini = mini;
    this.state = 'boot';
    this.color = [...STATES.boot.color];
    this.glow = 0.4;
    this.speed = 0.4;
    this.level = 0;          // уровень громкости 0..1
    this.spectrum = null;    // Uint8Array из AnalyserNode
    this.t = 0;
    this.rot = 0;
    this.accent = null;
    this.reduceMotion = false;
    this.resize = this.resize.bind(this);
    this.frame = this.frame.bind(this);
    if (!mini) {
      new ResizeObserver(this.resize).observe(canvas);
    }
    this.resize();
    requestAnimationFrame(this.frame);
  }

  setAccent(hex) {
    this.accent = hexToRgb(hex);
  }

  setState(state) {
    if (STATES[state]) this.state = state;
  }

  setLevel(level, spectrum) {
    this.level = Math.max(0, Math.min(1, level));
    this.spectrum = spectrum || null;
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.mini ? { width: this.canvas.width, height: this.canvas.height } : this.canvas.getBoundingClientRect();
    if (!this.mini) {
      this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
      this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
    }
    this.size = Math.min(this.canvas.width, this.canvas.height);
  }

  frame(now) {
    requestAnimationFrame(this.frame);
    const dt = Math.min(0.05, (now - (this.last || now)) / 1000);
    this.last = now;
    const target = STATES[this.state];
    const base = this.state === 'idle' || this.state === 'listening' || this.state === 'speaking' ? this.accent || target.color : target.color;
    for (let i = 0; i < 3; i++) this.color[i] += (base[i] - this.color[i]) * Math.min(1, dt * 4);
    this.glow += (target.glow - this.glow) * Math.min(1, dt * 3);
    this.speed += (target.speed - this.speed) * Math.min(1, dt * 2);
    this.t += dt;
    this.rot += dt * this.speed * (this.reduceMotion ? 0.2 : 1);
    if (this.state === 'speaking') {
      // У синтезатора речи нет аудиоданных — имитируем живую волну.
      const fake = 0.35 + 0.35 * Math.abs(Math.sin(this.t * 7.3)) * (0.6 + 0.4 * Math.sin(this.t * 2.1));
      this.level += (fake - this.level) * 0.25;
    }
    this.draw();
  }

  rgba(a) {
    const [r, g, b] = this.color;
    return `rgba(${r | 0},${g | 0},${b | 0},${a})`;
  }

  draw() {
    const { ctx } = this;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const cx = W / 2;
    const cy = H / 2;
    const R = this.size / 2 * 0.94;
    const lvl = this.level;
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.translate(cx, cy);

    // мягкое свечение
    const g = ctx.createRadialGradient(0, 0, R * 0.05, 0, 0, R);
    g.addColorStop(0, this.rgba(0.35 * this.glow + lvl * 0.2));
    g.addColorStop(0.35, this.rgba(0.1 * this.glow));
    g.addColorStop(1, this.rgba(0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.fill();

    ctx.lineCap = 'round';

    // внешнее кольцо делений
    const ticks = this.mini ? 60 : 120;
    for (let i = 0; i < ticks; i++) {
      const a = (i / ticks) * Math.PI * 2 + this.rot * 0.15;
      const long = i % 10 === 0;
      const r1 = R * 0.9;
      const r2 = R * (long ? 0.84 : 0.875);
      ctx.strokeStyle = this.rgba(long ? 0.75 : 0.28);
      ctx.lineWidth = (long ? 2 : 1) * (this.size / 600);
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
      ctx.lineTo(Math.cos(a) * r2, Math.sin(a) * r2);
      ctx.stroke();
    }

    // спектр / волна голоса
    const bars = this.mini ? 48 : 96;
    const inner = R * 0.6;
    for (let i = 0; i < bars; i++) {
      const a = (i / bars) * Math.PI * 2 - Math.PI / 2;
      let v;
      if (this.spectrum && this.state === 'listening') {
        const idx = Math.floor(((i < bars / 2 ? i : bars - i) / (bars / 2)) * this.spectrum.length * 0.6);
        v = (this.spectrum[idx] || 0) / 255;
      } else {
        v = 0.08 + lvl * (0.5 + 0.5 * Math.sin(i * 0.55 + this.t * 6)) * (0.6 + 0.4 * Math.sin(i * 1.7 - this.t * 3));
        if (this.state === 'thinking') v = 0.15 + 0.25 * Math.max(0, Math.sin(i * 0.4 - this.t * 8));
        if (this.state === 'idle' || this.state === 'boot' || this.state === 'muted') v = 0.05 + 0.03 * Math.sin(i * 0.3 + this.t * 2);
      }
      const len = R * 0.2 * Math.min(1, v);
      ctx.strokeStyle = this.rgba(0.35 + v * 0.6);
      ctx.lineWidth = Math.max(1.2, (this.size / 600) * 2.6);
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
      ctx.lineTo(Math.cos(a) * (inner + len), Math.sin(a) * (inner + len));
      ctx.stroke();
    }

    // вращающиеся дуги
    const arcs = [
      { r: 0.78, w: 3, segs: [[0, 0.22], [0.3, 0.42], [0.55, 0.9]], dir: 1, sp: 0.6, a: 0.85 },
      { r: 0.72, w: 1.5, segs: [[0, 0.08], [0.12, 0.6], [0.7, 0.95]], dir: -1, sp: 0.9, a: 0.5 },
      { r: 0.52, w: 2, segs: [[0, 0.3], [0.5, 0.8]], dir: 1, sp: 1.4, a: 0.7 },
      { r: 0.46, w: 1, segs: [[0, 1]], dir: 1, sp: 0, a: 0.25, dash: true },
    ];
    for (const arc of arcs) {
      ctx.strokeStyle = this.rgba(arc.a);
      ctx.lineWidth = arc.w * (this.size / 600) * 1.4;
      if (arc.dash) ctx.setLineDash([4 * (this.size / 600), 8 * (this.size / 600)]);
      for (const [s, e] of arc.segs) {
        const off = this.rot * arc.sp * arc.dir;
        ctx.beginPath();
        ctx.arc(0, 0, R * arc.r, s * Math.PI * 2 + off, e * Math.PI * 2 + off);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    // треугольные маркеры
    for (let i = 0; i < 3; i++) {
      const a = this.rot * 0.8 + (i * Math.PI * 2) / 3;
      const r = R * 0.82;
      ctx.save();
      ctx.rotate(a);
      ctx.fillStyle = this.rgba(0.9);
      ctx.beginPath();
      ctx.moveTo(r, 0);
      ctx.lineTo(r + R * 0.035, -R * 0.02);
      ctx.lineTo(r + R * 0.035, R * 0.02);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // ядро
    const pulse = 1 + Math.sin(this.t * 2.2) * 0.03 + lvl * 0.22;
    const coreR = R * 0.3 * pulse;
    const cg = ctx.createRadialGradient(0, 0, 0, 0, 0, coreR);
    cg.addColorStop(0, `rgba(240,255,255,${0.75 * this.glow + 0.2})`);
    cg.addColorStop(0.35, this.rgba(0.5 * this.glow + lvl * 0.3));
    cg.addColorStop(0.75, this.rgba(0.12));
    cg.addColorStop(1, this.rgba(0));
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.arc(0, 0, coreR, 0, Math.PI * 2);
    ctx.fill();

    // шестигранник в центре
    ctx.strokeStyle = this.rgba(0.55);
    ctx.lineWidth = 1.2 * (this.size / 600) * 1.4;
    ctx.beginPath();
    for (let i = 0; i <= 6; i++) {
      const a = (i / 6) * Math.PI * 2 - this.rot * 0.3;
      const r = R * 0.36;
      ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.stroke();

    ctx.restore();
  }
}

// Фоновые частицы.
export function startParticles(canvas) {
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, dots = [];
  const resize = () => {
    const dpr = window.devicePixelRatio || 1;
    W = canvas.width = innerWidth * dpr;
    H = canvas.height = innerHeight * dpr;
    dots = Array.from({ length: Math.round((innerWidth * innerHeight) / 16000) }, () => ({
      x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.6 + 0.3,
      vx: (Math.random() - 0.5) * 0.15, vy: -Math.random() * 0.25 - 0.05, a: Math.random() * 0.5 + 0.1,
    }));
  };
  addEventListener('resize', resize);
  resize();
  let reduce = false;
  const tick = () => {
    requestAnimationFrame(tick);
    ctx.clearRect(0, 0, W, H);
    for (const d of dots) {
      if (!reduce) { d.x += d.vx; d.y += d.vy; }
      if (d.y < -5) { d.y = H + 5; d.x = Math.random() * W; }
      if (d.x < -5) d.x = W + 5;
      if (d.x > W + 5) d.x = -5;
      ctx.fillStyle = `rgba(125, 230, 255, ${d.a})`;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  tick();
  return { setReduce: (v) => { reduce = v; } };
}
