import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sanitizeClearance, getHarvestedHeaders } from "../src/utils/pipe.js";
import whitelist from "../src/config/whitelist.js";

describe("Cloudflare Cookie Sanitization & Header Harvesting", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("sanitizeClearance should strip quotes and format cf_clearance cookie", () => {
    expect(sanitizeClearance(null)).toBeNull();
    expect(sanitizeClearance("")).toBeNull();
    expect(sanitizeClearance("   ")).toBeNull();

    // Raw token
    expect(sanitizeClearance("abc123token")).toBe("cf_clearance=abc123token");

    // Token already containing cf_clearance=
    expect(sanitizeClearance("cf_clearance=abc123token")).toBe("cf_clearance=abc123token");

    // Token wrapped in double quotes
    expect(sanitizeClearance('"cf_clearance=abc123token"')).toBe("cf_clearance=abc123token");

    // Token wrapped in single quotes
    expect(sanitizeClearance("'cf_clearance=abc123token'")).toBe("cf_clearance=abc123token");

    // Token with whitespace and quotes
    expect(sanitizeClearance(' "cf_clearance=abc123token" \n')).toBe("cf_clearance=abc123token");
  });

  it("getHarvestedHeaders should prioritize req.headers over process.env", () => {
    process.env.CF_CLEARANCE_MIRURO = "env_token";
    process.env.CF_USER_AGENT = "EnvUserAgent/1.0";

    // Without req (falls back to process.env)
    const envHeaders = getHarvestedHeaders(null);
    expect(envHeaders["Cookie"]).toBe("cf_clearance=env_token");
    expect(envHeaders["User-Agent"]).toBe("EnvUserAgent/1.0");

    // With req passing custom x-cf-clearance and x-cf-user-agent
    const req = {
      headers: {
        "x-cf-clearance": "client_token",
        "x-cf-user-agent": "ClientUserAgent/2.0"
      }
    };
    const reqHeaders = getHarvestedHeaders(req);
    expect(reqHeaders["Cookie"]).toBe("cf_clearance=client_token");
    expect(reqHeaders["User-Agent"]).toBe("ClientUserAgent/2.0");
  });

  it("whitelist.attachWhitelistedCloudflareState should correctly attach clearance and user-agent", () => {
    process.env.CF_CLEARANCE_MIRURO = '"cf_clearance=sanitized_test_token"';
    process.env.CF_USER_AGENT = '"TestUA/3.0"';

    const headers = {};
    whitelist.attachWhitelistedCloudflareState(headers, "https://www.miruro.tv/api/secure/pipe");

    expect(headers["Cookie"]).toContain("cf_clearance=sanitized_test_token");
    expect(headers["User-Agent"]).toBe("TestUA/3.0");
  });
});
