// Moving album artwork + fluid background + palette extraction.

const imgCache = new Map();
export function loadImage(url) {
  if (!url) return Promise.reject(new Error('no url'));
  if (imgCache.has(url)) return imgCache.get(url);
  const p = new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
  imgCache.set(url, p);
  p.catch(() => imgCache.delete(url));
  return p;
}

// ---------- palette ----------
const rgbToHsl = (r, g, b) => {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let hh = 0, s = 0; const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    hh = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    hh /= 6;
  }
  return [hh * 360, s, l];
};

export async function extractPalette(url) {
  const fallback = { accent: '#ff375f', accent2: '#7d5cff', bg: '#16161d', luminance: 0.1 };
  try {
    const img = await loadImage(url);
    const c = document.createElement('canvas');
    c.width = c.height = 40;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, 40, 40);
    const data = ctx.getImageData(0, 0, 40, 40).data;
    const buckets = new Map();
    let lumSum = 0, R = 0, G = 0, B = 0, n = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      R += r; G += g; B += b; n++;
      lumSum += (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      const [hh, s, l] = rgbToHsl(r, g, b);
      if (s < 0.18 || l < 0.12 || l > 0.9) continue;
      const k = Math.round(hh / 24);
      const bk = buckets.get(k) || { r: 0, g: 0, b: 0, n: 0, score: 0 };
      bk.r += r; bk.g += g; bk.b += b; bk.n++; bk.score += s * (1 - Math.abs(l - 0.55));
      buckets.set(k, bk);
    }
    const ranked = [...buckets.values()].sort((a, b) => b.score - a.score);
    const toHex = (bk) => {
      let [hh, s, l] = rgbToHsl(bk.r / bk.n, bk.g / bk.n, bk.b / bk.n);
      s = Math.min(1, Math.max(s, 0.5)); l = Math.min(0.66, Math.max(l, 0.5));
      return `hsl(${hh.toFixed(0)} ${(s * 100).toFixed(0)}% ${(l * 100).toFixed(0)}%)`;
    };
    const avg = rgbToHsl(R / n, G / n, B / n);
    return {
      accent: ranked[0] ? toHex(ranked[0]) : fallback.accent,
      accent2: ranked[1] ? toHex(ranked[1]) : ranked[0] ? toHex(ranked[0]) : fallback.accent2,
      bg: `hsl(${avg[0].toFixed(0)} ${Math.min(45, avg[1] * 100).toFixed(0)}% ${Math.min(14, avg[2] * 30 + 6).toFixed(0)}%)`,
      luminance: lumSum / n
    };
  } catch { return fallback; }
}

// ---------- fluid background ----------
// Several large, blurred, slowly rotating copies of the cover. Rendered in a
// quarter-size layer and scaled up, which keeps the blur cheap.
export class FluidBackground {
  constructor(root) {
    this.root = root;
    this.root.classList.add('fluid');
    this.current = null;
  }
  set(url, mode = 'fluid') {
    this.root.dataset.mode = mode;
    if (!url || url === this.url) return;
    this.url = url;
    const layer = document.createElement('div');
    layer.className = 'fluid-layer';
    const inner = document.createElement('div');
    inner.className = 'fluid-inner';
    for (let i = 0; i < 4; i++) {
      const b = document.createElement('div');
      b.className = `blob b${i}`;
      b.style.backgroundImage = `url("${url}")`;
      inner.append(b);
    }
    layer.append(inner);
    this.root.append(layer);
    requestAnimationFrame(() => requestAnimationFrame(() => layer.classList.add('in')));
    const old = this.current;
    this.current = layer;
    if (old) setTimeout(() => old.remove(), 1600);
  }
}

