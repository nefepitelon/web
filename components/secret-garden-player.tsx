"use client";

import {
  ChevronDown,
  ExternalLink,
  Music2,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./secret-garden-player.module.css";

const POSITION_KEY = "welinkbtc-secret-garden-top:v1";
const VOLUME_KEY = "welinkbtc-secret-garden-volume:v1";
const SOURCE_KEY = "welinkbtc-secret-garden-source:v1";

const TRACKS = [
  ["Nocturne", 193],
  ["Pastorale", 230],
  ["Song From A Secret Garden", 214],
  ["Sigma", 188],
  ["Papillon", 206],
  ["Serenade To Spring", 195],
  ["Atlantia", 179],
  ["Heartstrings", 205],
  ["Adagio", 175],
  ["The Rap", 154],
  ["Chaconne", 207],
  ["Cantoluna", 212],
  ["Ode To Simplicity", 233]
] as const;

const CHAPTERS = TRACKS.map(([title, length], index, entries) => ({
  title,
  length,
  start: entries.slice(0, index).reduce((total, entry) => total + entry[1], 0)
}));

type Chapter = { title: string; length: number; start: number };
type GardenSource = {
  id: string;
  title: string;
  subtitle: string;
  artist: string;
  duration: number;
  mediaId: string;
  articleUrl: string;
  chapters: readonly Chapter[];
};

function chaptersFromStarts(entries: readonly (readonly [string, number])[], duration: number): readonly Chapter[] {
  return entries.map(([title, start], index) => ({
    title,
    start,
    length: Math.max(0, (entries[index + 1]?.[1] ?? duration) - start)
  }));
}

const WHITE_STONES_CHAPTERS = chaptersFromStarts([
  ["Steps 步伐", 0],
  ["Poeme 诗篇", 243.9],
  ["Hymn To Hope 希望赞歌", 544.9],
  ["Moving 流转", 805.5],
  ["First Day Of Spring 初春", 1009.2],
  ["Passacaglia 小曲", 1294.9],
  ["Reflection 倒影", 1522.8],
  ["Windancer 风舞者", 1705.2],
  ["Appassionata 热情", 1934.2],
  ["Escape 遁世", 2199.4],
  ["Sanctuary 圣域", 2412.9],
  ["Celebration 庆典", 2675],
  ["Home 归家", 2913.7],
  ["Illumination 暖光", 3119.9]
] as const, 3375);

const DAWN_CHAPTERS = chaptersFromStarts([
  ["Moongate 月亮门", 0],
  ["Prayer 祈祷", 272.7],
  ["Elan 热忱", 547.1],
  ["Dreamcatcher 追梦人", 739.8],
  ["Sona 梭纳", 1015],
  ["In Our Tears 我们泪盈盈", 1279.1],
  ["Children Of The River 河边的孩子", 1561.4],
  ["Evensong 晚祷", 1796.7],
  ["Lore Of The Loom 隐身的学问", 2060],
  ["Aria 咏叹调", 2262],
  ["Divertimento 嬉戏", 2523.2],
  ["Aquarell 水彩画", 2698.2],
  ["Dawn Of A New Century 新世纪晨曦", 2976.7]
] as const, 3349);

// The supplied WeChat audio ends after track 13, so unavailable album tracks are not exposed as fake chapters.
const DREAMCATCHER_CHAPTERS = chaptersFromStarts([
  ["Nocturne 夜曲", 0],
  ["Prayer 祈祷", 199.1],
  ["Moving 流转", 476.7],
  ["Dreamcatcher 追梦人", 682],
  ["Sigma 西格玛", 961.7],
  ["Song From A Secret Garden 神秘园之歌", 1149.6],
  ["Sona 梭纳", 1365.5],
  ["Passacaglia 小曲", 1629.5],
  ["Elan 热忱", 1858.7],
  ["In Our Tears 我们泪盈盈", 2054],
  ["Celebration 庆典", 2336.1],
  ["Heartstrings 心弦", 2574.7],
  ["Steps 步伐", 2779.9]
] as const, 3030);

const RED_MOON_CHAPTERS = chaptersFromStarts([
  ["Awakening 梦醒时分", 0],
  ["You Raise Me Up 一切因你", 236.3],
  ["Silent Wings 御风展翼", 540.1],
  ["Greenwaves 碧波荡漾", 762.8],
  ["Invitation 盛宴", 1047.9],
  ["Duo 二重奏", 1288.6],
  ["Belonging 珍爱", 1526.4],
  ["Gates Of Dawn 黎明之扉", 1763.7],
  ["The Promise 誓言", 2033.1],
  ["Fairytale 童话", 2235.2],
  ["Once In A Red Moon 忆游红月", 2441.6],
  ["Elegie 挽歌", 2743.4]
] as const, 3076);

// The supplied CD1 audio contains the first 14 tracks in the published order.
const ULTIMATE_CHAPTERS = chaptersFromStarts([
  ["Swan 天鹅", 0],
  ["My Irish Friend 我的爱尔兰朋友", 178.4],
  ["You Raise Me Up 一切因你", 437.2],
  ["Song From A Secret Garden 神秘园之歌", 742.2],
  ["Nocturne 夜曲", 955.8],
  ["Chaconne 恰空舞", 1148.9],
  ["Celebration 庆典", 1355.3],
  ["Passacaglia 小曲", 1593.4],
  ["Prayer 祈祷", 1822.2],
  ["Duo 二重奏", 2102.6],
  ["Moving 流转", 2340.2],
  ["The Rap 庆鼓", 2543.8],
  ["Sigma 西格玛", 2696.4],
  ["The Promise 诺言", 2883.2]
] as const, 3051);

const ULTIMATE_LIVE_CHAPTERS = chaptersFromStarts([
  ["Poeme 诗篇（Live）", 0],
  ["Pastorale 田园曲（Live）", 306.9],
  ["Steps 步伐（Live）", 539.4],
  ["Elan 热忱（Live）", 799.9],
  ["Sona 梭纳（Live）", 1000.3],
  ["Windancer 风舞者（Live）", 1304],
  ["Song From A Secret Garden 神秘园之歌（Live）", 1506.3],
  ["Ode To Simplicity 朴素的赞美诗（Live）", 1655.7],
  ["Dreamcatcher 追梦人（Live）", 1842.9],
  ["Dawn Of A New Century 新世纪的曙光（Live）", 2135.9]
] as const, 2524);

const SOURCES: readonly GardenSource[] = [
  {
    id: "songs-from-a-secret-garden",
    title: "Songs From A Secret Garden",
    subtitle: "飘自神秘园的歌声",
    artist: "Secret Garden",
    duration: 2595,
    mediaId: "MzAwNDk3ODgxOV8yMjQ3NDg0MjYy",
    articleUrl: "https://mp.weixin.qq.com/s/NffDzUnFuBE4P8GBzjE7BQ",
    chapters: CHAPTERS
  },
  {
    id: "white-stones",
    title: "White Stones",
    subtitle: "白石",
    artist: "Secret Garden",
    duration: 3375,
    mediaId: "MzAwNDk3ODgxOV8yMjQ3NDg0MjYz",
    articleUrl: "https://mp.weixin.qq.com/s/rpV91zdHNNeaMqibNgqciw",
    chapters: WHITE_STONES_CHAPTERS
  },
  {
    id: "dawn-of-a-new-century",
    title: "Dawn Of A New Century",
    subtitle: "新世纪的曙光",
    artist: "Secret Garden",
    duration: 3349,
    mediaId: "MzAwNDk3ODgxOV8yMjQ3NDg0MjY0",
    articleUrl: "https://mp.weixin.qq.com/s/xbwRK8w5MdhPQ-kQRGNYew",
    chapters: DAWN_CHAPTERS
  },
  {
    id: "dreamcatcher",
    title: "Dreamcatcher",
    subtitle: "追梦人",
    artist: "Secret Garden",
    duration: 3030,
    mediaId: "MzAwNDk3ODgxOV8yMjQ3NDg0MjY1",
    articleUrl: "https://mp.weixin.qq.com/s/wOQC3NYXcvFcH7qO5MNvhQ",
    chapters: DREAMCATCHER_CHAPTERS
  },
  {
    id: "once-in-a-red-moon",
    title: "Once In A Red Moon",
    subtitle: "忆游红月",
    artist: "Secret Garden",
    duration: 3076,
    mediaId: "MzAwNDk3ODgxOV8yMjQ3NDg0MjY2",
    articleUrl: "https://mp.weixin.qq.com/s/EbNaTmto3TZOsl-bIjmhXw",
    chapters: RED_MOON_CHAPTERS
  },
  {
    id: "ultimate-secret-garden",
    title: "The Ultimate Secret Garden",
    subtitle: "终极神秘园",
    artist: "Secret Garden",
    duration: 3051,
    mediaId: "MzAwNDk3ODgxOV8yMjQ3NDg0MjY3",
    articleUrl: "https://mp.weixin.qq.com/s/tThGK-TPq27E32U_SHdG3Q",
    chapters: ULTIMATE_CHAPTERS
  },
  {
    id: "ultimate-secret-garden-cd2",
    title: "The Ultimate Secret Garden CD2",
    subtitle: "现场演奏",
    artist: "Secret Garden",
    duration: 2524,
    mediaId: "MzAwNDk3ODgxOV8yMjQ3NDg0MjY4",
    articleUrl: "https://mp.weixin.qq.com/s/b2_wqC_E5KEHtm1vTA8n1A",
    chapters: ULTIMATE_LIVE_CHAPTERS
  }
] as const;

function audioUrl(mediaId: string) {
  return `https://res.wx.qq.com/voice/getvoice?mediaid=${mediaId}`;
}

function formatTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return "0:00";
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function clampTop(value: number, expanded: boolean) {
  if (typeof window === "undefined") return value;
  const margin = expanded ? 104 : 52;
  return Math.max(margin, Math.min(window.innerHeight - margin, value));
}

export function SecretGardenPlayer() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({ pointerId: -1, startY: 0, startTop: 0, moved: false });
  const [expanded, setExpanded] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(2595);
  const [volume, setVolume] = useState(0.72);
  const [muted, setMuted] = useState(false);
  const [top, setTop] = useState(720);
  const [sourceError, setSourceError] = useState("");
  const [selectedSourceId, setSelectedSourceId] = useState(SOURCES[0].id);
  const [language, setLanguage] = useState<"zh" | "en">("zh");
  const text = (zh: string, en: string) => language === "en" ? en : zh;

  const selectedSource = useMemo(
    () => SOURCES.find((source) => source.id === selectedSourceId) ?? SOURCES[0],
    [selectedSourceId]
  );
  const chapters = selectedSource.chapters;

  const chapterIndex = useMemo(() => {
    for (let index = chapters.length - 1; index >= 0; index -= 1) {
      if (currentTime >= chapters[index].start) return index;
    }
    return 0;
  }, [chapters, currentTime]);
  const chapter = chapters[chapterIndex];

  useEffect(() => {
    const savedTop = Number(localStorage.getItem(POSITION_KEY));
    const savedVolumeValue = localStorage.getItem(VOLUME_KEY);
    const savedVolume = savedVolumeValue === null ? Number.NaN : Number(savedVolumeValue);
    const savedSource = localStorage.getItem(SOURCE_KEY);
    setLanguage(localStorage.getItem("welinkbtc-language") === "en" ? "en" : "zh");
    setTop(clampTop(Number.isFinite(savedTop) && savedTop > 0 ? savedTop : window.innerHeight - 92, false));
    if (Number.isFinite(savedVolume) && savedVolume >= 0 && savedVolume <= 1) setVolume(savedVolume);
    if (savedSource && SOURCES.some((source) => source.id === savedSource)) setSelectedSourceId(savedSource);
  }, []);

  useEffect(() => {
    const updateLanguage = (event?: Event) => {
      const requested = (event as CustomEvent<{ language?: "zh" | "en" }> | undefined)?.detail?.language;
      setLanguage(requested === "en" || (!requested && localStorage.getItem("welinkbtc-language") === "en") ? "en" : "zh");
    };
    window.addEventListener("welinkbtc:preferences", updateLanguage);
    window.addEventListener("storage", updateLanguage);
    return () => {
      window.removeEventListener("welinkbtc:preferences", updateLanguage);
      window.removeEventListener("storage", updateLanguage);
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    audio.muted = muted;
    localStorage.setItem(VOLUME_KEY, String(volume));
  }, [muted, volume]);

  useEffect(() => {
    const handleResize = () => setTop((value) => clampTop(value, expanded));
    window.addEventListener("resize", handleResize, { passive: true });
    return () => window.removeEventListener("resize", handleResize);
  }, [expanded]);

  const togglePlayback = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    setSourceError("");
    if (audio.paused) {
      try {
        await audio.play();
      } catch {
        setSourceError(text("音频暂时无法播放，请稍后重试或打开原始来源。", "Audio is temporarily unavailable. Please retry or open the original source."));
      }
    } else {
      audio.pause();
    }
  };

  const seekTo = (nextTime: number, shouldPlay = false) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, Math.min(duration || 2595, nextTime));
    setCurrentTime(audio.currentTime);
    if (shouldPlay || !audio.paused) void audio.play().catch(() => setSourceError(text("音频暂时无法继续播放。", "Audio playback could not continue.")));
  };

  const selectChapter = (index: number) => {
    seekTo(chapters[index]?.start ?? 0, true);
  };

  const moveChapter = (direction: -1 | 1) => {
    if (chapters.length > 1) {
      const nextIndex = Math.max(0, Math.min(chapters.length - 1, chapterIndex + direction));
      selectChapter(nextIndex);
      return;
    }
    const sourceIndex = SOURCES.findIndex((source) => source.id === selectedSource.id);
    const nextSourceIndex = (sourceIndex + direction + SOURCES.length) % SOURCES.length;
    selectSource(SOURCES[nextSourceIndex].id);
  };

  const selectSource = (sourceId: string) => {
    const nextSource = SOURCES.find((source) => source.id === sourceId);
    if (!nextSource) return;
    audioRef.current?.pause();
    setSelectedSourceId(nextSource.id);
    setCurrentTime(0);
    setDuration(nextSource.duration);
    setPlaying(false);
    setSourceError("");
    localStorage.setItem(SOURCE_KEY, nextSource.id);
  };

  const startDrag = (event: React.PointerEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest("button,a,input,select")) return;
    dragRef.current = { pointerId: event.pointerId, startY: event.clientY, startTop: top, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveDrag = (event: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (drag.pointerId !== event.pointerId) return;
    const delta = event.clientY - drag.startY;
    if (Math.abs(delta) > 4) drag.moved = true;
    if (!drag.moved) return;
    event.preventDefault();
    setTop(clampTop(drag.startTop + delta, expanded));
  };

  const endDrag = (event: React.PointerEvent<HTMLElement>) => {
    if (dragRef.current.pointerId !== event.pointerId) return;
    localStorage.setItem(POSITION_KEY, String(top));
    dragRef.current.pointerId = -1;
  };

  const openPlayer = () => {
    if (dragRef.current.moved) {
      dragRef.current.moved = false;
      return;
    }
    setTop((value) => clampTop(value, true));
    setExpanded(true);
  };

  return (
    <div
      ref={rootRef}
      className={`${styles.root} ${expanded ? styles.expanded : ""}`}
      style={{ top }}
      aria-label={text("神秘园站内音乐播放器", "Secret Garden site music player")}
    >
      <audio
        key={selectedSource.id}
        ref={audioRef}
        src={audioUrl(selectedSource.mediaId)}
        preload="none"
        crossOrigin="anonymous"
        onLoadedMetadata={(event) => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : selectedSource.duration)}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onError={() => setSourceError(text("该微信公开音频当前不可用，请切换播放源或打开原始来源收听。", "This public audio source is unavailable. Switch sources or open the original page."))}
      />

      {!expanded ? (
        <button
          className={styles.launcher}
          type="button"
          aria-label={text("打开神秘园音乐播放器", "Open Secret Garden music player")}
          aria-expanded="false"
          onClick={openPlayer}
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <span className={`${styles.launcherDisc} ${playing ? styles.spinning : ""}`} aria-hidden="true">
            <Music2 />
          </span>
          <span className={styles.launcherCopy}><strong>{text("神秘园", "Secret Garden")}</strong><small>{playing ? text("正在播放", "Playing") : text("音乐栖息地", "Music sanctuary")}</small></span>
          <i className={playing ? styles.live : ""} aria-hidden="true" />
        </button>
      ) : (
        <section className={styles.panel} aria-label={text("神秘园播放器控制台", "Secret Garden player controls")}>
          <div
            className={styles.dragRail}
            aria-label={text("上下拖动播放器", "Drag player vertically")}
            onPointerDown={startDrag}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <span />
          </div>

          <div className={`${styles.albumArt} ${playing ? styles.albumArtPlaying : ""}`} aria-hidden="true">
            <div className={styles.albumOrbit} />
            <div className={styles.albumDisc}><span>S</span><i /></div>
            <small>WELINKBTC</small>
          </div>

          <div className={styles.info}>
            <div className={styles.eyebrow}><span>SECRET GARDEN</span><i /> <span>ALBUM {SOURCES.findIndex((source) => source.id === selectedSource.id) + 1}/{SOURCES.length}</span></div>
            <h2>{selectedSource.title}</h2>
            <div className={styles.trackLine} aria-live="polite">
              <strong>{String(chapterIndex + 1).padStart(2, "0")}</strong>
              <span>{chapter.title}</span>
              <em>{selectedSource.artist}</em>
            </div>
            <div className={styles.timeline}>
              <span>{formatTime(currentTime)}</span>
              <input
                type="range"
                min="0"
                max={Math.max(1, duration)}
                step="0.1"
                value={Math.min(currentTime, duration)}
                aria-label={text("播放进度", "Playback progress")}
                style={{ "--garden-progress": `${Math.min(100, (currentTime / Math.max(1, duration)) * 100)}%` } as React.CSSProperties}
                onChange={(event) => seekTo(Number(event.target.value))}
              />
              <span>{formatTime(duration)}</span>
            </div>
            <div className={styles.metaRow}>
              <label className={styles.sourceSelect}>
                <span className="sr-only">{text("选择播放源", "Choose audio source")}</span>
                <select aria-label={text("选择播放源", "Choose audio source")} value={selectedSource.id} onChange={(event) => selectSource(event.target.value)}>
                  {SOURCES.map((source, index) => (
                    <option key={source.id} value={source.id}>{String(index + 1).padStart(2, "0")} · {source.title}｜{source.subtitle}</option>
                  ))}
                </select>
              </label>
              <label className={styles.chapterSelect}>
                <span className="sr-only">{text("选择章节", "Choose track")}</span>
                <select value={chapterIndex} onChange={(event) => selectChapter(Number(event.target.value))}>
                  {chapters.map((item, index) => (
                    <option key={item.title} value={index}>{String(index + 1).padStart(2, "0")} · {item.title}</option>
                  ))}
                </select>
              </label>
              <a href={selectedSource.articleUrl} target="_blank" rel="noreferrer noopener">
                {text("来源", "Source")} <ExternalLink aria-hidden="true" />
              </a>
            </div>
            {sourceError ? <p className={styles.error} role="status">{sourceError}</p> : null}
          </div>

          <div className={styles.controls}>
            <div className={styles.transport}>
              <button type="button" aria-label={text("上一首", "Previous track")} onClick={() => moveChapter(-1)}><SkipBack /></button>
              <button type="button" aria-label={text("后退十秒", "Back 10 seconds")} onClick={() => seekTo(currentTime - 10)}><RotateCcw /><small>10</small></button>
              <button className={styles.playButton} type="button" aria-label={playing ? text("暂停", "Pause") : text("播放", "Play")} onClick={togglePlayback}>
                {playing ? <Pause /> : <Play />}
              </button>
              <button type="button" aria-label={text("前进十秒", "Forward 10 seconds")} onClick={() => seekTo(currentTime + 10)}><RotateCw /><small>10</small></button>
              <button type="button" aria-label={text("下一首", "Next track")} onClick={() => moveChapter(1)}><SkipForward /></button>
            </div>
            <div className={styles.volumeControl}>
              <button type="button" aria-label={muted ? text("恢复声音", "Unmute") : text("静音", "Mute")} onClick={() => setMuted((value) => !value)}>
                {muted || volume === 0 ? <VolumeX /> : <Volume2 />}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={muted ? 0 : volume}
                aria-label={text("音量", "Volume")}
                onChange={(event) => { setMuted(false); setVolume(Number(event.target.value)); }}
              />
            </div>
            <button className={styles.collapse} type="button" aria-label={text("收起播放器", "Collapse player")} onClick={() => setExpanded(false)}>
              <ChevronDown />
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
