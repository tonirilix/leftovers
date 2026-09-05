import { BIN, run } from "./shell";
import type { ProcessInfo } from "../types";

const DEFAULT_LIMIT = 15;

/**
 * One `ps` call for the whole machine, indexed by pid. Both the process list
 * and the listening-ports list read from this, so a refresh spawns one `ps`
 * rather than one per process of interest.
 */
export function getProcessSnapshot(): Map<string, ProcessInfo> {
  const out = run(BIN.ps, ["-Ao", "pid=,etime=,pcpu=,rss=,comm=", "-r"]);
  const snapshot = new Map<string, ProcessInfo>();

  for (const line of out.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Only `comm` can contain spaces, so the first four fields are positional.
    const [pid, etime, cpu, rss, ...commParts] = trimmed.split(/\s+/);
    if (!pid || !rss) continue;

    const commandPath = commParts.join(" ");
    snapshot.set(pid, {
      pid,
      name: commandPath.split("/").pop() || commandPath || "unknown",
      cpu: parseFloat(cpu) || 0,
      rssMB: Math.round((parseInt(rss, 10) || 0) / 1024),
      etime,
    });
  }

  return snapshot;
}

/** `ps -r` already sorts by CPU, so this just takes the head of the snapshot. */
export function getTopProcesses(
  snapshot: Map<string, ProcessInfo>,
  limit = DEFAULT_LIMIT,
): ProcessInfo[] {
  return Array.from(snapshot.values()).slice(0, limit);
}

export function killProcess(pid: string): void {
  if (!/^\d+$/.test(pid)) {
    throw new Error(`Refusing to kill a non-numeric pid: ${pid}`);
  }
  run(BIN.kill, [pid]);
}
