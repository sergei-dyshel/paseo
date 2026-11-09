import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { createProjectIconTarget } from "./icon-target";
import { ProjectIconCache, type ProjectIconCacheStorage } from "./icon-cache";

class MemoryStorage implements ProjectIconCacheStorage {
  readonly values = new Map<string, string>();
  async getItem(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }
  async setItem(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }
}

const target = createProjectIconTarget({
  projectViewKey: "project-view",
  placement: {
    serverId: "host-a",
    projectId: "project-a",
    iconWorkingDir: "/project-a",
    iconRevision: "revision-a",
  },
});
if (!target) throw new Error("Expected project icon target");
const icon = { data: "aWNvbg==", mimeType: "image/png" };

function clientWith(iconResult: typeof icon | null) {
  return {
    getProjectIcon: async () => ({ requestId: "icon", icon: iconResult }),
  } as unknown as DaemonClient;
}

function recordingHost(iconResult: typeof icon | null) {
  const requests: string[] = [];
  const client = {
    getProjectIcon: async (projectId: string) => {
      requests.push(projectId);
      return { requestId: "icon", icon: iconResult };
    },
  } as unknown as DaemonClient;
  return { client, requests };
}

describe("ProjectIconCache", () => {
  it("uses the shared target revision in its query key", () => {
    const cache = new ProjectIconCache(new MemoryStorage());

    expect(cache.query(target, true, () => null, false).queryKey).toEqual([
      "projectIcon",
      "host-a",
      "project-a",
      "revision-a",
    ]);
  });

  it("resolves, persists, and hydrates an icon before a host connects", async () => {
    const storage = new MemoryStorage();
    const writer = new ProjectIconCache(storage);
    writer.setHosts([target.serverId]);
    await writer.query(target, true, () => clientWith(icon), true).queryFn();
    await writer.flush();

    const reader = new ProjectIconCache(storage);
    reader.setHosts([target.serverId]);
    await reader.restore();

    expect(reader.query(target, true, () => null, false).initialData).toEqual(icon);
  });

  it("persists an explicit no-icon result", async () => {
    const storage = new MemoryStorage();
    const writer = new ProjectIconCache(storage);
    writer.setHosts([target.serverId]);
    await writer.query(target, true, () => clientWith(null), true).queryFn();
    await writer.flush();

    const reader = new ProjectIconCache(storage);
    reader.setHosts([target.serverId]);
    await reader.restore();
    expect(reader.query(target, true, () => null, false)).toHaveProperty("initialData", null);
  });

  it("misses only the project whose revision changed", async () => {
    const cache = new ProjectIconCache(new MemoryStorage());
    const other = { ...target, projectId: "project-b" };
    await cache.query(target, true, () => clientWith(icon), true).queryFn();
    await cache.query(other, true, () => clientWith(null), true).queryFn();

    expect(
      cache.query({ ...target, iconRevision: "revision-b" }, true, () => null, false),
    ).not.toHaveProperty("initialData");
    expect(cache.query(other, true, () => null, false)).toHaveProperty("initialData", null);
  });
});

describe("ProjectIconCache.load", () => {
  it("returns the icon the sidebar's query loaded without asking the host again", async () => {
    const cache = new ProjectIconCache(new MemoryStorage());
    const queryClient = new QueryClient();
    const host = recordingHost(icon);
    await queryClient.fetchQuery(cache.query(target, true, () => host.client, true));

    expect(await cache.load(queryClient, target, true, () => host.client, true)).toEqual(icon);
    expect(host.requests).toEqual(["project-a"]);
  });

  it("returns an icon persisted by an earlier session without asking the host", async () => {
    const storage = new MemoryStorage();
    const writer = new ProjectIconCache(storage);
    writer.setHosts([target.serverId]);
    await writer.query(target, true, () => clientWith(icon), true).queryFn();
    await writer.flush();
    const cache = new ProjectIconCache(storage);
    cache.setHosts([target.serverId]);
    await cache.restore();
    const host = recordingHost(icon);

    expect(await cache.load(new QueryClient(), target, true, () => host.client, true)).toEqual(
      icon,
    );
    expect(host.requests).toEqual([]);
  });

  it("fetches an icon nothing has loaded and shares it with the sidebar's query", async () => {
    const cache = new ProjectIconCache(new MemoryStorage());
    const queryClient = new QueryClient();
    const host = recordingHost(icon);

    expect(await cache.load(queryClient, target, true, () => host.client, true)).toEqual(icon);
    const sidebarQuery = cache.query(target, true, () => host.client, true);
    expect(queryClient.getQueryData(sidebarQuery.queryKey)).toEqual(icon);
    expect(host.requests).toEqual(["project-a"]);
  });

  it("only reads the cache while the host is disconnected", async () => {
    const cache = new ProjectIconCache(new MemoryStorage());
    const queryClient = new QueryClient();
    const host = recordingHost(icon);

    expect(await cache.load(queryClient, target, true, () => host.client, false)).toBeNull();
    expect(host.requests).toEqual([]);
  });
});
