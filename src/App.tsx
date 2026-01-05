
import React, { useState, useEffect, useRef } from 'react';
import { Layout, Clapperboard, Layers, ChevronRight, Key, ExternalLink, Download, Upload } from 'lucide-react';
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [selectedVoice, setSelectedVoice] = useState('Puck');

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
    } catch (error: any) {
      setStatus(ProcessingStatus.ERROR);
      alert("Analysis failed. Try shortening the text.");
    }
  };

  const handleGenerateCharacter = async (id: string) => {
    if (!storyData) return;
    setStoryData(prev => prev ? ({ ...prev, characters: prev.characters.map(c => c.id === id ? { ...c, isGenerating: true } : c) }) : null);
    try {
      const char = storyData.characters.find(c => c.id === id);
      if (!char) return;
      const imageUrl = await GeminiService.generateImage(`Character Concept: ${char.name}. ${char.description}`, AspectRatio.PORTRAIT, ImageSize.K1, [], storyData.visualStyleGuide, storyData.cinematicDNA, false);
      setStoryData(prev => prev ? ({ ...prev, characters: prev.characters.map(c => c.id === id ? { ...c, imageUrl, isGenerating: false } : c) }) : null);
    } catch (e) {
      setStoryData(prev => prev ? ({ ...prev, characters: prev.characters.map(c => c.id === id ? { ...c, isGenerating: false } : c) }) : null);
    }
  };

  const handleGenerateSetting = async (id: string) => {
    if (!storyData) return;
    setStoryData(prev => prev ? ({ ...prev, settings: prev.settings.map(s => s.id === id ? { ...s, isGenerating: true } : s) }) : null);
    try {
      const setting = storyData.settings.find(s => s.id === id);
      if (!setting) return;
      const imageUrl = await GeminiService.generateImage(`Environment: ${setting.name}. ${setting.description}`, AspectRatio.LANDSCAPE, ImageSize.K1, [], storyData.visualStyleGuide, storyData.cinematicDNA, false);
      setStoryData(prev => prev ? ({ ...prev, settings: prev.settings.map(s => s.id === id ? { ...s, imageUrl, isGenerating: false } : s) }) : null);
    } catch (e) {
      setStoryData(prev => prev ? ({ ...prev, settings: prev.settings.map(s => s.id === id ? { ...s, isGenerating: false } : s) }) : null);
    }
  };

  const handleGenerateScene = async (segmentId: string, options: { aspectRatio: AspectRatio, imageSize: ImageSize }) => {
    if (!storyData) return;
    setStoryData(prev => prev ? ({ ...prev, segments: prev.segments.map(s => s.id === segmentId ? { ...s, isGenerating: true } : s) }) : null);
    try {
      const segment = storyData.segments.find(s => s.id === segmentId);
      if (!segment) throw new Error("Segment not found");
      const refImages: string[] = [];
      segment.characterIds.forEach(charId => {
        const char = storyData.characters.find(c => c.id === charId);
        if (char?.imageUrl) refImages.push(char.imageUrl);
      });
      const setting = storyData.settings.find(s => s.id === segment.settingId);
      if (setting?.imageUrl) refImages.push(setting.imageUrl);
      
      const masterGridUrl = await GeminiService.generateImage(segment.scenePrompt, AspectRatio.MOBILE, options.imageSize, refImages, storyData.visualStyleGuide, storyData.cinematicDNA, true, segment.gridVariations);
      const defaultIndex = 0;
      const croppedImage = await cropGridCell(masterGridUrl, defaultIndex);
      setStoryData(prev => prev ? ({
        ...prev,
        segments: prev.segments.map(s => s.id === segmentId ? { 
            ...s, 
            masterGridImageUrl: masterGridUrl, 
            selectedGridIndices: [defaultIndex],
            generatedImageUrls: [croppedImage],
            isGenerating: false 
        } : s)
      }) : null);
    } catch (e: any) {
       setStoryData(prev => prev ? ({ ...prev, segments: prev.segments.map(s => s.id === segmentId ? { ...s, isGenerating: false } : s) }) : null);
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
      <nav className="border-b border-slate-800 bg-[#0f172a]/95 sticky top-0 z-50 backdrop-blur h-16 flex items-center px-4 md:px-8 justify-between">
          <div className="flex items-center gap-2">
              <Layout className="w-8 h-8 text-indigo-500" />
              <span className="text-xl font-bold">StoryBoard AI</span>
          </div>
          <div className="flex gap-4">
               <input type="file" ref={fileInputRef} className="hidden" accept=".zip" onChange={handleFileChange} />
               <button onClick={handleImportClick} className="px-3 py-1.5 bg-slate-800 rounded border border-slate-700 flex items-center gap-2"><Upload className="w-4 h-4" /> Import</button>
               {storyData && <button onClick={handleExport} className="px-3 py-1.5 bg-slate-800 rounded border border-slate-700 flex items-center gap-2"><Download className="w-4 h-4" /> Export</button>}
               {storyData && (
                <div className="flex bg-slate-800 rounded p-1">
                  <button onClick={() => setActiveTab(Tab.INPUT)} className={`px-4 py-1.5 rounded text-sm ${activeTab === Tab.INPUT ? 'bg-indigo-600' : ''}`}>Story</button>
                  <button onClick={() => setActiveTab(Tab.ASSETS)} className={`px-4 py-1.5 rounded text-sm ${activeTab === Tab.ASSETS ? 'bg-indigo-600' : ''}`}>Assets</button>
                  <button onClick={() => setActiveTab(Tab.STORYBOARD)} className={`px-4 py-1.5 rounded text-sm ${activeTab === Tab.STORYBOARD ? 'bg-indigo-600' : ''}`}>Storyboard</button>
                </div>
              )}
          </div>
      </nav>
      <main className="max-w-7xl mx-auto px-4 py-8">
        {activeTab === Tab.INPUT && <StoryInput onAnalyze={handleAnalyzeStory} status={status} selectedVoice={selectedVoice} onVoiceChange={setSelectedVoice} />}
        {activeTab === Tab.ASSETS && storyData && <AssetGallery characters={storyData.characters} settings={storyData.settings} onGenerateCharacter={handleGenerateCharacter} onGenerateSetting={handleGenerateSetting} />}
        {activeTab === Tab.STORYBOARD && storyData && <Storyboard 
            segments={storyData.segments} 
            onGenerateScene={handleGenerateScene} 
            onGenerateVideo={(id, idx) => alert("Video generation coming soon")}
            onPlayAudio={handleGenerateAndPlayAudio} 
            onStopAudio={handleStopAudio} 
            onSelectOption={handleSelectOption} 
            onDeleteAudio={handleDeleteAudio} 
        />}
      </main>
    </div>
  );
}
