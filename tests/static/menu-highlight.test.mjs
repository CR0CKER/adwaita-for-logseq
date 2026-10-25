/**
 * Logseq 2.x's Radix menus (⋮, the block context menu) mark the item the
 * keyboard is on with `[data-highlighted]` and focus. Logseq paints it two
 * ways, neither of them right here:
 *
 * - data-color="logseq" (the shipped default): shadcn's `focus:bg-accent`, with
 *   the menu's --accent set to Radix's raw gray-04, a solarized teal (#00404d).
 * - any accent picked in Logseq: `html:not([data-color=logseq]) div[data-radix-
 *   popper-content-wrapper] div[data-radix-collection-item]:focus` (0,4,3) with
 *   --lx-gray-04, which in the theme's dark palette is the popover's own colour.
 *
 * The highlighted item takes the menu hover colour, as the pointer and the
 * keyboard share one highlight in a GTK popover, at a specificity above
 * (0,4,3). tests/live/cases.mjs drives the real menu; this pins the rule.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readThemeCss, rules } from '../lib/css.mjs';

const css = readThemeCss();
const SEL = 'html[data-theme] .ui__dropdown-menu-content .ui__dropdown-menu-item[data-radix-collection-item]:is([data-highlighted], .is-active, :focus)';

test('the keyboard-highlighted menu item takes the menu hover colour', () => {
  // Whole-selector match: the commas inside :is() rule out splitting the list.
  const rule = rules(css).find((r) => r.selector === SEL);
  assert.ok(rule, `no rule for ${SEL}`);
  assert.match(rule.body, /(^|;)\s*background-color:\s*var\(--adw-hover\)/, 'background');
  assert.match(rule.body, /(^|;)\s*color:\s*var\(--adw-fg\)/, 'text colour');
});
