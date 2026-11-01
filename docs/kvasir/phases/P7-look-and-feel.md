# P7: Look and feel

## Goal

Kvasir looks like a finished product and fits the way each person likes to read. It gets its own symbol, a light mode beside the dark one, and colour themes users can pick. Every screen gets a polish pass. Later phases (P3 voice, P4 mobile, P5 sharing) are built on the new look (D121).

## Where it stands today

- Dark only. `app/layout.tsx` sets `<html class="dark">`; Settings > Appearance shows "Mode: Coming soon".
- Appearance settings apply as CSS variables at runtime (`components/settings/appearance.tsx`): background, reading font and size, heading weight, and bold and italic colours.
- `app/globals.css` holds the palette tokens.
- The symbol is the upstream mark: `build/icon.icon` (macOS), `build/icon.icns`, `build/icon.ico`, `build/icon.png`, `build/icon-flat.svg`, and the in-app glyph (`components/ui/glyph-mark.tsx`).

## Read first

- `components/settings/appearance.tsx` and `components/settings/appearance-section.tsx`
- `app/globals.css` (tokens)
- `components/graph-canvas.ts` (the canvas draws with its own colours, including `HEAT_COLORS`)
- `docs/kvasir/PRODUCT.md`
- `electron-builder.yml` (icon paths) and `docs/kvasir/WORKFLOW.md` (the Icon Composer build needs Xcode 26 in CI)

## Open decisions

Each task asks its own questions at its start. These are known now:

1. **Symbol direction.** The name comes from Kvasir, the wisest being in Norse myth, whose blood became the mead of poetry. The task shows a small set of directions as drawings before any is chosen.
2. **Colour themes.** How many presets, and how far customising goes: accent only, accent plus surfaces, or a full palette.
3. **Light mode.** Whether it follows the system setting by default.
4. **Polish pass scope.** Which screens first, and what "done" means for each.

## Tasks

| ID | Branch | Scope | Done when |
|---|---|---|---|
| P7-1 | `p7/theme-tokens` | Move every colour in the app and the graph canvas onto named tokens, so a theme can change them in one place. No visible change | No hard-coded colour remains outside the token files; screenshots before and after match |
| P7-2 | `p7/light-mode` | A light palette and the Mode setting (light, dark, follow the system) | Every screen reads well in both modes; Sagar approves screenshots |
| P7-3 | `p7/color-themes` | Colour theme presets and custom colours in Settings > Appearance, applied live, the canvas included | Switching a theme restyles the whole app at once and survives a restart |
| P7-4 | `p7/app-symbol` | A new Kvasir symbol: the mark, the macOS icon, the Windows and Linux icons, the favicon and the in-app glyph | Sagar approves the symbol; every build shows it |
| P7-5 | `p7/polish-pass` | A screen-by-screen pass over spacing, type, empty states and small motion, from a list Sagar approves | Every listed screen is done and approved in screenshots |

## Gate acceptance checks

Each task's "Done when" column. The phase gate passes when all five are merged (D119: the gate blocks no other phase).

## Gate results

(record here)
