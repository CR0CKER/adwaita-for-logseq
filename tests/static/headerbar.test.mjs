/**
 * The headerbar laid out as GNOME Files lays out its own (nautilus-window.ui,
 * nautilus-toolbar.ui):
 *
 *   sidebar header:  Search (edit-find) · title · Main Menu (open-menu)
 *   content header:  sidebar toggle (sidebar-show) · Back/Forward (go-previous/next)
 *
 * The icons are Adwaita's own symbolic icons, vendored verbatim in src/icons/
 * and inlined as mask tokens by scripts/encode-icons.mjs. CSS cannot reparent
 * Logseq's buttons, so the layout is flex `order` plus absolute placement in
 * the sticky #head, measured from --ls-left-sidebar-width.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { readThemeCss, rules, declaredValue, REPO_ROOT } from '../lib/css.mjs';

const css = readThemeCss();
const ICON_DIR = join(REPO_ROOT, 'src/icons');

/** The value `prop` gets under a rule whose selector list contains `selector` verbatim. */
function valueOf(selector, prop) {
  let found;
  for (const r of rules(css)) {
    if (!r.selector.split(',').map((s) => s.trim()).includes(selector)) continue;
    const m = r.body.match(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`));
    if (m) found = m[1].trim();
  }
  return found;
}

const ICONS = readdirSync(ICON_DIR).filter((f) => f.endsWith('-symbolic.svg')).map((f) => f.replace(/\.svg$/, ''));

test('every vendored Adwaita icon is inlined verbatim as a mask token', () => {
  assert.ok(ICONS.length >= 6, 'src/icons/ lost its icons');
  for (const name of ICONS) {
    const token = declaredValue(css, /^:root$/, `--adw-icon-${name}`);
    assert.ok(token, `--adw-icon-${name} is not declared — run node scripts/encode-icons.mjs`);
    const m = token.match(/^url\("data:image\/svg\+xml,([^"]+)"\)$/);
    assert.ok(m, `--adw-icon-${name} is not an SVG data URI`);
    assert.equal(decodeURIComponent(m[1]), readFileSync(join(ICON_DIR, `${name}.svg`), 'utf8'),
      `--adw-icon-${name} drifted from src/icons/${name}.svg — re-run scripts/encode-icons.mjs`);
  }
});

// Logseq's button → the Adwaita icon Files uses for the same job.
const BUTTON_ICONS = {
  '#head #left-menu': 'sidebar-show-symbolic',
  '#head .toggle-right-sidebar': 'sidebar-show-right-symbolic',
  '#head .toolbar-dots-btn': 'open-menu-symbolic',
  '#head .navigation.nav-left': 'go-previous-symbolic',
  '#head .navigation.nav-right': 'go-next-symbolic',
  '#head #search-button': 'edit-find-symbolic',
};

test('each headerbar button draws the Adwaita icon Files uses for that job', () => {
  const wrong = [];
  for (const [button, icon] of Object.entries(BUTTON_ICONS)) {
    const hide = valueOf(`html[data-theme] ${button} .ui__icon svg`, 'display');
    const mask = valueOf(`html[data-theme] ${button} .ui__icon::before`, 'mask-image');
    if (hide !== 'none') wrong.push(`${button}: Logseq's Tabler icon is not hidden`);
    if (mask !== `var(--adw-icon-${icon})`) wrong.push(`${button}: mask is ${mask ?? '(none)'}, want var(--adw-icon-${icon})`);
  }
  assert.deepEqual(wrong, [], wrong.join('\n  '));
});

test('back/forward lead the content header, as Files\' history controls do', () => {
  // The buttons sit two levels down (.r > div.flex-row > div > button), so the
  // flex item is the .r child that *contains* them, not a direct parent.
  const sel = 'html[data-theme] #head .r > div:has(.navigation)';
  assert.equal(valueOf(sel, 'order'), '-1');
  assert.equal(valueOf(sel, 'margin-right'), 'auto', 'the rest of the controls go to the end');
});

