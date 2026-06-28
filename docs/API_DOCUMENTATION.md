Version: 1.1.0

# API Documentation

The LocalLink platform features a native Node.js Express backend that proxies requests to Anilist's GraphQL API and Miruro's secure pipe endpoints.

## Base URL
All API requests are relative to `/api` (e.g., `http://localhost:3000/api`).

---

## Endpoints

### 1. Discovery & Search

#### `GET /api/cache-stats`
Get memory cache performance statistics (hits, misses, keys).
- **Response**: `{ hits: number, misses: number, keys: number, ksize: number, vsize: number }`

#### `GET /api/search`
Search for anime by title.
- **Parameters**: `query` (string, required)
- **Response**: `{ results: [...], page: 1 }`

#### `GET /api/suggestions`
Get search autocomplete suggestions.
- **Parameters**: `query` (string, required)
- **Response**: `{ suggestions: [...] }`

#### `GET /api/filter`
Advanced filtering and sorting.
- **Parameters**: `genre`, `sort`, `page`
- **Response**: `{ results: [...], hasNextPage: boolean }`

---

### 2. Collections

These endpoints return paginated lists of anime for specific categories.

- `GET /api/trending`
- `GET /api/popular`
- `GET /api/upcoming`
- `GET /api/recent`
- `GET /api/spotlight`
- `GET /api/schedule`
- `GET /api/schedule/week`

**Response**: `{ results: [...], page: 1 }`

---

### 3. Anime Details

#### `GET /api/info/:anilist_id`
Get full metadata for a specific anime.

#### `GET /api/anime/:anilist_id/characters`
Get character data.

#### `GET /api/anime/:anilist_id/relations`
Get related media (prequels, sequels).

#### `GET /api/anime/:anilist_id/recommendations`
Get similar anime recommendations.

---

### 4. Streaming (Pipe API)

#### `GET /api/episodes/:anilist_id`
Retrieve available streaming providers and episode lists for an anime.
- **Response**: `{ providers: { kiwi: { episodes: { sub: [...] } } } }`

#### `GET /api/watch/:provider/:anilist_id/:category/:slug`
Get the stream manifest (m3u8) for a specific episode.
- **Parameters**:
  - `provider`: e.g., `kiwi`
  - `anilist_id`: e.g., `178005`
  - `category`: `sub` or `dub`
  - `slug`: e.g., `ep-1`
- **Response**: `{ streams: [{ url: "...", type: "hls" }] }`

#### `GET /api/skips/:mal_id/:episode`
Get opening and ending intro skip intervals from AniSkip API.
- **Response**: `{ found: boolean, results: [{ interval: { startTime: number, endTime: number }, skipType: "op" | "ed" }] }`

#### `GET /api/sources`
Retrieve direct video source manifests using encrypted episode identifiers.

---

### 5. Media Proxy

#### `GET /proxy`
Reverse proxy endpoint for streaming video chunks and HLS m3u8 playlists, injecting required referer headers to bypass CDN hotlinking restrictions.
- **Parameters**: `url` (string, required), `referer` (string, optional)
