/**
 * The editor autocomplete (`#ui__ac-inner`, e.g. after `[[`): the row Enter
 * picks carries `.chosen`. Logseq 2.x paints it `#ui__ac-inner
 * .menu-link.chosen { background: var(--lx-gray-04) }`, and the theme's
 * gray-04 is #36363a in
 * dark, the same as --adw-popover-bg, so the highlight vanished (issue #23).
 * The ID selector also outranks the theme's `.menu-link:hover`. OG has the same
 * markup without that rule.
 *
 * The chosen row takes the menu hover colour, as the pointer and the keyboard
 * share one highlight in a GTK popover. tests/live/cases.mjs checks the real
 * popup on both builds; this pins the rule.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readThemeCss, declaredValue } from '../lib/css.mjs';

const css = readThemeCss();

test('the chosen autocomplete row takes the menu hover colour, past 2.x\'s ID selector', () => {
  const chosen = declaredValue(css, /^html\[data-theme\] #ui__ac-inner \.menu-link\.chosen$/, 'background-color');
  const hover = declaredValue(css, /(^|,\s*)html\[data-theme\] \.menu-link:hover(,|$)/, 'background-color');
  assert.equal(chosen, 'var(--adw-hover)', 'chosen row background');
  assert.equal(chosen, hover, 'keyboard choice and pointer hover look the same');
});
