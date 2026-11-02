/**
 * Keeping a drive session running with the screen off (Kvasir P3-5, D176):
 * electron/drive-awake.cjs against a fake powerSaveBlocker and fake
 * webContents. On holds an app-suspension blocker and turns background
 * throttling off; off, and a closed window, release both.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { describe, it } from "node:test";

const { createDriveAwake } = createRequire(import.meta.url)("../electron/drive-awake.cjs") as {
	createDriveAwake(blocker: unknown): { set(contents: unknown, on: boolean): void; held(): number };
};

function fakes() {
	const started = new Map<number, string>();
	let next = 1;
	const blocker = {
		start: (type: string) => (started.set(next, type), next++),
		stop: (id: number) => void started.delete(id),
		isStarted: (id: number) => started.has(id),
	};
	const contents = (id: number) => {
		const listeners: (() => void)[] = [];
		return {
			id,
			throttling: true,
			destroyed: false,
			setBackgroundThrottling(on: boolean) {
				this.throttling = on;
			},
			isDestroyed() {
				return this.destroyed;
			},
			once(_: string, fn: () => void) {
				listeners.push(fn);
			},
			destroy() {
				this.destroyed = true;
				for (const fn of listeners) fn();
			},
		};
	};
	return { started, blocker, contents };
}

describe("drive mode keep-awake", () => {
	it("on holds one app-suspension blocker and stops throttling; off releases both", () => {
		const f = fakes();
		const awake = createDriveAwake(f.blocker);
		const win = f.contents(7);
		awake.set(win, true);
		awake.set(win, true);
		assert.deepEqual([...f.started.values()], ["prevent-app-suspension"], "one blocker, and the display may still sleep");
		assert.equal(win.throttling, false);
		awake.set(win, false);
		assert.equal(f.started.size, 0);
		assert.equal(win.throttling, true);
		assert.equal(awake.held(), 0);
	});

	it("a closed window releases its blocker", () => {
		const f = fakes();
		const awake = createDriveAwake(f.blocker);
		const win = f.contents(3);
		awake.set(win, true);
		win.destroy();
		assert.equal(f.started.size, 0);
		assert.equal(awake.held(), 0);
	});
});
