
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Play, CheckCircle, GitBranch, Volume2, VolumeX, ChevronDown, BookOpen, Maximize2 } from 'lucide-react';
import { StorySegment, WordDefinition } from '../types';
import InteractiveText from './InteractiveText';

interface WebtoonReaderProps {
  segments: StorySegment[];
  onClose: () => void;
  onPlayAudio: (segmentId: string, text: string) => Promise<void>;
  onStopAudio: () => void;
  nativeLanguage?: string;
  learningLanguage?: string;
  vocabulary?: Record<string, Record<string, WordDefinition>>;
}

const WebtoonReader: React.FC<WebtoonReaderProps> = ({
  segments,
  onClose,
  onPlayAudio,
  onStopAudio,
  nativeLanguage = "English",
  learningLanguage,
  vocabulary
}) => {
  const [hasStarted, setHasStarted] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [progress, setProgress] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Flatten segments and their panels into a single list
  const allPanels = useMemo(() => {
    const panels: {
      segmentId: string;
      beatIndex: number;
      imageUrl: string;
      caption: string;
      narration: string;
      isFirstBeat: boolean;
      segment: StorySegment;
      isSilent: boolean;
    }[] = [];

    segments.forEach((seg) => {
        const panelCount = Math.max(seg.panels?.length || 0, seg.generatedImageUrls?.length || 0, 1);
        const isSilent = !seg.text || seg.text.trim().length === 0;

        for (let i = 0; i < panelCount; i++) {
            const img = (seg.generatedImageUrls && seg.generatedImageUrls[i]) || seg.masterGridImageUrl || '';
            const caption = seg.panels?.[i]?.caption || '';
            const narration = i === panelCount - 1 ? seg.text : '';

            panels.push({
                segmentId: seg.id,
                beatIndex: i,
                imageUrl: img,
                caption,
                narration,
                isFirstBeat: i === 0,
                segment: seg,
                isSilent
            });
        }
    });
    return panels;
  }, [segments]);

  // Track scroll progress
  const handleScroll = () => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const scrollProgress = container.scrollTop / (container.scrollHeight - container.clientHeight);
    setProgress(Math.min(100, Math.max(0, scrollProgress * 100)));
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
    if (audioRef.current) {
        if (!isMuted) audioRef.current.pause();
        else audioRef.current.play().catch(() => {});
    }
  };

  // Start screen
  if (!hasStarted) {
    return createPortal(
      <div className="fixed inset-0 z-[10000] bg-gradient-to-b from-amber-50 to-orange-50 text-slate-800 flex flex-col items-center justify-center p-6">
          <div className="relative z-10 flex flex-col items-center text-center max-w-sm">
              <div className="w-24 h-24 bg-gradient-to-br from-amber-400 to-orange-500 rounded-3xl flex items-center justify-center shadow-xl mb-10 transform -rotate-3 hover:rotate-0 transition-transform duration-500">
                  <BookOpen className="w-10 h-10 text-white" />
              </div>
              <h2 className="text-4xl font-black mb-4 tracking-tight">Webtoon Reader</h2>
              <p className="text-slate-500 text-sm leading-relaxed mb-12 font-medium px-4">
                Classic vertical scroll format. Click any word to see its translation in {nativeLanguage}.
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
    <div className="fixed inset-0 z-[10000] bg-[#f5f0e8] text-slate-800 flex flex-col overflow-hidden">
      <audio ref={audioRef} className="hidden" />

      {/* Top Navigation Bar */}
      <div className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 py-3 flex justify-between items-center shadow-sm">
          <button
            onClick={() => { onStopAudio(); onClose(); }}
            className="w-10 h-10 bg-slate-100 hover:bg-slate-200 rounded-xl flex items-center justify-center transition-all"
          >
              <X className="w-5 h-5 text-slate-600" />
          </button>

          {/* Progress Bar */}
          <div className="flex-1 mx-4 max-w-md">
              <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all duration-300 rounded-full"
                    style={{ width: `${progress}%` }}
                  />
              </div>
              <p className="text-[10px] text-slate-400 text-center mt-1 font-medium">
                  {Math.round(progress)}% read
              </p>
          </div>

          <button
            onClick={toggleMute}
            className="w-10 h-10 bg-slate-100 hover:bg-slate-200 rounded-xl flex items-center justify-center transition-all"
          >
              {isMuted ? <VolumeX className="w-5 h-5 text-red-400" /> : <Volume2 className="w-5 h-5 text-emerald-500" />}
          </button>
      </div>

      {/* Main Content - Webtoon Style Vertical Scroll */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto scroll-smooth"
        style={{ backgroundColor: '#f5f0e8' }}
      >
        <div className="flex flex-col w-full max-w-2xl mx-auto py-8 px-4">

            {/* Story Title */}
            <div className="text-center mb-12">
                <h1 className="text-3xl font-black text-slate-800 mb-2">Lingotoons</h1>
                <p className="text-sm text-slate-500">Interactive Language Learning Webtoon</p>
            </div>

            {allPanels.map((panel, idx) => (
                <div
                    key={`${panel.segmentId}-${panel.beatIndex}`}
                    data-panel-index={idx}
                    className="mb-8"
                >
                    {/* Image Panel */}
                    {panel.imageUrl && (
                        <div className="relative bg-white rounded-lg shadow-md overflow-hidden border border-slate-200">
                            <img
                                src={panel.imageUrl}
                                className="w-full h-auto object-contain select-none"
                                alt={`Panel ${idx + 1}`}
                                loading={idx < 4 ? "eager" : "lazy"}
                            />
                        </div>
                    )}

                    {/* No image placeholder */}
                    {!panel.imageUrl && (
                        <div className="relative bg-white rounded-lg shadow-md overflow-hidden border border-slate-200 aspect-[9/12] flex items-center justify-center">
                            <div className="flex flex-col items-center gap-4 text-slate-400">
                                <div className="w-12 h-12 border-4 border-slate-200 border-t-amber-500 rounded-full animate-spin" />
                                <span className="text-xs font-medium">Generating panel...</span>
                            </div>
                        </div>
                    )}

                    {/* Text Below Image - Caption/Narration */}
                    {(panel.caption || panel.narration) && (
                        <div className="mt-4 px-2">
                            {/* Main narration text */}
                            {panel.narration && !panel.isSilent && (
                                <div className="bg-white rounded-xl px-6 py-5 shadow-sm border border-slate-100">
                                    <p className="text-lg md:text-xl font-serif text-slate-700 leading-relaxed text-center">
                                        <InteractiveText
                                            text={panel.narration}
                                            tokens={panel.segment?.tokens}
                                            nativeLanguage={nativeLanguage}
                                            learningLanguage={learningLanguage}
                                            vocabulary={vocabulary}
                                        />
                                    </p>
                                    <div className="mt-3 pt-3 border-t border-slate-100 flex justify-center">
                                        <span className="text-[10px] text-amber-600 uppercase tracking-widest font-semibold">
                                            Tap words for translation
                                        </span>
                                    </div>
                                </div>
                            )}

                            {/* Caption if different from narration */}
                            {panel.caption && panel.caption !== panel.narration && (
                                <div className="bg-amber-50 rounded-lg px-4 py-3 mt-3 border border-amber-100">
                                    <p className="text-sm font-medium text-amber-800 text-center italic">
                                        <InteractiveText
                                            text={panel.caption}
                                            nativeLanguage={nativeLanguage}
                                            learningLanguage={learningLanguage}
                                            vocabulary={vocabulary}
                                        />
                                    </p>
                                </div>
                            )}

                            {/* Silent beat indicator */}
                            {panel.isSilent && !panel.caption && (
                                <div className="text-center py-2">
                                    <span className="text-xs text-slate-400 italic">~ silent moment ~</span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Choice Gate */}
                    {panel.beatIndex === (panel.segment.panels?.length || 1) - 1 &&
                     panel.segment.choices &&
                     panel.segment.choices.length > 0 && (
                        <div className="mt-6 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl p-5 border border-indigo-100">
                            <div className="flex items-center gap-2 mb-4">
                                <GitBranch className="w-4 h-4 text-indigo-500" />
                                <span className="text-sm font-bold text-indigo-700 uppercase tracking-wide">Choose Your Path</span>
                            </div>
                            <div className="space-y-3">
                                {panel.segment.choices.map((choice, i) => (
                                    <button
                                        key={i}
                                        onClick={() => {
                                            const targetIndex = allPanels.findIndex(p => p.segmentId === choice.targetSegmentId);
                                            if (targetIndex !== -1 && containerRef.current) {
                                                const targetElement = containerRef.current.querySelector(`[data-panel-index="${targetIndex}"]`);
                                                targetElement?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                            }
                                        }}
                                        className="w-full text-left p-4 bg-white hover:bg-indigo-500 text-slate-700 hover:text-white rounded-xl border border-indigo-200 hover:border-indigo-500 transition-all font-medium text-sm flex justify-between items-center group shadow-sm"
                                    >
                                        <InteractiveText
                                            text={choice.text}
                                            nativeLanguage={nativeLanguage}
                                            learningLanguage={learningLanguage}
                                            vocabulary={vocabulary}
                                        />
                                        <ChevronDown className="w-4 h-4 -rotate-90 opacity-0 group-hover:opacity-100 transition-all" />
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Panel separator */}
                    {idx < allPanels.length - 1 && (
                        <div className="mt-8 flex items-center justify-center">
                            <div className="h-px w-16 bg-slate-300" />
                            <div className="mx-4 w-2 h-2 rounded-full bg-slate-300" />
                            <div className="h-px w-16 bg-slate-300" />
                        </div>
                    )}
                </div>
            ))}

            {/* End of Story */}
            <div className="py-16 flex flex-col items-center justify-center text-center">
                <div className="w-20 h-20 bg-gradient-to-br from-emerald-100 to-teal-100 rounded-full flex items-center justify-center mb-6 border border-emerald-200">
                    <CheckCircle className="w-10 h-10 text-emerald-500" />
                </div>
                <h4 className="text-2xl font-black mb-3 text-slate-800">The End</h4>
                <p className="text-slate-500 text-sm mb-8 font-medium max-w-xs leading-relaxed">
                    You've reached the end of this story. Keep learning!
                </p>
                <button
                    onClick={onClose}
                    className="px-10 py-4 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl font-bold uppercase tracking-wide text-xs hover:from-amber-600 hover:to-orange-600 transition-all shadow-lg"
                >
                    Close Reader
                </button>
            </div>
        </div>
      </div>
    </div>, document.body
  );
};

export default WebtoonReader;
