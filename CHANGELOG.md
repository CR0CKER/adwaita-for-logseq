# Changelog

All notable changes to this project are documented here, in
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format.

## [Unreleased]

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

[Unreleased]: https://github.com/CR0CKER/adwaita-for-logseq/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/CR0CKER/adwaita-for-logseq/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/CR0CKER/adwaita-for-logseq/releases/tag/v0.1.0
