// Banners that move in the wind. Each banner picture is painted, already cut to the banner's shape, onto a small WebGL
// canvas laid over the still picture, and a shader ripples it: pinned at the top, freer the lower it hangs, with folds
// that catch the light as they pass. The canvas stops while the banner is out of view, and the still picture stays for
// browsers without WebGL. Base.astro only starts this for visitors who have not asked for less motion.

const VERTEX = `
attribute vec2 corner;
varying vec2 uv;
void main() {
  uv = vec2(corner.x * 0.5 + 0.5, 0.5 - corner.y * 0.5);
  gl_Position = vec4(corner, 0.0, 1.0);
}`;

// uv runs over the whole canvas; the banner itself sits inside it, short of the margins in `pad` (left/right, bottom),
// which give the cloth room to swing. Its top edge is the top of the canvas, where it hangs from.
const FRAGMENT = `
precision mediump float;
varying vec2 uv;
uniform sampler2D cloth;
uniform float time;
uniform float strength;
uniform vec2 pad;
void main() {
  vec2 b = vec2((uv.x - pad.x) / (1.0 - 2.0 * pad.x), uv.y / (1.0 - pad.y));
  float hang = smoothstep(0.0, 1.0, b.y);
  float fold = b.x * 8.0 + b.y * 3.0 - time * 1.9;
  float sway = sin(b.y * 4.0 - time * 1.3) + 0.4 * sin(b.y * 9.0 - time * 2.3 + 1.7);
  vec2 shift = strength * hang * vec2(0.022 * sway, 0.03 * sin(fold) + 0.012 * sin(fold * 1.7 + 0.9));
  vec2 at = b - shift;
  if (at.x < 0.0 || at.x > 1.0 || at.y < 0.0 || at.y > 1.0) { gl_FragColor = vec4(0.0); return; }
  vec4 c = texture2D(cloth, at);
  float light = 1.0 + strength * (0.03 + 0.13 * hang) * cos(fold);
  gl_FragColor = vec4(c.rgb * light, c.a);
}`;

type Waving = {
  banner: HTMLElement;
  canvas: HTMLCanvasElement;
  gl: WebGLRenderingContext;
  time: WebGLUniformLocation;
  strength: WebGLUniformLocation;
  pad: WebGLUniformLocation;
  texture: WebGLTexture;
  seed: number;
  /** When it was first drawn, for the wind to rise from. */
  started: number;
  shown: boolean;
  visible: boolean;
};

const waving: Waving[] = [];
let frame = 0;

/** The corners of the banner's cut, from its clip-path (src/lib/banner-shapes.ts), as fractions of its box. */
function cutCorners(banner: HTMLElement): [number, number][] | null {
  const cut = banner.style.getPropertyValue('--cut');
  if (!cut) return null;
  return [...cut.matchAll(/(-?[\d.]+)% (-?[\d.]+)%/g)].map((m) => [Number(m[1]) / 100, Number(m[2]) / 100]);
}

/** Paints the picture as the cloth shows it (cover-fitted, cut to shape, with the cloth's border) into a canvas. */
function paintCloth(banner: HTMLElement, cloth: HTMLElement, img: HTMLImageElement, scale: number): HTMLCanvasElement {
  const w = Math.max(1, Math.round(cloth.clientWidth * scale));
  const h = Math.max(1, Math.round(cloth.clientHeight * scale));
  const paint = Object.assign(document.createElement('canvas'), { width: w, height: h });
  const ctx = paint.getContext('2d')!;
  const corners = cutCorners(banner);
  if (corners) {
    ctx.beginPath();
    corners.forEach(([x, y], i) => (i ? ctx.lineTo(x * w, y * h) : ctx.moveTo(x * w, y * h)));
    ctx.closePath();
    ctx.clip();
  }
  const cover = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const iw = img.naturalWidth * cover;
  const ih = img.naturalHeight * cover;
  ctx.drawImage(img, (w - iw) / 2, (h - ih) / 2, iw, ih);
  const border = getComputedStyle(cloth);
  if (!corners && parseFloat(border.borderTopWidth) > 0) {
    ctx.strokeStyle = border.borderTopColor;
    ctx.lineWidth = scale;
    ctx.strokeRect(scale / 2, scale / 2, w - scale, h - scale);
  }
  return paint;
}

