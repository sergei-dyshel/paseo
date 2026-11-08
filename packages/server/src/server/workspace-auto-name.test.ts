import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import pino from "pino";
import { afterEach, expect, test, vi } from "vitest";
import type { AgentManager } from "./agent/agent-manager.js";
import type { ProviderSnapshotManager } from "./agent/provider-snapshot-manager.js";
import { WorkspaceAutoName } from "./workspace-auto-name.js";
import {
  createPersistedWorkspaceRecord,
  type PersistedWorkspaceRecord,
  type WorkspaceRegistry,
} from "./workspace-registry.js";
import type { WorkspaceGitService } from "./workspace-git-service.js";
import {
  writePaseoWorktreeFirstAgentBranchAutoNameMetadata,
  writePaseoWorktreeMetadata,
} from "../utils/worktree-metadata.js";

function deferred(): { promise: Promise<void>; resolve(): void } {
  let resolve!: () => void;
  const promise = new Promise<void>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

const tempDirs: string[] = [];

afterEach(() => {
  vi.useRealTimers();
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

function makeTempDir(): string {
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), "workspace-auto-name-")));
  tempDirs.push(dir);
  return dir;
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, stdio: "pipe" }).toString().trim();
}

function worktreeWorkspace(cwd: string): PersistedWorkspaceRecord {
  return createPersistedWorkspaceRecord({
    workspaceId: "wks_auto_name",
    projectId: "prj_auto_name",
    cwd,
    kind: "worktree",
    displayName: "dazzling-yak",
    title: "Fix checkout flow",
    branch: "dazzling-yak",
    worktreeRoot: cwd,
    isPaseoOwnedWorktree: true,
    createdAt: "2026-08-08T00:00:00.000Z",
    updatedAt: "2026-08-08T00:00:00.000Z",
  });
}

/** A Paseo worktree just cut off a base branch: on its placeholder branch, rename pending. */
function createPendingWorktree(): PersistedWorkspaceRecord {
  const repoDir = makeTempDir();
  git(repoDir, "init");
  git(repoDir, "config", "user.email", "test@getpaseo.local");
  git(repoDir, "config", "user.name", "Paseo Test");
  git(repoDir, "config", "commit.gpgsign", "false");
  writeFileSync(path.join(repoDir, "README.md"), "hello\n");
  git(repoDir, "add", "README.md");
  git(repoDir, "commit", "-m", "initial");
  git(repoDir, "branch", "-M", "dazzling-yak");
  writePaseoWorktreeMetadata(repoDir, { baseRefName: "main" });
  writePaseoWorktreeFirstAgentBranchAutoNameMetadata(repoDir, {
    placeholderBranchName: "dazzling-yak",
  });
  return worktreeWorkspace(repoDir);
}

function createAutoName(input: {
  workspaceRegistry: Pick<WorkspaceRegistry, "update">;
  emitWorkspaceUpdateForCwd?: (cwd: string) => Promise<void>;
  gitMutations?: string[];
  generateCalls?: { count: number };
}): WorkspaceAutoName {
  return new WorkspaceAutoName({
    agentManager: {} as AgentManager,
    workspaceRegistry: input.workspaceRegistry,
    workspaceGitService: {} as WorkspaceGitService,
    providerSnapshotManager: {} as ProviderSnapshotManager,
    readDaemonConfig: () => ({}),
    gitMutation: {
      notifyGitMutation: async (_cwd, reason) => {
        input.gitMutations?.push(reason);
      },
    },
    emitWorkspaceUpdateForCwd: input.emitWorkspaceUpdateForCwd ?? (async () => {}),
    logger: pino({ level: "silent" }),
    generateWorkspaceName: async () => {
      if (input.generateCalls) input.generateCalls.count += 1;
      return { title: "Generated checkout title", branch: "fix-checkout-flow" };
    },
  });
}

test("worktree auto-name renames the placeholder branch and leaves the title to the first agent", async () => {
  let workspace = createPendingWorktree();
  const updateEmitted = deferred();
  const gitMutations: string[] = [];
  const autoName = createAutoName({
    workspaceRegistry: {
      update: async (_workspaceId, updater) => {
        workspace = updater(workspace);
        return workspace;
      },
    },
    emitWorkspaceUpdateForCwd: async () => updateEmitted.resolve(),
    gitMutations,
  });

  autoName.scheduleForWorktree({ workspace, firstAgentContext: { prompt: "Fix checkout flow" } });
  await updateEmitted.promise;

  expect(git(workspace.cwd, "branch", "--show-current")).toBe("fix-checkout-flow");
  expect(workspace).toMatchObject({ title: "Fix checkout flow", branch: "fix-checkout-flow" });
  expect(gitMutations).toEqual(["rename-branch"]);
});

test("worktree auto-name preserves workspace archival that lands during its branch write", async () => {
  let workspace = createPendingWorktree();
  const mutationStarted = deferred();
  const allowMutation = deferred();
  const updateEmitted = deferred();
  const autoName = createAutoName({
    workspaceRegistry: {
      update: async (_workspaceId, updater) => {
        mutationStarted.resolve();
        await allowMutation.promise;
        workspace = updater(workspace);
        return workspace;
      },
    },
    emitWorkspaceUpdateForCwd: async () => updateEmitted.resolve(),
  });

  autoName.scheduleForWorktree({ workspace, firstAgentContext: { prompt: "Fix checkout flow" } });
  await mutationStarted.promise;
  const archivedAt = "2026-08-08T00:01:00.000Z";
  workspace = { ...workspace, updatedAt: archivedAt, archivedAt };
  allowMutation.resolve();
  await updateEmitted.promise;

  expect(workspace).toMatchObject({ branch: "fix-checkout-flow", archivedAt });
});

test("worktree auto-name makes no model call when no branch rename is pending", async () => {
  vi.useFakeTimers();
  // A checkout of an existing branch carries no pending rename.
  const workspace = worktreeWorkspace(makeTempDir());
  const generateCalls = { count: 0 };
  let writes = 0;
  const autoName = createAutoName({
    workspaceRegistry: {
      update: async () => {
        writes += 1;
        return null;
      },
    },
    generateCalls,
  });

  autoName.scheduleForWorktree({ workspace, firstAgentContext: { prompt: "Fix checkout flow" } });
  await vi.runAllTimersAsync();

  expect(generateCalls.count).toBe(0);
  expect(writes).toBe(0);
});
