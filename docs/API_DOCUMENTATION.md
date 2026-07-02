Version: 1.2.2

# API Documentation

The LocalLink platform features a native Node.js Express backend that proxies requests to Anilist's GraphQL API, Miruro's secure pipe endpoints, and issues authoritative IP-bound HMAC stream tokens.

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
Reverse proxy endpoint for streaming video chunks and HLS m3u8 playlists, injecting required referer headers and modern Chrome client hints (`Sec-Ch-Ua`, `Sec-Fetch-*`) to bypass CDN CORS/hotlinking restrictions.
- **Parameters**: `url` (string, required), `referer` (string, optional)

#### `POST /proxy/report-blocked`
Self-learning CDN feedback loop endpoint. Client HLS players report 403 Forbidden domains here so the backend dynamically records the hostname in `serverCache` to proxy future segment chunks automatically.
- **Body**: `{ hostname: string }`

#### `GET /POST /api/stream/authorize`
Issues authoritative IP-bound HMAC-SHA256 streaming tokens and sets domain-scoped HTTP-only session cookies (`__Secure-LocalLink-Auth`) bound to the client's public IP address.
- **Parameters**: `streamId` or `url` (string, required)
- **Response**: `{ success: true, authorizedStreamId: string, clientIp: string, expiresAt: number, sig: string }`

