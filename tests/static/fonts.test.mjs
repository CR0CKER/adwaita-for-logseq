/**
 * Every piece of interface text is the interface font, Adwaita Sans.
 *
 * The theme sets the font on body and the chrome containers, and text inherits
 * it. That fails wherever Logseq names a font on the element itself: a
 * declaration on the element beats any inherited value, whatever its
 * specificity. Logseq 2.x does this with Inter, which it ships as a web font,
 * so it renders even where Inter is not installed. Found by reading the face
 * Chromium rendered (CSS.getPlatformFontsForNode), then listing every 2.x rule
 * that names a font. OG has no such rule.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readThemeCss, rules } from '../lib/css.mjs';

const css = readThemeCss();

/** The font-family a rule gives `selector`, which must appear in its list verbatim. */
function fontOf(selector) {
  let found;
  for (const r of rules(css)) {
    if (!r.selector.split(',').map((s) => s.trim()).includes(selector)) continue;
    const m = r.body.match(/(?:^|;)\s*font-family\s*:\s*([^;]+)/);
    if (m) found = m[1].trim();
  }
  return found;
}

/** [ids, classes/attributes/pseudo-classes, types] — enough for these selectors. */
function specificity(selector) {
  const s = selector.replace(/::[\w-]+/g, '');
  const ids = (s.match(/#[\w-]+/g) ?? []).length;
  const classes = (s.match(/\.[\w-]+|\[[^\]]+\]|:[\w-]+/g) ?? []).length;
  const types = (s.replace(/#[\w-]+|\.[\w-]+|\[[^\]]+\]|:[\w-]+/g, ' ').match(/[a-z][\w-]*/gi) ?? []).length;
  return [ids, classes, types];
}
const beats = (a, b) => {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
};

// Logseq 2.0.1's own rules that set Inter, verbatim from its style.css.
const INTER_RULES = {
  // Shortcut keys: the sidebar's "G J" hints, the search dialog, menus, the keymap page.
  '.shui-shortcut-compact': ['.shui-shortcut-compact'],
  '.shui-shortcut-key': ['.shui-shortcut-key', 'kbd.shui-shortcut-key'],
  // The query builder's brackets.
  '.cp__query-builder .clause-bracket': ['.cp__query-builder .clause-bracket'],
};

test('text Logseq 2.x sets in Inter is the interface font', () => {
  for (const [target, logseq] of Object.entries(INTER_RULES)) {
    const ours = `html[data-theme] ${target}`;
    assert.equal(fontOf(ours), 'var(--adw-font-sans)', `${target} keeps 2.x's Inter`);
    for (const theirs of logseq) {
      assert.ok(beats(specificity(ours), specificity(theirs)),
        `${ours} ${JSON.stringify(specificity(ours))} must outrank 2.x's ${theirs} ${JSON.stringify(specificity(theirs))}`);
    }
  }
});

test('shortcut keys are not monospace: GTK draws shortcut labels in the interface font', () => {
  // GtkShortcutLabel and menu accelerators use the interface font, so kbd stays
  // out of the theme's monospace rule.
  for (const r of rules(css)) {
    if (!/font-family\s*:\s*var\(--adw-font-mono\)/.test(r.body)) continue;
    const hit = r.selector.split(',').map((s) => s.trim()).filter((s) => /\bkbd\b|shui-shortcut/.test(s));
    assert.deepEqual(hit, [], 'shortcut keys set in the monospace font');
  }
});
