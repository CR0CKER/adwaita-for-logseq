/**
 * The surfaces this theme floats over *content*, as Adwaita OSD: the PDF
 * viewer's chrome, and the action bar over an embedded image.
 *
 * Two things are being locked down here, and they fail differently:
 *
 *   1. Every surface the viewer floats over the page carries the OSD ground
 *      and foreground — the toolbar, the popovers it opens, and the highlight
 *      context menu. Miss one and the app has two visual languages over the
 *      same page.
 *   2. Each of those rules out-ranks the Logseq rule it replaces. Logseq
 *      styles these surfaces per *page theme* (.extensions__pdf-container
 *      carries its own data-theme: light/dark/warm — a different element from
 *      html[data-theme], which is the app's scheme), so a rule that beats the
 *      base declaration can still lose under one page theme.
 *
 * Contrast — the thing that makes a dark OSD ground legitimate rather than
 * merely dark — is measured over all three page themes in contrast.test.mjs.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readThemeCss, rules } from '../lib/css.mjs';

const css = readThemeCss();

/** Every rule whose selector list contains `selector` verbatim. */
const rulesFor = (selector) =>
  rules(css).filter((r) => r.selector.split(',').map((s) => s.trim()).includes(selector));

/** The value `prop` ends up with under `selector`, in source order. */
function valueOf(selector, prop) {
  let found;
  for (const r of rulesFor(selector)) {
    const m = r.body.match(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`));
    if (m) found = m[1].trim();
  }
  return found;
}

test('every floating PDF surface is painted as OSD', () => {
  // The toolbar pill, the popover box all three panels share (settings,
  // finder, outline), and the highlight context menu.
  const surfaces = [
    'html[data-theme] .extensions__pdf-container .extensions__pdf-toolbar .buttons',
    'html[data-theme] .extensions__pdf-container .hls-popup-box',
    'html[data-theme] .extensions__pdf-hls-ctx-menu',
  ];
  const wrong = [];
  for (const sel of surfaces) {
    if (!rulesFor(sel).length) wrong.push(`${sel}: no rule`);
    if (valueOf(sel, 'background-color') !== 'var(--adw-osd-bg)') wrong.push(`${sel}: ground is not var(--adw-osd-bg)`);
    if (valueOf(sel, 'color') !== 'var(--adw-osd-fg)') wrong.push(`${sel}: foreground is not var(--adw-osd-fg)`);
    // GTK paints OSD's ground inside its border, never under it.
    if (valueOf(sel, 'background-clip') !== 'padding-box') wrong.push(`${sel}: missing background-clip: padding-box`);
  }
  assert.deepEqual(wrong, [], wrong.join('\n  '));
});

test('the OSD rules out-rank Logseq\'s per-page-theme ones', () => {
  // Logseq's own declarations, and what beats each:
  //   .extensions__pdf-container .extensions__pdf-toolbar .buttons        (0,3,0)
  //   .extensions__pdf-container[data-theme=warm] … .buttons              (0,4,0)
  //   .extensions__pdf-container[data-theme=dark] .extensions__pdf-toolbar (0,3,0)
  // The theme's `html[data-theme] .extensions__pdf-container …` is (0,4,0)
  // and later in the cascade, so it ties the warm rule and wins on order.
  const pill = 'html[data-theme] .extensions__pdf-container .extensions__pdf-toolbar .buttons';
  assert.ok(rulesFor(pill).length, 'the pill rule must keep .extensions__pdf-container in the selector — without it (0,3,0) loses to the warm page theme');

  // The dark page theme fades the bar into a solid teal gradient. Neutralised
  // by a rule that matches *any* page theme, so one OSD bar serves all three.
  const bar = 'html[data-theme] .extensions__pdf-container[data-theme] .extensions__pdf-toolbar';
  assert.equal(valueOf(bar, 'background'), 'none', "Logseq's dark-theme gradient must be cleared");
});

test('the floating toolbar is centred over the page, as GTK centres one', () => {
  // Logseq right-aligns it twice — on .extensions__pdf-header and again on
  // .inner — so the bar hugs the pane's right edge. Both have to be centred, or
  // the outer box centres a child that is still packed to one end.
  const header = 'html[data-theme] .extensions__pdf-header';
  assert.equal(valueOf(header, 'justify-content'), 'center');
  assert.equal(valueOf('html[data-theme] .extensions__pdf-toolbar > .inner', 'justify-content'), 'center');

  // Logseq's header box is inset from the right (right: 10px, width: calc(100%
  // - 10px)), so centring inside it would sit 5px off the pane's true centre.
  assert.equal(valueOf(header, 'right'), '0', "the header's 10px right inset must go, or 'centred' is 5px off");
  assert.equal(valueOf(header, 'width'), '100%');
});

test('toolbar buttons are GTK flat buttons in an OSD toolbar', () => {
  const btn = 'html[data-theme] .extensions__pdf-toolbar > .inner > .r a.button';
  // libadwaita: button.osd is 32x32; button.flat is transparent until hovered.
  assert.equal(valueOf(btn, 'min-width'), '32px');
  assert.equal(valueOf(btn, 'min-height'), '32px');
  assert.equal(valueOf(btn, 'background-color'), 'transparent');
  // Logseq paints the icons with --ls-icon-color at (0,3,2); inheriting takes
  // them onto the OSD foreground instead.
  assert.equal(valueOf(btn, 'color'), 'inherit');

  // hover 7%, active 16%, checked 10% — libadwaita's button.flat states.
  const states = {
    [`${btn}:hover`]: '7%',
    [`${btn}:active`]: '16%',
    [`${btn}.is-active`]: '10%',
  };
  const wrong = [];
  for (const [sel, pct] of Object.entries(states)) {
    const bg = valueOf(sel, 'background-color');
    if (bg !== `color-mix(in srgb, currentColor ${pct}, transparent)`) wrong.push(`${sel}: ${bg ?? '(none)'}`);
  }
  assert.deepEqual(wrong, [], wrong.join('\n  '));

  // Logseq underlines the two toggles (border-bottom: 2px solid #969494);
  // GTK fills a checked button instead.
  assert.equal(valueOf(`${btn}.is-active`, 'border-bottom'), 'none');
});

test('text that inherits nothing of its own is taken onto the OSD foreground', () => {
  // Each of these sets its own colour in Logseq's sheet (or, for the pager
  // input, gets the UA's black), so each needs naming explicitly — they are
  // the elements that come out unreadable on a dark ground.
  const inheritors = [
    'html[data-theme] .extensions__pdf-toolbar > .inner .pager > .nu input',
    'html[data-theme] .extensions__pdf-settings-item',
    'html[data-theme] .extensions__pdf-finder.hls-popup-box > .result-inner',
    'html[data-theme] .extensions__pdf-finder.hls-popup-box > .input-inner input',
    'html[data-theme] .extensions__pdf-outline-tabs button',
    'html[data-theme] .extensions__pdf-outline-item > .inner > a',
  ];
  const wrong = inheritors.filter((sel) => valueOf(sel, 'color') !== 'inherit');
  assert.deepEqual(wrong, [], `these keep a colour of Logseq's over the OSD ground:\n  ${wrong.join('\n  ')}`);
});

test('the finder\'s hover colour beats Logseq\'s !important', () => {
  // Logseq sets `.ui__button:hover .ti { color: #1f1f1f!important }`. Only
  // another !important can take that onto the OSD foreground.
  const sel = 'html[data-theme] .extensions__pdf-finder.hls-popup-box > .input-inner .ui__button:hover .ti';
  assert.match(valueOf(sel, 'color') ?? '', /inherit\s*!important/);
});

test('Logseq\'s scaled ::after hairline is replaced by a real border', () => {
  // .hls-popup-box::after draws a 1px box scaled to .5 — a hairline trick that
  // does not follow the OSD border colour. GTK popovers use a real border.
  for (const sel of [
    'html[data-theme] .extensions__pdf-container .hls-popup-box::after',
    'html[data-theme] .extensions__pdf-hls-ctx-menu::after',
  ]) {
    assert.equal(valueOf(sel, 'display'), 'none', sel);
  }
  assert.equal(
    valueOf('html[data-theme] .extensions__pdf-container .hls-popup-box', 'border'),
    '1px solid var(--adw-osd-border)'
  );
});

test('the image action bar is OSD too, on both builds', () => {
  // The other place the theme paints chrome over content whose colour it does
  // not control. The builds fail differently and the fix is shared:
  //   OG  dims the whole image with .asset-overlay and paints the bar in
  //       --ls-primary-text-color (legible, but not how GNOME does it);
  //   2.x ships no overlay and no colour, so the icons land on the raw image
  //       at opacity .7 — white on a white photo in dark mode.
  const btn = 'html[data-theme] .asset-container .asset-action-btn';
  assert.equal(valueOf(btn, 'background-color'), 'var(--adw-osd-bg)');
  assert.equal(valueOf(btn, 'color'), 'var(--adw-osd-fg)');
  assert.equal(valueOf(btn, 'background-clip'), 'padding-box');
  // Logseq dims these and brightens on hover; an OSD button is opaque and
  // changes its fill, so the dimming has to be cleared in every state.
  for (const sel of [btn, `${btn}:hover`, `${btn}:active`]) {
    assert.equal(valueOf(sel, 'opacity'), '1', sel);
  }
  assert.match(valueOf(`${btn}:hover`, 'background-color') ?? '', /color-mix\(in srgb, currentColor 15%/);
  assert.match(valueOf(`${btn}:active`, 'background-color') ?? '', /color-mix\(in srgb, currentColor 25%/);

  // Logseq OG leaves these `display: block`, so the icon sits on the text
  // baseline rather than in the middle of the pill; 2.x already flexes them.
  // The file-path button is excluded — it is a text button whose ellipsis
  // would stop working inside a flex container.
  const icon = 'html[data-theme] .asset-container .asset-action-btn:not(.text-left)';
  assert.equal(valueOf(icon, 'display'), 'flex');
  assert.equal(valueOf(icon, 'align-items'), 'center');
  assert.equal(valueOf(icon, 'justify-content'), 'center');

  // The buttons carry their own ground now, so OG's full-image scrim goes:
  // GNOME does not dim content to make controls readable.
  assert.equal(valueOf('html[data-theme] .block-content .asset-container .asset-overlay', 'display'), 'none');
});
