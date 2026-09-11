/**
 * A deliberately small CSS reader for the built stylesheet.
 *
 * Not a real parser and not trying to be: the built sheet has no CSS nesting,
 * and at most one level of at-rule block (`@media`), which rules() reads by
 * tracking brace depth. That keeps the suite dependency-free. If the sheet ever
 * grows CSS nesting or nested at-rules, replace this with a real parser rather
 * than patching it. tests/static/css-reader.test.mjs pins its behaviour.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const REPO_ROOT = new URL('../..', import.meta.url).pathname;

/**
 * The stylesheet under test. `THEME_CSS` points it at a different file so the
 * same assertions can be run against a pre-fix stylesheet from git history —
 * that is what makes the red-first check possible (scripts/redcheck.sh).
 */
export function themeCssPath() {
  return process.env.THEME_CSS || join(REPO_ROOT, 'themes/adwaita.css');
}

export function readThemeCss() {
  return readFileSync(themeCssPath(), 'utf8');
}

/** Strip comments so their example code never counts as a real declaration. */
export function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * Every rule in source order: { selector, body, media }.
 *
 * Reads one level of at-rule block (`@media …{ … }`, `@supports …`): the rules
 * inside are returned like any other, with `media` set to the at-rule's
 * prelude; top-level rules have `media: null`. Tracks brace depth rather than
 * splitting on `}`, which turned a nested block into garbage selectors.
 */
export function rules(css) {
  const src = stripComments(css);
  const out = [];
  let i = 0;
  let media = null; // prelude of the at-rule block we are inside, if any
  while (i < src.length) {
    const open = src.indexOf('{', i);
    const close = src.indexOf('}', i);
    if (close !== -1 && (open === -1 || close < open)) {
      // End of the enclosing at-rule block.
      media = null;
      i = close + 1;
      continue;
    }
    if (open === -1) break;
    const prelude = src.slice(i, open).trim();
    if (prelude.startsWith('@') && media === null) {
      media = prelude;
      i = open + 1;
      continue;
    }
    const end = src.indexOf('}', open);
    if (end === -1) break;
    if (prelude) out.push({ selector: prelude, body: src.slice(open + 1, end).trim(), media });
    i = end + 1;
  }
  return out;
}

/** Custom properties the sheet *defines*, e.g. `--adw-view-bg: #1d1d20`. */
export function declaredVars(css) {
  const out = new Set();
  for (const m of stripComments(css).matchAll(/(^|[;{]|\s)(--[a-z0-9-]+)\s*:/gi)) out.add(m[2]);
  return out;
}

/** Custom properties the sheet *reads*, e.g. `var(--adw-view-bg)`. */
export function referencedVars(css) {
  const out = new Set();
  for (const m of stripComments(css).matchAll(/var\(\s*(--[a-z0-9-]+)/gi)) out.add(m[1]);
  return out;
}

/**
 * Value of a custom property as declared under a selector matching `selectorRe`.
 * Returns the last declaration, matching the cascade for equal specificity.
 */
export function declaredValue(css, selectorRe, prop) {
  let found;
  for (const { selector, body } of rules(css)) {
    if (!selectorRe.test(selector)) continue;
    const m = body.match(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`));
    if (m) found = m[1].trim();
  }
  return found;
}

/** Does any rule's selector satisfy `pred`? */
export function hasRule(css, pred) {
  return rules(css).some(({ selector }) => pred(selector));
}
