import { describe, it, expect } from "vitest";
import { findCurrentEpisodeIndex } from "./episodeMatching";

describe("findCurrentEpisodeIndex", () => {
    it("should correctly find the episode index by exact match", () => {
        const episodes = [
            { id: "gogoanime/123/sub/episode-1" },
            { id: "gogoanime/123/sub/episode-2" },
            { id: "gogoanime/123/sub/episode-10" }
        ];
        
        const idx = findCurrentEpisodeIndex(episodes, "gogoanime/123/sub/episode-10");
        expect(idx).toBe(2);
    });

    it("should NOT match episode-1 when watchId is episode-10", () => {
        const episodes = [
            { id: "episode-1" },
            { id: "episode-2" },
            { id: "episode-10" }
        ];
        
        // This simulates the bug where "episode-10".includes("episode-1") was true
        const idx = findCurrentEpisodeIndex(episodes, "gogoanime/123/sub/episode-10");
        
        // It should match the actual episode-10 slug, which is index 2
        expect(idx).toBe(2);
    });

    it("should match when watchId ends with the episode id", () => {
        const episodes = [
            { id: "naruto-episode-1" },
            { id: "naruto-episode-2" }
        ];

        const idx = findCurrentEpisodeIndex(episodes, "provider1/naruto/dub/naruto-episode-2");
        expect(idx).toBe(1);
    });

    it("should return -1 if episode is not found", () => {
        const episodes = [
            { id: "episode-1" },
            { id: "episode-2" }
        ];

        const idx = findCurrentEpisodeIndex(episodes, "provider1/naruto/dub/episode-3");
        expect(idx).toBe(-1);
    });
});