function compile(gl: WebGLRenderingContext): WebGLProgram | null {
  const program = gl.createProgram()!;
  for (const [type, source] of [[gl.VERTEX_SHADER, VERTEX], [gl.FRAGMENT_SHADER, FRAGMENT]] as const) {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return null;
    gl.attachShader(program, shader);
  }
  gl.linkProgram(program);
  return gl.getProgramParameter(program, gl.LINK_STATUS) ? program : null;
}

/** Sizes the canvas to the cloth plus its margins and paints the cloth into the texture. */
function fit(w: Waving) {
  const cloth = w.banner.querySelector<HTMLElement>(':scope > .cloth')!;
  const img = cloth.querySelector('img')!;
  const scale = Math.min(devicePixelRatio || 1, 2);
  const width = w.canvas.clientWidth;
  const height = w.canvas.clientHeight;
  w.canvas.width = Math.round(width * scale);
  w.canvas.height = Math.round(height * scale);
  const { gl } = w;
  gl.viewport(0, 0, w.canvas.width, w.canvas.height);
  gl.uniform2f(w.pad, (width - cloth.clientWidth) / 2 / width, (height - cloth.clientHeight) / height);
  gl.bindTexture(gl.TEXTURE_2D, w.texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, paintCloth(w.banner, cloth, img, scale));
}

function draw(now: number) {
  frame = 0;
  for (const w of waving) {
    if (!w.visible) continue;
    // The wind rises over the first second it is seen, so the still picture turns into the moving one without a jump.
    if (!w.shown) w.started = now;
    const t = (now - w.started) / 1000;
    const { gl } = w;
    gl.uniform1f(w.time, t + w.seed);
    gl.uniform1f(w.strength, Math.min(1, t / 1.2) ** 2);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    if (!w.shown) {
      w.shown = true;
      w.banner.classList.add('waving');
    }
  }
  if (waving.some((w) => w.visible) && !document.hidden) frame = requestAnimationFrame(draw);
}

const run = () => {
  if (!frame && !document.hidden && waving.some((w) => w.visible)) frame = requestAnimationFrame(draw);
};

const watch = new IntersectionObserver((entries) => {
  for (const e of entries) {
    const w = waving.find((x) => x.canvas === e.target);
    if (w) w.visible = e.isIntersecting;
  }
  run();
});

const resized = new ResizeObserver((entries) => {
  for (const e of entries) {
    const w = waving.find((x) => x.canvas === e.target);
    if (w) fit(w);
  }
});

function start(banner: HTMLElement) {
  const canvas = document.createElement('canvas');
  canvas.className = 'wave';
  canvas.setAttribute('aria-hidden', 'true');
  banner.append(canvas);
  const gl = canvas.getContext('webgl', { premultipliedAlpha: false, antialias: false });
  const program = gl && compile(gl);
  if (!gl || !program) return canvas.remove();
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const corner = gl.getAttribLocation(program, 'corner');
  gl.enableVertexAttribArray(corner);
  gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 0, 0);
  const texture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  for (const [k, v] of [[gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE], [gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR]]) {
    gl.texParameteri(gl.TEXTURE_2D, k, v);
  }
  gl.clearColor(0, 0, 0, 0);
  const w: Waving = {
    banner,
    canvas,
    gl,
    time: gl.getUniformLocation(program, 'time')!,
    strength: gl.getUniformLocation(program, 'strength')!,
    pad: gl.getUniformLocation(program, 'pad')!,
    texture,
    // Each banner catches the wind at its own moment, so a row of them does not move in step.
    seed: Math.random() * 20,
    started: 0,
    shown: false,
    visible: false,
  };
  fit(w);
  waving.push(w);
  watch.observe(canvas);
  resized.observe(canvas);
}

/** Sets every banner with a picture on the page waving, each once its picture has loaded. */
export function waveBanners() {
  document.addEventListener('visibilitychange', run);
  for (const banner of document.querySelectorAll<HTMLElement>('.banner')) {
    const img = banner.querySelector<HTMLImageElement>(':scope > .cloth > img');
    if (!img) continue;
    if (img.complete && img.naturalWidth) start(banner);
    else img.addEventListener('load', () => start(banner), { once: true });
  }
}
