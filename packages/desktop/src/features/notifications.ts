import path from "node:path";
import { existsSync } from "node:fs";
import { app, BrowserWindow, Notification, ipcMain, nativeImage } from "electron";
import { getDesktopSettingsStore } from "../settings/desktop-settings-electron.js";

interface NotificationInput {
  title?: unknown;
  body?: unknown;
  data?: unknown;
}

interface NotificationClickPayload {
  data?: Record<string, unknown>;
}

export interface DismissableNotification {
  close(): void;
}

// Every notification shown and not yet clicked or closed. Each entry removes itself
// on click/close, so this is the set still sitting in Notification Center.
const activeNotifications = new Set<Notification>();

/**
 * Dismiss every outstanding notification. Once the user is looking at the app the
 * banners are stale: the agent they point at is on screen or one click away.
 */
export function dismissAllNotifications(
  notifications: Set<DismissableNotification> = activeNotifications,
): number {
  const pending = [...notifications];
  notifications.clear();
  for (const notification of pending) {
    // `close` also fires the "close" event, whose listener deletes from the set;
    // clearing first keeps that a no-op instead of mutating during iteration.
    notification.close();
  }
  return pending.length;
}

function toTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function getNotificationIcon(): Electron.NativeImage | null {
  const candidates = [
    path.resolve(__dirname, "../assets/icon.png"),
    path.resolve(__dirname, "../assets/64x64.png"),
    path.resolve(__dirname, "../assets/128x128.png"),
  ];

  for (const iconPath of candidates) {
    if (!existsSync(iconPath)) {
      continue;
    }
    const icon = nativeImage.createFromPath(iconPath);
    if (!icon.isEmpty()) {
      return icon;
    }
  }

  return null;
}

function focusSenderWindow(sender: Electron.WebContents): BrowserWindow | null {
  const win = BrowserWindow.fromWebContents(sender) ?? BrowserWindow.getAllWindows()[0] ?? null;
  if (!win || win.isDestroyed()) {
    return null;
  }
  win.show();
  if (win.isMinimized()) {
    win.restore();
  }
  win.focus();
  return win;
}

/**
 * macOS requires a notification to have been shown at least once before
 * the app appears in System Preferences > Notifications. We fire a
 * silent no-op notification during startup to ensure registration.
 */
export function ensureNotificationCenterRegistration(): void {
  if (process.platform !== "darwin" || !Notification.isSupported()) {
    return;
  }

  const probe = new Notification({ title: app.name, silent: true });
  probe.on("show", () => probe.close());
  setTimeout(() => probe.close(), 2_000);
  probe.show();
}

export function registerNotificationHandlers(): void {
  // Focusing any Paseo window dismisses the notifications it sent while unfocused.
  app.on("browser-window-focus", () => {
    dismissAllNotifications();
  });

  ipcMain.handle("paseo:notification:isSupported", () => {
    return Notification.isSupported();
  });

  ipcMain.handle("paseo:notification:send", async (event, rawInput?: NotificationInput) => {
    if (!Notification.isSupported()) {
      return false;
    }

    const title = toTrimmedString(rawInput?.title);
    if (!title) {
      return false;
    }

    const body = toTrimmedString(rawInput?.body) ?? undefined;
    const data = toRecord(rawInput?.data);
    const icon = getNotificationIcon();
    const settings = await getDesktopSettingsStore().get();
    const notification = new Notification({
      title,
      ...(body ? { body } : {}),
      ...(icon ? { icon } : {}),
      silent: !settings.notifications.playSound,
    });

    activeNotifications.add(notification);

    notification.on("click", () => {
      const win = focusSenderWindow(event.sender);
      if (win && data && Object.keys(data).length > 0) {
        const payload: NotificationClickPayload = { data };
        win.webContents.send("paseo:event:notification-click", payload);
      }
      activeNotifications.delete(notification);
    });

    notification.on("close", () => {
      activeNotifications.delete(notification);
    });

    notification.show();
    return true;
  });
}
