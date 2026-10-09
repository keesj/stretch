import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { useSyncStore } from "./useSyncStore";
import { useDeviceIdentity } from "./useDeviceIdentity";
import { setToken } from "./identity";
import { appendOps, loadJournal } from "./journal";
import type { Op } from "./types";

const TOKEN = "dGVzdC10b2tlbi0wMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMA";

function op(id: string, hlc: string, overrides: Partial<Op> = {}): Op {
  return {
    id,
    hlc,
    device: "dev",
    entity: "plankDay",
    entityId: "2026-10-01",
    kind: "create",
    data: { seconds: 30 },
    ...overrides,
  };
}

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  localStorage.clear();
  useSyncStore.setState({ lastSyncAt: null, lastError: null, syncing: false });
  useDeviceIdentity.setState({
    accountId: "11111111-2222-4333-8444-555555555555",
    linked: false,
    role: null,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("syncNow", () => {
  test("bootstraps a fresh account, then pushes and pulls", async () => {
    appendOps([op("a", "a0")]);
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(200, { token: "owner-tok", role: "owner" }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true, applied: 1, conflicts: 0 }))
      .mockResolvedValueOnce(jsonResponse(200, { ops: [], serverTime: 1 }));

    await useSyncStore.getState().syncNow();

    const urls = vi.mocked(fetch).mock.calls.map(([url]) => url);
    expect(urls).toEqual(["/api/sync/bootstrap", "/api/sync/push", "/api/sync/pull"]);
    // Bootstrap is anonymous; the push carried the fresh token.
    const pushHeaders = vi.mocked(fetch).mock.calls[1][1]?.headers as Record<string, string>;
    expect(pushHeaders.Authorization).toBe("Bearer owner-tok");
    expect(localStorage.getItem("stretch.token")).toBe("owner-tok");
    expect(localStorage.getItem("stretch.role")).toBe("owner");
    expect(useSyncStore.getState().lastError).toBeNull();
    expect(useSyncStore.getState().lastSyncAt).toBeTypeOf("number");
    expect(useDeviceIdentity.getState().linked).toBe(true);
  });

  test("absorbs remote ops, rewrites the projection, and refreshes the UI", async () => {
    setToken(TOKEN);
    // Empty journal: no push, only the pull.
    const remote = op("remote-1", "b0", { entityId: "2026-10-02", data: { seconds: 90 } });
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, { ops: [remote], serverTime: 1 }));

    let refreshed = false;
    const onRefresh = () => {
      refreshed = true;
    };
    window.addEventListener("stretch:data", onRefresh);

    await useSyncStore.getState().syncNow();
    window.removeEventListener("stretch:data", onRefresh);

    expect(loadJournal().map((o) => o.id)).toEqual(["remote-1"]);
    const plank = JSON.parse(localStorage.getItem("plankChallenge")!);
    expect(plank.days).toEqual([{ date: "2026-10-02", seconds: 90 }]);
    expect(refreshed).toBe(true);
  });

  test("quarantines server-rejected ops and pushes the rest", async () => {
    setToken(TOKEN);
    const bad = op("bad", "a0");
    const good = op("good", "a1");
    appendOps([bad, good]);
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        jsonResponse(400, { error: "invalid op: x", invalid: [{ id: "bad", error: "x" }] })
      )
      .mockResolvedValueOnce(jsonResponse(200, { ok: true, applied: 1, conflicts: 0 }))
      .mockResolvedValueOnce(jsonResponse(200, { ops: [], serverTime: 1 }));

    await useSyncStore.getState().syncNow();

    expect(loadJournal().map((o) => o.id)).toEqual(["good"]);
    const rejected = JSON.parse(localStorage.getItem("stretch.rejected")!);
    expect(rejected).toContain("bad");
    expect(useSyncStore.getState().lastError).toBeNull();
    // The retry push only carried the valid op.
    const retryInit = vi.mocked(fetch).mock.calls[1][1] as RequestInit;
    const retryBody = JSON.parse(retryInit.body as string);
    expect(retryBody.ops.map((o: Op) => o.id)).toEqual(["good"]);
  });

  test("recovers from a dead token by bootstrapping again", async () => {
    setToken("stale-token");
    appendOps([op("a", "a0")]);
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(401, { error: "unknown or revoked token" }))
      .mockResolvedValueOnce(jsonResponse(200, { token: "fresh-tok", role: "owner" }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true, applied: 1, conflicts: 0 }))
      .mockResolvedValueOnce(jsonResponse(200, { ops: [], serverTime: 1 }));

    await useSyncStore.getState().syncNow();

    expect(localStorage.getItem("stretch.token")).toBe("fresh-tok");
    expect(useSyncStore.getState().lastError).toBeNull();
  });

  test("surfaces an unreachable server as lastError without throwing", async () => {
    setToken(TOKEN);
    vi.mocked(fetch).mockRejectedValue(new TypeError("Failed to fetch"));

    await useSyncStore.getState().syncNow();

    expect(useSyncStore.getState().lastError).toContain("Failed to fetch");
    expect(useSyncStore.getState().syncing).toBe(false);
  });

  test("reports the pairing hint when the account is linked elsewhere", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(409, { error: "account already has active tokens" })
    );

    await useSyncStore.getState().syncNow();

    expect(useSyncStore.getState().lastError).toContain("pairing code");
  });

  test("overlapping syncNow calls do not double-run", async () => {
    setToken(TOKEN);
    appendOps([op("a", "a0")]);
    let release: (value: Response) => void;
    const gate = new Promise<Response>((resolve) => {
      release = resolve;
    });
    vi.mocked(fetch).mockImplementation(async () => gate);

    const first = useSyncStore.getState().syncNow();
    const second = useSyncStore.getState().syncNow();
    release!(jsonResponse(200, { ok: true, applied: 0, conflicts: 0 }));
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { ops: [], serverTime: 1 }));

    await Promise.all([first, second]);
    // One push + one pull from the single round that ran.
    expect(vi.mocked(fetch).mock.calls.length).toBe(2);
  });
});
