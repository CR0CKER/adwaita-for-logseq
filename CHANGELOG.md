# Changelog

All notable changes to this project are documented here, in
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format.

## [Unreleased]

## [0.2.0] - 2026-09-11

### Fixed

- The plugin list and settings panel show **Gnome Adwaita Theme** again, not
  the id `gnome-adwaita-theme`: the rename had set `logseq.title` to the id.
  The id itself is unchanged, so stored settings carry over.
- Headerbar plugin icons (PDF print, journals calendar, the plugins button) and
  the sidebar's keyboard-shortcut tiles were grey (`--lx-gray-11` / `-10`), unlike
  GNOME Files. Logseq greys them at a specificity the theme's header-button
  rule lost to; they are now the full foreground.
- With the right sidebar open, the header's buttons stopped ~100px short of the
  main section's edge: the theme reserved room for the window controls there
  too, though they sit over the sidebar then. The reservation now applies only
  while the right sidebar is closed, as in Logseq's own rule.

### Changed

- Sidebar nav rows (Journals, Pages, …) have GNOME Files' metrics, from
  libadwaita's own `.navigation-sidebar > row` and Nautilus's row icon: 36px
  tall on a 38px pitch, labels in the interface font size (11pt, 14.67px) at
  regular weight, selected or not, and never dimmed (2.x drew them at 0.8
  opacity and 32px). Every row icon, Favorites and Recent included, is 16px
  with 8px before the label, in one column. Favorites and Recent keep Logseq's
  smaller type.
- Sidebar row icons (Journals, Flashcards, Graph view, All pages, the
  Favorites/Recent headers and page icons) are drawn at 70% opacity, a step
  softer than their labels — the value GNOME Files uses
  (`image.sidebarrow-icon { opacity: 0.7; }` in Nautilus's own stylesheet).
  Emoji page icons stay at full strength.
- The headerbar follows GNOME Files' layout (from `nautilus-window.ui` and
  `nautilus-toolbar.ui`): the sidebar header holds Search, a **Logseq** title and
  the main menu; the content header starts with the sidebar toggle and
  Back/Forward. Logseq's ⋮ menu is now a hamburger — it holds app-wide items,
  which the HIG puts in a primary menu with `open-menu-symbolic`. Like Files,
  the menu belongs to the sidebar and is hidden with it. With the sidebar
  closed, or below 640px, the header collapses as Files does when narrow.
- Header buttons use Adwaita's own icons — `open-menu`, `edit-find`,
  `sidebar-show`, `sidebar-show-right`, `go-previous`, `go-next` — instead of
  Logseq's Tabler ones.
- The layout, the icons, the 32px header buttons and the title colour work on
  Logseq 2.x as well as OG. 2.x renders the header differently — shui ghost
  buttons (content-box, which padded them out to 52x42), Back/Forward/⋮ in one
  group, no wrapper around the sidebar toggle or ⋮, an `overflow-x: hidden`
  bar — and page titles as blocks (`.ls-page-title .block-title-wrap`).

### Removed

- The divider at the very top of the left sidebar, above the graph dropdown.
  Files has no divider under its header, only between groups.

### Added

- Setting **Hide the Home button** (off by default): hides the Home button
  Logseq puts in the headerbar away from the home page. Keyed on its icon, so it
  covers 2.x's untitled ghost button as well as OG's.
- Setting **Graph picker at the bottom of the sidebar** (off by default): moves
  the graph dropdown to the sidebar's bottom edge, behind a Files-style divider,
  with its menu opening upward. On OG it replaces the Create button. It reorders
  the sidebar's own flex column rather than fixing the picker in place, so the
  list still scrolls above it and it follows a resized sidebar.
- `docs/logseq-internals.md`: the Logseq, Electron and GNOME facts the theme depends on,
  each found by measurement, with the bug it cost; and `CONTRIBUTING.md`, the working
  conventions for the repo.
- The live suite runs Logseq OG **and** 2.x by default (2.x looked for at
  `~/.local/opt/logseq-db-2.0.1/logseq`), so a change cannot pass on one build
  only. The headerbar case clicks with real pointer events and checks hit-testing.
- `src/icons/`: the Adwaita symbolic icons above, vendored unmodified
  (LGPL-3.0-only OR CC-BY-SA-3.0), and `scripts/encode-icons.mjs`, which inlines
  them as `src/css/28-icons.css`. README: a "Headerbar and sidebar, as in GNOME
  Files" section and "Third-party assets".
- Text colours from GNOME Text Editor's Adwaita style scheme (GtkSourceView's
  `Adwaita` / `Adwaita-dark`), each hue clamped to WCAG AA the way libadwaita
  clamps accent text:
  - code blocks use the scheme's token colours (keywords orange and bold,
    strings and types teal, functions blue, numbers violet, comments grey) on an
    Adwaita surface, replacing Logseq's solarized code theme — `#002b36` teal on
    dark, `#fdf6e3` cream on light;
  - `==highlights==` use the scheme's search-match yellow;
  - page titles and journal dates use the scheme's body-text grey (`#c0bfbc` on
    dark, `#3d3846` on light) instead of white, under either setting.
- A **Text colours** setting. `GNOME apps (quiet)`, the default, keeps headings,
  inline code and quote bars as they were. `Text Editor (Adwaita scheme)` colours
  them teal, violet and grey, as Text Editor does.
