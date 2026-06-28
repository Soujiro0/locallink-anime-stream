# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-06-28

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

## [1.0.0] - 2026-06-27

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
