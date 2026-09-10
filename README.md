# Adwaita for Logseq

A theme plugin for Logseq on the **Linux GNOME desktop environment**: it makes Logseq look
like a native GNOME app — one merged headerbar, Adwaita surfaces, round window-control
buttons, GNOME's own metrics — in light and dark.

![Adwaita Dark](screenshots/dark.png)

![Adwaita Light](screenshots/light.png)

Every colour and measurement comes out of libadwaita itself rather than being sampled
from a screenshot:

```
gresource extract /usr/lib64/libadwaita-1.so.0 /org/gnome/Adwaita/styles/default.css
```

Window radius 15px, headerbar 47px, button and entry radius 9px, popover radius 12px;
surfaces `#1d1d20` / `#2e2e32` / `#36363a` on dark and `#ffffff` / `#ebebed` / `#fafafb`
on light; text at 80% opacity, borders at 15%, exactly as GNOME derives them.

## Install

Download the zip from the [latest release](https://github.com/CR0CKER/adwaita-for-logseq/releases/latest), unzip it, then in Logseq turn on
**Settings → Advanced → Developer mode** and use **Plugins → Load unpacked plugin** on the
unzipped folder. Then pick *Adwaita Dark* or *Adwaita Light* in **Settings → Themes**.

(A Logseq marketplace listing is planned; this section will point there once it exists.)

## Three things the stylesheet cannot do for you

CSS reaches the page, not the window. Without these the theme still applies, but it will
not look like the screenshots — and each one takes a few seconds:

**1. Turn the native title bar off.** Settings → General → *Native title bar* → off.
This is what gives Logseq a frameless window with the merged headerbar and the window
controls the theme styles. With it on, you get a GTK titlebar above a Logseq toolbar —
two bars where GNOME apps have one.

**2. Add the launch flags** to the `Exec=` line of your Logseq `.desktop` file. Copy it
into `~/.local/share/applications/` first, so a package update does not overwrite it; its
name depends on how Logseq was installed.

```
--enable-features=WaylandWindowDecorations,OverlayScrollbar --gtk-version=4
```

- `WaylandWindowDecorations` — Chromium draws the client-side frame of the frameless
  window: its shadow and resize edges, and rounded corners on Electron 43 or newer (see
  Scope). Without it the window has no frame at all.
- `OverlayScrollbar` — **the scrollbars come from this flag, not from the theme.**
  Logseq sets `scrollbar-color` on `:root`, and since Chromium 121 any specified
  `scrollbar-color` or `scrollbar-width` makes every `::-webkit-scrollbar*` rule inert —
  including `::-webkit-scrollbar-button { display: none }`. There is no CSS that removes
  the stepper arrows or reclaims the reserved gutter. With the flag you get real GTK-style
  overlay scrollbars: no buttons, no reserved width, fading out when idle. Without it,
  Chromium's classic scrollbars, tinted to match.
- `--gtk-version=4` — file dialogs render with GTK4/libadwaita.

**3. Select one of the two Adwaita themes** in Settings → Themes for the mode you use.
Logseq applies one theme per mode, so another theme selected there replaces this one.

## Settings

The plugin does two things: it registers the two themes (which on newer Logseq builds has
to happen in code — see *Why the themes are registered in code*), and it holds the handful of
choices that differ between machines. Settings → Plugins → `gnome-adwaita-theme` → the
gear icon.

| Setting | Default | What it is for |
|---|---|---|
| Accent colour | `blue` | Which accent GNOME Settings is on. **CSS cannot read it** — Chromium's `AccentColor` resolves to its own generic blue, not GTK's — so it has to be told. The nine choices are libadwaita's own `@accent_bg_color` values. Set it to `follow Logseq` to hand control back to Logseq's own accent picker. |
| Custom accent (hex) | `#3584e4` | Used when the accent above is `custom`. Give the *fill* colour; the text accent is derived. |
| Accent lightness on dark (advanced) | `0.763` | The oklab lightness floor for accent text on dark. GNOME's own is 0.85; 0.763 is a notch darker and more saturated. |
| Window controls | `all` | Set to `close only` if your GNOME titlebar layout is `appmenu:close`. |
| Hide the right sidebar's top bar | off | Leaves one continuous headerbar. |
| Interface / monospace font | Adwaita Sans / Adwaita Mono | Adwaita Sans ships with GNOME 47+; Cantarell is the fallback. |

### How the accent works

Both pickers work, and which one wins depends on whether you have actually chosen an
accent in Logseq:

| Logseq's Settings → Accent color | What you get |
|---|---|
| its default (the turquoise "logseq" swatch), or none | the plugin's **Accent colour** |
| any other accent — purple, orange, teal… | that accent |

Logseq is not accent-less out of the box: it ships with `data-color="logseq"` already set.
Treating that as "unset" is what lets the plugin's setting mean anything on a fresh
install, while still yielding the moment you pick something deliberately. Set the plugin's
Accent colour to **follow Logseq** to let the turquoise default win too.

From whichever accent wins, the theme derives the same three values libadwaita does: the
standalone accent for text (`oklab(from accent max(l, 0.763) a b)` on dark, `min(l, 0.5)`
on light), the fill below it, and a hover step above. Links, tags, refs, selection, the
focus ring and checkboxes all follow.

The surfaces never do. Logseq normally re-tints its whole neutral ramp along with the
accent, which turns linked-reference and quote cards warm; the theme puts the greys back —
verified `#2e2e32` under the default, purple and orange alike.

## Scope

- **Linux/GNOME**, light and dark. It will apply anywhere, but the point of it is the
  match with Adwaita.
- Verified by an automated suite that drives the real app and asserts computed styles:

  | Build | Status |
  |---|---|
  | **Logseq OG** (Electron 43) | every live case passes; the light-mode case fails intermittently for a harness reason (see CHANGELOG) |
  | **Logseq 2.x** (2.0.1, DB build) | all cases pass except the search dialog and divider cases, which skip because the harness cannot yet open a graph in a fresh 2.x profile |
  | **Logseq 0.10.13** | stylesheet verified by CDP probe; not in the live suite, because its renderer aborts unprompted on the development machine |

  Logseq 2.x's `--ls-*` palette is a strict subset of OG's, so the theme's variable
  coverage applies there unchanged.
- Three rules target components 0.10.13 does not have (`.ui__dialog-content`,
  `.ui__popover-content`, `.cm-editor`); they simply do not match there, and
  `.ui__modal-panel` and `.CodeMirror` cover the same ground.
- **Round window corners need Electron 43 or newer.** The frame is painted by Electron
  outside the web contents, so no stylesheet can reach it. Electron 41 gave frameless
  windows client-side decorations on Wayland — a shadow and resize edges — but rounded
  corners only arrived in
  [Electron 43.0.0](https://releases.electronjs.org/release/v43.0.0) ("On Linux,
  frameless windows now have rounded corners by default"). Logseq OG is on 43 and gets
  them; Logseq 2.0.1 is on Electron 42.3.0 and has square corners until Logseq ships a
  newer Electron.

## Development

```
npm install
npm run build     # concatenates src/css/* into themes/adwaita.css, bundles the plugin
npm test          # static regression suite (this is what CI runs)
npm run test:live # drives real Logseq builds — local only, needs a binary
```

To try a change, turn on Logseq → Settings → Advanced → Developer mode and use **Load
unpacked plugin** on the repo directory. The two themes appear in Settings → Themes like
any installed theme.

`src/css/` is split so a colour is written down in exactly one place:

| File | |
|---|---|
| `10-tokens-dark.css` | the dark palette, from libadwaita |
| `15-tokens-light.css` | the light palette, from libadwaita |
| `20-mappings.css` | Logseq's `--ls-*`, the shui `--lx-gray-*` ramp and the shadcn HSL triplets, all pointed at those tokens — colour-scheme independent |
| `25-accent.css` | accent derivation and the neutral-ramp restatement |
| `30-structure.css` | headerbar, sidebar, window controls, widgets, content — geometry only, every colour a token |

The structure rules are scoped `html[data-theme]`, not `html[data-theme="dark"]`, so one
sheet serves both schemes and the palette files are the only difference between them.

### Tests

Two tiers, because CI cannot run the app and text-matching a stylesheet cannot prove a
cascade rule *wins* — and most of the bugs this suite locks down were cascade bugs.

**Static (`npm test`, the CI gate).** Every `--ls-*` in Logseq's shipped solarized palette
is overridden or allowlisted with a reason; no undefined `--adw-*` reference; the
structure sheet stays scheme-agnostic and free of literal colours; every `[data-color]`
specificity tie is present; all nine accents clear WCAG AA on both surfaces in both
schemes; the settings logic behaves; and `themes/adwaita.css` matches a fresh build.

**Live (`npm run test:live`, local only).** Launches a scratch instance with an isolated
`HOME`, loads this repo as an unpacked plugin, selects the theme and asserts computed
styles: stored settings winning over the theme sheet, surfaces, light/dark inversion,
accent precedence, the search dialog's edges, divider geometry, sidebar section headers,
button hover colour, and accent contrast.

```
npm run test:live -- --target=og      # one target
LOGSEQ_OG_BIN=/path/to/Logseq-OG npm run test:live
LOGSEQ_DB_BIN=/path/to/logseq npm run test:live -- --target=db
```

A target whose binary is missing is skipped with a reason, never silently passed.

**`./scripts/redcheck.sh`** proves the suite is not vacuous. Every assertion here was
written after its bug was already fixed, so the usual red-then-green order was impossible;
this script reconstructs the red half by putting the pre-fix code back — from git history,
or as a mutation in a scratch tree — and requires the matching test to fail.

**Fixtures are version-scoped.** `tests/fixtures/logseq-vars.<target>.json` is extracted
from one build's stylesheet, so a Logseq upgrade can introduce variables the theme does not
cover. Regenerate when testing a new version:

```
node scripts/extract-logseq-vars.mjs og /path/to/Logseq/resources/app/css/style.css
```

Logseq 2.x packs its stylesheet inside `app.asar`; dump it from a running instance first
with `node scripts/dump-app-css.mjs <devtools-port> /tmp/db-style.css`, then run the
extractor on that file.

### Why the themes are registered in code, not in package.json

The conventional way to ship a theme is `logseq.themes` in package.json. Doing that makes
the host resolve the stylesheet to an `assets://` URL — which Logseq OG (Electron 43)
rewrites to `file://`, and a `file://` subresource of an `lsp://` document is blocked
outright:

```
Not allowed to load local resource: file:///…/themes/adwaita.css
```

The theme then shows up in the picker and silently does nothing. Official 0.10.13
(Electron 27) loads the same `assets://` URL fine, so this only bites on newer Electron —
but it bites both marketplace *and* unpacked installs there.

Registering at runtime with `logseq.provideTheme()` and
`logseq.resolveResourceFullUrl('themes/adwaita.css')` asks the SDK for the plugin's own
static root instead, which is the scheme the host actually serves: `lsp://logseq.io/<id>/…`
for an installed plugin, `lsp://logseq.com/external/<path>/…` for an unpacked one. Verified
on Logseq OG, installed and unpacked, and on Logseq 2.0.1 unpacked.

### Why some rules look over-specific

Logseq paints the same surface through four independent systems, and a theme has to cover
all of them:

1. `--ls-*` — the classic theme layer.
2. `--lx-gray-01..12` — the shui/radix ramp. Buttons, dropdowns, dialogs, cmdk and
   `.references-blocks-item` read *these*, not the `--ls-*` vars.
3. shadcn HSL triplets (`--primary`, `--popover`, `--ring`, …), consumed as
   `hsl(var(--primary))`. Untouched, every shui button stays a near-white pill.
4. Element-level overrides further down Logseq's own sheet.

Three traps are worth knowing before editing:

- `html[data-theme="dark"][data-color="<accent>"]` activates a full ~50-variable palette at
  specificity (0,2,1) — the solarized-ish `logseq` one is the **default on a fresh
  install** — which outranks a plain `html[data-theme="dark"]` block. Every token block
  here therefore carries a second `[data-color]` selector to tie that specificity and win
  on order.
- That palette spends its two subtlest accent steps (`--lx-accent-01`/`-02`) on chrome —
  button hovers, tooltip and dialog borders — so in it they are teal. The theme maps both to
  neutral Adwaita tokens; steps 03 and up keep the accent.
- The plugin's settings stylesheet cannot rely on load order: Logseq appends the theme's
  `<link>` whenever a theme is selected, after the settings `<style>`. The root-level
  overrides it shares with the theme are therefore `!important`, and a test requires it.

## Licence

MIT.
