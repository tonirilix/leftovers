# Leftovers

A Raycast extension that finds what you left running.

Activity Monitor already tells you what's using CPU *right now*. Leftovers
answers a different question: what's been running since Tuesday that you forgot
about? Dev servers still holding a port two days later, launch agents that
piled up over years of installers, login items you never knowingly approved.

It keeps nothing running in the background — nothing executes unless the
command is open.

## What it shows

| Section                | Source                           | Refresh                           |
| ---------------------- | -------------------------------- | --------------------------------- |
| **System**             | `vm_stat`, `sysctl vm.swapusage` | every 4s while open               |
| **Top Processes**      | `ps`                             | every 4s while open               |
| **Listening Ports**    | `lsof`, joined to the `ps` data  | every 4s while open               |
| **Login Items**        | `osascript` → System Events      | on open, and after you change one |
| **User Launch Agents** | `~/Library/LaunchAgents`         | on open, and after you change one |

Listening Ports exists to catch forgotten dev servers. Anything alive for 4+
hours gets a yellow clock badge, 24+ hours a red one. Ports are searchable, so
typing `5173` finds the process holding it.

The System row exists because a Mac can be audibly struggling while every CPU
figure looks calm — the cause is memory pressure and swapping, which no
per-process CPU number reveals. Pressure is called critical past 4 GB of swap
in use or under 256 MB free, elevated past 1 GB of swap or under 1 GB free.

Memory is a coloured tag on every process row (red past 1 GB, yellow past
400 MB), because a process holding gigabytes at 0% CPU sits at the bottom of a
CPU-ranked list. `⌘T` re-sorts by memory to bring those to the top.

## Actions

Every row offers **Sort by Memory / CPU** (`⌘T`), **Copy Report** (`⌘⇧C`) and
**Refresh** (`⌘R`). Per row:

- Processes / Ports — **Kill Process**, Copy PID / Copy Port
- Login Items — **Remove Login Item**
- Launch Agents — **Disable Agent**, Show Plist in Finder

Anything destructive asks for confirmation first. Disabling an agent is
reversible: the plist is moved to `~/Library/LaunchAgents/.disabled/`, so
moving it back and running `launchctl bootstrap gui/$(id -u) <path>` restores it.

## Development

```bash
npm install
npm run dev     # registers a dev extension in Raycast; keep it running
npm run build
npm run lint
```

`npm run lint` reports an invalid `author` until that field matches a real
Raycast account name. It only blocks store publishing, not local use.

Login Items needs macOS Automation permission (System Settings → Privacy &
Security → Automation → Raycast → System Events). Without it that one section
shows a prompt with a button to the right settings pane; everything else works.

## Layout

```
src/
  index.tsx                  UI composition
  types.ts                   shared shapes
  components/SharedActions   actions repeated on every row
  hooks/useSystemSnapshot    polling, refresh, per-section error state
  lib/shell.ts               the only place a subprocess is spawned
  lib/processes.ts           ps snapshot, top processes, kill
  lib/ports.ts               lsof parsing, joined to the snapshot
  lib/loginItems.ts          read/remove login items
  lib/launchAgents.ts        read/disable launch agents
  lib/system.ts              load average, free RAM, free disk
  lib/format.ts              colours, elapsed-time parsing, report text
```

Two constraints worth preserving when extending this:

1. **`lib/shell.ts` runs binaries via `execFile` with an argument array, never a
   shell string.** File names and login item names reach the command line
   verbatim, so a shell would let a name like `$(rm -rf ~)` execute. Keep new
   commands going through `run()`.
2. **A refresh tick spawns exactly two processes.** The `ps` snapshot is shared
   between the process and port sections, and the expensive AppleScript call is
   deliberately kept off the polling path. Adding a subprocess to the tick is
   the easy way to make this tool part of the problem it diagnoses.