- README: the marketplace submission (logseq/marketplace#898), a Releasing
  section, and the live suite's known gap — `openGraph()` stays on the demo
  graph (#2).
- README: a Troubleshooting section (re-selecting the theme after an update,
  Awesome UI overriding the sidebar and buttons, a leftover graph `custom.css`,
  what "Text Editor" colours do and do not change), and how to reload an
  unpacked build during development.

## [0.1.1] - 2026-09-10

### Changed

- Task markers (TODO, DOING, LATER, NOW, WAITING…) are painted in the standalone
  accent, like links and tags, instead of a fixed orange, so they follow both the
  plugin's accent setting and Logseq's own accent picker. Hovering a switchable
  marker brightens it to the accent hover step, restoring Logseq's hover cue that
  the old rule hid.

### Fixed

- Task markers failed WCAG AA: Logseq dims them to 70% opacity, which took the
  old orange (down to 2.16:1 on the light sidebar) — and would take every
  offered accent — below 4.5:1 at their 85% size. They now render at full opacity (lowest ratio 4.74:1, light sidebar).

### Removed

- The `--adw-orange` token, which only the task markers read.

## [0.1.0] - 2026-09-10

### Added

- Adwaita Dark and Adwaita Light themes, with both palettes extracted from
  libadwaita rather than sampled from screenshots.
- A settings plugin holding the machine-specific choices: accent colour (the
  nine libadwaita accents, a custom hex, or "follow Logseq"), accent lightness
  on dark, window-control layout, right-sidebar topbar visibility, and the
  interface/monospace font stacks.
- Sidebar section dividers modelled on GNOME Files — a 1px inset rule with 6px
  of air, matched to a sampled Files screenshot rather than to taste.
- Static regression suite (`npm test`) covering solarized-variable coverage,
  stylesheet invariants, WCAG AA contrast for every offered accent, the settings
  logic, and build freshness.
- Live regression suite (`npm run test:live`) that drives real Logseq builds and
  asserts computed styles — the only tier that can prove a cascade rule wins.
- `scripts/redcheck.sh`, which reconstructs each historical bug and requires the
  matching test to fail, so no assertion is vacuous.
- CI running the type check, build, working-tree-clean check, static suite and
  red-check.

### Fixed

- **Theme silently did nothing on Electron 43.** Declaring themes in
  `package.json` made the host resolve the stylesheet to an `assets://` URL,
  which Logseq OG rewrites to `file://` and then blocks as a local resource.
  Themes are now registered at runtime through `resolveResourceFullUrl()`.
- **Solarized colours leaking through the theme.** Logseq ships with
  `data-color="logseq"` set, so eight `--ls-*` variables kept their teal values
  — `--ls-guideline-color` most visibly, which painted teal dividers in the left
  sidebar wherever a plugin drew separators from it.
- **A coloured hairline along the search dialog's top edge.** The cmdk field is
  flush with the panel, so its focus ring drew over the rounded corner.
- **The accent setting had no effect**, because it only applied when Logseq had
  no accent — but Logseq's shipped default *is* an accent.
- **Logseq's own accent picker went inert** after the above was fixed too
  broadly. An explicit choice now overrides only the intentless `data-color`
  values (unset, empty, `none`, `logseq`); a deliberately chosen accent wins.
- The plugin identifies itself as `gnome-adwaita-theme` in Logseq's plugin list,
  settings panel and menus.
- **Five of the seven settings were silently ignored once the theme was
  selected** — accent colour, both fonts, the close-only width and accent
  lightness. The settings stylesheet relied on loading after the theme sheet,
  but Logseq appends the theme's `<link>` whenever a theme is selected, and both
  declared the same custom properties on the root at equal specificity, so the
  theme's defaults won. Measured: the accent computed to the stored `#c88800`
  until the theme was selected, then to `#3584e4`. Those overrides are now
  `!important`, and a test requires it.
- **Dark blocks behind the sidebar's section headers on Logseq 2.x.** 2.x
  redeclares `--left-sidebar-bg-color` on `main.theme-container-inner`, between
  `<html>` and the sidebar, as the darker window surface. That shadowed the
  theme's mapping, and the headers ("Navigations", "Favorites", "Recent") paint
  from the variable. It is now re-pinned on the same element.
- **Teal hover on header buttons in Logseq 2.x** — and, from the same cause, a
  teal tooltip border, whiteboard-button hover, installed-themes list hover and
  form-input border. Every rule in Logseq that reads the two subtlest accent
  steps (`--lx-accent-01`/`-02`) is scoped to the solarized palette and paints
  chrome with them. Both are now neutral Adwaita tokens, so ghost buttons hover
  to the Adwaita grey; steps 03+ keep the accent, where it carries meaning. The
  fixture records which steps each Logseq build spends on chrome, so a new one
  fails the coverage test.

### Known limitations

- The live suite is local-only: it needs a Logseq binary, so CI runs the static
  tier alone. CI proves the gates pass, not that a cascade rule wins.
- On Logseq 2.x the suite skips the cases that need an open graph — seeding a
  file graph there is unsolved (see `tests/lib/targets.mjs`).
- The live suite's light-mode case fails intermittently on Logseq OG with "the
  app never switched to light within 20s": `set_theme_mode` is occasionally
  ignored for a whole session, even when re-issued. Cause not established. It
  is not a theme defect — the stylesheet's light palette is verified by the
  static contrast tests and by the passing runs — but it is an open harness
  issue, left failing rather than quarantined.
- Logseq 2.0.1 draws square window corners: it ships Electron 42.3.0, and
  rounded corners for frameless windows on Linux arrived in Electron 43.0.0.
  Nothing in the theme or its launch flags can change that.
- The sidebar divider inset is a fixed token (14px). It lines up with the row
  highlights when `logseq-awesome-ui` restyles the sidebar; on stock Logseq the
  rows sit at 22px, so the divider is 8px narrower than the highlight.

[Unreleased]: https://github.com/CR0CKER/adwaita-for-logseq/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/CR0CKER/adwaita-for-logseq/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/CR0CKER/adwaita-for-logseq/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/CR0CKER/adwaita-for-logseq/releases/tag/v0.1.0
