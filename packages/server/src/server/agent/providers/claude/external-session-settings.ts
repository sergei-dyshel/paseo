import { resolveObservedClaudeModelId } from "./models.js";
import type { ClaudeReplayEntry } from "./subagents/replay-source.js";

/**
 * Mode, model, and effort a Claude session last ran with outside Paseo.
 *
 * A terminal `claude --resume <id>` on a Paseo session appends to the same transcript, and
 * nothing it sets reaches Paseo's own record: the TUI keeps its mode in `permission-mode`
 * records and on each prompt's `permissionMode`, and stamps `message.model` and `effort` on
 * every assistant record. Paseo pins all three at launch, so without reading them back a
 * resume silently reverts whatever the user chose in the terminal.
 *
 * Only records written after Paseo's last record count. Paseo's SDK process stamps
 * `entrypoint: "Paseo"` on the records it writes (see `query.ts`) and never writes
 * `permission-mode` records, so a record after Paseo's last one was written by another
 * process. Paseo's own earlier turns say nothing new: a value Paseo applied is already in
 * its record, and a value Paseo changed without running a turn is not in the transcript at
 * all. Each value is the last one seen; a value Paseo later wrote resets all three.
 */
export interface ClaudeExternalSessionSettings {
  modeId: string | null;
  model: string | null;
  effort: string | null;
}

const PASEO_ENTRYPOINT = "Paseo";

// COMPAT(claude-paseo-entrypoint): records Paseo wrote before #7976 (2026-10-27) carry the
// SDK's default `sdk-ts`. Counting them as Paseo's keeps an old Paseo turn from being read
// back as a change made elsewhere. Remove after 2027-02-01, when such transcripts are stale.
const LEGACY_PASEO_ENTRYPOINTS: ReadonlySet<string> = new Set(["sdk-ts"]);

function emptySettings(): ClaudeExternalSessionSettings {
  return { modeId: null, model: null, effort: null };
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export function isPaseoWrittenClaudeRecord(entry: ClaudeReplayEntry): boolean {
  const entrypoint = entry.entrypoint;
  return (
    typeof entrypoint === "string" &&
    (entrypoint === PASEO_ENTRYPOINT || LEGACY_PASEO_ENTRYPOINTS.has(entrypoint))
  );
}

export class ClaudeExternalSessionSettingsTracker {
  private settings = emptySettings();

  /** Feed main-thread transcript records in file order. */
  observe(entry: ClaudeReplayEntry): void {
    if (entry.isSidechain === true) return;
    if (isPaseoWrittenClaudeRecord(entry)) {
      this.settings = emptySettings();
      return;
    }
    switch (entry.type) {
      // The TUI re-emits this on every save, so it also captures a mode switched after the
      // last prompt (Shift+Tab, then quit).
      case "permission-mode":
      case "user": {
        const modeId = readString(entry.permissionMode);
        if (modeId) this.settings.modeId = modeId;
        return;
      }
      case "assistant": {
        const rawModel = entry.message?.model;
        const model = resolveObservedClaudeModelId(typeof rawModel === "string" ? rawModel : null);
        if (model) this.settings.model = model;
        const effort = readString(entry.effort);
        if (effort) this.settings.effort = effort;
        return;
      }
      default:
        return;
    }
  }

  /** Values from records after Paseo's last one; all null when Paseo wrote last. */
  result(): ClaudeExternalSessionSettings {
    return { ...this.settings };
  }
}
