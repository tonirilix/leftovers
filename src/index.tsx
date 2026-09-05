import { useEffect, useState, useCallback } from "react";
import { execSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import {
  ActionPanel,
  Action,
  List,
  Icon,
  Color,
  confirmAlert,
  Alert,
  showToast,
  Toast,
  open,
  Clipboard,
} from "@raycast/api";

interface ProcessInfo {
  pid: string;
  cpu: number;
  rssMB: number;
  name: string;
}

interface LaunchAgentInfo {
  label: string;
  path: string;
}

interface DevServerInfo extends ProcessInfo {
  ports: number[];
  etime: string;
}

const USER_AGENTS_DIR = path.join(os.homedir(), "Library/LaunchAgents");
const DISABLED_DIR = path.join(USER_AGENTS_DIR, ".disabled");

// Raycast's extension host doesn't inherit the user's shell PATH, so binaries
// outside /bin (e.g. /usr/sbin/lsof) silently fail to spawn. Force a full PATH.
const SAFE_PATH = "/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin";

function sh(command: string, options: Parameters<typeof execSync>[1] = {}): string {
  return execSync(command, {
    encoding: "utf8",
    env: { ...process.env, PATH: `${SAFE_PATH}:${process.env.PATH ?? ""}` },
    ...options,
  }) as unknown as string;
}

function getTopProcesses(limit = 15): ProcessInfo[] {
  const out = sh(`ps -Ao pid=,pcpu=,rss=,comm= -r`);
  return out
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, limit)
    .map((line) => {
      const parts = line.split(/\s+/);
      const [pid, cpu, rss, ...commParts] = parts;
      const fullPath = commParts.join(" ");
      const name = fullPath.split("/").pop() || fullPath;
      return {
        pid,
        cpu: parseFloat(cpu),
        rssMB: Math.round(parseInt(rss, 10) / 1024),
        name,
      };
    });
}

function getLoginItems(): string[] {
  const out = sh(
    `osascript -e 'tell application "System Events" to get the name of every login item'`,
  ).trim();
  if (!out) return [];
  return out.split(", ").map((s) => s.trim());
}

function getUserLaunchAgents(): LaunchAgentInfo[] {
  if (!fs.existsSync(USER_AGENTS_DIR)) return [];
  return fs
    .readdirSync(USER_AGENTS_DIR)
    .filter((f) => f.endsWith(".plist"))
    .map((f) => ({
      label: f.replace(/\.plist$/, ""),
      path: path.join(USER_AGENTS_DIR, f),
    }));
}

function getListeningPorts(): DevServerInfo[] {
  const lsofOut = sh(`/usr/sbin/lsof -iTCP -sTCP:LISTEN -P -n`);

  const portsByPid = new Map<string, Set<number>>();
  for (const line of lsofOut.split("\n").slice(1)) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 2) continue;
    const pid = parts[1];
    const nameField = parts[parts.length - 2];
    const portMatch = nameField?.match(/:(\d+)$/);
    if (!portMatch) continue;
    const port = parseInt(portMatch[1], 10);
    if (!portsByPid.has(pid)) portsByPid.set(pid, new Set());
    portsByPid.get(pid)!.add(port);
  }

  const results: DevServerInfo[] = [];
  for (const [pid, ports] of portsByPid) {
    try {
      const psOut = sh(`ps -o etime=,pcpu=,rss=,comm= -p ${pid}`).trim();
      const [etime, cpu, rss, ...commParts] = psOut.split(/\s+/);
      const fullPath = commParts.join(" ");
      const name = fullPath.split("/").pop() || fullPath || "unknown";
      results.push({
        pid,
        cpu: parseFloat(cpu) || 0,
        rssMB: Math.round(parseInt(rss, 10) / 1024) || 0,
        name,
        ports: Array.from(ports).sort((a, b) => a - b),
        etime,
      });
    } catch {
      // Process exited between lsof and ps calls — skip it.
    }
  }
  return results.sort((a, b) => b.cpu - a.cpu);
}

const AUTOMATION_SETTINGS_URL =
  "x-apple.systempreferences:com.apple.preference.security?Privacy_Automation";

function isAutomationError(message: string): boolean {
  return /not authorized|1743/i.test(message);
}

