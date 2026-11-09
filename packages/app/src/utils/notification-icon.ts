/** Return no icon: native shows remote push only (see `sendOsNotification`). */
export async function rasterizeNotificationIcon(_source: string): Promise<string | null> {
  return null;
}
