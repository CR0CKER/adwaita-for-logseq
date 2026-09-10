/**
 * The settings stylesheet must win over the theme stylesheet regardless of
 * which one loads last.
 *
 * It used to rely on load order: the plugin injects its settings <style> at
 * startup, and the code assumed that landed after the theme sheet. It does
 * not. Logseq appends the theme's <link> whenever a theme is selected — at
 * startup and on every theme or mode switch — so it ends up *after* the
 * settings <style>. Both declared the same custom properties on :root at
 * equal specificity, so the theme's own defaults won.
 *
 * Measured, not inferred: before selecting the theme the accent computed to
 * the stored #c88800; after selecting it, the theme link sat at head index 57,
 * the settings style at 56, and the accent computed to #3584e4. Five of the
 * seven settings were silently lost this way.
 *
 * The rule this pins: every custom property the settings sheet overrides at
 * the root, which the theme also declares at the root, is `!important`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSettingsCss } from '../../src/settings-css.ts';
import { readThemeCss, rules } from '../lib/css.mjs';

/** Settings that exercise every branch of the builder. */
const EVERYTHING = {
  gnomeAccent: 'yellow',
  windowControls: 'close only',
  hideRightSidebarTopbar: true,
  accentLightnessDark: 0.8,
  fontSans: 'Cantarell',
  fontMono: 'monospace',
};

/**
 * A selector targets the root element if no compound in it is followed by a
 * descendant or child combinator — i.e. every comma-separated part is a single
 * compound like `:root` or `html[data-theme="dark"][data-color]`.
 */
function targetsRoot(selector) {
  return selector
    .split(',')
    .map((part) => part.trim())
    .every((part) => part && !/[\s>+~]/.test(part.replace(/\[[^\]]*\]/g, '').replace(/\([^)]*\)/g, '')));
}

/** { property -> [{ important }] } for root-targeting rules only. */
function rootDeclarations(css) {
  const out = new Map();
  for (const { selector, body } of rules(css)) {
    if (!targetsRoot(selector)) continue;
    for (const decl of body.split(';')) {
      const m = decl.match(/^\s*(--[a-z0-9-]+)\s*:\s*([\s\S]*?)\s*$/i);
      if (!m) continue;
      const list = out.get(m[1]) ?? [];
      list.push({ selector, important: /!important\s*$/i.test(m[2]) });
      out.set(m[1], list);
    }
  }
  return out;
}

const themeRoot = rootDeclarations(readThemeCss());
const settingsRoot = rootDeclarations(buildSettingsCss(EVERYTHING));

test('the settings sheet overrides some root-level theme properties (sanity)', () => {
  const contested = [...settingsRoot.keys()].filter((p) => themeRoot.has(p));
  assert.ok(contested.length >= 5, `expected the accent, fonts, width and lightness; got ${contested.join(', ')}`);
});

test('every contested root-level override is !important, so load order cannot flip it', () => {
  const losing = [];
  for (const [prop, decls] of settingsRoot) {
    if (!themeRoot.has(prop)) continue; // the theme never declares it — no contest
    for (const d of decls) {
      if (!d.important) losing.push(`${prop}  (on ${d.selector.replace(/\s+/g, ' ')})`);
    }
  }
  assert.deepEqual(
    losing,
    [],
    'these settings lose to the theme sheet whenever it is (re)selected after the plugin loads:\n  ' +
      losing.join('\n  ')
  );
});

test('the theme sheet itself never uses !important on those properties', () => {
  // If it did, the settings could never win at all.
  const blocked = [...themeRoot]
    .filter(([prop, decls]) => settingsRoot.has(prop) && decls.some((d) => d.important))
    .map(([prop]) => prop);
  assert.deepEqual(blocked, [], 'the theme must leave these overridable');
});
