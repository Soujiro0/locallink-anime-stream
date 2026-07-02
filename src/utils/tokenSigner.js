const crypto = require("crypto");

const DEFAULT_SECRET = process.env.STREAM_WHITELIST_SECRET || "locallink-secure-hmac-key-2026";

/**
 * Extract verified client IP address from request headers or socket.
 * Prioritizes Cloudflare CF-Connecting-IP and standard proxies when operating behind owned infrastructure.
 */
function extractClientIp(req) {
  if (!req) return "127.0.0.1";
  
  const cfIp = req.headers["cf-connecting-ip"];
  if (cfIp && typeof cfIp === "string") return cfIp.trim();

  const forwardedFor = req.headers["x-forwarded-for"];
  if (forwardedFor && typeof forwardedFor === "string") {
    const firstIp = forwardedFor.split(",")[0].trim();
    if (firstIp) return firstIp;
  }

  const realIp = req.headers["x-real-ip"];
  if (realIp && typeof realIp === "string") return realIp.trim();

  return req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || "127.0.0.1";
}

/**
 * Generate a cryptographically secure HMAC token bound strictly to the client's public IP address.
 * Standard industry algorithm: Token = HMAC(StreamID || ClientIP || ExpirationTime, SecretKey)
 */
function generateStreamToken({ streamId, clientIp, expiresInSeconds = 3600, secret = DEFAULT_SECRET }) {
  if (!streamId || !clientIp) {
    throw new Error("Stream ID and Client IP are required for secure token generation.");
  }

  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const payload = `${streamId}|${clientIp}|${exp}`;
  
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(payload);
  const sig = hmac.digest("hex");

  return {
    sig,
    exp,
    streamId,
    clientIp,
    tokenUrlParam: `sig=${sig}&exp=${exp}`
  };
}

/**
 * Verify an incoming stream token against the requester's IP address.
 * Re-calculates the HMAC signature and performs timing-safe comparison to prevent side-channel leaks.
 */
function verifyStreamToken({ sig, streamId, clientIp, exp, secret = DEFAULT_SECRET }) {
  if (!sig || !streamId || !clientIp || !exp) {
    return { valid: false, error: "Missing required token claims or IP context." };
  }

  const currentTimestamp = Math.floor(Date.now() / 1000);
  const expTimestamp = parseInt(exp, 10);

  if (isNaN(expTimestamp) || currentTimestamp > expTimestamp) {
    return { valid: false, error: "Token has expired." };
  }

  const payload = `${streamId}|${clientIp}|${expTimestamp}`;
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(payload);
  const expectedSig = hmac.digest("hex");

  const sigBuffer = Buffer.from(sig, "hex");
  const expectedBuffer = Buffer.from(expectedSig, "hex");

  if (sigBuffer.length !== expectedBuffer.length) {
    return { valid: false, error: "Invalid signature length (IP mismatch or tampering)." };
  }

  const isMatch = crypto.timingSafeEqual(sigBuffer, expectedBuffer);
  if (!isMatch) {
    return { valid: false, error: "Signature mismatch: IP binding invariant failed or token tampered." };
  }

  return { valid: true };
}

/**
 * Create standard HTTP-only session cookie header for HLS players to automatically attach during chunk fetching.
 */
function createHlsAuthCookie({ streamId, sig, exp, domain }) {
  const cookieVal = `__Secure-LocalLink-Auth=${streamId}:${sig}:${exp}`;
  const attributes = [
    `Path=/`,
    `Max-Age=${Math.max(0, parseInt(exp, 10) - Math.floor(Date.now() / 1000))}`,
    `HttpOnly`,
    `SameSite=None`,
    `Secure`
  ];

  if (domain && domain !== "localhost" && !domain.startsWith("127.")) {
    attributes.push(`Domain=${domain}`);
  }

  return `${cookieVal}; ${attributes.join("; ")}`;
}

module.exports = {
  DEFAULT_SECRET,
  extractClientIp,
  generateStreamToken,
  verifyStreamToken,
  createHlsAuthCookie
};
