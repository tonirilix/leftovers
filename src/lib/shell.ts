import { execFileSync } from "child_process";

/**
 * Absolute paths only. Resolving via PATH would let a directory earlier in the
 * search order substitute a different binary.
 */
export const BIN = {
  ps: "/bin/ps",
  kill: "/bin/kill",
  lsof: "/usr/sbin/lsof",
  osascript: "/usr/bin/osascript",
  launchctl: "/bin/launchctl",
  uptime: "/usr/bin/uptime",
  vmStat: "/usr/bin/vm_stat",
  sysctl: "/usr/sbin/sysctl",
  df: "/bin/df",
} as const;

/**
 * Minimal environment rather than a copy of process.env: the parent's
 * environment can carry DYLD_INSERT_LIBRARIES and friends into the child.
 */
const CHILD_ENV: NodeJS.ProcessEnv = {
  PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
  HOME: process.env.HOME,
  USER: process.env.USER,
};

const DEFAULT_TIMEOUT_MS = 5_000;
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;

/**
 * Runs a binary with an argument array — never through a shell, so argument
 * content (file names, login item names) cannot be interpreted as commands.
 */
export function run(file: string, args: string[] = [], timeoutMs = DEFAULT_TIMEOUT_MS): string {
  return execFileSync(file, args, {
    encoding: "utf8",
    env: CHILD_ENV,
    timeout: timeoutMs,
    maxBuffer: MAX_OUTPUT_BYTES,
  });
}
