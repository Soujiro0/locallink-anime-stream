# Changelog

All notable changes to this project will be documented in this file.

## [1.2.4] (2026-07-22)

### Fixed
- **Cloudflare 403 in PKG Builds**: Safely extracted the `cycletls` native binary into the host OS temporary directory (`%TEMP%`) during `pkg` runtime, enabling native TLS fingerprinting to bypass Cloudflare WAF without requiring manual `.env` `cf_clearance` cookies in desktop builds.
- **Docker KIWI Playback Fixes**: 
  - Added `app.set("trust proxy", 1)` to Express so `X-Forwarded-For` IPs are parsed correctly behind Nginx, fixing IP mismatch in HMAC token verification.
  - Standardized IPv4-mapped IPv6 extraction (`::ffff:x.x.x.x` → `x.x.x.x`) across `tokenSigner.js` to ensure consistent HMAC signatures.
  - Added `proxy_set_header Range` and `proxy_set_header If-Range` in `nginx.conf` to fix HLS byte-range skipping on KIWI provider streams.

## [1.2.3] (2026-07-02)

### Fixed
- **Docker Container Playback & CycleTLS Permissions**: Added `chmod +x` inside `docker/Dockerfile` after npm installation so Linux `cycletls` binary runs properly inside Docker container (`EACCES` fix).
- **CycleTLS Binary Response Handling**: Specified `responseType: "arraybuffer"` in `proxyController.js` to ensure binary HLS segments, images, and AES keys aren't parsed as JSON when fetched via CycleTLS.
- **AES Key & Decoy Stripping Resilience**: Improved `isKey` detection for AES decryption keys (e.g. `/monkey`) and tightened decoy stripping checks to 5 consecutive TS sync packets to prevent false-positive corruption on AES-128 encrypted HLS video segments.
- **Nginx Reverse Proxy Headers**: Added `X-Forwarded-Proto $scheme` header inside `location ^~ /proxy` in `docker/nginx.conf`.

## [1.2.2] (2026-07-02)

### Added
- **Authoritative Stream Security & IP-Binding**: Implemented cryptographic HMAC stream token signing (`tokenSigner.js`) bound to client public IP addresses (`X-Forwarded-For` / `req.ip`). Added `/api/stream/authorize` endpoint issuing domain-scoped HTTP-only session cookies (`__Secure-LocalLink-Auth`) for zero-overhead HLS segment delivery.
- **CycleTLS Upstream Parity**: Integrated `cycletls` inside `pipe.js` to impersonate genuine desktop browser TLS JA3 fingerprints (`771,4865-4866...`) when querying protected upstream media APIs, bypassing Cloudflare WAF bot challenges.
- **Automatic Embed Stream Fallback**: Upgraded `VideoPlayer.jsx` to transition seamlessly to embedded iframe players (`Ok`, `Fm-Hls`, `Mp4 (embed)`) whenever native video streams encounter fatal network or CORS errors or are unavailable.

### Fixed
- **Episode Switcher Persistence Fix**: Fixed an issue where clicking a new episode while watching an iframe embed player failed to load the new episode. Kept the native `<video>` element always mounted in DOM and positioned `setActiveEmbed(null)` at the beginning of stream processing.
- **Expired Token & Blocked Stream Filtering**: Added backend filtering in `streamController.js` inspecting timestamp signatures inside upstream `fast4speed.rsvp` / `Authorization=` stream URLs and excluding expired links or blocked `403` direct mp4upload links.

### Changed
- **Consolidated Documentation Artifacts**: Consolidated architecture and security models from `REPORT.md` and `CLOUDFLARE_TOKEN_WHITELIST.md` into `MEMORY.md` and removed the two root files to streamline repository structure.

## [1.2.0] (2026-07-01)

### Added