function cpuColor(cpu: number): Color {
  if (cpu >= 50) return Color.Red;
  if (cpu >= 15) return Color.Yellow;
  return Color.Green;
}

// ps `etime` formats: "ss", "mm:ss", "hh:mm:ss", or "dd-hh:mm:ss".
function etimeToMinutes(etime: string): number {
  let days = 0;
  let rest = etime;
  if (rest.includes("-")) {
    const [d, r] = rest.split("-");
    days = parseInt(d, 10) || 0;
    rest = r;
  }
  const parts = rest.split(":").map((p) => parseInt(p, 10) || 0);
  let hours = 0;
  let minutes = 0;
  let seconds = 0;
  if (parts.length === 3) [hours, minutes, seconds] = parts;
  else if (parts.length === 2) [minutes, seconds] = parts;
  else [seconds] = parts;
  return days * 24 * 60 + hours * 60 + minutes + seconds / 60;
}

// Flags servers that have likely been forgotten and left running.
function uptimeColor(etime: string): Color | null {
  const minutes = etimeToMinutes(etime);
  if (minutes >= 24 * 60) return Color.Red; // 1+ day
  if (minutes >= 4 * 60) return Color.Yellow; // 4+ hours
  return null;
}

function getSystemSummary(): string {
  const uptimeOut = sh(`uptime`).trim();
  const loadMatch = uptimeOut.match(/load averages?:\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/i);
  const load = loadMatch ? `${loadMatch[1]} ${loadMatch[2]} ${loadMatch[3]}` : "unknown";

  const vmOut = sh(`vm_stat`);
  const pageSizeMatch = vmOut.match(/page size of (\d+) bytes/);
  const pageSize = pageSizeMatch ? parseInt(pageSizeMatch[1], 10) : 4096;
  const freeMatch = vmOut.match(/Pages free:\s+(\d+)/);
  const freePages = freeMatch ? parseInt(freeMatch[1], 10) : 0;
  const freeMB = Math.round((freePages * pageSize) / 1024 / 1024);

  const dfLines = sh(`df -h /`).trim().split("\n");
  const dfParts = (dfLines[1] ?? "").split(/\s+/);
  const diskAvail = dfParts[3] ?? "unknown";

  return `Load: ${load}  ·  Free RAM: ${freeMB} MB  ·  Free Disk: ${diskAvail}`;
}

