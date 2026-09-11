#!/usr/bin/env bash
# Prove the regression suite is not vacuous.
#
# A test that has never been seen failing proves nothing. Every assertion here
# was written after the bug it describes was already fixed, so the usual
# red-then-green order was impossible — this script reconstructs the red half:
# it puts the pre-fix code back and asserts the matching test FAILS.
#
# Two mechanisms:
#   history  — check out the stylesheet as it was before the fix (git show)
#   mutation — reintroduce the old behaviour in a scratch copy of the tree
#
# Usage: ./scripts/redcheck.sh
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

pass=0
fail=0

# Run one test file and require it to fail. Anything else is a broken check.
#   expect_red <label> <test-file> [tree] [theme-css]
# `env` rather than a VAR=value prefix: prefixing a *function* call leaves the
# variable set in the shell afterwards, which would leak into later cases.
expect_red() {
  local label="$1"
  local test_file="$2"
  local tree="${3:-$REPO}"
  local theme_css="${4:-}"
  if (cd "$tree" && env ${theme_css:+THEME_CSS="$theme_css"} node --test "$test_file" >"$WORK/out.txt" 2>&1); then
    printf '  \033[31mNOT RED\033[0m  %s\n' "$label"
    printf '            %s passed against the pre-fix code — it does not detect this bug\n' "$test_file"
    fail=$((fail + 1))
  else
    local detail
    detail="$(grep -m1 -E "AssertionError|Error:" "$WORK/out.txt" | sed 's/^ *//' | cut -c1-96 || true)"
    printf '  \033[32mred\033[0m      %s\n' "$label"
    [ -n "$detail" ] && printf '            %s\n' "$detail"
    pass=$((pass + 1))
  fi
}

# A scratch copy of the tree that a mutation can be applied to.
scratch_tree() {
  # Separate declarations on purpose: `local a=$1 b=$WORK/$a` expands $a in the
  # *outer* scope, because local's arguments are expanded before it assigns.
  local name="$1"
  local dest="$WORK/$name"
  mkdir -p "$dest"
  # node_modules is needed for the esbuild import in build.mjs; symlink it.
  (cd "$REPO" && tar -c --exclude=node_modules --exclude=.git . ) | tar -x -C "$dest"
  ln -s "$REPO/node_modules" "$dest/node_modules"
  echo "$dest"
}

echo "== history: the stylesheet as it was before each fix =="

git -C "$REPO" show e58b5b8^:themes/adwaita.css > "$WORK/pre-leaks.css"
expect_red "solarized variables leaking (--ls-guideline-color and 7 siblings)" \
  tests/static/coverage.test.mjs "$REPO" "$WORK/pre-leaks.css"

git -C "$REPO" show 51a783b^:themes/adwaita.css > "$WORK/pre-dividers.css"
expect_red "sidebar dividers before they were modelled on GNOME Files" \
  tests/static/sidebar.test.mjs "$REPO" "$WORK/pre-dividers.css"

echo
echo "== mutation: the old behaviour put back into a scratch tree =="

# 1. The accent setting was inert: it never overrode Logseq's shipped default.
t="$(scratch_tree inert-accent)"
python3 - "$t" <<'PY'
import sys, pathlib
p = pathlib.Path(sys.argv[1], 'src/settings-css.ts')
s = p.read_text()
s = s.replace("""    const intentless = ['', 'none', 'logseq'].map(""", """    const intentless = [''].map(""")
s = s.replace("""    intentless.push('html[data-theme]:not([data-color]) :is(.dark-theme, .light-theme)');""", "")
p.write_text(s)
PY
expect_red "accent setting inert (never beats Logseq's shipped data-color=logseq)" \
  tests/static/settings.test.mjs "$t"

# 2. The over-correction: overriding every accent made Logseq's picker inert.
t="$(scratch_tree greedy-accent)"
python3 - "$t" <<'PY'
import sys, pathlib
p = pathlib.Path(sys.argv[1], 'src/settings-css.ts')
s = p.read_text()
s = s.replace("""    const intentless = ['', 'none', 'logseq'].map(""",
              """    const intentless = ['', 'none', 'logseq', 'purple', 'orange', 'teal'].map(""")
