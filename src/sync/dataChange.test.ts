import { describe, it, expect, vi } from "vitest";
import { dataRevision, notifyDataChanged, onDataChanged } from "./dataChange";

describe("dataChange", () => {
  it("notifies every subscriber and bumps the revision", () => {
    const a = vi.fn();
    const b = vi.fn();
    onDataChanged(a);
    onDataChanged(b);

    const before = dataRevision();
    notifyDataChanged();

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(dataRevision()).toBe(before + 1);
  });

  it("stops calling a listener after it unsubscribes", () => {
    const a = vi.fn();
    const unsub = onDataChanged(a);
    notifyDataChanged();
    unsub();
    unsub(); // idempotent
    notifyDataChanged();

    expect(a).toHaveBeenCalledTimes(1);
  });

  it("the revision is stable between notifications", () => {
    const before = dataRevision();
    expect(dataRevision()).toBe(before);
    notifyDataChanged();
    expect(dataRevision()).toBe(before + 1);
    expect(dataRevision()).toBe(before + 1);
  });

  it("a listener throwing does not break the other listeners", () => {
    const a = vi.fn(() => {
      throw new Error("boom");
    });
    const b = vi.fn();
    onDataChanged(a);
    const unsubB = onDataChanged(b);
    expect(() => notifyDataChanged()).not.toThrow();
    expect(b).toHaveBeenCalledTimes(1);
    unsubB();
  });
});