// ---------- living artwork ----------
const VS = `attribute vec2 p; varying vec2 vUv; void main(){ vUv = p*0.5+0.5; vUv.y = 1.0-vUv.y; gl_Position = vec4(p,0.,1.); }`;
const FS = `precision highp float;
varying vec2 vUv;
uniform sampler2D texA; uniform sampler2D texB;
uniform float t; uniform float mixv; uniform float mode; uniform float amt;
vec3 perm(vec3 x){ return mod(((x*34.0)+1.0)*x, 289.0); }
float snoise(vec2 v){
  const vec4 C = vec4(0.211324865405187,0.366025403784439,-0.577350269189626,0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy)); vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0,0.0) : vec2(0.0,1.0);
  vec4 x12 = x0.xyxy + C.xxzz; x12.xy -= i1; i = mod(i, 289.0);
  vec3 p = perm(perm(i.y + vec3(0.0,i1.y,1.0)) + i.x + vec3(0.0,i1.x,1.0));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0); m = m*m; m = m*m;
  vec3 x = 2.0*fract(p*C.www)-1.0; vec3 h = abs(x)-0.5; vec3 ox = floor(x+0.5); vec3 a0 = x-ox;
  m *= 1.79284291400159 - 0.85373472095314*(a0*a0+h*h);
  vec3 g; g.x = a0.x*x0.x + h.x*x0.y; g.yz = a0.yz*x12.xz + h.yz*x12.yw; return 130.0*dot(m,g);
}
vec2 warp(vec2 uv){
  float z = 1.0 + 0.07*amt*(0.5+0.5*sin(t*0.12));
  vec2 c = vec2(0.5) + 0.03*amt*vec2(sin(t*0.09), cos(t*0.071));
  uv = (uv-0.5)/z + c;
  if (mode > 0.5) {
    vec2 q = uv*1.7;
    float n1 = snoise(q + vec2(t*0.07, -t*0.05));
    float n2 = snoise(q*1.7 + vec2(-t*0.06, t*0.08) + 11.3);
    uv += amt*0.012*vec2(n1, n2);
  }
  return clamp(uv, 0.002, 0.998);
}
void main(){
  vec2 uv = warp(vUv);
  vec3 a = texture2D(texA, uv).rgb;
  vec3 b = texture2D(texB, uv).rgb;
  vec3 col = mix(a, b, mixv);
  float band = smoothstep(0.0, 0.35, 0.35 - abs(fract((vUv.x+vUv.y)*0.5 - t*0.035) - 0.5));
  col += 0.05*amt*band;
  float vig = smoothstep(1.15, 0.35, length(vUv-0.5));
  col *= mix(0.92, 1.0, vig);
  gl_FragColor = vec4(col, 1.0);
}`;

export class LivingArtwork {
  constructor(root) {
    this.root = root;
    this.root.classList.add('living-art');
    this.canvas = document.createElement('canvas');
    this.fallback = document.createElement('img');
    this.fallback.className = 'art-fallback';
    this.fallback.alt = '';
    this.root.append(this.fallback, this.canvas);
    this.mode = 'liquid';
    this.speed = 1;
    this.playing = true;
    this.t = Math.random() * 100;
    this.mixv = 1;
    this.ok = this.initGL();
    this.root.classList.toggle('gl', this.ok);
    this.last = performance.now();
    new ResizeObserver(() => this.resize()).observe(this.root);
    const loop = (now) => { this.frame(now); this.raf = requestAnimationFrame(loop); };
    this.raf = requestAnimationFrame(loop);
  }

  initGL() {
    try {
      const gl = this.canvas.getContext('webgl', { premultipliedAlpha: false, antialias: false });
      if (!gl) return false;
      const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
      const prog = gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
      gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('link failed');
      gl.useProgram(prog);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, 'p');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      const mk = () => {
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([20, 20, 28, 255]));
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return tex;
      };
      this.texA = mk(); this.texB = mk();
      this.u = {};
      for (const n of ['texA', 'texB', 't', 'mixv', 'mode', 'amt']) this.u[n] = gl.getUniformLocation(prog, n);
      gl.uniform1i(this.u.texA, 0); gl.uniform1i(this.u.texB, 1);
      this.gl = gl;
      return true;
    } catch (e) { console.warn('WebGL artwork disabled:', e); return false; }
  }

  resize() {
    const r = this.root.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(2, Math.round(r.width * dpr));
    this.canvas.height = Math.max(2, Math.round(r.height * dpr));
    if (this.gl) this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  async set(url) {
    if (!url || url === this.url) return;
    this.url = url;
    this.fallback.src = url;
    if (!this.ok) return;
    try {
      const img = await loadImage(url);
      if (url !== this.url) return;
      const gl = this.gl;
      // texB becomes the new image; texA keeps the old one, then swap after fade.
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.texB);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      this.mixv = 0;
      this.fadeStart = performance.now();
      this.root.classList.remove('nogl');
    } catch (e) {
      // Image could not be used as a texture (e.g. CORS) — fall back to CSS motion.
      this.root.classList.add('nogl');
    }
  }

  frame(now) {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    const off = this.mode === 'off';
    this.root.dataset.mode = this.mode;
    this.root.classList.toggle('paused', !this.playing);
    if (!this.ok || off || this.root.classList.contains('nogl') || !this.root.isConnected || this.root.offsetParent === null) return;
    this.t += dt * this.speed * (this.playing ? 1 : 0.25);
    if (this.fadeStart != null) {
      this.mixv = Math.min(1, (now - this.fadeStart) / 900);
      if (this.mixv >= 1) {
        // copy B into A by swapping handles
        [this.texA, this.texB] = [this.texB, this.texA];
        this.mixv = 0; this.fadeStart = null; this.swapped = true;
      }
    }
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.texA);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.texB);
    gl.uniform1f(this.u.t, this.t);
    gl.uniform1f(this.u.mixv, this.fadeStart != null ? this.mixv : 0);
    gl.uniform1f(this.u.mode, this.mode === 'liquid' ? 1 : 0);
    gl.uniform1f(this.u.amt, 1);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
