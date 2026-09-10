/**
 * WCAG AA contrast, computed rather than eyeballed.
 *
 * The theme never writes an accent down: it derives one with CSS relative
 * colour syntax — `oklab(from <accent> max(l, 0.763) a b)` on dark,
 * `min(l, 0.5)` on light. So the colour a user actually reads is the output of
 * a transform nobody can check by looking at the stylesheet, and the light
 * clamp in particular was written from libadwaita's spec without ever being
 * measured against the light surfaces.
 *
 * These tests reimplement the transform (tests/lib/color.mjs) and assert the
 * result clears 4.5:1 against both surfaces, for every accent the plugin offers.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GNOME_ACCENTS } from '../../src/settings-css.ts';
import { declaredValue, REPO_ROOT } from '../lib/css.mjs';
import { applyOklabClamp, parseColor, over, contrastRatio, toHex } from '../lib/color.mjs';

const AA_NORMAL = 4.5;

const palette = (file) => readFileSync(join(REPO_ROOT, 'src/css', file), 'utf8');

/** Pull the values a scheme needs straight out of its palette file. */
function scheme(file, selectorRe) {
  const css = palette(file);
  const get = (prop) => declaredValue(css, selectorRe, prop);
  return {
    standalone: get('--adw-standalone-oklab'),
    accentL: get('--adw-accent-l'),
    view: get('--adw-view-bg'),
    sidebar: get('--adw-sidebar-bg'),
    fg: get('--adw-fg'),
    fgDim: get('--adw-fg-dim'),
  };
}

const SCHEMES = {
  dark: scheme('10-tokens-dark.css', /data-theme="dark"/),
  light: scheme('15-tokens-light.css', /data-theme="light"/),
};

for (const [mode, s] of Object.entries(SCHEMES)) {
  test(`${mode}: palette values are all present`, () => {
    for (const [k, v] of Object.entries(s)) assert.ok(v, `missing ${k} in the ${mode} palette`);
  });

  test(`${mode}: every offered accent clears AA on both surfaces`, () => {
    const surfaces = { view: parseColor(s.view).rgb, sidebar: parseColor(s.sidebar).rgb };
    const failures = [];

    for (const [name, hex] of Object.entries(GNOME_ACCENTS)) {
      const accent = applyOklabClamp(hex, s.standalone, { '--adw-accent-l': s.accentL });
      for (const [surfaceName, surface] of Object.entries(surfaces)) {
        const ratio = contrastRatio(accent, surface);
        if (ratio < AA_NORMAL) {
          failures.push(`${name} (${toHex(accent)}) on ${surfaceName} ${toHex(surface)}: ${ratio.toFixed(2)}:1`);
        }
      }
    }
    assert.deepEqual(failures, [], `accent text below ${AA_NORMAL}:1:\n  ` + failures.join('\n  '));
  });

  test(`${mode}: body and dimmed text clear AA on both surfaces`, () => {
    const failures = [];
    for (const surfaceName of ['view', 'sidebar']) {
      const surface = parseColor(s[surfaceName]).rgb;
      // Dimmed text is translucent — composite it before measuring, or the
      // ratio is a fiction.
      for (const [label, value, floor] of [['fg', s.fg, AA_NORMAL], ['fg-dim', s.fgDim, 3.0]]) {
        const composited = over(parseColor(value), surface);
        const ratio = contrastRatio(composited, surface);
        if (ratio < floor) failures.push(`${label} on ${surfaceName}: ${ratio.toFixed(2)}:1 (floor ${floor})`);
      }
    }
    assert.deepEqual(failures, [], failures.join('\n  '));
  });
}
