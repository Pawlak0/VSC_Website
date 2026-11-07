// Weather over the home page's hero picture, chosen in the site panel (Texts, Home page: top): snow drifting down.
// Sparks rising as from fires out of sight below are kept here too, but Pawlak left them out of the panel for now
// (2026-11-07) to maybe use somewhere else later. It is drawn on a canvas between the picture's shade and the text, and stops
// while the hero is scrolled away or the tab is hidden. Base.astro only allows it for visitors who have not asked for
// less motion.

export type Weather = 'snow' | 'sparks';

type Speck = { x: number; y: number; fall: number; drift: number; size: number; life: number; age: number; phase: number; depth: number };

/** A soft round dot, drawn once and stamped for every speck. */
function sprite(stops: [number, string][]): HTMLCanvasElement {
  const size = 64;
  const dot = Object.assign(document.createElement('canvas'), { width: size, height: size });
  const ctx = dot.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [at, colour] of stops) g.addColorStop(at, colour);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return dot;
}

const LOOKS: Record<Weather, { dot: [number, string][]; perArea: number; most: number; least: number }> = {
  snow: {
    dot: [[0, 'rgba(255, 255, 255, 0.95)'], [0.35, 'rgba(240, 244, 250, 0.7)'], [1, 'rgba(230, 236, 245, 0)']],
    perArea: 6000,
    most: 180,
    least: 50,
  },
  sparks: {
    dot: [[0, 'rgba(255, 244, 214, 1)'], [0.18, 'rgba(255, 196, 102, 0.9)'], [0.45, 'rgba(232, 120, 40, 0.35)'], [1, 'rgba(200, 80, 20, 0)']],
    perArea: 16000,
    most: 70,
    least: 18,
  },
};

export function heroWeather(canvas: HTMLCanvasElement, weather: Weather) {
  const ctx = canvas.getContext('2d');
  const look = LOOKS[weather];
  if (!ctx || !look) return;
  const dot = sprite(look.dot);
  const snow = weather === 'snow';
  let width = 0;
  let height = 0;
  let specks: Speck[] = [];
  let frame = 0;
  let last = 0;
  let seen = true;

  const spawn = (anywhere: boolean): Speck => {
    // Nearer specks (depth towards 1) are bigger, brighter and faster, which gives the air some depth.
    const depth = Math.random() ** 1.6;
    if (snow) {
      return {
        x: Math.random() * (width + 120) - 60,
        y: anywhere ? Math.random() * height : -10 - Math.random() * 40,
        fall: 16 + depth * 52,
        drift: 6 + depth * 18,
        size: 1.1 + depth * 3,
        life: Infinity,
        age: 0,
        phase: Math.random() * Math.PI * 2,
        depth,
      };
    }
    // Most sparks rise on the right, over the picture; on a phone the text covers it all, so they spread evenly.
    const across = width < 700 ? Math.random() : 0.2 + 0.8 * Math.sqrt(Math.random());
    return {
      x: across * width,
      y: anywhere ? Math.random() * height : height + 10 + Math.random() * 40,
      fall: -(26 + Math.random() * 58),
      drift: (Math.random() - 0.35) * 18,
      size: 1.4 + depth * 3.6,
      life: 4 + Math.random() * 5,
      age: anywhere ? Math.random() * 3 : 0,
      phase: Math.random() * Math.PI * 2,
      depth: Math.random(),
    };
  };

  const fit = () => {
    const scale = Math.min(devicePixelRatio || 1, 2);
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    const count = Math.round(Math.min(look.most, Math.max(look.least, (width * height) / look.perArea)));
    specks = Array.from({ length: count }, () => spawn(true));
  };

  const draw = (now: number) => {
    frame = 0;
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 0);
    last = now;
    const t = now / 1000;
    ctx.clearRect(0, 0, width, height);
    ctx.globalCompositeOperation = snow ? 'source-over' : 'lighter';
    for (let i = 0; i < specks.length; i++) {
      const s = specks[i];
      s.age += dt;
      s.y += s.fall * dt;
      s.x += (s.drift + Math.sin(t * (snow ? 0.8 : 1.3) + s.phase) * (snow ? 10 : 14)) * dt;
      if (s.age > s.life || s.y < -20 || s.y > height + 20 || s.x > width + 70) {
        specks[i] = spawn(false);
        continue;
      }
      let alpha: number;
      let r: number;
      if (snow) {
        alpha = 0.38 + s.depth * 0.55;
        r = s.size * 1.8;
      } else {
        // A spark brightens as it leaves the fire, flickers on its way and dies out near the end of its life.
        const born = Math.min(1, s.age / 0.6);
        const dying = Math.max(0, 1 - Math.max(0, s.age - s.life * 0.55) / (s.life * 0.45));
        const flicker = 0.7 + 0.3 * Math.sin(t * (7 + s.depth * 6) + s.phase * 3);
        alpha = born * dying * flicker * (0.55 + s.depth * 0.45);
        r = s.size * (2.6 + s.depth);
      }
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.drawImage(dot, s.x - r, s.y - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    run();
  };

  const run = () => {
    if (!frame && seen && !document.hidden) frame = requestAnimationFrame(draw);
  };
  const stop = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    last = 0;
  };

  fit();
  new ResizeObserver(fit).observe(canvas);
  new IntersectionObserver(([e]) => {
    seen = e.isIntersecting;
    if (seen) run();
    else stop();
  }).observe(canvas);
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : run()));
  run();
}
