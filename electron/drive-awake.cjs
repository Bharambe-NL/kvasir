"use strict";

// Keep a drive session running with the screen off (Kvasir P3-5, D176).
// While a window's session runs: an app-suspension blocker (the display may
// still sleep or lock) and no background throttling, so listening and
// speaking go on. Released on pause, on end, and when the window closes.

/** One keeper per app; `blocker` is Electron's powerSaveBlocker. */
function createDriveAwake(blocker) {
	const held = new Map(); // webContents id -> { id, contents }

	function release(contents) {
		const entry = held.get(contents.id);
		if (!entry) return;
		held.delete(contents.id);
		if (blocker.isStarted(entry.id)) blocker.stop(entry.id);
		if (!contents.isDestroyed()) contents.setBackgroundThrottling(true);
	}

	/** Turn the hold on or off for one window's contents. */
	function set(contents, on) {
		if (!on) return release(contents);
		if (held.has(contents.id)) return;
		const id = blocker.start("prevent-app-suspension");
		held.set(contents.id, { id, contents });
		contents.setBackgroundThrottling(false);
		contents.once("destroyed", () => release(contents));
	}

	return { set, release, held: () => held.size };
}

module.exports = { createDriveAwake };
