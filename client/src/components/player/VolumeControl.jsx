import { useRef } from "react";
import { Volume2, VolumeX, Volume1 } from "lucide-react";

export default function VolumeControl({ volume, isMuted, onVolumeChange, onToggleMute }) {
	const sliderRef = useRef(null);

	const VolumeIcon = isMuted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

	const handleSliderChange = (e) => {
		const value = parseFloat(e.target.value);
		onVolumeChange(value);
	};

	return (
		<div className="player-volume-container group/volume">
			<button
				onClick={onToggleMute}
				className="player-btn"
				title={isMuted ? "Unmute" : "Mute"}
			>
				<VolumeIcon className="w-5 h-5" />
			</button>
			<div className="player-volume-slider-wrapper">
				<input
					ref={sliderRef}
					type="range"
					min="0"
					max="1"
					step="0.05"
					value={isMuted ? 0 : volume}
					onChange={handleSliderChange}
					className="player-volume-slider"
				/>
			</div>
		</div>
	);
}
