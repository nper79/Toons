
import React, { useState, useEffect, useRef } from 'react';
import { Layout, Clapperboard, Layers, ChevronRight, Key, ExternalLink, Download, Upload, XCircle, CheckCircle, Info, AlertTriangle, Users, BookOpen, PenTool, Languages, Home as HomeIcon, Plus, Palette, Book, Globe, Library } from 'lucide-react';
import StoryInput from './components/StoryInput';
import AssetGallery from './components/AssetGallery';
import Storyboard from './components/Storyboard';
import { StoryData, ProcessingStatus, AspectRatio, ImageSize, TranslationCache } from './types';
import * as GeminiService from './services/geminiService';
import * as StorageService from './services/storageService';
import { cropGridCell } from './utils/imageUtils';
import SlideshowPlayer from './components/SlideshowPlayer';

enum View {
  STUDIO = 'STUDIO',
  FRONTEND = 'FRONTEND'
}

enum Tab {
  INPUT = 'input',
  ASSETS = 'assets',
  STORYBOARD = 'storyboard'
}

interface AIStudio {
  hasSelectedApiKey(): Promise<boolean>;
  openSelectKey(): Promise<void>;
}

// Available Languages for Dropdowns
const LANGUAGES = [
    { code: 'English', label: 'English' },
    { code: 'Spanish', label: 'Spanish (Español)' },
    { code: 'French', label: 'French (Français)' },
    { code: 'German', label: 'German (Deutsch)' },
    { code: 'Japanese', label: 'Japanese (日本語)' },
    { code: 'Korean', label: 'Korean (한국어)' },
    { code: 'Portuguese', label: 'Portuguese (Português)' },
    { code: 'Italian', label: 'Italian (Italiano)' },
    { code: 'Chinese', label: 'Chinese (中文)' },
    { code: 'Czech', label: 'Czech (Čeština)' },
];

