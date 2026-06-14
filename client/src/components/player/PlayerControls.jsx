import {
	Play, Pause, SkipBack, SkipForward,
	Maximize, Minimize, PictureInPicture2,
} from "lucide-react";
import ProgressBar from "./ProgressBar";
import VolumeControl from "./VolumeControl";
import SettingsMenu from "./SettingsMenu";
import { formatTime } from "../../utils/helpers";

export default function PlayerControls({
	playerState,
	qualities,
	hasPrev,
	hasNext,
	onPrevEpisode,
	onNextEpisode,
	intro,
	outro,
}) {
	const {
		isPlaying,
		currentTime,
		duration,
		buffered,
		volume,
		isMuted,
		isFullscreen,
		settingsOpen,
		autoNext,
		autoSkipIntro,
		autoSkipOutro,
		playbackSpeed,
		currentQuality,
		togglePlay,
		toggleMute,
		toggleFullscreen,
		togglePiP,
		seek,
		setVolume,
		setSettingsOpen,
		setAutoNext,
		setAutoSkipIntro,
		setAutoSkipOutro,
		setPlaybackSpeed,
		setCurrentQuality,
	} = playerState;

	return (
		<div className="player-controls-wrapper">
			{/* Progress bar */}
			<ProgressBar
				currentTime={currentTime}
				duration={duration}
				buffered={buffered}
				onSeek={seek}
				intro={intro}
				outro={outro}
			/>

			{/* Controls row */}
			<div className="player-controls-row">
				{/* Left controls */}
				<div className="player-controls-left">
					{/* Play/Pause */}
					<button onClick={togglePlay} className="player-btn" title={isPlaying ? "Pause" : "Play"}>
						{isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
					</button>

					{/* Prev Episode */}
					{onPrevEpisode && (
						<button
							onClick={onPrevEpisode}
							disabled={!hasPrev}
							className={`player-btn ${!hasPrev ? "opacity-30 cursor-not-allowed" : ""}`}
							title="Previous Episode"
						>
							<SkipBack className="w-4.5 h-4.5" />
						</button>
					)}

					{/* Next Episode */}
					{onNextEpisode && (
						<button
							onClick={onNextEpisode}
							disabled={!hasNext}
							className={`player-btn ${!hasNext ? "opacity-30 cursor-not-allowed" : ""}`}
							title="Next Episode"
						>
							<SkipForward className="w-4.5 h-4.5" />
						</button>
					)}

					{/* Volume */}
					<VolumeControl
						volume={volume}
						isMuted={isMuted}
						onVolumeChange={setVolume}
						onToggleMute={toggleMute}
					/>

					{/* Time */}
					<span className="player-time">
						{formatTime(currentTime)} / {formatTime(duration)}
					</span>
				</div>

				{/* Right controls */}
				<div className="player-controls-right">
					{/* Settings */}
					<SettingsMenu
						isOpen={settingsOpen}
						onToggle={() => setSettingsOpen(!settingsOpen)}
						qualities={qualities}
						currentQuality={currentQuality}
						onQualityChange={(q) => {
							setCurrentQuality(q);
							// Quality change is handled by parent
						}}
						playbackSpeed={playbackSpeed}
						onSpeedChange={setPlaybackSpeed}
						autoNext={autoNext}
						onAutoNextChange={setAutoNext}
						autoSkipIntro={autoSkipIntro}
						onAutoSkipIntroChange={setAutoSkipIntro}
						autoSkipOutro={autoSkipOutro}
						onAutoSkipOutroChange={setAutoSkipOutro}
					/>

					{/* PiP */}
					<button onClick={togglePiP} className="player-btn" title="Picture in Picture">
						<PictureInPicture2 className="w-5 h-5" />
					</button>

					{/* Fullscreen */}
					<button onClick={toggleFullscreen} className="player-btn" title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}>
						{isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
					</button>
				</div>
			</div>
		</div>
	);
}
