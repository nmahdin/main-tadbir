import React, { useCallback, useEffect, useRef, useState } from 'react';
import { LoaderCircle, Maximize, Minimize, Pause, Play, RotateCcw, Volume1, Volume2, VolumeX } from 'lucide-react';

type MediaKind = 'audio' | 'video';

type MediaPlayerProps = {
  src: string;
  kind: MediaKind;
  title?: string;
  poster?: string;
  className?: string;
  /** متن زیر پخش‌کننده برای توضیح رفتار بارگیری (پیش‌فرض روشن). */
  footnote?: boolean;
  onReady?: () => void;
  onError?: () => void;
};

/** زمان را با ارقام فارسی و قالب «دقیقه:ثانیه» می‌نویسد. */
const clock = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds <= 0) return '۰:۰۰';
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  const fa = (value: number, pad = 1) => value.toLocaleString('fa-IR', { useGrouping: false, minimumIntegerDigits: pad });
  return `${fa(minutes)}:${fa(rest, 2)}`;
};

const RATES = [1, 1.25, 1.5, 2, 0.75];

/** چند میلی‌ثانیه بعد از شروع پخش، نوار کنترل پنهان می‌شود. */
const CONTROLS_HIDE_MS = 2600;

/**
 * پخش‌کنندهٔ اختصاصی صدا و ویدیو با «بارگیری وابسته به پخش».
 *
 * چرا پخش‌کنندهٔ پیش‌فرض کافی نبود: پخش‌کنندهٔ پیش‌فرض مرورگر ظاهر سیستم‌عامل را
 * می‌آورد و رفتار بارگیری‌اش قابل کنترل نیست؛ فایل از همان لحظهٔ باز‌شدن مدال
 * شروع به دانلود می‌کرد. اینجا:
 *
 * - **هیچ بایتی پیش از قصد کاربر** گرفته نمی‌شود (`preload="none"`). با هاور یا
 *   فوکوس فقط سرصفحهٔ فایل (فراداده) خوانده می‌شود تا مدت زمان معلوم شود.
 * - با زدن پخش، `preload="auto"` می‌شود و مرورگر **همراه با پیشرفت پخش** و با
 *   درخواست‌های بازه‌ای (Range) بارگیری می‌کند؛ سرور هم پاسخ ۲۰۶ می‌دهد.
 * - با توقف پخش، `preload="none"` برمی‌گردد تا بارگیری ادامه پیدا نکند؛ پس از
 *   توقف، هیچ داده‌ای برای بخش‌های جلوتر گرفته نمی‌شود.
 * - جابه‌جایی روی نوار زمان هم فقط همان بازه را می‌خواهد، نه کل فایل.
 *
 * نکات تجربهٔ کاربری این نسخه:
 * - دکمهٔ پخش/توقف هم در نوار پایین هست و هم به‌صورت دکمهٔ بزرگ در مرکز ویدیو
 *   دیده می‌شود؛ پس در حالت «متوقف» هیچ‌وقت ویدیویی بدون دکمهٔ پخش نمی‌ماند.
 * - نوار کنترل چند ثانیه پس از شروع پخش خودکار پنهان می‌شود تا تصویر کامل دیده
 *   شود و با حرکت نشانگر/فوکوس/توقف دوباره برمی‌گردد.
 * - تا آماده‌شدن فراداده، نشانگر چرخان «در حال آماده‌سازی/بارگذاری» نمایش داده
 *   می‌شود تا کادر سیاه بی‌توضیح نماند.
 * - بلندی صدا با یک منوی شناور بالای دکمهٔ بلندگو (بی‌صدا/کم/زیاد) تنظیم می‌شود
 *   و دکمهٔ سرعت پخش مربعی/گرد و خوانا است.
 * - در تمام‌صفحه، خودِ کادر پخش تمام‌صفحه می‌شود و ویدیو کل صفحه را پر می‌کند
 *   (پیش‌تر ارتفاع ثابت `62dvh` باقی می‌ماند و تصویر کوچک می‌شد).
 */