export default function App() {
  const [hasApiKey, setHasApiKey] = useState(false);
  const [currentView, setCurrentView] = useState<View>(View.STUDIO);
  const [activeTab, setActiveTab] = useState<Tab>(Tab.INPUT);
  const [status, setStatus] = useState<ProcessingStatus>(ProcessingStatus.IDLE);
  const [storyData, setStoryData] = useState<StoryData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<{ id: string, type: string, message: string }[]>([]);
  const [selectedVoice, setSelectedVoice] = useState('Puck');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reader Mode State
  const [learningLanguage, setLearningLanguage] = useState('Japanese');
  const [nativeLanguage, setNativeLanguage] = useState('English');
  const [isTranslating, setIsTranslating] = useState(false);
  const [readerData, setReaderData] = useState<StoryData | null>(null); // translated data for reader
  const [showReader, setShowReader] = useState(false);

  // Batch Translation State
  const [isBatchTranslating, setIsBatchTranslating] = useState(false);
  const [isVocabGenerating, setIsVocabGenerating] = useState(false);

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
    addToast(`Analyzing Narrative Structure...`, "info");
    try {
      // In Studio mode, we just analyze structure. Translation happens in Frontend.
      const data = await GeminiService.analyzeStoryText(text, style);
      const initializedSegments = data.segments.map(s => ({
          ...s,
          selectedGridIndices: [],
          generatedImageUrls: [],
          translations: {} // Initialize translation cache
      }));
      setStoryData({ 
          ...data, 
          segments: initializedSegments, 
          learningLanguage: 'English', 
          nativeLanguage: 'English',
          completedTranslations: { 'English': true },
          vocabulary: {}
      });
      setStatus(ProcessingStatus.READY);
      setActiveTab(Tab.ASSETS);
      addToast("Story generated successfully.", "success");
    } catch (error: any) {
      setStatus(ProcessingStatus.ERROR);
      setError("Analysis failed. Try shortening the text.");
      addToast("Analysis failed.", "error");
    }
  };

  const handleCreateNewStory = () => {
      setCurrentView(View.STUDIO);
      setActiveTab(Tab.INPUT);
      setStoryData(null);
  };

  // NEW: Batch Translation Feature
  const handleBatchTranslate = async () => {
    if (!storyData || isBatchTranslating) return;
    
    setIsBatchTranslating(true);
    addToast("Starting batch translation for all languages...", "info");

    const languagesToTranslate = LANGUAGES.map(l => l.code).filter(code => code !== "English"); // Assume English is base (or check native)

    let updatedSegments = [...storyData.segments];
    let updatedCompletion = { ...(storyData.completedTranslations || {}) };
    let completedCount = 0;

    for (const targetLang of languagesToTranslate) {
         try {
             addToast(`Translating to ${targetLang}... (${completedCount + 1}/${languagesToTranslate.length})`, "info");
             
             // Check if all segments already have this language (avoid re-translating if fully cached)
             const needsTranslation = updatedSegments.some(s => !s.translations?.[targetLang]);
             
             if (needsTranslation) {
                 const translatedResults = await GeminiService.translateSegments(updatedSegments, targetLang);
                 
                 // Merge results into the segments' translation map
                 updatedSegments = updatedSegments.map(seg => {
                     const translatedSeg = translatedResults.find(t => t.id === seg.id);
                     if (!translatedSeg) return seg;
                     
                     return {
                         ...seg,
                         translations: {
                             ...(seg.translations || {}),
                             [targetLang]: {
                                 text: translatedSeg.text,
                                 tokens: translatedSeg.tokens || [],
                                 captions: translatedSeg.panels.map(p => p.caption),
                                 choices: translatedSeg.choices?.map(c => c.text) || []
                             }
                         }
                     };
                 });
             }
             // Mark language as complete
             updatedCompletion[targetLang] = true;
             completedCount++;
         } catch (e) {
             console.error(`Failed to translate to ${targetLang}`, e);
             addToast(`Failed to translate to ${targetLang}. Skipping.`, "error");
         }
    }

    setStoryData({ ...storyData, segments: updatedSegments, completedTranslations: updatedCompletion });
    setIsBatchTranslating(false);
    addToast("Batch translation complete! Translations are saved in the project.", "success");
  };

  // NEW: Batch Vocabulary Generation
  const handleBatchVocabulary = async () => {
      if (!storyData || isVocabGenerating) return;
      setIsVocabGenerating(true);
      addToast("Generating Global Vocabulary... This process is exhaustive.", "info");

      try {
          let updatedVocabulary = { ...(storyData.vocabulary || {}) };
          const wordsByLang: Record<string, Set<string>> = {};

          // Helper to add words cleanly
          const collect = (lang: string, candidates: string[]) => {
              if (!wordsByLang[lang]) wordsByLang[lang] = new Set();
              candidates.forEach(w => {
                  // Normalize: remove Western AND Asian punctuation
                  // includes: .,!?;:"“’'”()\-\[\] and 。、！ ？「」（）
                  const clean = w.replace(/[.,!?;:"“’'”()\-\[\]。、！ ？「」（）]+/g, "").trim();
                  if (clean.length > 0) wordsByLang[lang].add(clean);
              });
          };
          
          // 1. Collect all unique words
          storyData.segments.forEach(s => {
              // Base Text (Assume English or Native)
              const baseWords = s.text.split(/\s+/);
              collect('English', baseWords);

              // Translations
              if (s.translations) {
                  Object.entries(s.translations).forEach(([lang, data]) => {
                      const translation = data as TranslationCache;
                      const isAsian = ['Japanese', 'Chinese', 'Thai'].some(l => lang.includes(l));

                      // 1. Collect from Main Narration
                      if (translation.tokens && translation.tokens.length > 0) {
                          collect(lang, translation.tokens);
                      } else {
                          collect(lang, translation.text.split(/\s+/));
                      }

                      // 2. Collect from Captions (CRITICAL FIX FOR CAPTION LOOKUP)
                      translation.captions.forEach(cap => {
                          if (isAsian && typeof Intl !== 'undefined' && (Intl as any).Segmenter) {
                              try {
                                  const segmenter = new (Intl as any).Segmenter(lang === 'Japanese' ? 'ja' : 'zh', { granularity: 'word' });
                                  const segments = Array.from(segmenter.segment(cap)).map((seg: any) => seg.segment);
                                  collect(lang, segments);
                              } catch (e) {
                                  // Fallback
                                  collect(lang, cap.split(/\s+/)); 
                              }
                          } else {
                              collect(lang, cap.split(/\s+/));
                          }
                      });
                  });
              }
          });

          // Process each language
          for (const [sourceLang, wordSet] of Object.entries(wordsByLang)) {
              addToast(`Indexing vocabulary for ${sourceLang}...`, "info");
              
              const uniqueWords = Array.from(wordSet).slice(0, 100); // Limit to top 100 unique words

              if (uniqueWords.length === 0) continue;

              const targetLangs = LANGUAGES.map(l => l.code);
              
              for (const targetLang of targetLangs) {
                  if (sourceLang === targetLang) continue; 

                  addToast(`Defining ${sourceLang} terms in ${targetLang}...`, "info");
                  
                  const wordsToFetch = uniqueWords.filter(word => 
                      !updatedVocabulary[word] || !updatedVocabulary[word][targetLang]
                  );

                  if (wordsToFetch.length > 0) {
                      const definitions = await GeminiService.batchDefineVocabulary(wordsToFetch, targetLang);
                      
                      Object.entries(definitions).forEach(([word, def]) => {
                          if (!updatedVocabulary[word]) updatedVocabulary[word] = {};
                          updatedVocabulary[word][targetLang] = def;
                      });
                  }
              }
          }

          setStoryData({ ...storyData, vocabulary: updatedVocabulary });
          addToast("Global Glossary Generation Complete.", "success");

      } catch (e) {
          addToast("Vocabulary generation failed.", "error");
          console.error(e);
      } finally {
          setIsVocabGenerating(false);
      }
  };

  const handleOpenReader = async () => {
    if (!storyData) return;
    setIsTranslating(true);
    
    try {
        // 1. Check if we already have the translation in cache
        const isTranslationAvailable = storyData.segments.every(s => 
            (s.translations && s.translations[learningLanguage])
        );

        let translatedSegments;

        if (isTranslationAvailable) {
            console.log("Using cached translations.");
            // Reconstruct segments from cache
            translatedSegments = storyData.segments.map(s => {
                const cache = s.translations![learningLanguage];
                return {
                    ...s,
                    text: cache.text,
                    tokens: cache.tokens,
                    panels: s.panels.map((p, idx) => ({ ...p, caption: cache.captions[idx] || p.caption })),
                    choices: s.choices?.map((c, idx) => ({ ...c, text: cache.choices[idx] || c.text }))
                };
            });
            addToast(`Opening ${learningLanguage} Reader (Cached).`, "success");
        } else {
            console.log("Translation not found in cache. Generating...");
            addToast(`Translating story to ${learningLanguage}...`, "info");
            // Translate on the fly
            translatedSegments = await GeminiService.translateSegments(storyData.segments, learningLanguage);
        }
        
        setReaderData({
            ...storyData,
            segments: translatedSegments,
            learningLanguage,
            nativeLanguage
        });
        setShowReader(true);
        if (!isTranslationAvailable) addToast("Translation complete.", "success");

    } catch (e) {
        addToast("Translation failed. Opening original.", "error");
        setReaderData(storyData); // Fallback
        setShowReader(true);
    } finally {
        setIsTranslating(false);
    }
  };

  // ... (Asset & Gen Handlers)
  const handleUploadAsset = (type: 'character' | 'setting' | 'cover', id: string, file: File) => {
    if (!storyData) return;
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
                if (type === 'cover') {
                    return { ...prev, cover: { imageUrl: result } };
                }
                if (type === 'character') {
                    return { ...prev, characters: prev.characters.map(c => c.id === id ? { ...c, imageUrl: result } : c) };
                } else {
                    return { ...prev, settings: prev.settings.map(s => s.id === id ? { ...s, imageUrl: result } : s) };
                }
            });
            addToast("Asset uploaded successfully", "success");
        }
    };
    reader.onerror = () => addToast("Failed to read file", "error");
    reader.readAsDataURL(file);
  };

  const handleGenerateCover = async () => {
      if (!storyData) return;
      setStoryData(prev => prev ? ({ ...prev, cover: { ...prev.cover, isGenerating: true } }) : null);
      addToast("Designing vertical cover art...", "info");
      
      try {
          // 1. Generate Prompt
          const prompt = await GeminiService.generateCoverPrompt(
              storyData.title,
              storyData.characters,
              storyData.segments.map(s => s.text).join(' '),
              storyData.artStyle
          );

          // 2. Gather References (Main Characters)
          const refImages: string[] = [];
          storyData.characters.forEach(c => {
              if (c.imageUrl) refImages.push(c.imageUrl);
          });

          // 3. Generate Image (3:4)
          const imageUrl = await GeminiService.generateImage(
              prompt,
              AspectRatio.PORTRAIT,
              ImageSize.K1,
              refImages,
              storyData.visualStyleGuide,
              storyData.cinematicDNA
          );

          setStoryData(prev => prev ? ({ 
              ...prev, 
              cover: { 
                  imageUrl, 
                  visualPrompt: prompt, 
                  isGenerating: false 
              } 
          }) : null);
          addToast("Cover art generated.", "success");

      } catch (e) {
          setStoryData(prev => prev ? ({ ...prev, cover: { ...prev.cover, isGenerating: false } }) : null);
          addToast("Cover generation failed.", "error");
      }
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

      const imageUrl = await GeminiService.generateImage(prompt, AspectRatio.WIDE, ImageSize.K1, [], storyData.visualStyleGuide, storyData.cinematicDNA, false);
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
      const prompt = `create a 16x9 image of the location ${setting.name}, where half is the ${setting.name} in isometric view and the other is the same ${setting.name} but top-down view. ${setting.description}. white background. no text.`;
      const imageUrl = await GeminiService.generateImage(prompt, AspectRatio.WIDE, ImageSize.K1, [], storyData.visualStyleGuide, storyData.cinematicDNA, false);
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
          if (setting) { context += `Location: ${setting.name}. SPATIAL BLUEPRINT: ${setting.spatialLayout}.`; }
          const fullStoryText = storyData.segments.map(s => s.text).join('\n\n');
          const newPanels = await GeminiService.regeneratePanelPrompts(segment.text, fullStoryText, storyData.artStyle, context);
          setStoryData(prev => prev ? ({ ...prev, segments: prev.segments.map(s => s.id === segmentId ? { ...s, panels: newPanels, isGenerating: false } : s) }) : null);
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
      if (firstSegment && firstSegment.masterGridImageUrl && firstSegment.id !== segmentId) { refImages.push(firstSegment.masterGridImageUrl); }
      let charPrompt = "\n\n[CHARACTERS]:";
      let characterInjection = "";
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
      const gridVariations = segment.panels ? segment.panels.map((p, idx) => {
         const isEstablishing = p.shotType === 'ESTABLISHING' || idx === 0;
         if (isEstablishing) {
             return `Panel ${idx+1} [ESTABLISHING SHOT]: ${p.visualPrompt}. SUBJECT DETAILS: ${characterInjection}. Wide angle. SHOW FULL ARCHITECTURE. ${generalSettingPrompt}. LIGHTING: Bright, well-lit scene. Ensure ${characterInjection} is clearly visible and NOT in silhouette.`;
         } else {
             return `Panel ${idx+1} [ISOLATION SHOT]: ${p.visualPrompt}. SUBJECT DETAILS: ${characterInjection}. CRITICAL RULE: DO NOT DRAW THE ROOM. - Focus ONLY on the Subject. - Background MUST BE: Abstract Blur / Bokeh / Dark Void / Speed Lines. - Color Palette: ${settingColors}. - NO furniture, NO windows, NO doors. - COSTUME: Match the description "${characterInjection}" exactly.`;
         }
      }) : [];
      if (setting && setting.imageUrl) refImages.push(setting.imageUrl);
      const masterGridUrl = await GeminiService.generateImage(`Story Segment: ${segment.text} ${charPrompt}`, options.aspectRatio, options.imageSize, refImages, storyData.visualStyleGuide, storyData.cinematicDNA, true, gridVariations);
      const croppedImages = await Promise.all([0,1,2,3].map(i => cropGridCell(masterGridUrl, i)));
      setStoryData(prev => prev ? ({ ...prev, segments: prev.segments.map(s => s.id === segmentId ? { ...s, masterGridImageUrl: masterGridUrl, selectedGridIndices: [0, 1, 2, 3], generatedImageUrls: croppedImages, isGenerating: false } : s) }) : null);
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
        setStoryData(prev => prev ? ({ ...prev, segments: prev.segments.map(s => s.id === segmentId ? { ...s, selectedGridIndices: newIndices, generatedImageUrls: newImages } : s) }) : null);
    } catch (e) { console.error(e); }
  };

  const handleDeleteAudio = (segmentId: string) => {
     if (!storyData) return;
     setStoryData(prev => prev ? ({ ...prev, segments: prev.segments.map(s => s.id === segmentId ? { ...s, audioUrl: undefined, audioDuration: undefined } : s) }) : null);
  };

  const handleGenerateAndPlayAudio = async (segmentId: string, text: string): Promise<void> => {
      // Use readerData if in reader mode, otherwise storyData
      const sourceData = showReader ? readerData : storyData;
      if (!sourceData) return;

      const segment = sourceData.segments.find(s => s.id === segmentId);
      if (segment?.audioUrl) {
          const audio = new Audio(segment.audioUrl);
          await audio.play();
          return;
      }
      
      const updateState = (data: StoryData) => {
          if (showReader) setReaderData(data);
          else setStoryData(data);
      };

      updateState({ ...sourceData, segments: sourceData.segments.map(s => s.id === segmentId ? { ...s, isGenerating: true } : s) });
      
      try {
          // Use the text provided (which might be translated)
          const audioBuffer = await GeminiService.generateSpeech(text, selectedVoice);
          const blob = GeminiService.createWavBlob(audioBuffer);
          const url = URL.createObjectURL(blob);
          const duration = audioBuffer.byteLength / 48000;
          
          updateState({
              ...sourceData, 
              segments: sourceData.segments.map(s => s.id === segmentId ? { ...s, audioUrl: url, audioDuration: duration, isGenerating: false } : s)
          });
      } catch (e) {
          updateState({ ...sourceData, segments: sourceData.segments.map(s => s.id === segmentId ? { ...s, isGenerating: false } : s) });
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
      // If importing, default to Studio
      setCurrentView(View.STUDIO);
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
    <div className="min-h-screen bg-[#0f172a] text-slate-200 relative z-50 flex flex-col">
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

      {/* Main Navbar */}
      <nav className="border-b border-slate-800 bg-[#0f172a]/95 sticky top-0 z-50 backdrop-blur min-h-[4rem] flex flex-col md:flex-row items-center px-4 md:px-8 justify-between py-3 md:py-0 gap-4 md:gap-0">
          <div className="flex items-center gap-6 self-start md:self-center">
              <div 
                className="flex items-center gap-2"
              >
                  <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center transform -rotate-3">
                    <span className="font-serif font-black text-white text-lg">L</span>
                  </div>
                  <span className="text-lg md:text-xl font-black whitespace-nowrap tracking-tight">Lingotoons</span>
              </div>
              
              <div className="h-6 w-px bg-slate-700 hidden md:block"></div>
              
              <div className="flex bg-slate-900 rounded-lg p-1 border border-slate-700">
                  <button 
                    onClick={() => setCurrentView(View.FRONTEND)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${currentView === View.FRONTEND ? 'bg-white text-slate-900 shadow' : 'text-slate-400 hover:text-white'}`}
                  >
                      <HomeIcon className="w-3.5 h-3.5" /> Reader
                  </button>
                  <button 
                    onClick={() => setCurrentView(View.STUDIO)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${currentView === View.STUDIO ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                  >
                      <Palette className="w-3.5 h-3.5" /> Studio
                  </button>
              </div>
          </div>
          
          <div className="flex flex-wrap items-center justify-center gap-2 md:gap-4 w-full md:w-auto">
               {currentView === View.STUDIO && (
                 <>
                   <div className="flex items-center gap-2">
                     <input type="file" ref={fileInputRef} className="hidden" accept=".zip" onChange={handleFileChange} />
                     
                     <button onClick={handleImportClick} className="p-2 md:px-3 md:py-1.5 bg-slate-800 rounded border border-slate-700 flex items-center gap-2 hover:bg-slate-700 transition-colors" title="Import Project">
                       <Upload className="w-4 h-4" /> 
                       <span className="hidden md:inline text-xs font-bold">Import</span>
                     </button>
                     
                     {storyData && (
                        <>
                            <div className="flex bg-slate-800 rounded border border-slate-700 items-center">
                                <button 
                                    onClick={handleBatchTranslate}
                                    disabled={isBatchTranslating}
                                    className="p-2 md:px-3 md:py-1.5 flex items-center gap-2 hover:bg-indigo-600 hover:text-white transition-colors disabled:opacity-50 border-r border-slate-700" 
                                    title="Batch Translate to All Languages"
                                >
                                    <Globe className={`w-4 h-4 ${isBatchTranslating ? 'animate-spin' : ''}`} /> 
                                    <span className="hidden md:inline text-xs font-bold">Translate All</span>
                                </button>
                                <button 
                                    onClick={handleBatchVocabulary}
                                    disabled={isVocabGenerating}
                                    className="p-2 md:px-3 md:py-1.5 flex items-center gap-2 hover:bg-emerald-600 hover:text-white transition-colors disabled:opacity-50" 
                                    title="Generate Global Glossary (Heavy Process)"
                                >
                                    <Library className={`w-4 h-4 ${isVocabGenerating ? 'animate-spin' : ''}`} /> 
                                    <span className="hidden md:inline text-xs font-bold">Gen Glossary</span>
                                </button>
                            </div>
                            
                            <button onClick={handleExport} className="p-2 md:px-3 md:py-1.5 bg-slate-800 rounded border border-slate-700 flex items-center gap-2 hover:bg-slate-700 transition-colors" title="Export Project">
                                <Download className="w-4 h-4" /> 
                                <span className="hidden md:inline text-xs font-bold">Export</span>
                            </button>
                        </>
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
                 </>
               )}
          </div>
      </nav>

      <main className="flex-1 max-w-[1600px] w-full mx-auto px-4 py-8">
        {error && (
              <div className="mb-8 p-4 bg-red-500/10 border border-red-500/50 rounded-xl flex items-start gap-4 text-red-200">
                <AlertTriangle className="w-6 h-6 shrink-0" />
                <div>
                  <h3 className="font-bold text-red-400">Error</h3>
                  <p className="text-sm">{error}</p>
                </div>
              </div>
        )}

        {/* FRONTEND VIEW */}
        {currentView === View.FRONTEND && (
            <div className="max-w-4xl mx-auto space-y-12 animate-fade-in">
                {/* Hero / Language Setup */}
                <div className="bg-slate-800 rounded-2xl p-8 border border-slate-700 shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
                        <Languages className="w-64 h-64 text-indigo-500" />
                    </div>
                    
                    <h1 className="text-3xl font-black text-white mb-2">Configure Your Reader</h1>
                    <p className="text-slate-400 mb-8 max-w-lg">
                        Select your target language below. When you open a story, Lingotoons will instantly translate the narrative and enable interactive learning.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative z-10">
                        <div className="space-y-2">
                             <div className="flex justify-between items-center">
                                 <label className="text-xs font-bold text-indigo-300 uppercase tracking-wider">I want to learn (Target Language)</label>
                                 {/* TRANSLATION COMPLETION BADGE */}
                                 {storyData && storyData.completedTranslations?.[learningLanguage] && (
                                     <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded font-bold border border-emerald-500/30 flex items-center gap-1">
                                         <CheckCircle className="w-3 h-3" /> Translation Completed
                                     </span>
                                 )}
                             </div>
                             <div className="relative">
                                <select 
                                    value={learningLanguage}
                                    onChange={(e) => setLearningLanguage(e.target.value)}
                                    className="w-full bg-slate-900 border border-indigo-500/30 rounded-xl px-4 py-4 text-lg font-bold text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none appearance-none"
                                >
                                    {LANGUAGES.map(lang => (
                                        <option key={lang.code} value={lang.code}>{lang.label}</option>
                                    ))}
                                </select>
                                <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 rotate-90" />
                             </div>
                        </div>

                        <div className="space-y-2">
                             <label className="text-xs font-bold text-emerald-300 uppercase tracking-wider">I speak (Native Language)</label>
                             <div className="relative">
                                <select 
                                    value={nativeLanguage}
                                    onChange={(e) => setNativeLanguage(e.target.value)}
                                    className="w-full bg-slate-900 border border-emerald-500/30 rounded-xl px-4 py-4 text-lg font-bold text-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none appearance-none"
                                >
                                    {LANGUAGES.map(lang => (
                                        <option key={lang.code} value={lang.code}>{lang.label}</option>
                                    ))}
                                </select>
                                <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 rotate-90" />
                             </div>
                        </div>
                    </div>
                </div>

                {/* Library / Action */}
                <div className="space-y-6">
                    <div className="flex items-center justify-between">
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                            <BookOpen className="w-5 h-5 text-indigo-400" />
                            Available Stories
                        </h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* Current Project Card */}
                        {storyData && (
                             <button 
                                onClick={handleOpenReader}
                                disabled={isTranslating}
                                className="aspect-[3/4] bg-slate-900 rounded-xl border border-slate-700 overflow-hidden relative group cursor-pointer text-left w-full hover:border-indigo-500 transition-all"
                             >
                                 <div className="absolute inset-0 bg-gradient-to-t from-black/90 to-transparent z-10" />
                                 {storyData.cover?.imageUrl ? (
                                     <img src={storyData.cover.imageUrl} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                                 ) : storyData.segments[0]?.masterGridImageUrl ? (
                                     <img src={storyData.segments[0].masterGridImageUrl} className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity" />
                                 ) : (
                                     <div className="w-full h-full bg-indigo-900/20" />
                                 )}
                                 <div className="absolute bottom-0 left-0 right-0 p-6 z-20">
                                     <span className="text-[10px] bg-indigo-600 text-white px-2 py-0.5 rounded font-bold uppercase mb-2 inline-block">Draft</span>
                                     <h3 className="font-bold text-white text-lg mb-1 truncate">{storyData.title || "Untitled Project"}</h3>
                                     <p className="text-xs text-slate-400 line-clamp-2">{storyData.segments[0]?.text}</p>
                                     <div className="mt-4 flex items-center gap-2 text-indigo-400 text-xs font-bold uppercase tracking-wide group-hover:text-white">
                                         {isTranslating ? 'Translating...' : 'Read Now'} <ChevronRight className="w-3 h-3" />
                                     </div>
                                 </div>
                             </button>
                        )}

                        {/* Dummy Placeholders to fill the grid */}
                        <div className="aspect-[3/4] bg-slate-800 rounded-xl border border-slate-700/50 flex flex-col items-center justify-center p-6 text-center opacity-50 grayscale hover:grayscale-0 transition-all">
                             <Book className="w-12 h-12 text-slate-600 mb-4" />
                             <h3 className="font-bold text-slate-400">The Neon Samurai</h3>
                             <p className="text-[10px] text-slate-500 mt-2">Coming Soon</p>
                        </div>
                        <div className="aspect-[3/4] bg-slate-800 rounded-xl border border-slate-700/50 flex flex-col items-center justify-center p-6 text-center opacity-50 grayscale hover:grayscale-0 transition-all">
                             <Book className="w-12 h-12 text-slate-600 mb-4" />
                             <h3 className="font-bold text-slate-400">Cyber Cafe Romance</h3>
                             <p className="text-[10px] text-slate-500 mt-2">Coming Soon</p>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {/* STUDIO VIEW */}
        {currentView === View.STUDIO && (
            <>
                {activeTab === Tab.INPUT && <StoryInput onAnalyze={handleAnalyzeStory} status={status} selectedVoice={selectedVoice} onVoiceChange={setSelectedVoice} />}
                {activeTab === Tab.ASSETS && storyData && <AssetGallery 
                    characters={storyData.characters} 
                    settings={storyData.settings} 
                    cover={storyData.cover}
                    onGenerateCharacter={handleGenerateCharacter} 
                    onGenerateSetting={handleGenerateSetting}
                    onGenerateCover={handleGenerateCover}
                    onUploadAsset={handleUploadAsset} 
                />}
                {activeTab === Tab.STORYBOARD && storyData && <Storyboard 
                    segments={storyData.segments} 
                    settings={storyData.settings} 
                    onGenerateScene={handleGenerateScene} 
                    onGenerateVideo={(id, idx) => addToast("Video Generation available in next update", "info")}
                    onSelectOption={handleSelectOption} 
                    onPlayAudio={handleGenerateAndPlayAudio} 
                    onStopAudio={handleStopAudio} 
                    onDeleteAudio={handleDeleteAudio}
                    onRegeneratePrompts={handleRegeneratePrompts}
                />}
            </>
        )}

        {/* Slideshow Reader (triggered from Frontend) */}
        {showReader && readerData && (
             <SlideshowPlayer 
                segments={readerData.segments} 
                onClose={() => setShowReader(false)} 
                onPlayAudio={handleGenerateAndPlayAudio} 
                onStopAudio={handleStopAudio}
                nativeLanguage={nativeLanguage}
                learningLanguage={readerData.learningLanguage}
                // Pass the global vocabulary so the reader can use it offline
                vocabulary={storyData.vocabulary}
             />
        )}
      </main>
    </div>
  );
}
