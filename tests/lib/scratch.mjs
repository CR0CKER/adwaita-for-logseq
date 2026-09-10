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

/**
 * Plugin settings every live session starts with — deliberately NOT the
 * defaults. A stored non-default setting is what exposed the startup bug: the
 * plugin painted its defaults and ignored the saved values until a setting was
 * changed. Seeding these on every run keeps that path under test.
 */
export const STARTUP_SETTINGS = {
  gnomeAccent: 'yellow',
  windowControls: 'close only',
  hideRightSidebarTopbar: true,
  disabled: false,
};

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
  writeFileSync(join(dot, 'settings/logseq-adwaita-theme.json'), JSON.stringify(STARTUP_SETTINGS, null, 2));

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
  // Wait for the token to resolve to *this mode's* value. "Non-empty" was the
  // original check and it made the light case flaky: switching dark -> light,
  // --adw-view-bg is already set from the dark palette, so the wait returned
  // at once and the probe raced the switch.
  const expected = mode === 'dark' ? '#1d1d20' : '#ffffff';
  await waitFor(
    cdp,
    `document.documentElement.dataset.theme === ${JSON.stringify(mode)} &&
     getComputedStyle(document.documentElement).getPropertyValue('--adw-view-bg').trim() === ${JSON.stringify(expected)}`,
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
  const available = await cdp.evaluate(`Boolean(window.logseq?.api?.set_theme_mode)`);
  if (!available) throw new Error('no logseq.api.set_theme_mode on this build — cannot switch mode honestly');

  // Logseq drops a mode switch issued while a freshly opened graph is still
  // initialising: no data-theme transition happens at all, and the state
  // reads the old mode beforehand. Measured: 2-4 of 5 sessions when switching
  // right after the graph opened, 0 of 6 after a 10 s settle, and 0 of 8 for
  // later switches in the same session. So re-issue the call until the DOM
  // reflects it — a bounded wait for a precondition, not a retried assertion.
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    await cdp.evaluate(`window.logseq.api.set_theme_mode(${JSON.stringify(mode)}); true`);
    try {
      await waitFor(cdp, `document.documentElement.dataset.theme === ${JSON.stringify(mode)}`, {
        label: `the app to switch to ${mode}`,
        timeoutMs: 2000,
      });
      return;
    } catch {
      /* dropped during graph init — issue it again */
    }
  }
  throw new Error(`the app never switched to ${mode} within 20s`);
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
