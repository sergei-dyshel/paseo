import type {
  AgentAttentionReason,
  NotificationPermissionRequest,
} from "@getpaseo/protocol/agent-attention-notification";
import { i18n } from "@/i18n/i18next";

/**
 * What the desktop notification for an agent attention event says. The daemon also
 * builds a title and body (used for mobile push), but that body previews the agent's
 * last message. The desktop shows where the agent lives and what it wants instead:
 *
 *   title     project name
 *   subtitle  workspace name, omitted when it is the tab name (macOS only)
 *   body      "<tab name>: <event>"
 *   groupId   one thread per workspace, so a busy workspace stacks in Notification Center
 *   id        one per agent, so a newer notification replaces the agent's older one
 */
export interface AgentAttentionNotificationText {
  title: string;
  subtitle?: string;
  body: string;
  groupId: string;
  id: string;
}

export interface AgentAttentionNotificationContext {
  serverId: string;
  agentId: string;
  workspaceId: string;
  reason: AgentAttentionReason;
  /** The agent tab label, already normalized; null when the agent has no title yet. */
  tabName: string | null;
  workspaceName: string | null;
  projectName: string | null;
  permissionRequest?: NotificationPermissionRequest | null;
}

const trimToNull = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

// The request `name` is the provider's tool or request identifier (Bash,
// AskUserQuestion, request_user_input); it is interpolated, never translated.
function describePermissionEvent(
  request: NotificationPermissionRequest | null | undefined,
): string {
  const name = trimToNull(request?.name);
  const kind =
    request?.kind === "question" || request?.kind === "plan" ? request.kind : "permission";
  return name
    ? i18n.t(`desktop.notifications.event.${kind}`, { name })
    : i18n.t(`desktop.notifications.event.${kind}Unnamed`);
}

export function describeAgentAttentionEvent(
  reason: AgentAttentionReason,
  permissionRequest?: NotificationPermissionRequest | null,
): string {
  if (reason === "permission") {
    return describePermissionEvent(permissionRequest);
  }
  return i18n.t(
    reason === "error"
      ? "desktop.notifications.event.error"
      : "desktop.notifications.event.finished",
  );
}

export function buildAgentAttentionNotificationText(
  context: AgentAttentionNotificationContext,
): AgentAttentionNotificationText {
  const tabName = trimToNull(context.tabName);
  const workspaceName = trimToNull(context.workspaceName);
  const projectName = trimToNull(context.projectName);
  const event = describeAgentAttentionEvent(context.reason, context.permissionRequest);

  // Fall through the chain so the notification always names something the user
  // recognizes even when a record has not been hydrated yet.
  const subject = tabName ?? workspaceName ?? "Agent";
  const title = projectName ?? workspaceName ?? "Paseo";
  const subtitle = workspaceName && workspaceName !== subject ? workspaceName : undefined;

  return {
    title,
    ...(subtitle ? { subtitle } : {}),
    body: `${subject}: ${event}`,
    groupId: `${context.serverId}/${context.workspaceId}`,
    id: `${context.serverId}/${context.agentId}`,
  };
}
