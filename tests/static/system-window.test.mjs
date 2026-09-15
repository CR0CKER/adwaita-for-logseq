/**
 * The PDF viewer's "open in external window" window.
 *
 * That window is a bare `window.open()` document Logseq builds by hand, and it
 * links only its own `./css/style.css` — no theme reaches it, so the viewer
 * came out unthemed there while the in-app one was Adwaita. The fix is the one
 * piece of this theme that is *not* CSS, which is exactly why it needs tests:
 * a silent failure here looks like "the theme just doesn't apply".
 *
 * Driven against a stub document rather than a running Electron. The stub is
 * deliberately literal about the two things that actually bit:
 *   - the guard is Logseq's own `is-system-window` class, so no other popup is
 *     touched;
 *   - the sheets must be appended *after* Logseq's own, or every specificity
 *     tie is lost.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  styleSystemWindow,
  updateSystemWindow,
  watchSystemWindows,
  THEME_LINK_ID,
  SETTINGS_STYLE_ID,
} from '../../src/system-window.ts';

const PAYLOAD = { themeUrl: 'lsp://logseq.com/themes/adwaita.css', settingsCss: ':root { --adw-x: 1 }' };

/** A document with just enough DOM for the module, plus an append log. */
function stubDocument({ systemWindow = true, existing = [] } = {}) {
  const head = [];
  return {
    head: { appendChild: (node) => head.push(node) },
    documentElement: { classList: { contains: (t) => systemWindow && t === 'is-system-window' } },
    getElementById: (id) => head.find((n) => n.id === id) ?? existing.find((n) => n.id === id) ?? null,
    createElement: (tag) => ({ tag }),
    head_: head,
  };
}

test('the theme sheet and the settings overrides are put into a system window', () => {
  const doc = stubDocument();
  assert.equal(styleSystemWindow(doc, PAYLOAD), true);

  const [link, style] = doc.head_;
  assert.equal(link.tag, 'link');
  assert.equal(link.rel, 'stylesheet');
  assert.equal(link.href, PAYLOAD.themeUrl);
  assert.equal(link.id, THEME_LINK_ID);

  // The settings overrides carry !important and must still come after the
  // theme sheet, exactly as in the main document.
  assert.equal(style.tag, 'style');
  assert.equal(style.id, SETTINGS_STYLE_ID);
  assert.equal(style.textContent, PAYLOAD.settingsCss);
});

test('only Logseq\'s PDF window is touched', () => {
  // The class is the guard: any other window.open() document is left alone,
  // which is what keeps a patched `open` from being a change to the whole app.
  const other = stubDocument({ systemWindow: false });
  assert.equal(styleSystemWindow(other, PAYLOAD), false);
  assert.deepEqual(other.head_, []);
});

test('styling a window twice does not stack sheets', () => {
  // The watcher can fire again on a plugin reload while a window is open.
  const doc = stubDocument();
  assert.equal(styleSystemWindow(doc, PAYLOAD), true);
  assert.equal(styleSystemWindow(doc, PAYLOAD), false);
  assert.equal(doc.head_.length, 2);
});

test('a window that is gone or malformed is a no-op, never a throw', () => {
  // These run against another window's document, which can be torn down
  // mid-call. A throw here would take down onSettingsChanged with it.
  for (const doc of [null, undefined, {}, { documentElement: null }]) {
    assert.equal(styleSystemWindow(doc, PAYLOAD), false);
    assert.equal(updateSystemWindow(doc, 'x'), false);
  }
  const noHead = stubDocument();
  noHead.head = null;
  assert.equal(styleSystemWindow(noHead, PAYLOAD), false);
});

test('a settings change rewrites the overrides in a window already open', () => {
  const doc = stubDocument();
  styleSystemWindow(doc, PAYLOAD);
  assert.equal(updateSystemWindow(doc, ':root { --adw-x: 2 }'), true);
  assert.equal(doc.head_[1].textContent, ':root { --adw-x: 2 }');
  // A window that was never styled reports so, and the caller drops it.
  assert.equal(updateSystemWindow(stubDocument(), 'y'), false);
});

test('every window the host opens is handed over — after the host has set it up', () => {
  const opened = { marker: 'the window' };
  const deferred = [];
  const host = { open: () => opened };
  const seen = [];

  watchSystemWindows(host, (w) => seen.push(w), (fn) => deferred.push(fn));
  const got = host.open();

  // The caller still gets its window, unchanged.
  assert.equal(got, opened);
  // And nothing has run yet: Logseq appends its own style.css synchronously
  // after open() returns, and a sheet added before that one loses every tie.
  assert.deepEqual(seen, []);
  deferred.forEach((fn) => fn());
  assert.deepEqual(seen, [opened]);
});

test('the host is patched once, and can be restored', () => {
  const original = () => null;
  const host = { open: original };
  const restore = watchSystemWindows(host, () => {}, (fn) => fn());
  assert.notEqual(host.open, original, 'the host was not patched');

  // A second call (a plugin reload) must not wrap the wrapper.
  const patched = host.open;
  const second = watchSystemWindows(host, () => {}, (fn) => fn());
  assert.equal(host.open, patched, 'open was wrapped twice');
  second();
  assert.equal(host.open, patched, 'the no-op restore unpatched someone else\'s work');

  restore();
  assert.equal(host.open, original);
});

test('an unreachable host leaves the rest of the plugin alone', () => {
  // A cross-origin or missing top: the one window goes unthemed, nothing throws.
  for (const host of [null, undefined, {}, { open: 'not a function' }]) {
    assert.doesNotThrow(() => watchSystemWindows(host, () => {})());
  }
});
