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

export type SectionKey = "processes" | "devServers" | "loginItems" | "agents";
