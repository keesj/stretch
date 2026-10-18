import { describe, it, expect, vi, afterEach } from "vitest";
import { sendTestNotification } from "./notifications";

/** A stub Notification with a fixed permission, recording instances. */
function mockNotification(
  permission: "default" | "granted" | "denied",
  requestPermission?: () => Promise<NotificationPermission>
) {
  const instances: { title: string; options?: NotificationOptions }[] = [];
  const ask =
    requestPermission ?? vi.fn(async () => MockNotification.permission as NotificationPermission);
  class MockNotification {
    static permission = permission;
    static requestPermission = () => ask();
    constructor(title: string, options?: NotificationOptions) {
      instances.push({ title, options });
    }
  }
  vi.stubGlobal("Notification", MockNotification);
  return { instances, ask };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sendTestNotification", () => {
  it("reports unsupported when the Notification API is missing", async () => {
    vi.stubGlobal("Notification", undefined);
    const result = await sendTestNotification();
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/not supported/);
  });

  it("sends the notification when permission is already granted", async () => {
    const { instances, ask } = mockNotification("granted");
    const result = await sendTestNotification();
    expect(result.ok).toBe(true);
    expect(ask).not.toHaveBeenCalled();
    expect(instances).toHaveLength(1);
    expect(instances[0].title).toBe("Stretch");
  });

  it("asks for permission first when undecided, and sends when granted", async () => {
    const ask = vi.fn(async () => "granted" as NotificationPermission);
    const { instances } = mockNotification("default", ask);
    const result = await sendTestNotification();
    expect(ask).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
    expect(instances).toHaveLength(1);
  });

  it("does not send when the permission prompt is declined", async () => {
    const ask = vi.fn(async () => "denied" as NotificationPermission);
    const { instances } = mockNotification("default", ask);
    const result = await sendTestNotification();
    expect(ask).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/blocked/i);
    expect(instances).toHaveLength(0);
  });

  it("never re-asks once permission was denied", async () => {
    const ask = vi.fn(async () => "denied" as NotificationPermission);
    const { instances } = mockNotification("denied", ask);
    const result = await sendTestNotification();
    expect(ask).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/blocked/i);
    expect(instances).toHaveLength(0);
  });

  it("reports a display failure when the constructor throws", async () => {
    const instances: unknown[] = [];
    class ThrowingNotification {
      static permission = "granted";
      constructor() {
        instances.push("x");
        throw new Error("denied by browser");
      }
    }
    vi.stubGlobal("Notification", ThrowingNotification);
    const result = await sendTestNotification();
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/could not display/i);
  });
});
