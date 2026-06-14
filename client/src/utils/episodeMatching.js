/**
 * Safely finds the index of the current episode based on the watchId from the URL.
 * It strictly matches the episode ID at the end of the watchId to prevent substring
 * bugs (e.g. "episode-10" incorrectly matching "episode-1").
 * 
 * @param {Array} episodes - The array of episode objects.
 * @param {string} watchId - The ID from the URL (e.g. "provider/id/sub/episode-10").
 * @returns {number} The index of the episode, or -1 if not found.
 */
export function findCurrentEpisodeIndex(episodes, watchId) {
    if (!episodes || !watchId) return -1;

    // The actual episode slug is usually the last part of the URL path
    const slugParts = watchId.split("/");
    const slug = slugParts[slugParts.length - 1];

    return episodes.findIndex((ep) => {
        if (!ep || !ep.id) return false;

        // Exact match
        if (ep.id === watchId) return true;

        // If ep.id is just the slug, match it against the extracted slug
        if (ep.id === slug) return true;

        // Match if watchId ends with "/{ep.id}"
        if (watchId.endsWith(`/${ep.id}`)) return true;

        return false;
    });
}
