/**
 * The live cases: computed styles in a running Logseq.
 *
 * These exist because six of the seven bugs this suite locks down were cascade
 * bugs — the rule was present in the stylesheet and lost to a more specific one.
 * Reading the file proves a rule exists; only this tier proves it wins.
 *
 * Each case declares:
 *   needs: ['graph']  — skipped where the target cannot open one
 *   only: ['og']      — skipped on other targets, with the reason printed
 */
import assert from 'node:assert/strict';
import { parseRgb, parseColor, contrastRatio } from '../lib/color.mjs';
import { waitFor } from '../lib/cdp.mjs';

const ADWAITA = {
  dark: { view: 'rgb(29, 29, 32)', sidebar: 'rgb(46, 46, 50)', gray03: '#2e2e32' },
  light: { view: 'rgb(255, 255, 255)', sidebar: 'rgb(235, 235, 237)', gray03: '#f3f3f5' },
};

/** Read computed styles for several selectors in one round trip. */
const probe = (cdp, spec) =>
  cdp.evaluateJson(`(() => {
    const out = {};
    const spec = ${JSON.stringify(spec)};
    for (const [key, [selector, prop]] of Object.entries(spec)) {
      const el = selector === ':root' ? document.documentElement : document.querySelector(selector);
      out[key] = el ? getComputedStyle(el)[prop] ?? null : '(missing)';
    }
    return JSON.stringify(out);
  })()`);

