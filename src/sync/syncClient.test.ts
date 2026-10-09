import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import {
  pushOps,
  pullOps,
  mintPairCode,
  redeemPairCode,
  bootstrap,
  revokeSelf,
  SyncError,
} from "./syncClient";
import { setToken } from "./identity";
import type { Op } from "./types";

const op: Op = {
  id: "op-1",
  hlc: "a000000000000000000",
  device: "dev-00000000-0000",
  entity: "plankDay",
  entityId: "2026-10-01",
  kind: "create",
  data: { seconds: 30 },
};

const TOKEN = "dGVzdC10b2tlbi0wMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMA";

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  setToken(TOKEN);
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("pushOps", () => {
  test("posts the journal with a bearer token, no account id", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { ok: true, applied: 1, conflicts: 0 }));

    const result = await pushOps([op]);

    expect(result).toEqual({ ok: true, applied: 1, conflicts: 0 });
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/sync/push");
    expect(init.headers).toEqual({
      "Content-Type": "application/json",
      Authorization: `Bearer ${TOKEN}`,
    });
    expect(JSON.parse(init.body as string)).toEqual({ ops: [op] });
  });

  test("throws a SyncError carrying the status and the invalid op ids", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(400, { error: "invalid op: x", invalid: [{ id: "op-1", error: "x" }] })
    );

    const err = await pushOps([op]).catch((e) => e);
    expect(err).toBeInstanceOf(SyncError);
    expect(err.status).toBe(400);
    expect(err.invalid).toEqual([{ id: "op-1", error: "x" }]);
  });

  test("throws a readable error for a dead token", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(401, { error: "unknown or revoked token" }));
    await expect(pullOps()).rejects.toThrow(/invalid or revoked/);
  });

  test("throws when the device is not linked", async () => {
    localStorage.removeItem("stretch.token");
    await expect(pullOps()).rejects.toThrow(/not linked/);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("pullOps", () => {
  test("posts an empty body to /api/sync/pull", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { ops: [op], serverTime: 1 }));

    const result = await pullOps();

    expect(result).toEqual({ ops: [op], serverTime: 1 });
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/sync/pull");
    expect(JSON.parse(init.body as string)).toEqual({});
  });
});

describe("pairing and token clients", () => {
  test("mintPairCode posts to /api/sync/pair", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { code: "abcdef0123456789", expiresAt: 5 }));
    await expect(mintPairCode("phone")).resolves.toEqual({
      code: "abcdef0123456789",
      expiresAt: 5,
    });
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/sync/pair");
    expect(JSON.parse(init.body as string)).toEqual({ label: "phone" });
  });

  test("redeemPairCode is anonymous", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(200, { token: "t", accountId: "a", role: "secondary" })
    );
    await expect(redeemPairCode("abcdef0123456789", "phone2")).resolves.toEqual({
      token: "t",
      accountId: "a",
      role: "secondary",
    });
    const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
  });

  test("bootstrap is anonymous and sends the account id", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { token: "t", role: "owner" }));
    await expect(bootstrap("some-account", "phone")).resolves.toEqual({
      token: "t",
      role: "owner",
    });
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/sync/bootstrap");
    expect(JSON.parse(init.body as string)).toEqual({ accountId: "some-account", label: "phone" });
  });

  test("revokeSelf hits /api/sync/token/revoke-self", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { ok: true }));
    await expect(revokeSelf()).resolves.toEqual({ ok: true });
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe("/api/sync/token/revoke-self");
  });
});
