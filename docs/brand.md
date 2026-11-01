# The Kvasir symbol

Kvasir's symbol is a chevron and a round gold dot: a prompt, then the point (Kvasir P7-4, D139). It was chosen after four rounds of drawings.

## Geometry and colours

All of it lives in one file, `src/core/kvasir-mark.ts`. Nothing else holds a copy.

On a 1024 by 1024 canvas, in the design's own frame:

| Part | Shape | Colour |
|---|---|---|
| Squircle | 896 wide, corner radius 200 | #141414 |
| Chevron | through (330, 352), (520, 512) and (330, 672); stroke 100, round caps and joins | #f2efe8 |
| Dot | radius 66 at (676, 626), sitting on the chevron's lower line like a full stop | #f2b544 |

The mark is optically centred: its outer edges run from 280 to 742 across and from 302 to 722 down.

## Where it appears

| Place | File | Frame |
|---|---|---|
| Windows | `build/icon.ico` (16 to 256) | full canvas, shape baked in |
| Linux | `build/icon.png` (512) | full canvas, shape baked in |
| macOS 26 | `build/icon.icon`, the Icon Composer document: chevron and dot layers on a solid #141414 fill | Liquid Glass, masked by macOS |
| macOS before 26 | `build/icon.icns` (16 to 1024) | Apple's grid, 824 centred |
| Browser tab | `app/icon.svg` | full canvas |
| Sidebar | `components/lh-mark.tsx` | the bare mark, no squircle |

The mark keeps its proportion to the squircle in every frame.

In the app the mark follows the theme (D140): the chevron takes the theme's text colour and the dot stays gold. E-ink makes the dot grey. The tokens are `--mark-fill` and `--mark-detail` in `app/globals.css`.

## Changing it

1. Edit `src/core/kvasir-mark.ts`.
2. Run `npm run icons`. It writes every file in the table above except the sidebar mark, which draws from the source directly. It packs the `.icns` with macOS's `iconutil`, so run it on a Mac.
3. Commit the outputs. `tests/app-icon.test.tsx` fails if any file no longer matches the source.

The Icon Composer document compiles with `actool` from Xcode 26, in the release workflow's Mac job. A manual run of the release workflow (`gh workflow run release.yml --ref <branch>`) shows the result without making a release.

## How it was checked

The mark was rendered beside the published marks of Claude Code, Cursor, GitHub Copilot, Replit, v0 and OpenAI Codex. The closest is Codex's `›_` inside a cloud shape. It was also compared with the `>_` that terminal apps commonly use. No match was found.

Web searches cannot compare images, so this is not a legal trademark search. Before wide publication, a design-mark search (EUIPO or USPTO) by a professional is the real check.
