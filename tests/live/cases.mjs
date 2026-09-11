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
import { STARTUP_SETTINGS } from '../lib/scratch.mjs';
import { TEXT_COLOURS } from '../../src/settings-css.ts';

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
        `Boolean(document.querySelector('style[data-injected-style="adwaita-settings-gnome-adwaita-theme"]'))`,
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
    name: 'sidebar section headers share the sidebar background',
    async run({ cdp }) {
      const got = await cdp.evaluateJson(`(() => {
        const menu = document.getElementById('left-menu');
        if (menu && !document.querySelector('.ls-left-sidebar-open')) menu.click();
        return new Promise((resolve) => setTimeout(() => {
          const inner = document.querySelector('#left-sidebar .left-sidebar-inner');
          const headers = [...document.querySelectorAll('#left-sidebar .hd, #left-sidebar .nav-content-item .header')];
          resolve(JSON.stringify({
            sidebar: inner ? getComputedStyle(inner).backgroundColor : null,
            headers: headers.map((h) => ({ text: (h.innerText || '').trim().slice(0, 20), bg: getComputedStyle(h).backgroundColor })),
          }));
        }, 1000));
      })()`);
      // Nothing rendered means nothing proven — say so instead of passing.
      if (!got.headers.length) return { skipped: 'no sidebar section headers rendered on this build' };

      // Logseq 2.x redeclares --left-sidebar-bg-color on an element between
      // <html> and the sidebar, and its headers paint from that variable — so
      // they came out as darker blocks. A header may be transparent or match
      // the sidebar; anything else reads as a non-native box.
      const off = got.headers.filter(
        (h) => h.bg !== 'rgba(0, 0, 0, 0)' && h.bg !== 'transparent' && h.bg !== got.sidebar
      );
      assert.deepEqual(
        off,
        [],
        `section headers painted differently from the sidebar (${got.sidebar}):\n` +
          off.map((h) => `  "${h.text}": ${h.bg}`).join('\n')
      );
    },
  },

  {
    name: 'ghost and header buttons hover grey, never accent-tinted',
    async run({ cdp }) {
      // Logseq's teal hover rule is
      //   html[data-theme=dark][data-color=logseq] .ui__button.as-ghost:hover
      // and 2.x only renders its header actions as .as-ghost with a graph
      // open, which a fresh profile does not have. So add one synthetic ghost
      // button carrying the real classes: the rule does not care where it sits,
      // and what is under test is the theme's cascade against Logseq's own CSS,
      // not Logseq's DOM. Real buttons are checked too, whenever present.
      await cdp.evaluate(`(() => {
        const b = document.createElement('button');
        b.className = 'ui__button as-ghost';
        b.dataset.button = 'icon';
        b.id = 'adwaita-test-ghost';
        (document.querySelector('.cp__header') || document.body).appendChild(b);
        return true;
      })()`);
      try {
        const doc = await cdp.call('DOM.getDocument', { depth: -1 });
        await cdp.call('CSS.enable');
        const { nodeIds } = await cdp.call('DOM.querySelectorAll', {
          nodeId: doc.root.nodeId,
          selector: '.ui__button.as-ghost, .cp__header .ui__button, .cp__header .button',
        });

        const hoverBg = async (nodeId) => {
          await cdp.call('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: ['hover'] });
          // Reading the computed style straight after forcing :hover can
          // return the pre-hover value — observed: 'transparent' for a button
          // whose hover is white 6%. Matching styles forces the recalc first.
          await cdp.call('CSS.getMatchedStylesForNode', { nodeId });
          const { computedStyle } = await cdp.call('CSS.getComputedStyleForNode', { nodeId });
          await cdp.call('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] });
          return computedStyle.find((p) => p.name === 'background-color')?.value ?? '';
        };

        const tinted = [];
        for (const nodeId of nodeIds) {
          const bg = await hoverBg(nodeId);
          const m = /rgba?\((\d+), (\d+), (\d+)/.exec(bg);
          // --lx-accent-01 in the solarized palette is a teal: blue and green
          // well above red. A GNOME flat button hovers neutral.
          if (m && +m[3] > +m[1] + 12 && +m[2] > +m[1] + 10) tinted.push(bg);
        }
        assert.ok(nodeIds.length > 0, 'no buttons checked — the synthetic ghost failed to insert');
        assert.deepEqual(tinted, [], `buttons hover accent-tinted: ${[...new Set(tinted)].join(', ')}`);

        // "Not teal" is not the whole requirement — a ghost button should
        // hover to the Adwaita hover grey, not to nothing.
        const { nodeId: ghostId } = await cdp.call('DOM.querySelector', {
          nodeId: doc.root.nodeId,
          selector: '#adwaita-test-ghost',
        });
        const expected = await cdp.evaluate(`(() => {
          const p = document.createElement('div');
          document.body.appendChild(p);
          p.style.backgroundColor = 'var(--adw-hover)';
          const v = getComputedStyle(p).backgroundColor;
          p.remove();
          return v;
        })()`);
        assert.equal(await hoverBg(ghostId), expected, 'a ghost button must hover to --adw-hover');
      } finally {
        await cdp.evaluate(`(() => { document.getElementById('adwaita-test-ghost')?.remove(); return true; })()`);
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

  {
    // Last on purpose: it creates a page and navigates to it. It needs no
    // seeded graph — the API writes into whatever graph is open, demo included.
    name: 'task markers are accent text at full opacity, and hover to the accent hover',
    async run({ cdp, target }) {
      const page = 'adwaita task markers';
      const markers = ['TODO', 'DOING', 'LATER', 'NOW', 'WAITING'];
      // Logseq only re-renders on animation frames, and a window the
      // compositor is not painting — screen locked, window hidden — gets none:
      // the page would never appear. Nothing can be checked then.
      const painting = await cdp.evaluate(
        `new Promise((r) => { requestAnimationFrame(() => r(true)); setTimeout(() => r(false), 2000); })`
      );
      if (!painting) return { skipped: 'the window is not painting frames (screen locked or window hidden)' };
      await cdp.evaluate(`(async () => {
        const api = window.logseq.api;
        await api.create_page(${JSON.stringify(page)}, {}, { redirect: true, createFirstBlock: false });
        for (const m of ${JSON.stringify(markers)}) await api.append_block_in_page(${JSON.stringify(page)}, m + ' task');
        return true;
      })()`);
      try {
        await waitFor(cdp, `document.querySelectorAll('.block-content .block-marker').length >= ${markers.length}`, {
          label: 'the task blocks to render',
          timeoutMs: 15000,
        });
      } catch (err) {
        // OG is known to render .block-marker, so none there is a failure.
        // Another build may mark tasks up differently: say so, never pass.
        if (target.id === 'og') throw err;
        return { skipped: 'no .block-marker rendered — this build marks tasks up differently' };
      }

      const got = await cdp.evaluateJson(`(() => {
        const host = document.querySelector('.dark-theme') || document.body;
        const probe = document.createElement('div');
        host.appendChild(probe);
        const read = (v) => { probe.style.color = v; return getComputedStyle(probe).color; };
        const tokens = { accent: read('var(--adw-accent)'), hover: read('var(--adw-accent-hover)') };
        probe.remove();
        const markers = [...document.querySelectorAll('.block-content .block-marker')].map((el) => ({
          text: el.textContent.trim(), color: getComputedStyle(el).color, opacity: getComputedStyle(el).opacity,
        }));
        return JSON.stringify({ tokens, markers });
      })()`);
      for (const m of got.markers) {
        assert.equal(m.color, got.tokens.accent, `${m.text} marker colour`);
        assert.equal(m.opacity, '1', `${m.text} marker must not be dimmed (Logseq's .7 fails AA)`);
      }

      // The switchable ones are links; the theme's rule outranks Logseq's own
      // hover, so force :hover and check the cue survived.
      await cdp.call('DOM.enable');
      await cdp.call('CSS.enable');
      const { root } = await cdp.call('DOM.getDocument', { depth: 0 });
      const { nodeId } = await cdp.call('DOM.querySelector', { nodeId: root.nodeId, selector: '.block-content .marker-switch' });
      assert.ok(nodeId, 'no switchable (.marker-switch) marker rendered');
      await cdp.call('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: ['hover'] });
      // Logseq transitions link colour, so a read straight after forcing
      // :hover lands mid-fade. Wait for two equal reads, then assert exactly.
      let hovered;
      try {
        let previous;
        for (const deadline = Date.now() + 3000; Date.now() < deadline; previous = hovered) {
          await new Promise((r) => setTimeout(r, 100));
          hovered = await cdp.evaluate(`getComputedStyle(document.querySelector('.block-content .marker-switch')).color`);
          if (hovered === previous) break;
        }
      } finally {
        await cdp.call('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] });
      }
      assert.equal(hovered, got.tokens.hover, 'hovered marker colour');
    },
  },

  {
    // Creates a page and navigates, like the task-marker case above.
    name: 'text colours: code blocks, highlights and prose follow the Adwaita scheme',
    async run({ cdp, target }) {
      const page = 'adwaita text colours';
      const fence = '`'.repeat(3);
      const blocks = [
        '## A heading',
        'inline `code` and ==marked== text',
        '> a quote',
        `${fence}js\nconst x = 42; // note\nfunction f() { return "s"; }\n${fence}`,
      ];
      const painting = await cdp.evaluate(
        `new Promise((r) => { requestAnimationFrame(() => r(true)); setTimeout(() => r(false), 2000); })`
      );
      if (!painting) return { skipped: 'the window is not painting frames (screen locked or window hidden)' };
      await cdp.evaluate(`(async () => {
        const api = window.logseq.api;
        await api.create_page(${JSON.stringify(page)}, {}, { redirect: true, createFirstBlock: false });
        for (const b of ${JSON.stringify(blocks)}) await api.append_block_in_page(${JSON.stringify(page)}, b);
        return true;
      })()`);
      // OG often leaves the last block appended this way unrendered — an empty
      // .ls-block with no content — until the page renders again; scrolling it
      // into view does not help. Measured: the code block failed to appear in 9
      // of 10 sessions without this round trip, 0 of 3 with it. A precondition
      // for having something to measure, not a retried assertion.
      await new Promise((r) => setTimeout(r, 1500));
      await cdp.evaluate(`location.hash = '#/all-pages'; true`);
      await new Promise((r) => setTimeout(r, 1500));
      await cdp.evaluate(`location.hash = ${JSON.stringify('#/page/' + encodeURIComponent(page))}; true`);
      try {
        await waitFor(cdp, `Boolean(document.querySelector('.CodeMirror .cm-keyword'))`, {
          label: 'the code block to render',
          timeoutMs: 15000,
        });
      } catch (err) {
        if (target.id === 'og') throw err;
        return { skipped: 'no CodeMirror code block rendered — this build marks code up differently' };
      }

      const got = await cdp.evaluateJson(`(() => {
        const host = document.querySelector('.dark-theme, .light-theme') || document.body;
        const probe = document.createElement('div');
        host.appendChild(probe);
        const fg = (v) => { probe.style.color = v; return getComputedStyle(probe).color; };
        const bg = (v) => { probe.style.backgroundColor = v; return getComputedStyle(probe).backgroundColor; };
        const tokens = {
          teal: fg('var(--adw-text-teal)'), violet: fg('var(--adw-text-violet)'), orange: fg('var(--adw-text-orange)'),
          blue: fg('var(--adw-text-blue)'), grey: fg('var(--adw-text-grey)'), gray11: fg('var(--adw-gray-11)'),
          gray02: bg('var(--adw-gray-02)'), markFg: fg('var(--adw-mark-fg)'), markBg: bg('var(--adw-mark-bg)'),
          fg: fg('var(--adw-fg)'),
        };
        probe.remove();
        const el = (sel) => document.querySelector(sel);
        const cs = (sel) => { const e = el(sel); return e ? getComputedStyle(e) : null; };
        const cm = cs('.CodeMirror');
        return JSON.stringify({
          tokens,
          surface: { bg: cm.backgroundColor, fg: cm.color },
          code: Object.fromEntries(['keyword', 'def', 'number', 'comment', 'string', 'operator'].map((t) => {
            const c = cs('.CodeMirror .cm-' + t);
            return [t, c ? { color: c.color, weight: c.fontWeight } : null];
          })),
          mark: { fg: cs('.ls-block mark')?.color, bg: cs('.ls-block mark')?.backgroundColor },
          heading: cs('.ls-block h2')?.color,
          pageTitle: cs('.ls-page-title h1.title')?.color,
          inlineCode: cs('.ls-block :not(pre) > code')?.color,
          quoteBorder: cs('.ls-block blockquote')?.borderLeftColor,
        });
      })()`);
      const t = got.tokens;

      // The code block is an Adwaita surface, not solarized teal or cream.
      assert.deepEqual(got.surface, { bg: t.gray02, fg: t.gray11 }, 'code block surface');
      const want = { keyword: t.orange, def: t.blue, number: t.violet, comment: t.grey, string: t.teal, operator: t.gray11 };
      for (const [token, colour] of Object.entries(want)) {
        assert.ok(got.code[token], `no .cm-${token} rendered — the sample code changed?`);
        assert.equal(got.code[token].color, colour, `.cm-${token} colour`);
      }
      assert.equal(got.code.keyword.weight, '700', 'keywords are bold, as def:statement is');

      assert.deepEqual(got.mark, { fg: t.markFg, bg: t.markBg }, '==highlight== colours');
      // Page titles (and journal dates, the same h1.title) take Text Editor's
      // body-text grey under either setting.
      assert.equal(got.pageTitle, t.gray11, 'page title');

      // The harness seeds the non-default "Text Editor" choice, so the settings
      // sheet has to beat the theme's quiet defaults for these to pass.
      assert.equal(STARTUP_SETTINGS.textColours, TEXT_COLOURS.textEditor, 'this case assumes the harness seeds "Text Editor"');
      assert.equal(got.heading, t.teal, 'block heading');
      assert.equal(got.inlineCode, t.violet, 'inline code');
      assert.equal(got.quoteBorder, t.grey, 'quote bar');
    },
  },
];
