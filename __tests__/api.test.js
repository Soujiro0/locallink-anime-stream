import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import zlib from "zlib";

// Mock global fetch before importing app
const mockFetch = vi.fn();
global.fetch = mockFetch;

const app = (await import("../index.js")).default;

const mockAnilistPage = {
  data: {
    Page: {
      pageInfo: { currentPage: 1, hasNextPage: false, perPage: 20 },
      media: [{ id: 1, title: { english: "Naruto" } }]
    }
  }
};

const mockAnilistMedia = {
  data: {
    Media: {
      id: 1,
      title: { english: "Test Anime" },
      characters: { edges: [{ node: { name: { full: "Test Character" } }, role: "MAIN" }] },
      relations: { edges: [{ node: { id: 2 }, relationType: "SEQUEL" }] },
      recommendations: { edges: [{ node: { mediaRecommendation: { id: 3 } } }] }
    }
  }
};

const mockPipeDecodedData = {
  providers: { kiwi: { episodes: { sub: [{ id: "ep", number: 1 }] } } },
  streams: [{ url: "test.m3u8", type: "hls" }]
};
const compressed = zlib.gzipSync(JSON.stringify(mockPipeDecodedData));
const mockPipeResponse = {
  data: compressed.toString("base64").replace(/\+/g, "-").replace(/\//g, "_")
};

function setupMockResponses(fail = false) {
  mockFetch.mockImplementation(async (url, options) => {
    if (fail) {
      return { ok: false, status: 500, text: async () => "Internal Server Error" };
    }

    if (url.includes("graphql.anilist.co")) {
      const body = JSON.parse(options.body);
      const query = body.query || "";
      if (
        query.includes("characters") || 
        query.includes("relations") || 
        query.includes("recommendations") || 
        query.includes("Media(")
      ) {
        return { ok: true, status: 200, json: async () => mockAnilistMedia };
      }
      return { ok: true, status: 200, json: async () => mockAnilistPage };
    } else if (url.includes("miruro.tv/api/secure/pipe")) {
      return { 
        ok: true, 
        status: 200, 
        text: async () => mockPipeResponse.data 
      };
    }

    return { ok: false, status: 404, text: async () => "Not Found" };
  });
}

beforeEach(() => {
  mockFetch.mockReset();
  setupMockResponses();
});

describe("Search & Discovery Routes", () => {
  it("GET /api/search should execute search query", async () => {
    const res = await request(app).get("/api/search?query=naruto");
    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("graphql.anilist.co"),
      expect.any(Object)
    );
  });

  it("GET /api/suggestions should return suggestions", async () => {
    const res = await request(app).get("/api/suggestions?query=test");
    expect(res.status).toBe(200);
    expect(res.body.suggestions).toBeDefined();
  });

  it("GET /api/filter should execute filter query", async () => {
    const res = await request(app).get("/api/filter?genre=Action&sort=TRENDING_DESC&page=1");
    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("graphql.anilist.co"),
      expect.any(Object)
    );
  });
});

describe("Collection Routes", () => {
  const collections = ["trending", "popular", "upcoming", "recent", "spotlight", "schedule"];

  collections.forEach((collection) => {
    it(`GET /api/${collection} should return data`, async () => {
      const res = await request(app).get(`/api/${collection}`);
      expect(res.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("graphql.anilist.co"),
        expect.any(Object)
      );
    });
  });
});

describe("Anime Detail Routes", () => {
  it("GET /api/info/:id should return anime info", async () => {
    const res = await request(app).get("/api/info/12345");
    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("graphql.anilist.co"),
      expect.any(Object)
    );
  });

  it("GET /api/anime/:id/characters should return characters", async () => {
    const res = await request(app).get("/api/anime/12345/characters");
    expect(res.status).toBe(200);
  });

  it("GET /api/anime/:id/relations should return relations", async () => {
    const res = await request(app).get("/api/anime/12345/relations");
    expect(res.status).toBe(200);
  });

  it("GET /api/anime/:id/recommendations should return recommendations", async () => {
    const res = await request(app).get("/api/anime/12345/recommendations");
    expect(res.status).toBe(200);
  });
});

describe("Streaming Routes", () => {
  it("GET /api/episodes/:id should return episode data", async () => {
    const res = await request(app).get("/api/episodes/178005");
    expect(res.status).toBe(200);
    expect(res.body.providers).toBeDefined();
  });

  it("GET /api/watch/* should return stream data", async () => {
    const res = await request(app).get("/api/watch/kiwi/178005/sub/ep-1");
    expect(res.status).toBe(200);
    expect(res.body.streams).toBeDefined();
  });
});

describe("Error Handling", () => {
  it("should return 500 when API fails", async () => {
    setupMockResponses(true);

    const res = await request(app).get("/api/trending?page=9999");
    expect(res.status).toBe(500);
    expect(res.body.detail).toBeDefined();
  });
});
