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
  const menu = valueOf('html[data-theme] .ls-left-sidebar-open #head .r > .ui__dropdown-trigger:has(.toolbar-dots-btn)', 'left');
  assert.equal(menu, '-38px', 'menu: 32px button + 6px from the sidebar edge, measured from .r');
});

test('the sidebar header carries the app name, like Files\' AdwWindowTitle', () => {
  assert.equal(valueOf('html[data-theme] .ls-left-sidebar-open #head > .l::after', 'content'), '"Logseq"');
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
  ];
  const wrong = [];
  for (const sel of docked) {
    const hits = rules(css).filter((r) => r.selector.split(',').map((s) => s.trim()).includes(sel));
    if (!hits.length) wrong.push(`${sel}: no rule`);
    for (const r of hits) if (!/min-width:\s*640px/.test(r.media ?? '')) wrong.push(`${sel}: not inside @media (min-width: 640px)`);
  }
  assert.deepEqual(wrong, [], wrong.join('\n  '));
});

test('with the sidebar closed, the left part collapses so the toggle and arrows start the bar', () => {
  assert.equal(valueOf('html[data-theme] #head > .l', 'min-width'), '0');
});
