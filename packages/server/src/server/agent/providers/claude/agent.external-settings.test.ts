import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { createTestLogger } from "../../../../test-utils/test-logger.js";
import type { AgentStreamEvent } from "../../agent-sdk-types.js";
import { ClaudeAgentClient } from "./agent.js";
import { claudeProjectDirSync } from "./project-dir.js";

/**
 * A terminal `claude --resume` on a Paseo session leaves its mode, model, and effort in the
 * transcript. Resume and import take those over Paseo's own record when the terminal wrote
 * last; Paseo's own records never count as a change.
 */

const SESSION_CWD = "/tmp/paseo-claude-external-settings";

type TranscriptRecord = Record<string, unknown>;

let configDir: string;

function paseoTurn(input: { mode: string; model: string; effort: string }): TranscriptRecord[] {
  return [
    {
      type: "user",
      entrypoint: "Paseo",
      permissionMode: input.mode,
      message: { role: "user", content: "from paseo" },
      cwd: SESSION_CWD,
    },
    {
      type: "assistant",
      entrypoint: "Paseo",
      effort: input.effort,
      message: { role: "assistant", model: input.model, content: [{ type: "text", text: "ok" }] },
      cwd: SESSION_CWD,
    },
  ];
}

function terminalTurn(input: { mode: string; model: string; effort: string }): TranscriptRecord[] {
  return [
    { type: "permission-mode", permissionMode: input.mode },
    {
      type: "user",
      entrypoint: "cli",
      permissionMode: input.mode,
      promptSource: "typed",
      message: { role: "user", content: "from the terminal" },
      cwd: SESSION_CWD,
    },
    {
      type: "assistant",
      entrypoint: "cli",
      effort: input.effort,
      message: { role: "assistant", model: input.model, content: [{ type: "text", text: "ok" }] },
      cwd: SESSION_CWD,
    },
  ];
}

async function writeTranscript(sessionId: string, records: TranscriptRecord[]): Promise<void> {
  const projectDir = claudeProjectDirSync(SESSION_CWD, { configDir });
  await fs.mkdir(projectDir, { recursive: true });
  await fs.writeFile(
    path.join(projectDir, `${sessionId}.jsonl`),
    `${records
      .map((record) => ({ ...record, sessionId }))
      .map((r) => JSON.stringify(r))
      .join("\n")}\n`,
  );
}

function createClient() {
  return new ClaudeAgentClient({
    logger: createTestLogger(),
    queryFactory: vi.fn(() => {
      throw new Error("resume must not start a query");
    }),
    resolveBinary: async () => "/test/claude/bin",
  });
}

const PASEO_RECORD = {
  modeId: "bypassPermissions",
  model: "claude-opus-5-5",
  thinkingOptionId: "max",
};

async function resume(sessionId: string) {
  const session = await createClient().resumeSession(
    {
      provider: "claude",
      sessionId,
      nativeHandle: sessionId,
      metadata: { provider: "claude", cwd: SESSION_CWD, ...PASEO_RECORD },
    },
    { cwd: SESSION_CWD, ...PASEO_RECORD },
  );
  const startupEvents: AgentStreamEvent[] = [];
  session.subscribe((event) => startupEvents.push(event));
  return { session, startupEvents };
}

beforeEach(async () => {
  configDir = await fs.mkdtemp(path.join(os.tmpdir(), "paseo-claude-external-"));
  vi.stubEnv("CLAUDE_CONFIG_DIR", configDir);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await fs.rm(configDir, { recursive: true, force: true });
});

