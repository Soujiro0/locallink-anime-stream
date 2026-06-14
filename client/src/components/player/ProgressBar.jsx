import { useState, useRef, useCallback } from "react";
import { formatTime } from "../../utils/helpers";

export default function ProgressBar({
	currentTime,
	duration,
	buffered,
	onSeek,
	intro,
	outro,
}) {
	const barRef = useRef(null);
	const [hoverTime, setHoverTime] = useState(null);
	const [hoverX, setHoverX] = useState(0);
	const [isDragging, setIsDragging] = useState(false);

	const getTimeFromX = useCallback((clientX) => {
		const bar = barRef.current;
		if (!bar || !duration) return 0;
		const rect = bar.getBoundingClientRect();
		const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
		return ratio * duration;
	}, [duration]);

	const handleMouseMove = (e) => {
		const time = getTimeFromX(e.clientX);
		setHoverTime(time);
		const rect = barRef.current?.getBoundingClientRect();
		if (rect) {
			setHoverX(Math.max(0, Math.min(e.clientX - rect.left, rect.width)));
		}
		if (isDragging) {
			onSeek(time);
		}
	};

	const handleMouseDown = (e) => {
		e.preventDefault();
		setIsDragging(true);
		const time = getTimeFromX(e.clientX);
		onSeek(time);

		const onMove = (ev) => {
			const t = getTimeFromX(ev.clientX);
			setHoverTime(t);
			onSeek(t);
		};
		const onUp = () => {
			setIsDragging(false);
			document.removeEventListener("mousemove", onMove);
			document.removeEventListener("mouseup", onUp);
		};
		document.addEventListener("mousemove", onMove);
		document.addEventListener("mouseup", onUp);
	};

	const playedPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
	const bufferedPercent = duration > 0 ? (buffered / duration) * 100 : 0;

	// Intro/outro segment markers
	const getSegmentStyle = (segment) => {
		if (!segment || !duration || segment.end <= 0) return null;
		const left = (segment.start / duration) * 100;
		const width = ((segment.end - segment.start) / duration) * 100;
		return { left: `${left}%`, width: `${width}%` };
	};

	const introStyle = getSegmentStyle(intro);
	const outroStyle = getSegmentStyle(outro);

	return (
		<div
			className="player-progress-container group/progress"
			ref={barRef}
			onMouseMove={handleMouseMove}
			onMouseLeave={() => { setHoverTime(null); }}
			onMouseDown={handleMouseDown}
		>
			{/* Hover time tooltip */}
			{hoverTime !== null && (
				<div
					className="player-progress-tooltip"
					style={{ left: `${hoverX}px` }}
				>
					{formatTime(hoverTime)}
				</div>
			)}

			{/* Background track */}
			<div className="player-progress-track">
				{/* Buffered */}
				<div
					className="player-progress-buffered"
					style={{ width: `${bufferedPercent}%` }}
				/>

				{/* Intro segment marker */}
				{introStyle && (
					<div
						className="player-progress-segment player-progress-segment-intro"
						style={introStyle}
						title="Intro"
					/>
				)}

				{/* Outro segment marker */}
				{outroStyle && (
					<div
						className="player-progress-segment player-progress-segment-outro"
						style={outroStyle}
						title="Outro"
					/>
				)}

				{/* Played */}
				<div
					className="player-progress-played"
					style={{ width: `${playedPercent}%` }}
				/>

				{/* Thumb */}
				<div
					className="player-progress-thumb"
					style={{ left: `${playedPercent}%` }}
				/>
			</div>
		</div>
	);
}
