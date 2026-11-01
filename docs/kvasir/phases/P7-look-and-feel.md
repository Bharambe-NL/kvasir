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
| P7-1 | No hard-coded colour remains outside the token files; screenshots before and after match | Pass | `tests/no-hardcoded-colors.test.ts` fails `npm test` on any hex, `rgb`, `hsl` or `oklch` literal or Tailwind palette class outside the token files. Screenshots of seven screens compared pixel by pixel: 0 changed pixels except the practice session's Next problem button (listed in the PR) and blur noise behind the Settings backdrop; the canvas tokens resolve to the old constants exactly. Approved by Sagar; merged via #71. |
| P7-2 | `p7/light-mode` | A light palette and the Mode setting (light, dark, follow the system) | Every screen reads well in both modes; Sagar approves screenshots |
| P7-3 | Switching a theme restyles the whole app at once and survives a restart | Pass | In a production build (off-screen Electron window, fresh profile) the theme was changed through Settings with no reload: the page restyled, `settings.json` saved it, and after a server restart the first byte carried `class="dark theme-forest"`. All eight theme and mode pairs were shown to Sagar. `tests/color-themes.test.tsx` checks contrast per theme and mode; Kvasir dark's red on cards (4.46:1) is the one recorded exception. Approved by Sagar; merged via #75. |
| P7-4 | `p7/app-symbol` | A new Kvasir symbol: the mark, the macOS icon, the Windows and Linux icons, the favicon and the in-app glyph | Sagar approves the symbol; every build shows it |
| P7-5 | `p7/polish-pass` | A screen-by-screen pass over spacing, type, empty states and small motion, from a list Sagar approves | Every listed screen is done and approved in screenshots |

## Gate acceptance checks

Each task's "Done when" column. The phase gate passes when all five are merged (D119: the gate blocks no other phase).

## Gate results

Recorded 2026-11-01. Every P7 check is a task's "Done when", and each was shown to Sagar and approved before its PR merged (D122: visible work waits for his approval).

| # | Check | Result | Evidence |
|---|---|---|---|
| P7-1 | No hard-coded colour remains outside the token files; screenshots before and after match | Pass | `tests/no-hardcoded-colors.test.ts` fails `npm test` on any hex, `rgb`, `hsl` or `oklch` literal or Tailwind palette class outside the token files. Screenshots of every screen before and after matched by pixel comparison except six named spots, each explained. Approved by Sagar; merged via #71. |
| P7-2 | Every screen reads well in both modes; Sagar approves screenshots | Pass | Light and dark screenshots of every screen; `tests/light-mode.test.tsx` checks WCAG AA contrast (4.5:1) for every text colour on the background and cards in light mode. Approved by Sagar; merged via #73. |
| P7-3 | Switching a theme restyles the whole app at once and survives a restart | Pass | A live switch in a packaged Electron window recoloured the sidebar, chat, settings and graph canvas in one frame, and the theme held after a relaunch. `tests/color-themes.test.tsx` checks contrast per theme and mode; one known exception, Kvasir dark's red on cards at 4.46:1, is recorded there. Approved by Sagar; merged via #75. |
| P7-4 | Sagar approves the symbol; every build shows it | Pass | Sagar chose the chevron and gold dot (D139) after four rounds. Manual release run 41313271273 built macOS, Windows and Linux: the Linux icon and the Windows installer icon are byte-identical to `build/icon.png` and `build/icon.ico`; the Mac app holds the Icon Composer layers in `Assets.car` and an `icon.icns` identical to `build/icon.icns`. `tests/app-icon.test.tsx` keeps every icon file equal to `src/core/kvasir-mark.ts`. Merged via #77. |
| P7-5 | Every listed screen is done and approved in screenshots | Pass | The four areas of D141 (chat; review; home, graph and sidebar; settings and dialogs) were each sent as before and after sheets in Kvasir dark and light plus a sheet across the four themes (D145), and Sagar approved all four. Merged via #79. |

**Gates on a fresh clone of `main` at `188de96`:** typecheck, lint, build and house style pass. `npm test`: 3369 of 3370 pass. The one failure is "binds 127.0.0.1" in the tool bridge test, which times out on this Mac's network; CI passes it on the same commit.

**Findings for later, not blocking:**

- Kvasir dark's red text on cards is 4.46:1, just under 4.5:1 (P7-3). Fixing it means a slightly lighter red in Kvasir dark.
- Code blocks, tables and diagrams stay inside the 72-character chat column (P7-5). Letting them run wider needs more layout work.
- The symbol was compared with other marks by eye (D139); a professional design-mark search (EUIPO or USPTO) is the real check before wide publication.
