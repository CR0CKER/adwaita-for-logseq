/**
 * A deliberately small CSS reader for the built stylesheet.
 *
 * Not a real parser and not trying to be: the built sheet is flat (no nesting,
 * no @media), so splitting on braces is sufficient and keeps the test suite
 * dependency-free. If the stylesheet ever grows nesting, this needs replacing
 * with a real parser rather than patching.
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

/** Every rule in source order: { selector, body }. */
export function rules(css) {
  const out = [];
  for (const chunk of stripComments(css).split('}')) {
    const i = chunk.indexOf('{');
    if (i === -1) continue;
    const selector = chunk.slice(0, i).trim();
    const body = chunk.slice(i + 1).trim();
    if (selector) out.push({ selector, body });
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
