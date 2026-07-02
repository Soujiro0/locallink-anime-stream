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
	isTheater = false,
	onToggleTheater,
}) {
	const videoRef = useRef(null);
	const hlsRef = useRef(null);
	const [qualities, setQualities] = useState([]);
	const [isReady, setIsReady] = useState(false);
	const [activeEmbed, setActiveEmbed] = useState(null);

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
        if (!streams || !streams.length) return;

        setActiveEmbed(null);
        destroyHls();
        setIsReady(false);
        setQualities([]);

        const video = videoRef.current;
        if (!video) return;

        const hlsStreams = streams.filter(
            (s) => (s.type === "hls" || s.url?.includes(".m3u8")) && !!s.url
        );
        const directStreams = streams.filter(
            (s) => s.type !== "hls" && !s.url?.includes(".m3u8") && s.type !== "embed" && !s.url?.includes("embed") && !!s.url
        );
        const embedStreams = streams.filter(
            (s) => s.type === "embed" || s.url?.includes("embed") || (s.url && !s.url.includes(".m3u8") && !s.url.includes(".mp4"))
        );

        if (Hls.isSupported() && hlsStreams.length > 0) {
            const hls = new Hls({
                maxBufferLength: 60,
                maxMaxBufferLength: 120,
            });

            let proxyUrl = getProxyUrl(hlsStreams[0].url, hlsStreams[0].referer, false);
            hls.loadSource(proxyUrl);
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

			let networkErrorCount = 0;
			let currentStreamIndex = 0;
			hls.on(Hls.Events.ERROR, (_, errData) => {
                if (errData.fatal) {
                    switch (errData.type) {
                        case Hls.ErrorTypes.NETWORK_ERROR:
                            networkErrorCount++;
                            if (networkErrorCount === 1 && errData.response?.code === 403) {
                                try {
                                    const blockedUrl = errData.url || errData.frag?.url || "";
                                    if (blockedUrl) {
                                        const blockedHost = new URL(blockedUrl).hostname;
                                        fetch("/proxy/report-blocked", {
                                            method: "POST",
                                            headers: { "Content-Type": "application/json" },
                                            body: JSON.stringify({ hostname: blockedHost }),
                                        }).catch(() => {});
                                    }
                                } catch (e) {}

                                console.warn("403 Forbidden on chunk, retrying with adaptive segment proxying...");
                                let fallbackProxyUrl = getProxyUrl(hlsStreams[currentStreamIndex].url, hlsStreams[currentStreamIndex].referer, false) + "&proxyChunks=true";
                                hls.loadSource(fallbackProxyUrl);
                            } else if (networkErrorCount <= 3) {
                                currentStreamIndex++;
                                if (currentStreamIndex < hlsStreams.length) {
                                    console.warn(`Stream ${currentStreamIndex - 1} failed, trying stream ${currentStreamIndex}...`);
                                    networkErrorCount = 0;
                                    let nextProxyUrl = getProxyUrl(hlsStreams[currentStreamIndex].url, hlsStreams[currentStreamIndex].referer, false);
                                    hls.loadSource(nextProxyUrl);
                                } else if (embedStreams.length > 0) {
                                    console.warn("All HLS streams failed, falling back to embed stream...");
                                    hls.destroy();
                                    setActiveEmbed(embedStreams[0]);
                                    setIsReady(true);
                                } else {
                                    hls.startLoad();
                                }
                            } else if (embedStreams.length > 0) {
                                hls.destroy();
                                setActiveEmbed(embedStreams[0]);
                                setIsReady(true);
                            } else {
                                hls.destroy();
                            }
                            break;
                        case Hls.ErrorTypes.MEDIA_ERROR:
                            mediaErrorCount++;
                            if (mediaErrorCount <= 3) {
                                console.warn("Media error, attempting recovery...");
                                hls.recoverMediaError();
                            } else {
                                console.error("Too many media errors. Stopping to prevent infinite blinking loop.");
                                hls.destroy();
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
		} else if (directStreams.length > 0) {
			const q = directStreams.map((s) => ({ label: s.quality, value: s.quality }));
			setQualities(q);
			setCurrentQuality(directStreams[0].quality);

			let proxyUrl = getProxyUrl(directStreams[0].url, directStreams[0].referer, false);
			video.src = proxyUrl;
			setIsReady(true);
		} else if (embedStreams.length > 0) {
			console.log("Using embed stream fallback:", embedStreams[0].server);
			setActiveEmbed(embedStreams[0]);
			setIsReady(true);
		} else {
			console.error("No valid streams found.");
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
			{/* Video element or Embed Fallback */}
			<div className="relative w-full pt-[56.25%] bg-black rounded-lg overflow-hidden">
				{activeEmbed && (
					<div className="absolute inset-0 w-full h-full flex flex-col bg-black z-20">
						<iframe
							src={activeEmbed.url}
							className="w-full h-full border-0"
							allowFullScreen
							allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
							title={title || "Video Player"}
						/>
					</div>
				)}
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
					className={`absolute inset-0 w-full h-full cursor-pointer ${activeEmbed ? "hidden" : ""}`}
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
				{!activeEmbed && !isPlaying && isReady && (
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
				{!activeEmbed && showSkipIntro && (
					<SkipButton label="Skip Intro" onClick={() => seek(intro.end)} />
				)}
				{!activeEmbed && showSkipOutro && (
					<SkipButton label="Skip Outro" onClick={() => seek(outro.end)} />
				)}

				{/* Controls overlay (bottom gradient + controls) */}
				{!activeEmbed && (
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
							subtitles={subtitles}
							isTheater={isTheater}
							onToggleTheater={onToggleTheater}
						/>
					</div>
				)}
			</div>
		</div>
	);
}
