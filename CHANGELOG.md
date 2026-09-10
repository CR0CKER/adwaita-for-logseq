# Changelog

All notable changes to this project are documented here, in
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format.

## [Unreleased]

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
- The plugin listed itself as `logseq-adwaita-theme`; it now shows as
  "Adwaita Theme".

### Known limitations

- The live suite is local-only: it needs a Logseq binary, so CI runs the static
  tier alone. CI proves the gates pass, not that a cascade rule wins.
- On Logseq 2.x the suite skips the cases that need an open graph — seeding a
  file graph there is unsolved (see `tests/lib/targets.mjs`).
- The sidebar divider inset is a fixed token (14px). It lines up with the row
  highlights when `logseq-awesome-ui` restyles the sidebar; on stock Logseq the
  rows sit at 22px, so the divider is 8px narrower than the highlight.
