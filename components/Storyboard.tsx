
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Clapperboard, Play, Volume2, Grid, Camera, Loader2, Trash2, Film, Check, RefreshCw, X, Maximize2, MoreHorizontal, Download, Eye, FileText, MicOff, GitBranch, GitMerge, ChevronDown, Sparkles, Map, History, Wand2, CornerDownLeft } from 'lucide-react';
import { StorySegment, AspectRatio, ImageSize, SegmentType, Setting } from '../types';
import SlideshowPlayer from './SlideshowPlayer';
// @ts-ignore
import html2canvas from 'html2canvas';
import { createPortal } from 'react-dom';

interface StoryboardProps {
  segments: StorySegment[];
  settings?: Setting[]; // Added settings prop to access authorized views
  onGenerateScene: (segmentId: string, options: { aspectRatio: AspectRatio, imageSize: ImageSize, referenceViewUrl?: string, continuitySegmentId?: string }) => void;
  onGenerateVideo: (segmentId: string, imageIndex: number) => void;
  onPlayAudio: (segmentId: string, text: string) => Promise<void>;
  onStopAudio: () => void;
  onSelectOption: (segmentId: string, optionIndex: number) => void;
  onDeleteAudio: (segmentId: string) => void;
  onRegeneratePrompts?: (segmentId: string, continuitySegmentId?: string) => void;
  // NEW: Handler for single panel correction
  onRegenerateSinglePanel?: (segmentId: string, panelIndex: number, instruction: string) => void;
}

