import '@logseq/libs';
import type { SettingSchemaDesc } from '@logseq/libs/dist/LSPlugin';

/**
 * Two jobs:
 *
 * 1. Register the two themes. They are *not* declared in package.json's
 *    `logseq.themes`, deliberately. That path makes the host resolve the
 *    stylesheet to an `assets://` URL, which Logseq OG (Electron 43) rewrites
 *    to `file://` — and a `file://` subresource of an `lsp://` document is
 *    blocked outright: "Not allowed to load local resource". The theme then
 *    appears in the picker and silently does nothing. Registering at runtime
 *    with resolveResourceFullUrl() asks the SDK for the plugin's own static
 *    root instead, which is the scheme the host actually serves.
 *
 * 2. Hold the machine-specific choices — which accent GNOME is set to,
 *    whether the titlebar shows one button or three — as settings rather than
 *    edits to the stylesheet. Everything it emits is a handful of custom
 *    properties on :root, injected with provideStyle() so it lands after the
 *    theme sheet and wins without !important.
 */

/** libadwaita's @accent_bg_color per accent name. These nine hexes are the
 *  ones inside libadwaita-1.so.0 itself, not approximations. */
const FOLLOW_LOGSEQ = 'follow Logseq';

const GNOME_ACCENTS: Record<string, string> = {
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

const settings: SettingSchemaDesc[] = [
  {
    key: 'gnomeAccent',
    type: 'enum',
    enumChoices: [...Object.keys(GNOME_ACCENTS), 'custom'],
    enumPicker: 'select',
    default: 'blue',
    title: 'GNOME accent colour',
    description:
      'Which accent GNOME Settings is set to. CSS cannot read it — Chromium reports its own generic blue — so it has to be told. ' +
      'This is only the fallback: an accent picked in Logseq’s own Settings → Accent color still wins. Choose “custom” to use the hex below.',
  },
  {
    key: 'customAccentHex',
    type: 'string',
    default: '#3584e4',
    title: 'Custom accent (hex)',
    description:
      'Used when the accent above is “custom”. Give the *fill* colour, as GNOME does; the lighter text accent on dark, and the darker one on light, are derived from it.',
  },
  {
    key: 'accentLightnessDark',
    type: 'number',
    default: 0.763,
    title: 'Accent lightness on dark (advanced)',
    description:
      'The oklab lightness floor for accent text on dark. GNOME’s own value is 0.85; 0.763 is one notch darker and slightly more saturated.',
  },
  {
    key: 'windowControls',
    type: 'enum',
    enumChoices: ['all', 'close only'],
    enumPicker: 'radio',
    default: 'all',
    title: 'Window controls',
    description:
      'Set this to match your GNOME titlebar layout (org.gnome.desktop.wm.preferences button-layout). “Close only” hides minimise and maximise, for an appmenu:close desktop. Only applies with a frameless window — Settings → General → Native title bar off.',
  },
  {
    key: 'hideRightSidebarTopbar',
    type: 'boolean',
    default: false,
    title: 'Hide the right sidebar’s top bar',
    description: 'Removes the sidebar’s own header strip, leaving one continuous headerbar.',
  },
  {
    key: 'fontSans',
    type: 'string',
    default: '"Adwaita Sans", Cantarell, system-ui, sans-serif',
    title: 'Interface font',
    description: 'Adwaita Sans ships with GNOME 47 and newer; Cantarell is the fallback on older systems.',
  },
  {
    key: 'fontMono',
    type: 'string',
    default: '"Adwaita Mono", ui-monospace, monospace',
    title: 'Monospace font',
    description: 'Used for code blocks, inline code and the editors.',
  },
];

type Settings = {
  gnomeAccent?: string;
  customAccentHex?: string;
  accentLightnessDark?: number;
  windowControls?: string;
  hideRightSidebarTopbar?: boolean;
  fontSans?: string;
  fontMono?: string;
};

function css(): string {
  const s = (logseq.settings ?? {}) as Settings;
  const accentName = String(s.gnomeAccent ?? 'blue');
  const accent =
    accentName === 'custom'
      ? String(s.customAccentHex ?? '#3584e4').trim()
      : GNOME_ACCENTS[accentName] ?? GNOME_ACCENTS.blue;

  const lightness = Number(s.accentLightnessDark ?? 0.763);
  const follows = accentName === FOLLOW_LOGSEQ;
  const closeOnly = String(s.windowControls ?? 'all') === 'close only';

  const rules: string[] = [
    `:root {
  --adw-gnome-accent: ${accent};
  --adw-font-sans: ${s.fontSans ?? '"Adwaita Sans", Cantarell, system-ui, sans-serif'};
  --adw-font-mono: ${s.fontMono ?? '"Adwaita Mono", ui-monospace, monospace'};${
    closeOnly ? '\n  --adw-wc-width: 44px;' : ''
  }
}`,
    // Only the dark clamp is exposed: on light, libadwaita's min(l, 0.5) is
    // what keeps accent text readable on white, and lowering it further is a
    // contrast decision the user should not have to make.
    `html[data-theme="dark"],
html[data-theme="dark"][data-color] { --adw-accent-l: ${lightness}; }`,
  ];

  // The stylesheet only falls back to the GNOME accent when Logseq has no
  // accent of its own — but Logseq ships with data-color="logseq" set, so that
  // fallback almost never fires and the setting above would look inert. An
  // explicit choice therefore redeclares --ls-link-text-color on the theme
  // wrapper, which is where Logseq's own accent palettes declare it: same
  // specificity, and this block is injected after them.
  if (!follows) {
    rules.push(`html[data-theme][data-color] :is(.dark-theme, .light-theme),
html[data-theme] :is(.dark-theme, .light-theme) {
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

function apply() {
  logseq.provideStyle({ key: 'adwaita-settings', style: css() });
}

function registerThemes() {
  const url = logseq.resolveResourceFullUrl('themes/adwaita.css');
  const pid = logseq.baseInfo.id;
  logseq.provideTheme({ pid, name: 'Adwaita Dark', mode: 'dark', url, description: "GNOME's Adwaita, dark" });
  logseq.provideTheme({ pid, name: 'Adwaita Light', mode: 'light', url, description: "GNOME's Adwaita, light" });
}

function main() {
  registerThemes();
  logseq.useSettingsSchema(settings);
  apply();
  logseq.onSettingsChanged(apply);
}

logseq.ready(main).catch(console.error);
