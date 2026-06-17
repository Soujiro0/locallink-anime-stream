import { useState, useEffect } from "react";

export default function EpisodeList({
  providers,
  onPlayEpisode,
  currentEpisodeId,
  initialProvider,
  initialAudioType,
}) {
  const [currentProvider, setCurrentProvider] = useState(initialProvider || null);
  const [audioType, setAudioType] = useState(initialAudioType || "sub");
  const [currentPage, setCurrentPage] = useState(1);
  const EPISODES_PER_PAGE = 50;

  const ALLOWED_PROVIDERS = ["ally", "bee", "kiwi"];
  const providerNames = providers 
    ? Object.keys(providers).filter(name => ALLOWED_PROVIDERS.includes(name.toLowerCase())) 
    : [];

  // Sync with props
  useEffect(() => {
    if (initialProvider) setCurrentProvider(initialProvider);
    if (initialAudioType) setAudioType(initialAudioType);
  }, [initialProvider, initialAudioType]);

  // Auto-select first provider with episodes if none selected
  if (!currentProvider && providerNames.length > 0) {
    const defaultProv = providerNames.find(
      (name) => providers[name]?.episodes?.sub?.length > 0
    ) || providerNames[0];
    setCurrentProvider(defaultProv);
  }

  if (!providers || providerNames.length === 0) {
    return (
      <div className="text-center py-8 text-text-muted">
        No providers available.
      </div>
    );
  }

  const providerData = currentProvider ? providers[currentProvider] : null;
  const hasSub = providerData?.episodes?.sub?.length > 0;
  const hasDub = providerData?.episodes?.dub?.length > 0;
  const episodes = providerData?.episodes?.[audioType] || [];

  return (
    <div className="space-y-6">
      {/* Provider selector */}
      <div>
        <h4 className="text-sm font-semibold text-text-secondary mb-3 uppercase tracking-wider">
          Provider
        </h4>
        <div className="flex flex-wrap gap-2">
          {providerNames.map((name) => (
            <button
              key={name}
              onClick={() => {
                setCurrentProvider(name);
                setCurrentPage(1);
                // Reset audio type if not available
                const pd = providers[name];
                if (audioType === "dub" && !pd?.episodes?.dub?.length && pd?.episodes?.sub?.length) {
                  setAudioType("sub");
                } else if (audioType === "sub" && !pd?.episodes?.sub?.length && pd?.episodes?.dub?.length) {
                  setAudioType("dub");
                }
              }}
              className={`px-4 py-2 text-sm font-medium rounded-lg border transition-all ${
                currentProvider === name
                  ? "border-netflix-red bg-netflix-red/10 text-netflix-red"
                  : "border-surface-border text-text-secondary hover:border-text-muted hover:text-text-primary"
              }`}
            >
              {name.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Audio type toggle */}
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-bold text-text-primary">Episodes</h3>
        {(hasSub || hasDub) && (
          <div className="flex bg-surface-base rounded-lg overflow-hidden border border-surface-border">
            {hasSub && (
              <button
                onClick={() => { setAudioType("sub"); setCurrentPage(1); }}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  audioType === "sub"
                    ? "bg-netflix-red text-white"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                SUB
              </button>
            )}
            {hasDub && (
              <button
                onClick={() => { setAudioType("dub"); setCurrentPage(1); }}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  audioType === "dub"
                    ? "bg-netflix-red text-white"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                DUB
              </button>
            )}
          </div>
        )}
      </div>

      {/* Episode grid and pagination */}
      {episodes.length > 0 ? (
        <div className="space-y-4">
          {(() => {
            // Sort episodes to ensure they are numerically ordered
            const sortedEps = [...episodes].sort((a, b) => a.number - b.number);
            const totalPages = Math.ceil(sortedEps.length / EPISODES_PER_PAGE);
            const startIndex = (currentPage - 1) * EPISODES_PER_PAGE;
            const paginatedEps = sortedEps.slice(startIndex, startIndex + EPISODES_PER_PAGE);

            return (
              <>
                {/* Pagination Tabs */}
                {totalPages > 1 && (
                  <div className="flex flex-wrap gap-2 mb-4">
                    {Array.from({ length: totalPages }).map((_, i) => {
                      const pageNum = i + 1;
                      const startEp = i * EPISODES_PER_PAGE + 1;
                      const endEp = Math.min((i + 1) * EPISODES_PER_PAGE, sortedEps.length);
                      return (
                        <button
                          key={pageNum}
                          onClick={() => setCurrentPage(pageNum)}
                          className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                            currentPage === pageNum
                              ? "border-netflix-red bg-netflix-red text-white"
                              : "border-surface-border bg-surface-base text-text-secondary hover:border-text-muted hover:text-text-primary"
                          }`}
                        >
                          {startEp}-{endEp}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {paginatedEps.map((ep) => (
                    <button
                      key={ep.id}
                      onClick={() => onPlayEpisode(ep)}
                      className={`flex items-center gap-4 p-4 rounded-lg border text-left transition-all group ${
                        currentEpisodeId === ep.id
                          ? "border-netflix-red bg-netflix-red/10"
                          : "border-surface-border bg-surface-base hover:border-text-muted hover:bg-surface-raised"
                      }`}
                    >

                      {/* Episode thumbnail */}
                      {ep.image && (
                        <img
                          src={ep.image}
                          alt={`Episode ${ep.number}`}
                          className="w-24 h-14 rounded object-cover shrink-0"
                          loading="lazy"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <span
                          className={`text-xs font-bold block mb-1 ${
                            currentEpisodeId === ep.id
                              ? "text-netflix-red"
                              : "text-text-muted group-hover:text-netflix-red"
                          }`}
                        >
                          Episode {ep.number}
                        </span>
                        <span className="text-sm text-text-primary truncate block">
                          {ep.title || "Watch Now"}
                        </span>
                        {ep.filler && (
                          <span className="text-xs text-yellow-500 mt-1 block">FILLER</span>
                        )}
                      </div>
                      {/* Play icon */}
                      <svg
                        className={`w-5 h-5 shrink-0 transition-colors ${
                          currentEpisodeId === ep.id
                            ? "text-netflix-red"
                            : "text-text-muted group-hover:text-text-primary"
                        }`}
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </button>
                  ))}
                </div>
              </>
            );
          })()}
        </div>
      ) : (
        <div className="text-center py-8 text-text-muted">
          No {audioType.toUpperCase()} episodes available from this provider.
        </div>
      )}
    </div>
  );
}
