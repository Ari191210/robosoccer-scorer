// Sound and confetti. Both are optional: failures are ignored.

let audio = null;

// Browsers only allow sound after a user gesture, so this is called on click.
export function unlockAudio() {
  try {
    if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
    else if (audio.state === 'suspended') audio.resume();
  } catch {
    audio = null;
  }
}

function tone(freq, duration, type, at, volume) {
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(volume, at + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  osc.connect(gain);
  gain.connect(audio.destination);
  osc.start(at);
  osc.stop(at + duration + 0.05);
}

export function sound(kind) {
  if (!audio) return;
  try {
    const t = audio.currentTime;
    if (kind === 'goal') {
      tone(784, 0.12, 'triangle', t, 0.2);
      tone(1047, 0.12, 'triangle', t + 0.12, 0.2);
      tone(1319, 0.4, 'triangle', t + 0.24, 0.2);
    } else if (kind === 'horn') {
      tone(330, 1.1, 'square', t, 0.08);
    } else {
      tone(880, 0.25, 'square', t, 0.07);
    }
  } catch {
    // no sound is fine
  }
}

let frame = 0;

export function confetti(canvas, big) {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const ctx = canvas.getContext?.('2d');
  if (!ctx) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = (canvas.width = innerWidth * dpr);
  const H = (canvas.height = innerHeight * dpr);
  const colours = ['#f6f5f1', '#f6f5f1', '#b9b8b2', '#ff4a3d', '#5d5f64'];
  const bits = Array.from({ length: big ? 280 : 130 }, (_, k) => {
    const left = k % 2 === 0;
    return {
      x: left ? W * 0.04 : W * 0.96,
      y: H * 0.8,
      vx: (left ? 1 : -1) * W * (0.004 + Math.random() * 0.012),
      vy: -H * (0.014 + Math.random() * 0.016),
      w: (7 + Math.random() * 8) * dpr,
      h: (4 + Math.random() * 5) * dpr,
      a: Math.random() * 6.3,
      spin: (Math.random() - 0.5) * 0.35,
      colour: colours[k % colours.length],
    };
  });
  const startAt = performance.now();
  const duration = big ? 4500 : 3000;
  cancelAnimationFrame(frame);
  const draw = (t) => {
    ctx.clearRect(0, 0, W, H);
    const fade = Math.min(1, Math.max(0, (startAt + duration - t) / 800));
    for (const p of bits) {
      p.vy += H * 0.00045;
      p.vx *= 0.992;
      p.vy *= 0.992;
      p.x += p.vx;
      p.y += p.vy;
      p.a += p.spin;
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.a);
      ctx.fillStyle = p.colour;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.a * 2)));
      ctx.restore();
    }
    if (t - startAt < duration) frame = requestAnimationFrame(draw);
    else ctx.clearRect(0, 0, W, H);
  };
  frame = requestAnimationFrame(draw);
}
