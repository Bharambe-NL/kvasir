# Encryption at rest

Kvasir can keep your data encrypted on disk, with the key in this Mac's keychain (Kvasir P6-6, D112 to D118). It is off until you turn it on, and it works with both the file store and SQLite (`docs/sqlite.md`).

## What is encrypted

| Encrypted | Stays readable |
|---|---|
| Your knowledge graph: propositions, chains, coverage, sources, positions | `settings.json` (preferences) |
| Imported source documents and citations | Prompt overrides |
| Review history, review questions and exclusions | `graph/render-settings.json` |
| Chats and background jobs | `graph/format.json` (the format stamp) |
| `auth.json` (your API keys) | `encryption.json` (sealed keys and a check value, never the key itself) |

Each record is sealed on its own with AES-256-GCM. The record's place (its ledger, its id) is bound in, so a sealed record cannot be moved to stand in for another.

## Turn it on

1. Open **Settings > Security** in the Kvasir desktop app.
2. Click **Turn on encryption**. Kvasir makes a new data key, keeps it in this Mac's keychain, and encrypts everything in place.
3. Kvasir shows your **recovery key** once: 24 letters and digits in six groups. Copy it into your password manager, tick **I have saved my recovery key**, and click **Done**.

The first time, macOS may ask whether Kvasir may use the keychain. Allow it.

## Every start

The app unlocks the data with the key from the keychain. You see nothing unless that fails.

## If the keychain cannot unlock it

This happens on a new Mac, after a keychain reset, or when the data folder was copied from elsewhere. Kvasir then shows **Kvasir could not unlock your data on this Mac**. Enter your recovery key and click **Unlock**: Kvasir checks it, stores the key in this Mac's keychain again and opens the app. A wrong recovery key changes nothing. Without the keychain entry or the recovery key, the data cannot be opened.

## Turn it off

**Settings > Security > Turn off encryption**, then confirm. Kvasir decrypts everything in place and moves `encryption.json` into `data/pre-decrypt-<date>-<time>/`.

## What it does not cover

- **The browser dev server** (`npm run dev`) has no keychain. The Security section there says encryption needs the desktop app.
- **The MCP server** cannot read an encrypted folder. Every tool answers "Kvasir data on this Mac is encrypted; the MCP server cannot read it." No key leaves the app.
- **`npm run migrate:sqlite` and `npm run migrate:files`** refuse an encrypted folder. Turn encryption off, migrate, then turn it on again.
- **`npm run eval`** cannot read your API keys from an encrypted install.
- **Old copies of your data in free disk space.** On the file store, turning encryption on writes new files; the old blocks stay in the disk's free space until reused. SQLite zeroes freed pages and vacuums, so `kvasir.db` and its WAL hold no plain values. FileVault protects free space too and is a good companion.

## How it works

- **The key and its file.** The Electron main process owns the keychain (`safeStorage`) and `data/encryption.json`. That file holds the data key sealed by the keychain, the data key sealed by the recovery key (scrypt), and a check value.
- **How the server gets the key.** Main unseals the key and sends it to the server process over its private IPC channel, never in an environment variable.
- **Locked means locked.** Until the key arrives, every store call refuses, and every API route except `/api/encryption` answers 423.
- **Turning on and off.** Both run in the server in one synchronous pass. The state is `sealing` or `unsealing` while it runs. If the app stops part way, the next start finishes the job.

| File | What it holds |
|---|---|
| `src/store/crypto.ts` | Sealing, the recovery key and the check value |
| `src/store/data-key.ts` | `encryption.json`, the in-memory key and the lock state |
| `src/store/encrypted-backend.ts` | The encrypting layer over any `StoreBackend` |
| `src/store/encryption-convert.ts` | Sealing or opening every value in place, `auth.json` included |
| `src/server/encryption.ts` | The server side of the IPC channel and `GET /api/encryption` |
| `electron/encryption.cjs` | The keychain, `encryption.json`, turn on, turn off, recover |
| `components/settings/security-section.tsx`, `components/locked-screen.tsx` | The Security section and the Locked screen |
