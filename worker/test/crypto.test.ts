import { describe, expect, it } from "vitest";
import { decrypt, encrypt, importEncryptionKey } from "../src/crypto";

const KEY_A = "uz2y+jcTMIQPIP3FiuXFakJiSBIC9IZx3tl3JSr2sks=";
const KEY_B = "gynUiFFBI6DNx8xtyC/sc9X60Ahsy/xjWnPRGSdlzXM=";

describe("refresh token encryption", () => {
  it("round-trips a value through encrypt and decrypt", async () => {
    const key = await importEncryptionKey(KEY_A);
    const encrypted = await encrypt("a-refresh-token-value", key);

    expect(encrypted).not.toBe("a-refresh-token-value");
    await expect(decrypt(encrypted, key)).resolves.toBe("a-refresh-token-value");
  });

  it("uses a random IV, so the same plaintext encrypts differently each time", async () => {
    const key = await importEncryptionKey(KEY_A);
    const a = await encrypt("same-value", key);
    const b = await encrypt("same-value", key);

    expect(a).not.toBe(b);
  });

  it("fails to decrypt with the wrong key", async () => {
    const keyA = await importEncryptionKey(KEY_A);
    const keyB = await importEncryptionKey(KEY_B);
    const encrypted = await encrypt("secret", keyA);

    await expect(decrypt(encrypted, keyB)).rejects.toThrow();
  });
});
