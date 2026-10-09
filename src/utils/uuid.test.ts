import { describe, test, expect, vi, afterEach } from "vitest";
import { newUuid, UUID_V4_RE } from "./uuid";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("newUuid", () => {
  test("returns a UUIDv4", () => {
    expect(newUuid()).toMatch(UUID_V4_RE);
  });

  test("uses crypto.randomUUID when available", () => {
    const fixed = "11111111-2222-4333-8444-555555555555";
    vi.stubGlobal("crypto", { randomUUID: () => fixed });
    expect(newUuid()).toBe(fixed);
  });

  test("falls back to getRandomValues without randomUUID (plain HTTP)", () => {
    const realCrypto = globalThis.crypto;
    vi.stubGlobal("crypto", {
      getRandomValues: (arr: Uint8Array<ArrayBuffer>) => realCrypto.getRandomValues(arr),
    });
    expect(newUuid()).toMatch(UUID_V4_RE);
  });

  test("is unique across many draws without any crypto.randomUUID", () => {
    const realCrypto = globalThis.crypto;
    vi.stubGlobal("crypto", {
      getRandomValues: (arr: Uint8Array<ArrayBuffer>) => realCrypto.getRandomValues(arr),
    });
    const seen = new Set(Array.from({ length: 1000 }, () => newUuid()));
    expect(seen.size).toBe(1000);
  });

  test("still works when no crypto exists at all", () => {
    vi.stubGlobal("crypto", undefined);
    expect(newUuid()).toMatch(UUID_V4_RE);
  });
});