export default function Command() {
  const [isLoading, setIsLoading] = useState(true);
  const [processes, setProcesses] = useState<ProcessInfo[]>([]);
  const [devServers, setDevServers] = useState<DevServerInfo[]>([]);
  const [loginItems, setLoginItems] = useState<string[]>([]);
  const [agents, setAgents] = useState<LaunchAgentInfo[]>([]);
  const [errors, setErrors] = useState<Record<string, string | null>>({});

  function runSection<T>(key: string, fn: () => T, setter: (v: T) => void) {
    try {
      setter(fn());
      setErrors((prev) => (prev[key] ? { ...prev, [key]: null } : prev));
    } catch (error) {
      setErrors((prev) => ({ ...prev, [key]: String(error) }));
    }
  }

  const fetchAll = useCallback(async (showSpinner: boolean) => {
    if (showSpinner) setIsLoading(true);
    runSection("processes", getTopProcesses, setProcesses);
    runSection("devServers", getListeningPorts, setDevServers);
    runSection("loginItems", getLoginItems, setLoginItems);
    runSection("agents", getUserLaunchAgents, setAgents);
    if (showSpinner) setIsLoading(false);
  }, []);

  const refresh = useCallback(() => fetchAll(true), [fetchAll]);

  async function copyReport() {
    try {
      const lines: string[] = [];
      lines.push(`Mac Monitor Report — ${new Date().toLocaleString()}`);
      lines.push("");
      lines.push(getSystemSummary());
      lines.push("");
      lines.push(`Top Processes (${processes.length}):`);
      processes.forEach((p) =>
        lines.push(`  ${p.name} · PID ${p.pid} · ${p.cpu.toFixed(1)}% · ${p.rssMB} MB`),
      );
      lines.push("");
      lines.push(`Listening Ports (${devServers.length}):`);
      devServers.forEach((s) =>
        lines.push(
          `  ${s.name} :${s.ports.join(", :")} · PID ${s.pid} · ${s.cpu.toFixed(1)}% · ${s.rssMB} MB · up ${s.etime}`,
        ),
      );
      lines.push("");
      lines.push(`Login Items (${loginItems.length}):`);
      loginItems.forEach((name) => lines.push(`  ${name}`));
      lines.push("");
      lines.push(`User Launch Agents (${agents.length}):`);
      agents.forEach((a) => lines.push(`  ${a.label}`));

      await Clipboard.copy(lines.join("\n"));
      await showToast({ style: Toast.Style.Success, title: "Report copied to clipboard" });
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to build report",
        message: String(error),
      });
    }
  }

  useEffect(() => {
    fetchAll(true);
    // Auto-refresh every 4s while this view is open — stops entirely when
    // Raycast closes the command, so there's no persistent background cost.
    const interval = setInterval(() => fetchAll(false), 4000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  async function killProcess(proc: ProcessInfo) {
    const confirmed = await confirmAlert({
      title: `Kill "${proc.name}"?`,
      message: `PID ${proc.pid} · ${proc.cpu}% CPU · ${proc.rssMB} MB RAM`,
      primaryAction: { title: "Kill", style: Alert.ActionStyle.Destructive },
    });
    if (!confirmed) return;
    try {
      sh(`kill ${proc.pid}`);
      await showToast({ style: Toast.Style.Success, title: `Killed ${proc.name}` });
      refresh();
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to kill process",
        message: String(error),
      });
    }
  }

  async function removeLoginItem(name: string) {
    const confirmed = await confirmAlert({
      title: `Remove login item "${name}"?`,
      message: "It will no longer launch automatically at login.",
      primaryAction: { title: "Remove", style: Alert.ActionStyle.Destructive },
    });
    if (!confirmed) return;
    try {
      sh(
        `osascript -e 'tell application "System Events" to delete login item "${name}"'`,
      );
      await showToast({ style: Toast.Style.Success, title: `Removed ${name}` });
      refresh();
    } catch (error) {
      const message = String(error);
      await showToast({
        style: Toast.Style.Failure,
        title: isAutomationError(message)
          ? "Automation permission required"
          : "Failed to remove login item",
        message,
        primaryAction: isAutomationError(message)
          ? { title: "Open Automation Settings", onAction: () => open(AUTOMATION_SETTINGS_URL) }
          : undefined,
      });
    }
  }

  async function disableAgent(agent: LaunchAgentInfo) {
    const confirmed = await confirmAlert({
      title: `Disable "${agent.label}"?`,
      message: "It will be unloaded and moved to a backup folder (reversible).",
      primaryAction: { title: "Disable", style: Alert.ActionStyle.Destructive },
    });
    if (!confirmed) return;
    try {
      sh(`launchctl bootout gui/$(id -u) "${agent.path}"`, { shell: "/bin/bash" });
    } catch {
      // Already unloaded or never loaded — safe to ignore and continue moving the file.
    }
    try {
      fs.mkdirSync(DISABLED_DIR, { recursive: true });
      fs.renameSync(agent.path, path.join(DISABLED_DIR, path.basename(agent.path)));
      await showToast({ style: Toast.Style.Success, title: `Disabled ${agent.label}` });
      refresh();
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to disable agent",
        message: String(error),
      });
    }
  }

  return (
    <List isLoading={isLoading}>
      <List.Section title="Top Processes" subtitle={`${processes.length}`}>
        {errors.processes && (
          <List.Item icon={Icon.Warning} title="Failed to load" subtitle={errors.processes} />
        )}
        {processes.map((proc) => (
          <List.Item
            key={proc.pid}
            icon={{ source: Icon.CircleFilled, tintColor: cpuColor(proc.cpu) }}
            title={proc.name}
            subtitle={`PID ${proc.pid} · ${proc.rssMB} MB`}
            accessories={[{ text: `${proc.cpu.toFixed(1)}%` }]}
            actions={
              <ActionPanel>
                <Action
                  title="Kill Process"
                  icon={Icon.XMarkCircle}
                  style={Action.Style.Destructive}
                  onAction={() => killProcess(proc)}
                />
                <Action.CopyToClipboard title="Copy PID" content={proc.pid} />
                <Action
                  title="Copy Report"
                  icon={Icon.Clipboard}
                  shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
                  onAction={copyReport}
                />
                <Action
                  title="Refresh"
                  icon={Icon.ArrowClockwise}
                  shortcut={{ modifiers: ["cmd"], key: "r" }}
                  onAction={refresh}
                />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>

      <List.Section title="Listening Ports" subtitle={`${devServers.length}`}>
        {errors.devServers && (
          <List.Item icon={Icon.Warning} title="Failed to load" subtitle={errors.devServers} />
        )}
        {devServers.map((srv) => (
          <List.Item
            key={srv.pid}
            icon={{ source: Icon.Globe, tintColor: cpuColor(srv.cpu) }}
            title={srv.name}
            subtitle={`:${srv.ports.join(", :")} · PID ${srv.pid} · up ${srv.etime}`}
            keywords={srv.ports.map(String)}
            accessories={[
              ...(uptimeColor(srv.etime)
                ? [
                    {
                      icon: { source: Icon.Clock, tintColor: uptimeColor(srv.etime)! },
                      text: srv.etime,
                      tooltip: "Been running a while — still needed?",
                    },
                  ]
                : []),
              { text: `${srv.cpu.toFixed(1)}% · ${srv.rssMB} MB` },
            ]}
            actions={
              <ActionPanel>
                <Action
                  title="Kill Process"
                  icon={Icon.XMarkCircle}
                  style={Action.Style.Destructive}
                  onAction={() => killProcess(srv)}
                />
                <Action.CopyToClipboard title="Copy Port" content={srv.ports.join(", ")} />
                <Action
                  title="Copy Report"
                  icon={Icon.Clipboard}
                  shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
                  onAction={copyReport}
                />
                <Action
                  title="Refresh"
                  icon={Icon.ArrowClockwise}
                  shortcut={{ modifiers: ["cmd"], key: "r" }}
                  onAction={refresh}
                />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>

      <List.Section title="Login Items" subtitle={`${loginItems.length}`}>
        {errors.loginItems &&
          (isAutomationError(errors.loginItems) ? (
            <List.Item
              icon={Icon.Lock}
              title="Automation permission required"
              subtitle="Raycast needs permission to control System Events"
              actions={
                <ActionPanel>
                  <Action.Open title="Open Automation Settings" target={AUTOMATION_SETTINGS_URL} />
                  <Action
                    title="Refresh"
                    icon={Icon.ArrowClockwise}
                    shortcut={{ modifiers: ["cmd"], key: "r" }}
                    onAction={refresh}
                  />
                </ActionPanel>
              }
            />
          ) : (
            <List.Item icon={Icon.Warning} title="Failed to load" subtitle={errors.loginItems} />
          ))}
        {loginItems.map((name) => (
          <List.Item
            key={name}
            icon={Icon.Power}
            title={name}
            actions={
              <ActionPanel>
                <Action
                  title="Remove Login Item"
                  icon={Icon.XMarkCircle}
                  style={Action.Style.Destructive}
                  onAction={() => removeLoginItem(name)}
                />
                <Action
                  title="Copy Report"
                  icon={Icon.Clipboard}
                  shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
                  onAction={copyReport}
                />
                <Action
                  title="Refresh"
                  icon={Icon.ArrowClockwise}
                  shortcut={{ modifiers: ["cmd"], key: "r" }}
                  onAction={refresh}
                />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>

      <List.Section title="User Launch Agents" subtitle={`${agents.length} loaded`}>
        {errors.agents && (
          <List.Item icon={Icon.Warning} title="Failed to load" subtitle={errors.agents} />
        )}
        {agents.map((agent) => (
          <List.Item
            key={agent.path}
            icon={Icon.Gear}
            title={agent.label}
            actions={
              <ActionPanel>
                <Action
                  title="Disable Agent"
                  icon={Icon.XMarkCircle}
                  style={Action.Style.Destructive}
                  onAction={() => disableAgent(agent)}
                />
                <Action.ShowInFinder title="Show Plist in Finder" path={agent.path} />
                <Action
                  title="Copy Report"
                  icon={Icon.Clipboard}
                  shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
                  onAction={copyReport}
                />
                <Action
                  title="Refresh"
                  icon={Icon.ArrowClockwise}
                  shortcut={{ modifiers: ["cmd"], key: "r" }}
                  onAction={refresh}
                />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
    </List>
  );
}
