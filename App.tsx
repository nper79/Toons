
import React, { useState, useEffect, useRef } from 'react';
import { Layout, Clapperboard, Layers, ChevronRight, Key, ExternalLink, Download, Upload, XCircle, CheckCircle, Info, AlertTriangle, Users, BookOpen, PenTool } from 'lucide-react';
import StoryInput from './components/StoryInput';
import AssetGallery from './components/AssetGallery';
import Storyboard from './components/Storyboard';
import { StoryData, ProcessingStatus, AspectRatio, ImageSize } from './types';
import * as GeminiService from './services/geminiService';
import * as StorageService from './services/storageService';
import { cropGridCell } from './utils/imageUtils';

enum Tab {
  INPUT = 'input',
  ASSETS = 'assets',
  STORYBOARD = 'storyboard'
}

interface AIStudio {
  hasSelectedApiKey(): Promise<boolean>;
  openSelectKey(): Promise<void>;
}

export default function App() {
  const [hasApiKey, setHasApiKey] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>(Tab.INPUT);
  const [status, setStatus] = useState<ProcessingStatus>(ProcessingStatus.IDLE);
  const [storyData, setStoryData] = useState<StoryData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<{ id: string, type: string, message: string }[]>([]);
  const [selectedVoice, setSelectedVoice] = useState('Puck');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addToast = (message: string, type: string = 'info') => {
      const id = Math.random().toString(36).substring(7);
      setToasts(prev => [...prev, { id, type, message }]);
      setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 6000);
  };

  useEffect(() => {
    const checkKey = async () => {
      const aistudio = (window as any).aistudio as AIStudio | undefined;
      if (aistudio) {
        try {
          const selected = await aistudio.hasSelectedApiKey();
          if (selected) setHasApiKey(true);
        } catch (e) { console.error("Error checking API key:", e); }
      }
    };
    checkKey();
    const cleanupBackground = () => {
        const canvases = document.querySelectorAll('body > canvas');
        canvases.forEach((c: any) => {
            c.style.display = 'none';
            if(c.parentNode) c.parentNode.removeChild(c);
        });
    };
    cleanupBackground();
    const interval = setInterval(cleanupBackground, 500);
    return () => clearInterval(interval);
  }, []);

  const handleSelectKey = async () => {
    const aistudio = (window as any).aistudio as AIStudio | undefined;
    if (aistudio) {
      try {
        await aistudio.openSelectKey();
        setHasApiKey(true);
      } catch (e) { console.error("Error selecting API key:", e); }
    }
  };

  const handleAnalyzeStory = async (text: string, style: string) => {
    setStatus(ProcessingStatus.ANALYZING);
    setError(null);
    addToast("Decomposing narrative structure...", "info");
    try {
      const data = await GeminiService.analyzeStoryText(text, style);
      const initializedSegments = data.segments.map(s => ({
          ...s,
          selectedGridIndices: [],
          generatedImageUrls: []
      }));
      setStoryData({ ...data, segments: initializedSegments });
      setStatus(ProcessingStatus.READY);
      setActiveTab(Tab.ASSETS);
      addToast("Analysis complete.", "success");
    } catch (error: any) {
      setStatus(ProcessingStatus.ERROR);
      setError("Analysis failed. Try shortening the text.");
      addToast("Analysis failed.", "error");
    }
  };

  const handleUploadAsset = (type: 'character' | 'setting', id: string, file: File) => {
    if (!storyData) return;
    
    // Validate file type
    if (!file.type.startsWith('image/')) {
        addToast("Please upload a valid image file", "error");
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        const result = e.target?.result as string;
        if (result) {
            setStoryData(prev => {
                if (!prev) return null;
                if (type === 'character') {
                    return {
                        ...prev,
                        characters: prev.characters.map(c => c.id === id ? { ...c, imageUrl: result } : c)
                    };
                } else {
                    return {
                        ...prev,
                        settings: prev.settings.map(s => s.id === id ? { ...s, imageUrl: result } : s)
                    };
                }
            });
            addToast("Asset uploaded successfully", "success");
        }
    };
    reader.onerror = () => addToast("Failed to read file", "error");
    reader.readAsDataURL(file);
  };

  const handleGenerateCharacter = async (id: string) => {
    if (!storyData) return;
    setStoryData(prev => prev ? ({ ...prev, characters: prev.characters.map(c => c.id === id ? { ...c, isGenerating: true } : c) }) : null);
    addToast("Generating character sheet...", "info");
    try {
      const char = storyData.characters.find(c => c.id === id);
      if (!char) return;
      
      const prompt = `Professional Manhwa Character Design Sheet for: ${char.name}.
      VISUAL STYLE: High-quality Korean Webtoon / Anime style. Cel-shaded coloring. Sharp, clean line art.
      LAYOUT REQUIREMENT: 4 distinct poses (Front, Side, Back, Face) on a pure solid WHITE background.
      CHARACTER DETAILS: ${char.description}.`;

      const imageUrl = await GeminiService.generateImage(
          prompt, 
          AspectRatio.WIDE, 
          ImageSize.K1, 
          [], 
          storyData.visualStyleGuide, 
          storyData.cinematicDNA, 
          false
      );

      setStoryData(prev => prev ? ({ ...prev, characters: prev.characters.map(c => c.id === id ? { ...c, imageUrl, isGenerating: false } : c) }) : null);
    } catch (e) {
      setStoryData(prev => prev ? ({ ...prev, characters: prev.characters.map(c => c.id === id ? { ...c, isGenerating: false } : c) }) : null);
      addToast("Character generation failed.", "error");
    }
  };

  const handleGenerateSetting = async (id: string) => {
    if (!storyData) return;
    setStoryData(prev => prev ? ({ ...prev, settings: prev.settings.map(s => s.id === id ? { ...s, isGenerating: true } : s) }) : null);
    addToast("Generating isometric + top-down view...", "info");
    try {
      const setting = storyData.settings.find(s => s.id === id);
      if (!setting) return;
      
      // Updated prompt to match user's successful structure exactly
      const prompt = `create a 16x9 image of the location ${setting.name}, where half is the ${setting.name} in isometric view and the other is the same ${setting.name} but top-down view. ${setting.description}. white background. no text.`;
      
      const imageUrl = await GeminiService.generateImage(
          prompt, 
          AspectRatio.WIDE, 
          ImageSize.K1, 
          [], 
          storyData.visualStyleGuide, 
          storyData.cinematicDNA, 
          false
      );
      
      setStoryData(prev => prev ? ({ ...prev, settings: prev.settings.map(s => s.id === id ? { ...s, imageUrl, isGenerating: false } : s) }) : null);
    } catch (e) {
      setStoryData(prev => prev ? ({ ...prev, settings: prev.settings.map(s => s.id === id ? { ...s, isGenerating: false } : s) }) : null);
      addToast("Setting generation failed.", "error");
    }
  };

  const handleRegeneratePrompts = async (segmentId: string) => {
      if (!storyData) return;
      
      setStoryData(prev => prev ? ({ ...prev, segments: prev.segments.map(s => s.id === segmentId ? { ...s, isGenerating: true } : s) }) : null);
      addToast("Enriching scene prompts with technical layout context...", "info");

      try {
          const segment = storyData.segments.find(s => s.id === segmentId);
          if (!segment) throw new Error("Segment not found");

          let context = `Characters: ${segment.characterIds.map(id => storyData.characters.find(c => c.id === id)?.name).join(', ')}. `;
          const setting = storyData.settings.find(s => s.id === segment.settingId);
          if (setting) {
              context += `Location: ${setting.name}. SPATIAL BLUEPRINT: ${setting.spatialLayout}.`;
          }

          const fullStoryText = storyData.segments.map(s => s.text).join('\n\n');

          const newPanels = await GeminiService.regeneratePanelPrompts(segment.text, fullStoryText, storyData.artStyle, context);
          
          setStoryData(prev => prev ? ({
              ...prev,
              segments: prev.segments.map(s => s.id === segmentId ? { ...s, panels: newPanels, isGenerating: false } : s)
          }) : null);
          addToast("Prompts refined with spatial accuracy.", "success");

      } catch (e) {
           setStoryData(prev => prev ? ({ ...prev, segments: prev.segments.map(s => s.id === segmentId ? { ...s, isGenerating: false } : s) }) : null);
           addToast("Prompt refinement failed.", "error");
      }
  };

  const handleGenerateScene = async (segmentId: string, options: { aspectRatio: AspectRatio, imageSize: ImageSize, referenceViewUrl?: string }) => {
    if (!storyData) return;
    setStoryData(prev => prev ? ({ ...prev, segments: prev.segments.map(s => s.id === segmentId ? { ...s, isGenerating: true } : s) }) : null);
    try {
      const segment = storyData.segments.find(s => s.id === segmentId);
      if (!segment) throw new Error("Segment not found");
      
      const setting = storyData.settings.find(s => s.id === segment.settingId);
      let generalSettingPrompt = "";
      let settingColors = "Neutral cinematic lighting";
      
      if (setting) {
          generalSettingPrompt = `\n\n[LOCATION]: ${setting.name}. ${setting.spatialLayout}.`;
          if (setting.colorPalette) settingColors = setting.colorPalette;
      }

      const refImages: string[] = [];
      const firstSegment = storyData.segments[0];
      if (firstSegment && firstSegment.masterGridImageUrl && firstSegment.id !== segmentId) {
          refImages.push(firstSegment.masterGridImageUrl);
      }

      // 3. CHARACTER REFERENCES & PROMPT PREPARATION
      // CRITICAL CHANGE: We capture the specific clothing details string here to inject into every panel.
      let charPrompt = "\n\n[CHARACTERS]:";
      let characterInjection = ""; // New string to hold strict clothing details
      if (segment.characterIds && segment.characterIds.length > 0) {
          segment.characterIds.forEach(charId => {
              const char = storyData.characters.find(c => c.id === charId);
              if (char) {
                  charPrompt += `\n- ${char.name}: ${char.description}`;
                  characterInjection += ` ${char.name} is wearing: ${char.description}. `; 
                  if (char.imageUrl) refImages.push(char.imageUrl);
              }
          });
      }

      // --- THE "ZERO MANUAL WORK" LOGIC (REFINED v2) ---
      
      const gridVariations = segment.panels ? segment.panels.map((p, idx) => {
         const isEstablishing = p.shotType === 'ESTABLISHING' || idx === 0;
         
         if (isEstablishing) {
             // BEAT 1: ESTABLISHING SHOT
             // Added "WELL LIT" to avoid silhouette issue.
             return `Panel ${idx+1} [ESTABLISHING SHOT]: ${p.visualPrompt}.
             SUBJECT DETAILS: ${characterInjection}.
             Wide angle. SHOW FULL ARCHITECTURE. ${generalSettingPrompt}.
             LIGHTING: Bright, well-lit scene. Ensure ${characterInjection} is clearly visible and NOT in silhouette.`;
         } else {
             // BEAT 2-4: ISOLATION SHOTS (THE "CUTOUT" TRICK)
             // Added "characterInjection" to force correct shoes/clothes in macro shots.
             return `Panel ${idx+1} [ISOLATION SHOT]: ${p.visualPrompt}.
             
             SUBJECT DETAILS: ${characterInjection}.
             
             CRITICAL RULE: DO NOT DRAW THE ROOM.
             - Focus ONLY on the Subject.
             - Background MUST BE: Abstract Blur / Bokeh / Dark Void / Speed Lines.
             - Color Palette: ${settingColors}.
             - NO furniture, NO windows, NO doors.
             - COSTUME: Match the description "${characterInjection}" exactly (e.g., if wearing heels, draw heels).
             `;
         }
      }) : [];
      
      // We pass the setting image if it exists, but primarily for the establishing shot style
      if (setting && setting.imageUrl) refImages.push(setting.imageUrl);

      const masterGridUrl = await GeminiService.generateImage(
          `Story Segment: ${segment.text} ${charPrompt}`, 
          options.aspectRatio, 
          options.imageSize, 
          refImages, 
          storyData.visualStyleGuide, 
          storyData.cinematicDNA, 
          true, 
          gridVariations
      );
      
      const croppedImages = await Promise.all([0,1,2,3].map(i => cropGridCell(masterGridUrl, i)));

      setStoryData(prev => prev ? ({
        ...prev,
        segments: prev.segments.map(s => s.id === segmentId ? { 
            ...s, 
            masterGridImageUrl: masterGridUrl, 
            selectedGridIndices: [0, 1, 2, 3], 
            generatedImageUrls: croppedImages,
            isGenerating: false 
        } : s)
      }) : null);
    } catch (e: any) {
       setStoryData(prev => prev ? ({ ...prev, segments: prev.segments.map(s => s.id === segmentId ? { ...s, isGenerating: false } : s) }) : null);
       addToast("Visual generation failed.", "error");
    }
  };

  const handleSelectOption = async (segmentId: string, optionIndex: number) => {
    if (!storyData) return;
    const segment = storyData.segments.find(s => s.id === segmentId);
    if (!segment || !segment.masterGridImageUrl) return;
    try {
        let newIndices = [...(segment.selectedGridIndices || [])];
        if (newIndices.includes(optionIndex)) newIndices = newIndices.filter(i => i !== optionIndex);
        else newIndices.push(optionIndex);
        
        newIndices.sort((a,b) => a-b);

        const newImages = await Promise.all(newIndices.map(async (idx) => await cropGridCell(segment.masterGridImageUrl!, idx)));
        
        setStoryData(prev => prev ? ({
            ...prev,
            segments: prev.segments.map(s => s.id === segmentId ? { ...s, selectedGridIndices: newIndices, generatedImageUrls: newImages } : s)
        }) : null);
    } catch (e) { console.error(e); }
  };

  const handleDeleteAudio = (segmentId: string) => {
     if (!storyData) return;
     setStoryData(prev => prev ? ({ ...prev, segments: prev.segments.map(s => s.id === segmentId ? { ...s, audioUrl: undefined, audioDuration: undefined } : s) }) : null);
  };

  const handleGenerateAndPlayAudio = async (segmentId: string, text: string): Promise<void> => {
      const segment = storyData?.segments.find(s => s.id === segmentId);
      if (segment?.audioUrl) {
          const audio = new Audio(segment.audioUrl);
          await audio.play();
          return;
      }
      setStoryData(prev => prev ? ({ ...prev, segments: prev.segments.map(s => s.id === segmentId ? { ...s, isGenerating: true } : s) }) : null);
      try {
          const audioBuffer = await GeminiService.generateSpeech(text, selectedVoice);
          const blob = GeminiService.createWavBlob(audioBuffer);
          const url = URL.createObjectURL(blob);
          const duration = audioBuffer.byteLength / 48000;
          setStoryData(prev => prev ? ({
              ...prev, 
              segments: prev.segments.map(s => s.id === segmentId ? { ...s, audioUrl: url, audioDuration: duration, isGenerating: false } : s)
          }) : null);
      } catch (e) {
          setStoryData(prev => prev ? ({ ...prev, segments: prev.segments.map(s => s.id === segmentId ? { ...s, isGenerating: false } : s) }) : null);
      }
  };

  const handleStopAudio = () => GeminiService.stopAudio();
  const handleExport = async () => { if (storyData) await StorageService.exportProject(storyData); };
  const handleImportClick = () => fileInputRef.current?.click();
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { data } = await StorageService.importProject(file);
      setStoryData(data);
      setStatus(ProcessingStatus.READY);
      setActiveTab(Tab.STORYBOARD);
      addToast("Project imported.", "success");
    } catch (e) { alert("Import failed."); } finally { if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  if (!hasApiKey) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex flex-col items-center justify-center p-4 relative z-50">
        <div className="max-w-md w-full bg-slate-800 rounded-xl p-8 border border-slate-700 shadow-2xl text-center">
          <Key className="w-16 h-16 text-indigo-400 mx-auto mb-6" />
          <h1 className="text-3xl font-bold text-white mb-4">Access Required</h1>
          <button onClick={handleSelectKey} className="w-full bg-indigo-600 text-white font-bold py-4 rounded-lg">Select API Key</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-200 relative z-50">
      <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-3 pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-lg shadow-2xl border border-white/10 backdrop-blur-md animate-fade-in ${t.type === 'error' ? 'bg-red-500/90' : t.type === 'success' ? 'bg-emerald-500/90' : 'bg-slate-800/90'} text-white`}>
            {t.type === 'error' && <XCircle className="w-5 h-5 shrink-0" />}
            {t.type === 'success' && <CheckCircle className="w-5 h-5 shrink-0" />}
            {t.type === 'info' && <Info className="w-5 h-5 shrink-0" />}
            <span className="text-sm font-medium">{t.message}</span>
          </div>
        ))}
      </div>

      <nav className="border-b border-slate-800 bg-[#0f172a]/95 sticky top-0 z-50 backdrop-blur min-h-[4rem] flex flex-col md:flex-row items-center px-4 md:px-8 justify-between py-3 md:py-0 gap-4 md:gap-0">
          <div className="flex items-center gap-2 self-start md:self-center">
              <Layout className="w-7 h-7 text-indigo-500" />
              <span className="text-lg md:text-xl font-bold whitespace-nowrap">StoryBoard AI</span>
          </div>
          
          <div className="flex flex-wrap items-center justify-center gap-2 md:gap-4 w-full md:w-auto">
               <div className="flex items-center gap-2">
                 <input type="file" ref={fileInputRef} className="hidden" accept=".zip" onChange={handleFileChange} />
                 <button onClick={handleImportClick} className="p-2 md:px-3 md:py-1.5 bg-slate-800 rounded border border-slate-700 flex items-center gap-2 hover:bg-slate-700 transition-colors" title="Import Project">
                   <Upload className="w-4 h-4" /> 
                   <span className="hidden md:inline text-xs font-bold">Import</span>
                 </button>
                 {storyData && (
                   <button onClick={handleExport} className="p-2 md:px-3 md:py-1.5 bg-slate-800 rounded border border-slate-700 flex items-center gap-2 hover:bg-slate-700 transition-colors" title="Export Project">
                     <Download className="w-4 h-4" /> 
                     <span className="hidden md:inline text-xs font-bold">Export</span>
                   </button>
                 )}
               </div>

               {storyData && (
                <div className="flex bg-slate-900 border border-slate-800 rounded-lg p-0.5 shadow-inner">
                  <button 
                    onClick={() => setActiveTab(Tab.INPUT)} 
                    className={`flex items-center gap-2 px-3 md:px-4 py-1.5 rounded-md text-xs font-bold transition-all ${activeTab === Tab.INPUT ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'}`}
                  >
                    <BookOpen className="w-3.5 h-3.5 md:hidden" />
                    <span className="hidden md:inline">Story</span>
                    <span className="md:hidden">Story</span>
                  </button>
                  <button 
                    onClick={() => setActiveTab(Tab.ASSETS)} 
                    className={`flex items-center gap-2 px-3 md:px-4 py-1.5 rounded-md text-xs font-bold transition-all ${activeTab === Tab.ASSETS ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'}`}
                  >
                    <Users className="w-3.5 h-3.5 md:hidden" />
                    <span className="hidden md:inline">Characters</span>
                    <span className="md:hidden">Assets</span>
                  </button>
                  <button 
                    onClick={() => setActiveTab(Tab.STORYBOARD)} 
                    className={`flex items-center gap-2 px-3 md:px-4 py-1.5 rounded-md text-xs font-bold transition-all ${activeTab === Tab.STORYBOARD ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'}`}
                  >
                    <PenTool className="w-3.5 h-3.5 md:hidden" />
                    <span className="hidden md:inline">Manga Panels</span>
                    <span className="md:hidden">Manga</span>
                  </button>
                </div>
              )}
          </div>
      </nav>

      <main className="max-w-[1600px] mx-auto px-4 py-8">
        {error && (
              <div className="mb-8 p-4 bg-red-500/10 border border-red-500/50 rounded-xl flex items-start gap-4 text-red-200">
                <AlertTriangle className="w-6 h-6 shrink-0" />
                <div>
                  <h3 className="font-bold text-red-400">Error</h3>
                  <p className="text-sm">{error}</p>
                </div>
              </div>
        )}

        {activeTab === Tab.INPUT && <StoryInput onAnalyze={handleAnalyzeStory} status={status} selectedVoice={selectedVoice} onVoiceChange={setSelectedVoice} />}
        {activeTab === Tab.ASSETS && storyData && <AssetGallery 
            characters={storyData.characters} 
            settings={storyData.settings} 
            onGenerateCharacter={handleGenerateCharacter} 
            onGenerateSetting={handleGenerateSetting}
            onUploadAsset={handleUploadAsset} 
        />}
        {activeTab === Tab.STORYBOARD && storyData && <Storyboard 
            segments={storyData.segments} 
            settings={storyData.settings} // Pass settings for dropdown
            onGenerateScene={handleGenerateScene} 
            onGenerateVideo={(id, idx) => addToast("Video Generation available in next update", "info")}
            onSelectOption={handleSelectOption} 
            onPlayAudio={handleGenerateAndPlayAudio} 
            onStopAudio={handleStopAudio} 
            onDeleteAudio={handleDeleteAudio}
            onRegeneratePrompts={handleRegeneratePrompts}
        />}
      </main>
    </div>
  );
}
