"use client";
/**
 * The Locked screen and the encryption gate (Kvasir P6-6, D116). While the
 * data is encrypted and not unlocked, nothing of the app renders: no store
 * is read or written. When main is still handing over the key ("waiting")
 * the gate shows a blank screen for that moment; when the keychain failed
 * it shows the Locked screen, which takes the recovery key. `LockedView` is
 * presentational so tests render its states.
 */

import { Fragment, useCallback, useEffect, useState } from "react";

interface Status {
	state: "plain" | "locked" | "unlocked";
	converting: boolean;
	lockReason?: "waiting" | "keychain";
}

export function LockedView({ value, wrong, busy, onChange, onUnlock }: { value: string; wrong: boolean; busy: boolean; onChange: (v: string) => void; onUnlock: () => void }) {
	return (
		<main className="flex min-h-dvh items-center justify-center px-6" data-testid="locked-screen">
			<form
				className="flex w-full max-w-md flex-col gap-4"
				onSubmit={(e) => {
					e.preventDefault();
					onUnlock();
				}}
			>
				<h1 className="font-ui text-sm uppercase tracking-widest text-foreground">Kvasir could not unlock your data on this Mac</h1>
				<p className="font-prose text-(length:--lh-prose-size) text-muted-foreground">Enter your recovery key to open it. Kvasir stores the key in this Mac&apos;s keychain again.</p>
				<label className="flex flex-col gap-1 text-xs text-muted-foreground">
					Recovery key
					<input
						className="rounded-md border border-border bg-transparent px-3 py-2 font-ui text-sm tracking-wider text-foreground"
						value={value}
						onChange={(e) => onChange(e.target.value)}
						autoComplete="off"
						spellCheck={false}
						autoFocus
					/>
				</label>
				{wrong && <p className="text-xs text-destructive">That recovery key does not open this data.</p>}
				<div>
					<button type="submit" disabled={busy || value.trim() === ""} className="rounded-md border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-accent disabled:opacity-50">
						Unlock
					</button>
				</div>
			</form>
		</main>
	);
}

/** Renders the app unless the data is known to be locked. A plain folder
 *  never waits on the status request. After an unlock the app remounts,
 *  so anything that met the lock fetches again. */
export function EncryptionGate({ children }: { children: React.ReactNode }) {
	const [status, setStatus] = useState<Status | null>(null);
	const [value, setValue] = useState("");
	const [wrong, setWrong] = useState(false);
	const [busy, setBusy] = useState(false);
	/** Moves only when a lock lifts, which remounts the app. */
	const [generation, setGeneration] = useState(0);

	const load = useCallback(async () => {
		try {
			const res = await fetch("/api/encryption", { cache: "no-store" });
			const next = (await res.json()) as Status;
			setStatus((prev) => {
				if (prev?.state === "locked" && next.state !== "locked") setGeneration((g) => g + 1);
				return next;
			});
		} catch {
			setStatus({ state: "plain", converting: false }); // no server answer: let the app show its own errors
		}
	}, []);
	useEffect(() => {
		void load();
	}, [load]);
	// While main is still handing over the key, ask again shortly.
	useEffect(() => {
		if (status?.state !== "locked" || status.lockReason !== "waiting") return;
		const t = setTimeout(() => void load(), 250);
		return () => clearTimeout(t);
	}, [status, load]);

	if (!status || status.state !== "locked") return <Fragment key={generation}>{children}</Fragment>;
	if (status.lockReason !== "keychain") return null;
	return (
		<LockedView
			value={value}
			wrong={wrong}
			busy={busy}
			onChange={(v) => {
				setValue(v);
				setWrong(false);
			}}
			onUnlock={async () => {
				const bridge = window.lh?.encryption;
				if (!bridge) return;
				setBusy(true);
				try {
					const result = (await bridge.recover(value)) as { ok: boolean };
					if (result.ok) await load();
					else setWrong(true);
				} catch {
					setWrong(true);
				} finally {
					setBusy(false);
				}
			}}
		/>
	);
}
