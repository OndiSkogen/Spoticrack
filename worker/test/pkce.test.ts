import { describe, expect, it } from "vitest";
import { generateCodeChallenge, generateCodeVerifier } from "../src/pkce";

describe("PKCE", () => {
  it("generates a verifier within Spotify's required length and character set", () => {
    const verifier = generateCodeVerifier();

    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier.length).toBeLessThanOrEqual(128);
    expect(verifier).toMatch(/^[A-Za-z0-9\-._~]+$/);
  });

  it("generates a different verifier each time", () => {
    expect(generateCodeVerifier()).not.toBe(generateCodeVerifier());
  });

  it("derives the challenge as base64url(SHA-256(verifier))", async () => {
    // Independently verified via node:crypto - see conversation.
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    await expect(generateCodeChallenge(verifier)).resolves.toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    );
  });
});
