/**
 * Launch a Logseq instance that cannot touch anything real, then tear it down.
 *
 * Isolation is the hard requirement here, and it has one non-obvious part:
 * `--user-data-dir` moves only Chromium's profile. Logseq's dot-root — plugins,
 * settings, graph list — comes from `$HOME`, so every launch overrides HOME as
 * well. Official builds use `~/.logseq`, which on a developer's machine is a
 * real profile with real plugins; getting this wrong runs a test instance
 * against them.
 */
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { connect, waitFor } from './cdp.mjs';

const REPO_ROOT = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');

/** A port nobody else in this run is using. */
function pickPort() {
  return 9600 + Math.floor(Math.random() * 300);
}

/** A minimal file-based graph: enough for a sidebar with sections. */
function seedGraph(dir) {
  mkdirSync(join(dir, 'logseq'), { recursive: true });
  mkdirSync(join(dir, 'journals'), { recursive: true });
  mkdirSync(join(dir, 'pages'), { recursive: true });
  writeFileSync(join(dir, 'logseq/config.edn'), '{:feature/enable-developer-mode? true}\n');
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '_');
  writeFileSync(join(dir, `journals/${today}.md`), '- hello from the regression suite\n- [[a test page]]\n');
  writeFileSync(join(dir, 'pages/a test page.md'), '- referenced by the journal\n');
  return dir;
}

export async function launch(target, { pluginPath = REPO_ROOT } = {}) {
  const root = mkdtempSync(join(tmpdir(), `adwaita-live-${target.id}-`));
  const home = join(root, 'home');
  const userData = join(root, 'user-data');
  const graph = seedGraph(join(root, 'graph'));
  const dot = join(home, target.dotRoot);
  mkdirSync(join(dot, 'config'), { recursive: true });
  mkdirSync(join(dot, 'settings'), { recursive: true });
  mkdirSync(userData, { recursive: true });

  // Load the plugin unpacked, straight from the repo, so the suite tests the
  // working tree rather than a copy that can go stale.
  writeFileSync(
    join(dot, 'preferences.json'),
    JSON.stringify({ theme: null, themes: { mode: 'dark' }, externals: [pluginPath] }, null, 2)
  );
  writeFileSync(join(dot, 'config/plugins.edn'), '{}\n');

  const port = pickPort();
  const proc = spawn(target.bin, [`--user-data-dir=${userData}`, `--remote-debugging-port=${port}`, ...target.flags], {
    env: { ...process.env, HOME: home },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });
  const logLines = [];
  proc.stdout?.on('data', (d) => logLines.push(String(d)));
  proc.stderr?.on('data', (d) => logLines.push(String(d)));

  // Wait for the DevTools endpoint, then for the app to actually boot.
  const deadline = Date.now() + 60000;
  let cdp;
  while (Date.now() < deadline) {
    try {
      cdp = await connect(port);
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  if (!cdp) {
    teardown({ proc, root, target });
    throw new Error(`${target.label}: no DevTools endpoint after 60s\n${logLines.join('').slice(-800)}`);
  }

  await waitFor(cdp, 'Boolean(window.LSPluginCore)', { label: 'LSPluginCore', timeoutMs: 45000 });

  return { cdp, proc, root, home, graph, port, target, log: () => logLines.join('') };
}

/** Register-and-select the theme, and confirm the stylesheet actually applied. */
export async function applyTheme(session, mode = 'dark') {
  const { cdp } = session;
  await waitFor(
    cdp,
    `Boolean(window.LSPluginCore.themes && window.LSPluginCore.themes.get('logseq-adwaita-theme'))`,
    { label: 'the plugin registering its themes', timeoutMs: 45000 }
  );
  const index = mode === 'dark' ? 0 : 1;
  await cdp.evaluate(`(async () => {
    const c = window.LSPluginCore;
    const themes = c.themes.get('logseq-adwaita-theme');
    await c.selectTheme(themes[${index}], { effect: true, emit: true });
    return true;
  })()`);
  // The theme arrives as a <link>; a token resolving is proof it loaded and
  // applied, where the link element merely existing is not.
  await waitFor(
    cdp,
    `getComputedStyle(document.documentElement).getPropertyValue('--adw-view-bg').trim().length > 0`,
    { label: `the ${mode} stylesheet to apply`, timeoutMs: 20000 }
  );
}

/**
 * Switch the app's colour scheme.
 *
 * Selecting a light-mode *theme* does not switch the app's mode: `data-theme`
 * stays as it was and the light palette never applies. Logseq's own API does
 * the real switch, so use it rather than stamping data-theme onto <html>, which
 * would test a DOM state the app never actually produces.
 */
export async function setMode(session, mode) {
  const { cdp } = session;
  const used = await cdp.evaluate(`(() => {
    if (window.logseq?.api?.set_theme_mode) { window.logseq.api.set_theme_mode(${JSON.stringify(mode)}); return 'api'; }
    return 'none';
  })()`);
  if (used === 'none') throw new Error('no logseq.api.set_theme_mode on this build — cannot switch mode honestly');
  await waitFor(cdp, `document.documentElement.dataset.theme === ${JSON.stringify(mode)}`, {
    label: `the app to switch to ${mode}`,
    timeoutMs: 10000,
  });
  return used;
}

/** Open the seeded file graph. Only meaningful where the target supports it. */
export async function openGraph(session) {
  const { cdp, target, graph } = session;
  await cdp.evaluate(`localStorage.setItem(${JSON.stringify(target.repoKey)}, 'logseq_local_' + ${JSON.stringify(graph)}); true`);
  await cdp.evaluate('location.reload(); true');
  await new Promise((r) => setTimeout(r, 6000));
  const fresh = await connect(session.port);
  session.cdp = fresh;
  await waitFor(fresh, `Boolean(document.querySelector('#main-content-container'))`, {
    label: 'the graph to open',
    timeoutMs: 45000,
  });
}

/**
 * Stop the instance.
 *
 * Kill the main process by PID only. `pkill -f` matches the shell running it
 * as well as the app's child processes, and killing a Chromium child takes the
 * whole app down with "GPU process isn't usable" — noisy, and it has killed the
 * wrong thing before.
 */
export function teardown(session) {
  const { proc, root, target } = session;
  try {
    proc.kill('SIGKILL');
  } catch {
    /* already gone */
  }
  // Electron can outlive a killed launcher; sweep any process of this binary
  // still pointing at our scratch profile.
  try {
    const name = basename(target.bin);
    const pids = execFileSync('pgrep', ['-x', name], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
    for (const pid of pids) {
      try {
        // Read /proc directly — shelling out to cat races with process exit
        // and prints errors for PIDs that vanished mid-sweep.
        const cmdline = readFileSync(`/proc/${pid}/cmdline`, 'utf8').replace(/\0/g, ' ');
        if (cmdline.includes(root)) process.kill(Number(pid), 'SIGKILL');
      } catch {
        /* raced with exit */
      }
    }
  } catch {
    /* pgrep found nothing */
  }
  try {
    rmSync(root, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
}
