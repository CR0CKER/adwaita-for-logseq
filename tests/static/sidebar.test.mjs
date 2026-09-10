/**
 * The sidebar section dividers, modelled on GNOME Files.
 *
 * Three properties were arrived at by measuring a Files screenshot and the
 * rendered sidebar, and all three are easy to lose in a refactor:
 *
 *   - drawn as an inset background gradient, not a border — a border always
 *     spans the full box, and Files insets its divider to line up with the row
 *     highlights;
 *   - `border-top: 0`, which clears the full-width line logseq-awesome-ui draws
 *     from --ls-guideline-color, so the two do not stack;
 *   - colour from a token, so the divider follows light and dark.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readThemeCss, rules, declaredVars } from '../lib/css.mjs';

const css = readThemeCss();
const dividerRule = () =>
  rules(css).find(
    ({ selector, body }) => selector.includes('.nav-content-item') && body.includes('background-image')
  );

test('section dividers are drawn as an inset gradient, not a border', () => {
  const rule = dividerRule();
  assert.ok(rule, 'no .nav-content-item rule paints a divider');
  assert.match(rule.body, /background-image:\s*linear-gradient\(var\(--adw-[a-z-]+\)/, 'colour must come from a token');
  assert.match(rule.body, /background-size:[\s\S]*1px/, 'the line is 1px tall');
  assert.match(rule.body, /background-position:\s*var\(--adw-sidebar-divider-inset\)/, 'inset comes from the token');
});

test('the divider clears the full-width border a plugin may draw', () => {
  // logseq-awesome-ui puts a border-top on this element from
  // --ls-guideline-color; without this the two lines stack.
  assert.match(dividerRule().body, /border-top:\s*0/);
});

test('the divider inset token is declared', () => {
  assert.ok(declaredVars(css).has('--adw-sidebar-divider-inset'), 'inset token missing');
});

test('there is no divider directly under the header', () => {
  // Files has dividers only between groups; the nav block sits under the
  // headerbar and must not get one.
  const rule = rules(css).find(({ selector }) => /nav\.cp__menubar-repos\s*\{?$/.test(selector.trim()) || selector.includes('nav.cp__menubar-repos'));
  assert.ok(rule, 'the nav.cp__menubar-repos exception rule is missing');
  assert.match(rule.body, /background-image:\s*none/);
});