export const cases = [
  {
    // First on purpose: nothing may have touched a setting yet.
    name: 'stored plugin settings win over the theme sheet once it is selected',
    async run({ cdp }) {
      await waitFor(
        cdp,
        `Boolean(document.querySelector('style[data-injected-style="adwaita-settings-logseq-adwaita-theme"]'))`,
        { label: 'the plugin to inject its settings stylesheet', timeoutMs: 20000 }
      );
      // Assert the COMPUTED value — what the user sees — not the settings
      // sheet's text. The text was right all along; the bug was that it lost:
      // Logseq appends the theme <link> after the plugin's <style> whenever a
      // theme is selected, and both declared --adw-gnome-accent on :root, so
      // the theme's own #3584e4 default won on order. The harness selects the
      // theme before this runs, which is exactly the losing sequence.
      const got = await cdp.evaluateJson(`(() => {
        const h = getComputedStyle(document.documentElement);
        const mini = document.querySelector('.window-controls .button.minimize');
        return JSON.stringify({
          gnomeAccent: h.getPropertyValue('--adw-gnome-accent').trim(),
          wcWidth: h.getPropertyValue('--adw-wc-width').trim(),
          minimize: mini ? getComputedStyle(mini).display : '(no minimize button)',
        });
      })()`);
      // STARTUP_SETTINGS seeds yellow and "close only" — non-defaults, so a
      // settings sheet that loses to the theme's defaults fails here.
      assert.equal(got.gnomeAccent, '#c88800', 'stored accent (yellow) lost to the theme sheet default');
      assert.equal(got.wcWidth, '44px', 'stored "close only" lost to the theme sheet default');
      if (got.minimize !== '(no minimize button)') {
        assert.equal(got.minimize, 'none', 'minimise must be hidden under "close only"');
      }
    },
  },

  {
    name: 'dark surfaces are Adwaita, not Logseq defaults',
    async run({ cdp }) {
      const got = await probe(cdp, {
        body: ['body', 'backgroundColor'],
        header: ['.cp__header', 'backgroundColor'],
        sidebar: ['.left-sidebar-inner', 'backgroundColor'],
        headerHeight: ['.cp__header', 'height'],
      });
      assert.equal(got.body, ADWAITA.dark.view, 'view background');
      // The content-side headerbar is flat — same colour as the view below it,
      // which is what makes it read as one merged GNOME headerbar.
      assert.equal(got.header, ADWAITA.dark.view, 'content headerbar must be flat');
      assert.equal(got.sidebar, ADWAITA.dark.sidebar, 'sidebar is the lighter surface');
      assert.ok(Math.abs(parseFloat(got.headerHeight) - 47) < 1, `headerbar ~47px, got ${got.headerHeight}`);
    },
  },

  {
    name: 'light surfaces invert correctly (sidebar darker than view)',
    async run({ cdp, applyTheme, setMode, session }) {
      await setMode(session, 'light');
      await applyTheme(session, 'light');
      const got = await probe(cdp, {
        body: ['body', 'backgroundColor'],
        sidebar: ['.left-sidebar-inner', 'backgroundColor'],
      });
      assert.equal(got.body, ADWAITA.light.view);
      // On light the sidebar is *darker* than the view, the reverse of dark —
      // anything that assumed "sidebar = lighter" comes out inverted here.
      assert.equal(got.sidebar, ADWAITA.light.sidebar);
      await setMode(session, 'dark');
      await applyTheme(session, 'dark');
    },
  },

  {
    name: 'accent precedence: Logseq’s shipped default yields, a chosen accent wins',
    async run({ cdp }) {
      const results = await cdp.evaluateJson(`(() => {
        const html = document.documentElement;
        const host = document.querySelector('.dark-theme') || document.body;
        const original = html.dataset.color;
        const out = {};
        for (const value of ['logseq', '', 'purple', 'orange']) {
          if (value === '') delete html.dataset.color; else html.dataset.color = value;
          const probe = document.createElement('div');
          host.appendChild(probe);
          probe.style.color = 'var(--adw-accent)';
          const accent = getComputedStyle(probe).color;
          probe.style.color = 'var(--lx-gray-03)';
          const surface = getComputedStyle(probe).color;
          probe.remove();
          out[value || 'unset'] = { accent, surface };
        }
        if (original === undefined) delete html.dataset.color; else html.dataset.color = original;
        return JSON.stringify(out);
      })()`);

      // Logseq ships data-color="logseq" already set, so treating it as a
      // choice made the plugin's accent setting inert; treating every
      // data-color as intentless made Logseq's own picker inert. Both halves:
      const adwaitaBlue = results.logseq.accent;
      assert.equal(results.unset.accent, adwaitaBlue, 'unset and the shipped default must agree');
      assert.notEqual(results.purple.accent, adwaitaBlue, 'a chosen purple must win');
      assert.notEqual(results.orange.accent, adwaitaBlue, 'a chosen orange must win');

      // Whatever the accent, surfaces stay Adwaita — Logseq re-tints its whole
      // neutral ramp with the accent, which turned reference cards warm brown.
      const surfaces = new Set(Object.values(results).map((r) => r.surface));
      assert.equal(surfaces.size, 1, `surfaces must not follow the accent, saw ${[...surfaces].join(' / ')}`);
    },
  },

  {
    name: 'the search dialog carries no accent-coloured edges',
    needs: ['graph'],
    async run({ cdp }) {
      await cdp.evaluate(`(() => {
        const b = document.getElementById('search-button');
        if (b) { b.click(); return true; }
        return false;
      })()`);
      await new Promise((r) => setTimeout(r, 1500));

      const got = await probe(cdp, {
        cmdk: ['.cp__cmdk', 'borderTopColor'],
        panel: ['.ui__modal-panel', 'borderTopColor'],
        hints: ['.cp__cmdk > .hints', 'borderTopColor'],
        html: [':root', 'backgroundColor'],
        inputOutline: ['.cp__cmdk input', 'outlineStyle'],
      });

      // Logseq's solarized palette paints these from --lx-accent-01 (#004152)
      // at a specificity the theme has to tie deliberately.
      for (const [key, value] of Object.entries(got)) {
        if (key === 'inputOutline' || value === '(missing)') continue;
        const rgb = parseRgb(value);
        if (!rgb) continue;
        const [r, g, b] = rgb.rgb.map((c) => c * 255);
        assert.ok(
          !(b > r + 12 && g > r + 10 && r < 110),
          `${key} is a solarized teal (${value}) — the [data-color] tie was lost`
        );
      }
      // The field is flush with the dialog's top edge, so its focus ring drew
      // over the panel's rounded corner and read as a coloured hairline.
      if (got.inputOutline !== '(missing)') {
        assert.equal(got.inputOutline, 'none', 'the cmdk field must not draw a focus ring');
      }
      await cdp.evaluate(`(() => { document.querySelector('.cp__cmdk') && document.body.click(); return true; })()`);
    },
  },

  {
    name: 'sidebar dividers match GNOME Files: 1px, inset to the row highlights',
    needs: ['graph'],
    async run({ cdp }) {
      const got = await cdp.evaluateJson(`(() => {
        const menu = document.getElementById('left-menu');
        if (menu && !document.querySelector('.ls-left-sidebar-open')) menu.click();
        return new Promise((resolve) => setTimeout(() => {
          const side = document.getElementById('left-sidebar');
          const items = [...document.querySelectorAll('#left-sidebar .nav-content-item')];
          const pill = document.querySelector('#left-sidebar .left-sidebar-inner a.item');
          const sideRect = side ? side.getBoundingClientRect() : null;
          resolve(JSON.stringify({
            sidebarWidth: sideRect ? Math.round(sideRect.width) : null,
            pillInset: pill && sideRect ? Math.round(pill.getBoundingClientRect().x - sideRect.x) : null,
            declaredInset: side ? getComputedStyle(side).getPropertyValue('--adw-sidebar-divider-inset').trim() : null,
            dividers: items.map((el) => {
              const cs = getComputedStyle(el);
              return {
                image: cs.backgroundImage.slice(0, 40),
                position: cs.backgroundPosition,
                size: cs.backgroundSize,
                borderTopWidth: cs.borderTopWidth,
              };
            }),
          }));
        }, 1200));
      })()`);

      assert.ok(got.dividers.length > 0, 'no .nav-content-item sections found');
      const painted = got.dividers.filter((d) => d.image !== 'none');
      assert.ok(painted.length > 0, 'no section paints a divider');

      const declared = parseFloat(got.declaredInset);
      for (const d of painted) {
        assert.match(d.image, /linear-gradient/, 'divider is drawn as a gradient, not a border');
        assert.ok(d.size.includes('1px'), `divider must be 1px tall, got ${d.size}`);
        // A border would span the full box; Files insets its divider instead.
        // The invariant the theme controls is that the painted inset equals the
        // declared token — NOT that it matches the row pills, because the pill
        // inset depends on which plugins are loaded (22px stock, 14px with
        // logseq-awesome-ui restyling the sidebar).
        assert.ok(
          Math.abs(parseFloat(d.position) - declared) <= 1,
          `divider painted at ${d.position} but the token declares ${got.declaredInset}`
        );
        assert.equal(parseFloat(d.borderTopWidth), 0, 'the plugin-drawn full-width border must be cleared');
      }
    },
  },

  {
    name: 'accent text clears AA against the live surfaces',
    async run({ cdp }) {
      const got = await cdp.evaluateJson(`(() => {
        const host = document.querySelector('.dark-theme') || document.body;
        const probe = document.createElement('div');
        host.appendChild(probe);
        const read = (v) => { probe.style.color = v; return getComputedStyle(probe).color; };
        const out = { accent: read('var(--adw-accent)'), view: read('var(--adw-view-bg)'), sidebar: read('var(--adw-sidebar-bg)') };
        probe.remove();
        return JSON.stringify(out);
      })()`);
      // --adw-accent computes to oklab() here: it is derived with relative
      // colour syntax, which Chromium does not flatten to rgb().
      const rgb = (v) => parseColor(v)?.rgb;
      for (const surface of ['view', 'sidebar']) {
        const ratio = contrastRatio(rgb(got.accent), rgb(got[surface]));
        assert.ok(ratio >= 4.5, `accent on ${surface}: ${ratio.toFixed(2)}:1 (AA needs 4.5)`);
      }
    },
  },
];
