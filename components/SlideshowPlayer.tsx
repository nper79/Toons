
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Play, ChevronDown, Layout, CheckCircle, GitBranch, Volume2, VolumeX } from 'lucide-react';
import { StorySegment } from '../types';

interface SlideshowPlayerProps {
  segments: StorySegment[];
  onClose: () => void;
  onPlayAudio: (segmentId: string, text: string) => Promise<void>;
  onStopAudio: () => void;
}

const SlideshowPlayer: React.FC<SlideshowPlayerProps> = ({
  segments,
  onClose,
  onPlayAudio,
  onStopAudio
}) => {
  const [hasStarted, setHasStarted] = useState(false);
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null);
  const [activeBeatIndex, setActiveBeatIndex] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastPlayedSegmentId = useRef<string | null>(null);

  // Flatten segments and their panels into a single list for the "Seamless" vertical strip
  const allPanels = useMemo(() => {
    const panels: { segmentId: string; beatIndex: number; imageUrl: string; caption: string; isFirstBeat: boolean; segment: StorySegment }[] = [];
    
    segments.forEach((seg) => {
        for (let i = 0; i < 4; i++) {
            const img = (seg.generatedImageUrls && seg.generatedImageUrls[i]) || seg.masterGridImageUrl || '';
            panels.push({
                segmentId: seg.id,
                beatIndex: i,
                imageUrl: img,
                caption: seg.panels?.[i]?.caption || (i === 3 ? seg.text : ""),
                isFirstBeat: i === 0,
                segment: seg
            });
        }
    });
    return panels;
  }, [segments]);

  // Handle free-scroll tracking to update HUD state (Captions/Audio)
  const handleScroll = () => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const viewportMiddle = container.scrollTop + container.clientHeight / 2;
    
    // Find which panel is currently under the center of the screen
    const panelElements = container.querySelectorAll('[data-panel-index]');
    let currentPanelIdx = 0;
    
    panelElements.forEach((el, idx) => {
        const htmlEl = el as HTMLElement;
        const rectTop = htmlEl.offsetTop;
        const rectBottom = rectTop + htmlEl.offsetHeight;
        
        if (viewportMiddle >= rectTop && viewportMiddle <= rectBottom) {
            currentPanelIdx = idx;
        }
    });

    const panel = allPanels[currentPanelIdx];

    if (panel) {
        setActiveSegmentId(panel.segmentId);
        setActiveBeatIndex(panel.beatIndex);

        // Trigger Audio for new segments as they cross into the middle
        if (panel.isFirstBeat && lastPlayedSegmentId.current !== panel.segmentId && !isMuted) {
            lastPlayedSegmentId.current = panel.segmentId;
            if (panel.segment.audioUrl && audioRef.current) {
                audioRef.current.src = panel.segment.audioUrl;
                audioRef.current.play().catch(e => console.warn("Audio autoplay blocked"));
            }
        }
    }
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
    if (audioRef.current) {
        if (!isMuted) audioRef.current.pause();
        else audioRef.current.play().catch(() => {});
    }
  };

  if (!hasStarted) {
    return createPortal(
      <div className="fixed inset-0 z-[10000] bg-[#020617] text-white flex flex-col items-center justify-center p-6">
          <div className="absolute inset-0 bg-gradient-to-b from-indigo-500/10 to-transparent" />
          <div className="relative z-10 flex flex-col items-center text-center max-w-sm">
              <div className="w-24 h-24 bg-indigo-600 rounded-[2.5rem] flex items-center justify-center shadow-[0_0_80px_rgba(79,70,229,0.3)] mb-10 transform rotate-6 hover:rotate-0 transition-transform duration-500">
                  <Play className="w-10 h-10 fill-current ml-1" />
              </div>
              <h2 className="text-4xl font-black mb-4 tracking-tighter uppercase italic">Webtoon strip</h2>
              <p className="text-slate-400 text-sm leading-relaxed mb-12 font-medium px-4">
                Free-scroll mode. Stop anywhere, pan at your own pace. The story flows continuously as you glide down.
              </p>
              <button 
                onClick={() => setHasStarted(true)}
                className="w-full bg-white text-black font-black py-5 rounded-2xl hover:bg-indigo-500 hover:text-white transition-all transform active:scale-95 shadow-[0_20px_40px_rgba(255,255,255,0.1)] uppercase tracking-widest text-sm"
              >
                  Begin Journey
              </button>
          </div>
      </div>, document.body
    );
  }

  const currentPanelData = allPanels.find(p => p.segmentId === activeSegmentId && p.beatIndex === activeBeatIndex) || allPanels[0];
  const activeSeg = segments.find(s => s.id === activeSegmentId);

  return createPortal(
    <div className="fixed inset-0 z-[10000] bg-black text-white flex flex-col overflow-hidden">
      <audio ref={audioRef} className="hidden" />

      {/* Persistent Overlay HUD */}
      <div className="absolute top-0 left-0 right-0 z-50 p-6 flex justify-between items-start bg-gradient-to-b from-black/90 via-black/40 to-transparent pointer-events-none">
          <div className="flex items-center gap-4 pointer-events-auto">
               <button 
                onClick={() => { onStopAudio(); onClose(); }}
                className="w-12 h-12 bg-white/10 hover:bg-white/20 backdrop-blur-xl rounded-2xl border border-white/10 flex items-center justify-center transition-all group"
               >
                    <X className="w-6 h-6 group-hover:scale-110 transition-transform" />
               </button>
               <div className="bg-black/40 backdrop-blur-md px-4 py-2 rounded-xl border border-white/5">
                   <h3 className="text-[10px] font-black tracking-[0.4em] uppercase text-indigo-400 mb-0.5">Strip Reader</h3>
                   <div className="flex gap-1">
                        {segments.map((s) => (
                            <div key={s.id} className={`h-1 rounded-full transition-all duration-300 ${s.id === activeSegmentId ? 'w-4 bg-indigo-500' : 'w-1 bg-white/20'}`} />
                        ))}
                   </div>
               </div>
          </div>

          <button 
            onClick={toggleMute}
            className="pointer-events-auto w-12 h-12 bg-white/10 hover:bg-white/20 backdrop-blur-xl rounded-2xl border border-white/10 flex items-center justify-center transition-all"
          >
              {isMuted ? <VolumeX className="w-5 h-5 text-red-400" /> : <Volume2 className="w-5 h-5 text-emerald-400" />}
          </button>
      </div>

      {/* The Infinite FREE-SCROLL Vertical Strip */}
      <div 
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto scroll-smooth custom-scrollbar-hidden bg-[#050505]"
      >
        <div className="flex flex-col w-full max-w-lg mx-auto bg-black pb-[50vh]">
            {allPanels.map((panel, idx) => (
                <div 
                    key={`${panel.segmentId}-${panel.beatIndex}`}
                    data-panel-index={idx}
                    className="relative w-full aspect-[9/16] bg-black overflow-hidden flex flex-col justify-center"
                >
                    {panel.imageUrl ? (
                        <img 
                            src={panel.imageUrl} 
                            className="w-full h-full object-cover select-none" 
                            alt={`Panel ${idx}`}
                            loading={idx < 4 ? "eager" : "lazy"}
                        />
                    ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center gap-6 bg-zinc-950">
                             <div className="w-12 h-12 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
                             <span className="text-[10px] font-black tracking-[0.5em] text-indigo-400 uppercase animate-pulse">Rendering beat {idx + 1}</span>
                        </div>
                    )}
                    
                    {/* Subtle panel shadow to define separation without hard borders */}
                    <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/40 to-transparent pointer-events-none" />
                </div>
            ))}
            
            {/* End of Journey UI */}
            <div className="py-32 flex flex-col items-center justify-center p-12 text-center bg-gradient-to-b from-transparent to-indigo-950/20">
                 <div className="w-20 h-20 bg-indigo-600/10 rounded-full flex items-center justify-center mb-8 border border-indigo-500/20">
                    <CheckCircle className="w-10 h-10 text-emerald-500" />
                 </div>
                 <h4 className="text-3xl font-black mb-4 uppercase tracking-tighter italic">End of the line</h4>
                 <p className="text-slate-500 text-sm mb-12 font-medium max-w-xs leading-relaxed">The strip ends here. Your story continues in the editor.</p>
                 <button 
                    onClick={onClose} 
                    className="px-12 py-4 bg-white text-black rounded-2xl font-black uppercase tracking-widest text-xs hover:scale-105 transition-transform"
                >
                    Close Strip
                </button>
            </div>
        </div>
      </div>

      {/* Floating Interactive Narrator Layer */}
      <div className="absolute bottom-0 left-0 right-0 z-40 pointer-events-none flex flex-col items-center pb-12 px-6">
          
          {/* Dynamic Floating Caption */}
          {currentPanelData.caption && (
              <div className="w-full max-w-md bg-black/80 backdrop-blur-2xl border border-white/10 px-10 py-8 rounded-[2.5rem] shadow-[0_30px_60px_rgba(0,0,0,0.8)] animate-slide-up pointer-events-auto border-b-indigo-500/50">
                   <p className="text-xl md:text-2xl font-serif text-white leading-relaxed text-center italic font-medium">
                        "{currentPanelData.caption}"
                   </p>
              </div>
          )}
          
          {/* Choice Gate: If the current panel has choices, show them floating above */}
          {activeBeatIndex === 3 && activeSeg?.choices && activeSeg.choices.length > 0 && (
              <div className="w-full max-w-md mt-6 animate-fade-in pointer-events-auto">
                   <div className="bg-slate-900/95 backdrop-blur-3xl border border-indigo-500/30 rounded-[2rem] p-6 shadow-2xl">
                        <div className="flex items-center gap-2 mb-6 opacity-60">
                             <GitBranch className="w-4 h-4 text-indigo-400" />
                             <span className="text-[10px] font-black tracking-widest uppercase">Path Selection</span>
                        </div>
                        <div className="space-y-3">
                            {activeSeg.choices.map((choice, i) => (
                                <button 
                                    key={i}
                                    onClick={() => {
                                        const targetIndex = allPanels.findIndex(p => p.segmentId === choice.targetSegmentId);
                                        if (targetIndex !== -1 && containerRef.current) {
                                            containerRef.current.scrollTo({
                                                top: targetIndex * containerRef.current.querySelectorAll('[data-panel-index]')[0].clientHeight,
                                                behavior: 'smooth'
                                            });
                                        }
                                    }}
                                    className="w-full text-left p-5 bg-white/5 hover:bg-white text-white hover:text-black rounded-2xl border border-white/10 transition-all font-bold text-sm flex justify-between items-center group"
                                >
                                    {choice.text}
                                    <ChevronDown className="w-4 h-4 -rotate-90 opacity-0 group-hover:opacity-100 transition-all" />
                                </button>
                            ))}
                        </div>
                   </div>
              </div>
          )}
      </div>

      <style>{`
        .custom-scrollbar-hidden::-webkit-scrollbar {
          display: none;
        }
        .custom-scrollbar-hidden {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        @keyframes slide-up {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .animate-slide-up {
          animation: slide-up 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
        }
      `}</style>
    </div>, document.body
  );
};

export default SlideshowPlayer;
