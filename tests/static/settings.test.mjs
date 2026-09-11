/**
 * Unit tests for the settings → CSS mapping.
 *
 * This is where the accent precedence lives, and it got the trade-off wrong
 * twice in a row: first the setting was inert (it only applied when Logseq had
 * no accent, but Logseq ships with `data-color="logseq"` already set), then the
 * over-correction made Logseq's own accent picker inert (the override matched
 * every `data-color`).
 *
 * The rule that resolves it: an override applies only where the `data-color`
 * carries no intent — unset, empty, "none", or Logseq's shipped "logseq"
 * default. A deliberately chosen accent wins. These tests pin both halves.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSettingsCss, resolveAccent, GNOME_ACCENTS, DEFAULTS, FOLLOW_LOGSEQ, TEXT_COLOURS } from '../../src/settings-css.ts';

const OVERRIDE = '--ls-link-text-color: var(--adw-accent-default)';

test('defaults emit GNOME blue and no window-control narrowing', () => {
  const css = buildSettingsCss({});
  assert.match(css, /--adw-gnome-accent:\s*#3584e4/);
  assert.doesNotMatch(css, /--adw-wc-width/, 'all three controls are the default');
  assert.match(css, /--adw-accent-l:\s*0\.763/);
});

test('each GNOME accent name maps to libadwaita\'s own hex', () => {
  for (const [name, hex] of Object.entries(GNOME_ACCENTS)) {
    assert.equal(resolveAccent({ gnomeAccent: name }), hex, `${name} should be ${hex}`);
    assert.match(buildSettingsCss({ gnomeAccent: name }), new RegExp(`--adw-gnome-accent:\\s*${hex}`));
  }
});

test('custom uses the supplied hex, trimmed', () => {
  assert.equal(resolveAccent({ gnomeAccent: 'custom', customAccentHex: '  #a4caee ' }), '#a4caee');
  assert.match(buildSettingsCss({ gnomeAccent: 'custom', customAccentHex: '#a4caee' }), /--adw-gnome-accent:\s*#a4caee/);
});

test('an unknown accent name falls back to blue rather than emitting nothing', () => {
  assert.equal(resolveAccent({ gnomeAccent: 'chartreuse' }), GNOME_ACCENTS.blue);
});

test('"follow Logseq" emits no accent override at all', () => {
  const css = buildSettingsCss({ gnomeAccent: FOLLOW_LOGSEQ });
  assert.equal(resolveAccent({ gnomeAccent: FOLLOW_LOGSEQ }), null);
  assert.ok(!css.includes(OVERRIDE), 'Logseq’s own accent picker must stay in charge');
});

test('an explicit accent overrides only the intentless data-color values', () => {
  // The regression this pins: matching every [data-color] made Logseq's picker
  // inert; matching none of them made the setting inert.
  const css = buildSettingsCss({ gnomeAccent: 'yellow' });
  assert.ok(css.includes(OVERRIDE), 'an explicit choice must emit the override');

  const block = css.slice(css.indexOf(OVERRIDE) - 400, css.indexOf(OVERRIDE));
  const matched = [...block.matchAll(/\[data-color="([^"]*)"\]/g)].map((m) => m[1]).sort();
  assert.deepEqual(matched, ['', 'logseq', 'none'], 'only Logseq’s defaults count as intentless');
  assert.match(block, /html\[data-theme\]:not\(\[data-color\]\)/, 'the genuinely-unset case too');

  for (const chosen of ['purple', 'orange', 'teal']) {
    assert.ok(
      !block.includes(`[data-color="${chosen}"]`),
      `a deliberately chosen ${chosen} accent must keep winning`
    );
  }
});

test('"close only" hides the extra controls and narrows the reserved width', () => {
  const css = buildSettingsCss({ windowControls: 'close only' });
  assert.match(css, /--adw-wc-width:\s*44px/);
  assert.match(css, /\.window-controls \.button\.minimize/);
  assert.match(css, /\.window-controls \.button\.maximize-toggle/);
  assert.match(css, /display:\s*none/);
});

test('"all" emits neither the hide rule nor the narrowed width', () => {
  const css = buildSettingsCss({ windowControls: 'all' });
  assert.doesNotMatch(css, /minimize/);
  assert.doesNotMatch(css, /--adw-wc-width/);
});

test('the right-sidebar topbar toggle is off unless asked for', () => {
  assert.doesNotMatch(buildSettingsCss({}), /cp__right-sidebar-topbar/);
  assert.match(buildSettingsCss({ hideRightSidebarTopbar: true }), /cp__right-sidebar-topbar.*display:\s*none/s);
});

test('fonts fall back to the documented stacks', () => {
  const css = buildSettingsCss({});
  assert.ok(css.includes(DEFAULTS.fontSans), 'sans stack');
  assert.ok(css.includes(DEFAULTS.fontMono), 'mono stack');
  assert.match(buildSettingsCss({ fontSans: 'Cantarell' }), /--adw-font-sans:\s*Cantarell/);
});

// The prose roles the "Text Editor" choice recolours, and the scheme colour each
// takes — GNOME Text Editor's Adwaita style scheme: teal headings, violet code.
const TEXT_EDITOR_ROLES = {
  '--adw-heading-fg': 'var(--adw-text-teal)',
  '--adw-code-fg': 'var(--adw-text-violet)',
  '--adw-quote-border': 'var(--adw-text-grey)',
};

test('quiet text colours are the default and emit no role override', () => {
  assert.equal(DEFAULTS.textColours, TEXT_COLOURS.quiet);
  for (const css of [buildSettingsCss({}), buildSettingsCss({ textColours: TEXT_COLOURS.quiet })]) {
    for (const role of Object.keys(TEXT_EDITOR_ROLES)) {
      assert.ok(!css.includes(role), `quiet leaves ${role} to the theme's default`);
    }
  }
});

test('"Text Editor" text colours point every prose role at its scheme colour, !important', () => {
  // !important for the same reason as every other root override here: the
  // theme <link> can land after this sheet (override-order.test.mjs).
  const css = buildSettingsCss({ textColours: TEXT_COLOURS.textEditor });
  for (const [role, value] of Object.entries(TEXT_EDITOR_ROLES)) {
    assert.ok(css.includes(`${role}: ${value} !important;`), `${role} should be ${value}`);
  }
});

test('the title colour is not a setting: neither choice touches it', () => {
  for (const choice of Object.values(TEXT_COLOURS)) {
    assert.ok(!buildSettingsCss({ textColours: choice }).includes('--adw-title-fg'), choice);
  }
});

test('an unknown text-colour choice falls back to quiet', () => {
  const css = buildSettingsCss({ textColours: 'Solarized' });
  for (const role of Object.keys(TEXT_EDITOR_ROLES)) assert.ok(!css.includes(role));
});

test('the accent lightness knob reaches the dark clamp only', () => {
  const css = buildSettingsCss({ accentLightnessDark: 0.85 });
  assert.match(css, /html\[data-theme="dark"\][\s\S]*--adw-accent-l:\s*0\.85/);
  assert.doesNotMatch(css, /data-theme="light"/, 'light keeps libadwaita’s min(l, 0.5)');
});
