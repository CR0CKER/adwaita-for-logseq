/**
 * The plugin manifest: what Logseq keys the plugin by, and what it shows.
 *
 * Two different jobs that are easy to conflate. `logseq.id` is a key — stored
 * settings (`settings/<id>.json`), the settings sheet's injected-style name and
 * the marketplace package all hang off it, so it must never change. The display
 * name is `logseq.title`, shown verbatim in the plugin list, the settings panel
 * and menus; without one Logseq falls back to the package name. The title was
 * set to the id once, and the settings panel read "gnome-adwaita-theme".
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../lib/css.mjs';

const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'));

test('the plugin id is unchanged — stored settings and the marketplace entry are keyed on it', () => {
  assert.equal(pkg.logseq.id, 'gnome-adwaita-theme');
});

test('the plugin shows a human-readable title, not its id', () => {
  const { title, id } = pkg.logseq;
  assert.ok(title, 'without logseq.title Logseq shows the package name');
  assert.notEqual(title, id);
  assert.notEqual(title, pkg.name);
  assert.doesNotMatch(title, /^[a-z0-9-]+$/, `"${title}" is a slug, not a name`);
});
