const { Readable } = require("stream");
const { pipeline } = require("stream/promises");
const serverCache = require("../config/cache");
const whitelist = require("../config/whitelist");
const tokenSigner = require("../utils/tokenSigner");
const { getCycleTLS, getHarvestedHeaders } = require("../utils/pipe");

// Modern browser fingerprint headers (matching Miruro's Chromium 136 from screenshot)
const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36 Edg/136.0.0.0",
  "Accept": "*/*",
  "Accept-Language": "en-US,en;q=0.9",
  "Sec-Ch-Ua": '"Microsoft Edge";v="136", "Chromium";v="136", "Not.A/Brand";v="99"',
  "Sec-Ch-Ua-Mobile": "?0",
  "Sec-Ch-Ua-Platform": '"Windows"',
  "Sec-Fetch-Dest": "empty",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Site": "cross-site",
};

// Known-good origin/referer pairs per CDN domain pattern
const ORIGIN_WHITELIST = [
  { patterns: ["ultracloud", "megacloud", "rapidcloud", "dokicloud"], origin: "https://www.miruro.tv", referer: "https://www.miruro.tv/" },
  { patterns: ["ultracloud", "megacloud", "rapidcloud", "dokicloud"], origin: "https://hianime.to", referer: "https://hianime.to/" },
  { patterns: ["owocdn", "uwucdn", "bigdreamsmalldih", "kwik.", "pahe."], origin: "https://kwik.cx", referer: "https://kwik.cx/" },
  { patterns: ["allmanga", "fallanime", "wixmp", "203.188."], origin: "https://allanimeuns.bio", referer: "https://allanimeuns.bio/" },
  { patterns: ["allmanga", "fallanime", "wixmp", "203.188."], origin: "https://allmanga.to", referer: "https://allmanga.to/" },
  { patterns: ["nekostream", "ipstatp"], origin: "https://vidtube.site", referer: "https://vidtube.site/" },
];

// Default strict CDN hostnames (self-learning list augmented at runtime)
const DEFAULT_STRICT_CDNS = [
  "nekostream", "owocdn", "uwucdn", "vault-", "vidtube", "wixmp", "mt.", "203.188.",
  "kwik", "pahe", "bigdreamsmalldih", "allmanga", "fallanime", "megacloud",
  "rapidcloud", "dokicloud", "ultracloud", "rabbitstream"
];

function resolveRefererForUrl(targetUrl, customReferer) {
  if (targetUrl.includes('owocdn.top') || targetUrl.includes('uwucdn.top') || targetUrl.includes('bigdreamsmalldih.site') || targetUrl.includes('kwik.') || targetUrl.includes('pahe.')) {
    return 'https://kwik.cx/';
  }
  if (targetUrl.includes('megacloud') || targetUrl.includes('rapidcloud') || targetUrl.includes('dokicloud') || targetUrl.includes('rabbitstream')) {
    return 'https://megacloud.tv/';
  }
  if (targetUrl.includes('nekostream.site') || targetUrl.includes('ipstatp.com')) {
    return 'https://vidtube.site/';
  }
  if (targetUrl.includes('wixmp.com') || targetUrl.includes('203.188.') || targetUrl.includes('allmanga') || targetUrl.includes('fallanime')) {
    return 'https://allanimeuns.bio/';
  }
  if (customReferer && customReferer.startsWith('http')) {
    return customReferer;
  }
  return customReferer || null;
}

function getOriginFromReferer(refererHeader, targetUrl) {
  try {
    return new URL(refererHeader).origin;
  } catch (e) {
    return new URL(targetUrl).origin;
  }
}

function buildHeaders(targetUrl, refererHeader, originHeader, cachedCookie, rangeHeader) {
  const headers = {
    ...BROWSER_HEADERS,
    "Referer": refererHeader,
    "Origin": originHeader,
  };
  if (cachedCookie) headers["Cookie"] = cachedCookie;
  if (rangeHeader) headers["Range"] = rangeHeader;
  whitelist.attachWhitelistedCloudflareState(headers, targetUrl);
  return headers;
}

function isStrictCdnHost(hostname) {
  // Check dynamic cache first (learned from 403 reports)
  if (serverCache.get("strict_cdn_" + hostname)) return true;
  // Check default list
  return DEFAULT_STRICT_CDNS.some(pattern => hostname.includes(pattern));
}

