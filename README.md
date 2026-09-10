# Adwaita for Logseq

Logseq that looks like it belongs on a GNOME desktop: one merged headerbar, Adwaita
surfaces, round window-control buttons, GNOME's own metrics, in light and dark.

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

From Logseq's marketplace: **Settings → Plugins → Marketplace → Themes → Adwaita**, then
pick *Adwaita Dark* or *Adwaita Light* in **Settings → Themes**.

## Three things the stylesheet cannot do for you

CSS reaches the page, not the window. Without these the theme still applies, but it will
not look like the screenshots — and each one takes a few seconds:

**1. Turn the native title bar off.** Settings → General → *Native title bar* → off.
This is what gives Logseq a frameless window with the merged headerbar and the window
controls the theme styles. With it on, you get a GTK titlebar above a Logseq toolbar —
two bars where GNOME apps have one.

**2. Add the launch flags** to your `.desktop` file's `Exec=` line (on Linux, copy
`/usr/share/applications/logseq.desktop` to `~/.local/share/applications/` first, so a
package update does not overwrite it):

```
--enable-features=WaylandWindowDecorations,OverlayScrollbar --gtk-version=4
```

- `WaylandWindowDecorations` — Chromium draws the CSD frame: rounded corners, shadow,
  resize edges on the frameless window.
- `OverlayScrollbar` — **the scrollbars come from this flag, not from the theme.**
  Logseq sets `scrollbar-color` on `:root`, and since Chromium 121 any specified
  `scrollbar-color` or `scrollbar-width` makes every `::-webkit-scrollbar*` rule inert —
  including `::-webkit-scrollbar-button { display: none }`. There is no CSS that removes
  the stepper arrows or reclaims the reserved gutter. With the flag you get real GTK-style
  overlay scrollbars: no buttons, no reserved width, fading out when idle. Without it,
  Chromium's classic scrollbars, tinted to match.
- `--gtk-version=4` — file dialogs render with GTK4/libadwaita.

**3. Do not leave another plugin theme selected.** Plugin themes load after this one and
will win.

## Settings

The theme is plain CSS; the plugin exists only to hold the handful of choices that differ
between machines. Settings → Plugins → Adwaita → the gear icon.

| Setting | Default | What it is for |
|---|---|---|
| Accent colour | `blue` | Which accent GNOME Settings is on. **CSS cannot read it** — Chromium's `AccentColor` resolves to its own generic blue, not GTK's — so it has to be told. The nine choices are libadwaita's own `@accent_bg_color` values. Set it to `follow Logseq` to hand control back to Logseq's own accent picker. |
| Custom accent (hex) | `#3584e4` | Used when the accent above is `custom`. Give the *fill* colour; the text accent is derived. |
| Accent lightness on dark | `0.763` | The oklab lightness floor for accent text on dark. GNOME's own is 0.85; 0.763 is a notch darker and more saturated. |
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
  | **Logseq OG** (Electron 43) | full live suite passes |
  | **Logseq 2.x** (2.0.1, DB build) | passes surfaces, light/dark, accent precedence and contrast; the two cases needing an open graph are skipped — seeding a file graph there is unsolved |
  | **Logseq 0.10.13** | stylesheet verified by CDP probe; not in the live suite, because its renderer aborts unprompted on the development machine |

  Logseq 2.x's `--ls-*` palette is a strict subset of OG's, so the theme's variable
  coverage applies there unchanged.
- Three rules target components 0.10.13 does not have (`.ui__dialog-content`,
  `.ui__popover-content`, `.cm-editor`); they simply do not match there, and
  `.ui__modal-panel` and `.CodeMirror` cover the same ground.
- The window frame's corner radius is Chromium's, not the theme's — it is painted outside
  the web contents and no stylesheet can reach it.

## Development

```
npm install
npm run build     # concatenates src/css/* into themes/adwaita.css, bundles the plugin
npm test          # static regression suite (this is what CI runs)
npm run test:live # drives real Logseq builds — local only, needs a binary
```

### Tests

Two tiers, because CI cannot run the app and text-matching a stylesheet cannot prove a
cascade rule *wins* — and six of the seven bugs this suite locks down were cascade bugs.

**Static (`npm test`, the CI gate).** Every `--ls-*` in Logseq's shipped solarized palette
is overridden or allowlisted with a reason; no undefined `--adw-*` reference; the
structure sheet stays scheme-agnostic and free of literal colours; every `[data-color]`
specificity tie is present; all nine accents clear WCAG AA on both surfaces in both
schemes; the settings logic behaves; and `themes/adwaita.css` matches a fresh build.

**Live (`npm run test:live`, local only).** Launches a scratch instance with an isolated
`HOME`, loads this repo as an unpacked plugin, selects the theme and asserts computed
styles: surfaces, light/dark inversion, accent precedence, the search dialog's edges, and
divider geometry.

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
node scripts/extract-logseq-vars.mjs og ~/.local/opt/logseq-og/resources/app/css/style.css
```

Then Logseq → Settings → Advanced → Developer mode, and **Load unpacked plugin** on the
repo directory. The two themes appear in Settings → Themes like any installed theme.

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
working both ways.

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

### Why some rules look over-specific

Logseq paints the same surface through four independent systems, and there are two
specificity traps worth knowing before editing:

1. `--ls-*` — the classic theme layer.
2. `--lx-gray-01..12` — the shui/radix ramp. Buttons, dropdowns, dialogs, cmdk and
   `.references-blocks-item` read *these*, not the `--ls-*` vars.
3. shadcn HSL triplets (`--primary`, `--popover`, `--ring`, …), consumed as
   `hsl(var(--primary))`. Untouched, every shui button stays a near-white pill.
4. Element-level overrides further down Logseq's own sheet.

And: `html[data-theme="dark"][data-color="<accent>"]` activates a full ~50-variable
palette at specificity (0,2,1) — the solarized-ish `logseq` one is the **default on a
fresh install** — which outranks a plain `html[data-theme="dark"]` block. Every token
block here therefore carries a second `[data-color]` selector to tie that specificity and
win on order. The same palette paints `.ui__modal-panel` and the cmdk hints footer from
`--lx-accent-01` at (0,3,1), which is why those two have their own rules.

## Licence

MIT.
