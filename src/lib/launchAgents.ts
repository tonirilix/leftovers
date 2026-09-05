import fs from "fs";
import os from "os";
import path from "path";
import { BIN, run } from "./shell";
import type { LaunchAgentInfo } from "../types";

export const USER_AGENTS_DIR = path.join(os.homedir(), "Library/LaunchAgents");
export const DISABLED_DIR = path.join(USER_AGENTS_DIR, ".disabled");

export function getUserLaunchAgents(): LaunchAgentInfo[] {
  if (!fs.existsSync(USER_AGENTS_DIR)) return [];
  return fs
    .readdirSync(USER_AGENTS_DIR)
    .filter((file) => file.endsWith(".plist"))
    .map((file) => ({
      label: file.replace(/\.plist$/, ""),
      path: path.join(USER_AGENTS_DIR, file),
    }));
}

/**
 * Unloads the agent and moves its plist into `.disabled/`, which keeps the
 * change reversible — moving it back and running `launchctl bootstrap`
 * restores it.
 */
export function disableLaunchAgent(agent: LaunchAgentInfo): void {
  const resolved = path.resolve(agent.path);

  // The path comes from a directory listing rather than user input, but a
  // symlink or crafted name shouldn't be able to move files elsewhere.
  if (path.dirname(resolved) !== path.resolve(USER_AGENTS_DIR)) {
    throw new Error(`Refusing to act on a path outside ${USER_AGENTS_DIR}`);
  }

  try {
    run(BIN.launchctl, ["bootout", `gui/${process.getuid?.() ?? ""}`, resolved]);
  } catch {
    // Not currently loaded — still move the plist so it stays disabled.
  }

  fs.mkdirSync(DISABLED_DIR, { recursive: true });
  fs.renameSync(resolved, path.join(DISABLED_DIR, path.basename(resolved)));
}
