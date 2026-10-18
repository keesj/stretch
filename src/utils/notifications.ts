/** Outcome of a "send test notification" attempt, ready to show as-is. */
export interface TestNotificationResult {
  ok: boolean;
  message: string;
}

/**
 * Send a one-off test notification so the user can verify that browser
 * notifications actually work. Handles the permission flow: asks the
 * browser when it has not decided yet (a click is the required user
 * gesture), never re-asks when already denied, and reports every failure
 * mode with a message the user can act on.
 */
export async function sendTestNotification(): Promise<TestNotificationResult> {
  if (typeof Notification === "undefined") {
    return {
      ok: false,
      message: "Notifications are not supported in this browser.",
    };
  }

  let permission = Notification.permission;
  if (permission === "default") {
    permission = await Notification.requestPermission();
  }

  if (permission !== "granted") {
    return {
      ok: false,
      message:
        permission === "denied"
          ? "Notifications are blocked by the browser. Allow them in the site settings, then try again."
          : "Permission was not granted. Try the test again — the browser will ask.",
    };
  }

  try {
    // Web Notifications are only available through the constructor, and
    // the instance is intentionally not used.
    // oxlint-disable-next-line eslint/no-new
    new Notification("Stretch", {
      body: "Notifications are working — this is a test notification.",
      tag: "stretch-test",
    });
  } catch {
    return {
      ok: false,
      message: "The browser could not display the notification. Check the site settings and try again.",
    };
  }

  return { ok: true, message: "Test notification sent — check your system notifications." };
}
