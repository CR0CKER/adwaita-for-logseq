/**
 * Text colours inside notes: code blocks, highlights, and the prose roles the
 * "Text colours" setting switches.
 *
 * The palette is GNOME Text Editor's Adwaita style scheme (GtkSourceView's
 * Adwaita / Adwaita-dark), but no hex from it reaches the page directly: each
 * scheme hue is run through the same lightness clamp as accent text, because
 * copied verbatim several roles fail AA on Logseq's surfaces. contrast.test.mjs
 * measures the result; this file pins the wiring that makes that measurement
 * the truth — every role derived through the clamp, every Logseq code token
 * re-pointed, and the prose roles quiet unless the setting says otherwise.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readThemeCss, rules, declaredValue } from '../lib/css.mjs';

const css = readThemeCss();
const HUES = ['teal', 'violet', 'orange', 'blue', 'grey'];

/** The colour a rule gives `selector`, which must appear in its list verbatim. */
function colourOf(selector) {
  let found;
  for (const r of rules(css)) {
    if (!r.selector.split(',').map((s) => s.trim()).includes(selector)) continue;
    const m = r.body.match(/(?:^|;)\s*color\s*:\s*([^;]+)/);
    if (m) found = m[1].trim();
  }
  return found;
}

test('every text colour is its scheme hue through the accent-text clamp', () => {
  for (const hue of HUES) {
    // Violet is inline code's colour and also sits on --adw-fill, so it has its
    // own (stricter on light) clamp; contrast.test.mjs measures it on the fill.
    const clamp = hue === 'violet' ? '--adw-code-oklab' : '--adw-standalone-oklab';
    assert.equal(
      declaredValue(css, /html\[data-theme\]/, `--adw-text-${hue}`),
      `oklab(from var(--adw-src-${hue}) var(${clamp}))`,
      `--adw-text-${hue} must be derived, or the contrast test measures a colour the page never shows`
    );
  }
});

// Every token Logseq's CodeMirror themes colour — `cm-s-solarized`, which OG
// renders code blocks with, and `cm-s-lsradix`; both colour the same set — and
// the Adwaita scheme role it maps to. `inherit` = the scheme leaves it uncoloured.
const CODE_TOKENS = {
  keyword: 'var(--adw-text-orange)', // def:statement
  meta: 'var(--adw-text-orange)', // def:preprocessor
  attribute: 'var(--adw-text-orange)', // xml:attribute-name
  string: 'var(--adw-text-teal)', // def:string
  'string-2': 'var(--adw-text-teal)',
  type: 'var(--adw-text-teal)', // def:type
  'variable-3': 'var(--adw-text-teal)',
  tag: 'var(--adw-text-teal)', // xml:element-name
  qualifier: 'var(--adw-text-teal)', // css:id-selector
  header: 'var(--adw-text-teal)', // def:heading
  def: 'var(--adw-text-blue)', // def:function
  builtin: 'var(--adw-text-blue)', // python:builtin-function
  link: 'var(--adw-text-blue)', // def:link-destination
  number: 'var(--adw-text-violet)', // def:number
  atom: 'var(--adw-text-violet)', // def:constant
  comment: 'var(--adw-text-grey)', // def:comment
  quote: 'var(--adw-text-grey)',
  variable: 'inherit',
  'variable-2': 'inherit',
  property: 'inherit',
  operator: 'inherit',
  bracket: 'inherit',
  special: 'inherit',
  em: 'inherit',
};

test('every code token Logseq colours is re-pointed at the Adwaita scheme', () => {
  const wrong = [];
  for (const [token, expected] of Object.entries(CODE_TOKENS)) {
    const got = colourOf(`html[data-theme] .CodeMirror .cm-${token}`);
    if (got !== expected) wrong.push(`.cm-${token}: ${got ?? '(no rule — Logseq’s solarized colour shows)'}, want ${expected}`);
  }
  assert.deepEqual(wrong, [], wrong.join('\n  '));
});

test('code blocks are an Adwaita surface, not solarized teal or cream', () => {
  assert.equal(declaredValue(css, /^html\[data-theme\] \.CodeMirror$/, 'background-color'), 'var(--adw-gray-02)');
  assert.equal(declaredValue(css, /^html\[data-theme\] \.CodeMirror$/, 'color'), 'var(--adw-gray-11)');
  assert.equal(
    declaredValue(css, /^html\[data-theme\] \.CodeMirror \.CodeMirror-gutters$/, 'background-color'),
    'var(--adw-gray-02)',
    'the gutter shares the text surface, as in Text Editor'
  );
});

test('prose roles are quiet by default: headings, inline code and quotes stay as they are today', () => {
  const root = /html\[data-theme\]/;
  assert.equal(declaredValue(css, root, '--adw-heading-fg'), 'var(--adw-fg)');
  // Inline code is quiet at the grey Logseq already paints it, not body white:
  // quiet must not change what a user sees today.
  assert.equal(declaredValue(css, root, '--adw-code-fg'), 'var(--adw-gray-11)');
  assert.equal(declaredValue(css, root, '--adw-quote-border'), 'var(--adw-border)');
});

test('the prose rules read the role tokens the setting switches', () => {
  assert.equal(colourOf('html[data-theme] .ls-block h1'), 'var(--adw-heading-fg)', 'block headings');
  assert.equal(colourOf('html[data-theme] .ls-block h6'), 'var(--adw-heading-fg)', 'all six levels');
  // Logseq's inline-code rule reads --lx-gray-11 before the variable, so the
  // element itself has to be painted; the variable is kept for builds that read it.
  assert.equal(colourOf('html[data-theme] :not(pre) > code'), 'var(--adw-code-fg)', 'inline code');
  assert.equal(declaredValue(css, /html\[data-theme\]/, '--ls-page-inline-code-color'), 'var(--adw-code-fg)');
  assert.equal(declaredValue(css, /^html\[data-theme\] blockquote$/, 'border-left-color'), 'var(--adw-quote-border)');
});

test('page titles and journal dates are Text Editor’s body-text grey, under either setting', () => {
  // Both are h1.title (a journal date is `a.journal-title > h1.title`). Logseq's
  // own rule reads --lx-gray-12 before --ls-title-text-color, so the element is
  // painted — and the input shown while renaming a page with it.
  assert.equal(colourOf('html[data-theme] h1.title'), 'var(--adw-title-fg)');
  assert.equal(colourOf('html[data-theme] h1.title input'), 'var(--adw-title-fg)');
  // Logseq 2.x renders both as a block: .ls-page-title .block-title-wrap.
  assert.equal(colourOf('html[data-theme] .ls-page-title .block-title-wrap'), 'var(--adw-title-fg)', 'Logseq 2.x titles');
  // --adw-gray-11: #c0bfbc on dark (Text Editor's body text), #3d3846 on light.
  assert.equal(declaredValue(css, /html\[data-theme\]/, '--adw-title-fg'), 'var(--adw-gray-11)');
});

test('==highlights== use the Adwaita search-match colours', () => {
  assert.equal(declaredValue(css, /html\[data-theme\]/, '--ls-page-mark-bg-color'), 'var(--adw-mark-bg)');
  assert.equal(declaredValue(css, /html\[data-theme\]/, '--ls-page-mark-color'), 'var(--adw-mark-fg)');
});
