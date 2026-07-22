const express = require("express");
const router = express.Router();
const { version } = require("../../package.json");

const discoveryController = require("../controllers/discoveryController");
const collectionController = require("../controllers/collectionController");
const animeController = require("../controllers/animeController");
const streamController = require("../controllers/streamController");

// System Routes
router.get("/version", (req, res) => res.json({ version }));

// Discovery & Search Routes
router.get("/cache-stats", discoveryController.getCacheStats);
router.get("/search", discoveryController.search);
router.get("/suggestions", discoveryController.suggestions);
router.get("/filter", discoveryController.filter);
router.get("/spotlight", discoveryController.spotlight);

// Collection Routes
router.get("/trending", collectionController.trending);
router.get("/popular", collectionController.popular);
router.get("/upcoming", collectionController.upcoming);
router.get("/recent", collectionController.recent);
router.get("/schedule", collectionController.schedule);
router.get("/schedule/week", collectionController.scheduleWeek);

// Anime Details Routes
router.get("/info/:anilist_id", animeController.info);
router.get("/anime/:anilist_id/characters", animeController.characters);
router.get("/anime/:anilist_id/relations", animeController.relations);
router.get("/anime/:anilist_id/recommendations", animeController.recommendations);

// Streaming Routes
router.get("/episodes/:anilist_id", streamController.episodes);
router.get("/skips/:mal_id/:episode", streamController.skips);
router.get("/sources", streamController.sources);
router.get("/watch/:provider/:anilist_id/:category/:slug", streamController.watch);
router.get("/stream/authorize", streamController.authorize);
router.post("/stream/authorize", streamController.authorize);

module.exports = router;
