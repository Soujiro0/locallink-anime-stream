const serverCache = require("../config/cache");
const { deepTranslate } = require("../utils/anilist");
const { HEADERS, MIRURO_PIPE_URL, encodePipeRequest, decodePipeResponse, fetchUpstreamPipe, getCycleTLS } = require("../utils/pipe");
const tokenSigner = require("../utils/tokenSigner");
const whitelist = require("../config/whitelist");

function getPipeHeaders() {
  const headers = { ...HEADERS };
  whitelist.attachWhitelistedCloudflareState(headers, MIRURO_PIPE_URL);
  return headers;
}

function handlePipeError(res) {
  if (res.status === 403 || res.status === 503) {
    throw new Error(`Pipe request blocked by upstream Cloudflare (HTTP ${res.status}). To bypass, copy your cf_clearance cookie from your browser when visiting miruro.tv and add CF_CLEARANCE_MIRURO="cf_clearance=..." to your .env file.`);
  }
  throw new Error(`Pipe request failed with status ${res.status}`);
}

async function safeTokenFetch(url, headers, method = "GET", body = null) {
  let targetHost = "";
  try { targetHost = new URL(url).hostname; } catch (e) {}

  const isStrict = targetHost && (targetHost.includes("kwik") || targetHost.includes("allmanga") || targetHost.includes("fallanime") || targetHost.includes("pahe"));
  if (!isStrict) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);
    try {
      const opts = { method, headers, redirect: "follow", signal: controller.signal };
      if (body) opts.body = body;
      const res = await fetch(url, opts);
      clearTimeout(timeoutId);
      if (res.ok && res.status !== 403 && res.status !== 503) {
        return { url: res.url || url, text: await res.text(), headers: res.headers };
      }
    } catch (e) {
      clearTimeout(timeoutId);
    }
  }

  if (process.env.NODE_ENV !== "test" && !process.env.VITEST) {
    try {
      const client = await getCycleTLS();
      const cyOpts = {
        timeout: 4,
        ja3: "771,4865-4866-4867-49195-49199-49196-49200-52393-52392-49171-49172-156-157-47-53,0-23-65281-10-11-35-16-5-13-18-51-45-43-27-17513,29-23-24,0",
        userAgent: headers["User-Agent"] || HEADERS["User-Agent"],
        headers,
        responseType: "text",
      };
      if (body) cyOpts.body = body;
      const resp = await client(url, cyOpts, method.toLowerCase());
      const resHeaders = new Map();
      if (resp.headers) {
        Object.entries(resp.headers).forEach(([k, v]) => resHeaders.set(k.toLowerCase(), Array.isArray(v) ? v.join("; ") : String(v)));
      }
      return {
        url: resp.finalUrl || url,
        text: resp.data ? resp.data.toString("utf-8") : "",
        headers: { get: (k) => resHeaders.get(k.toLowerCase()) || null },
      };
    } catch (e) {}
  }

  return { url, text: "", headers: new Headers() };
}

