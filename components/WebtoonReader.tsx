
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Play, CheckCircle, GitBranch, Volume2, VolumeX, ChevronDown, ChevronLeft, ChevronRight, BookOpen, Maximize2 } from 'lucide-react';
import { StorySegment } from '../types';

interface WebtoonReaderProps {
  segments: StorySegment[];
  onClose: () => void;
  onPlayAudio: (segmentId: string, text: string) => Promise<void>;
  onStopAudio: () => void;
}

const WebtoonReader: React.FC<WebtoonReaderProps> = ({
  segments,
  onClose,
  onPlayAudio,
  onStopAudio
}) => {
  const [hasStarted, setHasStarted] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentPanelIndex, setCurrentPanelIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Flatten segments and their panels into a single list
  // If segment has VN speeches, create one panel per speech (for click-to-advance)
  const allPanels = useMemo(() => {
    const panels: {
      segmentId: string;
      beatIndex: number;
      imageUrl: string;
      caption: string;
      narration: string;
      speaker?: string; // VN speaker name
      isFirstBeat: boolean;
      segment: StorySegment;
      isSilent: boolean;
    }[] = [];

    segments.forEach((seg) => {
        const isSilent = !seg.text || seg.text.trim().length === 0;
        const img = seg.generatedImageUrls?.[0] || seg.masterGridImageUrl || '';

        // If segment has VN speeches, create one panel per speech
        if (seg.vnSpeeches && seg.vnSpeeches.length > 0) {
            seg.vnSpeeches.forEach((speech, idx) => {
                panels.push({
                    segmentId: seg.id,
                    beatIndex: idx,
                    imageUrl: img, // Same image for all speeches in this segment
                    caption: '',
                    narration: speech.text,
                    speaker: speech.speaker,
                    isFirstBeat: idx === 0,
                    segment: seg,
                    isSilent: false
                });
            });
        } else {
            // Fallback to old behavior if no VN speeches
            const panelCount = Math.max(seg.panels?.length || 0, seg.generatedImageUrls?.length || 0, 1);

            for (let i = 0; i < panelCount; i++) {
                const panelImg = (seg.generatedImageUrls && seg.generatedImageUrls[i]) || seg.masterGridImageUrl || '';
                const caption = seg.panels?.[i]?.caption || '';
                const narration = i === panelCount - 1 ? seg.text : '';

                panels.push({
                    segmentId: seg.id,
                    beatIndex: i,
                    imageUrl: panelImg,
                    caption,
                    narration,
                    speaker: undefined,
                    isFirstBeat: i === 0,
                    segment: seg,
                    isSilent
                });
            }
        }
    });
    return panels;
  }, [segments]);

  // Visual Novel navigation
  const currentPanel = allPanels[currentPanelIndex];
  const progress = allPanels.length > 0 ? ((currentPanelIndex + 1) / allPanels.length) * 100 : 0;

  const handleNext = () => {
    if (currentPanelIndex < allPanels.length - 1) {
      setCurrentPanelIndex(prev => prev + 1);
    }
  };

  const handlePrevious = () => {
    if (currentPanelIndex > 0) {
      setCurrentPanelIndex(prev => prev - 1);
    }
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
    if (audioRef.current) {
        if (!isMuted) audioRef.current.pause();
        else audioRef.current.play().catch(() => {});
    }
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter') {
        handleNext();
      } else if (e.key === 'ArrowLeft') {
        handlePrevious();
      } else if (e.key === 'Escape') {
        onStopAudio();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [currentPanelIndex, allPanels.length]);

  // Start screen
  if (!hasStarted) {
    return createPortal(
      <div className="fixed inset-0 z-[10000] bg-gradient-to-b from-amber-50 to-orange-50 text-slate-800 flex flex-col items-center justify-center p-6">
          <div className="relative z-10 flex flex-col items-center text-center max-w-sm">
              <div className="w-24 h-24 bg-gradient-to-br from-amber-400 to-orange-500 rounded-3xl flex items-center justify-center shadow-xl mb-10 transform -rotate-3 hover:rotate-0 transition-transform duration-500">
                  <BookOpen className="w-10 h-10 text-white" />
              </div>
              <h2 className="text-4xl font-black mb-4 tracking-tight">Visual Novel Reader</h2>
              <p className="text-slate-500 text-sm leading-relaxed mb-12 font-medium px-4">
                Click anywhere to advance through the story dialogue.
              </p>
              <button
                onClick={() => setHasStarted(true)}
                className="w-full bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold py-5 rounded-2xl hover:from-amber-600 hover:to-orange-600 transition-all transform active:scale-95 shadow-lg uppercase tracking-widest text-sm"
              >
                  Start Reading
              </button>
          </div>
      </div>, document.body
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-[10000] bg-black text-white flex flex-col overflow-hidden">
      <audio ref={audioRef} className="hidden" />

      {/* Top Navigation Bar */}
      <div className="absolute top-0 left-0 right-0 z-50 bg-gradient-to-b from-black/80 to-transparent px-4 py-3 flex justify-between items-center">
          <button
            onClick={() => { onStopAudio(); onClose(); }}
            className="w-10 h-10 bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-lg flex items-center justify-center transition-all"
          >
              <X className="w-5 h-5 text-white" />
          </button>

          {/* Progress Bar */}
          <div className="flex-1 mx-4 max-w-md">
              <div className="h-1 bg-white/20 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all duration-300 rounded-full"
                    style={{ width: `${progress}%` }}
                  />
              </div>
              <p className="text-[10px] text-white/60 text-center mt-1 font-medium">
                  {currentPanelIndex + 1} / {allPanels.length}
              </p>
          </div>

          <button
            onClick={toggleMute}
            className="w-10 h-10 bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-lg flex items-center justify-center transition-all"
          >
              {isMuted ? <VolumeX className="w-5 h-5 text-red-400" /> : <Volume2 className="w-5 h-5 text-emerald-400" />}
          </button>
      </div>

      {/* Main Content - Visual Novel Style */}
      <div
        ref={containerRef}
        onClick={handleNext}
        className="flex-1 relative cursor-pointer"
      >
        {/* Background Image */}
        {currentPanel?.imageUrl && (
          <div
            className="absolute inset-0 bg-cover bg-center transition-all duration-500"
            style={{
              backgroundImage: `url(${currentPanel.imageUrl})`,
              filter: 'brightness(0.7)'
            }}
          />
        )}
        {!currentPanel?.imageUrl && (
          <div className="absolute inset-0 bg-gradient-to-br from-slate-900 to-slate-800" />
        )}

        {/* Dialogue Box at Bottom - Visual Novel Style */}
        {currentPanel && (currentPanel.narration || currentPanel.caption) && !currentPanel.isSilent && (
          <div className="absolute bottom-0 left-0 right-0 z-40 p-6">
            <div className="max-w-4xl mx-auto bg-black/90 backdrop-blur-md rounded-2xl p-8 border border-white/10 shadow-2xl">
              {/* Speaker Name (if present) */}
              {currentPanel.speaker && (
                <div className="mb-3 flex items-center gap-2">
                  <div className="text-amber-400 font-bold text-base uppercase tracking-wide">
                    {currentPanel.speaker}
                  </div>
                </div>
              )}

              {/* Text Content */}
              <div className="text-white text-lg md:text-xl leading-relaxed font-serif">
                {currentPanel.narration || currentPanel.caption}
              </div>

              {/* Continue indicator */}
              <div className="mt-4 flex items-center justify-between">
                <span className="text-xs text-white/40 uppercase tracking-wide">Click to continue</span>
                <div className="flex items-center gap-2 text-white/40 text-xs">
                  <span>{currentPanelIndex + 1}</span>
                  <span>/</span>
                  <span>{allPanels.length}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Silent moment indicator */}
        {currentPanel && currentPanel.isSilent && (
          <div className="absolute bottom-0 left-0 right-0 z-40 p-6">
            <div className="max-w-4xl mx-auto text-center">
              <span className="text-white/40 text-sm italic">~ click to continue ~</span>
            </div>
          </div>
        )}

        {/* Choice Gate */}
        {currentPanel &&
         currentPanel.beatIndex === (currentPanel.segment.panels?.length || 1) - 1 &&
         currentPanel.segment.choices &&
         currentPanel.segment.choices.length > 0 && (
          <div className="absolute bottom-0 left-0 right-0 z-40 p-6">
            <div className="max-w-4xl mx-auto bg-black/90 backdrop-blur-md rounded-2xl p-8 border border-white/10 shadow-2xl">
              <div className="flex items-center gap-2 mb-6">
                <GitBranch className="w-5 h-5 text-amber-400" />
                <span className="text-sm font-bold text-amber-400 uppercase tracking-wide">Choose Your Path</span>
              </div>
              <div className="space-y-3">
                {currentPanel.segment.choices.map((choice, i) => (
                  <button
                    key={i}
                    onClick={(e) => {
                      e.stopPropagation();
                      const targetIndex = allPanels.findIndex(p => p.segmentId === choice.targetSegmentId);
                      if (targetIndex !== -1) {
                        setCurrentPanelIndex(targetIndex);
                      }
                    }}
                    className="w-full text-left p-4 bg-white/10 hover:bg-amber-500 text-white rounded-xl border border-white/20 hover:border-amber-500 transition-all font-medium text-base"
                  >
                    {choice.text}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* End of Story Screen */}
        {currentPanelIndex >= allPanels.length - 1 && currentPanel && (
          <div className="absolute inset-0 z-50 bg-black/95 backdrop-blur-lg flex items-center justify-center">
            <div className="text-center max-w-md px-6">
              <div className="w-20 h-20 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full flex items-center justify-center mb-8 mx-auto">
                <CheckCircle className="w-10 h-10 text-white" />
              </div>
              <h4 className="text-4xl font-black mb-4 text-white">The End</h4>
              <p className="text-white/60 text-base mb-10 leading-relaxed">
                You've completed this story. Keep learning!
              </p>
              <button
                onClick={(e) => { e.stopPropagation(); onClose(); }}
                className="px-10 py-4 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl font-bold uppercase tracking-wide text-sm hover:from-amber-600 hover:to-orange-600 transition-all shadow-lg"
              >
                Close Reader
              </button>
            </div>
          </div>
        )}

        {/* Navigation Arrows */}
        {currentPanelIndex > 0 && (
          <button
            onClick={(e) => { e.stopPropagation(); handlePrevious(); }}
            className="absolute left-4 top-1/2 -translate-y-1/2 z-30 w-12 h-12 bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center transition-all opacity-50 hover:opacity-100"
          >
            <ChevronLeft className="w-6 h-6 text-white" />
          </button>
        )}

        {currentPanelIndex < allPanels.length - 1 && (
          <button
            onClick={(e) => { e.stopPropagation(); handleNext(); }}
            className="absolute right-4 top-1/2 -translate-y-1/2 z-30 w-12 h-12 bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center transition-all opacity-50 hover:opacity-100"
          >
            <ChevronRight className="w-6 h-6 text-white" />
          </button>
        )}
      </div>
    </div>, document.body
  );
};

export default WebtoonReader;
