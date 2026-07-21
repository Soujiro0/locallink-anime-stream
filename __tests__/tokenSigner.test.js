import { describe, test, expect } from "vitest";
import tokenSignerMod from "../src/utils/tokenSigner.js";
import whitelistMod from "../src/config/whitelist.js";

const tokenSigner = tokenSignerMod.default || tokenSignerMod;
const whitelist = whitelistMod.default || whitelistMod;

describe("tokenSigner and Legitimate IP-Bound Security Engine", () => {
  const secret = "test-secret-key-2026";
  const streamId = "anime_stream_101/master.m3u8";
  const clientIp = "203.0.113.50";

  test("generates valid HMAC token binding client IP and stream ID", () => {
    const token = tokenSigner.generateStreamToken({ streamId, clientIp, expiresInSeconds: 600, secret });
    expect(token.sig).toBeDefined();
    expect(typeof token.sig).toBe("string");
    expect(token.clientIp).toBe(clientIp);
    expect(token.streamId).toBe(streamId);
    expect(token.tokenUrlParam).toContain(token.sig);
  });

  test("successfully verifies valid token when incoming IP matches", () => {
    const token = tokenSigner.generateStreamToken({ streamId, clientIp, expiresInSeconds: 600, secret });
    const verification = tokenSigner.verifyStreamToken({
      sig: token.sig,
      streamId,
      clientIp,
      exp: token.exp,
      secret
    });
    expect(verification.valid).toBe(true);
    expect(verification.error).toBeUndefined();
  });

  test("rejects token immediately when incoming IP mismatches (preventing stream hotlinking/theft)", () => {
    const token = tokenSigner.generateStreamToken({ streamId, clientIp, expiresInSeconds: 600, secret });
    const attackerIp = "198.51.100.99"; // Different datacenter / attacker IP
    const verification = tokenSigner.verifyStreamToken({
      sig: token.sig,
      streamId,
      clientIp: attackerIp,
      exp: token.exp,
      secret
    });
    expect(verification.valid).toBe(false);
    expect(verification.error).toContain("Signature mismatch");
  });

  test("rejects expired token", () => {
    const expiredExp = Math.floor(Date.now() / 1000) - 10;
    const token = tokenSigner.generateStreamToken({ streamId, clientIp, expiresInSeconds: -10, secret });
    const verification = tokenSigner.verifyStreamToken({
      sig: token.sig,
      streamId,
      clientIp,
      exp: expiredExp,
      secret
    });
    expect(verification.valid).toBe(false);
    expect(verification.error).toContain("expired");
  });

  test("formats standard HLS HTTP-only domain cookie correctly", () => {
    const token = tokenSigner.generateStreamToken({ streamId, clientIp, expiresInSeconds: 3600, secret });
    const cookieStr = tokenSigner.createHlsAuthCookie({
      streamId,
      sig: token.sig,
      exp: token.exp,
      domain: ".locallink.stream"
    });
    expect(cookieStr).toContain("__Secure-LocalLink-Auth=");
    expect(cookieStr).toContain("HttpOnly");
    expect(cookieStr).toContain("Secure");
    expect(cookieStr).toContain("Domain=.locallink.stream");
  });

  test("extractClientIp extracts IP from Cloudflare or forwarded headers accurately", () => {
    const mockReqCf = { headers: { "cf-connecting-ip": "198.51.100.10 " } };
    expect(tokenSigner.extractClientIp(mockReqCf)).toBe("198.51.100.10");

    const mockReqXff = { headers: { "x-forwarded-for": "203.0.113.15, 10.0.0.1" } };
    expect(tokenSigner.extractClientIp(mockReqXff)).toBe("203.0.113.15");
  });

  test("extractClientIp normalizes IPv4-mapped IPv6 addresses to prevent HMAC mismatch", () => {
    // When Express is behind nginx in Docker, the same client may appear as:
    //   - "192.168.1.100" (from X-Forwarded-For)
    //   - "::ffff:192.168.1.100" (from req.ip / socket.remoteAddress)
    // Without normalization, tokens signed with one form fail to verify with the other.
    const mockReqIpv6Mapped = { headers: {}, ip: "::ffff:192.168.1.100" };
    expect(tokenSigner.extractClientIp(mockReqIpv6Mapped)).toBe("192.168.1.100");

    // Verify token interoperability: sign with normalized IP, verify with normalized IP
    const normalizedIp = tokenSigner.extractClientIp(mockReqIpv6Mapped);
    const token = tokenSigner.generateStreamToken({ streamId, clientIp: normalizedIp, expiresInSeconds: 600, secret });
    const verification = tokenSigner.verifyStreamToken({
      sig: token.sig,
      streamId,
      clientIp: normalizedIp,
      exp: token.exp,
      secret
    });
    expect(verification.valid).toBe(true);
  });

  test("whitelist config integrates IP-bound token validation seamlessly", () => {
    const url = "https://locallink.stream/streams/anime_101/playlist.m3u8";
    const generatedSig = whitelist.generateWhitelistToken(url, clientIp, 3600);
    expect(typeof generatedSig.sig).toBe("string");

    const isValidMatch = whitelist.isWhitelistedToken(generatedSig.sig, url, clientIp, generatedSig.exp);
    expect(isValidMatch).toBe(true);

    const isInvalidMismatch = whitelist.isWhitelistedToken(generatedSig.sig, url, "1.1.1.1", generatedSig.exp);
    expect(isInvalidMismatch).toBe(false);
  });
});
