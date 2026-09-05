import {
  Action,
  ActionPanel,
  Alert,
  Clipboard,
  Icon,
  List,
  Toast,
  confirmAlert,
  open,
  showToast,
} from "@raycast/api";
import { SharedActions } from "./components/SharedActions";
import { useSystemSnapshot } from "./hooks/useSystemSnapshot";
import { buildReport, cpuColor, uptimeColor } from "./lib/format";
import { AUTOMATION_SETTINGS_URL, isAutomationError, removeLoginItem } from "./lib/loginItems";
import { disableLaunchAgent } from "./lib/launchAgents";
import { killProcess } from "./lib/processes";
import type { DevServerInfo, LaunchAgentInfo, ProcessInfo } from "./types";

function SectionError({ message, onRefresh }: { message: string; onRefresh: () => void }) {
  if (!isAutomationError(message)) {
    return <List.Item icon={Icon.Warning} title="Failed to load" subtitle={message} />;
  }

  return (
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
            onAction={onRefresh}
          />
        </ActionPanel>
      }
    />
  );
}

export default function Command() {
  const { isLoading, processes, devServers, loginItems, agents, errors, refresh, refreshStatic } =
    useSystemSnapshot();

  async function copyReport() {
    try {
      await Clipboard.copy(buildReport({ processes, devServers, loginItems, agents }));
      await showToast({
        style: Toast.Style.Success,
        title: "Report copied to clipboard",
      });
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to build report",
        message: String(error),
      });
    }
  }

  async function confirmKill(target: ProcessInfo) {
    const confirmed = await confirmAlert({
      title: `Kill "${target.name}"?`,
      message: `PID ${target.pid} · ${target.cpu.toFixed(1)}% CPU · ${target.rssMB} MB RAM`,
      primaryAction: { title: "Kill", style: Alert.ActionStyle.Destructive },
    });
    if (!confirmed) return;

    try {
      killProcess(target.pid);
      await showToast({
        style: Toast.Style.Success,
        title: `Killed ${target.name}`,
      });
      refresh();
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to kill process",
        message: String(error),
      });
    }
  }

  async function confirmRemoveLoginItem(name: string) {
    const confirmed = await confirmAlert({
      title: `Remove login item "${name}"?`,
      message: "It will no longer launch automatically at login.",
      primaryAction: { title: "Remove", style: Alert.ActionStyle.Destructive },
    });
    if (!confirmed) return;

    try {
      removeLoginItem(name);
      await showToast({ style: Toast.Style.Success, title: `Removed ${name}` });
      refreshStatic();
    } catch (error) {
      const message = String(error);
      const needsPermission = isAutomationError(message);
      await showToast({
        style: Toast.Style.Failure,
        title: needsPermission ? "Automation permission required" : "Failed to remove login item",
        message,
        primaryAction: needsPermission
          ? {
              title: "Open Automation Settings",
              onAction: () => open(AUTOMATION_SETTINGS_URL),
            }
          : undefined,
      });
    }
  }

  async function confirmDisableAgent(agent: LaunchAgentInfo) {
    const confirmed = await confirmAlert({
      title: `Disable "${agent.label}"?`,
      message: "It will be unloaded and moved to a backup folder (reversible).",
      primaryAction: { title: "Disable", style: Alert.ActionStyle.Destructive },
    });
    if (!confirmed) return;

    try {
      disableLaunchAgent(agent);
      await showToast({
        style: Toast.Style.Success,
        title: `Disabled ${agent.label}`,
      });
      refreshStatic();
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to disable agent",
        message: String(error),
      });
    }
  }

  function portAccessories(server: DevServerInfo) {
    const staleness = uptimeColor(server.etime);
    const usage = { text: `${server.cpu.toFixed(1)}% · ${server.rssMB} MB` };
    if (!staleness) return [usage];

    return [
      {
        icon: { source: Icon.Clock, tintColor: staleness },
        text: server.etime,
        tooltip: "Been running a while — still needed?",
      },
      usage,
    ];
  }

  return (
    <List isLoading={isLoading}>
      <List.Section title="Top Processes" subtitle={`${processes.length}`}>
        {errors.processes && <SectionError message={errors.processes} onRefresh={refresh} />}
        {processes.map((process) => (
          <List.Item
            key={process.pid}
            icon={{
              source: Icon.CircleFilled,
              tintColor: cpuColor(process.cpu),
            }}
            title={process.name}
            subtitle={`PID ${process.pid} · ${process.rssMB} MB`}
            accessories={[{ text: `${process.cpu.toFixed(1)}%` }]}
            actions={
              <ActionPanel>
                <Action
                  title="Kill Process"
                  icon={Icon.XMarkCircle}
                  style={Action.Style.Destructive}
                  onAction={() => confirmKill(process)}
                />
                <Action.CopyToClipboard title="Copy Pid" content={process.pid} />
                <SharedActions onCopyReport={copyReport} onRefresh={refresh} />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>

      <List.Section title="Listening Ports" subtitle={`${devServers.length}`}>
        {errors.devServers && <SectionError message={errors.devServers} onRefresh={refresh} />}
        {devServers.map((server) => (
          <List.Item
            key={server.pid}
            icon={{ source: Icon.Globe, tintColor: cpuColor(server.cpu) }}
            title={server.name}
            subtitle={`:${server.ports.join(", :")} · PID ${server.pid} · up ${server.etime}`}
            keywords={server.ports.map(String)}
            accessories={portAccessories(server)}
            actions={
              <ActionPanel>
                <Action
                  title="Kill Process"
                  icon={Icon.XMarkCircle}
                  style={Action.Style.Destructive}
                  onAction={() => confirmKill(server)}
                />
                <Action.CopyToClipboard title="Copy Port" content={server.ports.join(", ")} />
                <SharedActions onCopyReport={copyReport} onRefresh={refresh} />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>

      <List.Section title="Login Items" subtitle={`${loginItems.length}`}>
        {errors.loginItems && <SectionError message={errors.loginItems} onRefresh={refresh} />}
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
                  onAction={() => confirmRemoveLoginItem(name)}
                />
                <SharedActions onCopyReport={copyReport} onRefresh={refresh} />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>

      <List.Section title="User Launch Agents" subtitle={`${agents.length} loaded`}>
        {errors.agents && <SectionError message={errors.agents} onRefresh={refresh} />}
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
                  onAction={() => confirmDisableAgent(agent)}
                />
                <Action.ShowInFinder title="Show Plist in Finder" path={agent.path} />
                <SharedActions onCopyReport={copyReport} onRefresh={refresh} />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
    </List>
  );
}
