/**
 * Styling Logseq's "open in external window" PDF window.
 *
 * That window is not a route — it is a bare `window.open()` document the app
 * builds by hand (`frontend/extensions/pdf/windows.cljs`, `setup-win!`):
 *
 *   - `resolve-styles!` links **only** `./css/style.css` into it, so no theme
 *     reaches it — registered themes are injected into the main document, which
 *     this window is not part of;
 *   - `resolve-classes!` puts `is-system-window` on its `<html>`;
 *   - the document's `data-theme` **is** set, from `:ui/theme`.
 *
 * So the theme's own selectors would match there; the sheet is simply absent.
 * Logseq keeps the window handle in a ClojureScript atom and exposes no hook,
 * so the only way to reach it is to watch `open` on the host window. The
 * plugin's iframe is same-origin with the host (`lsp://logseq.com`,
 * unsandboxed), which is what makes that possible.
 *
 * Everything here takes its DOM as an argument so it can be tested against a
 * stub rather than a running Electron (tests/static/system-window.test.mjs).
 */

export const THEME_LINK_ID = 'adwaita-system-window-theme';
export const SETTINGS_STYLE_ID = 'adwaita-system-window-settings';

/** What to put into a system window: the theme sheet, then the settings overrides. */
export interface Payload {
  themeUrl: string;
  settingsCss: string;
}

/** The parts of Document this module touches. Keeps the test stub small. */
export interface MinimalDocument {
  documentElement: { classList: { contains(token: string): boolean } } | null;
  head: { appendChild(node: unknown): unknown } | null;
  getElementById(id: string): unknown;
  createElement(tag: string): Record<string, unknown>;
}

/**
 * Put the theme into one system window's document. Returns whether it did.
 *
 * Idempotent, and a no-op for any other window: the guard is
 * `is-system-window`, the class Logseq puts on that document and nowhere else,
 * so an unrelated popup is left alone.
 */
export function styleSystemWindow(doc: MinimalDocument | null | undefined, payload: Payload): boolean {
  // The document is cross-window and can be torn down mid-call (the user
  // closing the window), so every access is inside the try.
  try {
    if (!doc?.documentElement?.classList.contains('is-system-window')) return false;
    if (!doc.head) return false;
    if (doc.getElementById(THEME_LINK_ID)) return false;

    const link = doc.createElement('link');
    link.id = THEME_LINK_ID;
    link.rel = 'stylesheet';
    link.href = payload.themeUrl;
    doc.head.appendChild(link);

    // The settings overrides carry !important and must still land after the
    // theme sheet, exactly as they do in the main document.
    const style = doc.createElement('style');
    style.id = SETTINGS_STYLE_ID;
    style.textContent = payload.settingsCss;
    doc.head.appendChild(style);
    return true;
  } catch {
    return false;
  }
}

/** Re-write the settings overrides in a window already styled. */
export function updateSystemWindow(doc: MinimalDocument | null | undefined, settingsCss: string): boolean {
  try {
    const style = doc?.getElementById(SETTINGS_STYLE_ID) as { textContent?: string } | null;
    if (!style) return false;
    style.textContent = settingsCss;
    return true;
  } catch {
    return false;
  }
}

/** The bits of Window this module needs, so the test can pass a plain object. */
export interface MinimalWindow {
  open: (...args: never[]) => MinimalWindow | null;
  document?: MinimalDocument | null;
  closed?: boolean;
}

const PATCHED = '__adwaitaSystemWindowPatched';

/**
 * Watch `host.open` and hand every window it returns to `onOpen`.
 *
 * `onOpen` is deferred rather than called inline: Logseq builds the document
 * synchronously after `open()` returns — including its own `style.css` link —
 * and a sheet appended before that one would *lose* every specificity tie. A
 * task scheduled here runs after that setup, so the theme's link is last.
 *
 * Patching the host's `open` is intrusive for a theme, and deliberately narrow:
 * it adds nothing to the returned window, and `styleSystemWindow` ignores any
 * document that is not Logseq's PDF window. Returns a function that restores
 * the original, and is a no-op if already patched (a plugin reload re-runs it).
 */
export function watchSystemWindows(
  host: MinimalWindow | null | undefined,
  onOpen: (win: MinimalWindow) => void,
  defer: (fn: () => void) => void = (fn) => setTimeout(fn, 0)
): () => void {
  const noop = () => {};
  if (!host || typeof host.open !== 'function') return noop;
  const original = host.open as typeof host.open & { [PATCHED]?: boolean };
  if (original[PATCHED]) return noop;

  const patched = function (this: unknown, ...args: never[]) {
    const win = original.apply(this, args) as MinimalWindow | null;
    if (win) defer(() => onOpen(win));
    return win;
  } as typeof host.open & { [PATCHED]?: boolean };
  patched[PATCHED] = true;
  host.open = patched;

  return () => {
    if (host.open === patched) host.open = original;
  };
}
