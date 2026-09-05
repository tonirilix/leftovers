import { BIN, run } from "./shell";

const DEFAULT_PAGE_SIZE = 4096;

/** One-line health summary: load average, free RAM, free disk. */
export function getSystemSummary(): string {
  const uptime = run(BIN.uptime).trim();
  const loadMatch = uptime.match(/load averages?:\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/i);
  const load = loadMatch ? `${loadMatch[1]} ${loadMatch[2]} ${loadMatch[3]}` : "unknown";

  const vmStat = run(BIN.vmStat);
  const pageSize = parseInt(vmStat.match(/page size of (\d+) bytes/)?.[1] ?? "", 10);
  const freePages = parseInt(vmStat.match(/Pages free:\s+(\d+)/)?.[1] ?? "", 10) || 0;
  const freeMB = Math.round((freePages * (pageSize || DEFAULT_PAGE_SIZE)) / 1024 / 1024);

  const diskAvailable =
    run(BIN.df, ["-h", "/"]).trim().split("\n")[1]?.split(/\s+/)[3] ?? "unknown";

  return `Load: ${load}  ·  Free RAM: ${freeMB} MB  ·  Free Disk: ${diskAvailable}`;
}
