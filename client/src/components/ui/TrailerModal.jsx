import { useEffect } from "react";
import { X } from "lucide-react";

export default function TrailerModal({ isOpen, onClose, trailer }) {
	useEffect(() => {
		if (isOpen) {
			document.body.style.overflow = "hidden";
		} else {
			document.body.style.overflow = "";
		}
		return () => {
			document.body.style.overflow = "";
		};
	}, [isOpen]);

	// Close on Escape
	useEffect(() => {
		const handleEscape = (e) => {
			if (e.key === "Escape") onClose();
		};
		if (isOpen) {
			document.addEventListener("keydown", handleEscape);
			return () => document.removeEventListener("keydown", handleEscape);
		}
	}, [isOpen, onClose]);

	if (!isOpen || !trailer) return null;

	// Determine embed URL based on site
	const isYouTube = trailer.site?.toLowerCase() === "youtube";
	const embedUrl = isYouTube
		? `https://www.youtube.com/embed/${trailer.id}?autoplay=1&rel=0`
		: null;
	const fallbackUrl = isYouTube
		? `https://www.youtube.com/watch?v=${trailer.id}`
		: null;

	// If no embeddable URL, redirect instead
	if (!embedUrl && fallbackUrl) {
		window.open(fallbackUrl, "_blank", "noopener,noreferrer");
		onClose();
		return null;
	}

	if (!embedUrl) {
		onClose();
		return null;
	}

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center"
			onClick={onClose}
		>
			{/* Backdrop */}
			<div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

			{/* Modal content */}
			<div
				className="relative w-full max-w-4xl mx-4 animate-dropdown-open"
				onClick={(e) => e.stopPropagation()}
			>
				{/* Close button */}
				<button
					onClick={onClose}
					className="absolute -top-10 right-0 text-text-secondary hover:text-white transition-colors z-10"
					aria-label="Close trailer"
				>
					<X className="w-6 h-6" />
				</button>

				{/* Embed iframe */}
				<div className="relative w-full pt-[56.25%] bg-black rounded-lg overflow-hidden shadow-2xl shadow-black/80 border border-surface-border">
					<iframe
						src={embedUrl}
						className="absolute inset-0 w-full h-full"
						allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
						allowFullScreen
						title="Anime Trailer"
					/>
				</div>
			</div>
		</div>
	);
}
