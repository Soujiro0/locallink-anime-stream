import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { getAnimeInfo, getEpisodes, getRelations, getRecommendations } from "../services/api";
import {
  getTitle, truncateText, getBannerImage, getCoverImage,
  formatScore, formatStatus, formatDate, formatEpisodes, capitalize,
} from "../utils/helpers";
import EpisodeList from "../components/anime/EpisodeList";
import CharacterList from "../components/anime/CharacterList";
import RelatedAnime from "../components/anime/RelatedAnime";
import Badge from "../components/ui/Badge";
import { SkeletonDetail } from "../components/ui/Skeleton";
import { useMyList } from "../hooks/useMyList";
import { Star } from "lucide-react";
import TrailerModal from "../components/ui/TrailerModal";

export default function AnimeDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [anime, setAnime] = useState(null);
  const [providers, setProviders] = useState(null);
  const [relations, setRelations] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showFullDesc, setShowFullDesc] = useState(false);
  const [showTrailer, setShowTrailer] = useState(false);
  const { isInList, toggleList } = useMyList();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setAnime(null);
    setProviders(null);

    Promise.allSettled([
      getAnimeInfo(id),
      getEpisodes(id),
      getRelations(id),
      getRecommendations(id),
    ]).then(([infoRes, epRes, relRes, recRes]) => {
      if (cancelled) return;

      if (infoRes.status === "fulfilled") setAnime(infoRes.value);
      if (epRes.status === "fulfilled") setProviders(epRes.value.providers || null);
      if (relRes.status === "fulfilled") {
        const rels = relRes.value?.relations || [];
        setRelations(rels.map(r => ({ ...r.node, relationType: r.relationType })));
      }
      if (recRes.status === "fulfilled") {
        const recs = recRes.value?.recommendations || [];
        setRecommendations(recs.map(r => r.mediaRecommendation).filter(Boolean));
      }
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [id]);

  if (loading) return <SkeletonDetail />;
  if (!anime) {
    return (
      <div className="pt-24 px-5 lg:px-24 text-center">
        <p className="text-text-muted text-lg">Anime not found.</p>
        <Link to="/" className="text-netflix-red mt-4 inline-block">Go Home</Link>
      </div>
    );
  }

  const title = getTitle(anime);
  const banner = getBannerImage(anime);
  const cover = getCoverImage(anime);
  const description = anime.description?.replace(/<[^>]*>/g, "") || "";

  const handlePlayEpisode = (ep) => {
    navigate(`/watch/${ep.id}`, {
      state: { anime, episodeNumber: ep.number, episodeTitle: ep.title },
    });
  };

  return (
    <div id="anime-detail-page">
      {/* Banner */}
      {banner && (
        <div className="relative w-full h-[40vh] lg:h-[50vh]">
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${banner})` }}
          />
          <div className="absolute inset-0 gradient-overlay-bottom" />
          <div className="absolute inset-0 bg-black/30" />
        </div>
      )}

      {/* Content */}
      <div className={`relative z-10 px-5 lg:px-24 pb-16 ${banner ? "-mt-32" : "pt-24"}`}>
        <div className="flex flex-col md:flex-row gap-8 mb-10">
          {/* Cover */}
          <div className="shrink-0">
            <img
              src={cover}
              alt={title}
              className="w-48 lg:w-56 rounded-lg shadow-2xl shadow-black/60 border border-surface-border"
            />
          </div>

          {/* Info */}
          <div className="flex-1 space-y-4">
            <h1 className="text-3xl lg:text-4xl font-black text-text-primary leading-tight">
              {title}
            </h1>

            {/* Meta row */}
            <div className="flex flex-wrap items-center gap-3 text-sm">
              {anime.averageScore && (
                <span className="flex items-center gap-1 text-yellow-400 font-bold">
                  <Star className="w-4 h-4 fill-current" /> {formatScore(anime.averageScore)}
                </span>
              )}
              {anime.format && (
                <Badge variant="outline">{anime.format}</Badge>
              )}
              {anime.status && (
                <Badge variant={anime.status === "RELEASING" ? "red" : "outline"}>
                  {formatStatus(anime.status)}
                </Badge>
              )}
              {anime.episodes && (
                <span className="text-text-secondary">{formatEpisodes(anime.episodes)}</span>
              )}
              {anime.duration && (
                <span className="text-text-secondary">{anime.duration} min</span>
              )}
              {anime.seasonYear && (
                <span className="text-text-secondary">{anime.season ? capitalize(anime.season) + " " : ""}{anime.seasonYear}</span>
              )}
            </div>

            {/* Genres */}
            {anime.genres && (
              <div className="flex flex-wrap gap-2">
                {anime.genres.map((genre) => (
                  <Link
                    key={genre}
                    to={`/browse?genre=${genre}`}
                    className="text-xs font-medium text-text-secondary bg-surface-base px-3 py-1.5 rounded-lg hover:bg-surface-raised hover:text-text-primary transition-colors"
                  >
                    {genre}
                  </Link>
                ))}
              </div>
            )}

            {/* Description */}
            {description && (
              <div>
                <p className="text-text-secondary text-sm leading-relaxed">
                  {showFullDesc ? description : truncateText(description, 300)}
                </p>
                {description.length > 300 && (
                  <button
                    onClick={() => setShowFullDesc(!showFullDesc)}
                    className="text-netflix-red text-sm mt-1 hover:underline"
                  >
                    {showFullDesc ? "Show Less" : "Read More"}
                  </button>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-4 pt-2">
              {providers && (
                <button
                  onClick={() => {
                    document.getElementById("episodes-section")?.scrollIntoView({ behavior: "smooth" });
                  }}
                  className="flex items-center gap-2 bg-netflix-red hover:bg-netflix-red-hover text-white font-semibold px-6 py-3 rounded transition-colors"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                  </svg>
                  Watch Now
                </button>
              )}
              <button
                onClick={() => toggleList(anime)}
                className={`flex items-center gap-2 px-6 py-3 rounded font-medium transition-colors ${
                  isInList(anime.id)
                    ? "bg-white/20 text-white border border-white/30"
                    : "bg-surface-base border border-surface-border text-text-primary hover:bg-surface-raised"
                }`}
              >
                {isInList(anime.id) ? (
                  <>
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    In My List
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    My List
                  </>
                )}
              </button>
            </div>

            {/* Studios */}
            {anime.studios && anime.studios.length > 0 && (
              <p className="text-xs text-text-muted">
                Studio: {anime.studios.map((s) => s.name || s).join(", ")}
              </p>
            )}

            {/* Trailer */}
            {anime.trailer && anime.trailer.id && (
              <button
                onClick={() => setShowTrailer(true)}
                className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-netflix-red transition-colors"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                </svg>
                Watch Trailer
              </button>
            )}
          </div>
        </div>

        {/* Episodes */}
        {providers && (
          <div id="episodes-section" className="mb-12">
            <EpisodeList
              providers={providers}
              onPlayEpisode={handlePlayEpisode}
            />
          </div>
        )}

        {/* Characters */}
        {anime.characters && anime.characters.length > 0 && (
          <div className="mb-12">
            <CharacterList characters={anime.characters} />
          </div>
        )}

        {/* Related & Recommendations */}
        <RelatedAnime relations={relations} recommendations={recommendations} />
      </div>

      {/* Trailer Modal */}
      <TrailerModal
        isOpen={showTrailer}
        onClose={() => setShowTrailer(false)}
        trailer={anime?.trailer}
      />
    </div>
  );
}