const Storyboard: React.FC<StoryboardProps> = ({ 
  segments, 
  settings = [],
  onGenerateScene,
  onPlayAudio,
  onStopAudio,
  onSelectOption,
  onDeleteAudio,
  onRegeneratePrompts,
  onRegenerateSinglePanel
}) => {
  const [showPlayer, setShowPlayer] = useState(false);
  const [isTakingScreenshot, setIsTakingScreenshot] = useState(false);
  const [editingSegmentId, setEditingSegmentId] = useState<string | null>(null);
  const [generatingAudioId, setGeneratingAudioId] = useState<string | null>(null);
  
  // State for reference view selection in editor
  const [selectedReferenceView, setSelectedReferenceView] = useState<string>('');
  // State for Continuity Override
  const [selectedContinuitySegmentId, setSelectedContinuitySegmentId] = useState<string>('');

  // NEW: State for Single Panel Correction
  const [selectedPanelIndex, setSelectedPanelIndex] = useState<number | null>(null);
  const [correctionPrompt, setCorrectionPrompt] = useState('');
  const [isRegeneratingPanel, setIsRegeneratingPanel] = useState(false);

  const storyboardContentRef = useRef<HTMLDivElement>(null);

  // Reset local state when opening a new segment
  useEffect(() => {
      if (editingSegmentId) {
          setSelectedPanelIndex(null);
          setCorrectionPrompt('');
          setIsRegeneratingPanel(false);
      }
  }, [editingSegmentId]);

  // Group consecutive branches for visualization
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
    } finally { setIsTakingScreenshot(false); }
  };

  const handleSingleRegeneration = () => {
      if (!editingSegmentId || selectedPanelIndex === null || !correctionPrompt.trim() || !onRegenerateSinglePanel) return;
      
      setIsRegeneratingPanel(true);
      onRegenerateSinglePanel(editingSegmentId, selectedPanelIndex, correctionPrompt);
      
      // We don't clear the prompt immediately so user can see what they typed, 
      // but we will reset the loading state via effect or timeout if needed, 
      // though ideally the parent component update will trigger a re-render.
      setTimeout(() => {
          setIsRegeneratingPanel(false);
          setCorrectionPrompt('');
          setSelectedPanelIndex(null); // Deselect after submission
      }, 3000); // Artificial delay for UI feedback if API is fast, normally API takes longer
  };

  const editingSegment = segments.find(s => s.id === editingSegmentId);
  const associatedSetting = editingSegment ? settings.find(s => s.id === editingSegment.settingId) : null;
  
  // Get previous segments for the Continuity Dropdown
  const previousSegmentsWithImages = useMemo(() => {
      if (!editingSegment) return [];
      const currentIndex = segments.findIndex(s => s.id === editingSegment.id);
      return segments
        .slice(0, currentIndex)
        .filter(s => s.masterGridImageUrl)
        .reverse(); // Show newest first
  }, [editingSegment, segments]);

  const handleAudioClick = async (id: string, text: string) => {
    setGeneratingAudioId(id);
    try { await onPlayAudio(id, text); } finally { setGeneratingAudioId(null); }
  }

  // Helper component for the Card to reuse in different layouts
  const StoryCard = ({ segment, index }: { segment: StorySegment, index: number }) => {
    let displayImage = null;
    if (segment.generatedImageUrls && segment.generatedImageUrls.length > 0) {
        displayImage = segment.generatedImageUrls[0]; 
    } else if (segment.masterGridImageUrl) {
        displayImage = segment.masterGridImageUrl;
    }

    const isBranch = segment.type === SegmentType.BRANCH;
    const isMerge = segment.type === SegmentType.MERGE_POINT;
    const hasChoices = segment.choices && segment.choices.length > 0;

    return (
        <div className={`group relative rounded-xl overflow-hidden border transition-all shadow-lg flex flex-col w-full max-w-md mx-auto
            ${isBranch ? 'bg-indigo-900/10 border-indigo-500/50 hover:shadow-indigo-500/20' : 
              isMerge ? 'bg-purple-900/10 border-purple-500/50 hover:shadow-purple-500/20' : 
              'bg-slate-900 border-slate-800 hover:border-slate-600 hover:shadow-slate-500/10'}`}>
            
            <div className="absolute top-2 right-2 z-10 flex gap-2">
                {isBranch && <div className="w-6 h-6 bg-indigo-600 rounded-full flex items-center justify-center text-white shadow-lg"><GitBranch className="w-3 h-3" /></div>}
                {isMerge && <div className="w-6 h-6 bg-purple-600 rounded-full flex items-center justify-center text-white shadow-lg"><GitMerge className="w-3 h-3" /></div>}
                <div className="w-6 h-6 bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center text-[10px] font-bold text-white border border-white/20">
                    {index + 1}
                </div>
            </div>

            <div 
                onClick={() => setEditingSegmentId(segment.id)}
                className="relative w-full aspect-[16/9] bg-black cursor-pointer overflow-hidden group-image"
            >
                {displayImage ? (
                    <img src={displayImage} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" alt="Panel" />
                ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-slate-800 text-slate-500 gap-2">
                        {segment.isGenerating ? (
                            <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                        ) : (
                            <>
                                <Grid className="w-8 h-8 opacity-20" />
                                <span className="text-[10px] uppercase font-bold tracking-widest opacity-50">Click to Generate</span>
                            </>
                        )}
                    </div>
                )}
                 <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <div className="bg-black/60 rounded-full p-2 backdrop-blur-sm border border-white/10">
                        <Maximize2 className="w-4 h-4 text-white" />
                    </div>
                 </div>
            </div>

            <div className="p-4 bg-slate-900/90 min-h-[100px] flex flex-col justify-between border-t border-white/5">
                 <div>
                     <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
                         {segment.settingId ? `SCENE: ${segment.settingId.slice(0, 8)}...` : 'NARRATION'}
                         {hasChoices && <span className="text-indigo-400 text-[10px] font-bold flex items-center gap-1"><GitBranch className="w-3 h-3"/> CHOICE POINT</span>}
                     </h4>
                     <p className="text-xs text-slate-300 font-serif leading-relaxed line-clamp-3">
                         {segment.text}
                     </p>
                 </div>
                 {hasChoices && (
                     <div className="mt-3 flex gap-2 flex-wrap">
                         {segment.choices?.map((c, i) => (
                             <span key={i} className="text-[9px] bg-indigo-500/20 text-indigo-300 px-2 py-1 rounded border border-indigo-500/30 flex-1 text-center">
                                 {c.text}
                             </span>
                         ))}
                     </div>
                 )}
            </div>
        </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center sticky top-0 z-10 bg-[#0f172a]/95 backdrop-blur py-4 border-b border-slate-800">
        <div>
           <h2 className="text-2xl font-serif italic text-white">Narrative Flow</h2>
           <p className="text-xs text-slate-500 uppercase tracking-widest">{segments.length} INTERACTIVE NODES</p>
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
        {/* Central timeline line */}
        <div className="absolute top-0 bottom-0 left-1/2 w-0.5 bg-slate-800 -z-10 transform -translate-x-1/2"></div>

        {flowRows.map((row, rowIndex) => {
            if (row.type === 'SINGLE') {
                const segment = row.items[0];
                const index = segments.findIndex(s => s.id === segment.id);
                return (
                    <div key={segment.id} className="w-full flex flex-col items-center">
                        {/* Vertical Connector Input */}
                        {rowIndex > 0 && <div className="h-8 w-0.5 bg-slate-700"></div>}
                        
                        <div className="relative z-0 my-2">
                             <StoryCard segment={segment} index={index} />
                             {/* Arrow Down Indicator */}
                             {rowIndex < flowRows.length - 1 && (
                                <div className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 text-slate-600">
                                    <ChevronDown className="w-6 h-6" />
                                </div>
                             )}
                        </div>
                    </div>
                );
            } else {
                // BRANCH GROUP
                return (
                    <div key={`group-${rowIndex}`} className="w-full flex flex-col items-center my-4">
                        {/* Branch Split Visuals */}
                        <div className="relative w-full max-w-4xl h-8 mb-4">
                            {/* Vertical line coming from top */}
                            <div className="absolute left-1/2 -top-4 bottom-0 w-0.5 bg-slate-700 transform -translate-x-1/2"></div>
                            {/* Horizontal bar connecting branches */}
                            <div className="absolute bottom-1/2 left-[25%] right-[25%] h-0.5 bg-slate-700 border-t border-indigo-900/50"></div>
                            {/* Vertical droppers to cards */}
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
                                )
                            })}
                        </div>
                        
                        {/* Merge Connector Lines */}
                        <div className="relative w-full max-w-4xl h-8 mt-4">
                             {/* Vertical risers from cards */}
                            <div className="absolute left-[25%] top-[-16px] bottom-1/2 w-0.5 bg-slate-700"></div>
                            <div className="absolute right-[25%] top-[-16px] bottom-1/2 w-0.5 bg-slate-700"></div>
                             {/* Horizontal merge bar */}
                            <div className="absolute top-1/2 left-[25%] right-[25%] h-0.5 bg-slate-700"></div>
                             {/* Vertical line going down to next node */}
                            <div className="absolute left-1/2 top-1/2 bottom-0 w-0.5 bg-slate-700 transform -translate-x-1/2"></div>
                        </div>
                    </div>
                );
            }
        })}
      </div>

      {editingSegment && (
        createPortal(
            <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={() => setEditingSegmentId(null)}>
                <div className="bg-slate-900 w-full max-w-5xl max-h-[90vh] rounded-2xl border border-slate-700 shadow-2xl overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
                    
                    <div className="flex justify-between items-center p-6 border-b border-slate-800 bg-slate-950">
                        <div>
                            <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest">Interactive Editor</span>
                            <h3 className="text-xl font-bold text-white">Scene {segments.findIndex(s => s.id === editingSegmentId) + 1} Breakdown</h3>
                        </div>
                        <button onClick={() => setEditingSegmentId(null)} className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-400 hover:text-white">
                            <X className="w-6 h-6" />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-2 gap-8">
                        
                        <div className="space-y-6">
                            <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
                                <h4 className="text-sm font-bold text-white mb-4 flex items-center justify-between">
                                    <span className="flex items-center gap-2"><Grid className="w-4 h-4 text-indigo-400" /> Master Grid (Select to Edit)</span>
                                    
                                    <div className="flex items-center gap-2">
                                        {editingSegment.masterGridImageUrl && !editingSegment.isGenerating && (
                                            <button 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onGenerateScene(editingSegment.id, { 
                                                        aspectRatio: AspectRatio.MOBILE, 
                                                        imageSize: ImageSize.K1,
                                                        referenceViewUrl: selectedReferenceView || undefined,
                                                        continuitySegmentId: selectedContinuitySegmentId || undefined
                                                    });
                                                }}
                                                className="text-[10px] bg-slate-700 hover:bg-indigo-600 text-white px-3 py-1.5 rounded-full font-bold flex items-center gap-1 transition-colors shadow-sm border border-slate-600 hover:border-indigo-500"
                                                title="Regenerate Full Grid (All 4 Panels)"
                                            >
                                                <RefreshCw className="w-3 h-3" />
                                                Regen All
                                            </button>
                                        )}

                                        {selectedPanelIndex !== null && (
                                            <span className="text-[10px] bg-indigo-500 text-white px-2 py-0.5 rounded animate-pulse">
                                                Editing #{selectedPanelIndex + 1}
                                            </span>
                                        )}
                                    </div>
                                </h4>
                                
                                <div className="aspect-[9/16] bg-black rounded-lg overflow-hidden relative border border-slate-700 shadow-inner group">
                                     {editingSegment.generatedImageUrls && editingSegment.generatedImageUrls.length === 4 ? (
                                         // RENDER 2x2 GRID OF INDIVIDUAL IMAGES
                                         <div className="grid grid-cols-2 grid-rows-2 w-full h-full">
                                             {editingSegment.generatedImageUrls.map((imgUrl, idx) => (
                                                 <div 
                                                    key={idx}
                                                    onClick={() => setSelectedPanelIndex(idx)}
                                                    className={`relative w-full h-full cursor-pointer transition-all border-2 
                                                        ${selectedPanelIndex === idx ? 'border-indigo-500 z-10 scale-[1.02] shadow-2xl' : 'border-transparent hover:border-white/30'}
                                                    `}
                                                 >
                                                     <img src={imgUrl} className="w-full h-full object-cover" />
                                                     <div className="absolute bottom-2 left-2 bg-black/60 text-white/90 px-2 py-0.5 rounded text-[10px] font-mono backdrop-blur-sm border border-white/10 pointer-events-none">
                                                         #{idx + 1}
                                                     </div>
                                                     {isRegeneratingPanel && selectedPanelIndex === idx && (
                                                         <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center backdrop-blur-sm">
                                                             <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
                                                         </div>
                                                     )}
                                                 </div>
                                             ))}
                                         </div>
                                     ) : editingSegment.masterGridImageUrl ? (
                                         // FALLBACK TO MASTER GRID IF CROPS MISSING (Should be rare)
                                         <>
                                            <img src={editingSegment.masterGridImageUrl} className={`w-full h-full object-contain transition-all duration-500 ${editingSegment.isGenerating ? 'opacity-30 blur-sm scale-105' : ''}`} />
                                            {/* Static overlay for beats */}
                                            <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 pointer-events-none">
                                                {Array.from({ length: 4 }).map((_, i) => (
                                                    <div key={i} className="relative border border-white/10">
                                                        <div className="absolute bottom-2 left-2 bg-black/60 text-white/90 px-2 py-0.5 rounded text-[10px] font-mono backdrop-blur-sm border border-white/10">
                                                            Beat #{i + 1}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                         </>
                                     ) : (
                                         <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 p-8 text-center">
                                             <Film className="w-12 h-12 mb-4 opacity-20" />
                                             <p className="text-sm mb-4">Generate 4 distinct beats for this segment.</p>
                                             <button 
                                                onClick={() => onGenerateScene(editingSegment.id, { 
                                                    aspectRatio: AspectRatio.MOBILE, 
                                                    imageSize: ImageSize.K1,
                                                    referenceViewUrl: selectedReferenceView || undefined,
                                                    continuitySegmentId: selectedContinuitySegmentId || undefined
                                                })}
                                                disabled={editingSegment.isGenerating}
                                                className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 rounded-lg font-bold text-sm transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                             >
                                                 {editingSegment.isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                                                 {editingSegment.isGenerating ? 'Generating...' : 'Generate Panels'}
                                             </button>
                                         </div>
                                     )}

                                     {/* Default Loading Overlay */}
                                     {editingSegment.isGenerating && (
                                        <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-black/40 backdrop-blur-sm pointer-events-none">
                                            <Loader2 className="w-10 h-10 animate-spin text-indigo-500 mb-2" />
                                            <span className="text-xs font-bold text-indigo-400 tracking-widest uppercase animate-pulse">Regenerating Scene...</span>
                                        </div>
                                     )}
                                </div>

                                {/* NEW: Single Panel Correction Input */}
                                {selectedPanelIndex !== null && (
                                    <div className="mt-4 p-4 bg-indigo-900/20 border border-indigo-500/30 rounded-lg animate-in fade-in slide-in-from-top-2">
                                        <div className="flex items-center justify-between mb-2">
                                            <label className="text-xs font-bold text-indigo-300 uppercase tracking-wider flex items-center gap-2">
                                                <Wand2 className="w-3 h-3" />
                                                Correction for Panel {selectedPanelIndex + 1}
                                            </label>
                                            <button onClick={() => setSelectedPanelIndex(null)} className="text-slate-500 hover:text-white"><X className="w-3 h-3" /></button>
                                        </div>
                                        <div className="flex gap-2">
                                            <input 
                                                type="text" 
                                                value={correctionPrompt}
                                                onChange={(e) => setCorrectionPrompt(e.target.value)}
                                                onKeyDown={(e) => { if(e.key === 'Enter') handleSingleRegeneration(); }}
                                                placeholder="E.g., 'Make her climb the stairs instead of descending'..."
                                                className="flex-1 bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                                                autoFocus
                                            />
                                            <button 
                                                onClick={handleSingleRegeneration}
                                                disabled={!correctionPrompt.trim() || isRegeneratingPanel}
                                                className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded font-bold text-xs flex items-center gap-2 disabled:opacity-50"
                                            >
                                                {isRegeneratingPanel ? <Loader2 className="w-3 h-3 animate-spin" /> : <CornerDownLeft className="w-3 h-3" />}
                                                FIX
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="space-y-6">
                            
                            {/* Composition Control Panel (With Continuity Override) */}
                            <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700/50 space-y-6">
                                <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-widest flex items-center gap-2 border-b border-slate-700/50 pb-2">
                                    <Map className="w-4 h-4" />
                                    Composition Control
                                </h4>
                                
                                {/* 1. Background Reference */}
                                {associatedSetting && associatedSetting.authorizedViews && associatedSetting.authorizedViews.length > 0 ? (
                                    <div className="space-y-3">
                                        <label className="text-xs text-slate-400 font-bold block">1. Environment Consistency (Background)</label>
                                        <select 
                                            value={selectedReferenceView}
                                            onChange={(e) => setSelectedReferenceView(e.target.value)}
                                            className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-sm text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                                        >
                                            <option value="">Auto (Creative Freedom)</option>
                                            {associatedSetting.authorizedViews.map(view => (
                                                <option key={view.id} value={view.imageUrl}>
                                                    Force View: {view.name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                ) : (
                                    <p className="text-xs text-slate-500 italic">
                                        No Master Asset Views generated for this setting yet.
                                    </p>
                                )}

                                {/* 2. NEW: Continuity Override (Character/Outfit) */}
                                <div className="space-y-3">
                                    <label className="text-xs text-slate-400 font-bold block flex items-center gap-2">
                                        2. Character Continuity (Outfit/Items)
                                        <span className="text-[9px] bg-indigo-500/20 text-indigo-300 px-1.5 rounded uppercase">Forensic Override</span>
                                    </label>
                                    <div className="relative">
                                        <select 
                                            value={selectedContinuitySegmentId}
                                            onChange={(e) => setSelectedContinuitySegmentId(e.target.value)}
                                            className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 pl-9 text-sm text-white focus:ring-2 focus:ring-indigo-500 outline-none appearance-none"
                                        >
                                            <option value="">Auto (Use Previous Scene)</option>
                                            {previousSegmentsWithImages.map((seg, idx) => (
                                                <option key={seg.id} value={seg.id}>
                                                     Scene {segments.findIndex(s => s.id === seg.id) + 1}: {seg.text.substring(0, 30)}...
                                                </option>
                                            ))}
                                        </select>
                                        <History className="w-4 h-4 text-slate-500 absolute left-3 top-2.5 pointer-events-none" />
                                    </div>
                                    <p className="text-[10px] text-slate-500 leading-relaxed">
                                        If the previous scene (N-1) showed a different character (e.g. Villain), select an older scene here to force the AI to copy the Main Character's outfit/items from that specific image.
                                    </p>
                                    
                                    {/* Preview selected continuity image */}
                                    {selectedContinuitySegmentId && (
                                        <div className="mt-2 p-2 bg-slate-900 rounded-lg border border-slate-700 flex gap-3 items-center">
                                            <div className="w-10 h-10 rounded overflow-hidden shrink-0 border border-slate-600">
                                                <img 
                                                    src={segments.find(s => s.id === selectedContinuitySegmentId)?.masterGridImageUrl} 
                                                    className="w-full h-full object-cover" 
                                                />
                                            </div>
                                            <div className="text-[10px] text-indigo-300">
                                                <span className="font-bold">Active Reference:</span> Scene {segments.findIndex(s => s.id === selectedContinuitySegmentId) + 1}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {editingSegment.panels && editingSegment.panels.length > 0 && (
                                <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700/50">
                                     <div className="flex items-center justify-between mb-4">
                                        <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-2">
                                            <FileText className="w-4 h-4" />
                                            Beat Breakdown
                                        </h4>
                                        {onRegeneratePrompts && (
                                            <button 
                                                onClick={() => onRegeneratePrompts(editingSegment.id, selectedContinuitySegmentId || undefined)}
                                                disabled={editingSegment.isGenerating}
                                                className="text-[10px] font-bold text-slate-400 hover:text-white flex items-center gap-1 bg-slate-700/50 px-2 py-1 rounded hover:bg-indigo-600 transition-colors disabled:opacity-50"
                                            >
                                                {editingSegment.isGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                                                REFINE PROMPTS
                                            </button>
                                        )}
                                     </div>
                                     <div className="space-y-3">
                                        {editingSegment.panels.map((panel, idx) => (
                                            <div 
                                                key={idx} 
                                                onClick={() => setSelectedPanelIndex(idx)}
                                                className={`flex gap-4 items-start p-3 rounded-lg border cursor-pointer transition-all
                                                    ${selectedPanelIndex === idx 
                                                        ? 'bg-indigo-900/30 border-indigo-500' 
                                                        : 'bg-slate-900 border-slate-700 hover:border-slate-500'}
                                                `}
                                            >
                                                <div className={`text-[10px] font-bold px-2 py-1 rounded uppercase shrink-0 mt-0.5 border
                                                    ${idx === 0 ? 'bg-indigo-900/50 text-indigo-200 border-indigo-700' : 
                                                      idx === 1 ? 'bg-indigo-900/50 text-indigo-200 border-indigo-700' : 
                                                      idx === 2 ? 'bg-purple-900/50 text-purple-200 border-purple-700' : 
                                                      'bg-purple-900/50 text-purple-200 border-purple-700'}`}>
                                                    Beat {idx + 1}
                                                </div>
                                                <div className="space-y-2 w-full">
                                                    <div className="flex items-center gap-2">
                                                        {panel.caption ? (
                                                            <p className="text-sm text-white font-serif italic">"{panel.caption}"</p>
                                                        ) : (
                                                            <p className="text-xs text-slate-500 flex items-center gap-1">
                                                                <MicOff className="w-3 h-3" /> Silent Panel (Visual Only)
                                                            </p>
                                                        )}
                                                    </div>
                                                    <p className="text-[10px] text-slate-400 leading-tight border-l-2 border-slate-700 pl-2">
                                                        <span className="font-bold text-slate-500">Visual:</span> {panel.visualPrompt}
                                                    </p>
                                                </div>
                                            </div>
                                        ))}
                                     </div>
                                </div>
                            )}
                            
                            {editingSegment.choices && editingSegment.choices.length > 0 && (
                                <div className="bg-indigo-900/20 rounded-xl p-6 border border-indigo-500/30">
                                     <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                        <GitBranch className="w-4 h-4" />
                                        Interactive Choices
                                     </h4>
                                     <div className="space-y-2">
                                         {editingSegment.choices.map((choice, i) => (
                                             <div key={i} className="bg-slate-900 p-3 rounded border border-slate-700 flex justify-between items-center">
                                                 <span className="text-sm text-white font-bold">{choice.text}</span>
                                                 <span className="text-[10px] text-slate-500 font-mono">ID: {choice.targetSegmentId}</span>
                                             </div>
                                         ))}
                                     </div>
                                </div>
                            )}

                            <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700/50">
                                <h4 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                                    <Volume2 className="w-4 h-4 text-emerald-400" />
                                    Narration Audio (Full Segment)
                                </h4>
                                
                                <div className="flex items-center gap-4">
                                     <button 
                                        onClick={() => handleAudioClick(editingSegment.id, editingSegment.text)} 
                                        disabled={generatingAudioId === editingSegment.id}
                                        className={`flex-1 py-3 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all
                                            ${editingSegment.audioUrl 
                                                ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-600/30 hover:bg-emerald-600/30' 
                                                : 'bg-indigo-600 text-white hover:bg-indigo-500'}`}
                                     >
                                        {generatingAudioId === editingSegment.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
                                        {editingSegment.audioUrl ? 'Play Audio' : 'Generate Audio'}
                                     </button>
                                     
                                     {editingSegment.audioUrl && (
                                         <button onClick={() => onDeleteAudio(editingSegment.id)} className="p-3 bg-slate-700 hover:bg-red-500/20 hover:text-red-400 rounded-lg transition-colors text-slate-400">
                                             <Trash2 className="w-4 h-4" />
                                         </button>
                                     )}
                                </div>
                            </div>

                        </div>

                    </div>
                    
                    <div className="p-4 border-t border-slate-800 bg-slate-950 flex justify-end">
                        <button onClick={() => setEditingSegmentId(null)} className="px-6 py-2 bg-white text-slate-900 font-bold rounded-lg hover:bg-slate-200 transition-colors">
                            Done
                        </button>
                    </div>
                </div>
            </div>,
            document.body
        )
      )}

      {showPlayer && <SlideshowPlayer segments={segments} onClose={() => setShowPlayer(false)} onPlayAudio={onPlayAudio} onStopAudio={onStopAudio} />}
    </div>
  );
};

export default Storyboard;
