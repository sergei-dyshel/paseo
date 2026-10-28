import { afterEach, describe, expect, it } from "vitest";
import { i18n } from "@/i18n/i18next";
import {
  buildAgentAttentionNotificationText,
  describeAgentAttentionEvent,
} from "./agent-attention-notification-text";

const base = {
  serverId: "srv_1",
  agentId: "agent_1",
  workspaceId: "ws_1",
  reason: "finished" as const,
  tabName: "fix notifications",
  workspaceName: "fix-notifications",
  projectName: "paseo",
};

describe("buildAgentAttentionNotificationText", () => {
  it("puts the project in the title, the workspace in the subtitle, and the tab plus event in the body", () => {
    expect(buildAgentAttentionNotificationText(base)).toEqual({
      title: "paseo",
      subtitle: "fix-notifications",
      body: "fix notifications: Finished",
      groupId: "srv_1/ws_1",
      id: "srv_1/agent_1",
    });
  });

  it("drops the subtitle when the workspace name is the tab name", () => {
    const text = buildAgentAttentionNotificationText({
      ...base,
      tabName: "fix-notifications",
    });
    expect(text.subtitle).toBeUndefined();
    expect(text.body).toBe("fix-notifications: Finished");
  });

  it("uses the workspace as the subject when the agent has no title yet", () => {
    const text = buildAgentAttentionNotificationText({ ...base, tabName: null });
    expect(text.subtitle).toBeUndefined();
    expect(text.body).toBe("fix-notifications: Finished");
  });

  it("falls back to generic labels when nothing has been hydrated", () => {
    expect(
      buildAgentAttentionNotificationText({
        ...base,
        tabName: null,
        workspaceName: null,
        projectName: "  ",
      }),
    ).toEqual({
      title: "Paseo",
      body: "Agent: Finished",
      groupId: "srv_1/ws_1",
      id: "srv_1/agent_1",
    });
  });

  it("names the tool a permission request is for", () => {
    const text = buildAgentAttentionNotificationText({
      ...base,
      reason: "permission",
      permissionRequest: { id: "p1", provider: "claude", name: "Bash", kind: "tool" },
    });
    expect(text.body).toBe("fix notifications: Permission: Bash");
  });

  it("groups notifications by workspace and keys them by agent", () => {
    const first = buildAgentAttentionNotificationText(base);
    const sameWorkspaceOtherAgent = buildAgentAttentionNotificationText({
      ...base,
      agentId: "agent_2",
    });
    expect(sameWorkspaceOtherAgent.groupId).toBe(first.groupId);
    expect(sameWorkspaceOtherAgent.id).not.toBe(first.id);
  });

  it("says a finished agent still has background work", () => {
    expect(buildAgentAttentionNotificationText({ ...base, backgroundTaskCount: 2 }).body).toBe(
      "fix notifications: Finished (have BG tasks)",
    );
    expect(buildAgentAttentionNotificationText({ ...base, backgroundTaskCount: 0 }).body).toBe(
      "fix notifications: Finished",
    );
  });
});

describe("describeAgentAttentionEvent", () => {
  it("labels each permission kind with the provider's request name", () => {
    const request = (kind: "tool" | "question" | "plan" | "mode" | "other", name: string) => ({
      id: "p",
      provider: "claude",
      name,
      kind,
    });
    expect(
      describeAgentAttentionEvent({
        reason: "permission",
        permissionRequest: request("question", "AskUserQuestion"),
      }),
    ).toBe("Question: AskUserQuestion");
    expect(
      describeAgentAttentionEvent({
        reason: "permission",
        permissionRequest: request("plan", "ExitPlanMode"),
      }),
    ).toBe("Plan approval: ExitPlanMode");
    expect(
      describeAgentAttentionEvent({
        reason: "permission",
        permissionRequest: request("mode", "Edit"),
      }),
    ).toBe("Permission: Edit");
  });

  it("stays generic when the request carries no name", () => {
    expect(describeAgentAttentionEvent({ reason: "permission", permissionRequest: null })).toBe(
      "Permission request",
    );
    expect(
      describeAgentAttentionEvent({
        reason: "permission",
        permissionRequest: { id: "p", provider: "codex", name: "  ", kind: "question" },
      }),
    ).toBe("Question");
  });

  it("describes finished and error turns", () => {
    expect(describeAgentAttentionEvent({ reason: "finished" })).toBe("Finished");
    expect(describeAgentAttentionEvent({ reason: "error" })).toBe("Error");
  });

  it("marks a finished turn that left background work running, but not an error", () => {
    expect(describeAgentAttentionEvent({ reason: "finished", backgroundTaskCount: 1 })).toBe(
      "Finished (have BG tasks)",
    );
    expect(describeAgentAttentionEvent({ reason: "error", backgroundTaskCount: 1 })).toBe("Error");
  });

  describe("in another language", () => {
    afterEach(async () => {
      await i18n.changeLanguage("en");
    });

    it("translates the event label but leaves the tool name as the provider sent it", async () => {
      await i18n.changeLanguage("ru");
      expect(describeAgentAttentionEvent({ reason: "finished" })).toBe("Завершено");
      expect(
        describeAgentAttentionEvent({
          reason: "permission",
          permissionRequest: {
            id: "p",
            provider: "claude",
            name: "AskUserQuestion",
            kind: "question",
          },
        }),
      ).toBe("Вопрос: AskUserQuestion");
    });
  });
});
