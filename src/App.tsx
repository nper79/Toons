
import React, { useState, useEffect, useRef } from 'react';
import { Layout, Clapperboard, Layers, ChevronRight, Key, ExternalLink, Download, Upload, XCircle, CheckCircle, Info, AlertTriangle, Users, BookOpen, PenTool, Languages, Home as HomeIcon, Plus, Palette, Book, Globe, Library, FileText, Image as ImageIcon } from 'lucide-react';
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
      addToast("Generating Global Vocabulary... This might take a moment.", "info");

      try {
          let updatedVocabulary = { ...(storyData.vocabulary || {}) };
          const wordsByLang: Record<string, Set<string>> = {};

          // Helper to add words cleanly using Unicode properties
          // Removes everything that is NOT a Letter (L) or Number (N)
          const cleanWordRegex = /[^\p{L}\p{N}]+/gu;

          const collect = (lang: string, candidates: string[]) => {
              if (!wordsByLang[lang]) wordsByLang[lang] = new Set();
              candidates.forEach(w => {
                  const clean = w.replace(cleanWordRegex, "").trim();
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

                      // 2. Collect from Captions
                      translation.captions.forEach(cap => {
                          if (isAsian && typeof Intl !== 'undefined' && (Intl as any).Segmenter) {
                              try {
                                  const segmenter = new (Intl as any).Segmenter(lang === 'Japanese' ? 'ja' : 'zh', { granularity: 'word' });
                                  const segments = Array.from(segmenter.segment(cap)).map((seg: any) => seg.segment);
                                  collect(lang, segments);
                              } catch (e) {
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
              
              // REMOVED THE .slice(0, 100) LIMIT. Now processes all unique words.
              const uniqueWords = Array.from(wordSet);

              if (uniqueWords.length === 0) continue;

              const targetLangs = LANGUAGES.map(l => l.code);
              
              for (const targetLang of targetLangs) {
                  if (sourceLang === targetLang) continue; 

                  addToast(`Defining ${sourceLang} terms in ${targetLang}...`, "info");
                  
                  // Filter words that are NOT yet in vocabulary
                  const wordsToFetch = uniqueWords.filter(word => 
                      !updatedVocabulary[word] || !updatedVocabulary[word][targetLang]
                  );

                  if (wordsToFetch.length > 0) {
                      // Process in batches implicitly handled by service or we loop here
                      // We'll loop here to ensure UI responsiveness updates
                      const BATCH_SIZE = 50;
                      for (let i = 0; i < wordsToFetch.length; i += BATCH_SIZE) {
                          const batch = wordsToFetch.slice(i, i + BATCH_SIZE);
                          const definitions = await GeminiService.batchDefineVocabulary(batch, targetLang);
                          
                          Object.entries(definitions).forEach(([word, def]) => {
                              if (!updatedVocabulary[word]) updatedVocabulary[word] = {};
                              updatedVocabulary[word][targetLang] = def;
                          });
                          
                          // Optional: Update state progressively (optional, might cause re-renders)
                      }
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
      addToast("Analyzing scene for continuity and spatial accuracy...", "info");
      
      try {
          const segmentIndex = storyData.segments.findIndex(s => s.id === segmentId);
          if (segmentIndex === -1) throw new Error("Segment not found");
          
          const segment = storyData.segments[segmentIndex];
          
          // Get context info
          let context = `Characters: ${segment.characterIds.map(id => storyData.characters.find(c => c.id === id)?.name).join(', ')}. `;
          const setting = storyData.settings.find(s => s.id === segment.settingId);
          if (setting) { context += `Location: ${setting.name}. SPATIAL BLUEPRINT: ${setting.spatialLayout}.`; }
          
          const fullStoryText = storyData.segments.map(s => s.text).join('\n\n');
          
          // --- GET PREVIOUS SCENE DATA FOR CONTINUITY ---
          let prevImage = undefined;
          let prevText = undefined;
          if (segmentIndex > 0) {
              const prevSeg = storyData.segments[segmentIndex - 1];
              prevText = prevSeg.text;
              if (prevSeg.masterGridImageUrl) {
                  prevImage = prevSeg.masterGridImageUrl;
              }
          }

          const newPanels = await GeminiService.regeneratePanelPrompts(
              segment.text, 
              fullStoryText, 
              storyData.artStyle, 
              context,
              prevImage, // Pass image
              prevText   // Pass text
          );
          
          setStoryData(prev => prev ? ({ ...prev, segments: prev.segments.map(s => s.id === segmentId ? { ...s, panels: newPanels, isGenerating: false } : s) }) : null);
          addToast("Continuity check complete. Prompts refined.", "success");
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

  // NEW: Handler for Export Text
  const handleExportText = () => {
    if (storyData) {
        StorageService.exportStoryText(storyData);
    }
  };

  // NEW: Handler for Exporting Image Prompts
  const handleExportPrompts = () => {
     if (storyData) {
         StorageService.exportImagePrompts(storyData);
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
            onRegeneratePrompts={handleRegeneratePrompts}
        />}
      </main>
    </div>
  );
}
