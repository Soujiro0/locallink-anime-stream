import { Link } from "react-router-dom";
import { getTitle, getCoverImage, formatScore, formatEpisodes } from "../../utils/helpers";
import { Star } from "lucide-react";

export default function AnimeCard({ anime, className = "" }) {
	const title = getTitle(anime);
	const cover = getCoverImage(anime);

	return (
		<Link
			to={`/anime/${anime.id}`}
			className={`group relative block rounded-lg overflow-hidden bg-surface-base transition-transform duration-300 hover:scale-[1.03] hover:shadow-xl hover:shadow-black/40 ${className}`}
			id={`anime-card-${anime.id}`}
		>
			{/* Cover image */}
			<div className="relative aspect-2/3 overflow-hidden">
				<img
					src={cover}
					alt={title}
					loading="lazy"
					className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
				/>

				{/* Hover overlay */}
				<div className="absolute inset-0 bg-linear-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

				{/* Score badge */}
				{anime.averageScore && (
					<div className="absolute top-2 right-2 bg-black/70 backdrop-blur-sm text-text-primary text-xs font-bold px-2 py-1 rounded flex items-center gap-1">
						<Star className="w-3 h-3 fill-current" /> {formatScore(anime.averageScore)}
					</div>
				)}

				{/* Bottom info on hover */}
				<div className="absolute bottom-0 left-0 right-0 p-3 translate-y-full group-hover:translate-y-0 transition-transform duration-300">
					<div className="flex items-center gap-2 text-xs text-text-secondary">
						{anime.format && <span>{anime.format}</span>}
						{anime.episodes && (
							<>
								<span className="text-text-muted">•</span>
								<span>{formatEpisodes(anime.episodes)}</span>
							</>
						)}
						{anime.status === "RELEASING" && (
							<span className="text-netflix-red font-semibold ml-auto">AIRING</span>
						)}
					</div>
				</div>
			</div>

			{/* Title */}
			<div className="p-2.5 lg:p-2">
				<h3 className="text-sm lg:text-xs font-medium text-text-primary line-clamp-2 leading-snug">
					{title}
				</h3>
				{anime.genres && anime.genres.length > 0 && (
					<p className="text-xs text-text-muted mt-1.5 lg:mt-1 truncate">
						{anime.genres.slice(0, 3).join(" · ")}
					</p>
				)}
			</div>
		</Link>
	);
}