function findAlternateOrigin(targetUrl, currentReferer) {
  for (const entry of ORIGIN_WHITELIST) {
    if (entry.patterns.some(p => targetUrl.includes(p)) && entry.referer !== currentReferer) {
      // Check if we've cached this origin as working for this CDN
      return { origin: entry.origin, referer: entry.referer };
    }
  }
  // Fallback: try miruro.tv as a generic whitelisted origin
  if (currentReferer !== "https://www.miruro.tv/") {
    return { origin: "https://www.miruro.tv", referer: "https://www.miruro.tv/" };
  }
  return null;
}

function saveCookiesFromResponse(response, targetUrl) {
  try {
    let targetHost = new URL(targetUrl).hostname;
    const setCookies = typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()
      : [response.headers.get("set-cookie")].filter(Boolean);

    if (setCookies && setCookies.length > 0) {
      const existing = serverCache.get("cookie_" + targetHost) || "";
      const cookieMap = new Map();
      if (existing) {
        existing.split(';').forEach(pair => {
          const [k, ...v] = pair.trim().split('=');
          if (k) cookieMap.set(k.trim(), v.join('=').trim());
        });
      }
      setCookies.forEach(c => {
        const firstPart = c.split(';')[0].trim();
        const [k, ...v] = firstPart.split('=');
        if (k) cookieMap.set(k.trim(), v.join('=').trim());
      });
      const serialized = Array.from(cookieMap.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
      if (serialized) {
        serverCache.set("cookie_" + targetHost, serialized, 86400); // 24h
      }
    }
  } catch (e) {}
}

async function nativeStreamFetch(targetUrl, headers = {}, signal = null, method = "GET") {
  if (signal?.aborted) throw new Error("Request aborted");
  if (targetUrl.startsWith("http://") && !targetUrl.includes("localhost") && !targetUrl.includes("127.0.0.1")) {
    targetUrl = targetUrl.replace("http://", "https://");
  }
  const harvested = getHarvestedHeaders();
  const mergedHeaders = { ...harvested, ...headers };

  let targetHost = "";
  try { targetHost = new URL(targetUrl).hostname; } catch (e) {}

  // Only try standard undici fetch first if it's NOT a known strict CDN host
  if (!targetHost || !isStrictCdnHost(targetHost)) {
    let res = await fetch(targetUrl, { headers: mergedHeaders, signal, method }).catch(() => null);
    if (res && res.status !== 403 && res.status !== 503) {
      return res;
    }
  }

  if (signal?.aborted) throw new Error("Request aborted");

  // If 403 or network error due to TLS fingerprinting, use CycleTLS
  try {
    const client = await getCycleTLS();
    const fetchPromise = client(
      targetUrl,
      {
        timeout: 12,
        ja3: "771,4865-4866-4867-49195-49199-49196-49200-52393-52392-49171-49172-156-157-47-53,0-23-65281-10-11-35-16-5-13-18-51-45-43-27-17513,29-23-24,0",
        userAgent: mergedHeaders["User-Agent"] || BROWSER_HEADERS["User-Agent"],
        headers: mergedHeaders,
        responseType: "arraybuffer",
      },
      method.toLowerCase()
    );

    const abortPromise = new Promise((_, reject) => {
      if (signal) {
        if (signal.aborted) reject(new Error("Request aborted"));
        else signal.addEventListener("abort", () => reject(new Error("Request aborted")), { once: true });
      }
    });

    const resp = await Promise.race([fetchPromise, abortPromise]);

    const headersMap = new Map();
    if (resp.headers) {
      Object.entries(resp.headers).forEach(([k, v]) => {
        const val = Array.isArray(v) ? v.join("; ") : String(v);
        headersMap.set(k.toLowerCase(), val);
      });
    }

    const rawData = resp.data;
    // CycleTLS arraybuffer returns ArrayBuffer (not Buffer). Buffer.from(ArrayBuffer)
    // reads from byteOffset=0 of the underlying pool, corrupting data when byteOffset!=0.
    // Wrapping with Uint8Array first correctly slices the view's byte range.
    let buf;
    if (Buffer.isBuffer(rawData)) {
      buf = rawData;
    } else if (rawData instanceof ArrayBuffer) {
      buf = Buffer.from(new Uint8Array(rawData));
    } else if (rawData) {
      buf = Buffer.from(new Uint8Array(rawData.buffer || rawData, rawData.byteOffset || 0, rawData.byteLength || rawData.length));
    } else {
      buf = Buffer.alloc(0);
    }
    let readDone = false;

    return {
      ok: resp.status >= 200 && resp.status < 300,
      status: resp.status,
      headers: {
        get: (key) => headersMap.get(key.toLowerCase()) || null,
        forEach: (callback) => headersMap.forEach((v, k) => callback(v, k)),
      },
      text: async () => buf.toString("utf-8"),
      body: {
        getReader: () => ({
          read: async () => {
            if (readDone) return { done: true, value: undefined };
            readDone = true;
            return { done: false, value: buf };
          },
          cancel: async () => {},
        }),
      },
    };
  } catch (err) {
    console.error(`[PROXY] CycleTLS fallback failed for ${targetUrl}:`, err.message);
    if (res) return res;
    throw err;
  }
}

async function fetchWithRetry(targetUrl, headers, signal, currentReferer, isTrusted = false) {
  let response = await nativeStreamFetch(targetUrl, headers, signal, "GET");
  saveCookiesFromResponse(response, targetUrl);

  if (isTrusted && (response.ok || response.status === 206)) {
    return response;
  }

  // If 403, try rotating to an alternate known-good origin
  if (response.status === 403 && !isTrusted) {
    const alt = findAlternateOrigin(targetUrl, currentReferer);
    if (alt) {
      let targetHost = "";
      try { targetHost = new URL(targetUrl).hostname; } catch (e) {}

      console.log(`[PROXY] 403 from ${targetHost}, retrying with origin ${alt.origin}`);
      const retryHeaders = { ...headers, "Referer": alt.referer, "Origin": alt.origin };
      response = await nativeStreamFetch(targetUrl, retryHeaders, signal, "GET");
      saveCookiesFromResponse(response, targetUrl);

      // Cache successful origin for this CDN hostname
      if (response.ok || response.status === 206) {
        if (targetHost) {
          serverCache.set("good_origin_" + targetHost, alt.referer, 86400); // 24h
        }
      }
    }
  }

  return response;
}

exports.proxy = async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range,Authorization");
      res.setHeader("Access-Control-Max-Age", "86400");
      return res.status(204).end();
    }

    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).send("No url provided");

    const tokenParam = req.query.token || req.query.wl_token || req.query.sig;
    const clientIp = tokenSigner.extractClientIp(req);
    const isTrustedToken = whitelist.isWhitelistedToken(tokenParam, targetUrl, req.query.exp ? clientIp : null, req.query.exp);

    let customReferer = req.query.referer;
    customReferer = resolveRefererForUrl(targetUrl, customReferer);

    let targetHost = "";
    try { targetHost = new URL(targetUrl).hostname; } catch (e) {}

    // Check if we have a cached good origin for this CDN
    const cachedGoodOrigin = targetHost ? serverCache.get("good_origin_" + targetHost) : null;
    if (cachedGoodOrigin && !customReferer) {
      customReferer = cachedGoodOrigin;
    }

    const refererHeader = customReferer ? customReferer : new URL(targetUrl).origin + "/";
    const originHeader = getOriginFromReferer(refererHeader, targetUrl);

    const cachedCookie = req.query.cookie || (targetHost ? serverCache.get("cookie_" + targetHost) : null);
    const headers = buildHeaders(targetUrl, refererHeader, originHeader, cachedCookie, req.headers.range);

    const controller = new AbortController();
    res.on("close", () => {
      if (!res.writableEnded) {
        controller.abort();
      }
    });

    const fetchOptions = { headers, signal: controller.signal };
    if (req.method === "HEAD") {
      fetchOptions.method = "HEAD";
    }

    const response = await fetchWithRetry(targetUrl, fetchOptions.headers, fetchOptions.signal, refererHeader, isTrustedToken);
    if (!response.ok && response.status !== 206) {
      // If 403, mark this CDN as strict so future manifests proxy its segments
      if (response.status === 403 && targetHost) {
        serverCache.set("strict_cdn_" + targetHost, true, 86400); // 24h
      }
      res.status(response.status);
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      const errText = await response.text().catch(() => "Proxy error");
      return res.send(errText);
    }

    const reader = response.body.getReader();
    const { done, value: firstChunk } = await reader.read();

    if (done || !firstChunk) {
      res.status(response.status);
      const headersToKeep = ["content-type", "content-length", "accept-ranges", "content-range"];
      response.headers.forEach((val, key) => {
        if (headersToKeep.includes(key.toLowerCase())) res.setHeader(key, val);
      });
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range,Authorization");
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      return res.end();
    }

    let targetPath = "";
    try { targetPath = new URL(targetUrl).pathname.toLowerCase(); } catch (e) {}
    const isKey = targetPath.endsWith('.key') || targetPath.endsWith('/monkey') || targetPath.includes('/key/') || targetUrl.includes('.key') || targetUrl.includes('/monkey') || (firstChunk && firstChunk.length === 16);
    const isM3u8 =
      targetUrl.includes('.m3u8') ||
      (!isKey && firstChunk.length >= 7 && Buffer.from(firstChunk.slice(0, 7)).toString('utf-8') === '#EXTM3U') ||
      response.headers.get("content-type")?.toLowerCase().includes("mpegurl") ||
      response.headers.get("content-type")?.toLowerCase().includes("m3u8");

    if (isM3u8) {
      const chunks = [firstChunk];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }
      let text = Buffer.concat(chunks).toString("utf-8");
      const baseUrl = new URL(targetUrl);
      const lines = text.split('\n');
      const proxyBase = `/proxy?url=`; 

      // Smart Adaptive Routing with self-learning strict CDN detection:
      // - Default strict list covers known strict CDNs
      // - Dynamic list grows when 403s are reported via /proxy/report-blocked or encountered during fetching
      // - proxyChunks=true forces full proxying (used by frontend fallback)
      const forceProxy = req.query.proxyChunks === 'true' || req.query.proxyChunks === '1';
      const isHybridManifest = !forceProxy && !isStrictCdnHost(targetHost);

      const cookieParam = cachedCookie ? "&cookie=" + encodeURIComponent(cachedCookie) : "";
      const tokenParams = whitelist.extractTokenParams(targetUrl);
      if (tokenParam) tokenParams.set("token", tokenParam);
      const tokenQueryStr = tokenParams.toString() ? "&" + tokenParams.toString() : "";

      for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        if (line && !line.startsWith('#')) {
          let absoluteUrl = line.startsWith('http') ? line : new URL(line, baseUrl).href;
          if (absoluteUrl.startsWith("http://") && !absoluteUrl.includes("localhost") && !absoluteUrl.includes("127.0.0.1")) {
            absoluteUrl = absoluteUrl.replace("http://", "https://");
          }
          if (isHybridManifest && !absoluteUrl.toLowerCase().includes('.m3u8')) {
            let segHost = "";
            try { segHost = new URL(absoluteUrl).hostname; } catch (e) {}
            if (segHost && isStrictCdnHost(segHost)) {
              lines[i] = proxyBase + encodeURIComponent(absoluteUrl) + "&referer=" + encodeURIComponent(refererHeader) + cookieParam + tokenQueryStr;
            } else {
              lines[i] = absoluteUrl;
            }
          } else {
            lines[i] = proxyBase + encodeURIComponent(absoluteUrl) + "&referer=" + encodeURIComponent(refererHeader) + cookieParam + tokenQueryStr;
          }
        } else if (line.includes('URI="')) {
          const match = line.match(/URI="([^"]+)"/);
          if (match) {
            let uri = match[1];
            if (!uri.startsWith('data:')) {
              let absoluteUri = uri.startsWith('http') ? uri : new URL(uri, baseUrl).href;
              if (absoluteUri.startsWith("http://") && !absoluteUri.includes("localhost") && !absoluteUri.includes("127.0.0.1")) {
                absoluteUri = absoluteUri.replace("http://", "https://");
              }
              if (isHybridManifest && !absoluteUri.toLowerCase().includes('.m3u8') && !absoluteUri.toLowerCase().includes('.key')) {
                let uriHost = "";
                try { uriHost = new URL(absoluteUri).hostname; } catch (e) {}
                if (uriHost && isStrictCdnHost(uriHost)) {
                  let wrappedUri = proxyBase + encodeURIComponent(absoluteUri) + "&referer=" + encodeURIComponent(refererHeader) + cookieParam + tokenQueryStr;
                  lines[i] = line.replace(`URI="${match[1]}"`, `URI="${wrappedUri}"`);
                } else {
                  lines[i] = line.replace(`URI="${match[1]}"`, `URI="${absoluteUri}"`);
                }
              } else {
                let wrappedUri = proxyBase + encodeURIComponent(absoluteUri) + "&referer=" + encodeURIComponent(refererHeader) + cookieParam + tokenQueryStr;
                lines[i] = line.replace(`URI="${match[1]}"`, `URI="${wrappedUri}"`);
              }
            }
          }
        }
      }
      const outBuffer = Buffer.from(lines.join('\n'), "utf-8");

      res.status(response.status);
      res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
      res.setHeader("Content-Length", outBuffer.byteLength);
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range,Authorization");
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      return res.send(outBuffer);
    }

    let chunkToWrite = firstChunk;
    let strippedDecoy = false;

    // Universal Decoy Stripping: check for disguised MPEG-TS or fMP4 regardless of magic image bytes
    if (!isKey && chunkToWrite.length > 752) {
      const startsWithTs = (chunkToWrite[0] === 0x47 && chunkToWrite[188] === 0x47 && chunkToWrite[376] === 0x47);
      if (!startsWithTs) {
        let tsOffset = -1;
        for (let i = 0; i < Math.min(chunkToWrite.length - 752, 100000); i++) {
          if (chunkToWrite[i] === 0x47 && chunkToWrite[i + 188] === 0x47 && chunkToWrite[i + 376] === 0x47 && chunkToWrite[i + 564] === 0x47 && chunkToWrite[i + 752] === 0x47) {
            tsOffset = i;
            break;
          }
        }
        if (tsOffset !== -1) {
          chunkToWrite = chunkToWrite.slice(tsOffset);
          strippedDecoy = true;
        }
      }
    }

    if (!isKey && !strippedDecoy && chunkToWrite.length > 16) {
      const mp4Boxes = ['ftyp', 'styp', 'moof', 'moov'];
      let mp4Offset = -1;
      for (let i = 0; i < Math.min(chunkToWrite.length - 8, 100000); i++) {
        const typeStr = chunkToWrite.toString('ascii', i + 4, i + 8);
        if (mp4Boxes.includes(typeStr)) {
          const boxLen = chunkToWrite.readUInt32BE(i);
          if (boxLen >= 8 && boxLen <= chunkToWrite.length - i + 1000000) {
            if (i > 0) {
              mp4Offset = i;
              break;
            }
          }
        }
      }
      if (mp4Offset !== -1) {
        chunkToWrite = chunkToWrite.slice(mp4Offset);
        strippedDecoy = true;
      }
    }

    res.status(response.status);

    const headersToKeep = ["content-type", "accept-ranges", "content-range"];
    if (!strippedDecoy) {
      headersToKeep.push("content-length");
    }

    response.headers.forEach((val, key) => {
      const lowerKey = key.toLowerCase();
      if (headersToKeep.includes(lowerKey)) {
        res.setHeader(key, val);
      }
    });

    const isImageExtOrMime = targetUrl.includes('.jpg') || targetUrl.includes('.png') || targetUrl.includes('.gif') || targetUrl.includes('.webp') || response.headers.get("content-type")?.toLowerCase().includes("image/");
    if (isKey) {
      res.setHeader("Content-Type", "application/octet-stream");
    } else if (strippedDecoy || isImageExtOrMime || targetUrl.includes('.ts')) {
      if (chunkToWrite.length > 8 && ['ftyp', 'styp', 'moof', 'moov'].includes(chunkToWrite.toString('ascii', 4, 8))) {
        res.setHeader("Content-Type", "video/mp4");
      } else {
        res.setHeader("Content-Type", "video/mp2t");
      }
    } else if (targetUrl.includes('.vtt')) {
      res.setHeader("Content-Type", "text/vtt");
    }

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range,Authorization");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    async function* streamGenerator() {
      yield chunkToWrite;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) yield value;
      }
    }

    await pipeline(Readable.from(streamGenerator()), res).catch((err) => {
      if (err.code !== "ERR_STREAM_PREMATURE_CLOSE" && err.name !== "AbortError") {
        console.error("Pipeline streaming error:", err.message);
      }
    });
  } catch (err) {
    if (err.name !== "AbortError" && err.code !== "ERR_STREAM_PREMATURE_CLOSE") {
      console.error("Proxy error:", err.message);
      if (!res.headersSent) {
        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
        res.status(500).send("Proxy error");
      }
    }
  }
};

// Endpoint for frontend to report blocked CDN hostnames (self-learning strict CDN detection)
exports.reportBlocked = async (req, res) => {
  try {
    const { hostname } = req.body || {};
    if (!hostname || typeof hostname !== "string") {
      return res.status(400).json({ detail: "Missing hostname" });
    }
    const cleanHost = hostname.replace(/[^a-zA-Z0-9.\-]/g, "").toLowerCase();
    if (cleanHost) {
      serverCache.set("strict_cdn_" + cleanHost, true, 86400); // 24h
      console.log(`[CDN LEARN] Marked ${cleanHost} as strict CDN (reported by client)`);
    }
    res.json({ ok: true, hostname: cleanHost });
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
};
