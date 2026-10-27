/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import type { HeartbeatPayload } from "./client-activity-tracker";
import { useClientActivity } from "./use-client-activity";

function createFakeClient() {
  const heartbeats: HeartbeatPayload[] = [];
  return {
    heartbeats,
    isConnected: true,
    sendHeartbeat(payload: HeartbeatPayload) {
      heartbeats.push(payload);
    },
    subscribeConnectionStatus(listener: (state: { status: "connected" }) => void) {
      listener({ status: "connected" });
      return () => {};
    },
    latest(): HeartbeatPayload {
      const last = heartbeats.at(-1);
      if (!last) throw new Error("Expected a heartbeat");
      return last;
    },
  };
}

// jsdom reports document.hasFocus() from its focused element and never fires window
// focus/blur on its own, so the test moves focus and dispatches the window event the
// browser would have sent alongside it.
function focusWindow(button: HTMLButtonElement): void {
  act(() => {
    button.focus();
    window.dispatchEvent(new Event("focus"));
  });
}

function blurWindow(button: HTMLButtonElement): void {
  act(() => {
    button.blur();
    window.dispatchEvent(new Event("blur"));
  });
}

describe("useClientActivity on web", () => {
  const mounted: HTMLElement[] = [];

  afterEach(() => {
    for (const element of mounted) element.remove();
    mounted.length = 0;
  });

  function mountFocusTarget(): HTMLButtonElement {
    const button = document.createElement("button");
    document.body.appendChild(button);
    mounted.push(button);
    return button;
  }

  it("reports appVisible=false when the window is on screen but another app has focus", () => {
    const button = mountFocusTarget();
    const client = createFakeClient();
    renderHook(() =>
      useClientActivity({
        client: client as unknown as DaemonClient,
        focusedAgentId: "agent-1",
        focusedTerminalId: null,
      }),
    );
    focusWindow(button);
    expect(client.latest()).toMatchObject({ appVisible: true, focusedAgentId: "agent-1" });
    const heartbeatsBeforeBlur = client.heartbeats.length;

    blurWindow(button);

    expect(document.visibilityState).toBe("visible");
    expect(client.heartbeats.length).toBe(heartbeatsBeforeBlur + 1);
    expect(client.latest()).toMatchObject({ appVisible: false, focusedAgentId: "agent-1" });
  });

  it("reports appVisible=true again as soon as the window regains focus", () => {
    const button = mountFocusTarget();
    const client = createFakeClient();
    renderHook(() =>
      useClientActivity({
        client: client as unknown as DaemonClient,
        focusedAgentId: "agent-1",
        focusedTerminalId: null,
      }),
    );
    focusWindow(button);
    blurWindow(button);
    expect(client.latest().appVisible).toBe(false);

    focusWindow(button);

    expect(client.latest().appVisible).toBe(true);
  });
});
