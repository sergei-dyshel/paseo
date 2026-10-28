import { useMemo } from "react";
import {
  collectAllTabs,
  findPaneById,
  useWorkspaceLayoutStore,
} from "@/stores/workspace-layout-store";
import type { WorkspaceTabDescriptor } from "@/screens/workspace/workspace-tabs-types";
import { buildWorkspaceTabPersistenceKey } from "@/workspace-tabs/model";

/**
 * The tab the workspace shows when opened: the focused tab of its focused pane. Read from the
 * persisted layout, so it answers for a workspace that is not on screen.
 */
export function useWorkspaceActiveTab(input: {
  serverId: string;
  workspaceId: string;
}): WorkspaceTabDescriptor | null {
  const workspaceKey = buildWorkspaceTabPersistenceKey(input);
  // Returns the stored tab object itself, so the subscription settles while the layout is still.
  const tab = useWorkspaceLayoutStore((state) => {
    const layout = workspaceKey ? (state.layoutByWorkspace[workspaceKey] ?? null) : null;
    if (!layout) {
      return null;
    }
    const focusedTabId = findPaneById(layout.root, layout.focusedPaneId)?.focusedTabId;
    if (!focusedTabId) {
      return null;
    }
    return collectAllTabs(layout.root).find((entry) => entry.tabId === focusedTabId) ?? null;
  });
  return useMemo(
    () =>
      tab
        ? {
            key: tab.tabId,
            tabId: tab.tabId,
            kind: tab.target.kind,
            target: tab.target,
            state: tab.state,
          }
        : null,
    [tab],
  );
}
