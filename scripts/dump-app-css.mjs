#!/usr/bin/env node
/**
 * Dump a running Logseq's own stylesheet to a file.
 *
 * Logseq 2.x packs its CSS inside app.asar, so it cannot be read from disk
 * without an asar dependency. This reads it from the renderer instead, over
 * the DevTools protocol, so extract-logseq-vars.mjs can build the fixture:
 *
 *   <logseq> --remote-debugging-port=9555 ...      (with HOME overridden!)
 *   node scripts/dump-app-css.mjs 9555 /tmp/db-style.css
 *   node scripts/extract-logseq-vars.mjs db /tmp/db-style.css
 */
import { writeFileSync } from 'node:fs';
import { connect } from '../tests/lib/cdp.mjs';

const [port, out] = process.argv.slice(2);
if (!port || !out) {
  console.error('usage: dump-app-css.mjs <devtools-port> <output.css>');
  process.exit(2);
}
const cdp = await connect(Number(port));
const css = await cdp.evaluate(`(async () => {
  const link = [...document.querySelectorAll('link[rel=stylesheet]')].find((l) => /style\\.css/.test(l.href));
  if (!link) return null;
  return await (await fetch(link.href)).text();
})()`);
cdp.close();
if (!css) {
  console.error('could not find the app stylesheet in that window');
  process.exit(1);
}
writeFileSync(out, css);
console.log(`wrote ${out} (${Math.round(css.length / 1024)} KB)`);
