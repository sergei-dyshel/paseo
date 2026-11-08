# Notifications

Use `notification-open` for OS notification taps. It owns delivery, parsing,
process-local deduplication, startup readiness, and native acknowledgement.
Keep agent and workspace navigation in their existing navigation modules.
Import the pure API from `@/notification-open` and the app-shell component from
`@/notification-open/react`; senders must not load the React routing runtime.

Agent payloads name a host and agent. Ignore their workspace hint when opening:
the agent can move after a notification is sent. Use `navigateToAgent`, which
uses the current store record or the agent route to resolve the workspace from
the host. Terminal payloads name their workspace and use `navigateToWorkspace`.

See [agent targets and deferred opens](expo-router.md#agent-targets) for route
ownership and workspace recovery. Notification generation, presence, and push
eligibility remain daemon concerns.

## Native delivery

Keep the router instance at module scope. Android's `singleTask` Activity can
finish on Back while its JS context remains alive. A React ref is lost when the
root remounts; process-local handled IDs must survive that remount.

Clear `lastNotificationResponse` after dispatch. Reading a launch response does
not acknowledge it. Without clearing it, a later Activity launch can reopen the
old agent.

With expo-notifications 57, Android also replays its pending response list to
new native listeners. Clearing the last response does not drain that list.
Deduplication covers listener registration within one JS context. A development
JS reload creates another context and can replay a cold-launch response; do not
add persisted handled IDs to compensate. Recheck this limitation when upgrading
expo-notifications.

iOS drains pending responses when its delegate first handles them. Push data
read by Expo arrives under `userInfo.body`; simulator payloads must match:

```json
{
  "aps": { "alert": { "title": "Agent finished", "body": "Open the agent" }, "sound": "default" },
  "body": {
    "serverId": "host",
    "workspaceId": "workspace",
    "agentId": "agent",
    "reason": "finished"
  }
}
```

An Android FCM launch intent needs `google.message_id` and a JSON `body` extra.
An arbitrary Activity launch with data extras does not exercise Expo's FCM path.

Foreground pushes remain in Notification Center without a banner or sound.
This preserves notifications sent with stale presence information.

## Desktop delivery

The daemon's notification title and body preview the agent's last message; that copy is
for mobile push. The desktop composes its own text from the records the renderer already
holds (`packages/app/src/utils/agent-attention-notification-text.ts`): the project name as
the title, the workspace name as the macOS subtitle when it differs from the tab name, and
`<tab name>: <event>` as the body, where the event is `Finished`, `Finished (have BG tasks)`
when the agent's snapshot still reports [background work](agent-lifecycle.md#workspace-activity),
or the permission request's kind and tool name (`Permission: Bash`, `Question: AskUserQuestion`).
The daemon appends the same `(have BG tasks)` marker to its push body. Notifications carry a
`groupId` per workspace so a busy workspace stacks in Notification Center, and an `id` per
agent so a newer notification replaces that agent's older one. The daemon's `data` is kept
as-is because click routing reads it. The browser fallback has no subtitle or group, so it
folds the subtitle into the body and maps `id` to the W3C `tag`.

Electron main shows desktop notifications (`packages/desktop/src/features/notifications.ts`)
and dismisses every outstanding one when any Paseo window gains focus. Once the user is
looking at the app the banners are stale, and leaving them in Notification Center means a
later click opens an agent the user has already moved past. A click on a notification
focuses the window first, so the dismissal runs before the click payload is delivered;
that is safe because the clicked notification is already gone from Notification Center
and Electron's `close()` on it is a no-op.

## Startup and verification

Wait for the root navigator, host registry, remembered selection, and startup
redirects before handing off a tap. A compact agent route must demand the host's
directory itself; its sidebar can be closed for the entire cold launch.

Verify warm and cold taps, stale and missing workspace hints, two distinct taps,
and Android Back followed by launcher reopen or a different notification tap. Check the focused tab and every
workspace's saved layout, since a foreign pinned tab survives navigation.
Use the daemon's payload shape on both iOS and Android; a browser event alone
does not test native replay or acknowledgement.

Existing foreign pins belong to the reconciliation fix in
[#6900](https://github.com/getpaseo/paseo/issues/6900). Desktop main-process window
selection is tracked separately in
[#6875](https://github.com/getpaseo/paseo/issues/6875).