p.write_text(s)
PY
expect_red "accent override too greedy (a deliberately chosen accent stops winning)" \
  tests/static/settings.test.mjs "$t"

# 3. An accent too dark to read on the dark surfaces.
t="$(scratch_tree bad-contrast)"
sed -i 's/--adw-accent-l:            0.763;/--adw-accent-l:            0.35;/' "$t/src/css/10-tokens-dark.css"
expect_red "accent lightness dropped below the AA floor" \
  tests/static/contrast.test.mjs "$t"

# 4. A literal colour in the structure sheet, which cannot follow the scheme.
t="$(scratch_tree literal-colour)"
printf '\nhtml[data-theme] .canary { color: #ff00ff; }\n' >> "$t/src/css/30-structure.css"
expect_red "a literal colour hard-coded into the structure sheet" \
  tests/static/tokens.test.mjs "$t"

# 5. A source edit that was never rebuilt — the stale-build trap.
t="$(scratch_tree stale-build)"
printf '\n/* edited but not rebuilt */\n' >> "$t/src/css/20-mappings.css"
expect_red "src/css edited without rebuilding themes/adwaita.css" \
  tests/static/build-fresh.test.mjs "$t"

# 6. The cmdk focus ring that bled over the dialog's rounded corner.
t="$(scratch_tree cmdk-ring)"
python3 - "$t" <<'PY'
import sys, pathlib, re
p = pathlib.Path(sys.argv[1], 'src/css/30-structure.css')
s = p.read_text()
s = re.sub(r"html\[data-theme\] \.cp__cmdk input:focus-visible \{\n  outline: none;\n\}\n", "", s)
p.write_text(s)
PY
(cd "$t" && node build.mjs >/dev/null 2>&1)
expect_red "cmdk search field keeps the focus ring that drew over the panel corner" \
  tests/static/tokens.test.mjs "$t"

# 7. Settings relying on load order: lost whenever the theme link lands after them.
t="$(scratch_tree override-order)"
sed -i 's/ !important;/;/g' "$t/src/settings-css.ts"
expect_red "settings overrides lose to the theme sheet once it is (re)selected" \
  tests/static/override-order.test.mjs "$t"

# 8. Logseq 2.x shadowing the sidebar variable, turning section headers dark.
t="$(scratch_tree sidebar-shadow)"
python3 - "$t" <<'PY2'
import sys, pathlib, re
p = pathlib.Path(sys.argv[1], 'src/css/20-mappings.css')
s = p.read_text()
s = re.sub(r"html\[data-theme\] main\.theme-container-inner \{\n  --left-sidebar-bg-color: var\(--adw-sidebar-bg\);\n\}\n", "", s)
p.write_text(s)
PY2
(cd "$t" && node build.mjs >/dev/null 2>&1)
expect_red "Logseq 2.x shadows --left-sidebar-bg-color, darkening section headers" \
  tests/static/sidebar.test.mjs "$t"

# 9. The subtle accent steps left teal, tinting ghost-button hovers and borders.
t="$(scratch_tree chrome-accent)"
sed -i '/--lx-accent-01: var(--adw-hover);/d; /--lx-accent-02: var(--adw-border-soft);/d' "$t/src/css/25-accent.css"
(cd "$t" && node build.mjs >/dev/null 2>&1)
expect_red "accent steps 01-02 left teal in hover and border chrome" \
  tests/static/coverage.test.mjs "$t"

# 10. Task markers left at Logseq's opacity .7, which takes every accent below AA.
t="$(scratch_tree marker-dimmed)"
python3 - "$t" <<'PY'
import sys, pathlib
p = pathlib.Path(sys.argv[1], 'src/css/30-structure.css')
s = p.read_text()
old = "html[data-theme] .block-marker {\n  color: var(--adw-accent);\n  opacity: 1;\n}"
assert old in s, 'marker rule not found — update this mutation'
p.write_text(s.replace(old, "html[data-theme] .block-marker {\n  color: var(--adw-accent);\n}"))
PY
(cd "$t" && node build.mjs >/dev/null 2>&1)
expect_red "task markers dimmed to Logseq's opacity .7 (below AA)" \
  tests/static/contrast.test.mjs "$t"

