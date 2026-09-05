import { Action, Icon } from "@raycast/api";

interface SharedActionsProps {
  onCopyReport: () => void;
  onRefresh: () => void;
}

/** The actions every row offers, so each ActionPanel doesn't repeat them. */
export function SharedActions({ onCopyReport, onRefresh }: SharedActionsProps) {
  return (
    <>
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
