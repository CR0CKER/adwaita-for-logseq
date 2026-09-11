/**
 * Text and icons in the headerbar and sidebar are the full foreground, as in
 * GNOME Files — never Logseq's grey ramp.
 *
 * Two places Logseq greys them at a specificity the theme's general rules lose to:
 *
 *   - plugin toolbar icons (PDF print, journals calendar, the plugins puzzle):
 *     `.cp__header > .r > div:not(.ui__dropdown-trigger) a` is (0,3,2) and paints
 *     var(--lx-gray-11); the theme's `html[data-theme] .cp__header .button` is
 *     only (0,3,1);
 *   - the keyboard-shortcut tiles beside sidebar items ("g j"), painted by
 *     Logseq's `.text-gray-10` utility.
 *
 * Found in the user's own Logseq by computed style, not by reading CSS.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readThemeCss, rules } from '../lib/css.mjs';

const css = readThemeCss();

/** The colour a rule gives `selector`, which must appear in its list verbatim. */
function colourOf(selector) {
  let found;
  for (const r of rules(css)) {
    if (!r.selector.split(',').map((s) => s.trim()).includes(selector)) continue;
    const m = r.body.match(/(?:^|;)\s*color\s*:\s*([^;]+)/);
    if (m) found = m[1].trim();
  }
  return found;
}

test('plugin toolbar icons in the headerbar are the full foreground', () => {
  // Logseq's own selector, prefixed with html[data-theme]: (0,4,3) over its (0,3,2).
  assert.equal(colourOf('html[data-theme] .cp__header > .r > div:not(.ui__dropdown-trigger) a'), 'var(--adw-fg)');
});

test('sidebar row icons are dimmed like GNOME Files, the labels are not', () => {
  // Nautilus's own style.css: `image.sidebarrow-icon { opacity: 0.7; }` — the
  // icon is a softer grey, the label beside it stays the full foreground.
  // Dimmed with opacity (not a grey colour), exactly as Files does it.
  const rule = rules(css).find(
    ({ selector, body }) => selector.includes('#left-sidebar') && selector.includes('.ui__icon') && /opacity\s*:/.test(body)
  );
  assert.ok(rule, 'no rule dims the sidebar row icons');
  assert.match(rule.body, /(?:^|;)\s*opacity\s*:\s*0?\.7\s*(;|$)/, 'Files dims them to 0.7');
  for (const row of ['a.item', '.nav-content-item .header', '.favorite-item', '.recent-item']) {
    assert.ok(rule.selector.includes(row), `${row} icons are dimmed too`);
  }
});

test('keyboard-shortcut tiles in the sidebar are the full foreground', () => {
  assert.equal(colourOf('html[data-theme] #left-sidebar .keyboard-shortcut .ui__button'), 'var(--adw-fg)');
});
