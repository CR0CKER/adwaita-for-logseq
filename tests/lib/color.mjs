/**
 * Colour maths for the contrast tests.
 *
 * The theme derives its accents with CSS relative colour syntax —
 * `oklab(from <c> max(l, 0.763) a b)` — which a static test cannot evaluate by
 * reading the file. These functions reimplement exactly that transform so the
 * accent a user actually sees can be computed, and its contrast checked,
 * without launching the app.
 *
 * Conversions are the standard sRGB <-> Oklab matrices (Björn Ottosson);
 * contrast is WCAG 2.x relative luminance.
 */

const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const linearToSrgb = (c) => {
  const v = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
  return Math.min(1, Math.max(0, v));
};

export function parseHex(hex) {
  const h = hex.trim().replace('#', '');
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
}

/** `rgba(0, 0, 6, 0.8)` / `rgb(29,29,32)` -> {rgb, alpha}. */
export function parseRgb(value) {
  const m = value.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)\s*(?:[,/]\s*([\d.]+%?))?/i);
  if (!m) return null;
  let alpha = 1;
  if (m[4] !== undefined) alpha = m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
  return { rgb: [+m[1] / 255, +m[2] / 255, +m[3] / 255], alpha };
}

/** Accepts a hex or an rgb()/rgba() string; returns linear-ish sRGB 0..1. */
export function parseColor(value) {
  const v = value.trim();
  if (v.startsWith('#')) return { rgb: parseHex(v), alpha: 1 };
  return parseRgb(v);
}

export function rgbToOklab([r, g, b]) {
  const lr = srgbToLinear(r), lg = srgbToLinear(g), lb = srgbToLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export function oklabToRgb([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

/**
 * Apply the theme's oklab clamp expression to a base colour.
 * `expr` is the token value, e.g. `max(l, 0.763) a b` or `min(l, 0.5) a b`.
 * `vars` resolves any `var(--x)` inside the clamp (e.g. `--adw-accent-l`).
 */
export function applyOklabClamp(baseHex, expr, vars = {}) {
  // One level of nesting matters: the limit is often `var(--adw-accent-l)`,
  // and a naive [^)]+ would truncate it at the var()'s own closing paren.
  const m = expr.match(/(min|max)\(\s*l\s*,\s*((?:[^()]|\([^()]*\))*)\)/i);
  if (!m) throw new Error(`unrecognised oklab clamp: ${expr}`);
  const fn = m[1].toLowerCase();
  let limitRaw = m[2].trim();
  const varRef = limitRaw.match(/var\(\s*(--[a-z0-9-]+)\s*\)/i);
  if (varRef) limitRaw = String(vars[varRef[1]] ?? '').trim();
  const limit = Number(limitRaw);
  if (!Number.isFinite(limit)) throw new Error(`unresolved clamp limit in: ${expr}`);
  const [L, a, b] = rgbToOklab(parseHex(baseHex));
  return oklabToRgb([fn === 'max' ? Math.max(L, limit) : Math.min(L, limit), a, b]);
}

/** Composite a possibly-translucent colour over an opaque background. */
export function over(fg, bg) {
  if (fg.alpha >= 1) return fg.rgb;
  return fg.rgb.map((c, i) => c * fg.alpha + bg[i] * (1 - fg.alpha));
}

export function relativeLuminance([r, g, b]) {
  const [lr, lg, lb] = [r, g, b].map(srgbToLinear);
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

export function contrastRatio(a, b) {
  const la = relativeLuminance(a), lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export const toHex = (rgb) =>
  '#' + rgb.map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join('');
