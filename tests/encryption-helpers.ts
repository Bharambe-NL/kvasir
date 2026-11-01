/**
 * Test helpers for encryption at rest (Kvasir P6-6): what the Electron main
 * process writes to data/encryption.json, a byte scan of a folder, and a
 * read of everything the stores hold. Import after KV_DATA_DIR is set.
 */
import fs from "node:fs";
import * as path from "node:path";

const { ENCRYPTION_FILE, refreshEncryptionFile } = await import("../src/store/data-key.ts");
const { checkValue, newRecoveryKey, sealWithRecovery } = await import("../src/store/crypto.ts");
type Stores = typeof import("../src/server/stores.ts").stores;

/** Write encryption.json as main does; returns the recovery key. */
export function mainWritesEncryptionFile(key: Buffer, state: "on" | "sealing" | "unsealing"): string {
	const recovery = newRecoveryKey();
	const prev = fs.existsSync(ENCRYPTION_FILE) ? JSON.parse(fs.readFileSync(ENCRYPTION_FILE, "utf8")) : null;
	fs.writeFileSync(ENCRYPTION_FILE, JSON.stringify(prev ? { ...prev, state } : { version: 1, state, check: checkValue(key), sealedByKeychain: "fake-keychain-seal", sealedByRecovery: sealWithRecovery(key, recovery) }));
	refreshEncryptionFile();
	return recovery;
}

/** Main's last step of turning off: move encryption.json aside. */
export function mainRetiresEncryptionFile(): void {
	fs.renameSync(ENCRYPTION_FILE, `${ENCRYPTION_FILE}.retired`);
	refreshEncryptionFile();
}

/** Every file under `dir` (and any extra files) whose bytes contain `needle`. */
export function filesContaining(dir: string, needle: string, extra: string[] = []): string[] {
	const hits: string[] = [];
	const visit = (p: string) => {
		const st = fs.statSync(p);
		if (st.isDirectory()) for (const e of fs.readdirSync(p)) visit(path.join(p, e));
		else if (fs.readFileSync(p).includes(Buffer.from(needle, "utf8"))) hits.push(p);
	};
	visit(dir);
	for (const f of extra) if (fs.existsSync(f)) visit(f);
	return hits;
}

/** Everything the ports return, as one comparable value. */
export function readAll(stores: Stores, versionId?: string) {
	const chatList = stores.chatStore.listChats();
	return {
		nodes: stores.graphStore.readNodes(),
		chains: stores.graphStore.readChains(),
		checkpoints: stores.graphStore.readCheckpoints(),
		coverage: stores.graphStore.readCoverage(),
		citations: stores.graphStore.readCitations(),
		units: versionId ? stores.graphStore.readDocumentUnits(versionId) : null,
		sources: stores.graphStore.readSources(),
		positions: stores.graphStore.readPositions(),
		chatList,
		chats: chatList.map((c) => stores.chatStore.getChat(c.id)),
		jobs: chatList.map((c) => stores.jobStore.listJobs(c.id)),
		reviews: stores.learnerStore.readReviews(),
	};
}
