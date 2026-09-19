# What we learned: Logseq, Electron and GNOME internals

These are the facts this theme depends on. Each was found by measuring a running Logseq over
the DevTools protocol, or by reading GNOME's own UI definitions — not by reading docs or
guessing. Where a fact cost a bug to find, the bug is named, so the next change doesn't
repeat it.

Measured on Logseq OG (Electron 43) and Logseq 2.0.1 (DB build), 2026-09.

## Contents

- [Logseq: cascade traps](#logseq-cascade-traps)
- [Logseq: chrome painted over content](#logseq-chrome-painted-over-content)
- [Logseq: the headerbar](#logseq-the-headerbar)
- [Logseq OG vs 2.x](#logseq-og-vs-2x)
- [Electron: window-drag regions](#electron-window-drag-regions)
- [Electron on GNOME: fonts and scale](#electron-on-gnome-fonts-and-scale)
- [GNOME: where the design comes from](#gnome-where-the-design-comes-from)
- [Testing: what synthetic tests cannot see](#testing-what-synthetic-tests-cannot-see)

## Logseq: cascade traps

- **Logseq reads `--lx-gray-*` before its own `--ls-*` variable.** Inline code is
  `var(--lx-gray-11, var(--ls-page-inline-code-color, …))` and titles are
  `var(--lx-gray-12, var(--ls-title-text-color, …))`. `--lx-gray-*` is always set, so
  the `--ls-*` variables are dead; the theme paints those elements directly.
- **Logseq ships `data-color="logseq"` already set.** An "unset" check that ignores that
  value leaves the accent setting inert.
- **OG renders code blocks with CodeMirror 5's `cm-s-solarized`**: `#002b36` on dark,
  `#fdf6e3` on light. It does *not* use `cm-s-lsradix`, even though both are in the
  stylesheet. The editor is created lazily. Anchor code rules on `.CodeMirror`.
- **Task markers** (`.block-marker`, OG only) are dimmed to `opacity: .7` by Logseq. At
  that opacity every accent fails WCAG AA. `.marker-switch:hover` is (0,2,0), so a
  (0,2,1) theme rule on `.block-marker` silently removes the hover cue.
- **The headerbar greys links in its right side** with
  `.cp__header > .r > div:not(.ui__dropdown-trigger) a` (0,3,2). That out-ranks a
  (0,3,1) header-button rule, so plugin toolbar icons came out grey.
- **The sidebar's keyboard-shortcut tiles** ("g j") are greyed by the `.text-gray-10`
  utility class.
- **An `--ls-*` variable can be read in a context where no app-surface colour is right.**
  Logseq paints the PDF toolbar with
  `.extensions__pdf-container .extensions__pdf-toolbar .buttons { background-color:
  var(--ls-primary-background-color) }` — the app's *view* colour, on a bar floating over a
  *document*. Measured over CDP (`data-color="logseq"` is always set, so the variable is
  always defined):

  | | `--ls-primary-background-color` | over a white PDF page |
  |---|---|---|
  | stock Logseq, light | `#fff` | white on white — reads as no bar at all |
  | stock Logseq, dark | `#002b36` | a dark teal slab |
  | this theme, dark | `#1d1d20` | a dark grey slab |

  So stock Logseq only *looks* unstyled in light mode; the rule always fired. A theme that
  maps the variable does not enable anything — it changes a value that was wrong for this
  surface in every scheme. **The lesson is about the surface, not the cascade:** a rule
  reading an app-surface variable on something overlaid on content needs replacing, not
  recolouring (OSD — `30-structure.css` §9).

  *(An earlier version of this note claimed the variable was undefined by default and that
  mapping it "woke a dormant rule". That was wrong: it was read from the stylesheet without
  checking the computed value. Verify a cascade claim against the running app.)*
- **`.extensions__pdf-container` carries its own `data-theme`** — `light`/`dark`/`warm`,
  the *page* theme, a different attribute from `html[data-theme]`'s app scheme. Logseq
  styles the toolbar per page theme (`[data-theme=warm] … .buttons` is (0,4,0)), so a theme
  rule that only ties the base declaration still loses under one page theme.
- **Window controls:** Logseq reserves header room for them only while the right sidebar is
  **closed**; open, they sit over the sidebar. Reserving room in both states left a ~100px
  gap.

## Logseq: chrome painted over content

The PDF toolbar bug generalises: Logseq paints some surfaces from an app-surface variable
even though they float over *content* whose colour the app does not choose. A theme that
remaps those variables inherits the mistake in a new colour.

**The sweep** (2026-09-15, both builds' shipped `style.css`): take every `--ls-*`/`--lx-*`
the theme assigns (90 of them), find the rules that consume them in a `background`,
`border-*-color`, `box-shadow` or `color`, and keep those whose selector names an overlay
surface. Worth re-running whenever a new variable is mapped; the script is a dozen lines of
`re.finditer` over the stylesheet.

| Surface | Verdict |
|---|---|
| PDF toolbar, popovers, highlight menu | **fixed** — OSD (`30-structure.css` §9) |
| Image action bar | **fixed** — OSD per button (§10) |
| Whiteboard / tldraw chrome (~50 rules in OG) | **cleared**: the canvas is itself app-themed, so this is app chrome on an app surface |
| Editor autocomplete popups (`#ui__ac-inner`, `.absolute-modal`) | **cleared**: they sit over the editor, which the app colours |
| Slides (`.reveal`) | **cleared**: same — the slide surface is themed |
| PDF dark-page backdrop and `.textLayer` | **cleared**: the viewer's own backdrop, not a control over the page. Note both are `filter: invert(100%)`, so what a reader sees is the *inverse* of the colour set — `#2e2e32` renders as `#d1d1cd` |

Recorded so a later sweep does not re-litigate the cleared ones.

## Logseq: the headerbar

- `#head` is `position: sticky`, so it's a containing block and a stacking context.
- `.l` and `.r` both carry an identity `transform`. That makes each **its own stacking
  context**, and `.r` (later in the document) paints over `.l`: a `z-index` on a child of
  `.l` can't lift it above `.r`. It also makes `.r` the containing block for its
  absolutely positioned children, not `#head`.
- `.l` is always `min-width: var(--ls-left-sidebar-width)` (246px by default; users can
  resize it), open or closed.
- Logseq docks the left sidebar only at `min-width: 640px`. Narrower, it becomes a wider
  overlay (415px at 560px) and any "docked" placement lands on top of it.
- `.ls-left-sidebar-open` sits on `<main>`: `main.theme-inner` in OG, a plain `main` in
  2.x.
- OG's ⋮ menu is a `.dropdown-wrapper` positioned inside its trigger, so it follows the
  trigger wherever CSS moves it.
- **The PDF viewer takes the sidebar away but keeps the open-state class.** Opening a PDF
  puts `is-pdf-active` on `<body>`, and Logseq's own rules then `display: none` both
  `#left-sidebar` and `#left-menu` (its toggle) and pad `#app-container` past a
  `position: fixed` overlay holding the left `--ph-view-container-width` (42vw), so the
  header shrinks to what is left. `.ls-left-sidebar-open` **stays set** through all of it
  — Logseq's `body.is-pdf-active #main-container.is-left-sidebar-open { padding-left:
  unset }` exists precisely because it survives. So "the sidebar is open" and "there is a
  sidebar" are different questions, and anything measured from
  `--ls-left-sidebar-width` must ask the second one: `body:not(.is-pdf-active)`. Both
  builds ship these rules byte-identically (OG's
  `resources/app/css/style.css`; 2.x's inside `app.asar`).

## Logseq OG vs 2.x

The theme must work on both. Their markup differs in ways that break OG-only selectors:

| | OG | 2.x |
|---|---|---|
| Sidebar toggle | `.l > div > #left-menu` | `.l > #left-menu` (no wrapper) |
| ⋮ menu | `.ui__dropdown-trigger > .toolbar-dots-btn` | bare `.toolbar-dots-btn` |
| Back/Forward, ⋮, right toggle | separate items in `.r` | one flex group at the start of `.r` |
| `.r` overflow | visible | `overflow-x-hidden` (clips anything placed outside it) |
| Header buttons | `.button`, 32px | `.ui__button.as-ghost`, **content-box**: the general `.ui__button` padding grows it to 52×42 |
| ⋮ popup | `.dropdown-wrapper` | Radix `[role=menu]` in a portal, opened only by real pointer events |
| Page title / journal date | `h1.title` | a block: `.ls-page-title .block-title-wrap` |
| Tasks | text markers (`TODO`) in `.block-marker` | a status property; no text marker. Theme colouring of 2.x task statuses is unverified |
| Sidebar-open class | `main.theme-inner` | `main` |
| Home button | `button.button.icon[title=Home]` inside a tooltip `div` with inline `display: inline`, first in `.r` | untitled `.ui__button.as-ghost` in `.r`'s control group |
| Graph picker | `nav.cp__menubar-repos > .ui__dropdown-trigger`, first row of `.wrap`; rendered only with a current graph | `.sidebar-header-container > .sidebar-graphs` (`.cp__graphs-selector`), first row of `.wrap` |
| Nav rows | `.nav-header a.item` (2px flex gap), 36px, 14px medium, 18px Tabler icons in a 20px box | `.sidebar-navigations a.item` (2px gap), 32px, 14px medium, **opacity .8**, 16px icons |
| Favorites / Recent rows | `.nav-content-item .bd ul a` (not `.item`): 28px, `padding: 4px 24px`, opacity .8, `span.page-icon.ml-3` (20px box, 12px lead) | `a.link-item`, 32px, opacity .8, `.page-icon` 20px box with a 4px-padded `.icon-cp-container` |
| "Create" (new page) | `footer.create` (`#create-button`), last in `.wrap` | none in the sidebar |
| Keyboard-shortcut keys | tiles that inherit the font | `kbd.shui-shortcut-key`, which names Inter itself |
| Image action bar | `.asset-action-btn` is `display: block`, so an icon sits on the text baseline; the whole image is dimmed behind it by `.asset-overlay` | `display: flex` already; **no overlay and no colour at all**, so icons land on the image at `opacity: .7` |

- **The Home button renders only away from the home route**, and not at all with a custom
  `:default-home` page; the same condition in both builds. Its `.ls-icon-home` is the one
  hook both share.
- **The left sidebar is one flex column** (`.left-sidebar-inner > .wrap`): the element
  holding the graph picker, then a contents container that is `height: 100%` and
  shrinkable (`.nav-contents-container` / `.sidebar-contents-container`). Dissolving the
  holder with `display: contents` makes the picker a flex item of `.wrap` that `order` can
  move, and the list shrinks to make room. The holder's inline padding (OG `px-4`, 2.x
  `.75rem`) goes with it and has to be put back on the children.
- **`.wrap` overshoots the window** by a fraction of a pixel (700.2px in a 700px window).
- OG's own Create menu opens upward (`bottom: calc(100% + 6px); top: auto`); its graph
  menu hangs below its trigger, so it needs the same once the trigger sits at the bottom.

Shared class names (`.navigation`, `.toolbar-dots-btn`, `.toggle-right-sidebar`) and the
icon classes (`.ls-icon-arrow-left`, `.ls-icon-dots`, …) are the same in both builds.
Key selectors on those, not on OG's wrappers.

## Electron: window-drag regions

**Electron resolves `-webkit-app-region` in document order: a later `drag` region
overrides an earlier `no-drag` element, whatever is painted on top.** It happens before a
click reaches the page, so `elementFromPoint` still reports the button as reachable.

- **The bug:** the moved sidebar toggle lives in `.l` (early in the document) but sat over
  `.r`'s left padding (later, `drag`). A real mouse press dragged the window. Synthetic
  clicks worked fine.
- **The fix:** make room with `margin-left` on `.r`, so its box doesn't extend under the
  toggle.
- **The rule for any moved control:** no `drag` element that comes *after* it in the
  document may cover it. The live suite now checks exactly that.

## Electron on GNOME: fonts and scale

Measured 2026-09-11 on Fedora 43 / GNOME 49 at 5/3 fractional scaling, on both builds, by
reading the face Chromium actually rendered (see [Testing](#testing-what-synthetic-tests-cannot-see)).

- **Name the font; don't count on a generic to reach it.** fontconfig maps the generic
  `sans-serif` and `system-ui` to **Noto Sans** here, not to GNOME's interface font
  (`fc-match sans-serif`, `fc-match system-ui`). The stack starts with `"Adwaita Sans"`,
  which is installed system-wide (`/usr/share/fonts/adwaita-sans-fonts/`), so text that
  inherits it renders as `AdwaitaSans`. Cantarell, `system-ui` and `sans-serif` only matter
  on a system without Adwaita Sans.
- **Logseq 2.x names Inter on some elements itself, and ships it as a web font**, so it
  renders even though Inter isn't installed. A font set on the element beats the one it
  would inherit, whatever the container rule's specificity. 2.0.1's rules:
  `.shui-shortcut-compact, .shui-shortcut-key, kbd.shui-shortcut-key` (shortcut keys: the
  sidebar's "G J", the search dialog, menus, the keymap page) and
  `.cp__query-builder .clause-bracket`. The theme names them. Its `html { "Inter var" }`
  is harmless: 2.x's own `html:not(.is-native-android)` puts `var(--ls-font-family)` first
  with `!important`, and the theme sets that variable. OG names no interface font of its
  own. Listed by walking `document.styleSheets` for every `font-family`.
- **One CSS px is one GTK px, if Electron runs native Wayland.** With
  `--ozone-platform=wayland`, `devicePixelRatio` is GNOME's scale (1.667 at 5/3) and
  `screen` is GNOME's logical size (1536×960), so `11pt` (14.67px) renders exactly as GTK's
  `Adwaita Sans 11`. XWayland wasn't measured.
- **Sizes that already match GNOME without the theme touching them:** Logseq's body is
  16px and its block text is `--ls-page-text-size: 1em` of it, which is 16px, GNOME's
  document font (`document-font-name`, `Adwaita Sans 12`).
- **Sizes the theme sets to the interface font (11pt):** the sidebar nav rows, and the
  sidebar header's "Logseq" title (bold, as libadwaita's `headerbar .title`). The title was
  14px until 2026-09-11. It was set when the rows were still Logseq's 14px, and the rows
  then moved to 11pt without it. The static and live tests now assert the two are equal.
- **Sizes that stay Logseq's, deliberately:** Favorites / Recent labels (11px, semibold),
  keyboard-shortcut tiles (12px) and headings in notes.
- **Not followed:** GNOME's font-size and text-scaling settings. The theme's 11pt and
  Logseq's 16px assume the defaults (`Adwaita Sans 11` / `12`, `text-scaling-factor` 1.0).
  Logseq's own zoom (Ctrl+= / Ctrl+0) scales everything on top.

## GNOME: where the design comes from

Read from the installed apps' own UI definitions (`gresource extract <binary> <path>`):

- **Files** (`nautilus-window.ui`, `nautilus-toolbar.ui`, `nautilus-history-controls.ui`):
  - `AdwOverlaySplitView`, `max-sidebar-width` 240.
  - Sidebar header: `edit-find-symbolic` search · `AdwWindowTitle` "Files" · `open-menu-symbolic` main menu.
  - Content header: `sidebar-show-symbolic` toggle (shown only when collapsed), then `go-previous/next-symbolic`.
  - Nautilus's `style.css` has `image.sidebarrow-icon { opacity: 0.7; }` and
    `.sidebarrow-icon:dir(ltr) { padding-right: 8px; }`; `nautilus-sidebar-row.ui` is a
    `GtkListBoxRow` holding a 16px `GtkImage` and a `GtkLabel` (Nautilus 49).
  - Rows come from libadwaita (`gresource extract libadwaita-1.so.0
    /org/gnome/Adwaita/styles/default.css`, 1.8): `.navigation-sidebar > row
    { border-radius: 9px; min-height: 36px; padding: 0 8px; margin: 0 6px 2px; }`,
    `.navigation-sidebar { padding: 6px 0; }`, `> separator { margin: 6px; }`. A
    selected row changes only its background, not its weight.
  - Labels use the interface font, `org.gnome.desktop.interface font-name`, by default
    `Adwaita Sans 11`. 11pt in CSS is the same 14.67px GTK renders.
  - The title is bold at that same size: libadwaita's `headerbar .title, windowtitle
    .title { font-weight: bold; }` sets no `font-size`, so it inherits the interface font.
- **Where the main menu lives** depends on whether the sidebar can be hidden:
  - Files, Contacts and Settings (no hiding on wide windows) keep it in the sidebar header.
  - Calendar, whose sidebar the user can toggle, fixes it at the content header's end, and
    its sidebar header is empty. Text Editor (also toggleable) likewise keeps the menu out of
    its sidebar.
  - This theme follows Files, by the user's choice: the menu is hidden with the sidebar.
    Its page items stay reachable on a right-click on the page title, which opens the same
    page menu in both builds (OG: `page-title-custom-context-menu-content`; 2.x checked live).
- **Search goes with the sidebar too.** Files' sidebar header button is "Search Everywhere"
  (`nautilus-window.ui`); the content header's is "Search Current Folder"
  (`nautilus-toolbar.ui`, `nautilus-folder-search-symbolic`), a scoped search Logseq has no
  counterpart for. So the theme hides `#search-button` whenever the sidebar is not on screen.
  OG renders the button only with a current graph (`header.cljs`, `(when current-repo …)`),
  inside a `ui/with-shortcut` tooltip `div`; 2.x has it bare in `.l`.
- **HIG, Menus:** "The button for primary menus should use the `open-menu-symbolic` icon." ⋮ is for secondary, per-view menus.
- **HIG palette:** "intended for use in app icons and illustrations" — not for text.
- **Text colours:** GNOME's only role-based text palette is GtkSourceView's Adwaita scheme
  (`libgtksourceview-5.so`, `/org/gnome/gtksourceview/styles/Adwaita-dark.xml`), used by Text
  Editor and Builder.
  - Copied verbatim it fails AA on Logseq's surfaces; every hue goes through libadwaita's
    accent-text lightness clamp instead.
  - GNOME Console's ANSI colours are the HIG palette, with no light variant.
- **OSD — controls overlaid on *content*.** GTK's style for anything floating over a
  document rather than sitting on a window surface (libadwaita 1.8, `default.css`):
  `.osd { color: RGB(255 255 255/90%); background-color: RGB(0 0 0/70%); border: none;
  background-clip: padding-box }`, `.toolbar.osd { padding: 12px; border-radius: 15px }`,
  `button.osd { min-width: 32px; min-height: 32px }`, and inside it GTK's flat-button
  states: `button.flat` transparent, hover/active/checked
  `color-mix(in srgb, currentColor 7%/16%/10%, transparent)`. A popover in an OSD context
  is itself OSD: `.osd popover > contents { border-color: RGB(255 255 255/10%);
  box-shadow: none }`.
  - **It is dark in both colour schemes, deliberately** — the app does not control the
    colour of the content underneath. That is why the theme's own light/dark split does not
    apply to it, and why `--adw-osd-*` holds the same values in both palettes.
  - A floating toolbar is **centred** over the content: Text Editor's is a box with
    `<property name="halign">center</property>` (`gresource extract
    /usr/bin/gnome-text-editor /org/gnome/TextEditor/ui/editor-page.ui`). Logseq
    right-aligns its PDF bar twice — on `.extensions__pdf-header` and again on `.inner` —
    and insets the header 10px from the right, so both have to be undone to centre it.
  - Papers and Image Viewer use it for exactly this: floating page controls over a
    document.
- **The image action bar is the same problem, and the builds handle it differently.** The
  hover controls over an embedded image float over content the app does not colour, like
  the PDF toolbar. OG dims the whole image to make them readable —
  `.asset-overlay`, a gradient of `--ls-primary-background-color` at opacity `.9` — and
  paints the bar in `--ls-primary-text-color`; measured over black, white and mid-grey
  images that is 10.8:1 at worst, so it works, but dimming the content is not how GNOME
  does it. **Logseq 2.x ships no overlay and sets no colour at all**, so the icons inherit
  the body text colour onto the image at `opacity: .7` — white on a white photo in dark
  mode. One OSD treatment per *button* (GTK's own pattern for overlay controls, as in
  Loupe) fixes 2.x and makes the two builds agree.
- **Copy and Maximize on the image action bar do nothing, and that is Logseq's.** Measured
  in OG with a real pointer press: at each button's centre `elementFromPoint` returns a
  block container `div`, not the button, so the click never reaches the handler. Identical
  with this theme's stylesheet enabled and disabled, and reproduced by the maintainer
  against the default theme, so it is not a theming problem — do not "fix" it with a
  `z-index` on someone else's layout bug. Not filed upstream yet.
- **The external PDF window gets no theme, and cannot be given one from CSS.** "Open in
  external window" is not a route: it is a bare `window.open("about:blank")` document the
  app builds by hand (`frontend/extensions/pdf/windows.cljs`, `setup-win!`).
  `resolve-styles!` links **only** `./css/style.css` into it, so registered themes — which
  are injected into the *main* document — never reach it. It *does* set `data-theme` on
  that document and put `is-system-window` on its `<html>`, so a theme's own selectors
  would match as soon as the sheet were there.

  Logseq keeps the window handle in a ClojureScript atom and exposes no hook. A plugin
  *can* reach it by patching `open` on the host window (its iframe is same-origin with
  `lsp://logseq.com` and unsandboxed, verified over CDP), appending the sheet **after**
  Logseq's synchronous setup so it does not lose every specificity tie — but that is host
  monkey-patching from a theme, and the SDK warns that unofficial host access is not
  supported on the Marketplace. **This theme does not do it**; the external window stays
  stock, and the fix belongs upstream in `resolve-styles!` —
  [logseq/og#54](https://github.com/logseq/og/issues/54). Logseq's PDF viewer is the same situation, with three page themes (light,
    dark, warm) that one OSD treatment has to stay legible over — measured in
    `tests/static/contrast.test.mjs` rather than assumed.
- **Icons:** Adwaita's symbolic icons live in `/usr/share/icons/Adwaita/symbolic/actions/`,
  licensed LGPL-3.0-only OR CC-BY-SA-3.0.

## Testing: what synthetic tests cannot see

- **A state the harness cannot hold is not a pass or a fail.** Logseq's asset-ref handler
  opens the PDF viewer for a seeded block only sometimes: the click lands and throws
  nothing (measured with a real CDP press and `.click()` alike; `pdf/current` stays null),
  and when it does open, it can give up again before the assertions run. Measuring after
  that reads an ordinary sidebar-open header — a stale state that looks exactly like a
  regression. Each PDF case therefore **re-checks `is-pdf-active` immediately before
  measuring** and reports itself skipped otherwise. Safe here because whether the viewer
  opens is decided inside Logseq before any theme rule applies; the image-asset case needs
  no click and does run.
- **`element.click()` skips hit-testing.** A button under another layer still "works".
  Click with real pointer events (CDP `Input.dispatchMouseEvent`) and check
  `elementFromPoint`.
- **CDP input skips Electron's drag regions.** Simulate the document-order rule above.
- **Radix menus open on `pointerdown`.** `element.click()` never opens them.
- **A locked screen stops rendering.** The compositor stops sending frames, so
  `requestAnimationFrame` never fires and Logseq stops re-rendering: mode switches time out
  and new pages never appear. Run the live suite with the screen unlocked; cases that need
  rendering check for painting frames first. Reading styles and fonts still works while
  locked, so a font failure in a locked run is real; layout and interaction failures may not be.
  Check with `loginctl show-session "$(loginctl list-sessions --no-legend | awk '/seat0/{print $1; exit}')" -p LockedHint`.
- **Appended blocks may not render.** Blocks appended in quick succession through the plugin
  API often stay unrendered until the page renders again. Navigate away and back
  (`renderPage()` in `tests/live/cases.mjs`).
- **The harness can't open a seeded graph** on either build; it stays on the demo graph
  ([#2](https://github.com/CR0CKER/adwaita-for-logseq/issues/2)). On OG no graph is
  current (the header offers "Add a graph"), so the graph dropdown never renders there;
  2.x opens its demo DB graph, which has a picker. `logseq.api.push_state('all-pages')`
  navigates on both builds.
- **Plugin settings can be flipped from the host**:
  `LSPluginCore.registeredPlugins.get(id).settings.set(key, value)` fires the plugin's
  `onSettingsChanged`, the same path as the settings panel.
- **A scratch profile isn't the user's app.** The real one has other styling plugins
  (Awesome UI overrode the sidebar and buttons), a graph `custom.css`, a resized sidebar
  and a persistent Chromium cache. When a fix "doesn't work" for the user:
  - reproduce on a *copy* of their profile;
  - or inspect their running app read-only with `--remote-debugging-port`;
  - measure first, and don't revert blindly.
- **A computed `font-family` is only the declared list.** It says nothing about which face
  rendered. CDP's `CSS.getPlatformFontsForNode` returns the face actually used
  (`familyName`, `postScriptName`, glyph count). It reports a node's *own* text only, so
  walk down to a text-bearing descendant. A pseudo-element like the sidebar title isn't a
  node: read `getComputedStyle(el, '::after')`.
- **Walking `document.styleSheets`, skip rules without a `selectorText`.** `@font-face`
  (and other at-rules without nested rules) have none, so `r.selectorText.slice(...)` throws
  and, inside a per-sheet `try`, silently abandons the rest of that stylesheet. The first
  listing of 2.x's font rules missed the query-builder rule this way.
- **A `DevToolsActivePort` file in a profile doesn't mean the port is open.** Chromium leaves
  it behind from an earlier `--remote-debugging-port` session. Check with
  `curl -fsS http://127.0.0.1:<port>/json/version` before assuming the running app can be
  inspected.
- **A passing test proves nothing until it has been seen failing.** Every case here was run
  against the pre-fix code first, and `scripts/redcheck.sh` keeps the static half honest.
