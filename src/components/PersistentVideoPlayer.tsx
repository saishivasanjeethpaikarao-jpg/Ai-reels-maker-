import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, 
  Pause, 
  Volume2, 
  VolumeX, 
  Maximize, 
  RotateCcw,
  Video,
  Monitor,
  Layout
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface VideoMetadata {
  resolution: string;
  aspect: string;
}

interface PersistentVideoPlayerProps {
  src: string;
  autoPlay?: boolean;
  loop?: boolean;
  onMetadata?: (metadata: VideoMetadata) => void;
}

export default function PersistentVideoPlayer({ 
  src, 
  autoPlay = true, 
  loop = true,
  onMetadata 
}: PersistentVideoPlayerProps) {
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [metadata, setMetadata] = useState<VideoMetadata | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [showControls, setShowControls] = useState(true);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const togglePlay = () => {
    if (videoRef.current) {
      if (playing) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setPlaying(!playing);
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      const newMuted = !muted;
      videoRef.current.muted = newMuted;
      setMuted(newMuted);
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (videoRef.current) {
      videoRef.current.volume = val;
      videoRef.current.muted = val === 0;
      setMuted(val === 0);
    }
  };

  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleFullscreen = () => {
    if (videoRef.current) {
      if (videoRef.current.requestFullscreen) {
        videoRef.current.requestFullscreen();
      }
    }
  };

  const handleLoadedMetadata = (e: React.SyntheticEvent<HTMLVideoElement, Event>) => {
    if (videoRef.current) setDuration(videoRef.current.duration);
    
    const video = e.currentTarget;
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (width && height) {
      const resolution = `${width}x${height}`;
      const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
      const divisor = gcd(width, height);
      const aspect = `${width / divisor}:${height / divisor}`;
      
      const newMetadata = { resolution, aspect };
      setMetadata(newMetadata);
      onMetadata?.(newMetadata);
    }
  };

  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (playing) setShowControls(false);
    }, 3000);
  };

  useEffect(() => {
    return () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, [playing]);

  return (
    <div 
      className="relative group w-full h-full overflow-hidden flex flex-col bg-slate-950 rounded-2xl border border-white/10 shadow-2xl"
      onMouseMove={handleMouseMove}
      onMouseLeave={() => playing && setShowControls(false)}
    >
       <video 
          ref={videoRef}
          src={src}
          onLoadedMetadata={handleLoadedMetadata}
          onTimeUpdate={handleTimeUpdate}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onClick={togglePlay}
          className="w-full h-full flex-1 object-contain cursor-pointer"
          autoPlay={autoPlay}
          loop={loop}
          playsInline
       />
       
       {/* Metadata Overlay (Top) */}
       <AnimatePresence>
          {showControls && metadata && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="absolute top-4 inset-x-4 flex justify-between items-start pointer-events-none"
            >
              <div className="flex gap-2">
                <div className="px-3 py-1.5 bg-slate-950/80 backdrop-blur-md border border-white/10 rounded-lg flex items-center gap-2">
                  <Monitor className="w-3 h-3 text-sky-400" />
                  <span className="text-[10px] font-mono font-bold text-white">{metadata.resolution}</span>
                </div>
                <div className="px-3 py-1.5 bg-slate-950/80 backdrop-blur-md border border-white/10 rounded-lg flex items-center gap-2">
                  <Layout className="w-3 h-3 text-emerald-400" />
                  <span className="text-[10px] font-mono font-bold text-white">{metadata.aspect}</span>
                </div>
              </div>
              <div className="px-3 py-1.5 bg-sky-500 text-slate-950 text-[10px] font-black rounded-lg uppercase tracking-widest shadow-lg">
                HD Master
              </div>
            </motion.div>
          )}
       </AnimatePresence>

       {/* Center Play Button Overlay */}
       <AnimatePresence>
          {!playing && (
             <motion.div 
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.5 }}
                onClick={togglePlay}
                className="absolute inset-0 flex items-center justify-center bg-slate-950/20 backdrop-blur-[2px] z-10 cursor-pointer"
             >
                <div className="w-20 h-20 rounded-full bg-sky-500 flex items-center justify-center shadow-2xl shadow-sky-500/40">
                   <Play className="w-8 h-8 text-slate-950 fill-current ml-1" />
                </div>
             </motion.div>
          )}
       </AnimatePresence>
       
       <AnimatePresence>
         {showControls && (
           <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950 via-slate-950/90 to-transparent p-6 space-y-4 transition-all duration-500 z-20"
           >
              {/* Progress Slider */}
              <div className="flex items-center gap-4">
                 <span className="text-[10px] font-mono font-bold text-sky-400 w-10">{formatTime(currentTime)}</span>
                 <div className="flex-1 relative flex items-center group/slider">
                    <input 
                        type="range" 
                        min="0" 
                        max={duration || 0} 
                        step="0.1" 
                        value={currentTime}
                        onChange={handleSeek}
                        className="w-full h-1.5 bg-white/10 rounded-full accent-sky-500 cursor-pointer hover:accent-sky-400 transition-all appearance-none z-10"
                    />
                    <div 
                        className="absolute h-1.5 bg-sky-500/30 rounded-full pointer-events-none transition-all"
                        style={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
                    />
                 </div>
                 <span className="text-[10px] font-mono font-bold text-slate-400 w-10">{formatTime(duration)}</span>
              </div>
    
              <div className="flex justify-between items-center">
                 <div className="flex items-center gap-6">
                    <button onClick={togglePlay} className="p-3 bg-white/5 hover:bg-white/10 rounded-xl transition-all text-white border border-white/5 shadow-inner">
                       {playing ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
                    </button>
                    <div className="flex items-center gap-3 bg-white/5 px-4 py-2 rounded-xl border border-white/5">
                       <button onClick={toggleMute} className="text-slate-400 hover:text-white transition-colors">
                          {muted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                       </button>
                       <input 
                          type="range" 
                          min="0" 
                          max="1" 
                          step="0.05" 
                          value={muted ? 0 : volume}
                          onChange={handleVolumeChange}
                          className="w-24 h-1 bg-white/10 rounded-full accent-sky-500 cursor-pointer appearance-none"
                       />
                    </div>
                 </div>
    
                 <div className="flex items-center gap-4">
                    <button 
                      onClick={() => { if (videoRef.current) videoRef.current.currentTime = 0; }}
                      className="p-3 bg-white/5 hover:bg-white/10 rounded-xl transition-all text-slate-400 hover:text-sky-400 border border-white/5"
                      title="Restart"
                    >
                       <RotateCcw className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={handleFullscreen}
                      className="p-3 bg-white/5 hover:bg-white/10 rounded-xl transition-all text-slate-400 hover:text-sky-400 border border-white/5"
                      title="Fullscreen"
                    >
                       <Maximize className="w-4 h-4" />
                    </button>
                 </div>
              </div>
           </motion.div>
         )}
       </AnimatePresence>
    </div>
  );
}