# 11. Task markers painted in something other than the accent (they were orange).
t="$(scratch_tree marker-colour)"
sed -i 's/^  color: var(--adw-accent);$/  color: var(--adw-fg);/' "$t/src/css/30-structure.css"
(cd "$t" && node build.mjs >/dev/null 2>&1)
expect_red "task markers not painted in the accent" \
  tests/static/contrast.test.mjs "$t"

# 12. Light inline code clamped like accent text (0.5): fine on the view, 4.22:1
#     on the fill over the sidebar.
t="$(scratch_tree code-clamp)"
sed -i 's/^  --adw-code-oklab:     min(l, 0.48) a b;$/  --adw-code-oklab:     min(l, 0.5) a b;/' "$t/src/css/15-tokens-light.css"
grep -q 'min(l, 0.5) a b;' "$t/src/css/15-tokens-light.css" || { echo "mutation 12 did not apply"; exit 1; }
expect_red "light inline-code violet at the accent clamp, below AA on the sidebar's fill" \
  tests/static/contrast.test.mjs "$t"

# 13. A code token left to Logseq's solarized theme.
t="$(scratch_tree code-token)"
python3 - "$t" <<'PY'
import sys, pathlib, re
p = pathlib.Path(sys.argv[1], 'src/css/27-text.css')
s = p.read_text()
s2 = re.sub(r"html\[data-theme\] \.CodeMirror \.cm-keyword \{[^}]*\}\n", "", s)
assert s2 != s, 'keyword rule not found — update this mutation'
p.write_text(s2)
PY
(cd "$t" && node build.mjs >/dev/null 2>&1)
expect_red "code keywords left solarized orange-red" \
  tests/static/text.test.mjs "$t"

# 14. Inline code driven only through --ls-page-inline-code-color, which
#     Logseq's rule never reads (it takes --lx-gray-11 first).
t="$(scratch_tree inline-code)"
python3 - "$t" <<'PY'
import sys, pathlib, re
p = pathlib.Path(sys.argv[1], 'src/css/27-text.css')
s = p.read_text()
s2 = re.sub(r"html\[data-theme\] :not\(pre\) > code \{[^}]*\}\n", "", s)
assert s2 != s, 'inline code rule not found — update this mutation'
p.write_text(s2)
PY
(cd "$t" && node build.mjs >/dev/null 2>&1)
expect_red "inline code colour set only through a variable Logseq ignores" \
  tests/static/text.test.mjs "$t"

# 15. Back/Forward left where Logseq puts them, near the end of the header.
t="$(scratch_tree nav-order)"
python3 - "$t" <<'PY'
import sys, pathlib, re
p = pathlib.Path(sys.argv[1], 'src/css/30-structure.css')
s = p.read_text()
s2 = re.sub(r"html\[data-theme\] #head \.r > div:has\(\.navigation\) \{[^}]*\}\n", "", s)
assert s2 != s, 'nav order rule not found — update this mutation'
p.write_text(s2)
PY
(cd "$t" && node build.mjs >/dev/null 2>&1)
expect_red "Back/Forward not leading the content header" \
  tests/static/headerbar.test.mjs "$t"

# 16. The section divider drawn on the graph dropdown, right under the header.
t="$(scratch_tree repos-divider)"
printf '\nhtml[data-theme] #left-sidebar .cp__menubar-repos > .ui__dropdown-trigger { background-image: linear-gradient(var(--adw-border), var(--adw-border)); }\n' >> "$t/src/css/30-structure.css"
(cd "$t" && node build.mjs >/dev/null 2>&1)
expect_red "a divider above the graph dropdown, directly under the header" \
  tests/static/sidebar.test.mjs "$t"