async function resolveSessionToken(url, referer, provider) {
  try {
    if (!url || !url.startsWith("http")) return url;
    const headers = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36 Edg/136.0.0.0",
      "Referer": referer || (provider === "bee" || provider === "pahe" || provider === "kiwi" ? "https://kwik.cx/" : "https://allanimeuns.bio/"),
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Sec-Ch-Ua": '"Microsoft Edge";v="136", "Chromium";v="136", "Not.A/Brand";v="99"',
      "Sec-Ch-Ua-Mobile": "?0",
      "Sec-Ch-Ua-Platform": '"Windows"',
    };

    const response = await safeTokenFetch(url, headers, "GET");
    if (response.url && response.url !== url && response.url.includes(".m3u8")) {
      return response.url;
    }

    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    if (contentType.includes("application/json")) {
      try {
        const json = JSON.parse(response.text);
        if (json && (json.url || json.stream || json.m3u8 || json.file)) {
          return json.url || json.stream || json.m3u8 || json.file;
        }
      } catch (e) {}
    }

    const text = response.text || "";
    if (text.startsWith("#EXTM3U") || contentType.includes("mpegurl")) {
      return response.url || url;
    }

    let setCookies = response.headers.get("set-cookie") || "";
    let cookieStr = setCookies.split(",").map(c => c.split(";")[0].trim()).join("; ");
    if (cookieStr) {
      try {
        serverCache.set("cookie_" + new URL(url).hostname, cookieStr, 3600);
      } catch (e) {}
    }

    if (text.includes("eval(function(p,a,c,k,e,d)")) {
      const dictMatches = [...text.matchAll(/['"]([^'"]+?)['"]\.split\(['"]\|['"]\)/g)];
      for (const m of dictMatches) {
        const words = m[1].split('|');
        const m3u8Word = words.find(w => w.includes('.m3u8') || w.includes('token='));
        if (m3u8Word && m3u8Word.startsWith('http')) return m3u8Word;
      }
    }

    const formMatch = text.match(/<form[^>]+action=["']([^"']+)["'][^>]*>(.*?)<\/form>/is);
    if (formMatch) {
      let actionUrl = formMatch[1];
      if (!actionUrl.startsWith("http")) {
        actionUrl = new URL(actionUrl, new URL(url).origin).href;
      }
      const inputs = formMatch[2].matchAll(/<input[^>]+name=["']([^"']+)["'][^>]*value=["']([^"']*)["']/gis);
      const formData = new URLSearchParams();
      for (const inp of inputs) {
        formData.append(inp[1], inp[2]);
      }
      const tokenMatch = text.match(/_token["']?\s*[:=]\s*["']([^"']+)["']/);
      if (tokenMatch && !formData.has("_token")) {
        formData.append("_token", tokenMatch[1]);
      }
      if (formData.toString()) {
        const tokenRes = await safeTokenFetch(actionUrl, {
          ...headers,
          "Content-Type": "application/x-www-form-urlencoded",
          "Cookie": cookieStr
        }, "POST", formData.toString());

        let tokenSetCookies = tokenRes.headers.get("set-cookie") || "";
        let tokenCookieStr = tokenSetCookies.split(",").map(c => c.split(";")[0].trim()).join("; ");
        if (tokenCookieStr || cookieStr) {
          try {
            serverCache.set("cookie_" + new URL(tokenRes.url || actionUrl).hostname, tokenCookieStr || cookieStr, 3600);
          } catch (e) {}
        }

        if (tokenRes.url && tokenRes.url !== actionUrl && tokenRes.url.includes(".m3u8")) {
          return tokenRes.url;
        }
        const tokenText = tokenRes.text || "";
        if (tokenText.startsWith("#EXTM3U") || (tokenRes.headers.get("content-type") || "").includes("mpegurl")) {
          return tokenRes.url || actionUrl;
        }
        const directMatch = tokenText.match(/https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/);
        if (directMatch) return directMatch[0];
      }
    }

    const m3u8Regex = /https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/g;
    const matches = [...text.matchAll(m3u8Regex)];
    if (matches && matches.length > 0) {
      return matches[0][0];
    }

    return response.url || url;
  } catch (e) {
    console.error(`Session token exchange error for ${url}:`, e.message);
    return url;
  }
}

async function enrichStreamResponse(data, provider, req, res) {
  if (!data) return data;
  const prov = (provider || "").toLowerCase();
  
  if (prov === "ally" || prov === "allmanga" || data?.headers?.Referer?.includes("fallanime") || data?.headers?.Referer?.includes("allmanga")) {
    if (!data.headers) data.headers = {};
    if (!data.headers.Referer || data.headers.Referer.includes("allmanga") || data.headers.Referer.includes("fallanime")) {
      data.headers.Referer = "https://allanimeuns.bio/";
    }
  } else if (prov === "bee" || prov === "pahe" || prov === "kwik" || prov === "kiwi" || data?.headers?.Referer?.includes("kwik")) {
    if (!data.headers) data.headers = {};
    if (!data.headers.Referer) {
      data.headers.Referer = "https://kwik.cx/";
    }
  }

  const filterStreamLink = (s) => {
    if (!s || !s.url) return false;
    if (s.server === "Uni" || s.url.includes("203.188.")) return false;
    if ((prov === "ally" || prov === "allmanga") && s.server === "Mp4" && s.type === "mp4") return false;
    if (s.url.includes("fast4speed.rsvp") || s.url.includes("Authorization=")) {
      const match = s.url.match(/_(\d{14})_/g);
      if (match && match.length >= 2) {
        const expStr = match[match.length - 1].replace(/_/g, "");
        const year = parseInt(expStr.slice(0, 4), 10);
        const month = parseInt(expStr.slice(4, 6), 10) - 1;
        const day = parseInt(expStr.slice(6, 8), 10);
        const hour = parseInt(expStr.slice(8, 10), 10);
        const min = parseInt(expStr.slice(10, 12), 10);
        const sec = parseInt(expStr.slice(12, 14), 10);
        const expTime = Date.UTC(year, month, day, hour, min, sec);
        if (expTime < Date.now()) {
          console.log(`[STREAM FILTER] Excluding expired stream link: ${s.server}`);
          return false;
        }
      }
    }
    return true;
  };

  if (Array.isArray(data.streams)) {
    data.streams = data.streams.filter(filterStreamLink);
  }
  if (Array.isArray(data.sources)) {
    data.sources = data.sources.filter(filterStreamLink);
  }


  const listToResolve = Array.isArray(data.sources) ? data.sources : (Array.isArray(data.streams) ? data.streams : null);
  if ((prov === "ally" || prov === "allmanga" || prov === "bee" || prov === "pahe" || prov === "kwik" || prov === "kiwi") && listToResolve) {
    await Promise.all(listToResolve.map(async (source) => {
      if (source && typeof source.url === "string") {
        source.url = await resolveSessionToken(source.url, data?.headers?.Referer, prov);
      }
    }));
  }

  // Attach legitimate native IP-bound tokens and HLS session cookie
  if (req && listToResolve && listToResolve.length > 0) {
    try {
      const clientIp = tokenSigner.extractClientIp(req);
      const primaryUrl = listToResolve[0]?.url || "locallink_stream";
      const primaryToken = tokenSigner.generateStreamToken({ streamId: primaryUrl, clientIp });
      
      if (res && typeof res.setHeader === "function") {
        res.setHeader("Set-Cookie", tokenSigner.createHlsAuthCookie({
          streamId: primaryUrl,
          sig: primaryToken.sig,
          exp: primaryToken.exp,
          domain: req.hostname
        }));
      }

      for (const source of listToResolve) {
        if (source && source.url) {
          const srcToken = tokenSigner.generateStreamToken({ streamId: source.url, clientIp });
          source.nativeSig = srcToken.sig;
          source.nativeExp = srcToken.exp;
          source.clientIp = clientIp;
        }
      }
    } catch (e) {}
  }

  return data;
}


function injectSourceSlugs(data, anilistId) {
  const providers = data.providers || {};
  for (const [providerName, providerData] of Object.entries(providers)) {
    if (typeof providerData !== "object" || providerData === null) continue;

    let episodes = providerData.episodes || {};
    if (typeof episodes !== "object" || episodes === null) {
      if (Array.isArray(episodes)) {
        providerData.episodes = { sub: episodes };
        episodes = providerData.episodes;
      } else {
        continue;
      }
    }

    for (const [category, epList] of Object.entries(episodes)) {
      if (!Array.isArray(epList)) continue;
      for (const ep of epList) {
        if (typeof ep !== "object" || ep === null) continue;
        if (ep.id && ep.number !== undefined) {
          if (!ep.rawId) ep.rawId = ep.id;
          const origId = ep.rawId;
          const prefix = origId.includes(":") ? origId.split(":")[0] : origId;
          ep.id = `watch/${providerName}/${anilistId}/${category}/${prefix}-${ep.number}`;
        }
      }
    }
  }
  return data;
}

async function fetchRawEpisodes(anilistId) {
  const cacheKey = `episodes_${anilistId}`;
  const cachedData = serverCache.get(cacheKey);
  if (cachedData) {
    console.log(`[CACHE HIT] Episodes for AniList ID: ${anilistId}`);
    return cachedData;
  }

  const payload = {
    path: "episodes",
    method: "GET",
    query: { anilistId: parseInt(anilistId) },
    body: null,
    version: "0.1.0",
  };
  const encodedReq = encodePipeRequest(payload);

  const response = await fetchUpstreamPipe(encodedReq, getPipeHeaders());
  if (!response.ok) handlePipeError(response);

  const text = (await response.text()).trim();
  const data = await decodePipeResponse(text);
  deepTranslate(data);
  
  serverCache.set(cacheKey, data, 900); // 15 Mins TTL
  return data;
}

exports.episodes = async (req, res) => {
  try {
    const anilistId = parseInt(req.params.anilist_id);
    const data = await fetchRawEpisodes(anilistId);
    res.json(injectSourceSlugs(data, anilistId));
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
};

exports.skips = async (req, res) => {
  try {
    const { mal_id, episode } = req.params;
    const cacheKey = `skips_${mal_id}_${episode}`;
    const cachedData = serverCache.get(cacheKey);
    if (cachedData) {
      console.log(`[CACHE HIT] Skips for MAL ID: ${mal_id} Ep: ${episode}`);
      return res.json(cachedData);
    }

    const url = `https://api.aniskip.com/v2/skip-times/${mal_id}/${episode}?types[]=ed&types[]=op&types[]=mixed-op&types[]=mixed-ed&episodeLength=0`;
    const response = await fetch(url);
    if (!response.ok) {
      if (response.status === 404) {
        const notFoundData = { found: false, results: [] };
        serverCache.set(cacheKey, notFoundData, 86400); // 24 Hours TTL
        return res.json(notFoundData);
      }
      return res.status(response.status).json({ detail: "AniSkip request failed" });
    }
    const data = await response.json();
    serverCache.set(cacheKey, data, 86400); // 24 Hours TTL
    res.json(data);
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
};

exports.sources = async (req, res) => {
  try {
    const { episodeId, provider, anilistId, category = "sub" } = req.query;
    if (!episodeId || !provider || !anilistId)
      return res.status(400).json({ detail: "Missing params" });

    const encId = episodeId.includes(":") ? Buffer.from(episodeId).toString("base64url") : episodeId;

    const payload = {
      path: "sources",
      method: "GET",
      query: {
        episodeId: encId,
        provider,
        category,
        anilistId: parseInt(anilistId),
      },
      body: null,
      version: "0.1.0",
    };
    const encodedReq = encodePipeRequest(payload);

    const response = await fetchUpstreamPipe(encodedReq, getPipeHeaders());
    if (!response.ok) handlePipeError(response);

    const text = (await response.text()).trim();
    const data = await decodePipeResponse(text);
    await enrichStreamResponse(data, provider, req, res);
    res.json(data);
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
};

exports.watch = async (req, res) => {
  try {
    const { provider, anilist_id, category, slug } = req.params;
    const anilistIdInt = parseInt(anilist_id);

    const data = await fetchRawEpisodes(anilistIdInt);
    const provData = data.providers?.[provider] || {};
    const epList = provData.episodes?.[category] || [];

    let targetId = null;
    for (const ep of epList) {
      const origId = ep.rawId || ep.id || "";
      const prefix = origId.includes(":") ? origId.split(":")[0] : origId;
      const generated = `${prefix}-${ep.number}`;
      if (generated === slug) {
        targetId = origId;
        break;
      }
    }

    if (!targetId)
      return res
        .status(404)
        .json({
          detail: `Episode slug '${slug}' not found for provider ${provider}`,
        });

    const encId = targetId.includes(":") ? Buffer.from(targetId).toString("base64url") : targetId;
    const payload = {
      path: "sources",
      method: "GET",
      query: { episodeId: encId, provider, category, anilistId: anilistIdInt },
      body: null,
      version: "0.1.0",
    };
    const encodedReq = encodePipeRequest(payload);

    const response = await fetchUpstreamPipe(encodedReq, getPipeHeaders());
    if (!response.ok) handlePipeError(response);

    const text = (await response.text()).trim();
    const finalData = await decodePipeResponse(text);
    await enrichStreamResponse(finalData, provider, req, res);

    res.json(finalData);
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
};

exports.authorize = async (req, res) => {
  try {
    const streamId = req.query.streamId || req.query.url || req.body?.streamId;
    if (!streamId) {
      return res.status(400).json({ detail: "Missing streamId or url for authorization" });
    }
    const clientIp = tokenSigner.extractClientIp(req);
    const tokenData = tokenSigner.generateStreamToken({ streamId, clientIp });
    
    res.setHeader("Set-Cookie", tokenSigner.createHlsAuthCookie({
      streamId,
      sig: tokenData.sig,
      exp: tokenData.exp,
      domain: req.hostname
    }));

    res.json({
      success: true,
      authorizedStreamId: streamId,
      clientIp,
      expiresAt: tokenData.exp,
      tokenUrlParam: tokenData.tokenUrlParam,
      sig: tokenData.sig
    });
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
};
