import { useState, useCallback, useRef, useEffect } from "react";

const STORAGE_KEY = "aniswipe-player-prefs";

function loadPrefs() {
	try {
		return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
	} catch {
		return {};
	}
}

function savePrefs(prefs) {
	localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

export default function usePlayerState(videoRef, isLoading = false) {
	const prefs = loadPrefs();

	const [isPlaying, setIsPlaying] = useState(false);
	const [currentTime, setCurrentTime] = useState(0);
	const [duration, setDuration] = useState(0);
	const [buffered, setBuffered] = useState(0);
	const [volume, setVolume] = useState(prefs.volume ?? 1);
	const [isMuted, setIsMuted] = useState(prefs.isMuted ?? false);
	const [isFullscreen, setIsFullscreen] = useState(false);
	const [showControls, setShowControls] = useState(true);
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [autoNext, setAutoNext] = useState(prefs.autoNext ?? false);
	const [autoSkipIntro, setAutoSkipIntro] = useState(prefs.autoSkipIntro ?? false);
	const [autoSkipOutro, setAutoSkipOutro] = useState(prefs.autoSkipOutro ?? false);
	const [playbackSpeed, setPlaybackSpeed] = useState(prefs.playbackSpeed ?? 1);
	const [currentQuality, setCurrentQuality] = useState(-1);

	const controlsTimer = useRef(null);
	const containerRef = useRef(null);

	// Persist preferences
	useEffect(() => {
		savePrefs({ volume, isMuted, autoNext, autoSkipIntro, autoSkipOutro, playbackSpeed });
	}, [volume, isMuted, autoNext, autoSkipIntro, autoSkipOutro, playbackSpeed]);

	// Sync volume to video element
	useEffect(() => {
		const video = videoRef?.current;
		if (!video) return;
		video.volume = isMuted ? 0 : volume;
	}, [volume, isMuted, videoRef, isLoading]);

	// Sync playback speed
	useEffect(() => {
		const video = videoRef?.current;
		if (!video) return;
		video.playbackRate = playbackSpeed;
	}, [playbackSpeed, videoRef, isLoading]);

	// Control visibility timer
	const resetControlsTimer = useCallback(() => {
		setShowControls(true);
		if (controlsTimer.current) clearTimeout(controlsTimer.current);
		controlsTimer.current = setTimeout(() => {
			if (videoRef?.current && !videoRef.current.paused && !settingsOpen) {
				setShowControls(false);
			}
		}, 3000);
	}, [settingsOpen, videoRef]);

	// Toggle play/pause
	const togglePlay = useCallback(() => {
		const video = videoRef?.current;
		if (!video) return;
		if (video.paused) {
			video.play().catch(() => {});
		} else {
			video.pause();
		}
	}, [videoRef]);

	// Seek
	const seek = useCallback((time) => {
		const video = videoRef?.current;
		if (!video) return;
		video.currentTime = Math.max(0, Math.min(time, video.duration || 0));
	}, [videoRef]);

	// Toggle fullscreen
	const toggleFullscreen = useCallback(() => {
		const container = containerRef.current;
		if (!container) return;

		if (document.fullscreenElement) {
			document.exitFullscreen().catch(() => {});
		} else {
			container.requestFullscreen().catch(() => {});
		}
	}, []);

	// Toggle PiP
	const togglePiP = useCallback(async () => {
		const video = videoRef?.current;
		if (!video) return;
		try {
			if (document.pictureInPictureElement) {
				await document.exitPictureInPicture();
			} else {
				await video.requestPictureInPicture();
			}
		} catch (err) {
			console.error("PiP error:", err);
		}
	}, [videoRef]);

	// Toggle mute
	const toggleMute = useCallback(() => {
		setIsMuted((prev) => !prev);
	}, []);

	// Video event handlers
	const onPlay = useCallback(() => setIsPlaying(true), []);
	const onPause = useCallback(() => {
		setIsPlaying(false);
		setShowControls(true);
	}, []);
	const onTimeUpdate = useCallback((e) => setCurrentTime(e.target.currentTime), []);
	const onDurationChange = useCallback((e) => setDuration(e.target.duration || 0), []);
	const onProgress = useCallback((e) => {
		const video = e.target;
		if (video.buffered.length > 0) {
			setBuffered(video.buffered.end(video.buffered.length - 1));
		}
	}, []);

	// Fullscreen change listener
	useEffect(() => {
		const onFSChange = () => {
			setIsFullscreen(!!document.fullscreenElement);
		};
		document.addEventListener("fullscreenchange", onFSChange);
		return () => document.removeEventListener("fullscreenchange", onFSChange);
	}, []);

	return {
		// State
		isPlaying,
		currentTime,
		duration,
		buffered,
		volume,
		isMuted,
		isFullscreen,
		showControls,
		settingsOpen,
		autoNext,
		autoSkipIntro,
		autoSkipOutro,
		playbackSpeed,
		currentQuality,
		containerRef,

		// Setters
		setVolume,
		setSettingsOpen,
		setAutoNext,
		setAutoSkipIntro,
		setAutoSkipOutro,
		setPlaybackSpeed,
		setCurrentQuality,
		setShowControls,

		// Actions
		togglePlay,
		toggleMute,
		toggleFullscreen,
		togglePiP,
		seek,
		resetControlsTimer,

		// Event Handlers
		onPlay,
		onPause,
		onTimeUpdate,
		onDurationChange,
		onProgress,
	};
}
