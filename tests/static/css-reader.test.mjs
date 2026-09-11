/**
 * The small CSS reader every static test relies on (tests/lib/css.mjs).
 *
 * It was written for a flat sheet. The headerbar layout added the theme's
 * first @media block (Logseq docks the left sidebar only at min-width 640px),
 * and a brace-splitting reader turns a nested block into garbage selectors —
 * silently, so a test could pass by reading nothing. These pin the reader.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rules, declaredValue } from '../lib/css.mjs';

const SAMPLE = `
/* a comment { with braces } */
a { color: red; }
@media (min-width: 640px) {
  .x > .y { left: 1px; }
  .z { top: 2px; }
}
b { color: blue; }
`;

test('flat rules keep their selector and body', () => {
  const r = rules(SAMPLE);
  assert.deepEqual(r.find((x) => x.selector === 'a'), { selector: 'a', body: 'color: red;', media: null });
  assert.deepEqual(r.find((x) => x.selector === 'b'), { selector: 'b', body: 'color: blue;', media: null });
});

test('rules inside @media are read, and tagged with their media query', () => {
  const r = rules(SAMPLE);
  assert.deepEqual(r.find((x) => x.selector === '.x > .y'), { selector: '.x > .y', body: 'left: 1px;', media: '@media (min-width: 640px)' });
  assert.equal(r.find((x) => x.selector === '.z')?.media, '@media (min-width: 640px)');
  assert.ok(!r.some((x) => x.selector.startsWith('@media')), 'the at-rule itself is not a rule');
});

test('declaredValue reads through @media', () => {
  assert.equal(declaredValue(SAMPLE, /^\.z$/, 'top'), '2px');
});
