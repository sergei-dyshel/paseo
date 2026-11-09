import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import type { SidebarStateBucket } from "@/utils/sidebar-agent-state";
import { SidebarWorkspaceTitleText } from "./sidebar-workspace-title-text";

const TITLE = "Fix search";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

function renderTitle(statusBucket: SidebarStateBucket): CSSStyleDeclaration {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() =>
    root?.render(
      <SidebarWorkspaceTitleText
        label={TITLE}
        statusBucket={statusBucket}
        isHovered={false}
        isCreating={false}
      />,
    ),
  );
  const title = container.firstElementChild;
  if (!(title instanceof HTMLElement) || title.textContent !== TITLE) {
    throw new Error("The workspace title did not render");
  }
  return getComputedStyle(title);
}

describe("SidebarWorkspaceTitleText", () => {
  // The test theme carries the light status-dot band, so each title must match its row's dot.
  it.each([
    ["needs_input", "rgb(179, 120, 36)"],
    ["failed", "rgb(241, 46, 47)"],
    ["running", "rgb(38, 138, 224)"],
    ["attention", "rgb(41, 159, 81)"],
  ] as const)("draws a %s title in that status's dot color", (statusBucket, expectedColor) => {
    const title = renderTitle(statusBucket);

    expect(title.color).toBe(expectedColor);
    expect(title.opacity).toBe("1");
  });

  it("keeps an idle title in the dimmed foreground color", () => {
    const title = renderTitle("done");

    expect(title.color).toBe("rgb(17, 17, 17)");
    expect(title.opacity).toBe("0.76");
  });
});
