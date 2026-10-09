import { create } from "zustand";
import {
  clearRole,
  clearToken,
  getRole,
  getToken,
  getUserId,
  regenerateUserId,
  type SyncRole,
} from "./identity";

interface DeviceIdentityState {
  accountId: string;
  linked: boolean;
  role: SyncRole | null;
  // Re-read from localStorage (joinWith stores the new credentials itself).
  refresh: () => void;
  // Token rotated in place — the server preserves the role.
  reissue: (role: SyncRole) => void;
  // This device left the account (its token was revoked).
  detach: () => void;
  // Brand-new account id; the next sync bootstraps it.
  rotate: () => void;
}

/**
 * Reactive mirror of this device's sync identity (persisted in
 * localStorage by identity.ts), so the Sync card always agrees about what
 * is linked and with which role.
 */
export const useDeviceIdentity = create<DeviceIdentityState>()((set) => ({
  accountId: getUserId(),
  linked: getToken() != null,
  role: getRole(),
  refresh: () =>
    set({
      accountId: getUserId(),
      linked: getToken() != null,
      role: getRole(),
    }),
  reissue: (role) => set({ role }),
  detach: () => {
    clearToken();
    clearRole();
    set({ linked: false, role: null });
  },
  rotate: () => {
    clearToken();
    clearRole();
    set({ accountId: regenerateUserId(), linked: false, role: null });
  },
}));
