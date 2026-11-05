import React, { useCallback, useEffect, useRef, useState } from 'react';
import { LoaderCircle, Maximize, Minimize, Pause, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react';

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
  const pauseTimer = useRef<number | null>(null);

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
  const [rate, setRate] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [dragging, setDragging] = useState(false);

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
  }, [src]);

  useEffect(() => {
    const onFullscreenChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  useEffect(() => () => {
    if (pauseTimer.current !== null) window.clearTimeout(pauseTimer.current);
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
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else void wrap.requestFullscreen?.().catch(() => undefined);
  };

  const cycleRate = () => {
    const node = mediaRef.current;
    const next = RATES[(RATES.indexOf(rate) + 1) % RATES.length];
    setRate(next);
    if (node) node.playbackRate = next;
  };

  const loadingLabel = !ready && started ? 'در حال بارگذاری…' : buffering ? 'در حال دریافت ادامهٔ فایل…' : '';
  const mediaClass = kind === 'video'
    ? 'block h-auto max-h-[62dvh] w-full bg-black object-contain'
    : 'hidden';

  return (
    <div className={`space-y-2 ${className}`}>
      <div
        ref={wrapRef}
        dir="ltr"
        onPointerEnter={warmUp}
        onFocus={warmUp}
        className={
          kind === 'video'
            ? 'relative overflow-hidden rounded-2xl border border-slate-200 bg-black'
            : 'relative rounded-2xl border border-slate-200 bg-white p-3 shadow-xs'
        }
      >
        <video
          ref={mediaRef as React.RefObject<HTMLVideoElement>}
          src={src}
          poster={poster}
          preload={preload}
          playsInline
          controls={false}
          className={mediaClass}
          onClick={kind === 'video' ? toggle : undefined}
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
          onEnded={() => { setPlaying(false); setCurrent(duration); }}
          onError={() => { setFailed(true); setBuffering(false); setPlaying(false); onError?.(); }}
          aria-label={title ? `پخش ${title}` : 'پخش‌کنندهٔ رسانه'}
        />

        {/* صدا فایل تصویری ندارد؛ یک پخش‌کنندهٔ صوتی مستقل همان عنصر را کنترل می‌کند. */}
        {kind === 'audio' && (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggle}
              aria-label={playing ? 'توقف پخش' : 'شروع پخش'}
              title={playing ? 'توقف' : 'پخش'}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white shadow-xs transition hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
            >
              {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 translate-x-[1px]" />}
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold text-slate-800">{title || 'فایل صوتی'}</p>
              <p className="mt-0.5 text-[10px] font-medium text-slate-500">
                {loadingLabel || (started ? 'بارگیری همراه پخش انجام می‌شود.' : 'برای شروع، دکمهٔ پخش را بزنید.')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                const node = mediaRef.current;
                if (!node) return;
                node.muted = !node.muted;
                setMuted(node.muted);
              }}
              aria-label={muted ? 'روشن کردن صدا' : 'بی‌صدا'}
              className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100"
            >
              {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={cycleRate}
              aria-label={`سرعت پخش: ${rate}`}
              title="سرعت پخش"
              className="rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-black text-slate-600 transition hover:bg-slate-50"
            >
              ×{rate.toLocaleString('fa-IR')}
            </button>
          </div>
        )}

        {/* کنترل بارگیری/خطا روی هر دو نوع پخش‌کننده. */}
        {kind === 'video' && (loadingLabel || !started) && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-950/45 text-white">
            {loadingLabel ? <LoaderCircle className="h-6 w-6 animate-spin" aria-hidden /> : <Play className="h-8 w-8 opacity-90" aria-hidden />}
            <span className="text-[11px] font-bold">{loadingLabel || 'برای پخش کلیک کنید'}</span>
          </div>
        )}

        {failed && (
          <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-950/70 p-4 text-center text-white">
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

        {/* نوار زمان با بازهٔ بارگیری‌شده: کاربر می‌بیند چقدر جلوتر آماده است. */}
        <div className={kind === 'audio' ? 'mt-2.5' : 'absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/85 to-transparent px-3 pb-2 pt-6'}>
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
            onPointerUp={() => setDragging(false)}
            onPointerCancel={() => setDragging(false)}
            className="group relative h-2 w-full cursor-pointer touch-none rounded-full bg-slate-200/90 outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
          >
            <span aria-hidden className="absolute inset-y-0 left-0 rounded-full bg-slate-300" style={{ width: `${bufferedPercent}%` }} />
            <span aria-hidden className="absolute inset-y-0 left-0 rounded-full bg-indigo-600" style={{ width: `${progressPercent}%` }} />
            <span
              aria-hidden
              className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-indigo-600 shadow-xs"
              style={{ left: `${progressPercent}%` }}
            />
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[10px] font-bold" dir="ltr">
            <span className={kind === 'audio' ? 'text-slate-500' : 'text-white/90'}>{clock(current)} / {clock(duration)}</span>
            <span className="flex items-center gap-1.5">
              {kind === 'video' && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      const node = mediaRef.current;
                      if (!node) return;
                      node.muted = !node.muted;
                      setMuted(node.muted);
                    }}
                    aria-label={muted ? 'روشن کردن صدا' : 'بی‌صدا'}
                    className="rounded-md p-1 text-white/90 transition hover:bg-white/15"
                  >
                    {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={toggleFullscreen}
                    aria-label={fullscreen ? 'خروج از تمام‌صفحه' : 'تمام‌صفحه'}
                    className="rounded-md p-1 text-white/90 transition hover:bg-white/15"
                  >
                    {fullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
                  </button>
                </>
              )}
              {kind === 'video' && (
                <button
                  type="button"
                  onClick={cycleRate}
                  aria-label={`سرعت پخش: ${rate}`}
                  className="rounded-md border border-white/30 px-1.5 py-0.5 text-[9px] font-black text-white/90 transition hover:bg-white/15"
                >
                  ×{rate.toLocaleString('fa-IR')}
                </button>
              )}
            </span>
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
