// Harnais headless : fait tourner le jeu sous Node, sans navigateur.
//
//   node tools/shot.mjs                 → capture une image du jeu
//   node tools/test.mjs                 → tests automatisés
//
// Fournit juste ce que le jeu utilise du navigateur : un DOM minimal, un
// Image qui décode nos PNG, et un contexte 2D qui rastérise pour de bon dans un
// buffer RGBA. Le rendu produit est donc vérifiable à l'œil, pas simulé.
//
// Deux propriétés le rendent utile au-delà de la capture d'écran :
//   • le temps est piloté à la main — la simulation est parfaitement déterministe,
//     donc les tests de collision sont reproductibles ;
//   • les entrées sont injectées par événements réels, donc c'est bien le code
//     d'input du jeu qui est exercé, pas une maquette.
//
// Le contexte ne gère que translate et scale : le jeu n'utilise pas de rotation
// dans son rendu de scène. Toute rotation ajoutée plus tard devra être gérée ici.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePNG, encodePNG } from './png.mjs';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// ─── Couleurs ─────────────────────────────────────────────────────────────────

function parseColor(css) {
  if (typeof css !== 'string') return [255, 0, 255, 1];
  let s = css.trim();
  if (s[0] === '#') {
    if (s.length === 4) s = `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
    return [
      parseInt(s.slice(1, 3), 16),
      parseInt(s.slice(3, 5), 16),
      parseInt(s.slice(5, 7), 16),
      s.length >= 9 ? parseInt(s.slice(7, 9), 16) / 255 : 1,
    ];
  }
  const m = s.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const p = m[1].split(',').map((v) => parseFloat(v));
    return [p[0] | 0, p[1] | 0, p[2] | 0, p[3] === undefined ? 1 : p[3]];
  }
  return [255, 0, 255, 1];
}

// ─── Contexte 2D ──────────────────────────────────────────────────────────────

class Context2D {
  constructor(canvas) {
    this.canvas = canvas;
    this.imageSmoothingEnabled = true;
    this.fillStyle = '#000';
    this.strokeStyle = '#000';
    this.globalAlpha = 1;
    this.lineWidth = 1;
    this.font = '10px monospace';
    this.textAlign = 'left';
    this.textBaseline = 'alphabetic';
    /** Journal des textes dessinés : le rasterizer ne peint pas de glyphes. */
    this.texts = [];
    this._reset();
    this._stack = [];
  }

  _reset() {
    this.m = { a: 1, d: 1, e: 0, f: 0 };
    this._clip = { x0: 0, y0: 0, x1: this.canvas.width, y1: this.canvas.height };
    this._path = null;
  }

  setTransform(a, b, c, d, e, f) {
    this.m = { a, d, e, f };
  }

  save() {
    this._stack.push({
      m: { ...this.m },
      clip: { ...this._clip },
      fillStyle: this.fillStyle,
      strokeStyle: this.strokeStyle,
      globalAlpha: this.globalAlpha,
      font: this.font,
      textAlign: this.textAlign,
      textBaseline: this.textBaseline,
    });
  }

  restore() {
    const s = this._stack.pop();
    if (!s) return;
    Object.assign(this, {
      m: s.m, _clip: s.clip, fillStyle: s.fillStyle, strokeStyle: s.strokeStyle,
      globalAlpha: s.globalAlpha, font: s.font,
      textAlign: s.textAlign, textBaseline: s.textBaseline,
    });
  }

  translate(x, y) {
    this.m.e += this.m.a * x;
    this.m.f += this.m.d * y;
  }

  scale(x, y) {
    this.m.a *= x;
    this.m.d *= y;
  }

  rotate() {
    throw new Error('harness : rotate() non géré par le rasterizer de test');
  }

  beginPath() { this._path = null; }
  rect(x, y, w, h) { this._path = { x, y, w, h }; }
  moveTo() {}
  lineTo() {}
  stroke() {}

  /** Contour non rempli : assez pour les hitbox de debug, pas d'anti-aliasing. */
  strokeRect(x, y, w, h) {
    const [r, g, b, a] = parseColor(this.strokeStyle);
    const alpha = a * this.globalAlpha;
    const p0 = this._toScreen(x, y);
    const p1 = this._toScreen(x + w, y + h);
    const x0 = Math.round(Math.min(p0.x, p1.x)), x1 = Math.round(Math.max(p0.x, p1.x));
    const y0 = Math.round(Math.min(p0.y, p1.y)), y1 = Math.round(Math.max(p0.y, p1.y));
    for (let px = x0; px < x1; px++) { this._blend(px, y0, r, g, b, alpha); this._blend(px, y1 - 1, r, g, b, alpha); }
    for (let py = y0; py < y1; py++) { this._blend(x0, py, r, g, b, alpha); this._blend(x1 - 1, py, r, g, b, alpha); }
  }

  clip() {
    if (!this._path) return;
    const { x, y, w, h } = this._path;
    const a = this._toScreen(x, y);
    const b = this._toScreen(x + w, y + h);
    this._clip = {
      x0: Math.max(this._clip.x0, Math.round(Math.min(a.x, b.x))),
      y0: Math.max(this._clip.y0, Math.round(Math.min(a.y, b.y))),
      x1: Math.min(this._clip.x1, Math.round(Math.max(a.x, b.x))),
      y1: Math.min(this._clip.y1, Math.round(Math.max(a.y, b.y))),
    };
  }

  _toScreen(x, y) {
    return { x: this.m.a * x + this.m.e, y: this.m.d * y + this.m.f };
  }

  _blend(px, py, r, g, b, alpha) {
    const { width, height } = this.canvas;
    if (px < this._clip.x0 || py < this._clip.y0 || px >= this._clip.x1 || py >= this._clip.y1) return;
    if (px < 0 || py < 0 || px >= width || py >= height) return;
    const i = (py * width + px) * 4;
    const d = this.canvas.data;
    if (alpha >= 1) {
      d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
      return;
    }
    d[i] = d[i] + (r - d[i]) * alpha;
    d[i + 1] = d[i + 1] + (g - d[i + 1]) * alpha;
    d[i + 2] = d[i + 2] + (b - d[i + 2]) * alpha;
    d[i + 3] = 255;
  }

  fillRect(x, y, w, h) {
    const [r, g, b, ca] = parseColor(this.fillStyle);
    const alpha = ca * this.globalAlpha;
    if (alpha <= 0) return;
    const p0 = this._toScreen(x, y);
    const p1 = this._toScreen(x + w, y + h);
    const x0 = Math.round(Math.min(p0.x, p1.x)), x1 = Math.round(Math.max(p0.x, p1.x));
    const y0 = Math.round(Math.min(p0.y, p1.y)), y1 = Math.round(Math.max(p0.y, p1.y));
    for (let py = y0; py < y1; py++) for (let px = x0; px < x1; px++) {
      this._blend(px, py, r, g, b, alpha);
    }
  }

  clearRect(x, y, w, h) {
    const keep = this.fillStyle;
    this.fillStyle = '#000000';
    this.fillRect(x, y, w, h);
    this.fillStyle = keep;
  }

  fillText(text, x, y) {
    this.texts.push({ text: String(text), x, y, align: this.textAlign });
  }

  measureText(text) {
    const size = parseFloat(this.font) || 10;
    return { width: String(text).length * size * 0.6 };
  }

  drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh) {
    if (arguments.length === 3) { dx = sx; dy = sy; sx = 0; sy = 0; sw = dw = img.width; sh = dh = img.height; }
    else if (arguments.length === 5) { dw = sw; dh = sh; dx = sx; dy = sy; sx = 0; sy = 0; sw = img.width; sh = img.height; }

    const p0 = this._toScreen(dx, dy);
    const p1 = this._toScreen(dx + dw, dy + dh);
    const x0 = Math.round(Math.min(p0.x, p1.x)), x1 = Math.round(Math.max(p0.x, p1.x));
    const y0 = Math.round(Math.min(p0.y, p1.y)), y1 = Math.round(Math.max(p0.y, p1.y));
    if (x1 <= x0 || y1 <= y0) return;

    const flipX = p1.x < p0.x;
    const flipY = p1.y < p0.y;
    const ga = this.globalAlpha;

    for (let py = y0; py < y1; py++) {
      let v = (py + 0.5 - Math.min(p0.y, p1.y)) / (y1 - y0);
      if (flipY) v = 1 - v;
      // Le clamp porte sur la sous-image source, origine comprise : borner à
      // sh-1 ramènerait l'échantillonnage au coin haut-gauche de l'atlas.
      const srcY = Math.min(sy + sh - 1, Math.max(sy, Math.floor(sy + v * sh)));
      for (let px = x0; px < x1; px++) {
        let u = (px + 0.5 - Math.min(p0.x, p1.x)) / (x1 - x0);
        if (flipX) u = 1 - u;
        const srcX = Math.min(sx + sw - 1, Math.max(sx, Math.floor(sx + u * sw)));
        const i = (srcY * img.width + srcX) * 4;
        const a = (img.data[i + 3] / 255) * ga;
        if (a <= 0) continue;
        this._blend(px, py, img.data[i], img.data[i + 1], img.data[i + 2], a);
      }
    }
  }
}

class Canvas {
  constructor(width = 960, height = 540) {
    this.width = width;
    this.height = height;
    this.style = {};
    this._ctx = null;
    this._listeners = new Map();
  }

  get width() { return this._w; }
  set width(v) { this._w = v; this._realloc(); }
  get height() { return this._h; }
  set height(v) { this._h = v; this._realloc(); }

  _realloc() {
    if (!this._w || !this._h) return;
    this.data = new Uint8Array(this._w * this._h * 4);
    if (this._ctx) this._ctx._reset();
  }

  getContext() {
    if (!this._ctx) this._ctx = new Context2D(this);
    return this._ctx;
  }

  addEventListener(type, fn) {
    if (!this._listeners.has(type)) this._listeners.set(type, []);
    this._listeners.get(type).push(fn);
  }

  removeEventListener(type, fn) {
    const l = this._listeners.get(type);
    if (l) this._listeners.set(type, l.filter((f) => f !== fn));
  }

  dispatch(type, event) {
    for (const fn of this._listeners.get(type) || []) fn({ preventDefault() {}, ...event });
  }

  setPointerCapture() {}
  releasePointerCapture() {}

  toPNG() {
    return encodePNG({ width: this.width, height: this.height, data: this.data });
  }
}

// ─── DOM minimal ──────────────────────────────────────────────────────────────

class Element {
  constructor(id) {
    this.id = id;
    this.style = {};
    this.hidden = false;
    this.textContent = '';
    this._listeners = new Map();
  }
  addEventListener(type, fn) {
    if (!this._listeners.has(type)) this._listeners.set(type, []);
    this._listeners.get(type).push(fn);
  }
  removeEventListener() {}
  dispatch(type, event = {}) {
    for (const fn of this._listeners.get(type) || []) fn({ preventDefault() {}, ...event });
  }
  setAttribute(k, v) { this[k] = v; }
  appendChild() {}
}

// Au niveau module, pas dans boot() : un test qui rappelle boot() pour
// simuler « fermer l'onglet et le rouvrir » doit retrouver les mêmes données,
// exactement comme un vrai navigateur sur la même origine.
const magasinPartage = new Map();

/**
 * Installe l'environnement puis charge le jeu.
 * @param {boolean} [resetStorage] si true, vide le localStorage simulé avant
 *   de démarrer — un nouveau visiteur plutôt qu'une session qui continue.
 * @param {boolean} [localStorageEchoue] si true, getItem/setItem lèvent — la
 *   navigation privée iOS que core/storage.js doit détecter et contourner.
 * @returns {Promise<object>} poignées de pilotage (temps, entrées, canvas)
 */
export async function boot({
  width = 960, height = 540, dpr = 1, search = '', bundle = false,
  resetStorage = true, localStorageEchoue = false,
} = {}) {
  if (resetStorage) magasinPartage.clear();
  const canvas = new Canvas(width, height);
  const panne = new Element('panne');
  panne.hidden = true; // fidèle au HTML : <p id="panne" hidden>
  const elements = new Map([
    ['jeu', canvas],
    ['pause', new Element('pause')],
    ['chargement', new Element('chargement')],
    ['panne', panne],
  ]);

  let virtualTime = 0;
  const rafQueue = [];
  const windowListeners = new Map();
  const docListeners = new Map();

  const listen = (map) => (type, fn) => {
    if (!map.has(type)) map.set(type, []);
    map.get(type).push(fn);
  };

  globalThis.performance = { now: () => virtualTime };
  globalThis.requestAnimationFrame = (fn) => { rafQueue.push(fn); return rafQueue.length; };
  globalThis.cancelAnimationFrame = () => {};

  globalThis.window = {
    innerWidth: width / dpr,
    innerHeight: height / dpr,
    devicePixelRatio: dpr,
    addEventListener: listen(windowListeners),
    removeEventListener() {},
    visualViewport: null,
  };

  globalThis.document = {
    hidden: false,
    getElementById: (id) => elements.get(id) || null,
    addEventListener: listen(docListeners),
    createElement: () => new Element(),
    head: { appendChild() {} },
  };

  globalThis.location = { search, protocol: 'http:' };

  // localStorage : un vrai backend (Map partagée au niveau module, voir plus
  // haut), pas juste « absent ». Sans lui, core/storage.js bascule sur son
  // fallback mémoire dans tous les tests, et le comportement qu'il est censé
  // garantir — persister entre deux sessions — ne serait jamais vérifié,
  // seulement son absence de crash.
  globalThis.localStorage = localStorageEchoue
    ? {
        getItem() { throw new Error('QuotaExceededError'); },
        setItem() { throw new Error('QuotaExceededError'); },
        removeItem() {},
        clear() {},
      }
    : {
        getItem: (k) => (magasinPartage.has(k) ? magasinPartage.get(k) : null),
        setItem: (k, v) => { magasinPartage.set(k, String(v)); },
        removeItem: (k) => { magasinPartage.delete(k); },
        clear: () => magasinPartage.clear(),
      };

  // navigator.vibrate : espionné plutôt que simplement absent, pour que les
  // tests puissent vérifier QUE l'haptique se déclenche (§11), pas seulement
  // que son absence ne fait pas planter le jeu.
  const vibrationsAppelees = [];
  // Node 24+ fournit déjà un `navigator` global (lecture seule, sans setter) :
  // Object.defineProperty le remplace plutôt qu'une simple affectation.
  Object.defineProperty(globalThis, 'navigator', {
    value: { vibrate: (motif) => { vibrationsAppelees.push(motif); return true; } },
    writable: true,
    configurable: true,
  });

  // Image : décode réellement nos PNG, de façon synchrone puis notifie.
  globalThis.Image = class {
    set src(path) {
      try {
        const img = decodePNG(readFileSync(join(ROOT, path)));
        this.width = img.width;
        this.height = img.height;
        this.data = img.data;
        queueMicrotask(() => this.onload?.());
      } catch (err) {
        queueMicrotask(() => this.onerror?.(err));
      }
    }
  };

  let modules = null;
  if (bundle) {
    // Exactement ce que charge une ouverture en file:// : le script concaténé,
    // pas les modules. C'est le seul moyen d'attraper une erreur propre au
    // bundle — un export mal extrait, par exemple — avant l'utilisateur.
    const code = readFileSync(join(ROOT, 'dist/bundle.js'), 'utf8');
    // eslint-disable-next-line no-new-func
    new Function(code)();
  } else {
    modules = await import(`../src/main.js?t=${Date.now()}`);
  }
  // Laisse la promesse de chargement des assets se résoudre.
  await new Promise((r) => setTimeout(r, 0));

  const fire = (map, type, event) => {
    for (const fn of map.get(type) || []) fn({ preventDefault() {}, ...event });
  };

  return {
    canvas,
    modules,
    element: (id) => elements.get(id),
    get time() { return virtualTime; },
    get vibrations() { return vibrationsAppelees; },

    /** Avance d'une frame d'affichage. `ms` par défaut = 1/60 s. */
    frame(ms = 1000 / 60) {
      virtualTime += ms;
      const pending = rafQueue.splice(0, rafQueue.length);
      for (const fn of pending) fn(virtualTime);
    },

    /** Avance de `n` frames. */
    frames(n, ms) { for (let i = 0; i < n; i++) this.frame(ms); },

    /** Avance sans exécuter de frame : pour franchir un seuil de maintien. */
    wait(ms) { virtualTime += ms; },

    key(type, code, opts = {}) { fire(windowListeners, type, { code, repeat: false, ...opts }); },
    keyDown(code, opts) { this.key('keydown', code, opts); },
    keyUp(code, opts) { this.key('keyup', code, opts); },

    pointer(type, opts = {}) {
      canvas.dispatch(type, { pointerId: 1, pointerType: 'touch', button: 0, clientX: 100, clientY: 100, ...opts });
    },

    resize(w, h, newDpr = dpr) {
      canvas.width = w;
      canvas.height = h;
      globalThis.window.innerWidth = w / newDpr;
      globalThis.window.innerHeight = h / newDpr;
      globalThis.window.devicePixelRatio = newDpr;
      fire(windowListeners, 'resize', {});
    },

    setHidden(v) {
      globalThis.document.hidden = v;
      fire(docListeners, 'visibilitychange', {});
    },
  };
}
