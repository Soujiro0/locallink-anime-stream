const zlib = require("zlib");
const util = require("util");

const gunzip = util.promisify(zlib.gunzip);

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36 Edg/136.0.0.0",
  Referer: "https://www.miruro.tv/",
  Origin: "https://www.miruro.tv",
  Accept: "*/*",
  "Accept-Language": "en-US,en;q=0.9",
  "Sec-Ch-Ua": '"Microsoft Edge";v="136", "Chromium";v="136", "Not.A/Brand";v="99"',
  "Sec-Ch-Ua-Mobile": "?0",
  "Sec-Ch-Ua-Platform": '"Windows"',
  "Sec-Fetch-Dest": "empty",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Site": "same-origin",
};
const MIRURO_PIPE_URL = process.env.MIRURO_PIPE_URL || "https://www.miruro.tv/api/secure/pipe";

async function decodePipeResponse(encodedStr) {
  try {
    let padded = encodedStr;
    const pad = encodedStr.length % 4;
    if (pad) padded += "=".repeat(4 - pad);
    const base64Str = padded.replace(/-/g, "+").replace(/_/g, "/");
    const compressed = Buffer.from(base64Str, "base64");
    const decompressed = await gunzip(compressed);
    return JSON.parse(decompressed.toString("utf-8"));
  } catch (err) {
    throw new Error("Failed to decode pipe response");
  }
}

function encodePipeRequest(payload) {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

let cycleTLSInstance = null;
let cycleTLSFailed = false;

// Detect if running inside a pkg-bundled executable
// pkg sets process.pkg when code runs from its virtual filesystem
const isPkg = typeof process.pkg !== "undefined";

async function getCycleTLS() {
  // If CycleTLS previously failed to initialize, don't retry (avoids repeated crash attempts)
  if (cycleTLSFailed) return null;

  if (!cycleTLSInstance) {
    let executablePath = undefined;
    const fs = require("fs");
    const path = require("path");
    
    try {
      const distDir = path.join(path.dirname(require.resolve("cycletls/package.json")), "dist");

      if (isPkg) {
        const os = require("os");
        const PLATFORM_BINARIES = {
          "win32": { "x64": "index.exe" },
          "linux": { "arm": "index-arm", "arm64": "index-arm64", "x64": "index" },
          "darwin": { "x64": "index-mac", "arm": "index-mac-arm", "arm64": "index-mac-arm64" },
          "freebsd": { "x64": "index-freebsd" }
        };
        const arch = os.arch();
        const executableFilename = PLATFORM_BINARIES[process.platform] && PLATFORM_BINARIES[process.platform][arch];
        
        if (executableFilename) {
          const sourcePath = path.join(distDir, executableFilename);
          if (fs.existsSync(sourcePath)) {
            const targetDir = path.join(os.tmpdir(), "locallink-cycletls");
            if (!fs.existsSync(targetDir)) {
              fs.mkdirSync(targetDir, { recursive: true });
            }
            const targetPath = path.join(targetDir, executableFilename);
            
            let needsCopy = true;
            if (fs.existsSync(targetPath)) {
              try {
                const srcStat = fs.statSync(sourcePath);
                const tgtStat = fs.statSync(targetPath);
                if (srcStat.size === tgtStat.size) needsCopy = false;
              } catch (e) {}
            }
            if (needsCopy) {
              fs.copyFileSync(sourcePath, targetPath);
              if (process.platform !== "win32") {
                try { fs.chmodSync(targetPath, 0o755); } catch (e) {}
              }
            }
            executablePath = targetPath;
          }
        }
      } else if (process.platform !== "win32") {
        if (fs.existsSync(distDir)) {
          fs.readdirSync(distDir).forEach((f) => {
            if (!f.endsWith(".js") && !f.endsWith(".ts") && !f.endsWith(".map") && !f.endsWith(".json")) {
              try { fs.chmodSync(path.join(distDir, f), 0o755); } catch (e) {}
            }
          });
        }
      }
    } catch (e) {
      console.warn("[CycleTLS] Failed during binary extraction/permission setup:", e.message);
    }

    try {
      const initCycleTLS = require("cycletls");
      cycleTLSInstance = await initCycleTLS({ executablePath });
    } catch (err) {
      console.warn("[CycleTLS] Failed to initialize (likely missing native binary):", err.message);
      console.warn("[CycleTLS] Falling back to standard fetch for all requests.");
      cycleTLSFailed = true;
      return null;
    }
  }
  return cycleTLSInstance;
}

async function fetchUpstreamPipe(encodedReq, headers = {}) {
  let pipeUrl = process.env.MIRURO_PIPE_URL || "https://www.miruro.tv/api/secure/pipe";
  if (pipeUrl.includes("8191") || pipeUrl.endsWith("/v1")) {
    pipeUrl = "https://www.miruro.tv/api/secure/pipe";
  }

  let customHeaders = { ...HEADERS, ...getHarvestedHeaders(), ...headers };
  let targetUrl = `${pipeUrl}?e=${encodedReq}`;

  // Use CycleTLS to perform native TLS JA3 impersonation outside of test environments
  if (process.env.NODE_ENV !== "test" && !process.env.VITEST) {
    try {
      const client = await getCycleTLS();
      if (client) {
        const resp = await client(
          targetUrl,
          {
            timeout: 8,
            ja3: "771,4865-4866-4867-49195-49199-49196-49200-52393-52392-49171-49172-156-157-47-53,0-23-65281-10-11-35-16-5-13-18-51-45-43-27-17513,29-23-24,0",
            userAgent: customHeaders["User-Agent"] || HEADERS["User-Agent"],
            headers: customHeaders,
            responseType: "text",
          },
          "get"
        );
        if (resp.status < 500) {
          return {
            ok: resp.status >= 200 && resp.status < 300,
            status: resp.status,
            text: async () => (resp.data ? resp.data.toString("utf-8") : ""),
          };
        }
      }
    } catch (err) {
      console.error("CycleTLS failed, falling back to standard fetch:", err.message);
    }
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);
  return fetch(targetUrl, { headers: customHeaders, signal: controller.signal }).finally(() => clearTimeout(timeoutId));
}

function getHarvestedHeaders() {
  const headers = {};
  const clearance = process.env.CF_CLEARANCE_MIRURO || process.env.CF_CLEARANCE;
  if (clearance) {
    let cookieVal = clearance.trim();
    if (!cookieVal.includes("=")) cookieVal = `cf_clearance=${cookieVal}`;
    headers["Cookie"] = cookieVal;
  }
  if (process.env.CF_USER_AGENT) {
    headers["User-Agent"] = process.env.CF_USER_AGENT;
  }
  return headers;
}

module.exports = {
  HEADERS,
  MIRURO_PIPE_URL,
  decodePipeResponse,
  encodePipeRequest,
  fetchUpstreamPipe,
  getCycleTLS,
  getHarvestedHeaders,
};
