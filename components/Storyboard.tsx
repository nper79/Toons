import React, { useMemo, useRef, useState } from 'react';
import { Play, Grid, Loader2, Download, ChevronDown, GitBranch, GitMerge, Image, Square, Sparkles, Focus, Zap, SplitSquareHorizontal, Eye, EyeOff } from 'lucide-react';
import { StorySegment, SegmentType, BackgroundType } from '../types';
import SlideshowPlayer from './SlideshowPlayer';
// @ts-ignore
import html2canvas from 'html2canvas';

// Background type badge styling
const getBackgroundBadge = (bgType?: BackgroundType) => {
  switch (bgType) {
    case 'WHITE':
      return { icon: Square, label: 'White', color: 'bg-slate-100 text-slate-800' };
    case 'GRADIENT':
      return { icon: Sparkles, label: 'Gradient', color: 'bg-purple-500/20 text-purple-300' };
    case 'BOKEH':
      return { icon: Focus, label: 'Bokeh', color: 'bg-blue-500/20 text-blue-300' };
    case 'SPEEDLINES':
      return { icon: Zap, label: 'Action', color: 'bg-orange-500/20 text-orange-300' };
    case 'SPLIT':
      return { icon: SplitSquareHorizontal, label: 'Split', color: 'bg-pink-500/20 text-pink-300' };
    case 'DETAILED':
    default:
      return { icon: Image, label: 'Detailed', color: 'bg-emerald-500/20 text-emerald-300' };
  }
};

interface StoryboardProps {
  segments: StorySegment[];
  onGenerateScene: (segmentId: string) => void;
  onPlayAudio: (segmentId: string, text: string) => Promise<void>;
  onStopAudio: () => void;
}