export function MediaPlayer({
  src,
  kind,
  title,
  poster,
  className = '',
  footnote = false,
  onReady,
  onError,
}: MediaPlayerProps) {
  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);
  const volumeRef = useRef<HTMLDivElement | null>(null);
  const pauseTimer = useRef<number | null>(null);
  const hideTimer = useRef<number | null>(null);

  const [preload, setPreload] = useState<'none' | 'metadata' | 'auto'>('none');
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [started, setStarted] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [volumeOpen, setVolumeOpen] = useState(false);
  const [rate, setRate] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);

  const isVideo = kind === 'video';

  useEffect(() => {
    setPlaying(false);
    setBuffering(false);
    setStarted(false);
    setReady(false);
    setFailed(false);
    setCurrent(0);
    setDuration(0);
    setBuffered(0);
    setPreload('none');
    setControlsVisible(true);
  }, [src]);

  useEffect(() => {
    const onFullscreenChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  useEffect(() => () => {
    if (pauseTimer.current !== null) window.clearTimeout(pauseTimer.current);
    if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
  }, []);

  /**
   * بارگیری فقط تا وقتی پخش در جریان است.
   * کمی صبر می‌کنیم تا جابه‌جایی‌های کوتاه (seek/توقف گذرا) باعث قطع و وصل
   * پشت‌سرهم شبکه نشوند.
   */
  useEffect(() => {
    if (pauseTimer.current !== null) window.clearTimeout(pauseTimer.current);
    if (playing) {
      setPreload('auto');
      return;
    }
    if (!started) {
      setPreload('none');
      return;
    }
    pauseTimer.current = window.setTimeout(() => setPreload('none'), 600);
    return () => {
      if (pauseTimer.current !== null) window.clearTimeout(pauseTimer.current);
    };
  }, [playing, started]);

  /** پیش‌بارگذاری سبک با قصد کاربر: فقط فراداده، نه بایت‌های رسانه. */
  const warmUp = () => {
    if (preload === 'none' && !started) setPreload('metadata');
  };

  /**
   * نمایش نوار کنترل و زمان‌بندی پنهان‌شدن آن.
   * فقط هنگام پخش پنهان می‌شود؛ در حالت توقف، جابه‌جایی روی نوار و منوی صدا
   * باز، نوار همیشه می‌ماند.
   */
  const revealControls = useCallback(() => {
    if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
    hideTimer.current = null;
    setControlsVisible(true);
    if (!playing || dragging || volumeOpen) return;
    hideTimer.current = window.setTimeout(() => setControlsVisible(false), CONTROLS_HIDE_MS);
  }, [playing, dragging, volumeOpen]);

  useEffect(() => {
    revealControls();
    return () => {
      if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
      hideTimer.current = null;
    };
  }, [revealControls]);

  const toggle = useCallback(() => {
    const node = mediaRef.current;
    if (!node) return;
    if (node.paused) {
      setStarted(true);
      setPreload('auto');
      setFailed(false);
      const attempt = node.play();
      if (attempt && typeof attempt.catch === 'function') {
        attempt.catch(() => {
          setFailed(true);
          setPlaying(false);
        });
      }
      return;
    }
    node.pause();
  }, []);

  const seekTo = useCallback((seconds: number) => {
    const node = mediaRef.current;
    if (!node || !Number.isFinite(seconds)) return;
    const clamped = Math.min(Math.max(seconds, 0), duration || seconds);
    node.currentTime = clamped;
    setCurrent(clamped);
  }, [duration]);

  const seekFromPointer = useCallback((clientX: number) => {
    const bar = barRef.current;
    if (!bar || !duration) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
    seekTo(ratio * duration);
  }, [duration, seekTo]);

  /** بلندی صدا؛ صفر یعنی بی‌صدا. */
  const applyVolume = useCallback((next: number) => {
    const node = mediaRef.current;
    const clamped = Math.min(1, Math.max(0, next));
    setVolume(clamped);
    setMuted(clamped === 0);
    if (node) {
      node.volume = clamped;
      node.muted = clamped === 0;
    }
  }, []);

  const toggleMute = useCallback(() => {
    const node = mediaRef.current;
    if (!node) return;
    const nextMuted = !node.muted;
    node.muted = nextMuted;
    if (!nextMuted && node.volume === 0) {
      node.volume = 0.6;
      setVolume(0.6);
    }
    setMuted(nextMuted);
  }, []);

  // منوی بلندی صدا با کلیک بیرون یا Escape بسته می‌شود.
  useEffect(() => {
    if (!volumeOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (volumeRef.current && !volumeRef.current.contains(event.target as Node)) setVolumeOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setVolumeOpen(false); };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [volumeOpen]);

  const progressPercent = duration > 0 ? Math.min(100, (current / duration) * 100) : 0;
  const bufferedPercent = duration > 0 ? Math.min(100, (buffered / duration) * 100) : 0;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 30 : 5;
    if (event.key === 'ArrowRight') { event.preventDefault(); seekTo(current + step); }
    else if (event.key === 'ArrowLeft') { event.preventDefault(); seekTo(current - step); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); seekTo(current + 1); }
    else if (event.key === 'ArrowDown') { event.preventDefault(); seekTo(current - 1); }
    else if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); toggle(); }
  };

  const toggleFullscreen = () => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    if (document.fullscreenElement) { void document.exitFullscreen().catch(() => undefined); return; }
    if (typeof wrap.requestFullscreen === 'function') {
      void wrap.requestFullscreen().catch(() => undefined);
      return;
    }
    // iOS Safari فقط تمام‌صفحهٔ بومی عنصر ویدیو را پشتیبانی می‌کند.
    const node = mediaRef.current as (HTMLMediaElement & { webkitEnterFullscreen?: () => void }) | null;
    node?.webkitEnterFullscreen?.();
  };

  const cycleRate = () => {
    const node = mediaRef.current;
    const next = RATES[(RATES.indexOf(rate) + 1) % RATES.length];
    setRate(next);
    if (node) node.playbackRate = next;
  };

  const loadingLabel = !ready && started ? 'در حال بارگذاری…' : buffering ? 'در حال دریافت ادامهٔ فایل…' : '';
  const videoClass = `block w-full bg-black object-contain ${fullscreen ? 'h-full max-h-none' : 'h-auto max-h-[62dvh]'}`;
  const audioStatus = loadingLabel
    || (started ? (playing ? 'در حال پخش…' : 'پخش متوقف شد؛ برای ادامه دکمهٔ پخش را بزنید.') : 'برای شروع، دکمهٔ پخش را بزنید.');

  /** رنگ‌های نوار کنترل: روی ویدیوِ تیره و روی کارت روشن صدا فرق دارند. */
  const iconButton = `flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition ${
    isVideo ? 'text-white/90 hover:bg-white/15' : 'text-slate-500 hover:bg-slate-100'
  }`;
  const timeText = isVideo ? 'text-white/90' : 'text-slate-500';
  const trackClass = isVideo ? 'bg-white/25' : 'bg-slate-200/90';
  const bufferClass = isVideo ? 'bg-white/40' : 'bg-slate-300';
  const knobClass = isVideo ? 'border-slate-900/70 bg-indigo-400' : 'border-white bg-indigo-600';

  const volumeIcon = muted || volume === 0
    ? <VolumeX className="h-4 w-4" />
    : volume < 0.5
      ? <Volume1 className="h-4 w-4" />
      : <Volume2 className="h-4 w-4" />;

  return (
    <div className={`space-y-2 ${className}`}>
      <div
        ref={wrapRef}
        dir="ltr"
        onPointerEnter={warmUp}
        onPointerMove={revealControls}
        onFocus={warmUp}
        onFocusCapture={revealControls}
        data-fullscreen={fullscreen ? 'true' : undefined}
        className={
          isVideo
            ? 'ui-media-stage relative flex items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-black'
            : 'ui-media-stage relative rounded-2xl border border-slate-200 bg-white p-3 shadow-xs'
        }
      >
        <video
          ref={mediaRef as React.RefObject<HTMLVideoElement>}
          src={src}
          poster={poster}
          preload={preload}
          playsInline
          controls={false}
          className={isVideo ? videoClass : 'hidden'}
          onClick={isVideo ? toggle : undefined}
          onLoadedMetadata={event => {
            setDuration(event.currentTarget.duration || 0);
            setReady(true);
            onReady?.();
          }}
          onCanPlay={() => { setReady(true); onReady?.(); }}
          onPlaying={() => { setPlaying(true); setBuffering(false); setStarted(true); setReady(true); }}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onWaiting={() => setBuffering(true)}
          onTimeUpdate={event => setCurrent(event.currentTarget.currentTime)}
          onProgress={event => {
            const ranges = event.currentTarget.buffered;
            if (ranges.length > 0) setBuffered(ranges.end(ranges.length - 1));
          }}
          onEnded={() => { setPlaying(false); setCurrent(duration); setControlsVisible(true); }}
          onError={() => { setFailed(true); setBuffering(false); setPlaying(false); onError?.(); }}
          onVolumeChange={event => {
            const node = event.currentTarget;
            setMuted(node.muted);
            setVolume(node.volume);
          }}
          aria-label={title ? `پخش ${title}` : 'پخش‌کنندهٔ رسانه'}
        />

        {/*
          ویدیو دو حالت مرکزی دارد:
          ۱) تا آماده‌شدن (پس از زدن پخش) نشانگر چرخان لودینگ، تا کادر سیاه
             بی‌توضیح نماند؛
          ۲) در حالت توقف، دکمهٔ بزرگ پخش/ادامه — پیش از شروع هم همین دکمه
             دیده می‌شود تا کاربر بداند باید چه کند (نه اسپینر بی‌پایان).
        */}
        {isVideo && !failed && started && !ready && (
          <div role="status" aria-live="polite" className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-slate-950/40 text-white">
            <LoaderCircle className="h-7 w-7 animate-spin" aria-hidden />
            <span className="text-[11px] font-black">در حال بارگذاری ویدیو…</span>
          </div>
        )}
        {isVideo && !failed && !playing && (!started || ready) && (
          <button
            type="button"
            onClick={toggle}
            aria-label={current > 0 ? 'ادامهٔ پخش ویدیو' : 'پخش ویدیو'}
            title={current > 0 ? 'ادامهٔ پخش' : 'پخش'}
            className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-slate-950/20 text-white transition hover:bg-slate-950/30"
          >
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/95 text-slate-900 shadow-xl transition hover:scale-105">
              <Play className="ms-0.5 h-7 w-7" aria-hidden />
            </span>
            <span className="text-[11px] font-black">{current > 0 ? 'ادامهٔ پخش' : 'پخش ویدیو'}</span>
          </button>
        )}
        {isVideo && playing && buffering && (
          <span className="pointer-events-none absolute left-3 top-3 z-20 inline-flex items-center gap-1.5 rounded-lg bg-slate-950/70 px-2 py-1 text-[10px] font-bold text-white">
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden />
            در حال دریافت…
          </span>
        )}

        {/* صدا: عنوان و وضعیت پخش بالای نوار کنترل. */}
        {!isVideo && (
          <div className="flex items-center gap-3" dir="rtl">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
              {(!ready && started) || buffering
                ? <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden />
                : <Volume2 className="h-5 w-5" aria-hidden />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold text-slate-800">{title || 'فایل صوتی'}</p>
              <p className="mt-0.5 text-[10px] font-medium text-slate-500">{audioStatus}</p>
            </div>
          </div>
        )}

        {failed && (
          <div role="alert" className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-2 bg-slate-950/70 p-4 text-center text-white">
            <span className="text-[11px] font-bold leading-6">پخش این فایل ممکن نشد؛ اتصال یا مجوز دسترسی را بررسی کنید.</span>
            <button
              type="button"
              onClick={() => { setFailed(false); setReady(false); mediaRef.current?.load(); }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/95 px-2.5 py-1.5 text-[10px] font-bold text-slate-800"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              تلاش دوباره
            </button>
          </div>
        )}

        {/*
          نوار کنترل: نوار زمان + دکمهٔ پخش/توقف + زمان + بلندی صدا + سرعت + تمام‌صفحه.
          روی ویدیو با گرادیان پایین می‌نشیند و هنگام پخش خودکار پنهان می‌شود.
        */}
        <div
          data-visible={isVideo ? (controlsVisible ? 'true' : 'false') : 'true'}
          onPointerEnter={revealControls}
          className={
            isVideo
              ? `ui-media-controls absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-slate-950/90 via-slate-950/45 to-transparent px-3 pb-2 pt-8 transition-all duration-200 ${controlsVisible ? 'opacity-100' : 'pointer-events-none translate-y-2 opacity-0'}`
              : 'ui-media-controls mt-2.5'
          }
        >
          <div
            ref={barRef}
            role="slider"
            tabIndex={0}
            aria-label="جای پخش"
            aria-valuemin={0}
            aria-valuemax={Math.round(duration)}
            aria-valuenow={Math.round(current)}
            aria-valuetext={clock(current)}
            onKeyDown={handleKeyDown}
            onPointerDown={event => {
              event.currentTarget.setPointerCapture(event.pointerId);
              setDragging(true);
              seekFromPointer(event.clientX);
            }}
            onPointerMove={event => { if (dragging) seekFromPointer(event.clientX); }}
            onPointerUp={() => { setDragging(false); revealControls(); }}
            onPointerCancel={() => setDragging(false)}
            className={`group relative h-2 w-full cursor-pointer touch-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${trackClass}`}
          >
            <span aria-hidden className={`absolute inset-y-0 left-0 rounded-full ${bufferClass}`} style={{ width: `${bufferedPercent}%` }} />
            <span aria-hidden className="absolute inset-y-0 left-0 rounded-full bg-indigo-500" style={{ width: `${progressPercent}%` }} />
            <span
              aria-hidden
              className={`absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 shadow-xs ${knobClass}`}
              style={{ left: `${progressPercent}%` }}
            />
          </div>

          <div className="mt-1.5 flex items-center gap-1.5" dir="ltr">
            <button
              type="button"
              onClick={toggle}
              aria-label={playing ? 'توقف پخش' : 'شروع پخش'}
              title={playing ? 'توقف' : 'پخش'}
              className={
                isVideo
                  ? iconButton
                  : 'flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white shadow-xs transition hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500'
              }
            >
              {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 translate-x-[1px]" />}
            </button>

            <span className={`text-[10px] font-bold tabular-nums ${timeText}`}>{clock(current)} / {clock(duration)}</span>

            <span className="flex-1" />

            <div className="relative" ref={volumeRef}>
              <button
                type="button"
                onClick={() => setVolumeOpen(open => !open)}
                aria-label="بلندی صدا"
                aria-expanded={volumeOpen}
                aria-haspopup="dialog"
                title="بلندی صدا"
                className={iconButton}
              >
                {volumeIcon}
              </button>
              {volumeOpen && (
                <div
                  role="dialog"
                  aria-label="تنظیم بلندی صدا"
                  dir="rtl"
                  className="absolute bottom-full right-0 z-30 mb-2 w-48 rounded-2xl border border-slate-200 bg-white p-2.5 text-slate-800 shadow-xl"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-black text-slate-600">بلندی صدا</span>
                    <span className="text-[10px] font-black text-indigo-700">
                      {(muted ? 0 : Math.round(volume * 100)).toLocaleString('fa-IR')}٪
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    dir="ltr"
                    value={muted ? 0 : Math.round(volume * 100)}
                    onChange={event => applyVolume(Number(event.target.value) / 100)}
                    aria-label="میزان بلندی صدا"
                    className="ui-volume mt-2 w-full accent-indigo-600"
                  />
                  <button
                    type="button"
                    onClick={toggleMute}
                    className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-bold text-slate-700 transition hover:bg-slate-50"
                  >
                    {muted ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
                    {muted ? 'فعال کردن صدا' : 'بی‌صدا کردن'}
                  </button>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={cycleRate}
              aria-label={`سرعت پخش: ${rate}`}
              title="سرعت پخش"
              className={`flex h-8 min-w-8 shrink-0 items-center justify-center rounded-lg px-1 text-[10px] font-black transition ${
                isVideo
                  ? 'border border-white/30 text-white/90 hover:bg-white/15'
                  : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              ×{rate.toLocaleString('fa-IR')}
            </button>

            {isVideo && (
              <button
                type="button"
                onClick={toggleFullscreen}
                aria-label={fullscreen ? 'خروج از تمام‌صفحه' : 'تمام‌صفحه'}
                title={fullscreen ? 'خروج از تمام‌صفحه' : 'تمام‌صفحه'}
                className={iconButton}
              >
                {fullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
              </button>
            )}
          </div>
        </div>
      </div>
      {footnote && (
        <p className="text-[10px] leading-5 text-slate-400">
          بارگیری فایل همراه پخش انجام می‌شود؛ هرچه پخش جلوتر برود بخش‌های بیشتری آماده می‌شود و با توقف پخش، بارگیری هم متوقف می‌شود.
        </p>
      )}
    </div>
  );
}
