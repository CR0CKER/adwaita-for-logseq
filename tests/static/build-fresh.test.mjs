/**
 * `themes/adwaita.css` is generated but committed — it is what the plugin
 * actually serves, so it has to be in the repo. That makes it possible to edit
 * `src/css/*` and ship a stale build: everything looks right in the source and
 * nothing changes in the app.
 *
 * Rebuild in memory (via build.mjs's own exported function, so this can't drift
 * from the real build) and compare.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildCss } from '../../build.mjs';
import { REPO_ROOT } from '../lib/css.mjs';

test('themes/adwaita.css matches a fresh build of src/css/*', () => {
  const { css } = buildCss();
  const committed = readFileSync(join(REPO_ROOT, 'themes/adwaita.css'), 'utf8');
  assert.equal(
    committed,
    css,
    'the committed stylesheet is stale — run `npm run build` and commit the result'
  );
});

test('the build includes every source part', () => {
  const { parts } = buildCss();
  assert.deepEqual(parts, [
    '10-tokens-dark.css',
    '15-tokens-light.css',
    '20-mappings.css',
    '25-accent.css',
    '27-text.css',
    '30-structure.css',
  ], 'a part was added or renamed — check the cascade order still reads correctly');
});