describe("resuming a Claude session the terminal used last", () => {
  test("takes the terminal's mode, model, and effort over Paseo's record", async () => {
    const sessionId = "terminal-wrote-last";
    await writeTranscript(sessionId, [
      ...paseoTurn({ mode: "bypassPermissions", model: "claude-opus-5-5", effort: "max" }),
      ...terminalTurn({ mode: "plan", model: "claude-sonnet-4-5", effort: "xhigh" }),
    ]);

    const { session, startupEvents } = await resume(sessionId);
    try {
      expect(await session.getCurrentMode()).toBe("plan");
      expect(await session.getRuntimeInfo()).toMatchObject({
        model: "claude-sonnet-4-5",
        modeId: "plan",
      });
      expect(session.describePersistence()?.metadata).toMatchObject({
        modeId: "plan",
        model: "claude-sonnet-4-5",
        thinkingOptionId: "xhigh",
      });
      expect(startupEvents).toEqual([
        expect.objectContaining({ type: "mode_changed", currentModeId: "plan" }),
        expect.objectContaining({
          type: "model_changed",
          runtimeInfo: expect.objectContaining({ model: "claude-sonnet-4-5", modeId: "plan" }),
        }),
        expect.objectContaining({ type: "thinking_option_changed", thinkingOptionId: "xhigh" }),
      ]);
    } finally {
      await session.close();
    }
  });

  test("keeps Paseo's record when Paseo wrote last", async () => {
    const sessionId = "paseo-wrote-last";
    await writeTranscript(sessionId, [
      ...terminalTurn({ mode: "plan", model: "claude-sonnet-4-5", effort: "xhigh" }),
      ...paseoTurn({ mode: "bypassPermissions", model: "claude-opus-5-5", effort: "max" }),
    ]);

    const { session, startupEvents } = await resume(sessionId);
    try {
      expect(await session.getCurrentMode()).toBe("bypassPermissions");
      expect(session.describePersistence()?.metadata).toMatchObject(PASEO_RECORD);
      expect(startupEvents).toEqual([]);
    } finally {
      await session.close();
    }
  });

  test("a mode switched after the terminal's last prompt still carries over", async () => {
    const sessionId = "mode-after-last-prompt";
    await writeTranscript(sessionId, [
      ...paseoTurn({ mode: "bypassPermissions", model: "claude-opus-5-5", effort: "max" }),
      ...terminalTurn({ mode: "default", model: "claude-opus-5-5", effort: "max" }),
      { type: "permission-mode", permissionMode: "acceptEdits" },
    ]);

    const { session, startupEvents } = await resume(sessionId);
    try {
      expect(await session.getCurrentMode()).toBe("acceptEdits");
      expect(startupEvents.map((event) => event.type)).toEqual(["mode_changed"]);
    } finally {
      await session.close();
    }
  });

  test("ignores a mode or effort Paseo does not know", async () => {
    const sessionId = "unknown-values";
    await writeTranscript(sessionId, [
      ...paseoTurn({ mode: "bypassPermissions", model: "claude-opus-5-5", effort: "max" }),
      ...terminalTurn({ mode: "dontAsk", model: "claude-opus-5-5", effort: "turbo" }),
    ]);

    const { session, startupEvents } = await resume(sessionId);
    try {
      expect(await session.getCurrentMode()).toBe("bypassPermissions");
      expect(session.describePersistence()?.metadata).toMatchObject(PASEO_RECORD);
      expect(startupEvents).toEqual([]);
    } finally {
      await session.close();
    }
  });
});

describe("importing a Claude session", () => {
  test("stores the mode, model, and effort the session last ran with", async () => {
    const sessionId = "imported-terminal-session";
    await writeTranscript(
      sessionId,
      terminalTurn({ mode: "acceptEdits", model: "claude-sonnet-4-5", effort: "low" }),
    );

    const imported = await createClient().importSession(
      { providerHandleId: sessionId, cwd: SESSION_CWD },
      {
        // The manager fills the catalog default in before import; the session's own wins.
        config: { provider: "claude", cwd: SESSION_CWD, model: "claude-opus-5-5" },
        storedConfig: { provider: "claude", cwd: SESSION_CWD, model: "claude-opus-5-5" },
      },
    );
    try {
      expect(imported.config).toMatchObject({
        modeId: "acceptEdits",
        model: "claude-sonnet-4-5",
        thinkingOptionId: "low",
      });
      expect(imported.persistence.metadata).toMatchObject({
        modeId: "acceptEdits",
        model: "claude-sonnet-4-5",
        thinkingOptionId: "low",
      });
      expect(await imported.session.getCurrentMode()).toBe("acceptEdits");
    } finally {
      await imported.session.close();
    }
  });

  test("leaves the config alone when the transcript carries no settings", async () => {
    const sessionId = "imported-bare-session";
    await writeTranscript(sessionId, [
      { type: "user", message: { role: "user", content: "hello" }, cwd: SESSION_CWD },
    ]);

    const imported = await createClient().importSession(
      { providerHandleId: sessionId, cwd: SESSION_CWD },
      {
        config: { provider: "claude", cwd: SESSION_CWD, model: "claude-opus-5-5" },
        storedConfig: { provider: "claude", cwd: SESSION_CWD, model: "claude-opus-5-5" },
      },
    );
    try {
      expect(imported.config).toEqual({
        provider: "claude",
        cwd: SESSION_CWD,
        model: "claude-opus-5-5",
      });
    } finally {
      await imported.session.close();
    }
  });
});
