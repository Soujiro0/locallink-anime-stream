import { useState, useEffect, useCallback } from "react";
import { useParams, useLocation, Link, useNavigate } from "react-router-dom";
import { getStreams, getEpisodes } from "../services/api";
import VideoPlayer from "../components/player/VideoPlayer";
import EpisodeList from "../components/anime/EpisodeList";
import { useWatchHistory } from "../hooks/useWatchHistory";
import { getTitle, getCoverImage } from "../utils/helpers";
import { findCurrentEpisodeIndex } from "../utils/episodeMatching";

export default function WatchPage() {
  const params = useParams();
  const location = useLocation();
  const watchId = params["*"] || ""; // splat route
  const [streamData, setStreamData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [allEpisodes, setAllEpisodes] = useState([]);
  const [currentEpIndex, setCurrentEpIndex] = useState(-1);
  const [currentProviderName, setCurrentProviderName] = useState(null);
  const [currentAudioType, setCurrentAudioType] = useState(null);
  const { updateProgress, getProgress } = useWatchHistory();
  const navigate = useNavigate();
  const [providersData, setProvidersData] = useState(null);

  // Info from navigation state
  const animeState = location.state || {};
  const animeTitle = animeState.anime ? getTitle(animeState.anime) : "";
  const episodeNumber = animeState.episodeNumber || "";
  const episodeTitle = animeState.episodeTitle || "";
  const animeCover = animeState.anime ? getCoverImage(animeState.anime) : "";
  const animeId = animeState.anime?.id;

  useEffect(() => {
    if (!watchId) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    getStreams(watchId)
      .then((data) => {
        if (!cancelled) {
          setStreamData(data);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [watchId]);

  // Load all episodes for next/prev navigation
  useEffect(() => {
    if (!animeId) return;

    getEpisodes(animeId)
      .then((data) => {
        if (data.providers) {
          setProvidersData(data.providers);
          // Find the provider/audio that matches our watchId
          for (const [provName, provData] of Object.entries(data.providers)) {
            for (const [audioType, eps] of Object.entries(provData.episodes || {})) {
              // Sort numerically to prevent bugs like 44 -> 6
              const sortedEps = [...eps].sort((a, b) => a.number - b.number);
              const idx = findCurrentEpisodeIndex(sortedEps, watchId);
              if (idx !== -1) {
                setAllEpisodes(sortedEps);
                setCurrentEpIndex(idx);
                setCurrentProviderName(provName);
                setCurrentAudioType(audioType);
                return;
              }
            }
          }
        }
      })
      .catch(() => {});
  }, [animeId, watchId]);

  const handleTimeUpdate = useCallback(
    ({ currentTime, duration }) => {
      if (animeId && watchId && duration > 0) {
        // Throttle to every 5 seconds
        if (Math.round(currentTime) % 5 === 0) {
          updateProgress({
            animeId,
            episodeId: watchId,
            episodeNumber,
            progress: currentTime,
            duration,
            animeTitle,
            coverImage: animeCover,
          });
        }
      }
    },
    [animeId, watchId, episodeNumber, animeTitle, animeCover, updateProgress]
  );

  const navigateEpisode = useCallback((ep) => {
    navigate(`/watch/${ep.id}`, {
      state: {
        anime: animeState.anime,
        episodeNumber: ep.number,
        episodeTitle: ep.title,
      }
    });
  }, [navigate, animeState.anime]);

  const hasPrev = currentEpIndex > 0;
  const hasNext = currentEpIndex >= 0 && currentEpIndex < allEpisodes.length - 1;

  const handlePrevEpisode = useCallback(() => {
    if (hasPrev) navigateEpisode(allEpisodes[currentEpIndex - 1]);
  }, [hasPrev, navigateEpisode, allEpisodes, currentEpIndex]);

  const handleNextEpisode = useCallback(() => {
    if (hasNext) navigateEpisode(allEpisodes[currentEpIndex + 1]);
  }, [hasNext, navigateEpisode, allEpisodes, currentEpIndex]);

  const displayTitle = episodeTitle
    ? `Episode ${episodeNumber}: ${episodeTitle}`
    : episodeNumber
    ? `Episode ${episodeNumber}`
    : "Playing...";

  const initialTime = getProgress(watchId);

  return (
    <div id="watch-page" className="pt-20 px-4 lg:px-16 pb-16 min-h-screen max-w-7xl mx-auto">
      {/* Back to anime */}
      {animeId && (
        <Link
          to={`/anime/${animeId}`}
          className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors mb-6"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to {animeTitle || "Details"}
        </Link>
      )}

      {/* Title */}
      <div className="mb-6">
        {animeTitle && (
          <h2 className="text-sm text-text-muted font-medium">{animeTitle}</h2>
        )}
        <h1 className="text-xl lg:text-2xl font-bold text-text-primary">
          {loading ? "Loading..." : displayTitle}
        </h1>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-netflix-red/10 border border-netflix-red/30 text-netflix-red rounded-lg p-4 mb-6">
          <p className="font-medium">Failed to load stream</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      )}

      {/* Player */}
      {(!error && streamData) || loading ? (
        <div className="flex flex-col gap-4">
          <VideoPlayer
            streams={streamData?.streams || []}
            subtitles={streamData?.subtitles || []}
            intro={streamData?.intro}
            outro={streamData?.outro}
            onTimeUpdate={handleTimeUpdate}
            initialTime={initialTime}
            hasPrev={hasPrev}
            hasNext={hasNext}
            onPrevEpisode={handlePrevEpisode}
            onNextEpisode={handleNextEpisode}
            title={displayTitle}
            isLoading={loading}
          />

          {/* External Next/Prev Buttons */}
          <div className="flex items-center justify-between mt-2">
            <div>
              {hasPrev && (
                <div className="relative group/extbtn">
                  {/* Tooltip */}
                  {allEpisodes[currentEpIndex - 1]?.image && (
                    <div className="absolute bottom-full left-0 mb-2 opacity-0 group-hover/extbtn:opacity-100 transition-opacity pointer-events-none z-10 w-40 bg-surface-base border border-surface-border rounded-lg overflow-hidden shadow-xl shadow-black/50">
                      <img 
                        src={allEpisodes[currentEpIndex - 1].image} 
                        alt="Previous Episode" 
                        className="w-full h-24 object-cover" 
                      />
                      <div className="p-2 text-xs font-medium text-text-primary truncate">
                        Ep {allEpisodes[currentEpIndex - 1].number}
                      </div>
                    </div>
                  )}
                  <button
                    onClick={handlePrevEpisode}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-surface-base border border-surface-border text-text-primary text-sm font-medium hover:bg-surface-raised hover:border-text-muted transition-all"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    Previous Episode
                  </button>
                </div>
              )}
            </div>

            <div>
              {hasNext && (
                <div className="relative group/extbtn">
                  {/* Tooltip */}
                  {allEpisodes[currentEpIndex + 1]?.image && (
                    <div className="absolute bottom-full right-0 mb-2 opacity-0 group-hover/extbtn:opacity-100 transition-opacity pointer-events-none z-10 w-40 bg-surface-base border border-surface-border rounded-lg overflow-hidden shadow-xl shadow-black/50">
                      <img 
                        src={allEpisodes[currentEpIndex + 1].image} 
                        alt="Next Episode" 
                        className="w-full h-24 object-cover" 
                      />
                      <div className="p-2 text-xs font-medium text-text-primary truncate">
                        Ep {allEpisodes[currentEpIndex + 1].number}
                      </div>
                    </div>
                  )}
                  <button
                    onClick={handleNextEpisode}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-surface-base border border-surface-border text-text-primary text-sm font-medium hover:bg-surface-raised hover:border-text-muted transition-all"
                  >
                    Next Episode
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* Troubleshooting note */}
      <p className="text-center text-text-muted text-xs mt-6 mb-12">
        If the video is blank or loading infinitely, try selecting a different provider from the{" "}
        {animeId ? (
          <Link to={`/anime/${animeId}`} className="text-netflix-red hover:underline">
            anime detail page
          </Link>
        ) : (
          "anime detail page"
        )}
        .
      </p>

      {/* Episodes List */}
      {providersData && !loading && (
        <div className="mt-8 border-t border-surface-border pt-8">
          <EpisodeList
            providers={providersData}
            onPlayEpisode={navigateEpisode}
            currentEpisodeId={watchId}
            initialProvider={currentProviderName}
            initialAudioType={currentAudioType}
          />
        </div>
      )}
    </div>
  );
}
