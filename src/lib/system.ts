import { BIN, run } from "./shell";
import type { MemoryPressure, MemoryStats } from "../types";

const DEFAULT_PAGE_SIZE = 4096;

/**
 * Thrashing is what makes a Mac audibly struggle while every CPU figure still
 * looks calm, so pressure is judged on swap in active use and on free memory
 * being gone — not on a percentage that stays reassuring during a swap storm.
 */
const CRITICAL_SWAP_MB = 4096;
const ELEVATED_SWAP_MB = 1024;
const CRITICAL_FREE_MB = 256;
const ELEVATED_FREE_MB = 1024;

function pagesToMB(pages: number, pageSize: number): number {
  return Math.round((pages * pageSize) / 1024 / 1024);
}

function classifyPressure(freeMB: number, swapUsedMB: number): MemoryPressure {
  if (swapUsedMB >= CRITICAL_SWAP_MB || freeMB < CRITICAL_FREE_MB) return "critical";
  if (swapUsedMB >= ELEVATED_SWAP_MB || freeMB < ELEVATED_FREE_MB) return "elevated";
  return "normal";
}

export function getMemoryStats(): MemoryStats {
  const vmStat = run(BIN.vmStat);
  const pageSize =
    parseInt(vmStat.match(/page size of (\d+) bytes/)?.[1] ?? "", 10) || DEFAULT_PAGE_SIZE;

  const freePages = parseInt(vmStat.match(/Pages free:\s+(\d+)/)?.[1] ?? "", 10) || 0;
  const compressorPages =
    parseInt(vmStat.match(/Pages occupied by compressor:\s+(\d+)/)?.[1] ?? "", 10) || 0;

  // "vm.swapusage: total = 9216.00M  used = 7514.50M  free = 1701.50M"
  const swap = run(BIN.sysctl, ["-n", "vm.swapusage"]);
  const swapTotalMB = Math.round(parseFloat(swap.match(/total\s*=\s*([\d.]+)M/)?.[1] ?? "0"));
  const swapUsedMB = Math.round(parseFloat(swap.match(/used\s*=\s*([\d.]+)M/)?.[1] ?? "0"));

  const freeMB = pagesToMB(freePages, pageSize);

  return {
    freeMB,
    compressedMB: pagesToMB(compressorPages, pageSize),
    swapUsedMB,
    swapTotalMB,
    pressure: classifyPressure(freeMB, swapUsedMB),
  };
}

/** One-line health summary for the copied report. */
export function getSystemSummary(): string {
  const uptime = run(BIN.uptime).trim();
  const loadMatch = uptime.match(/load averages?:\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/i);
  const load = loadMatch ? `${loadMatch[1]} ${loadMatch[2]} ${loadMatch[3]}` : "unknown";

  const memory = getMemoryStats();
  const diskAvailable =
    run(BIN.df, ["-h", "/"]).trim().split("\n")[1]?.split(/\s+/)[3] ?? "unknown";

  return (
    `Load: ${load}  ·  Free RAM: ${memory.freeMB} MB  ·  ` +
    `Swap used: ${memory.swapUsedMB} MB  ·  Memory pressure: ${memory.pressure}  ·  ` +
    `Free Disk: ${diskAvailable}`
  );
}
