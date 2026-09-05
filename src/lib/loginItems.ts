import { BIN, run } from "./shell";

export const AUTOMATION_SETTINGS_URL =
  "x-apple.systempreferences:com.apple.preference.security?Privacy_Automation";

const LIST_SCRIPT = `tell application "System Events" to get the name of every login item`;

/**
 * The name arrives through `argv` rather than being interpolated into the
 * script text, so quotes in an item's name can't terminate the string literal
 * or inject further AppleScript.
 */
const REMOVE_SCRIPT = `on run argv
  tell application "System Events" to delete login item (item 1 of argv)
end run`;

/** True when macOS is withholding Automation (Apple Events) permission. */
export function isAutomationError(message: string): boolean {
  return /not authorized|-?1743/i.test(message);
}

export function getLoginItems(): string[] {
  const out = run(BIN.osascript, ["-e", LIST_SCRIPT]).trim();
  if (!out) return [];
  return out
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
}

export function removeLoginItem(name: string): void {
  run(BIN.osascript, ["-e", REMOVE_SCRIPT, "--", name]);
}
