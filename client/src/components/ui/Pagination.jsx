import { ChevronLeft, ChevronRight } from "lucide-react";

export default function Pagination({ page, hasNext, onPageChange, totalPages }) {
	const maxVisible = 5;

	// Build page number array
	const getPageNumbers = () => {
		if (!totalPages || totalPages <= 1) {
			// Unknown total — show current page context
			const pages = [];
			const start = Math.max(1, page - 2);
			const end = hasNext ? page + 2 : page;
			for (let i = start; i <= end; i++) {
				pages.push(i);
			}
			return pages;
		}

		// Known total
		if (totalPages <= maxVisible) {
			return Array.from({ length: totalPages }, (_, i) => i + 1);
		}

		const pages = [];
		if (page <= 3) {
			pages.push(1, 2, 3, 4, "...", totalPages);
		} else if (page >= totalPages - 2) {
			pages.push(1, "...", totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
		} else {
			pages.push(1, "...", page - 1, page, page + 1, "...", totalPages);
		}
		return pages;
	};

	const pageNumbers = getPageNumbers();

	if (page === 1 && !hasNext) return null;

	return (
		<div className="flex items-center justify-center gap-2 mt-12">
			{/* Previous */}
			<button
				onClick={() => onPageChange(Math.max(1, page - 1))}
				disabled={page === 1}
				className={`flex items-center justify-center w-10 h-10 rounded-lg text-sm font-medium transition-all ${
					page === 1
						? "text-text-muted cursor-not-allowed opacity-40"
						: "text-text-primary bg-surface-base border border-surface-border hover:bg-surface-raised hover:border-text-muted"
				}`}
				aria-label="Previous page"
			>
				<ChevronLeft className="w-4 h-4" />
			</button>

			{/* Page numbers */}
			{pageNumbers.map((num, idx) =>
				num === "..." ? (
					<span key={`ellipsis-${idx}`} className="w-10 h-10 flex items-center justify-center text-text-muted text-sm">
						…
					</span>
				) : (
					<button
						key={num}
						onClick={() => onPageChange(num)}
						className={`w-10 h-10 rounded-lg text-sm font-medium transition-all ${
							num === page
								? "bg-netflix-red text-white shadow-lg shadow-netflix-red/30"
								: "text-text-secondary bg-surface-base border border-surface-border hover:bg-surface-raised hover:text-text-primary hover:border-text-muted"
						}`}
					>
						{num}
					</button>
				)
			)}

			{/* Next */}
			<button
				onClick={() => hasNext && onPageChange(page + 1)}
				disabled={!hasNext}
				className={`flex items-center justify-center w-10 h-10 rounded-lg text-sm font-medium transition-all ${
					!hasNext
						? "text-text-muted cursor-not-allowed opacity-40"
						: "text-text-primary bg-surface-base border border-surface-border hover:bg-surface-raised hover:border-text-muted"
				}`}
				aria-label="Next page"
			>
				<ChevronRight className="w-4 h-4" />
			</button>
		</div>
	);
}
