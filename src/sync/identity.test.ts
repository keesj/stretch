import { describe, test, expect, beforeEach } from "vitest";
import {
  adoptUserId,
  clearRole,
  clearToken,
  deviceLabel,
  getDeviceId,
  getRole,
  getToken,
  getCredentials,
  getUserId,
  regenerateUserId,
  setRole,
  setToken,
} from "./identity";

const UUID = "11111111-2222-4333-8444-555555555555";

beforeEach(() => {
  localStorage.clear();
});

describe("account id", () => {
  test("is generated once and stable", () => {
    const first = getUserId();
    const second = getUserId();
    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  test("adoptUserId takes a valid UUIDv4 and rejects the rest", () => {
    expect(adoptUserId(UUID)).toBe(UUID);
    expect(getUserId()).toBe(UUID);
    expect(adoptUserId("not-a-uuid")).toBeNull();
    // Version nibble must be 4
    expect(adoptUserId("11111111-2222-3333-8444-555555555555")).toBeNull();
    expect(getUserId()).toBe(UUID);
  });

  test("rotates a legacy non-UUIDv4 id (stored before the secure-context fix)", () => {
    localStorage.setItem(
      "stretch.userId",
      "1759000000000-abc123def456ghij" // the old Date.now()-based fallback
    );
    const id = getUserId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(getUserId()).toBe(id);
  });

  test("regenerateUserId rotates the account", () => {
    const first = getUserId();
    setToken("some-token");
    const second = regenerateUserId();
    expect(second).not.toBe(first);
    expect(getUserId()).toBe(second);
    // rotate() (useDeviceIdentity) is the credential-dropping wrapper:
    setRole("owner");
    clearToken();
    clearRole();
    expect(getToken()).toBeNull();
    expect(getRole()).toBeNull();
  });
});

describe("device identity", () => {
  test("device id is stable per device", () => {
    expect(getDeviceId()).toBe(getDeviceId());
  });

  test("deviceLabel is a short human-glanceable id", () => {
    expect(deviceLabel()).toMatch(/^device-.{8}$/);
  });
});

describe("token and role", () => {
  test("set/get/clear round-trip", () => {
    expect(getToken()).toBeNull();
    setToken("tok-123");
    expect(getToken()).toBe("tok-123");
    clearToken();
    expect(getToken()).toBeNull();
  });

  test("role round-trip and validation", () => {
    expect(getRole()).toBeNull();
    setRole("owner");
    expect(getRole()).toBe("owner");
    setRole("secondary");
    expect(getRole()).toBe("secondary");
    clearRole();
    expect(getRole()).toBeNull();
    localStorage.setItem("stretch.role", "wizard");
    expect(getRole()).toBeNull();
  });

  test("getCredentials combines account id and token", () => {
    setToken("tok-abc");
    const creds = getCredentials();
    expect(creds.accountId).toBe(getUserId());
    expect(creds.token).toBe("tok-abc");
  });
});