test('with the sidebar open, the toggle sits just past its edge and the menu at its header\'s end', () => {
  const toggle = valueOf('html[data-theme] .ls-left-sidebar-open #head > .l > div:has(> #left-menu)', 'left');
  assert.match(toggle ?? '', /var\(--ls-left-sidebar-width\)/, 'toggle must follow the sidebar width');
  // Logseq gives .r a transform, which makes .r — not #head — the menu's
  // containing block. While the sidebar is open .r starts exactly at its edge,
  // so the menu's end-of-sidebar-header slot is a fixed offset back from .r.
  // Placed by its right edge, 6px inside the sidebar, so the button's own width
  // (32px in OG, 44px for Logseq 2.x's ghost buttons before the theme sizes them)
  // cannot push it over the edge.
  const menu = 'html[data-theme] .ls-left-sidebar-open #head .r > .ui__dropdown-trigger:has(.toolbar-dots-btn)';
  assert.equal(valueOf(menu, 'right'), 'calc(100% + 50px)', 'menu: its right edge 6px inside the sidebar — .r now starts 44px past it');
  assert.equal(valueOf(menu, 'left'), 'auto');
});

test('the sidebar header carries the app name, like Files\' AdwWindowTitle', () => {
  assert.equal(valueOf('html[data-theme] .ls-left-sidebar-open #head > .l::after', 'content'), '"Logseq"');
});

test('the app name is a GTK headerbar title: bold, in the interface font size', () => {
  // libadwaita 1.8: `headerbar .title, windowtitle .title { font-weight: bold }`
  // and no font-size, so the title inherits the interface font — 'Adwaita Sans
  // 11', 11pt — the same size as the sidebar rows under it. It was 14px, set
  // when the rows were still Logseq's 14px, and left behind when they moved.
  const title = 'html[data-theme] .ls-left-sidebar-open #head > .l::after';
  const row = 'html[data-theme] #left-sidebar .left-sidebar-inner .nav-header a.item';
  assert.equal(valueOf(title, 'font-size'), '11pt', "GNOME's default interface font is Adwaita Sans 11");
  assert.equal(valueOf(title, 'font-size'), valueOf(row, 'font-size'), 'title and sidebar rows share one size, as in Files');
  assert.equal(valueOf(title, 'font-weight'), '700');
});

test('the open-sidebar placements apply only where Logseq docks the sidebar (min-width 640px)', () => {
  // Below 640px Logseq turns the left sidebar into a wider overlay; the
  // docked placements would then land on top of it. There the header keeps
  // the collapsed layout — which is also what Files does when narrow.
  const docked = [
    'html[data-theme] .ls-left-sidebar-open #head > .l',
    'html[data-theme] .ls-left-sidebar-open #head > .l > div:has(> #left-menu)',
    'html[data-theme] .ls-left-sidebar-open #head > .r',
    'html[data-theme] .ls-left-sidebar-open #head .r > .ui__dropdown-trigger:has(.toolbar-dots-btn)',
    'html[data-theme] .ls-left-sidebar-open #head > .l::after',
    // Logseq 2.x: #left-menu sits directly in .l, and ⋮ has no dropdown wrapper
    'html[data-theme] .ls-left-sidebar-open #head > .l > #left-menu',
    'html[data-theme] .ls-left-sidebar-open #head .r > div:has(> .toggle-right-sidebar) > .toolbar-dots-btn',
  ];
  const wrong = [];
  for (const sel of docked) {
    const hits = rules(css).filter((r) => r.selector.split(',').map((s) => s.trim()).includes(sel));
    if (!hits.length) wrong.push(`${sel}: no rule`);
    for (const r of hits) if (!/min-width:\s*640px/.test(r.media ?? '')) wrong.push(`${sel}: not inside @media (min-width: 640px)`);
  }
  assert.deepEqual(wrong, [], wrong.join('\n  '));
});

test('the moved sidebar toggle can be clicked: it stacks above .r', () => {
  // Logseq gives both .l and .r an identity transform, so each is its own
  // stacking context and .r (later in the document) paints over .l. The toggle
  // sits over .r's area, so a z-index on it alone is confined inside .l — a
  // real click reached .r, a window-drag region. .l's no-op transform must go
  // while the toggle is out there, so its z-index ranks it against .r.
  assert.equal(valueOf('html[data-theme] .ls-left-sidebar-open #head > .l', 'transform'), 'none');
  assert.equal(valueOf('html[data-theme] .ls-left-sidebar-open #head > .l > div:has(> #left-menu)', 'z-index'), '1');
});

