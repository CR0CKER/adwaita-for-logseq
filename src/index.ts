import '@logseq/libs';
import type { SettingSchemaDesc } from '@logseq/libs/dist/LSPlugin';
import { buildSettingsCss, FOLLOW_LOGSEQ, GNOME_ACCENTS, type Settings } from './settings-css';

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

function apply() {
  logseq.provideStyle({
    key: 'adwaita-settings',
    style: buildSettingsCss((logseq.settings ?? {}) as Settings),
  });
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
