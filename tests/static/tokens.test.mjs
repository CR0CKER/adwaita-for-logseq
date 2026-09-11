/**
 * Architectural invariants of the stylesheet.
 *
 * These are the properties that make the theme work at all, and every one of
 * them was learned by having it not work:
 *
 *   - one sheet serves light and dark, so structure rules must not be scoped to
 *     a single scheme;
 *   - colour is written down only in the two palette files;
 *   - every token block carries a `[data-color]` selector, because Logseq's own
 *     accent palettes sit at specificity (0,2,1) and would otherwise outrank a
 *     plain `html[data-theme]` block.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readThemeCss, declaredVars, referencedVars, rules, stripComments, REPO_ROOT } from '../lib/css.mjs';

const css = readThemeCss();
const src = (f) => readFileSync(join(REPO_ROOT, 'src/css', f), 'utf8');

test('every --adw-* token referenced is defined somewhere', () => {
  const declared = declaredVars(css);
  const undefinedRefs = [...referencedVars(css)]
    .filter((v) => v.startsWith('--adw-') && !declared.has(v))
    .sort();
  assert.deepEqual(undefinedRefs, [], 'referenced but never declared — typo or a deleted token');
});

test('structure rules are not scoped to a single colour scheme', () => {
  // `html[data-theme]` matches light and dark alike; `html[data-theme="dark"]`
  // would silently drop the whole rule in light mode.
  const structure = stripComments(src('30-structure.css'));
  const scoped = [...structure.matchAll(/html\[data-theme=("|')(dark|light)\1\]/g)].map((m) => m[0]);
  assert.deepEqual([...new Set(scoped)], [], 'structure sheet must stay scheme-agnostic');
});

for (const file of ['27-text.css', '30-structure.css']) {
  test(`${file} carries no literal colours`, () => {
    // Colour belongs in the palettes; a literal here cannot follow the scheme.
    // Data URIs are excised first — the close button masks in an Adwaita SVG
    // whose encoded markup is not a colour decision (it paints currentColor).
    const sheet = stripComments(src(file)).replace(/url\(\s*["']?data:[^)]*\)/gi, 'url(DATA_URI)');
    const literals = [
      ...sheet.matchAll(/#[0-9a-f]{3,8}\b/gi),
      ...sheet.matchAll(/\brgba?\([^)]*\)/gi),
    ].map((m) => m[0]);
    assert.deepEqual([...new Set(literals)], [], 'move these into 10-tokens-dark / 15-tokens-light');
  });
}

test('token blocks tie the [data-color] specificity', () => {
  // Logseq's `html[data-theme=dark][data-color=logseq]` palette is (0,2,1).
  // A plain `html[data-theme="dark"]` block is (0,1,1) and loses; matching
  // [data-color] ties it, and this sheet loads later so it wins on order.
  const cases = [
    ['dark palette', '10-tokens-dark.css', 'html[data-theme="dark"][data-color]'],
    ['light palette', '15-tokens-light.css', 'html[data-theme="light"][data-color]'],
    ['mappings', '20-mappings.css', 'html[data-theme][data-color]'],
    ['accent', '25-accent.css', 'html[data-theme][data-color]'],
    ['text colours', '27-text.css', 'html[data-theme][data-color]'],
  ];
  for (const [label, file, selector] of cases) {
    assert.ok(
      stripComments(src(file)).includes(selector),
      `${label} (${file}) must include the tie selector ${selector}`
    );
  }
});

test('the dialog rules that lost to the solarized palette keep their tie selector', () => {
  // `html[data-theme=dark][data-color=logseq] .ui__modal-panel` is (0,3,1);
  // these have to match it, not merely `html[data-theme] .ui__modal-panel`.
  const wanted = ['.ui__modal-panel', '.cp__cmdk > .hints'];
  for (const sel of wanted) {
    const tied = rules(css).some(
      ({ selector }) => selector.includes(sel) && /html\[data-theme\]\[data-color\]/.test(selector)
    );
    assert.ok(tied, `${sel} needs a html[data-theme][data-color] rule to beat the solarized palette`);
  }
});

test('the cmdk search input has its focus ring removed', () => {
  // The field is flush with the dialog's top edge, so the standard entry ring
  // drew over the panel's rounded corner and read as a coloured hairline.
  const rule = rules(css).find(
    ({ selector }) => /\.cp__cmdk\s+input:focus-visible/.test(selector)
  );
  assert.ok(rule, '.cp__cmdk input:focus-visible rule is missing');
  assert.match(rule.body, /outline:\s*none/, 'the ring must be removed, not merely recoloured');
});
