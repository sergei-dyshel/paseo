/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useWorkspaceLayoutStore } from "@/stores/workspace-layout-store";
import { useWorkspaceActiveTab } from "./use-workspace-active-tab";

const serverId = "server-1";
const workspaceId = "workspace-a";
const workspaceKey = `${serverId}:${workspaceId}`;

describe("useWorkspaceActiveTab", () => {
  beforeEach(() => {
    useWorkspaceLayoutStore.setState({ layoutByWorkspace: {} });
  });

  it("is null for a workspace with no layout", () => {
    const { result } = renderHook(() => useWorkspaceActiveTab({ serverId, workspaceId }));
    expect(result.current).toBeNull();
  });

  it("follows the focused tab of the focused pane, including off-screen workspaces", () => {
    const store = useWorkspaceLayoutStore;
    const agentTabId = store
      .getState()
      .openTab({ workspaceKey, target: { kind: "agent", agentId: "agent-1" }, intent: "reveal" });
    const terminalTabId = store.getState().openTab({
      workspaceKey,
      target: { kind: "terminal", terminalId: "term-1" },
      intent: "background",
    });
    if (!agentTabId || !terminalTabId) throw new Error("Expected both tabs to open");

    const { result } = renderHook(() => useWorkspaceActiveTab({ serverId, workspaceId }));
    expect(result.current).toMatchObject({
      tabId: agentTabId,
      kind: "agent",
      target: { kind: "agent", agentId: "agent-1" },
    });
    const first = result.current;

    // Unrelated layout churn keeps the same descriptor object.
    act(() => {
      store.getState().openTab({
        workspaceKey: `${serverId}:other-workspace`,
        target: { kind: "agent", agentId: "agent-elsewhere" },
        intent: "reveal",
      });
    });
    expect(result.current).toBe(first);

    act(() => {
      store.getState().focusTab(workspaceKey, terminalTabId);
    });
    expect(result.current).toMatchObject({
      tabId: terminalTabId,
      kind: "terminal",
      target: { kind: "terminal", terminalId: "term-1" },
    });
  });
});
