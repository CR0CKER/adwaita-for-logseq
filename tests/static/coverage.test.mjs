/**
 * Logseq ships with `data-color="logseq"` already set — the turquoise "Logseq
 * classical color" — so a fresh install renders through a full solarized
 * palette of ~60 `--ls-*` variables. Any one the theme fails to override keeps
 * its teal value and leaks into an otherwise-Adwaita UI.
 *
 * That is not hypothetical: `--ls-guideline-color` stayed `#0b4a5a` and painted
 * teal dividers in the left sidebar, visible only when logseq-awesome-ui drew
 * separators from it. Diffing the palette against the theme found seven more.
 *
 * This test is the standing version of that diff.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { readThemeCss, declaredVars, REPO_ROOT } from '../lib/css.mjs';

/**
 * Variables the theme deliberately does not declare, each with the reason it is
 * safe. Two kinds qualify:
 *
 *   - it resolves through another variable the theme *does* control, so it
 *     follows automatically;
 *   - its value is not solarized-specific — a generic Logseq colour that is the
 *     same under every accent palette.
 *
 * Anything else must be overridden. Adding an entry here is a deliberate,
 * reviewable decision, which is the point.
 */
const ALLOWLIST = {
  '--ls-icon-color': 'resolves to var(--ls-link-text-color), which the theme drives',
  '--ls-page-blockquote-border-color': 'resolves to var(--ls-border-color)',
  '--ls-page-checkbox-border-color': 'resolves to var(--ls-primary-background-color)',
  '--ls-search-icon-color': 'resolves to var(--ls-primary-text-color)',
  '--ls-search-icon-hover-color': 'resolves to var(--ls-secondary-text-color)',
  '--ls-slide-background-color': 'resolves to var(--ls-primary-background-color)',
  '--ls-button-background-hsl': 'the theme overrides the composed --ls-button-background instead',
  '--ls-error-background-color': 'generic Tailwind --color-red-900, not solarized-specific',
  '--ls-success-background-color': 'generic Tailwind --color-green-900, not solarized-specific',
  '--ls-warning-background-color': 'generic Tailwind --color-yellow-900, not solarized-specific',
  '--ls-page-mark-bg-color': 'highlight-mark yellow, identical under every Logseq accent',
  '--ls-page-mark-color': 'highlight-mark text, identical under every Logseq accent',
};

// One fixture per Logseq build under test, so a version that adds a variable
// fails here rather than shipping a leak. Regenerate with
// scripts/extract-logseq-vars.mjs when testing against a new build.
const FIXTURE_DIR = join(REPO_ROOT, 'tests/fixtures');
const fixtures = readdirSync(FIXTURE_DIR)
  .filter((f) => /^logseq-vars\..+\.json$/.test(f))
  .map((f) => JSON.parse(readFileSync(join(FIXTURE_DIR, f), 'utf8')));

assert.ok(fixtures.length > 0, 'no logseq-vars fixtures found');

const themeVars = declaredVars(readThemeCss());

for (const fixture of fixtures) {
  for (const mode of Object.keys(fixture.vars)) {
    test(`${fixture.target}: every --ls-* in the ${mode} solarized palette is overridden or allowlisted`, () => {
      const uncovered = Object.keys(fixture.vars[mode])
        .filter((v) => !themeVars.has(v) && !(v in ALLOWLIST));

      assert.deepEqual(
        uncovered,
        [],
        `these variables keep Logseq's solarized value and will leak:\n` +
          uncovered.map((v) => `  ${v}: ${fixture.vars[mode][v]}`).join('\n')
      );
    });
  }
}

test('the allowlist has no stale entries', () => {
  const known = new Set(
    fixtures.flatMap((f) => Object.values(f.vars).flatMap((v) => Object.keys(v)))
  );
  const stale = Object.keys(ALLOWLIST).filter((v) => !known.has(v));
  assert.deepEqual(stale, [], 'allowlisted variables no Logseq build declares — drop them');
});

test('the guideline colour specifically is mapped to an Adwaita token', () => {
  // Named on its own because this is the one that shipped a visible bug.
  const css = readThemeCss();
  assert.match(
    css,
    /--ls-guideline-color:\s*var\(--adw-[a-z-]+\)/,
    '--ls-guideline-color must resolve to an Adwaita token, not Logseq’s #0b4a5a'
  );
});
