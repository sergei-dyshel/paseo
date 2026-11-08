import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { createTestLogger } from "../test-utils/test-logger.js";
import { AgentManager } from "./agent/agent-manager.js";
import { AgentStorage } from "./agent/agent-storage.js";
import { createTestAgentClient } from "./test-utils/fake-agent-client.js";
import {
  createPersistedWorkspaceRecord,
  FileBackedWorkspaceRegistry,
  type PersistedWorkspaceRecord,
} from "./workspace-registry.js";
import {
  renameAgentsNamedAfterWorkspace,
  renameWorkspaceNamedAfterAgent,
} from "./workspace-title-sync.js";

const logger = createTestLogger();
const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (cleanups.length > 0) {
    await cleanups.pop()?.();
  }
});

function makeTempDir(prefix: string): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  cleanups.push(async () => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function workspace(
  input: Pick<PersistedWorkspaceRecord, "workspaceId" | "title"> & { displayName?: string },
): PersistedWorkspaceRecord {
  return createPersistedWorkspaceRecord({
    workspaceId: input.workspaceId,
    projectId: "prj_title_sync",
    cwd: "/repo",
    kind: "local_checkout",
    displayName: input.displayName ?? "main",
    title: input.title,
    createdAt: "2026-11-01T10:00:00.000Z",
    updatedAt: "2026-11-01T10:00:00.000Z",
  });
}

test("a renamed agent carries its new title to the workspace named after it, and only that one", async () => {
  const registry = new FileBackedWorkspaceRegistry(
    join(makeTempDir("workspace-title-sync-registry-"), "workspaces.json"),
    logger,
  );
  await registry.upsert(workspace({ workspaceId: "wks_named", title: "Fix login" }));
  await registry.upsert(workspace({ workspaceId: "wks_other", title: "Payments" }));
  // Shows the same text, but as its branch name: it is not named after any agent.
  await registry.upsert(
    workspace({ workspaceId: "wks_branch", title: null, displayName: "Fix login" }),
  );
  const deps = { workspaceRegistry: registry };
  const rename = { previousTitle: "Fix login", title: "Login retries" };

  const renamed = await renameWorkspaceNamedAfterAgent(deps, {
    workspaceId: "wks_named",
    ...rename,
  });

  expect(renamed).toMatchObject({ workspaceId: "wks_named", title: "Login retries" });
  expect((await registry.get("wks_named"))?.title).toBe("Login retries");
  expect(
    await renameWorkspaceNamedAfterAgent(deps, { workspaceId: "wks_other", ...rename }),
  ).toBeNull();
  expect((await registry.get("wks_other"))?.title).toBe("Payments");
  expect(
    await renameWorkspaceNamedAfterAgent(deps, { workspaceId: "wks_branch", ...rename }),
  ).toBeNull();
  expect((await registry.get("wks_branch"))?.title).toBeNull();
  expect(
    await renameWorkspaceNamedAfterAgent(deps, { workspaceId: undefined, ...rename }),
  ).toBeNull();
});

test("a renamed workspace carries its new title to the agents named after it", async () => {
  const dir = makeTempDir("workspace-title-sync-agents-");
  const storage = new AgentStorage(join(dir, "agents"), logger);
  const agentManager = new AgentManager({
    clients: { codex: createTestAgentClient("codex") },
    registry: storage,
    logger,
  });
  cleanups.push(async () => {
    for (const agent of agentManager.listAgents()) await agentManager.closeAgent(agent.id);
    await agentManager.flush();
  });
  const createAgent = (workspaceId: string, initialTitle: string) =>
    agentManager.createAgent({ provider: "codex", cwd: dir }, undefined, {
      workspaceId,
      initialTitle,
    });
  const live = await createAgent("wks_1", "Fix login");
  const closed = await createAgent("wks_1", "Fix login");
  await agentManager.closeAgent(closed.id);
  const otherTitle = await createAgent("wks_1", "Payments");
  const otherWorkspace = await createAgent("wks_2", "Fix login");
  await agentManager.flush();
  const deps = { agentStorage: storage, agentManager, logger };

  await renameAgentsNamedAfterWorkspace(deps, {
    workspaceId: "wks_1",
    previousTitle: "Fix login",
    title: "Login retries",
  });
  await agentManager.flush();

  expect((await storage.get(live.id))?.title).toBe("Login retries");
  expect((await storage.get(closed.id))?.title).toBe("Login retries");
  expect((await storage.get(otherTitle.id))?.title).toBe("Payments");
  expect((await storage.get(otherWorkspace.id))?.title).toBe("Fix login");

  // Clearing the title returns the workspace to its derived name; nothing follows that.
  await renameAgentsNamedAfterWorkspace(deps, {
    workspaceId: "wks_1",
    previousTitle: "Login retries",
    title: null,
  });
  await agentManager.flush();
  expect((await storage.get(live.id))?.title).toBe("Login retries");
});
