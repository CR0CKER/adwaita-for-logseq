/**
 * The settings → CSS mapping, kept free of the `logseq` global on purpose:
 * everything the plugin actually *decides* lives here, so it can be unit-tested
 * without an app to drive. `index.ts` is the thin adapter that reads
 * `logseq.settings` and hands the result to `provideStyle`.
 */

export const FOLLOW_LOGSEQ = 'follow Logseq';

/** libadwaita's `@accent_bg_color` per accent name. These nine hexes are the
 *  ones inside libadwaita-1.so.0 itself, not approximations — confirmed with
 *  `strings /usr/lib64/libadwaita-1.so.0 | grep -E '^#[0-9a-f]{6}$'`. */
export const GNOME_ACCENTS: Record<string, string> = {
  blue: '#3584e4',
  teal: '#2190a4',
  green: '#3a944a',
  yellow: '#c88800',
  orange: '#ed5b00',
  red: '#e62d42',
  pink: '#d56199',
  purple: '#9141ac',
  slate: '#6f8396',
};

/** The two text-colour choices. "Quiet" is libadwaita's own restraint — prose is
 *  body text, colour is for the accent; "Text Editor" colours headings, inline
 *  code and quotes the way GNOME Text Editor's Adwaita style scheme does. */
export const TEXT_COLOURS = {
  quiet: 'GNOME apps (quiet)',
  textEditor: 'Text Editor (Adwaita scheme)',
} as const;

/** What "Text Editor" repoints, and at which scheme colour (27-text.css). */
const TEXT_EDITOR_ROLES: Record<string, string> = {
  '--adw-heading-fg': 'var(--adw-text-teal)',
  '--adw-code-fg': 'var(--adw-text-violet)',
  '--adw-quote-border': 'var(--adw-text-grey)',
};

export const DEFAULTS = {
  gnomeAccent: 'blue',
  customAccentHex: '#3584e4',
  accentLightnessDark: 0.763,
  windowControls: 'all',
  textColours: TEXT_COLOURS.quiet,
  fontSans: '"Adwaita Sans", Cantarell, system-ui, sans-serif',
  fontMono: '"Adwaita Mono", ui-monospace, monospace',
} as const;

export type Settings = {
  gnomeAccent?: string;
  customAccentHex?: string;
  accentLightnessDark?: number;
  windowControls?: string;
  hideRightSidebarTopbar?: boolean;
  textColours?: string;
  fontSans?: string;
  fontMono?: string;
};

/**
 * Resolve the accent hex the theme should derive from.
 *
 * Returns `null` for "follow Logseq", which means: emit no override at all and
 * let Logseq's own accent picker drive.
 */
export function resolveAccent(s: Settings): string | null {
  const name = String(s.gnomeAccent ?? DEFAULTS.gnomeAccent);
  if (name === FOLLOW_LOGSEQ) return null;
  if (name === 'custom') return String(s.customAccentHex ?? DEFAULTS.customAccentHex).trim();
  return GNOME_ACCENTS[name] ?? GNOME_ACCENTS.blue;
}

/**
 * Build the settings stylesheet.
 *
 * Root-level overrides carry `!important`, deliberately. This sheet does NOT
 * reliably load after the theme sheet: the plugin injects it at startup, and
 * Logseq appends the theme's <link> whenever a theme is selected — at startup
 * and on every theme or mode switch — so the link usually lands *after* it.
 * Both declare these custom properties on the root at equal specificity, so
 * without `!important` the theme's defaults won and five of the seven settings
 * were silently ignored. An explicit user setting beating the theme's default
 * is exactly what `!important` expresses; the theme itself never uses it on
 * these properties (tests/static/override-order.test.mjs pins both halves).
 */
export function buildSettingsCss(s: Settings): string {
  const accent = resolveAccent(s);
  const follows = accent === null;
  const lightness = Number(s.accentLightnessDark ?? DEFAULTS.accentLightnessDark);
  const closeOnly = String(s.windowControls ?? DEFAULTS.windowControls) === 'close only';
  // Anything but an exact "Text Editor" is quiet, so a stale or mistyped value
  // degrades to the default rather than to a half-coloured page.
  const textEditor = String(s.textColours ?? DEFAULTS.textColours) === TEXT_COLOURS.textEditor;
  const textRoles = textEditor
    ? Object.entries(TEXT_EDITOR_ROLES).map(([role, value]) => `\n  ${role}: ${value} !important;`).join('')
    : '';

  const rules: string[] = [
    `:root {
  --adw-gnome-accent: ${accent ?? GNOME_ACCENTS.blue} !important;
  --adw-font-sans: ${s.fontSans ?? DEFAULTS.fontSans} !important;
  --adw-font-mono: ${s.fontMono ?? DEFAULTS.fontMono} !important;${closeOnly ? '\n  --adw-wc-width: 44px !important;' : ''}${textRoles}
}`,
    // Only the dark clamp is exposed: on light, libadwaita's min(l, 0.5) is
    // what keeps accent text readable on white, and lowering it further is a
    // contrast decision the user should not have to make.
    `html[data-theme="dark"],
html[data-theme="dark"][data-color] { --adw-accent-l: ${lightness} !important; }`,
  ];

  // Logseq is not accent-less out of the box: it ships with data-color="logseq",
  // the turquoise "Logseq classical color". The stylesheet's own fallback only
  // covers the genuinely unset cases, so on a default install the setting above
  // would look inert. Treat that shipped default as unset too — it is a default,
  // not a choice — and redeclare --ls-link-text-color on the theme wrapper.
  // This one does not depend on load order: at (0,3,1) it outranks Logseq's
  // `html[data-color=x] .dark-theme` (0,2,1), and the solarized palette sits on
  // <html> itself, which the wrapper beats by inheritance.
  //
  // Deliberately *not* matched: any other data-color. Pick purple in Logseq's
  // own Settings → Accent color and purple still wins, exactly as before.
  if (!follows) {
    const intentless = ['', 'none', 'logseq'].map(
      (v) => `html[data-theme][data-color="${v}"] :is(.dark-theme, .light-theme)`
    );
    intentless.push('html[data-theme]:not([data-color]) :is(.dark-theme, .light-theme)');
    rules.push(`${intentless.join(',\n')} {
  --ls-link-text-color: var(--adw-accent-default);
}`);
  }

  if (closeOnly) {
    rules.push(`html[data-theme] .window-controls .button.minimize,
html[data-theme] .window-controls .button.maximize-toggle { display: none; }`);
  }
  if (s.hideRightSidebarTopbar) {
    rules.push(`html[data-theme] .cp__right-sidebar-topbar { display: none; }`);
  }

  return rules.join('\n\n');
}
