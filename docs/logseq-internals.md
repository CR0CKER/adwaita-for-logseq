# What we learned: Logseq, Electron and GNOME internals

These are the facts this theme depends on. Each was found by measuring a running Logseq over
the DevTools protocol, or by reading GNOME's own UI definitions — not by reading docs or
guessing. Where a fact cost a bug to find, the bug is named, so the next change doesn't
repeat it.

Measured on Logseq OG (Electron 43) and Logseq 2.0.1 (DB build), 2026-09.

## Contents

- [Logseq: cascade traps](#logseq-cascade-traps)
- [Logseq: the headerbar](#logseq-the-headerbar)
- [Logseq OG vs 2.x](#logseq-og-vs-2x)
- [Electron: window-drag regions](#electron-window-drag-regions)
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
- **Window controls:** Logseq reserves header room for them only while the right sidebar is
  **closed**; open, they sit over the sidebar. Reserving room in both states left a ~100px
  gap.

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
- **HIG, Menus:** "The button for primary menus should use the `open-menu-symbolic` icon." ⋮ is for secondary, per-view menus.
- **HIG palette:** "intended for use in app icons and illustrations" — not for text.
- **Text colours:** GNOME's only role-based text palette is GtkSourceView's Adwaita scheme
  (`libgtksourceview-5.so`, `/org/gnome/gtksourceview/styles/Adwaita-dark.xml`), used by Text
  Editor and Builder.
  - Copied verbatim it fails AA on Logseq's surfaces; every hue goes through libadwaita's
    accent-text lightness clamp instead.
  - GNOME Console's ANSI colours are the HIG palette, with no light variant.
- **Icons:** Adwaita's symbolic icons live in `/usr/share/icons/Adwaita/symbolic/actions/`,
  licensed LGPL-3.0-only OR CC-BY-SA-3.0.

## Testing: what synthetic tests cannot see

- **`element.click()` skips hit-testing.** A button under another layer still "works".
  Click with real pointer events (CDP `Input.dispatchMouseEvent`) and check
  `elementFromPoint`.
- **CDP input skips Electron's drag regions.** Simulate the document-order rule above.
- **Radix menus open on `pointerdown`.** `element.click()` never opens them.
- **A locked screen stops rendering.** The compositor stops sending frames, so
  `requestAnimationFrame` never fires and Logseq stops re-rendering: mode switches time out
  and new pages never appear. Run the live suite with the screen unlocked; cases that need
  rendering check for painting frames first.
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
- **A passing test proves nothing until it has been seen failing.** Every case here was run
  against the pre-fix code first, and `scripts/redcheck.sh` keeps the static half honest.
