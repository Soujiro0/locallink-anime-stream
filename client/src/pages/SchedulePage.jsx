import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { getWeeklySchedule } from "../services/api";
import { getTitle, getCoverImage } from "../utils/helpers";

const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function SchedulePage() {
	const [schedule, setSchedule] = useState(null);
	const [loading, setLoading] = useState(true);
	const [activeDay, setActiveDay] = useState("all");

	useEffect(() => {
		getWeeklySchedule()
			.then((data) => setSchedule(data))
			.catch((err) => console.error("Schedule error:", err))
			.finally(() => setLoading(false));
	}, []);

	const today = new Date().getDay();
	const todayName = DAY_NAMES[today];

	// Build schedule grouped by day
	const groupedSchedule = (schedule?.results || []).reduce((acc, anime) => {
		const airingAt = anime.airingAt;
		if (!airingAt) return acc;
		const date = new Date(airingAt * 1000);
		const dayName = DAY_NAMES[date.getDay()];

		if (!acc[dayName]) acc[dayName] = [];
		// Deduplicate by anime ID within same day
		if (!acc[dayName].some((a) => a.id === anime.id)) {
			acc[dayName].push(anime);
		}
		return acc;
	}, {});

	// Sort days starting from today
	const sortedDays = [...DAY_NAMES].sort((a, b) => {
		const dayOrder = (d) => {
			const idx = DAY_NAMES.indexOf(d);
			return (idx - today + 7) % 7;
		};
		return dayOrder(a) - dayOrder(b);
	});

	// Filter days based on active tab
	const visibleDays = activeDay === "all"
		? sortedDays
		: sortedDays.filter((d) => d === activeDay);

	return (
		<div id="schedule-page" className="pt-24 px-5 lg:px-24 pb-16 min-h-screen">
			<h1 className="text-3xl lg:text-4xl font-black text-text-primary mb-6">
				Airing Schedule
			</h1>

			{/* Day tabs */}
			<div className="flex items-center gap-1 mb-8 overflow-x-auto hide-scrollbar pb-1">
				<button
					onClick={() => setActiveDay("all")}
					className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
						activeDay === "all"
							? "bg-netflix-red text-white shadow-lg shadow-netflix-red/30"
							: "bg-surface-base border border-surface-border text-text-secondary hover:text-text-primary hover:border-text-muted"
					}`}
				>
					All Days
				</button>
				{sortedDays.map((dayName) => {
					const dayIdx = DAY_NAMES.indexOf(dayName);
					const isToday = dayName === todayName;
					const label = DAY_LABELS[dayIdx];

					return (
						<button
							key={dayName}
							onClick={() => setActiveDay(dayName)}
							className={`relative px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
								activeDay === dayName
									? "bg-netflix-red text-white shadow-lg shadow-netflix-red/30"
									: "bg-surface-base border border-surface-border text-text-secondary hover:text-text-primary hover:border-text-muted"
							}`}
						>
							{label}
							{isToday && (
								<span className="absolute -top-1 -right-1 w-2 h-2 bg-netflix-red rounded-full" />
							)}
						</button>
					);
				})}
			</div>

			{loading ? (
				<div className="space-y-8">
					{Array.from({ length: 3 }).map((_, i) => (
						<div key={i} className="space-y-4">
							<div className="skeleton h-8 w-48 rounded" />
							<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7 2xl:grid-cols-8 gap-4">
								{Array.from({ length: 5 }).map((_, j) => (
									<div key={j} className="skeleton h-48 rounded-lg" />
								))}
							</div>
						</div>
					))}
				</div>
			) : (
				<div className="space-y-10">
					{visibleDays.map((dayName) => {
						const animeList = groupedSchedule[dayName] || [];
						const isToday = dayName === todayName;
						const dayIdx = DAY_NAMES.indexOf(dayName);

						return (
							<div key={dayName}>
								<h2 className="text-xl font-bold text-text-primary mb-4 flex items-center gap-3">
									<span className="capitalize">{dayName}</span>
									{isToday && (
										<span className="text-xs bg-netflix-red text-white px-3 py-1 rounded-full font-bold">
											TODAY
										</span>
									)}
									<span className="text-sm text-text-muted font-normal">
										{animeList.length} anime
									</span>
								</h2>

								{animeList.length > 0 ? (
									<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7 2xl:grid-cols-8 gap-4">
										{animeList.map((anime) => (
											<Link
												key={`${anime.id}-${anime.airingAt}`}
												to={`/anime/${anime.id}`}
												className="group bg-surface-base rounded-lg overflow-hidden border border-surface-border hover:border-text-muted transition-all hover:scale-[1.02]"
											>
												<div className="relative aspect-2/3 overflow-hidden">
													<img
														src={getCoverImage(anime)}
														alt={getTitle(anime)}
														className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
														loading="lazy"
													/>
													{anime.next_episode && (
														<div className="absolute top-2 left-2 bg-netflix-red text-white text-xs font-bold px-2 py-1 rounded">
															EP {anime.next_episode}
														</div>
													)}
													{/* Aired / Upcoming badge */}
													{anime.airingAt && (
														<div className={`absolute top-2 right-2 text-xs font-bold px-2 py-1 rounded ${
															anime.airingAt * 1000 < Date.now()
																? "bg-surface-raised/90 text-text-muted"
																: "bg-green-600/90 text-white"
														}`}>
															{anime.airingAt * 1000 < Date.now() ? "AIRED" : "UPCOMING"}
														</div>
													)}
												</div>
												<div className="p-2.5 lg:p-2">
													<p className="text-sm lg:text-xs font-medium text-text-primary line-clamp-2">
														{getTitle(anime)}
													</p>
													{anime.airingAt && (
														<p className="text-xs text-text-muted mt-1">
															{new Date(anime.airingAt * 1000).toLocaleTimeString([], {
																hour: "2-digit",
																minute: "2-digit",
															})}
														</p>
													)}
												</div>
											</Link>
										))}
									</div>
								) : (
									<div className="py-8 text-center rounded-lg border border-dashed border-surface-border">
										<p className="text-text-muted text-sm">No anime airing on this day.</p>
									</div>
								)}
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}