# 17. The docked placements unscoped: below 640px they land on the overlay sidebar.
t="$(scratch_tree docked-scope)"
python3 - "$t" <<'PY'
import sys, pathlib
p = pathlib.Path(sys.argv[1], 'src/css/30-structure.css')
s = p.read_text()
start = s.index('@media (min-width: 640px) {')
end = s.index('\n}\n', start)
inner = s[start + len('@media (min-width: 640px) {'):end]
p.write_text(s[:start] + inner + s[end + 3:])
PY
(cd "$t" && node build.mjs >/dev/null 2>&1)
expect_red "open-sidebar placements applied below Logseq's 640px docking breakpoint" \
  tests/static/headerbar.test.mjs "$t"

# 18. The moved sidebar toggle under .r's layer: clickable by script, dead to the mouse.
t="$(scratch_tree toggle-stacking)"
python3 - "$t" <<'PY'
import sys, pathlib, re
p = pathlib.Path(sys.argv[1], 'src/css/30-structure.css')
s = p.read_text()
s2 = re.sub(r"\n    transform: none;\n", "\n", s, count=1)
assert s2 != s, '.l transform override not found — update this mutation'
p.write_text(s2)
PY
(cd "$t" && node build.mjs >/dev/null 2>&1)
expect_red "sidebar toggle stacked under .r, so a real click cannot reach it" \
  tests/static/headerbar.test.mjs "$t"

# 19. Room reserved for window controls that sit over the open right sidebar.
t="$(scratch_tree wc-reservation)"
printf '\nhtml[data-theme] .ls-window-controls.ls-right-sidebar-open .cp__header > .r { margin-right: var(--adw-wc-width); }\n' >> "$t/src/css/30-structure.css"
(cd "$t" && node build.mjs >/dev/null 2>&1)
expect_red "header reserves window-control room with the right sidebar open (the ~100px gap)" \
  tests/static/headerbar.test.mjs "$t"

# 20. The main menu jumping to the far end of the bar when the sidebar closes.
t="$(scratch_tree menu-jumps)"
python3 - "$t" <<'PY2'
import sys, pathlib, re
p = pathlib.Path(sys.argv[1], 'src/css/30-structure.css')
s = p.read_text()
start = s.find("html[data-theme] main:not(.ls-left-sidebar-open) #head")
assert start != -1, 'menu hide rule not found — update this mutation'
end = s.index("}\n", start) + 2
s2 = s[:start] + s[end:]
p.write_text(s2)
PY2
(cd "$t" && node build.mjs >/dev/null 2>&1)
expect_red "main menu moves to the content header when the sidebar closes" \
  tests/static/headerbar.test.mjs "$t"

# 21. Logseq 2.x: its one control group left packed — the right-sidebar toggle
#     then rides at the start of the bar with Back/Forward.
t="$(scratch_tree db-group)"
python3 - "$t" <<'PY2'
import sys, pathlib, re
p = pathlib.Path(sys.argv[1], 'src/css/30-structure.css')
s = p.read_text()
s2 = re.sub(r"html\[data-theme\] #head \.r > div:has\(> \.toggle-right-sidebar\) \{\n  display: contents;\n\}\n", "", s)
assert s2 != s, '2.x group rule not found — update this mutation'
p.write_text(s2)
PY2
(cd "$t" && node build.mjs >/dev/null 2>&1)
expect_red "Logseq 2.x control group not unpacked" \
  tests/static/headerbar.test.mjs "$t"

# 22. Logseq 2.x: content-box ghost buttons padded out to 52x42.
t="$(scratch_tree db-button-size)"
python3 - "$t" <<'PY2'
import sys, pathlib, re
p = pathlib.Path(sys.argv[1], 'src/css/30-structure.css')
s = p.read_text()
s2 = re.sub(r"html\[data-theme\] \.cp__header \.ui__button\.as-ghost:has\(> \.ui__icon:only-child\) \{[^}]*\}\n", "", s)
assert s2 != s, '2.x icon-button sizing rule not found — update this mutation'
p.write_text(s2)
PY2
(cd "$t" && node build.mjs >/dev/null 2>&1)
expect_red "Logseq 2.x header icon buttons 52x42, not 32x32" \
  tests/static/headerbar.test.mjs "$t"

echo
printf '%s\n' "-----------------------------------------------"
printf 'red as expected: %d   failed to detect: %d\n' "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1
