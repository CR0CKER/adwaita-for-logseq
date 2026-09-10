#!/usr/bin/env node
/**
 * Live regression suite: drive real Logseq builds and assert computed styles.
 *
 * Local-only by design — it needs a Logseq binary, so CI cannot run it. The
 * static tier (npm test) is the CI gate; this is the one that proves a cascade
 * rule actually wins.
 *
 *   npm run test:live                  # every available target
 *   npm run test:live -- --target=og   # one target
 *
 *   LOGSEQ_OG_BIN   path to the Logseq OG binary
 *   LOGSEQ_DB_BIN   path to a Logseq 2.x binary
 */
import { resolveTargets } from '../lib/targets.mjs';
import { launch, applyTheme, setMode, openGraph, teardown } from '../lib/scratch.mjs';
import { cases } from './cases.mjs';

const args = process.argv.slice(2);
const requested = args
  .filter((a) => a.startsWith('--target='))
  .flatMap((a) => a.slice('--target='.length).split(','))
  .filter(Boolean);

const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

let failures = 0;
let ran = 0;
let skipped = 0;

for (const target of resolveTargets(requested)) {
  console.log(`\n${target.label}`);
  if (!target.available) {
    console.log(`  ${dim(`skipped — ${target.unavailableReason}`)}`);
    skipped += cases.length;
    continue;
  }

  let session;
  try {
    session = await launch(target);
    await applyTheme(session, 'dark');

    if (target.supports.graph) {
      await openGraph(session);
      // openGraph reconnects after the reload, so the theme has to be
      // reselected — the app reloads with whatever preferences say.
      await applyTheme(session, 'dark');
    }

    for (const c of cases) {
      const needsGraph = c.needs?.includes('graph');
      if (needsGraph && !target.supports.graph) {
        console.log(`  ${dim(`skip  ${c.name}`)}`);
        console.log(`        ${dim(`${target.id} cannot open a seeded file graph — see tests/lib/targets.mjs`)}`);
        skipped++;
        continue;
      }
      if (c.only && !c.only.includes(target.id)) {
        console.log(`  ${dim(`skip  ${c.name} (only: ${c.only.join(', ')})`)}`);
        skipped++;
        continue;
      }
      try {
        const outcome = await c.run({ cdp: session.cdp, session, target, applyTheme, setMode });
        if (outcome?.skipped) {
          // A case that found nothing to check reports it, never passes silently.
          console.log(`  ${dim(`skip  ${c.name}`)}`);
          console.log(`        ${dim(outcome.skipped)}`);
          skipped++;
          continue;
        }
        console.log(`  ${green('pass')}  ${c.name}`);
        ran++;
      } catch (err) {
        console.log(`  ${red('FAIL')}  ${c.name}`);
        console.log(`        ${err.message.split('\n').join('\n        ')}`);
        failures++;
        ran++;
      }
    }
  } catch (err) {
    console.log(`  ${red('FAIL')}  could not start the target`);
    console.log(`        ${err.message.split('\n')[0]}`);
    failures++;
  } finally {
    if (session) teardown(session);
  }
}

console.log(`\n${'-'.repeat(52)}`);
console.log(`ran ${ran}   failed ${failures}   skipped ${skipped}`);
process.exit(failures > 0 ? 1 : 0);
