import { Color } from "@raycast/api";
import { getSystemSummary } from "./system";
import type {
  DevServerInfo,
  LaunchAgentInfo,
  MemoryPressure,
  MemoryStats,
  ProcessInfo,
} from "../types";

const HIGH_CPU = 50;
const ELEVATED_CPU = 15;
const HIGH_MEMORY_MB = 1000;
const ELEVATED_MEMORY_MB = 400;
const STALE_MINUTES = 24 * 60;
const AGING_MINUTES = 4 * 60;

export function cpuColor(cpu: number): Color {
  if (cpu >= HIGH_CPU) return Color.Red;
  if (cpu >= ELEVATED_CPU) return Color.Yellow;
  return Color.Green;
}

export function memoryColor(rssMB: number): Color {
  if (rssMB >= HIGH_MEMORY_MB) return Color.Red;
  if (rssMB >= ELEVATED_MEMORY_MB) return Color.Yellow;
  return Color.SecondaryText;
}

export function pressureColor(pressure: MemoryPressure): Color {
  if (pressure === "critical") return Color.Red;
  if (pressure === "elevated") return Color.Yellow;
  return Color.Green;
}

export function formatMB(megabytes: number): string {
  return megabytes >= 1024 ? `${(megabytes / 1024).toFixed(1)} GB` : `${megabytes} MB`;
}

/**
 * Swap in active use is the giveaway that the machine is thrashing, which is
 * why it leads the summary rather than the free figure.
 */
export function describeMemory(memory: MemoryStats): string {
  const parts = [`${formatMB(memory.freeMB)} free`];
  if (memory.swapUsedMB > 0) parts.push(`${formatMB(memory.swapUsedMB)} swap used`);
  if (memory.compressedMB > 0) parts.push(`${formatMB(memory.compressedMB)} compressed`);
  return parts.join(" · ");
}

/** Parses `ps` elapsed time: "ss", "mm:ss", "hh:mm:ss" or "dd-hh:mm:ss". */
export function etimeToMinutes(etime: string): number {
  const [dayPart, clockPart] = etime.includes("-") ? etime.split("-") : ["0", etime];
  const days = parseInt(dayPart, 10) || 0;

  const parts = clockPart.split(":").map((part) => parseInt(part, 10) || 0);
  const [hours, minutes, seconds] =
    parts.length === 3
      ? parts
      : parts.length === 2
        ? [0, parts[0], parts[1]]
        : [0, 0, parts[0] ?? 0];

  return days * 24 * 60 + hours * 60 + minutes + seconds / 60;
}

/** Highlights servers old enough to have been forgotten; null means "normal". */
export function uptimeColor(etime: string): Color | null {
  const minutes = etimeToMinutes(etime);
  if (minutes >= STALE_MINUTES) return Color.Red;
  if (minutes >= AGING_MINUTES) return Color.Yellow;
  return null;
}

export interface ReportInput {
  processes: ProcessInfo[];
  devServers: DevServerInfo[];
  loginItems: string[];
  agents: LaunchAgentInfo[];
}

export function buildReport({ processes, devServers, loginItems, agents }: ReportInput): string {
  const lines = [`Leftovers Report — ${new Date().toLocaleString()}`, "", getSystemSummary(), ""];

  lines.push(`Top Processes (${processes.length}):`);
  for (const item of processes) {
    lines.push(`  ${item.name} · PID ${item.pid} · ${item.cpu.toFixed(1)}% · ${item.rssMB} MB`);
  }

  lines.push("", `Listening Ports (${devServers.length}):`);
  for (const item of devServers) {
    lines.push(
      `  ${item.name} :${item.ports.join(", :")} · PID ${item.pid} · ` +
        `${item.cpu.toFixed(1)}% · ${item.rssMB} MB · up ${item.etime}`,
    );
  }

  lines.push("", `Login Items (${loginItems.length}):`);
  lines.push(...loginItems.map((name) => `  ${name}`));

  lines.push("", `User Launch Agents (${agents.length}):`);
  lines.push(...agents.map((agent) => `  ${agent.label}`));

  return lines.join("\n");
}
