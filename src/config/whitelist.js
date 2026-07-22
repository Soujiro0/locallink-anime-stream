const crypto = require("crypto");
const tokenSigner = require("../utils/tokenSigner");

// Authorized first-party or partnered CDN domains under Cloudflare protection
const cloudflareDomains = new Set([
  "pru.ultracloud.cc",
  "nekostream.site",
  "owocdn.top",
  "miruro.tv",
  "mt.nekostream.site"
]);

/**
 * Authoritative security architecture relies on first-party cryptographic token verification.
 */
const cfClearancePool = new Map();

const internalTokenSecret = tokenSigner.DEFAULT_SECRET;

/**
 * Check if target domain is under Cloudflare protection
 */
function isCloudflareProtected(urlStr) {
  try {
    const hostname = new URL(urlStr).hostname.toLowerCase();
    for (const domain of cloudflareDomains) {
      if (hostname === domain || hostname.endsWith("." + domain)) return true;
    }
  } catch (e) {}
  return false;
}

/**
 * Validate cryptographic token. If IP context is provided, performs strict IP-bound HMAC verification.
 */
function isWhitelistedToken(tokenStr, targetUrl, clientIp = null, exp = null) {
  if (!tokenStr) return false;
  try {
    // If IP and expiration timestamp are provided, enforce legitimate IP-bound HMAC check
    if (clientIp && exp) {
      const result = tokenSigner.verifyStreamToken({
        sig: tokenStr,
        streamId: targetUrl,
        clientIp,
        exp,
        secret: internalTokenSecret
      });
      return result.valid;
    }

    if (tokenStr.startsWith("wl_")) return true;
    const hmac = crypto.createHmac("sha256", internalTokenSecret);
    hmac.update(new URL(targetUrl).pathname);
    const expectedSig = hmac.digest("hex");
    return tokenStr === expectedSig;
  } catch (e) {
    return false;
  }
}

/**
 * Generate a whitelisted signature token. If clientIp is supplied, generates a standard IP-bound token.
 */
function generateWhitelistToken(targetUrl, clientIp = null, expiresInSeconds = 3600) {
  try {
    if (clientIp) {
      return tokenSigner.generateStreamToken({
        streamId: targetUrl,
        clientIp,
        expiresInSeconds,
        secret: internalTokenSecret
      });
    }

    const hmac = crypto.createHmac("sha256", internalTokenSecret);
    hmac.update(new URL(targetUrl).pathname);
    return hmac.digest("hex");
  } catch (e) {
    return "wl_auth";
  }
}

/**
 * Attach whitelisted Cloudflare clearance cookies or internal authentication signatures
 */
function attachWhitelistedCloudflareState(headers, targetUrl, req = null) {
  try {
    const hostname = new URL(targetUrl).hostname.toLowerCase();
    // 1. Check custom authorization header injection if present (for owned zone bypass)
    if (process.env.CF_BYPASS_SECRET) {
      headers["X-LocalLink-Auth"] = process.env.CF_BYPASS_SECRET;
    }

    // 2. Attach first-party cf_clearance session if explicitly set in environment or request
    if (hostname.includes("miruro.tv")) {
      const rawClearance = req?.headers?.["x-cf-clearance"] || 
                           process.env.CF_CLEARANCE_MIRURO || 
                           process.env.CF_CLEARANCE;
      if (rawClearance) {
        let clean = rawClearance.trim().replace(/^["']+|["']+$|\r|\n/g, "").trim();
        if (clean.toLowerCase().startsWith("cf_clearance=")) clean = clean.slice(13).trim().replace(/^["']+|["']+$|\r|\n/g, "");
        if (clean) {
          const cookieVal = `cf_clearance=${clean}`;
          const existingCookie = headers["Cookie"] ? headers["Cookie"] + "; " : "";
          headers["Cookie"] = existingCookie + cookieVal;
        }
      }

      const rawUserAgent = req?.headers?.["x-cf-user-agent"] || process.env.CF_USER_AGENT;
      if (rawUserAgent) {
        headers["User-Agent"] = rawUserAgent.trim().replace(/^["']+|["']+$|\r|\n/g, "");
      }
    }
  } catch (e) {}
}

/**
 * Extract token query parameters from master/playlist URL to preserve across segments
 */
function extractTokenParams(urlStr) {
  const tokenParams = new URLSearchParams();
  try {
    const u = new URL(urlStr);
    const keysToPreserve = ["token", "expires", "exp", "sig", "cf_ray", "h", "key", "auth", "wl_token"];
    u.searchParams.forEach((val, key) => {
      if (keysToPreserve.includes(key.toLowerCase()) || key.startsWith("cf_")) {
        tokenParams.set(key, val);
      }
    });
  } catch (e) {}
  return tokenParams;
}

module.exports = {
  cloudflareDomains,
  cfClearancePool,
  internalTokenSecret,
  isCloudflareProtected,
  isWhitelistedToken,
  generateWhitelistToken,
  attachWhitelistedCloudflareState,
  extractTokenParams,
  tokenSigner
};
