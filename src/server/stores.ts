/**
 * THE COMPOSITION ROOT for storage — the single place concrete store
 * adapters are wired. Everything else (core, services, agents) codes against
 * the port types in core/ports.ts and receives instances through this
 * module. Kvasir P6-1 (D108): the stores run over SQLite when
 * data/kvasir.db exists and over the files otherwise (src/store/active.ts).
 */

import { activeBackend } from "../store/active.ts";
import { chatStore as fileChatStore, createChatStore } from "../store/chats.ts";
import { createGraphStore, graphStore as fileGraphStore } from "../store/graph.ts";
import { createJobStore, jobStore as fileJobStore } from "../store/jobs.ts";
import { createLearnerStore, learnerStore as fileLearnerStore } from "../store/learner.ts";
import { settingsStore } from "../store/settings.ts";
import { resolveSettings, type EffectiveSettings } from "../core/settings-resolution.ts";
import type { GraphReader } from "../core/ports.ts";
import { syncCustomProvider } from "./custom-provider.ts";
// On files, the stores are the adapter modules' own singletons (the same
// objects as before P6-1); on SQLite, new stores over the database.
const backend = activeBackend();
const onFiles = backend.kind === "files";
if (!onFiles) console.info("[stores] using data/kvasir.db");
const chatStore = onFiles ? fileChatStore : createChatStore(backend);
const graphStore = onFiles ? fileGraphStore : createGraphStore(backend);
const jobStore = onFiles ? fileJobStore : createJobStore(backend);
const learnerStore = onFiles ? fileLearnerStore : createLearnerStore(backend);

/** The wired adapters. Satisfies core/graph.ts's GraphDeps structurally. */
export const stores = {
	chatStore,
	graphStore,
	jobStore,
	settingsStore,
	learnerStore,
};

/**
 * The graph as the Memory system sees it (D030): the two read methods of the
 * live graph store and nothing else. Memory code receives this, never
 * stores.graphStore, so it holds no graph write method.
 */
export const graphReader: GraphReader = {
	readNodes: () => graphStore.readNodes(),
	readChains: () => graphStore.readChains(),
};

export type Stores = typeof stores;

/**
 * The resolved view of the settings record (core/settings-resolution.ts):
 * every knob concrete over its factory default — EXCEPT MODELS (BYOK all
 * the way down, owner 2026-09-22): no factory pins exist, so unset model
 * slots resolve to null and per-need refusal gates fire downstream. Read
 * fresh on every call — the record is a small file and turns are rare, so
 * no caching layer (stale toggles after a settings PUT would be worse).
 */
export function effectiveSettings(): EffectiveSettings {
	return resolveSettings(settingsStore.readSettings());
}

// Boot: register the custom endpoint (when configured) into piModels(); the
// POST /api/custom-provider route re-syncs after every connect.
syncCustomProvider();
