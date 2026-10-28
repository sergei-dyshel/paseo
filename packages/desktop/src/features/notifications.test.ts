import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: { on: vi.fn(), name: "Paseo" },
  BrowserWindow: {},
  Notification: { isSupported: () => true },
  ipcMain: { handle: vi.fn() },
  nativeImage: {},
}));
vi.mock("../settings/desktop-settings-electron.js", () => ({
  getDesktopSettingsStore: () => ({ get: async () => ({ notifications: { playSound: true } }) }),
}));

import { dismissAllNotifications, type DismissableNotification } from "./notifications";

function createNotification(active: Set<DismissableNotification>) {
  const notification: DismissableNotification & { closed: number } = {
    closed: 0,
    close() {
      this.closed += 1;
      // Mirror Electron: close() emits "close", whose listener removes the entry.
      active.delete(notification);
    },
  };
  active.add(notification);
  return notification;
}

describe("dismissAllNotifications", () => {
  it("closes every outstanding notification once and empties the set", () => {
    const active = new Set<DismissableNotification>();
    const first = createNotification(active);
    const second = createNotification(active);

    expect(dismissAllNotifications(active)).toBe(2);

    expect(first.closed).toBe(1);
    expect(second.closed).toBe(1);
    expect(active.size).toBe(0);
  });

  it("is a no-op when nothing is outstanding", () => {
    const active = new Set<DismissableNotification>();
    expect(dismissAllNotifications(active)).toBe(0);
    expect(active.size).toBe(0);
  });

  it("does not close a notification the user already clicked or closed", () => {
    const active = new Set<DismissableNotification>();
    const clicked = createNotification(active);
    const pending = createNotification(active);
    active.delete(clicked); // the click/close listener already removed it

    expect(dismissAllNotifications(active)).toBe(1);

    expect(clicked.closed).toBe(0);
    expect(pending.closed).toBe(1);
  });
});
