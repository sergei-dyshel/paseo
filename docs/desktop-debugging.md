# Desktop debugging

Where the desktop app's state and logs live, and how to follow one event across the
daemon, Electron, and macOS. For dev-server ports and `PASEO_HOME` resolution see
[development.md](development.md); for the notification design see
[notifications.md](notifications.md).

## Where things are

| What                           | Path                                                                                              |
| ------------------------------ | ------------------------------------------------------------------------------------------------- |
| Packaged daemon log            | `~/.paseo/daemon.log`, rotated to `YYYYMMDD-HHMM-01-daemon.log`; `daemon.log.txt` lists rotations |
| Dev daemon log (`npm run dev`) | `<checkout>/.dev/paseo-home/daemon.log`                                                           |
| Electron main-process log      | `~/Library/Logs/Paseo/main.log`                                                                   |
| Desktop settings               | `~/Library/Application Support/Paseo/desktop-settings.json`                                       |
| Renderer `userData`            | `~/Library/Application Support/Paseo` (shared by every bundle named "Paseo")                      |

Rotation can happen while you read: copy the file first.

## Reading `daemon.log`

The file mixes two formats. Supervisor lines and older workers write JSON
(`{"level":30,"time":1791954520627,...}`); the current worker writes pino-pretty with ANSI
colors (`[HH:MM:SS.mmm] INFO: msg {json}`). Strip the colors before grepping:

```bash
sed -E 's/\x1b\[[0-9;]*m//g' ~/.paseo/daemon.log > /tmp/daemon.log
```

Pretty timestamps are local time; Claude Code's transcript `timestamp` fields and
`~/.claude/sessions/*.json` epoch values are UTC. Convert before correlating the two.

Steady-state traffic is not logged line by line. The only trace is `ws_runtime_metrics`,
emitted every 30 s, with per-window counts in `inboundSessionRequestTypesTop`,
`outboundSessionMessageTypesTop`, and `outboundAgentStreamTypesTop` (for example
`turn_completed`, `agent_attention_required`, `client_heartbeat`). Each list keeps the top
20 types, so a count-1 message type can drop out of a busy window. Those lines are several
kilobytes each and match almost any keyword, so `grep -v ws_runtime_metrics` first when
looking for events.

Clients in the log: the Electron renderer connects with `origin: "paseo://app"` and a
`Paseo/<version> ... Electron/` user agent; the CLI uses the id in `~/.paseo/cli-client-id`;
plugin sockets are `peer: "local_ipc"`. A run of `Closing physical WebSocket with expired
application lease` for the Electron client every few minutes is Chromium throttling a
hidden renderer's timers past the 45 s ping lease, not a daemon fault.

## Following a notification

A desktop notification crosses three processes. Each leaves its own record:

1. **Daemon decides.** `agent_attention_plan` (info) in `daemon.log` lists every candidate
   client's `appVisible`, `focusedAgentId`, and activity age, plus which one got
   `shouldNotify`. The rule is in `packages/server/src/server/agent-attention-policy.ts`:
   a present client that is visible and focused on the agent suppresses everyone.
2. **Renderer composes and sends.** `packages/app/src/contexts/session-context.tsx`
   re-checks focus, then calls the Electron bridge. Nothing is logged here; if the plan
   said `shouldNotify` and macOS saw nothing, this gate is the suspect.
3. **macOS receives.** The unified log records every request Electron submitted and what
   Notification Center did with it:

```bash
log show --last 1h --style compact \
  --predicate 'process == "Paseo" AND eventMessage CONTAINS "sh.paseo.desktop"'
log show --last 1h --style compact --info \
  --predicate '(process == "usernoted" OR process == "NotificationCenter") AND eventMessage CONTAINS "sh.paseo.desktop"'
```

`displaying as alert` means it was shown; `User clicked to delete` means the user
dismissed it. Use `sh.paseo.desktop.dev` for the developer build.

## Two bundles, one bundle id

macOS resolves notification clicks, deep links, and Dock activation by bundle id. With two
copies of `sh.paseo.desktop` registered (an installed app plus a local build), a click
launches whichever one Launch Services prefers; the launched copy loses the single-instance
lock, forwards to the running copy as a bare relaunch, and the running copy opens an empty
window. Keep one production-identity bundle on the machine and use
[`build:desktop:dev`](development.md#local-macos-app-builds) for anything you run next to it.
Check what is registered with `mdfind "kMDItemCFBundleIdentifier == 'sh.paseo.desktop'"`.

## Inspecting a built bundle

Verify a bundle without launching it. Launching a second desktop instance disturbs the
user's running app and competes for the single-instance lock, so ask before you `open` one.

```bash
A="$PWD/packages/desktop/dev/mac-arm64/Paseo.app"
ASAR="$PWD/node_modules/.bin/asar"
/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$A/Contents/Info.plist"
codesign -d --verbose=2 "$A" 2>&1 | grep flags       # 0x2(adhoc) = hardened runtime off
(cd "$(mktemp -d)" && "$ASAR" extract-file "$A/Contents/Resources/app.asar" package.json && cat package.json)
```

`asar extract-file` writes into the current directory. Run it from a temp directory: from
the repo root or a package directory it overwrites that directory's `package.json`. Use the
pinned `node_modules/.bin/asar`; `npx @electron/asar` outside the repo prompts to download a
different version.
