# Kvasir exports

Kvasir can export your knowledge graph as an Obsidian vault or as an Anki deck (Kvasir P6-3, D100 to D105). Exports only read your data; nothing in the Kvasir data folder changes.

## Make an export

1. Open the graph on the home page.
2. Click **Export** in the graph toolbar.
3. Choose **Obsidian vault** or **Anki deck**.

Each export goes into a new folder, `~/Documents/Kvasir exports/<date time>/`, for example `2026-11-01 1030`. A second export in the same minute gets ` 2` added. Nothing is ever overwritten. In the desktop app, **Show in Finder** opens the folder.

The first export from the packaged app may ask for permission to use the Documents folder.

## Obsidian vault

The export folder holds a `Kvasir vault` folder. Open it in Obsidian with **Open folder as vault**.

- One note per proposition, named after it. When two propositions share a name (ignoring case), both notes get a short id suffix, such as `Strategy (a1b2c3).md`. A proposition named Index gets one too, because `index.md` is the vault's own index.
- Each note has:
  - frontmatter: `kvasir-id` (the proposition id), `aliases` (the other phrasings sessions used, so links by phrasing resolve), `session` (the session it was first learned in)
  - the statement
  - **Because**: one line per reasoning chain that concludes it, linking its premises, such as `[[Premise A]] + [[Premise B]]`
  - **Leads to**: links to what it helps conclude
  - **Sources**: each citation's label and quote
- `index.md` lists every note, grouped by session.

Obsidian's graph view then shows the reasoning chains as links. The vault holds every proposition, including those from sessions excluded from review (D104).

## Anki deck

The export folder holds `kvasir-anki.txt`, an Anki text import file. In Anki, choose **File > Import** and pick it. The file's header lines set the note type, deck, guid and tags:

- note type **Basic**, deck **Kvasir**
- front: the proposition name
- back: the statement, its reasoning chains and its citations
- tag: `kvasir::<session name>`

The first column is the proposition id, which Anki uses as the note's guid. When you import a later export, set **Existing notes** to **Update** in the import dialog: Anki then updates the notes it already has instead of adding copies, and their review history stays.

The deck leaves out propositions first learned in a session excluded from review, matching Kvasir's own review queue (D104).

## Code

| File | What it holds |
|---|---|
| `src/core/exports.ts` | `obsidianVault`, `ankiDeck`, `noteNames`: pure builders over the graph, citations and versions |
| `src/server/exports.ts` | `exportGraph`: reads the stores and writes the dated folder; `exportRoot` (`KV_EXPORT_DIR`, else `~/Documents/Kvasir exports`) |
| `app/api/graph/export/route.ts` | `POST /api/graph/export` with `{ kind: "obsidian" \| "anki" }` |
| `components/graph-export.tsx` | The Export menu |
| `electron/export-reveal.cjs` | The Show in Finder guard: only existing paths inside the export root |
