/**
 * Logseq 2.x's block context menu: a fixed 280px popover that clips its
 * content, holding a row of eight icon-only heading buttons (H1-H6, auto,
 * remove). The theme's general button padding is GTK's *text*-button padding;
 * on these icon buttons it pushed "Remove heading" past the clip (issue #21).
 * GTK pads icon-only (image) buttons less: libadwaita's
 * `button.image-button { min-width: 24px; padding-left: 5px; padding-right: 5px }`.
 *
 * tests/live/cases.mjs checks the real menu on both builds; this pins the rule.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readThemeCss, declaredValue } from '../lib/css.mjs';

const css = readThemeCss();
const SEL = /^html\[data-theme\] \.ls-context-menu-content \.ui__button:has\(> \.ui__icon:only-child\)$/;

test('icon-only buttons in the block context menu use GTK image-button metrics', () => {
  assert.equal(declaredValue(css, SEL, 'padding-left'), '5px', 'padding-left');
  assert.equal(declaredValue(css, SEL, 'padding-right'), '5px', 'padding-right');
  assert.equal(declaredValue(css, SEL, 'min-width'), '24px', 'min-width');
});
