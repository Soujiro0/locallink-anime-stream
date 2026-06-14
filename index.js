const express = require("express");
const path = require("path");
const zlib = require("zlib");
const util = require("util");
const gunzip = util.promisify(zlib.gunzip);

const app = express();
const PORT = process.env.PORT || 3000;

// Serve production build if exists
app.use(express.static(path.join(__dirname, "client", "dist")));
app.use(express.json());

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Referer: "https://www.miruro.tv/",
};
const ANILIST_URL = "https://graphql.anilist.co";
const MIRURO_PIPE_URL = "https://www.miruro.tv/api/secure/pipe";

// ─── Utility Functions ───────────────────────────────────────────────────────

function proxyDeepImages(obj) {
  // Proxy removed — return data unchanged
  return obj;
}

function translateId(encodedId) {
  try {
    let padded = encodedId;
    const pad = encodedId.length % 4;
    if (pad) padded += "=".repeat(4 - pad);
    const b64 = padded.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = Buffer.from(b64, "base64").toString("utf-8");
    if (decoded.includes(":")) return decoded;
    return encodedId;
  } catch (err) {
    return encodedId;
  }
}

function deepTranslate(obj) {
  if (Array.isArray(obj)) {
    obj.forEach((item) => deepTranslate(item));
  } else if (obj !== null && typeof obj === "object") {
    for (const key in obj) {
      if (key === "id" && typeof obj[key] === "string") {
        obj[key] = translateId(obj[key]);
      } else {
        deepTranslate(obj[key]);
      }
    }
  }
}

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
  // Buffer.from().toString('base64url') creates url-safe base64 and auto-strips '=' padding
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

async function anilistQuery(query, variables = null) {
  const body = { query };
  if (variables) body.variables = variables;

  const response = await fetch(ANILIST_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error("AniList query failed");
  }
  const resJson = await response.json();
  return resJson.data || {};
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
          const origId = ep.id;
          const prefix = origId.includes(":") ? origId.split(":")[0] : origId;
          ep.id = `watch/${providerName}/${anilistId}/${category}/${prefix}-${ep.number}`;
        }
      }
    }
  }
  return data;
}

async function fetchRawEpisodes(anilistId) {
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
  return data;
}

// ─── Shared GraphQL Fragments ────────────────────────────────────────────────

const MEDIA_LIST_FIELDS = `
    id
    title { romaji english native }
    coverImage { large extraLarge }
    bannerImage
    format
    season
    seasonYear
    episodes
    duration
    status
    averageScore
    meanScore
    popularity
    favourites
    genres
    source
    countryOfOrigin
    isAdult
    studios(isMain: true) { nodes { name isAnimationStudio } }
    nextAiringEpisode { episode airingAt timeUntilAiring }
    startDate { year month day }
    endDate { year month day }
`;

const MEDIA_FULL_FIELDS = `
    id
    idMal
    title { romaji english native }
    description(asHtml: false)
    coverImage { large extraLarge color }
    bannerImage
    format
    season
    seasonYear
    episodes
    duration
    status
    averageScore
    meanScore
    popularity
    favourites
    trending
    genres
    tags { name rank isMediaSpoiler }
    source
    countryOfOrigin
    isAdult
    hashtag
    synonyms
    siteUrl
    trailer { id site thumbnail }
    studios { nodes { id name isAnimationStudio siteUrl } }
    nextAiringEpisode { episode airingAt timeUntilAiring }
    startDate { year month day }
    endDate { year month day }
    characters(sort: [ROLE, RELEVANCE], perPage: 25) {
        edges {
            role
            node { id name { full native } image { large } }
            voiceActors(language: JAPANESE) { id name { full native } image { large } languageV2 }
        }
    }
    staff(sort: RELEVANCE, perPage: 25) {
        edges {
            role
            node { id name { full native } image { large } }
        }
    }
    relations {
        edges {
            relationType(version: 2)
            node {
                id
                title { romaji english native }
                coverImage { large }
                format
                type
                status
                episodes
                meanScore
            }
        }
    }
    recommendations(sort: RATING_DESC, perPage: 10) {
        nodes {
            rating
            mediaRecommendation {
                id
                title { romaji english native }
                coverImage { large }
                format
                episodes
                status
                meanScore
                averageScore
            }
        }
    }
    externalLinks { url site type }
    streamingEpisodes { title thumbnail url site }
    stats {
        scoreDistribution { score amount }
        statusDistribution { status amount }
    }
`;

