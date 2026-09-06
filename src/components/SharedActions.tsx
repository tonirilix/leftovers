import { Action, Icon } from "@raycast/api";
import type { SortMode } from "../types";

interface SharedActionsProps {
  sortBy: SortMode;
  onToggleSort: () => void;
  onCopyReport: () => void;
  onRefresh: () => void;
}

/** The actions every row offers, so each ActionPanel doesn't repeat them. */
export function SharedActions({
  sortBy,
  onToggleSort,
  onCopyReport,
  onRefresh,
}: SharedActionsProps) {
  return (
    <>
      <Action
        // eslint-disable-next-line @raycast/prefer-title-case -- "CPU" is an acronym; the rule rewrites it to "Cpu".
        title={sortBy === "cpu" ? "Sort by Memory" : "Sort by CPU"}
        icon={sortBy === "cpu" ? Icon.MemoryChip : Icon.ComputerChip}
        shortcut={{ modifiers: ["cmd"], key: "t" }}
        onAction={onToggleSort}
      />
      <Action
        title="Copy Report"
        icon={Icon.Clipboard}
        shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
        onAction={onCopyReport}
      />
      <Action
        title="Refresh"
        icon={Icon.ArrowClockwise}
        shortcut={{ modifiers: ["cmd"], key: "r" }}
        onAction={onRefresh}
      />
    </>
  );
}
