import React, { useState, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { 
  X, 
  Download, 
  Share2, 
  Star, 
  Info, 
  History, 
  ZoomIn, 
  ZoomOut, 
  RotateCw, 
  Maximize2, 
  Play, 
  Pause, 
  Volume2, 
  VolumeX, 
  ChevronRight, 
  ChevronLeft,
  FileText,
  Layers,
  FolderTree,
  ExternalLink,
  CheckCircle2,
  FileSpreadsheet,
  FileCode,
  Music,
  Video as VideoIcon
} from 'lucide-react';

export const AssetPreviewModal: React.FC = () => {
  const {
    previewAssetId,
    setPreviewAssetId,
    assets,
    setDetailAssetId,
    setVersionModalAssetId,
    setShareTargetAssetId,
    toggleAssetFavorite,
    downloadAsset,
    users,
    projects
  } = useApp();

  // Image controls
  const [zoomLevel, setZoomLevel] = useState(1);
  const [rotation, setRotation] = useState(0);

  // Audio / Video controls
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Document page viewer
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = 12;

  if (!previewAssetId) return null;

  const asset = assets.find(a => a.id === previewAssetId);
  if (!asset) return null;

  const creator = users.find(u => u.id === asset.createdBy);
  const project = projects.find(p => p.id === asset.projectId);

  const handleClose = () => {
    setPreviewAssetId(null);
    setZoomLevel(1);
    setRotation(0);
    setIsPlaying(false);
  };

  const handleVideoToggle = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleAudioToggle = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const renderContent = () => {
    switch (asset.category) {
      case 'image':
        return (
          <div className="relative w-full h-full flex items-center justify-center p-6 bg-slate-950/80 overflow-hidden select-none">
            <div
              className="transition-transform duration-200 flex items-center justify-center max-w-full max-h-full"
              style={{
                transform: `scale(${zoomLevel}) rotate(${rotation}deg)`
              }}
            >
              <img
                src={asset.url}
                alt={asset.title}
                referrerPolicy="no-referrer"
                className="max-h-[70vh] max-w-full object-contain rounded-lg shadow-2xl"
              />
            </div>

            {/* Floating Image Toolbar */}
            <div className="absolute bottom-6 inset-x-0 flex justify-center z-10 pointer-events-none">
              <div className="pointer-events-auto inline-flex items-center gap-1.5 p-1.5 bg-slate-900/90 text-white rounded-2xl border border-slate-700/60 shadow-xl backdrop-blur-md text-xs">
                <button
                  onClick={() => setZoomLevel(prev => Math.min(prev + 0.25, 3))}
                  className="p-2 rounded-xl hover:bg-slate-800 transition-colors text-slate-300 hover:text-white"
                  title="بزرگ‌نمایی"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <span className="text-[11px] font-mono px-2 font-bold text-slate-300">
                  {Math.round(zoomLevel * 100)}%
                </span>
                <button
                  onClick={() => setZoomLevel(prev => Math.max(prev - 0.25, 0.5))}
                  className="p-2 rounded-xl hover:bg-slate-800 transition-colors text-slate-300 hover:text-white"
                  title="کوچک‌نمایی"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <div className="w-px h-4 bg-slate-700 mx-1" />
                <button
                  onClick={() => setRotation(prev => (prev + 90) % 360)}
                  className="p-2 rounded-xl hover:bg-slate-800 transition-colors text-slate-300 hover:text-white"
                  title="چرخش ۹۰ درجه"
                >
                  <RotateCw className="w-4 h-4" />
                </button>
                <button
                  onClick={() => { setZoomLevel(1); setRotation(0); }}
                  className="px-2.5 py-1 rounded-xl text-[11px] font-medium hover:bg-slate-800 text-slate-300 hover:text-white"
                >
                  ریست
                </button>
              </div>
            </div>
          </div>
        );

      case 'video':
        return (
          <div className="relative w-full h-full flex flex-col items-center justify-center p-6 bg-slate-950/90">
            <div className="relative w-full max-w-4xl aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl border border-slate-800">
              <video
                ref={videoRef}
                src={asset.url}
                className="w-full h-full object-contain"
                onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                onEnded={() => setIsPlaying(false)}
              />

              {/* Custom Video Controls Overlay */}
              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent p-4 flex flex-col gap-2">
                {/* Progress Bar */}
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={currentTime ? (currentTime % 100) : 0}
                  onChange={(e) => {
                    if (videoRef.current) {
                      videoRef.current.currentTime = (parseFloat(e.target.value) / 100) * (videoRef.current.duration || 60);
                    }
                  }}
                  className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                />

                <div className="flex items-center justify-between text-white text-xs">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleVideoToggle}
                      className="p-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white transition-colors cursor-pointer"
                    >
                      {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-white" />}
                    </button>

                    <button
                      onClick={() => {
                        if (videoRef.current) {
                          videoRef.current.muted = !isMuted;
                          setIsMuted(!isMuted);
                        }
                      }}
                      className="p-1.5 text-slate-300 hover:text-white"
                    >
                      {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                    </button>

                    <span className="text-[11px] font-mono text-slate-300">
                      {asset.duration || '۰۳:۴۵'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <select
                      value={playbackSpeed}
                      onChange={(e) => {
                        const speed = parseFloat(e.target.value);
                        setPlaybackSpeed(speed);
                        if (videoRef.current) videoRef.current.playbackRate = speed;
                      }}
                      className="bg-slate-800 text-slate-300 rounded-lg px-2 py-1 text-[11px] border border-slate-700"
                    >
                      <option value="0.75">0.75x</option>
                      <option value="1">1.0x</option>
                      <option value="1.25">1.25x</option>
                      <option value="1.5">1.5x</option>
                      <option value="2">2.0x</option>
                    </select>

                    <button
                      onClick={() => {
                        if (videoRef.current?.requestFullscreen) {
                          videoRef.current.requestFullscreen();
                        }
                      }}
                      className="p-1.5 text-slate-300 hover:text-white"
                      title="تمام‌صفحه"
                    >
                      <Maximize2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      case 'audio':
        return (
          <div className="w-full h-full flex flex-col items-center justify-center p-8 bg-slate-900 text-white">
            <div className="w-full max-w-lg p-6 rounded-3xl bg-slate-800/90 border border-slate-700/80 shadow-2xl flex flex-col items-center gap-6">
              {/* Vinyl / Cover Art */}
              <div className="w-32 h-32 rounded-2xl bg-gradient-to-tr from-amber-500 to-indigo-600 p-1 flex items-center justify-center shadow-xl relative overflow-hidden">
                <Music className="w-14 h-14 text-white animate-pulse" />
              </div>

              <div className="text-center">
                <h3 className="font-bold text-base text-white">{asset.title}</h3>
                <p className="text-xs font-mono text-slate-400 mt-1">{asset.fileName}</p>
              </div>

              {/* Waveform Visualizer */}
              <div className="w-full flex items-center justify-center gap-1 h-12 px-4">
                {[35, 60, 40, 85, 95, 45, 30, 70, 90, 100, 75, 45, 60, 85, 40, 65, 90, 50, 30, 80, 60, 40, 75, 95, 35, 55, 70, 90, 45].map((h, i) => (
                  <div
                    key={i}
                    className={`w-1.5 rounded-full transition-all duration-300 ${
                      isPlaying ? 'bg-indigo-400' : 'bg-slate-600'
                    }`}
                    style={{
                      height: isPlaying ? `${Math.max(15, (h * (Math.sin(i + currentTime) + 1.2)) / 2)}%` : `${h * 0.5}%`
                    }}
                  />
                ))}
              </div>

              {/* Hidden HTML5 Audio */}
              <audio
                ref={audioRef}
                src={asset.url}
                onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                onEnded={() => setIsPlaying(false)}
              />

              {/* Audio Controls */}
              <div className="w-full flex items-center justify-between px-2 text-xs">
                <span className="font-mono text-slate-400">
                  {Math.floor(currentTime / 60)}:{(Math.floor(currentTime % 60)).toString().padStart(2, '0')}
                </span>

                <div className="flex items-center gap-4">
                  <button
                    onClick={handleAudioToggle}
                    className="w-12 h-12 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center shadow-lg transition-transform hover:scale-105 cursor-pointer"
                  >
                    {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 fill-white ml-0.5" />}
                  </button>
                </div>

                <span className="font-mono text-slate-400">{asset.duration || '۰۶:۱۸'}</span>
              </div>
            </div>
          </div>
        );

      case 'archive':
        return (
          <div className="w-full h-full p-8 bg-slate-900 flex items-center justify-center">
            <div className="w-full max-w-2xl bg-white rounded-3xl p-6 shadow-2xl flex flex-col max-h-[75vh]">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center font-bold">
                    <FolderTree className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">{asset.fileName}</h3>
                    <p className="text-xs text-slate-600">محتوای بسته فشرده پروداکشن تدبیر • ۶ فایل و دایرکتوری</p>
                  </div>
                </div>

              </div>

              {/* Virtual File Tree */}
              <div className="flex-1 overflow-y-auto py-4 space-y-2 text-xs">
                {[
                  { name: 'dist/', type: 'folder', size: '—', date: '۱۴۰۴/۰۶/۰۵' },
                  { name: 'dist/assets/index-Bf948k.js', type: 'code', size: '۱.۸ مگابایت', date: '۱۴۰۴/۰۶/۰۵' },
                  { name: 'dist/assets/index-C72kd1.css', type: 'style', size: '۳۲۰ کیلوبایت', date: '۱۴۰۴/۰۶/۰۵' },
                  { name: 'dist/index.html', type: 'html', size: '۴.۲ کیلوبایت', date: '۱۴۰۴/۰۶/۰۵' },
                  { name: 'README.md', type: 'doc', size: '۱۲ کیلوبایت', date: '۱۴۰۴/۰۶/۰۵' },
                  { name: 'checksum.sha256', type: 'hash', size: '۶۴ بایت', date: '۱۴۰۴/۰۶/۰۵' },
                ].map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-50 border border-slate-100">
                    <div className="flex items-center gap-2.5 font-mono">
                      {item.type === 'folder' ? (
                        <span className="text-amber-500 font-bold">📁</span>
                      ) : (
                        <FileCode className="w-4 h-4 text-indigo-500" />
                      )}
                      <span className="font-semibold text-slate-800">{item.name}</span>
                    </div>
                    <div className="flex items-center gap-4 text-[11px] text-slate-600">
                      <span>{item.size}</span>
                      <span>{item.date}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );

      case 'document':
      default:
        return (
          <div className="w-full h-full flex flex-col bg-slate-900/95 overflow-hidden">
            {/* PDF Toolbar */}
            <div className="p-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-white text-xs px-6">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-rose-400" />
                <span className="font-bold truncate max-w-sm">{asset.fileName}</span>
              </div>

              {/* Page Controls */}
              <div className="flex items-center gap-2 bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-700">
                <button
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  className="p-1 text-slate-300 hover:text-white disabled:opacity-30 cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <span className="font-medium text-[11px]">
                  صفحه {currentPage} از {totalPages}
                </span>
                <button
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  className="p-1 text-slate-300 hover:text-white disabled:opacity-30 cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              </div>

              <button
                onClick={() => downloadAsset(asset)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 rounded-xl text-white font-bold transition-colors cursor-pointer shadow-xs"
              >
                <Download className="w-3.5 h-3.5" />
                <span>دانلود نسخه اصلی</span>
              </button>
            </div>

            {/* Document Page Canvas */}
            <div className="flex-1 overflow-y-auto p-8 flex justify-center items-start">
              <div className="w-full max-w-3xl bg-white rounded-2xl shadow-2xl p-10 min-h-[750px] border border-slate-200 text-slate-900 flex flex-col justify-between animate-in fade-in zoom-in-95">
                <div>
                  {/* Page Header */}
                  <div className="flex items-center justify-between pb-6 border-b border-slate-200">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-sm">
                        ت
                      </div>
                      <div>
                        <h2 className="font-extrabold text-base text-slate-900">سامانه مدیریت سازمانی تدبیر</h2>
                        <p className="text-[11px] text-slate-600">مستندات رسمی و راهنمای راهبردی پروژه</p>
                      </div>
                    </div>
                    <span className="text-xs font-mono font-bold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-lg">
                      v{asset.currentVersion}.0
                    </span>
                  </div>

                  {/* Body Content */}
                  <div className="mt-8 space-y-6 text-xs text-slate-700 leading-relaxed">
                    <h3 className="text-base font-black text-slate-900 border-r-4 border-indigo-600 pr-3">
                      {asset.title}
                    </h3>
                    <p className="text-justify leading-7">
                      این سند به عنوان مرجع رسمی تعاریف و استانداردهای طراحی و پیاده‌سازی در سامانه تدبیر تهیه شده است. کلیه مدیران محصول، طراحان رابط کاربری و مهندسان نرم‌افزار موظفند اصول تدوین‌شده در این چارچوب را رعایت نمایند.
                    </p>

                    <div className="grid grid-cols-2 gap-4 my-6">
                      <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                        <span className="text-[10px] font-bold text-slate-600 block mb-1">پروژه مرتبط</span>
                        <span className="font-bold text-slate-900 text-xs">{project?.name || 'سازمان مرکزی تدبیر'}</span>
                      </div>
                      <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                        <span className="text-[10px] font-bold text-slate-600 block mb-1">تدوین‌کننده سند</span>
                        <span className="font-bold text-slate-900 text-xs">{creator?.name || 'سارا چنگیزی'}</span>
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold block text-xs mb-1">تاییدیه کنترل کیفیت و امنیت</span>
                        <p className="text-[11px] leading-relaxed text-emerald-800">
                          کلیه الزامات فنی این سند توسط تیم معماری اطلاعات بررسی و مورد تایید نهایی قرار گرفته است.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Page Footer */}
                <div className="pt-6 border-t border-slate-200 flex items-center justify-between text-[10px] text-slate-600 font-mono">
                  <span>TADBIR ENTERPRISE • CONFIDENTIAL</span>
                  <span>صفحه {currentPage} از {totalPages}</span>
                </div>
              </div>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-950/80 backdrop-blur-md flex flex-col animate-in fade-in duration-150">
      {/* Top Header Bar */}
      <div className="h-16 px-6 bg-slate-900/95 border-b border-slate-800 flex items-center justify-between text-white shrink-0 z-20">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={handleClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-sm text-white truncate">{asset.title}</h2>
              {asset.currentVersion > 1 && (
                <span className="px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 text-[10px] font-mono font-bold flex items-center gap-1">
                  <Layers className="w-3 h-3" />
                  <span>v{asset.currentVersion}</span>
                </span>
              )}
            </div>
            <p className="text-[11px] font-mono text-slate-400 truncate">
              {asset.fileName} • {asset.sizeFormatted}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => toggleAssetFavorite(asset.id)}
            title={asset.isFavorite ? 'حذف از نشان‌ها' : 'نشان کردن فایل'}
            className={`p-2 rounded-xl transition-colors cursor-pointer ${
              asset.isFavorite ? 'bg-amber-500/20 text-amber-400' : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Star className={`w-4 h-4 ${asset.isFavorite ? 'fill-amber-400 text-amber-400' : ''}`} />
          </button>

          <button
            onClick={() => setShareTargetAssetId(asset.id)}
            title="اشتراک‌گذاری"
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <Share2 className="w-4 h-4" />
          </button>

          <button
            onClick={() => setVersionModalAssetId(asset.id)}
            title="مدیریت نسخه‌ها"
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <History className="w-4 h-4" />
          </button>

          <button
            onClick={() => {
              setDetailAssetId(asset.id);
              setPreviewAssetId(null);
            }}
            title="جزئیات و اطلاعات کامل"
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <Info className="w-4 h-4" />
          </button>

          <button
            onClick={() => downloadAsset(asset)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-xs mr-2"
          >
            <Download className="w-4 h-4" />
            <span>دانلود</span>
          </button>
        </div>
      </div>

      {/* Main Interactive Canvas Area */}
      <div className="flex-1 overflow-hidden relative">
        {renderContent()}
      </div>
    </div>
  );
};
