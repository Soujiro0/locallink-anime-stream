# LocalLink Anime Stream - Session Memory & History Summary

## Session Overview
In this session, we upgraded the **LocalLink Anime Stream** web application and backend from version `1.0.0` to `1.1.0`. Work focused on UI/UX redesigns, video player feature expansion, Windows executable resource manipulation, Docker build improvements, and codebase decluttering.

---

## Key Achievements & Modifications

### 1. Frontend UI/UX Architecture
- **Interactive Swiper Carousels**: Created [SwiperCarousel.jsx](file:///d:/Projects/locallink-anime-stream/client/src/components/home/SwiperCarousel.jsx) to replace static overflow scrolling containers across the Home Page and Watch Page ("Related Anime" and "You Might Also Like"). Enabled navigation arrows across all mobile and desktop viewport sizes.
- **Compact Card & Layout Sizing**: Refined desktop card widths (`w-32 sm:w-36 lg:w-40`) for a tighter, premium feel. Re-styled Schedule Page calendar entries into classic landscape cards along a timeline layout.
- **Visual Branding**: Swapped plain text branding for logo displays in [Navbar.jsx](file:///d:/Projects/locallink-anime-stream/client/src/components/layout/Navbar.jsx) and [Footer.jsx](file:///d:/Projects/locallink-anime-stream/client/src/components/layout/Footer.jsx).
- **Top Rankings Sidebar**: Created [TopRankingsAside.jsx](file:///d:/Projects/locallink-anime-stream/client/src/components/home/TopRankingsAside.jsx) and embedded it into the Watch Page recommendations section. Removed NSFW content filtering from rankings per user specification.

### 2. Video Player & YouTube-Style Theater Mode
- **Split Watch Page Layout**: Built a 4-column desktop grid where the video player occupies 3 columns and a dedicated anime details card (`lg:col-span-1`) sits to the right showing cover art, rating scores, genres, and synopsis.
- **Theater Mode Toggle**: Added a rectangle icon button (`RectangleHorizontal`) inside [PlayerControls.jsx](file:///d:/Projects/locallink-anime-stream/client/src/components/player/PlayerControls.jsx). Activating Theater Mode expands the video container across the entire width of the page (`w-full`) while shifting the right-side anime details box below the video into a horizontal responsive layout.
- **Default Provider & Subtitles**: Configured **KIWI** as the permanent default streaming provider. Added UX notification messaging for embedded subtitle streams when font files are absent. Reverted custom backend filtering for API bug anomalies per decision to preserve upstream data integrity.

### 3. Executable Packaging & Tooling (`resedit`)
- **Icon Stamping Fix**: Replaced `rcedit` with `resedit` in [set-icon.js](file:///d:/Projects/locallink-anime-stream/set-icon.js). Configured icon parsing to filter out oversized uncompressed bitmap frames (`width !== 0`) and generated resources with `{ noGrow: true }`. This stamped the Windows executable (`locallink-win.exe`) successfully without corrupting `pkg` virtual filesystem payloads.

### 4. Audit, Docker & Versioning (`v1.1.0`)
- **Ponytail Audit Cleanup**: Executed `/ponytail-audit` and cut ~162 lines of dead code and unused dependencies (removed `rcedit`, deprecated `AnimeCarousel.jsx`, unused `Modal.jsx`, and dead `SkeletonRow` exports).
- **Docker Image Tagging**: Updated [docker-compose.yml](file:///d:/Projects/locallink-anime-stream/docker-compose.yml) to tag the built app container with `:latest` (`image: locallink-anime-stream-app:latest`).
- **Release Versioning**: Bumped version numbers to `1.1.0` in root `package.json`, `client/package.json`, and documented all changes in [CHANGELOG.md](file:///d:/Projects/locallink-anime-stream/CHANGELOG.md).

### 5. Docker & Runtime Memory/CPU Optimization
- **Streaming Pipeline Proxy**: Refactored [proxyController.js](file:///d:/Projects/locallink-anime-stream/src/controllers/proxyController.js) from buffering full video segments into RAM (`await response.arrayBuffer()`) to streaming directly via Web Streams & Node `pipeline`. Added abort signal hooks so client disconnection stops upstream network fetches instantly.
- **NodeCache Zero-Cloning & Capping**: Configured [cache.js](file:///d:/Projects/locallink-anime-stream/src/config/cache.js) with `useClones: false` and `maxKeys: 500` to eliminate V8 serialization CPU cycles and prevent heap growth. Updated [streamController.js](file:///d:/Projects/locallink-anime-stream/src/controllers/streamController.js) to preserve `ep.rawId` for idempotent slug injections.
- **V8 Engine Tuning**: Configured `NODE_OPTIONS=--max-old-space-size=128` and command `--optimize-for-size` in [docker-compose.yml](file:///d:/Projects/locallink-anime-stream/docker-compose.yml) and [Dockerfile](file:///d:/Projects/locallink-anime-stream/docker/Dockerfile), and optimized Nginx Alpine buffer allocation sizes and static file browser caching in [nginx.conf](file:///d:/Projects/locallink-anime-stream/docker/nginx.conf).

### 6. Authoritative Security Architecture & Edge Stream Protection (`v1.2.2`)
- **Consolidated Architecture & Defense Summary (Formerly `REPORT.md` & `CLOUDFLARE_TOKEN_WHITELIST.md`)**:
  - **Header Validation & CORS Enforcement**: CDNs distributing media chunks (`pru.ultracloud.cc`, `nekostream.site`, `fast4speed.rsvp`) enforce strict `Referer`, `Origin`, and `Sec-Fetch-*` validation. Our reverse proxy (`src/controllers/proxyController.js`) intercepts HLS `#EXTM3U` manifests, rewrites chunk URIs to route through `/proxy`, and injects exact upstream headers while returning `Access-Control-Allow-Origin: *` to the React client.
  - **Native Cryptographic Token Signing & IP-Binding**: Created [tokenSigner.js](file:///d:/Projects/locallink-anime-stream/src/utils/tokenSigner.js) implementing HMAC-SHA256 signatures (`Token = HMAC(StreamID || ClientIP || Expiry, SecretKey)`) bound to the client's exact remote IP address (`X-Forwarded-For` / `req.ip`). Issued HTTP-only session cookies (`Set-Cookie: __Secure-LocalLink-Auth`) via `/api/stream/authorize` and attached native stream signatures to verify direct-to-edge playback entitlements.
  - **CycleTLS Integration & TLS Fingerprinting Parity**: Integrated `cycletls` in [pipe.js](file:///d:/Projects/locallink-anime-stream/src/utils/pipe.js) to mimic genuine desktop browser TLS handshakes (JA3 fingerprint `771,4865-4866...`) when communicating with protected upstream APIs (`miruro.tv/api/secure/pipe`), eliminating Cloudflare WAF bot challenges.
  - **Server-Side Expired Token & Dead Stream Filtering**: Updated [streamController.js](file:///d:/Projects/locallink-anime-stream/src/controllers/streamController.js) to inspect timestamp signatures inside upstream `fast4speed.rsvp` / `Authorization=` stream URLs. Links with expired UTC timestamps or direct mp4upload links returning `403 Forbidden` are filtered out before reaching the client.

### 7. Video Player Resilience & Episode Switcher Fix (`v1.2.2`)
- **Automatic Embed Stream Fallback**: Upgraded [VideoPlayer.jsx](file:///d:/Projects/locallink-anime-stream/client/src/components/player/VideoPlayer.jsx) to automatically fall back to iframe embed streams (`Ok`, `Fm-Hls`, `Mp4 (embed)`) whenever native HLS or direct MP4 streams encounter fatal network or media errors or are unavailable.
- **Always-Mounted Video Element Fix**: Resolved an issue where selecting another episode while watching an embed stream failed because unmounting `<video>` caused `useEffect` to exit early (`if (!video) return;`). Kept `<video ref={videoRef}>` mounted at all times (hidden via CSS when activeEmbed is set) and placed `setActiveEmbed(null)` at the start of stream processing so switching episodes works immediately.
- **Removed Root Documentation Artifacts**: Consolidated and removed `REPORT.md` and `CLOUDFLARE_TOKEN_WHITELIST.md` into this living document per user specification.