test('the main menu belongs to the sidebar: hidden with it, never moved into the content header', () => {
  // Files' pattern (the user's choice over Calendar's fixed content-header
  // menu): the menu lives in the sidebar header and goes away with the sidebar,
  // rather than jumping to the other end of the bar when the sidebar closes.
  // Logseq sets .ls-left-sidebar-open on <main> in both builds (OG's is
  // main.theme-inner, 2.x's a plain main), and ⋮ is wrapped only in OG.
  for (const menu of [
    '.ui__dropdown-trigger:has(.toolbar-dots-btn)',
    'div:has(> .toggle-right-sidebar) > .toolbar-dots-btn',
  ]) {
    assert.equal(valueOf(`html[data-theme] main:not(.ls-left-sidebar-open) #head .r > ${menu}`, 'display'), 'none', menu);
  }
});

test('Logseq 2.x: its one control group is unpacked so each control can take its Files slot', () => {
  // 2.x puts Back/Forward, ⋮ and the right-sidebar toggle in a single flex
  // group at the start of .r. Unpacked (display: contents), Back/Forward lead,
  // the right-sidebar toggle goes last, and ⋮ is placed like OG's.
  const group = 'html[data-theme] #head .r > div:has(> .toggle-right-sidebar)';
  assert.equal(valueOf(group, 'display'), 'contents');
  assert.equal(valueOf(`${group} > div:has(> .navigation)`, 'order'), '-1');
  assert.equal(valueOf(`${group} > div:has(> .navigation)`, 'margin-right'), 'auto');
  assert.equal(valueOf(`${group} > .toggle-right-sidebar`, 'order'), '1');
});

test('Logseq 2.x header buttons get the same 32px Adwaita flat-button size as OG\'s', () => {
  // 2.x renders them as shui ghost buttons (.ui__button.as-ghost, h-10: 40x44px),
  // which the OG-era `.cp__header .button` rule never reached.
  for (const [prop, want] of [['height', '32px'], ['min-width', '32px']]) {
    assert.equal(valueOf('html[data-theme] .cp__header .ui__button.as-ghost', prop), want, prop);
  }
  // They are content-box, and the theme's general .ui__button padding (5px 10px)
  // then grew the 32px box to 52x42. Icon-only ones are sized as GTK's are.
  const iconOnly = 'html[data-theme] .cp__header .ui__button.as-ghost:has(> .ui__icon:only-child)';
  assert.equal(valueOf(iconOnly, 'box-sizing'), 'border-box');
  assert.equal(valueOf(iconOnly, 'padding'), '0');
});

test('the moved toggle is outside .r\'s box, so .r\'s window-drag region cannot swallow it', () => {
  // Electron resolves -webkit-app-region in document order — a later drag
  // region overrides an earlier no-drag one, whatever is painted on top. The
  // toggle lives in .l (earlier) but sat over .r's left padding (later, drag),
  // so a real mouse press dragged the window. Make room with a margin: .r's box
  // then starts past the toggle and only #head (an ancestor, earlier) is under it.
  const r = 'html[data-theme] .ls-left-sidebar-open #head > .r';
  assert.equal(valueOf(r, 'margin-left'), '44px');
  assert.equal(valueOf(r, 'padding-left'), undefined, 'padding would put .r under the toggle again');
});

test('the menu placed outside .r is not clipped by it (Logseq 2.x: overflow-x-hidden)', () => {
  // The menu sits 38px left of .r's box. Logseq 2.x gives .r Tailwind's
  // overflow-x-hidden, which clipped it away — the pointer then reached .l.
  assert.equal(valueOf('html[data-theme] .ls-left-sidebar-open #head > .r', 'overflow'), 'visible');
});

test('the header reserves room for the window controls only while they sit over it', () => {
  // With the right sidebar open the window controls sit over the sidebar, not
  // the header — Logseq's own reservation is `:not(.ls-right-sidebar-open)`.
  // Reserving there too left a ~100px gap before the main section's edge.
  const wrong = rules(css).filter(({ selector, body }) =>
    selector.split(',').some((s) => /\.ls-right-sidebar-open .*\.cp__header > \.r/.test(s) && !/:not\(\.ls-right-sidebar-open\)/.test(s)) &&
    /margin-right:\s*var\(--adw-wc-width\)/.test(body)
  );
  assert.deepEqual(wrong.map((r) => r.selector), []);
});

test('with the sidebar closed, the left part collapses so the toggle and arrows start the bar', () => {
  assert.equal(valueOf('html[data-theme] #head > .l', 'min-width'), '0');
});
