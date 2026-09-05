import { useCallback, useEffect, useRef, useState } from "react";
import { getProcessSnapshot, getTopProcesses } from "../lib/processes";
import { getListeningPorts } from "../lib/ports";
import { getLoginItems } from "../lib/loginItems";
import { getUserLaunchAgents } from "../lib/launchAgents";
import type { DevServerInfo, LaunchAgentInfo, ProcessInfo, SectionKey } from "../types";

const LIVE_REFRESH_MS = 4_000;

type Errors = Partial<Record<SectionKey, string>>;

export interface SystemSnapshot {
  isLoading: boolean;
  processes: ProcessInfo[];
  devServers: DevServerInfo[];
  loginItems: string[];
  agents: LaunchAgentInfo[];
  errors: Errors;
  /** Re-reads everything, including the slow sources. */
  refresh: () => void;
  /** Re-reads only login items and launch agents, after one is changed. */
  refreshStatic: () => void;
}

export function useSystemSnapshot(): SystemSnapshot {
  const [isLoading, setIsLoading] = useState(true);
  const [processes, setProcesses] = useState<ProcessInfo[]>([]);
  const [devServers, setDevServers] = useState<DevServerInfo[]>([]);
  const [loginItems, setLoginItems] = useState<string[]>([]);
  const [agents, setAgents] = useState<LaunchAgentInfo[]>([]);
  const [errors, setErrors] = useState<Errors>({});

  const setSectionError = useCallback((key: SectionKey, error: unknown) => {
    const message = error === undefined ? undefined : String(error);
    setErrors((previous) => {
      if (previous[key] === message) return previous;
      const next = { ...previous };
      if (message === undefined) delete next[key];
      else next[key] = message;
      return next;
    });
  }, []);

  /**
   * Live data, safe to poll: a single `ps` snapshot feeds both the process list
   * and the port list, so a tick costs one `ps` plus one `lsof`.
   */
  const refreshLive = useCallback(() => {
    let snapshot: Map<string, ProcessInfo>;
    try {
      snapshot = getProcessSnapshot();
      setProcesses(getTopProcesses(snapshot));
      setSectionError("processes", undefined);
    } catch (error) {
      setSectionError("processes", error);
      return;
    }

    try {
      setDevServers(getListeningPorts(snapshot));
      setSectionError("devServers", undefined);
    } catch (error) {
      setSectionError("devServers", error);
    }
  }, [setSectionError]);

  /**
   * Login items and launch agents only change when the user changes them, and
   * the AppleScript round-trip alone costs ~270ms — far too expensive to run
   * on every tick.
   */
  const refreshStatic = useCallback(() => {
    try {
      setLoginItems(getLoginItems());
      setSectionError("loginItems", undefined);
    } catch (error) {
      setSectionError("loginItems", error);
    }

    try {
      setAgents(getUserLaunchAgents());
      setSectionError("agents", undefined);
    } catch (error) {
      setSectionError("agents", error);
    }
  }, [setSectionError]);

  const refresh = useCallback(() => {
    refreshLive();
    refreshStatic();
  }, [refreshLive, refreshStatic]);

  const refreshLiveRef = useRef(refreshLive);
  refreshLiveRef.current = refreshLive;

  useEffect(() => {
    refreshLive();
    refreshStatic();
    setIsLoading(false);
  }, [refreshLive, refreshStatic]);

  useEffect(() => {
    // Chained timeout rather than setInterval: a slow tick delays the next one
    // instead of stacking on top of it.
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;

    const tick = () => {
      if (cancelled) return;
      refreshLiveRef.current();
      timer = setTimeout(tick, LIVE_REFRESH_MS);
    };

    timer = setTimeout(tick, LIVE_REFRESH_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  return {
    isLoading,
    processes,
    devServers,
    loginItems,
    agents,
    errors,
    refresh,
    refreshStatic,
  };
}
