"use client";
/**
 * The Security section (Kvasir P6-6, D114, D115): turn encryption at rest
 * on or off. Turning on shows the recovery key once. The data key never
 * reaches the window: main (electron/encryption.cjs) does the work through
 * the preload bridge `lh.encryption`; the state comes from GET
 * /api/encryption. `SecurityView` is presentational so tests render every
 * state.
 */

import { useCallback, useEffect, useState } from "react";
import { SettingsRow } from "./controls.tsx";

const BUTTON = "shrink-0 rounded-md border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-accent disabled:opacity-50";
const LINK = "text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline";

export type SecurityState =
	| { kind: "unavailable" }
	| { kind: "off"; busy: boolean }
	| { kind: "recovery"; recoveryKey: string; saved: boolean; copied: boolean }
	| { kind: "on"; busy: boolean; confirming: boolean };

export function SecurityView({
	state,
	error,
	onTurnOn,
	onCopy,
	onSavedChange,
	onDone,
	onTurnOff,
	onConfirmOff,
	onCancelOff,
}: {
	state: SecurityState;
	error?: string | null;
	onTurnOn: () => void;
	onCopy: () => void;
	onSavedChange: (saved: boolean) => void;
	onDone: () => void;
	onTurnOff: () => void;
	onConfirmOff: () => void;
	onCancelOff: () => void;
}) {
	return (
		<div className="flex flex-col gap-3" data-testid="security-view">
			{state.kind === "unavailable" && <p className="text-xs text-muted-foreground">Encryption needs the Kvasir desktop app.</p>}
			{state.kind === "off" && (
				<SettingsRow label="Encrypt data on this Mac" hint="Sessions, your knowledge graph, review history and API keys are stored encrypted. The key is kept in this Mac's keychain.">
					<button type="button" className={BUTTON} disabled={state.busy} onClick={onTurnOn}>
						Turn on encryption
					</button>
				</SettingsRow>
			)}
			{state.kind === "recovery" && (
				<div className="flex flex-col gap-3" data-testid="security-recovery">
					<p className="font-prose text-(length:--lh-prose-size)">Save your recovery key</p>
					<p className="text-xs text-muted-foreground">If this Mac&apos;s keychain is lost, this key is the only way to open your data. Kvasir shows it once.</p>
					<div className="flex items-center gap-3">
						<code className="select-all rounded-sm border border-border bg-muted px-2 py-1 font-ui text-sm tracking-wider" data-testid="recovery-key">
							{state.recoveryKey}
						</code>
						<button type="button" className={LINK} onClick={onCopy}>
							Copy
						</button>
					</div>
					<label className="flex items-center gap-2 text-xs text-muted-foreground">
						<input type="checkbox" checked={state.saved} onChange={(e) => onSavedChange(e.target.checked)} />
						I have saved my recovery key
					</label>
					<div>
						<button type="button" className={BUTTON} disabled={!state.saved} onClick={onDone}>
							Done
						</button>
					</div>
				</div>
			)}
			{state.kind === "on" && !state.confirming && (
				<SettingsRow label="Encryption is on.">
					<button type="button" className={BUTTON} disabled={state.busy} onClick={onTurnOff}>
						Turn off encryption
					</button>
				</SettingsRow>
			)}
			{state.kind === "on" && state.confirming && (
				<div className="flex items-center justify-between gap-4" data-testid="security-confirm-off">
					<span className="font-prose text-(length:--lh-prose-size)">Store your data unencrypted on this Mac?</span>
					<span className="flex shrink-0 gap-2">
						<button type="button" className={BUTTON} disabled={state.busy} onClick={onConfirmOff}>
							Turn off
						</button>
						<button type="button" className={BUTTON} disabled={state.busy} onClick={onCancelOff}>
							Cancel
						</button>
					</span>
				</div>
			)}
			{error && <p className="text-xs text-destructive">{error}</p>}
		</div>
	);
}

interface Bridge {
	enable(): Promise<{ recoveryKey: string }>;
	disable(): Promise<void>;
}

/** The section with its state, GET /api/encryption and the bridge. */
export function SecuritySection() {
	const [state, setState] = useState<SecurityState | null>(null);
	const [error, setError] = useState<string | null>(null);
	const bridge = (): Bridge | undefined => window.lh?.encryption;

	const load = useCallback(async () => {
		const res = await fetch("/api/encryption", { cache: "no-store" });
		const body = (await res.json()) as { state: "plain" | "locked" | "unlocked"; available: boolean };
		if (!body.available || !bridge()) setState({ kind: "unavailable" });
		else setState(body.state === "plain" ? { kind: "off", busy: false } : { kind: "on", busy: false, confirming: false });
	}, []);
	useEffect(() => {
		void load().catch((err) => setError(err instanceof Error ? err.message : String(err)));
	}, [load]);

	const run = async (busyState: SecurityState, work: () => Promise<void>) => {
		setError(null);
		setState(busyState);
		try {
			await work();
		} catch (err) {
			setError(err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "") : String(err));
			await load();
		}
	};
	if (!state) return null;
	return (
		<SecurityView
			state={state}
			error={error}
			onTurnOn={() =>
				void run({ kind: "off", busy: true }, async () => {
					const { recoveryKey } = await bridge()!.enable();
					setState({ kind: "recovery", recoveryKey, saved: false, copied: false });
				})
			}
			onCopy={() => state.kind === "recovery" && void navigator.clipboard?.writeText(state.recoveryKey).then(() => setState({ ...state, copied: true }))}
			onSavedChange={(saved) => state.kind === "recovery" && setState({ ...state, saved })}
			onDone={() => setState({ kind: "on", busy: false, confirming: false })}
			onTurnOff={() => setState({ kind: "on", busy: false, confirming: true })}
			onCancelOff={() => setState({ kind: "on", busy: false, confirming: false })}
			onConfirmOff={() =>
				void run({ kind: "on", busy: true, confirming: true }, async () => {
					await bridge()!.disable();
					setState({ kind: "off", busy: false });
				})
			}
		/>
	);
}
