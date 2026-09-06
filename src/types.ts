export interface ProcessInfo {
  pid: string;
  name: string;
  cpu: number;
  rssMB: number;
  /** Raw `ps` elapsed time: "ss", "mm:ss", "hh:mm:ss" or "dd-hh:mm:ss". */
  etime: string;
}

export interface DevServerInfo extends ProcessInfo {
  ports: number[];
}

export interface LaunchAgentInfo {
  label: string;
  path: string;
}

export type SectionKey = "processes" | "devServers" | "loginItems" | "agents" | "memory";

/** How the process list is ordered. CPU alone hides memory hogs. */
export type SortMode = "cpu" | "memory";

export type MemoryPressure = "normal" | "elevated" | "critical";

export interface MemoryStats {
  freeMB: number;
  compressedMB: number;
  swapUsedMB: number;
  swapTotalMB: number;
  pressure: MemoryPressure;
}
