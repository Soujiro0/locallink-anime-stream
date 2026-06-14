import { API_BASE } from "../utils/constants";

async function fetchJSON(endpoint) {
  const res = await fetch(`${API_BASE}${endpoint}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }
  return res.json();
}

// Search & Discovery
export const searchAnime = (query, page = 1, filters = {}) => {
  const params = new URLSearchParams({ query, page });
  if (filters.genre) params.set("genre", filters.genre);
  if (filters.format) params.set("format", filters.format);
  if (filters.status) params.set("status", filters.status);
  if (filters.sort) params.set("sort", filters.sort);
  return fetchJSON(`/search?${params.toString()}`);
};

export const getSuggestions = (query) =>
  fetchJSON(`/suggestions?query=${encodeURIComponent(query)}`);

export const filterAnime = (params = {}) => {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) searchParams.set(key, value);
  });
  return fetchJSON(`/filter?${searchParams.toString()}`);
};

// Collections
export const getTrending = (page = 1, perPage = 20) =>
  fetchJSON(`/trending?page=${page}&per_page=${perPage}`);

export const getPopular = (page = 1, perPage = 20) =>
  fetchJSON(`/popular?page=${page}&per_page=${perPage}`);

export const getUpcoming = (page = 1, perPage = 20) =>
  fetchJSON(`/upcoming?page=${page}&per_page=${perPage}`);

export const getRecent = (page = 1, perPage = 20) =>
  fetchJSON(`/recent?page=${page}&per_page=${perPage}`);

export const getSpotlight = (page = 1, perPage = 10) =>
  fetchJSON(`/spotlight?page=${page}&per_page=${perPage}`);

export const getSchedule = () => fetchJSON(`/schedule`);

export const getWeeklySchedule = () => fetchJSON(`/schedule/week`);

// Anime Details
export const getAnimeInfo = (id) => fetchJSON(`/info/${id}`);

export const getCharacters = (id) => fetchJSON(`/anime/${id}/characters`);

export const getRelations = (id) => fetchJSON(`/anime/${id}/relations`);

export const getRecommendations = (id) => fetchJSON(`/anime/${id}/recommendations`);

// Streaming
export const getEpisodes = (anilistId) => fetchJSON(`/episodes/${anilistId}`);

export const getStreams = (watchId) => fetchJSON(`/${watchId}`);
