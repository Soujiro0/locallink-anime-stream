const serverCache = require("../config/cache");
const { deepTranslate } = require("../utils/anilist");
const { HEADERS, MIRURO_PIPE_URL, encodePipeRequest, decodePipeResponse } = require("../utils/pipe");

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

  const response = await fetch(`${MIRURO_PIPE_URL}?e=${encodedReq}`, {
    headers: HEADERS,
  });
  if (!response.ok) throw new Error("Pipe request failed");

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

    const encId = Buffer.from(episodeId).toString("base64url");

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

    const response = await fetch(`${MIRURO_PIPE_URL}?e=${encodedReq}`, {
      headers: HEADERS,
    });
    if (!response.ok)
      return res
        .status(response.status)
        .json({ detail: "Pipe request failed" });

    const text = (await response.text()).trim();
    const data = await decodePipeResponse(text);
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

    const encId = Buffer.from(targetId).toString("base64url");
    const payload = {
      path: "sources",
      method: "GET",
      query: { episodeId: encId, provider, category, anilistId: anilistIdInt },
      body: null,
      version: "0.1.0",
    };
    const encodedReq = encodePipeRequest(payload);

    const response = await fetch(`${MIRURO_PIPE_URL}?e=${encodedReq}`, {
      headers: HEADERS,
    });
    if (!response.ok)
      return res
        .status(response.status)
        .json({ detail: "Pipe request failed" });

    const text = (await response.text()).trim();
    const finalData = await decodePipeResponse(text);

    if (provider.toLowerCase() === 'ally' || provider.toLowerCase() === 'allmanga' || finalData.headers?.Referer?.includes('fallanime')) {
      if (!finalData.headers) finalData.headers = {};
      finalData.headers.Referer = "https://allmanga.to/";
    }

    res.json(finalData);
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
};
