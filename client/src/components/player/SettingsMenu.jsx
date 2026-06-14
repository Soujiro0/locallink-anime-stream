import { Settings, Check } from "lucide-react";

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

export default function SettingsMenu({
	isOpen,
	onToggle,
	qualities,
	currentQuality,
	onQualityChange,
	playbackSpeed,
	onSpeedChange,
	autoNext,
	onAutoNextChange,
	autoSkipIntro,
	onAutoSkipIntroChange,
	autoSkipOutro,
	onAutoSkipOutroChange,
}) {
	if (!isOpen) {
		return (
			<button onClick={onToggle} className="player-btn" title="Settings">
				<Settings className="w-5 h-5" />
			</button>
		);
	}

	return (
		<div className="relative">
			<button onClick={onToggle} className="player-btn player-btn-active" title="Settings">
				<Settings className="w-5 h-5" />
			</button>

			{/* Settings Panel */}
			<div className="player-settings-panel animate-dropdown-open" onClick={(e) => e.stopPropagation()}>
				{/* Quality */}
				{qualities.length > 0 && (
					<div className="player-settings-section">
						<div className="player-settings-label">Quality</div>
						<div className="player-settings-options">
							{qualities.map((q) => (
								<button
									key={q.value}
									onClick={() => onQualityChange(q.value)}
									className={`player-settings-option ${
										currentQuality === q.value ? "player-settings-option-active" : ""
									}`}
								>
									<span>{q.label}</span>
									{currentQuality === q.value && <Check className="w-3.5 h-3.5" />}
								</button>
							))}
						</div>
					</div>
				)}

				{/* Playback Speed */}
				<div className="player-settings-section">
					<div className="player-settings-label">Speed</div>
					<div className="player-settings-options player-settings-speed-grid">
						{SPEEDS.map((speed) => (
							<button
								key={speed}
								onClick={() => onSpeedChange(speed)}
								className={`player-settings-speed-btn ${
									playbackSpeed === speed ? "player-settings-option-active" : ""
								}`}
							>
								{speed === 1 ? "Normal" : `${speed}x`}
							</button>
						))}
					</div>
				</div>

				{/* Toggles */}
				<div className="player-settings-section">
					<div className="player-settings-label">Playback</div>
					<div className="player-settings-options">
						<button
							onClick={() => onAutoNextChange(!autoNext)}
							className="player-settings-toggle"
						>
							<span>Auto Next</span>
							<div className={`player-toggle ${autoNext ? "player-toggle-on" : ""}`}>
								<div className="player-toggle-thumb" />
							</div>
						</button>
						<button
							onClick={() => onAutoSkipIntroChange(!autoSkipIntro)}
							className="player-settings-toggle"
						>
							<span>Auto Skip Intro</span>
							<div className={`player-toggle ${autoSkipIntro ? "player-toggle-on" : ""}`}>
								<div className="player-toggle-thumb" />
							</div>
						</button>
						<button
							onClick={() => onAutoSkipOutroChange(!autoSkipOutro)}
							className="player-settings-toggle"
						>
							<span>Auto Skip Outro</span>
							<div className={`player-toggle ${autoSkipOutro ? "player-toggle-on" : ""}`}>
								<div className="player-toggle-thumb" />
							</div>
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
