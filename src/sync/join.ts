import {
  PAIR_CODE_RE,
  UUID_V4_RE,
  adoptUserId,
  deviceLabel,
  setRole,
  setToken,
} from "./identity";
import { bootstrap, redeemPairCode } from "./syncClient";

/**
 * Link this browser to an account by pasting what the user has:
 * a 16-char pairing code (the normal path — the account id is returned
 * by the server) or an account id (bootstrap, only works while the
 * account has no active tokens). Stores the resulting credentials and
 * token role in localStorage.
 */
export async function joinWith(value: string, label: string = deviceLabel()): Promise<void> {
  const input = value.trim();
  if (PAIR_CODE_RE.test(input)) {
    const { token, accountId, role } = await redeemPairCode(input, label);
    adoptUserId(accountId);
    setToken(token);
    setRole(role);
    return;
  }
  if (UUID_V4_RE.test(input)) {
    adoptUserId(input);
    const { token, role } = await bootstrap(input, label);
    setToken(token);
    setRole(role);
    return;
  }
  throw new Error("Paste a 16-character pairing code or an account id.");
}
