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

  // The graph dropdown's trigger sits at the very top of the sidebar, under the
  // header. It once carried the section divider itself — the line the user saw
  // above the graph name. No rule may draw one on it.
  const onTrigger = rules(css).filter(
    ({ selector, body }) => selector.includes('.cp__menubar-repos > .ui__dropdown-trigger') && /background-image:\s*linear-gradient/.test(body)
  );
  assert.deepEqual(onTrigger.map((r) => r.selector), [], 'a divider is drawn on the graph dropdown, directly under the header');
});

// Files' sidebar rows, from libadwaita 1.8's own stylesheet and Nautilus 49:
//   .navigation-sidebar > row { border-radius: 9px; min-height: 36px;
//                               padding: 0 8px; margin: 0 6px 2px; }
//   .sidebarrow-icon:dir(ltr) { padding-right: 8px; }   (a 16px GtkImage)
// and the label in the system font, 'Adwaita Sans 11' = 11pt, regular weight.
// Logseq has three kinds of row:
//   a.item                       nav rows, both builds (and the graph picker)
//   .nav-content-item .bd ul a   OG Favorites / Recent
//   a.link-item                  2.x Favorites / Recent
// The nav rows are Files' rows. Favorites and Recent keep Logseq's own, smaller
// type (the user's call, 2026-09-11) and share only the icon metrics.
const rowRule = () =>
  rules(css).find(
    ({ selector, body }) =>
      selector.includes('.nav-header a.item') && selector.includes('.sidebar-content-group a.item') && /min-height/.test(body)
  );

test('nav rows have Files’ row metrics', () => {
  const rule = rowRule();
  assert.ok(rule, 'no rule sizes the nav rows on both builds (.nav-header / .sidebar-content-group a.item)');
  assert.match(rule.body, /min-height:\s*36px/);
  assert.match(rule.body, /margin:\s*0 6px 2px/);
  assert.match(rule.body, /padding:\s*0 8px/);
  assert.match(rule.body, /border-radius:\s*var\(--adw-radius-button\)/);
});

test('nav row labels are the GNOME interface font size, regular, undimmed', () => {
  const { body } = rowRule();
  assert.match(body, /font-size:\s*11pt/, "GNOME's default interface font is Adwaita Sans 11");
  assert.match(body, /font-weight:\s*400/, 'Files does not embolden its rows');
  assert.match(body, /opacity:\s*1/, 'Logseq dims rows to .8; Files rows are full strength');
  const active = rules(css).find(({ selector }) => /a\.item\.active\s*$/.test(selector.trim()));
  assert.ok(!active || !/font-weight/.test(active.body), 'the selected row keeps the regular weight, as in Files');
  // Favorites / Recent keep Logseq's type: nothing here may resize their text.
  const sectionFont = rules(css).filter(
    ({ selector, body }) => /(\.bd ul a|a\.link-item)\s*$/m.test(selector) && /font-(size|weight)/.test(body)
  );
  assert.deepEqual(sectionFont.map((r) => r.selector), [], 'Favorites / Recent text is left at Logseq’s size');
});

test('sidebar row icons are 16px with 8px before the label, on every row kind', () => {
  const icons = rules(css).filter(({ selector, body }) => /width:\s*16px/.test(body) && /height:\s*16px/.test(body));
  for (const [what, part] of [['nav icons', 'a.item > .ui__icon'], ['OG page icons', '.bd ul a .page-icon'], ['2.x page icons', 'a.link-item .page-icon']]) {
    const rule = icons.find(({ selector }) => selector.includes(part));
    assert.ok(rule, `${what} (${part}) are not sized 16x16`);
    // The left margin lines page icons up with the nav icons (checked live).
    assert.match(rule.body, /margin:\s*0 8px 0 \S+;/, `${what}: 8px before the label`);
  }
});

test('the sidebar background variable is re-pinned where Logseq 2.x shadows it', () => {
  // 2.x redeclares --left-sidebar-bg-color on `main.theme-container-inner`, an
  // element between <html> and the sidebar, as var(--lx-gray-02) — the darker
  // window surface. That shadows the theme's <html>-level mapping, so the
  // sidebar's section headers (which paint themselves from the variable)
  // showed as dark blocks on the lighter sidebar.
  const pinned = rules(css).some(
    ({ selector, body }) =>
      selector.includes('main.theme-container-inner') &&
      /--left-sidebar-bg-color:\s*var\(--adw-sidebar-bg\)/.test(body)
  );
  assert.ok(pinned, '--left-sidebar-bg-color must be pinned to --adw-sidebar-bg on main.theme-container-inner');
});
