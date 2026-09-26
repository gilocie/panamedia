/**
 * pinSecurity.ts
 * ==============
 * Archive PIN hashing and verification utilities.
 *
 * Pins are stored as "v1:<base64-sha256>" in localStorage and in the
 * Electron IPC save-archive-data payload.  Legacy plain-text pins
 * (stored before v1 was introduced) are automatically upgraded on
 * the next successful verification.
 */

// ─── Hash ─────────────────────────────────────────────────────────────────────

/**
 * Hashes a plain-text PIN to a versioned string using SHA-256.
 * Result format: `"v1:<base64>"`.
 *
 * @param pin - The raw plain-text PIN entered by the user.
 * @returns A Promise that resolves to the versioned hash string.
 */
export async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin);
  const hashBuf = await crypto.subtle.digest('SHA-256', data);
  const hashArr = Array.from(new Uint8Array(hashBuf));
  const base64 = btoa(String.fromCharCode(...hashArr));
  return `v1:${base64}`;
}

// ─── Verify ───────────────────────────────────────────────────────────────────

export interface VerifyPinResult {
  /** Whether the supplied PIN is correct. */
  valid: boolean;
  /**
   * True when the stored hash is in the legacy plain-text format and has been
   * re-hashed — the caller should persist `upgradedHash` to replace it.
   */
  needsUpgrade: boolean;
  /** The upgraded hash string (only present when `needsUpgrade` is true). */
  upgradedHash?: string;
}

/**
 * Verifies a plain-text PIN against a stored hash.
 *
 * Handles two formats:
 *  - `"v1:<base64>"` – SHA-256 hash introduced in v1.
 *  - Any other string – legacy plain-text comparison; triggers an upgrade.
 *
 * @param pin        - The raw plain-text PIN to verify.
 * @param storedHash - The hash (or legacy plain-text) from localStorage / IPC.
 */
export async function verifyPin(pin: string, storedHash: string): Promise<VerifyPinResult> {
  if (!storedHash) return { valid: false, needsUpgrade: false };

  if (storedHash.startsWith('v1:')) {
    const computed = await hashPin(pin);
    return { valid: computed === storedHash, needsUpgrade: false };
  }

  // Legacy: plain-text comparison → upgrade to v1 hash on success
  if (pin === storedHash) {
    const upgradedHash = await hashPin(pin);
    return { valid: true, needsUpgrade: true, upgradedHash };
  }

  return { valid: false, needsUpgrade: false };
}