const Storyboard: React.FC<StoryboardProps> = ({
  segments,
  onGenerateScene,
  onPlayAudio,
  onStopAudio
}) => {
  const [showPlayer, setShowPlayer] = useState(false);
  const [isTakingScreenshot, setIsTakingScreenshot] = useState(false);
  const storyboardContentRef = useRef<HTMLDivElement>(null);

  const flowRows = useMemo(() => {
    const rows: { type: 'SINGLE' | 'BRANCH_GROUP', items: StorySegment[] }[] = [];
    let currentBranches: StorySegment[] = [];

    segments.forEach((seg) => {
      if (seg.type === SegmentType.BRANCH) {
        currentBranches.push(seg);
      } else {
        if (currentBranches.length > 0) {
          rows.push({ type: 'BRANCH_GROUP', items: [...currentBranches] });
          currentBranches = [];
        }
        rows.push({ type: 'SINGLE', items: [seg] });
      }
    });
    if (currentBranches.length > 0) {
      rows.push({ type: 'BRANCH_GROUP', items: [...currentBranches] });
    }
    return rows;
  }, [segments]);

  const handleScreenshot = async () => {
    if (!storyboardContentRef.current) return;
    setIsTakingScreenshot(true);
    try {
      const canvas = await html2canvas(storyboardContentRef.current, { useCORS: true, backgroundColor: '#0f172a', scale: 2 });
      const link = document.createElement('a');
      link.href = canvas.toDataURL("image/png");
      link.download = `manhwa-flow-${new Date().getTime()}.png`;
      link.click();
    } finally {
      setIsTakingScreenshot(false);
    }
  };

  const getPrimaryImage = (segment: StorySegment) => {
    const urls = segment.generatedImageUrls || [];
    const fromGenerated = urls.find(url => url && url.trim().length > 0);
    return fromGenerated || segment.masterGridImageUrl || null;
  };

  const StoryCard = ({ segment, index }: { segment: StorySegment, index: number }) => {
    const [showPrompt, setShowPrompt] = useState(false);
    const displayImage = getPrimaryImage(segment);
    const isBranch = segment.type === SegmentType.BRANCH;
    const isMerge = segment.type === SegmentType.MERGE_POINT;
    const hasChoices = segment.choices && segment.choices.length > 0;
    const hasImage = !!displayImage;
    const displayText = segment.text && segment.text.trim().length > 0 ? segment.text : 'Silent beat (no dialog)';
    const isSilentBeat = !segment.text || segment.text.trim().length === 0;

    // Get background type and visual prompt from first panel
    const panel = segment.panels?.[0];
    const bgType = panel?.backgroundType as BackgroundType;
    const bgBadge = getBackgroundBadge(bgType);
    const visualPrompt = panel?.visualPrompt || '';

    return (
      <div className={`group relative rounded-xl overflow-hidden border transition-all shadow-lg flex flex-col w-full max-w-md mx-auto
          ${isBranch ? 'bg-indigo-900/10 border-indigo-500/50 hover:shadow-indigo-500/20' :
            isMerge ? 'bg-purple-900/10 border-purple-500/50 hover:shadow-purple-500/20' :
            'bg-slate-900 border-slate-800 hover:border-slate-600 hover:shadow-slate-500/10'}`}>

        <div className="absolute top-2 right-2 z-10 flex gap-2">
          {/* Background Type Badge */}
          {(() => {
            const IconComponent = bgBadge.icon;
            return (
              <div className={`px-2 py-0.5 rounded-full flex items-center gap-1 text-[9px] font-bold ${bgBadge.color} border border-white/10`}>
                <IconComponent className="w-3 h-3" />
                {bgBadge.label}
              </div>
            );
          })()}
          {isSilentBeat && <div className="px-2 py-0.5 bg-amber-500/20 text-amber-300 rounded-full text-[9px] font-bold border border-amber-500/30">SILENT</div>}
          {isBranch && <div className="w-6 h-6 bg-indigo-600 rounded-full flex items-center justify-center text-white shadow-lg"><GitBranch className="w-3 h-3" /></div>}
          {isMerge && <div className="w-6 h-6 bg-purple-600 rounded-full flex items-center justify-center text-white shadow-lg"><GitMerge className="w-3 h-3" /></div>}
          <div className="w-6 h-6 bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center text-[10px] font-bold text-white border border-white/20">
            {index + 1}
          </div>
        </div>

        <div className="relative w-full aspect-[16/9] bg-black overflow-hidden group-image">
          {displayImage ? (
            <img src={displayImage} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" alt="Scene preview" />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center bg-slate-800 text-slate-500 gap-2">
              {segment.isGenerating ? (
                <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
              ) : (
                <>
                  <Grid className="w-8 h-8 opacity-20" />
                  <span className="text-[10px] uppercase font-bold tracking-widest opacity-50">No image yet</span>
                </>
              )}
            </div>
          )}
        </div>

        <div className="p-4 bg-slate-900/90 min-h-[120px] flex flex-col justify-between border-t border-white/5">
          <div>
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
              {segment.settingId ? `SCENE: ${segment.settingId.slice(0, 8)}...` : 'NARRATION'}
              <div className="flex items-center gap-2">
                {hasChoices && <span className="text-indigo-400 text-[10px] font-bold flex items-center gap-1"><GitBranch className="w-3 h-3" /> CHOICE</span>}
                {visualPrompt && (
                  <button
                    onClick={() => setShowPrompt(!showPrompt)}
                    className="text-slate-500 hover:text-slate-300 transition-colors"
                    title={showPrompt ? "Hide prompt" : "Show prompt"}
                  >
                    {showPrompt ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  </button>
                )}
              </div>
            </h4>
            <p className="text-xs text-slate-300 font-serif leading-relaxed line-clamp-3">
              {displayText}
            </p>
          </div>

          {/* Visual Prompt Debug Info */}
          {showPrompt && visualPrompt && (
            <div className="mt-2 p-2 bg-slate-800/50 rounded border border-slate-700/50 space-y-1">
              <p className="text-[10px] text-cyan-400 font-mono leading-relaxed">
                <span className="text-slate-500">PROMPT:</span> {visualPrompt}
              </p>
              {panel?.cameraAngle && (
                <p className="text-[10px] text-amber-400 font-mono">
                  <span className="text-slate-500">CAMERA:</span> {panel.cameraAngle}
                </p>
              )}
              {segment.costumeOverride && (
                <p className="text-[10px] text-pink-400 font-mono">
                  <span className="text-slate-500">COSTUME:</span> {segment.costumeOverride}
                </p>
              )}
            </div>
          )}

          {hasChoices && (
            <div className="mt-3 flex gap-2 flex-wrap">
              {segment.choices?.map((c, i) => (
                <span key={i} className="text-[9px] bg-indigo-500/20 text-indigo-300 px-2 py-1 rounded border border-indigo-500/30 flex-1 text-center">
                  {c.text}
                </span>
              ))}
            </div>
          )}

          <button
            onClick={() => onGenerateScene(segment.id)}
            disabled={segment.isGenerating}
            className={`mt-4 flex items-center justify-center gap-2 w-full py-2 rounded-lg text-xs font-bold transition-all
              ${segment.isGenerating
                ? 'bg-slate-800 text-slate-500'
                : hasImage
                  ? 'bg-indigo-600 text-white hover:bg-indigo-500'
                  : 'bg-emerald-600 text-white hover:bg-emerald-500'}`}
          >
            {segment.isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Grid className="w-4 h-4" />}
            {segment.isGenerating ? 'Generating...' : hasImage ? 'Regenerate Scene' : 'Generate Scene'}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center sticky top-0 z-10 bg-[#0f172a]/95 backdrop-blur py-4 border-b border-slate-800">
        <div>
          <h2 className="text-2xl font-serif italic text-white">Narrative Flow</h2>
          <p className="text-xs text-slate-500 uppercase tracking-widest">{segments.length} SCENES</p>
        </div>
        <div className="flex gap-4 items-center">
          <button onClick={handleScreenshot} disabled={isTakingScreenshot} className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 rounded-full flex items-center gap-2 text-xs font-bold transition-all border border-slate-700">
            {isTakingScreenshot ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            DOWNLOAD FLOW
          </button>
          <button onClick={() => setShowPlayer(true)} className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2 rounded-full flex items-center gap-2 font-bold text-xs transition-all shadow-lg shadow-emerald-500/25 ring-2 ring-emerald-500/20">
            <Play className="w-4 h-4 fill-current" /> PLAY EXPERIENCE
          </button>
        </div>
      </div>

      <div ref={storyboardContentRef} className="pb-32 px-4 flex flex-col items-center relative">
        <div className="absolute top-0 bottom-0 left-1/2 w-0.5 bg-slate-800 -z-10 transform -translate-x-1/2"></div>

        {flowRows.map((row, rowIndex) => {
          if (row.type === 'SINGLE') {
            const segment = row.items[0];
            const index = segments.findIndex(s => s.id === segment.id);
            return (
              <div key={segment.id} className="w-full flex flex-col items-center">
                {rowIndex > 0 && <div className="h-8 w-0.5 bg-slate-700"></div>}
                <div className="relative z-0 my-2">
                  <StoryCard segment={segment} index={index} />
                  {rowIndex < flowRows.length - 1 && (
                    <div className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 text-slate-600">
                      <ChevronDown className="w-6 h-6" />
                    </div>
                  )}
                </div>
              </div>
            );
          }

          return (
            <div key={`group-${rowIndex}`} className="w-full flex flex-col items-center my-4">
              <div className="relative w-full max-w-4xl h-8 mb-4">
                <div className="absolute left-1/2 -top-4 bottom-0 w-0.5 bg-slate-700 transform -translate-x-1/2"></div>
                <div className="absolute bottom-1/2 left-[25%] right-[25%] h-0.5 bg-slate-700 border-t border-indigo-900/50"></div>
                <div className="absolute left-[25%] top-1/2 bottom-[-16px] w-0.5 bg-slate-700"></div>
                <div className="absolute right-[25%] top-1/2 bottom-[-16px] w-0.5 bg-slate-700"></div>
              </div>

              <div className="flex gap-8 justify-center w-full max-w-6xl">
                {row.items.map((segment) => {
                  const index = segments.findIndex(s => s.id === segment.id);
                  return (
                    <div key={segment.id} className="flex-1 flex justify-center min-w-[300px]">
                      <StoryCard segment={segment} index={index} />
                    </div>
                  );
                })}
              </div>

              <div className="relative w-full max-w-4xl h-8 mt-4">
                <div className="absolute left-[25%] top-[-16px] bottom-1/2 w-0.5 bg-slate-700"></div>
                <div className="absolute right-[25%] top-[-16px] bottom-1/2 w-0.5 bg-slate-700"></div>
                <div className="absolute top-1/2 left-[25%] right-[25%] h-0.5 bg-slate-700"></div>
                <div className="absolute left-1/2 top-1/2 bottom-0 w-0.5 bg-slate-700 transform -translate-x-1/2"></div>
              </div>
            </div>
          );
        })}
      </div>

      {showPlayer && <SlideshowPlayer segments={segments} onClose={() => setShowPlayer(false)} onPlayAudio={onPlayAudio} onStopAudio={onStopAudio} />}
    </div>
  );
};

export default Storyboard;
