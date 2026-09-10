/**
 * The Logseq builds the live suite can drive.
 *
 * Each entry is only a *binding* — paths come from the environment so the suite
 * is not tied to one machine. A target whose binary is missing is skipped with
 * a reason rather than failing the run.
 */
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const TARGETS = {
  og: {
    id: 'og',
    label: 'Logseq OG (Electron 43)',
    bin: process.env.LOGSEQ_OG_BIN || join(homedir(), '.local/opt/logseq-og/Logseq-OG'),
    // Logseq's dot-root lives under $HOME and is NOT moved by --user-data-dir,
    // so every launch overrides HOME. OG uses its own name; official builds
    // use .logseq, which on a developer's machine is a real profile.
    dotRoot: '.logseq-og',
    flags: ['--enable-features=WaylandWindowDecorations,OverlayScrollbar', '--gtk-version=4'],
    repoKey: 'git/current-repo',
    // Seeding a file graph by writing localStorage works here.
    supports: { graph: true },
  },
  db: {
    id: 'db',
    label: 'Logseq 2.x (DB build)',
    // No default path: 2.x is not installed system-wide on the dev machine, so
    // the suite refuses to guess. Point LOGSEQ_DB_BIN at the extracted binary.
    bin: process.env.LOGSEQ_DB_BIN || '',
    dotRoot: '.logseq',
    // Same flags the README tells users to add. Without WaylandWindowDecorations
    // Chromium draws no client-side frame, so the frameless window has square
    // corners and no shadow — the suite would be testing an unsupported setup.
    flags: ['--enable-features=WaylandWindowDecorations,OverlayScrollbar', '--gtk-version=4'],
    repoKey: 'current-repo',
    // 2.x stores graph selection differently (`current-repo`, plus a DB-graph
    // worker) and seeding a file graph the way OG allows was not made to work.
    // Cases needing an open graph skip here, with that reason reported.
    supports: { graph: false },
  },
};

export function resolveTargets(ids) {
  const wanted = ids?.length ? ids : Object.keys(TARGETS);
  return wanted.map((id) => {
    const t = TARGETS[id];
    if (!t) throw new Error(`unknown target "${id}" (known: ${Object.keys(TARGETS).join(', ')})`);
    const available = Boolean(t.bin) && existsSync(t.bin);
    const reason = !t.bin
      ? `set ${id === 'db' ? 'LOGSEQ_DB_BIN' : 'LOGSEQ_OG_BIN'} to its binary`
      : available
        ? null
        : `binary not found at ${t.bin}`;
    return { ...t, available, unavailableReason: reason };
  });
}
