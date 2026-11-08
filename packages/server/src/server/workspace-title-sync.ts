import type { Logger } from "pino";
import type { AgentManager } from "./agent/agent-manager.js";
import type { AgentStorage } from "./agent/agent-storage.js";
import type { PersistedWorkspaceRecord, WorkspaceRegistry } from "./workspace-registry.js";

// A workspace is named after an agent of its own when its title equals the agent's title.
// Creation leaves the first agent and its workspace on the same prompt line, and "Use active
// tab name" copies an agent tab's name later. Renaming either side then renames the other.
// Only the title counts: a workspace showing its branch or directory name is not named after
// anything, and clearing the title returns to that derived name rather than renaming.

/** An agent changed its title. */
export interface AgentRename {
  /** Owning workspace; a legacy agent without one has nothing to rename. */
  workspaceId: string | undefined;
  previousTitle: string | null;
  title: string;
}

/** A workspace changed its title, or had it cleared. */
export interface WorkspaceRename {
  workspaceId: string;
  previousTitle: string | null;
  title: string | null;
}

export interface RenameWorkspaceNamedAfterAgentDependencies {
  workspaceRegistry: Pick<WorkspaceRegistry, "get" | "update">;
}

export interface RenameAgentsNamedAfterWorkspaceDependencies {
  agentStorage: Pick<AgentStorage, "listByWorkspace">;
  agentManager: Pick<AgentManager, "updateAgentMetadata">;
  logger: Logger;
}

/**
 * Give a workspace named after a renamed agent the agent's new title. Returns the renamed
 * workspace, or null when the workspace was not named after that agent.
 */
export async function renameWorkspaceNamedAfterAgent(
  deps: RenameWorkspaceNamedAfterAgentDependencies,
  rename: AgentRename,
): Promise<PersistedWorkspaceRecord | null> {
  const { workspaceId, previousTitle, title } = rename;
  if (!workspaceId || !previousTitle || previousTitle === title) {
    return null;
  }
  // Most renamed agents have no workspace named after them; read before writing so those cost
  // no registry write.
  const workspace = await deps.workspaceRegistry.get(workspaceId);
  if (!workspace || workspace.archivedAt || workspace.title !== previousTitle) {
    return null;
  }
  const updatedAt = new Date().toISOString();
  const updated = await deps.workspaceRegistry.update(workspaceId, (existing) =>
    existing.title === previousTitle ? { ...existing, title, updatedAt } : existing,
  );
  return updated?.title === title ? updated : null;
}

/**
 * Give the agents named after a renamed workspace its new title.
 *
 * Call it after the workspace record is written: each agent rename reports back through
 * `renameWorkspaceNamedAfterAgent`, which then finds the workspace already on the new title and
 * leaves it alone. A failure is logged and never undoes the workspace rename.
 */
export async function renameAgentsNamedAfterWorkspace(
  deps: RenameAgentsNamedAfterWorkspaceDependencies,
  rename: WorkspaceRename,
): Promise<void> {
  const { workspaceId, previousTitle, title } = rename;
  if (!previousTitle || !title || previousTitle === title) {
    return;
  }
  let agents;
  try {
    agents = await deps.agentStorage.listByWorkspace(workspaceId);
  } catch (error) {
    deps.logger.warn({ err: error, workspaceId }, "Failed to rename agents after their workspace");
    return;
  }
  for (const agent of agents) {
    if (agent.archivedAt || agent.title !== previousTitle) {
      continue;
    }
    try {
      await deps.agentManager.updateAgentMetadata(agent.id, { title });
    } catch (error) {
      deps.logger.warn(
        { err: error, agentId: agent.id, workspaceId },
        "Failed to rename agent after its workspace",
      );
    }
  }
}
