# Contributing

A GNOME/Adwaita theme plugin for Logseq. The README covers what it does, how it's built
and how to test it; `docs/logseq-internals.md` has the Logseq, Electron and GNOME facts it
depends on. These are the conventions for changing it.

## Rules

- **It must work on both Logseq OG and Logseq 2.x (the DB build).**
  - `npm run test:live` runs both by default. OG is expected at
    `~/.local/opt/logseq-og/Logseq-OG` and 2.x at `~/.local/opt/logseq-db-2.0.1/logseq`;
    override with `LOGSEQ_OG_BIN` / `LOGSEQ_DB_BIN`.
  - Their markup differs (see the table in `docs/logseq-internals.md`), so key selectors on
    shared or icon classes, not on OG's wrappers.
- **The maintainer runs the plugin unpacked from this working directory.** Switching branches
  here swaps the stylesheet under their running Logseq, while the ignored `dist/` build stays.
  - Do side work in a `git worktree`.
  - Keep this directory on the branch being tested, rebuilt (`npm run build`).
- **Colours live only in `src/css/10-tokens-dark.css` / `15-tokens-light.css`.**
  `themes/adwaita.css` is generated: edit `src/css/`, then `npm run build`; CI fails a stale
  build. `src/css/28-icons.css` is generated from `src/icons/` by
  `node scripts/encode-icons.mjs`.
- **Test first, and see it fail.**
  - A static test in `tests/static/`, a live case in `tests/live/cases.mjs` for anything the
    cascade decides, and a mutation in `scripts/redcheck.sh`.
  - Live cases click with real pointer events and check hit-testing and window-drag regions:
    `element.click()` and CDP input both skip checks a real mouse goes through.
- **Run the live suite with the screen unlocked.** A locked session stops Logseq rendering.
- **Docs ship in the same commit:** README (and its tables), CHANGELOG `[Unreleased]`, and
  `docs/logseq-internals.md` for anything newly learned about Logseq, Electron or GNOME.

## Gates

```
npm run build && npx tsc --noEmit && npm test && ./scripts/redcheck.sh
npm run test:live          # both builds; screen unlocked
```

## Git

- Work on a branch and open a PR. Squash-merge (`gh pr merge --squash --delete-branch`).
- Commits use the noreply identity (`6056387+CR0CKER@users.noreply.github.com`);
  `user.useConfigOnly` is set.
- Releases are tag-driven; see README → Releasing.