- **Miruro CDN Access Infrastructure**: Replicated Miruro's high-speed CDN access pipeline using modern Chrome 136 client hints (`Sec-Ch-Ua`, `Sec-Fetch-*`) and dynamic Origin/Referer rotation across all upstream video servers (`bee`, `ally`, `kiwi`, `pewe`, `bonk`).
- **Dynamic Strict CDN Self-Learning**: Implemented runtime CDN blocking detection (`POST /proxy/report-blocked`) where client HLS players automatically report `403 Forbidden` domains to the backend, updating `serverCache` to proxy segment chunks automatically without manual whitelist updates.
- **Multi-Stream Automatic Failover**: Updated `VideoPlayer.jsx` error recovery logic to fallback seamlessly to adaptive chunk proxying or the next available HLS streaming link upon network or CORS errors.
- **Version Indicator**: Added visual version badge (`v1.2.0`) to the application footer next to the LocalLink branding logo.

### Fixed

- **Idempotent Episode ID Resolution**: Resolved a double base64url encoding bug in `streamController.js` when querying upstream Wistoria and Wands / Wistoria episode sources.
- **Anti-Caching Error Headers**: Added strict `Cache-Control: no-store` headers to all proxy error responses (`403 Forbidden`, `410 Gone`, `500 Internal Error`) to prevent web browsers from caching streaming failure states on disk.

## [1.1.0] (2026-06-28)

### Added

- **Streaming Pipeline Proxy**: Refactored the video streaming reverse proxy (`proxyController.js`) to use native Node.js pipelines and Web Streams, streaming binary chunks directly without buffering full video segments into RAM.
- **V8 Engine Tuning**: Configured `NODE_OPTIONS=--max-old-space-size=128` and passed `--optimize-for-size` directly to node command in `Dockerfile` and `docker-compose.yml` to minimize idle container memory footprint.
- **Nginx & Express Buffer Optimization**: Configured Nginx Alpine buffer sizes, enabled aggressive static asset 1-year browser caching, disabled Express `x-powered-by` headers, and added socket keep-alive timeouts (`keepAliveTimeout = 65000`).
- **Interactive Swiper Carousels**: Replaced static overflow scrolling containers across Home Page and Watch Page recommendations with responsive navigation arrow carousels.
- **Top Rankings Sidebar**: Embedded interactive rankings sidebar alongside anime details on the Watch Page.
- **YouTube-Style Theater Mode**: Added video player theater mode expansion across full viewport width.

### Changed

- **NodeCache Zero-Cloning & Capping**: Set `useClones: false` and `maxKeys: 500` in server memory caching to eliminate V8 serialization CPU cycles and prevent unbounded heap growth. Updated `streamController.js` to preserve `rawId` references for idempotent slug manipulation.
- **Audit & Dead Code Removal**: Executed repository cleanup cutting ~162 lines of dead code, unused modals, and deprecated carousel exports.

## [1.0.0] (2026-06-27)

### Added

- **Initial Release**: Launched LocalLink Anime Stream, a Netflix-inspired responsive React frontend and native Node.js proxy application.
- **YouTube-Style Theater Mode**: Added a toggleable theater mode button in the video player control bar that expands the video across the full viewport width (`w-full`) and dynamically shifts the right-side anime details box underneath into a sleek horizontal responsive card layout.
- **Interactive Carousels (`SwiperCarousel`)**: Implemented interactive Swiper carousels supporting dedicated left/right navigation arrows across all screen sizes.
- **Top Rankings Sidebar**: Integrated a responsive top rankings sidebar displaying Trending, Popular, and Recently Released anime directly alongside recommendations on the Watch Page.
- **Native HLS Stream Playback**: Added adaptive resolution switching, robust proxy-first CORS handling, subtitle track loading, keyboard media shortcuts, and next/previous episode navigation.
- **Icon Stamp Tooling (`resedit`)**: Implemented Windows executable icon stamping script (`set-icon.js`) using `resedit` to ensure clean resource injection without modifying or corrupting `pkg` virtual filesystem payloads.
- **Docker Deployment**: Added containerized multi-stage slim Docker build (`locallink-anime-stream-app:latest`) and Nginx reverse proxy configuration.

### Changed

- **UI/UX Refinements**: Compacted schedule card widths for better presentation on desktop, fixed slider navigation button state bindings, and replaced text branding with logo icons in navbar and footer.
- **Codebase Optimization**: Performed a repository audit removing ~162 lines of dead code and unused dependencies.
