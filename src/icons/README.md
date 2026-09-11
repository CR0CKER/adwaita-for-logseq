# Vendored Adwaita icons

These are GNOME's own symbolic icons, copied byte-for-byte from the Adwaita icon theme and
used by the theme as CSS masks. `scripts/encode-icons.mjs` inlines them into
`src/css/28-icons.css`; `tests/static/headerbar.test.mjs` fails if the two drift apart.

| File | Used for | GNOME Files uses it for |
|---|---|---|
| `open-menu-symbolic.svg` | Logseq's app menu (was ⋮) | Main Menu, sidebar header |
| `edit-find-symbolic.svg` | Search | Search Everywhere, sidebar header |
| `sidebar-show-symbolic.svg` | Toggle left sidebar | sidebar toggle, content header |
| `sidebar-show-right-symbolic.svg` | Toggle right sidebar | — (the same family, mirrored) |
| `go-previous-symbolic.svg` | Back | Back, content header |
| `go-next-symbolic.svg` | Forward | Forward, content header |

**Source:** `/usr/share/icons/Adwaita/symbolic/actions/`, `adwaita-icon-theme` 49.0
(Fedora 43), <https://gitlab.gnome.org/GNOME/adwaita-icon-theme>.

**Licence:** the Adwaita icon theme is licensed **LGPL-3.0-only OR CC-BY-SA-3.0**
(Copyright © the GNOME Project). They are redistributed here unmodified under those terms;
this licence applies to these files, not to the rest of the repository (MIT).

To update: copy the new files over these, then run `node scripts/encode-icons.mjs` and
`npm run build`.
