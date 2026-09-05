import { BIN, run } from "./shell";
import type { DevServerInfo, ProcessInfo } from "../types";

/**
 * `-F pn` is lsof's machine-readable mode: output is one field per line,
 * `p<pid>` opening a process block and `n<address>` per socket. Parsing that
 * beats splitting the human-readable table on whitespace.
 */
function parsePortsByPid(lsofOutput: string): Map<string, Set<number>> {
  const portsByPid = new Map<string, Set<number>>();
  let currentPid: string | null = null;

  for (const line of lsofOutput.split("\n")) {
    if (line.startsWith("p")) {
      currentPid = line.slice(1);
      continue;
    }
    if (!line.startsWith("n") || !currentPid) continue;

    // Addresses look like "*:5173", "127.0.0.1:5173" or "[::1]:5173".
    const port = line.slice(1).match(/:(\d+)$/);
    if (!port) continue;

    let ports = portsByPid.get(currentPid);
    if (!ports) {
      ports = new Set<number>();
      portsByPid.set(currentPid, ports);
    }
    ports.add(parseInt(port[1], 10));
  }

  return portsByPid;
}

/**
 * Joins listening sockets against the shared process snapshot, so no extra
 * `ps` call is needed to resolve names and resource usage.
 */
export function getListeningPorts(snapshot: Map<string, ProcessInfo>): DevServerInfo[] {
  const output = run(BIN.lsof, ["-iTCP", "-sTCP:LISTEN", "-P", "-n", "-Fpn"]);
  const servers: DevServerInfo[] = [];

  for (const [pid, ports] of parsePortsByPid(output)) {
    const process = snapshot.get(pid);
    if (!process) continue; // Exited between the lsof and ps calls.
    servers.push({
      ...process,
      ports: Array.from(ports).sort((a, b) => a - b),
    });
  }

  return servers.sort((a, b) => b.cpu - a.cpu);
}
