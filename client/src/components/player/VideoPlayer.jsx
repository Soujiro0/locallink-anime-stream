import { useRef, useEffect, useCallback, useState } from "react";
import Hls from "hls.js";
import SkipButton from "./SkipButton";
import PlayerControls from "./PlayerControls";
import usePlayerState from "../../hooks/usePlayerState";
import { Play } from "lucide-react";

export default function VideoPlayer({
	streams = [],
	subtitles = [],
	intro = null,
	outro = null,
	onTimeUpdate,
	initialTime = 0,
	onNextEpisode,
	onPrevEpisode,
	hasPrev = false,
	hasNext = false,
	onEnded,
	title = "",
	isLoading = false,
}) {
	const videoRef = useRef(null);
	const hlsRef = useRef(null);
	const [qualities, setQualities] = useState([]);
	const [isReady, setIsReady] = useState(false);

	const playerState = usePlayerState(videoRef, isLoading);

	const {
		isPlaying,
		currentTime,
		showControls,
		settingsOpen,
		autoNext,
		autoSkipIntro,
		autoSkipOutro,
		currentQuality,
		containerRef,
		togglePlay,
		seek,
		resetControlsTimer,
		setCurrentQuality,
		setShowControls,
		setSettingsOpen,
		subFontSize,
		subBackgroundOpacity,
		subEdgeStyle,
		subEdgeThickness,
		subPosition,
	} = playerState;

	const destroyHls = useCallback(() => {
		if (hlsRef.current) {
			hlsRef.current.destroy();
			hlsRef.current = null;
		}
	}, []);

	const getProxyUrl = useCallback((url, referer, absolute = false) => {
		if (!url?.startsWith("http")) return url;
		let proxyBase = absolute ? window.location.origin + "/proxy?url=" : "/proxy?url=";
		let proxyUrl = proxyBase + encodeURIComponent(url);
		if (referer) proxyUrl += "&referer=" + encodeURIComponent(referer);
		return proxyUrl;
	}, []);


	
	// HLS setup (same proven logic, just removed native controls)
useEffect(() => {
        const video = videoRef.current;
        if (!video || !streams.length) return;

        destroyHls();
        setIsReady(false);
        setQualities([]);

        const hlsStreams = streams.filter(
            (s) => (s.type === "hls" || s.url?.includes(".m3u8")) && !!s.url
        );

        if (Hls.isSupported() && hlsStreams.length > 0) {
            const hls = new Hls({
                maxBufferLength: 60,
                maxMaxBufferLength: 120,
            });

            // 1. THE FIX: Force an absolute URL so the Blob parser doesn't panic
            let proxyUrl = getProxyUrl(hlsStreams[0].url, hlsStreams[0].referer, true);

            // 2. Inject the exact Codecs so Chrome initializes the decoder
            const masterM3u8 = `#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080,CODECS="avc1.4d401e,mp4a.40.2"\n${proxyUrl}\n`;
            const blob = new Blob([masterM3u8], { type: "application/vnd.apple.mpegurl" });

            // 3. Load the Blob into HLS
            hls.loadSource(URL.createObjectURL(blob));
            hls.attachMedia(video);

			hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
				const q = data.levels.map((level, index) => ({
					label: `${level.height}p`,
					value: index,
				}));
				setQualities([{ label: "Auto", value: -1 }, ...q]);
				setCurrentQuality(-1);
				setIsReady(true);

				if (initialTime > 0) {
					video.currentTime = initialTime;
				}
				video.play().catch(() => {});
			});

			hls.on(Hls.Events.ERROR, (_, errData) => {
                if (errData.fatal) {
                    switch (errData.type) {
                        case Hls.ErrorTypes.NETWORK_ERROR:
                            hls.startLoad();
                            break;
                        case Hls.ErrorTypes.MEDIA_ERROR:
                            mediaErrorCount++;
                            if (mediaErrorCount <= 3) {
                                console.warn("Media error, attempting recovery...");
                                hls.recoverMediaError(); // Try to fix it
                            } else {
                                console.error("Too many media errors. Stopping to prevent infinite blinking loop.");
                                hls.destroy(); // Give up instead of blinking forever
                            }
                            break;
                        default:
                            hls.destroy();
                            break;
                    }
                }
            });

			hlsRef.current = hls;
		} else if (video.canPlayType("application/vnd.apple.mpegurl") && hlsStreams.length > 0) {
			let proxyUrl = getProxyUrl(hlsStreams[0].url, hlsStreams[0].referer, false);
			video.src = proxyUrl;
			video.addEventListener("loadedmetadata", () => {
				setIsReady(true);
				if (initialTime > 0) video.currentTime = initialTime;
				video.play().catch(() => {});
			});
		} else {
			const directStreams = streams.filter((s) => s.type !== "hls" && !s.url?.includes(".m3u8") && !!s.url);
			if (directStreams.length > 0) {
				const q = directStreams.map((s) => ({ label: s.quality, value: s.quality }));
				setQualities(q);
				setCurrentQuality(directStreams[0].quality);

				let proxyUrl = getProxyUrl(directStreams[0].url, directStreams[0].referer, false);
				video.src = proxyUrl;
				setIsReady(true);
			} else if (hlsStreams.length === 0) {
				console.error("No valid streams found.");
				// Optionally, set an error state here if you have one.
			}
		}

		return () => destroyHls();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [streams, destroyHls, isLoading]);

	// Subtitle tracks
	useEffect(() => {
		const video = videoRef.current;
		if (!video || !subtitles?.length) return;

		while (video.firstChild) video.removeChild(video.firstChild);

		subtitles.forEach((sub, idx) => {
			const track = document.createElement("track");
			track.kind = sub.kind || "captions";
			track.label = sub.label || `Subtitle ${idx + 1}`;
			track.srclang = sub.language || "en";
			
			const referer = streams.find(s => s.referer)?.referer || "";
			let proxyUrl = getProxyUrl(sub.file, referer, false);
			track.src = proxyUrl;
			
			if (idx === 0) track.default = true;
			video.appendChild(track);
		});

		// Force the first track to show
		setTimeout(() => {
			if (video.textTracks && video.textTracks.length > 0) {
				// Find the default track or just use the first one
				for (let i = 0; i < video.textTracks.length; i++) {
					if (video.textTracks[i].language === (subtitles[0]?.language || "en")) {
						video.textTracks[i].mode = "showing";
						break;
					}
				}
			}
		}, 100);
	}, [subtitles, isReady, isLoading, streams]);



	// Quality change handler
	useEffect(() => {
		if (hlsRef.current && currentQuality !== undefined) {
			hlsRef.current.currentLevel = parseInt(currentQuality);
		}
	}, [currentQuality]);

	// Auto-skip intro
	useEffect(() => {
		if (autoSkipIntro && intro && intro.end > 0 && currentTime >= intro.start && currentTime < intro.end) {
			seek(intro.end);
		}
	}, [autoSkipIntro, intro, currentTime, seek]);

	// Auto-skip outro
	useEffect(() => {
		if (autoSkipOutro && outro && outro.end > 0 && currentTime >= outro.start && currentTime < outro.end) {
			seek(outro.end);
		}
	}, [autoSkipOutro, outro, currentTime, seek]);



	// Keyboard shortcuts
	useEffect(() => {
		const handleKeyDown = (e) => {
			// Don't capture when typing in inputs
			if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return;

			switch (e.key.toLowerCase()) {
				case " ":
				case "k":
					e.preventDefault();
					togglePlay();
					break;
				case "arrowleft":
				case "j":
					e.preventDefault();
					seek(Math.max(0, (videoRef.current?.currentTime || 0) - 5));
					break;
				case "arrowright":
				case "l":
					e.preventDefault();
					seek(Math.min(videoRef.current?.duration || 0, (videoRef.current?.currentTime || 0) + 5));
					break;
				case "arrowup":
					e.preventDefault();
					playerState.setVolume((v) => Math.min(1, v + 0.1));
					break;
				case "arrowdown":
					e.preventDefault();
					playerState.setVolume((v) => Math.max(0, v - 0.1));
					break;
				case "f":
					e.preventDefault();
					playerState.toggleFullscreen();
					break;
				case "m":
					e.preventDefault();
					playerState.toggleMute();
					break;
				default:
					break;
			}
			resetControlsTimer();
		};

		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [togglePlay, seek, playerState, resetControlsTimer]);

	// Manual skip buttons (only when auto-skip is OFF)
	const showSkipIntro = !autoSkipIntro && intro && intro.end > 0 && currentTime >= intro.start && currentTime < intro.end;
	const showSkipOutro = !autoSkipOutro && outro && outro.end > 0 && currentTime >= outro.start && currentTime < outro.end;

	// Loading state shell
	if (isLoading) {
		return (
			<div className="player-container">
				<div className="relative w-full pt-[56.25%] bg-black rounded-lg overflow-hidden flex items-center justify-center">
					<div className="absolute inset-0 flex items-center justify-center">
						<div className="w-12 h-12 border-4 border-text-muted border-t-netflix-red rounded-full animate-spin" />
					</div>
				</div>
			</div>
		);
	}

	return (
		<div
			ref={containerRef}
			className={`player-container ${showControls ? "" : "player-controls-hidden"}`}
			onMouseMove={() => { resetControlsTimer(); }}
			onClick={(e) => {
				// Close settings if clicking outside
				if (settingsOpen) {
					setSettingsOpen(false);
					return;
				}
			}}
		>
			{/* Video element */}
			<div className="relative w-full pt-[56.25%] bg-black rounded-lg overflow-hidden">
				<style>
					{`
						video::cue {
							font-size: ${subFontSize}em;
							background-color: rgba(0, 0, 0, ${subBackgroundOpacity});
							${subEdgeStyle === "uniform" ? `text-shadow: 0 0 ${subEdgeThickness}px #000, 0 0 ${subEdgeThickness}px #000, 0 0 ${subEdgeThickness}px #000, 0 0 ${subEdgeThickness}px #000;` : ""}
							${subEdgeStyle === "dropshadow" ? `text-shadow: ${subEdgeThickness}px ${subEdgeThickness}px ${subEdgeThickness * 2}px #000;` : ""}
							${subEdgeStyle === "none" ? "text-shadow: none;" : ""}
						}
						video::-webkit-media-text-track-display {
							transform: translateY(-${subPosition}px);
						}
					`}
				</style>
				<video
					ref={videoRef}
					className="absolute inset-0 w-full h-full cursor-pointer"
					playsInline
					crossOrigin="anonymous"
					onPlay={playerState.onPlay}
					onPause={playerState.onPause}
					onTimeUpdate={(e) => {
						playerState.onTimeUpdate(e);
						onTimeUpdate?.({
							currentTime: e.target.currentTime,
							duration: e.target.duration,
						});
					}}
					onDurationChange={playerState.onDurationChange}
					onProgress={playerState.onProgress}
					onEnded={() => {
						onEnded?.();
						if (autoNext && hasNext && onNextEpisode) {
							onNextEpisode();
						}
					}}
					onClick={(e) => {
						e.stopPropagation();
						togglePlay();
						resetControlsTimer();
					}}
					onDoubleClick={(e) => {
						e.stopPropagation();
						playerState.toggleFullscreen();
					}}
				/>

				{/* Fullscreen Title Overlay */}
				{playerState.isFullscreen && title && (
					<div className={`absolute top-0 left-0 right-0 p-4 pt-6 bg-linear-to-b from-black/80 to-transparent pointer-events-none transition-opacity duration-300 ${showControls ? "opacity-100" : "opacity-0"}`}>
						<h2 className="text-white text-lg font-bold drop-shadow-md px-4">{title}</h2>
					</div>
				)}

				{/* Center play overlay (paused state) */}
				{!isPlaying && isReady && (
					<div
						className="absolute inset-0 flex items-center justify-center cursor-pointer"
						onClick={(e) => {
							e.stopPropagation();
							togglePlay();
						}}
					>
						<div className="w-16 h-16 rounded-full bg-netflix-red/90 flex items-center justify-center shadow-2xl shadow-black/50 transition-transform hover:scale-110">
							<Play className="w-7 h-7 text-white ml-1" />
						</div>
					</div>
				)}

				{/* Skip buttons */}
				{showSkipIntro && (
					<SkipButton label="Skip Intro" onClick={() => seek(intro.end)} />
				)}
				{showSkipOutro && (
					<SkipButton label="Skip Outro" onClick={() => seek(outro.end)} />
				)}

				{/* Controls overlay (bottom gradient + controls) */}
				<div className="player-controls-overlay">
					<PlayerControls
						playerState={playerState}
						qualities={qualities}
						hasPrev={hasPrev}
						hasNext={hasNext}
						onPrevEpisode={onPrevEpisode}
						onNextEpisode={onNextEpisode}
						intro={intro}
						outro={outro}
					/>
				</div>
			</div>
		</div>
	);
}
