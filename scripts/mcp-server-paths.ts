/**
 * Where the Kvasir desktop app keeps its data (electron/main.cjs: userData
 * plus "/data"), for the MCP server and its config printer (Kvasir P6-2).
 */

import * as os from "node:os";
import * as path from "node:path";

export function defaultDataDir(): string {
	const home = os.homedir();
	if (process.platform === "darwin") return path.join(home, "Library", "Application Support", "Kvasir", "data");
	if (process.platform === "win32") return path.join(process.env.APPDATA ?? path.join(home, "AppData", "Roaming"), "Kvasir", "data");
	return path.join(process.env.XDG_CONFIG_HOME ?? path.join(home, ".config"), "Kvasir", "data");
}