// ─── Homepage ────────────────────────────────────────────────────────────────



// ─── Search & Suggestions ───────────────────────────────────────────────────

app.get("/api/search", async (req, res) => {
  try {
    const query = req.query.query;
    const page = parseInt(req.query.page) || 1;
    const perPage = parseInt(req.query.per_page) || 20;
    const { genre, format, status, sort } = req.query;

    const args = ["type: ANIME"];
    const variables = { page, perPage };
    const varTypes = ["$page: Int", "$perPage: Int"];

    if (query) {
      args.push("search: $search");
      variables.search = query;
      varTypes.push("$search: String");
    }
    if (sort && SORT_MAP[sort]) {
      args.push(`sort: [${SORT_MAP[sort]}]`);
    } else {
      args.push("sort: SEARCH_MATCH");
    }
    if (genre) {
      args.push("genre: $genre");
      variables.genre = genre;
      varTypes.push("$genre: String");
    }
    if (format) {
      args.push("format: $format");
      variables.format = format.toUpperCase();
      varTypes.push("$format: MediaFormat");
    }
    if (status) {
      args.push("status: $status");
      variables.status = status.toUpperCase();
      varTypes.push("$status: MediaStatus");
    }

    const gql = `
        query (${varTypes.join(", ")}) {
            Page(page: $page, perPage: $perPage) {
                pageInfo { total currentPage lastPage hasNextPage perPage }
                media(${args.join(", ")}) {
                    ${MEDIA_LIST_FIELDS}
                }
            }
        }`;

    const data = await anilistQuery(gql, variables);
    const pageData = data.Page || {};
    const pageInfo = pageData.pageInfo || {};

    res.json(
      proxyDeepImages({
        page: pageInfo.currentPage || page,
        perPage: pageInfo.perPage || perPage,
        total: pageInfo.total || 0,
        hasNextPage: pageInfo.hasNextPage || false,
        results: pageData.media || [],
      }),
    );
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

app.get("/api/suggestions", async (req, res) => {
  try {
    const query = req.query.query;
    if (!query) return res.status(400).json({ detail: "Query required" });

    const gql = `
        query ($search: String) {
            Page(page: 1, perPage: 8) {
                media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
                    id title { romaji english } coverImage { large } format status startDate { year } episodes
                }
            }
        }`;

    const data = await anilistQuery(gql, { search: query });
    const results = (data.Page?.media || []).map((item) => ({
      id: item.id,
      title: item.title?.english || item.title?.romaji,
      title_romaji: item.title?.romaji,
      poster: item.coverImage?.large,
      format: item.format,
      status: item.status,
      year: item.startDate?.year,
      episodes: item.episodes,
    }));

    res.json(proxyDeepImages({ suggestions: results }));
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

// ─── Advanced Filter ─────────────────────────────────────────────────────────

const SORT_MAP = {
  SCORE_DESC: "SCORE_DESC",
  POPULARITY_DESC: "POPULARITY_DESC",
  TRENDING_DESC: "TRENDING_DESC",
  START_DATE_DESC: "START_DATE_DESC",
  FAVOURITES_DESC: "FAVOURITES_DESC",
  UPDATED_AT_DESC: "UPDATED_AT_DESC",
};

app.get("/api/filter", async (req, res) => {
  try {
    const {
      genre,
      tag,
      year,
      season,
      format,
      status,
      sort = "POPULARITY_DESC",
    } = req.query;
    const page = parseInt(req.query.page) || 1;
    const perPage = parseInt(req.query.per_page) || 20;

    const args = [
      "type: ANIME",
      `sort: [${SORT_MAP[sort] || "POPULARITY_DESC"}]`,
    ];
    const variables = { page, perPage };
    const varTypes = ["$page: Int", "$perPage: Int"];

    if (genre) {
      args.push("genre: $genre");
      variables.genre = genre;
      varTypes.push("$genre: String");
    }
    if (tag) {
      args.push("tag: $tag");
      variables.tag = tag;
      varTypes.push("$tag: String");
    }
    if (year) {
      args.push("seasonYear: $seasonYear");
      variables.seasonYear = parseInt(year);
      varTypes.push("$seasonYear: Int");
    }
    if (season) {
      args.push("season: $season");
      variables.season = season.toUpperCase();
      varTypes.push("$season: MediaSeason");
    }
    if (format) {
      args.push("format: $format");
      variables.format = format.toUpperCase();
      varTypes.push("$format: MediaFormat");
    }
    if (status) {
      args.push("status: $status");
      variables.status = status.toUpperCase();
      varTypes.push("$status: MediaStatus");
    }

    const gql = `
        query (${varTypes.join(", ")}) {
            Page(page: $page, perPage: $perPage) {
                pageInfo { total currentPage lastPage hasNextPage perPage }
                media(${args.join(", ")}) {
                    ${MEDIA_LIST_FIELDS}
                }
            }
        }`;

    const data = await anilistQuery(gql, variables);
    const pageData = data.Page || {};
    const pageInfo = pageData.pageInfo || {};

    res.json(
      proxyDeepImages({
        page: pageInfo.currentPage || page,
        perPage: pageInfo.perPage || perPage,
        total: pageInfo.total || 0,
        hasNextPage: pageInfo.hasNextPage || false,
        results: pageData.media || [],
      }),
    );
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

// ─── Collection Endpoints ──────────────────────────────────────────────────

async function fetchCollection(sortType, statusStr, page, perPage) {
  const statusFilter = statusStr ? `, status: ${statusStr}` : "";
  const gql = `
    query ($page: Int, $perPage: Int) {
        Page(page: $page, perPage: $perPage) {
            pageInfo { total currentPage lastPage hasNextPage perPage }
            media(type: ANIME, sort: [${sortType}]${statusFilter}) {
                ${MEDIA_LIST_FIELDS}
            }
        }
    }`;
  const data = await anilistQuery(gql, { page, perPage });
  const pageData = data.Page || {};
  const pageInfo = pageData.pageInfo || {};
  return proxyDeepImages({
    page: pageInfo.currentPage || page,
    perPage: pageInfo.perPage || perPage,
    total: pageInfo.total || 0,
    hasNextPage: pageInfo.hasNextPage || false,
    results: pageData.media || [],
  });
}

app.get("/api/spotlight", async (req, res) => {
  try {
    const gql = `query { Page(page: 1, perPage: 10) { media(sort: [TRENDING_DESC, POPULARITY_DESC], type: ANIME) { ${MEDIA_LIST_FIELDS} } } }`;
    const data = await anilistQuery(gql);
    res.json(proxyDeepImages({ results: data.Page?.media || [] }));
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

app.get("/api/trending", async (req, res) => {
  try {
    res.json(
      await fetchCollection(
        "TRENDING_DESC",
        null,
        parseInt(req.query.page) || 1,
        parseInt(req.query.per_page) || 20,
      ),
    );
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

app.get("/api/popular", async (req, res) => {
  try {
    res.json(
      await fetchCollection(
        "POPULARITY_DESC",
        null,
        parseInt(req.query.page) || 1,
        parseInt(req.query.per_page) || 20,
      ),
    );
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

app.get("/api/upcoming", async (req, res) => {
  try {
    res.json(
      await fetchCollection(
        "POPULARITY_DESC",
        "NOT_YET_RELEASED",
        parseInt(req.query.page) || 1,
        parseInt(req.query.per_page) || 20,
      ),
    );
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

app.get("/api/recent", async (req, res) => {
  try {
    res.json(
      await fetchCollection(
        "START_DATE_DESC",
        "RELEASING",
        parseInt(req.query.page) || 1,
        parseInt(req.query.per_page) || 20,
      ),
    );
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

app.get("/api/schedule", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const perPage = parseInt(req.query.per_page) || 20;
    const gql = `
        query ($page: Int, $perPage: Int) {
            Page(page: $page, perPage: $perPage) {
                pageInfo { total currentPage lastPage hasNextPage perPage }
                airingSchedules(notYetAired: true, sort: TIME) {
                    episode airingAt timeUntilAiring
                    media { ${MEDIA_LIST_FIELDS} }
                }
            }
        }`;
    const data = await anilistQuery(gql, { page, perPage });
    const pageData = data.Page || {};
    const results = (pageData.airingSchedules || []).map((item) => {
      const entry = item.media || {};
      entry.next_episode = item.episode;
      entry.airingAt = item.airingAt;
      entry.timeUntilAiring = item.timeUntilAiring;
      return entry;
    });
    res.json(
      proxyDeepImages({
        page: pageData.pageInfo?.currentPage || page,
        perPage: pageData.pageInfo?.perPage || perPage,
        total: pageData.pageInfo?.total || 0,
        hasNextPage: pageData.pageInfo?.hasNextPage || false,
        results: results,
      }),
    );
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

app.get("/api/schedule/week", async (req, res) => {
  try {
    const now = Math.floor(Date.now() / 1000);
    const daySeconds = 86400;
    // 3 days back, 4 days forward from start of today
    const todayStart = now - (now % daySeconds);
    const weekStart = todayStart - (3 * daySeconds);
    const weekEnd = todayStart + (4 * daySeconds);

    // Fetch multiple pages to get full week data
    let allResults = [];
    let page = 1;
    let hasMore = true;

    while (hasMore && page <= 5) {
      const gql = `
        query ($page: Int, $perPage: Int, $start: Int, $end: Int) {
            Page(page: $page, perPage: $perPage) {
                pageInfo { hasNextPage }
                airingSchedules(airingAt_greater: $start, airingAt_lesser: $end, sort: TIME) {
                    episode airingAt timeUntilAiring
                    media { ${MEDIA_LIST_FIELDS} }
                }
            }
        }`;
      const data = await anilistQuery(gql, {
        page,
        perPage: 50,
        start: weekStart,
        end: weekEnd,
      });
      const pageData = data.Page || {};
      const schedules = pageData.airingSchedules || [];

      schedules.forEach((item) => {
        const entry = item.media || {};
        entry.next_episode = item.episode;
        entry.airingAt = item.airingAt;
        entry.timeUntilAiring = item.timeUntilAiring;
        allResults.push(entry);
      });

      hasMore = pageData.pageInfo?.hasNextPage || false;
      page++;
    }

    res.json(proxyDeepImages({ results: allResults }));
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

// ─── Anime Details ───────────────────────────────────────────────────────────

app.get("/api/info/:anilist_id", async (req, res) => {
  try {
    const gql = `query ($id: Int) { Media(id: $id, type: ANIME) { ${MEDIA_FULL_FIELDS} } }`;
    const data = await anilistQuery(gql, {
      id: parseInt(req.params.anilist_id),
    });
    if (!data.Media) return res.status(404).json({ detail: "Anime not found" });
    res.json(proxyDeepImages(data.Media));
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

app.get("/api/anime/:anilist_id/characters", async (req, res) => {
  try {
    const gql = `
        query ($id: Int, $page: Int, $perPage: Int) {
            Media(id: $id, type: ANIME) {
                id title { romaji english }
                characters(sort: [ROLE, RELEVANCE], page: $page, perPage: $perPage) {
                    pageInfo { total currentPage lastPage hasNextPage perPage }
                    edges {
                        role node { id name { full native userPreferred } image { large medium } description gender dateOfBirth { year month day } age favourites siteUrl }
                        voiceActors(language: JAPANESE) { id name { full native } image { large } languageV2 }
                    }
                }
            }
        }`;
    const page = parseInt(req.query.page) || 1;
    const perPage = parseInt(req.query.per_page) || 25;
    const data = await anilistQuery(gql, {
      id: parseInt(req.params.anilist_id),
      page,
      perPage,
    });
    if (!data.Media) return res.status(404).json({ detail: "Anime not found" });

    const chars = data.Media.characters || {};
    res.json(
      proxyDeepImages({
        page: chars.pageInfo?.currentPage || page,
        perPage: chars.pageInfo?.perPage || perPage,
        total: chars.pageInfo?.total || 0,
        hasNextPage: chars.pageInfo?.hasNextPage || false,
        characters: chars.edges || [],
      }),
    );
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

app.get("/api/anime/:anilist_id/relations", async (req, res) => {
  try {
    const gql = `
        query ($id: Int) {
            Media(id: $id, type: ANIME) {
                id title { romaji english }
                relations { edges { relationType(version: 2) node { id title { romaji english native } coverImage { large } bannerImage format type status episodes chapters meanScore averageScore popularity startDate { year month day } } } }
            }
        }`;
    const data = await anilistQuery(gql, {
      id: parseInt(req.params.anilist_id),
    });
    if (!data.Media) return res.status(404).json({ detail: "Anime not found" });
    res.json(
      proxyDeepImages({
        id: data.Media.id,
        title: data.Media.title,
        relations: data.Media.relations?.edges || [],
      }),
    );
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

app.get("/api/anime/:anilist_id/recommendations", async (req, res) => {
  try {
    const gql = `
        query ($id: Int, $page: Int, $perPage: Int) {
            Media(id: $id, type: ANIME) {
                id title { romaji english }
                recommendations(sort: RATING_DESC, page: $page, perPage: $perPage) {
                    pageInfo { total currentPage lastPage hasNextPage perPage }
                    nodes { rating mediaRecommendation { id title { romaji english native } coverImage { large extraLarge } bannerImage format episodes status meanScore averageScore popularity genres startDate { year } } }
                }
            }
        }`;
    const page = parseInt(req.query.page) || 1;
    const perPage = parseInt(req.query.per_page) || 10;
    const data = await anilistQuery(gql, {
      id: parseInt(req.params.anilist_id),
      page,
      perPage,
    });
    if (!data.Media) return res.status(404).json({ detail: "Anime not found" });

    const recs = data.Media.recommendations || {};
    res.json(
      proxyDeepImages({
        page: recs.pageInfo?.currentPage || page,
        perPage: recs.pageInfo?.perPage || perPage,
        total: recs.pageInfo?.total || 0,
        hasNextPage: recs.pageInfo?.hasNextPage || false,
        recommendations: recs.nodes || [],
      }),
    );
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

// ─── Streaming (Pipe-based) ─────────────────────────────────────────────────

app.get("/api/episodes/:anilist_id", async (req, res) => {
  try {
    const anilistId = parseInt(req.params.anilist_id);
    const data = await fetchRawEpisodes(anilistId);
    res.json(proxyDeepImages(injectSourceSlugs(data, anilistId)));
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

app.get("/api/sources", async (req, res) => {
  try {
    const { episodeId, provider, anilistId, category = "sub" } = req.query;
    if (!episodeId || !provider || !anilistId)
      return res.status(400).json({ detail: "Missing params" });

    const encId = Buffer.from(episodeId).toString("base64url"); // Node handles url-safe automatically

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
    res.json(proxyDeepImages(data));
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

app.get("/api/watch/:provider/:anilist_id/:category/:slug", async (req, res) => {
  try {
    const { provider, anilist_id, category, slug } = req.params;
    const anilistIdInt = parseInt(anilist_id);

    const data = await fetchRawEpisodes(anilistIdInt);
    const provData = data.providers?.[provider] || {};
    const epList = provData.episodes?.[category] || [];

    let targetId = null;
    for (const ep of epList) {
      const origId = ep.id || "";
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

    // Internally fetch the sources now that we have the targetId
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
    res.json(proxyDeepImages(finalData));
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});



// ──────────────────────────────────────────────
// Proxy (for HLS segments, M3U8 playlists, etc.)
// ──────────────────────────────────────────────

app.get("/proxy", async (req, res) => {
  try {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).send("No url provided");

    let customReferer = req.query.referer;
    
    // Force Kwik referer for AnimePahe CDNs
    if (targetUrl.includes('owocdn.top') || targetUrl.includes('uwucdn.top') || targetUrl.includes('bigdreamsmalldih.site')) {
        customReferer = 'https://kwik.cx/';
    }

    const refererHeader = customReferer ? customReferer : new URL(targetUrl).origin + "/";
    let originHeader = "";
    try {
      originHeader = new URL(refererHeader).origin;
    } catch (e) {
      originHeader = new URL(targetUrl).origin;
    }

    const headers = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "*/*",
      "Accept-Language": "en-US,en;q=0.9",
      "Referer": refererHeader,
      "Origin": originHeader,
    };

    // Crucial for video chunk streaming
    if (req.headers.range) {
      headers["Range"] = req.headers.range;
    }

    const response = await fetch(targetUrl, { headers });
    let buffer = await response.arrayBuffer();

    console.log(`[Proxy] Status: ${response.status} | Length: ${buffer.byteLength} | URL: ${targetUrl.substring(0, 60)}...`);

    const isKey = targetUrl.includes('.key');
    let isM3u8 = false;
    
    if (!isKey && buffer.byteLength > 7) {
        const header = Buffer.from(buffer.slice(0, 7)).toString('utf-8');
        if (header === '#EXTM3U') {
            isM3u8 = true;
        }
    }

    if (isM3u8) {
      let text = Buffer.from(buffer).toString("utf-8");
      const baseUrl = new URL(targetUrl);
      const lines = text.split('\n');
      
      // Use a relative path so it perfectly matches whatever domain/port the browser is on
      const proxyBase = `/proxy?url=`; 

      for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        if (line && !line.startsWith('#')) {
          // Wrap Video Chunks & force Referer inheritance
          let absoluteUrl = line.startsWith('http') ? line : new URL(line, baseUrl).href;
          lines[i] = proxyBase + encodeURIComponent(absoluteUrl) + "&referer=" + encodeURIComponent(refererHeader);
          
        } else if (line.includes('URI="')) {
          // Wrap AES Keys (handle absolute URLs properly) & force Referer inheritance
          const match = line.match(/URI="([^"]+)"/);
          if (match) {
            let uri = match[1];
            if (!uri.startsWith('data:')) {
              let absoluteUri = uri.startsWith('http') ? uri : new URL(uri, baseUrl).href;
              let wrappedUri = proxyBase + encodeURIComponent(absoluteUri) + "&referer=" + encodeURIComponent(refererHeader);
              lines[i] = line.replace(`URI="${match[1]}"`, `URI="${wrappedUri}"`);
            }
          }
        }
      }
      text = lines.join('\n');
      buffer = Buffer.from(text, "utf-8");
    }

    res.status(response.status);

    // Forward crucial CDN response headers (like Accept-Ranges) back to the React player
    const headersToKeep = ["content-type", "accept-ranges", "content-range"];
    response.headers.forEach((val, key) => {
      const lowerKey = key.toLowerCase();
      if (headersToKeep.includes(lowerKey)) {
        res.setHeader(key, val);
      }
    });

    // Override the fake image extensions
    if (isM3u8) {
        res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    } else if (isKey) {
        res.setHeader("Content-Type", "application/octet-stream");
    } else if (targetUrl.includes('.jpg') || targetUrl.includes('.png') || targetUrl.includes('.ts')) {
        res.setHeader("Content-Type", "video/mp2t");
    }

    res.setHeader("Content-Length", buffer.byteLength);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range,Authorization");

    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    res.send(Buffer.from(buffer));
  } catch (err) {
    console.error("Proxy error:", err.message);
    res.status(500).send("Proxy error");
  }
});

// ──────────────────────────────────────────────
// SPA fallback — serve React app for all other routes
// ──────────────────────────────────────────────

app.use((req, res) => {
  res.sendFile(path.join(__dirname, "client", "dist", "index.html"));
});

// Start server only when run directly (not imported for testing)
if (require.main === module) {
  const readline = require("readline");
  const net = require("net");

  const checkPort = (port) => {
    return new Promise((resolve) => {
      const server = net.createServer();
      server.once("error", (err) => {
        if (err.code === "EADDRINUSE") {
          resolve(false);
        } else {
          resolve(false);
        }
      });
      server.once("listening", () => {
        server.close();
        resolve(true);
      });
      server.listen(port, "127.0.0.1");
    });
  };

  const defaultPort = parseInt(process.env.PORT, 10) || 3000;

  if (process.env.NO_PROMPT === "true" || process.env.NODE_ENV === "production" || !process.stdin.isTTY) {
    app.listen(defaultPort, "0.0.0.0", () => {
      console.log(`\n✅ Server successfully started on port ${defaultPort} (Non-interactive mode)`);
    });
    return;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log("==========================================");
  console.log(" Welcome to LocalLink Server! ");
  console.log("==========================================");
  console.log("Please specify the port to run the server on.");
  console.log("Valid ports are generally between 1024 and 65535.");
  console.log("------------------------------------------\n");

  const promptForPort = () => {
    rl.question("Enter port [Default: 3000]: ", async (answer) => {
      const input = answer.trim();
      const port = input === "" ? 3000 : parseInt(input, 10);

      if (isNaN(port) || port < 1024 || port > 65535) {
        console.log("❌ Invalid port. Please enter a valid number (1024 - 65535).\n");
        return promptForPort();
      }

      console.log(`Checking if port ${port} is available...`);
      const isFree = await checkPort(port);
      
      if (!isFree) {
        console.log(`❌ Port ${port} is currently in use! Please choose another port.\n`);
        return promptForPort();
      }

      app.listen(port, () => {
        console.log("\n✅ Server successfully started!");
        console.log("==========================================");
        console.log("To access the platform, open your browser to:");
        console.log(`➔  http://localhost:${port}`);
        console.log("==========================================");
      });
      rl.close();
    });
  };

  promptForPort();
}

module.exports = app;
