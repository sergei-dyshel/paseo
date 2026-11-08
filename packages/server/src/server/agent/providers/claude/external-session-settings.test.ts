import { describe, expect, test } from "vitest";

import {
  ClaudeExternalSessionSettingsTracker,
  isPaseoWrittenClaudeRecord,
} from "./external-session-settings.js";

function paseoUser(permissionMode: string) {
  return { type: "user", entrypoint: "Paseo", permissionMode, message: { role: "user" } };
}

function paseoAssistant(model: string, effort: string) {
  return { type: "assistant", entrypoint: "Paseo", effort, message: { model } };
}

function cliUser(permissionMode: string) {
  return { type: "user", entrypoint: "cli", permissionMode, message: { role: "user" } };
}

function cliAssistant(model: string, effort: string | null) {
  return {
    type: "assistant",
    entrypoint: "cli",
    ...(effort === null ? {} : { effort }),
    message: { model },
  };
}

function track(records: Record<string, unknown>[]) {
  const tracker = new ClaudeExternalSessionSettingsTracker();
  for (const record of records) tracker.observe(record);
  return tracker.result();
}

describe("ClaudeExternalSessionSettingsTracker", () => {
  test("reads the mode, model, and effort the TUI last used after Paseo's last record", () => {
    expect(
      track([
        paseoUser("bypassPermissions"),
        paseoAssistant("claude-opus-5-5", "max"),
        { type: "permission-mode", permissionMode: "plan" },
        cliUser("plan"),
        cliAssistant("claude-sonnet-4-5", "xhigh"),
      ]),
    ).toEqual({ modeId: "plan", model: "claude-sonnet-4-5", effort: "xhigh" });
  });

  test("reports nothing when Paseo wrote last", () => {
    expect(
      track([
        { type: "permission-mode", permissionMode: "plan" },
        cliUser("plan"),
        cliAssistant("claude-sonnet-4-5", "xhigh"),
        paseoUser("bypassPermissions"),
        paseoAssistant("claude-opus-5-5", "max"),
      ]),
    ).toEqual({ modeId: null, model: null, effort: null });
  });

  test("a permission-mode record after the last prompt wins over the prompt's mode", () => {
    expect(
      track([cliUser("default"), { type: "permission-mode", permissionMode: "acceptEdits" }])
        .modeId,
    ).toBe("acceptEdits");
  });

  test("keeps the last real model and effort across records that carry none", () => {
    expect(
      track([
        cliAssistant("claude-sonnet-4-5", "high"),
        cliAssistant("<synthetic>", null),
        { type: "assistant", entrypoint: "cli", message: {} },
      ]),
    ).toEqual({ modeId: null, model: "claude-sonnet-4-5", effort: "high" });
  });

  test("ignores sidechain records", () => {
    expect(track([{ ...cliAssistant("claude-sonnet-4-5", "high"), isSidechain: true }])).toEqual({
      modeId: null,
      model: null,
      effort: null,
    });
  });

  test("ignores records that carry no settings", () => {
    expect(
      track([
        { type: "mode", mode: "normal" },
        { type: "custom-title", customTitle: "x" },
        { type: "cost-state" },
        { type: "user", entrypoint: "cli", message: { role: "user" } },
      ]),
    ).toEqual({ modeId: null, model: null, effort: null });
  });

  test("records with no entrypoint count as written outside Paseo", () => {
    expect(isPaseoWrittenClaudeRecord({ type: "permission-mode" })).toBe(false);
    expect(isPaseoWrittenClaudeRecord({ type: "user", entrypoint: "cli" })).toBe(false);
    expect(isPaseoWrittenClaudeRecord({ type: "user", entrypoint: "sdk-cli" })).toBe(false);
    expect(isPaseoWrittenClaudeRecord({ type: "user", entrypoint: "Paseo" })).toBe(true);
  });

  // COMPAT(claude-paseo-entrypoint)
  test("counts the SDK's default entrypoint as Paseo's for transcripts written before #7976", () => {
    expect(isPaseoWrittenClaudeRecord({ type: "user", entrypoint: "sdk-ts" })).toBe(true);
    expect(
      track([
        cliAssistant("claude-sonnet-4-5", "xhigh"),
        { ...paseoAssistant("claude-opus-5-5", "max"), entrypoint: "sdk-ts" },
      ]),
    ).toEqual({ modeId: null, model: null, effort: null });
  });
});
