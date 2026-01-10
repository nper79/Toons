import React, { useState, useEffect, useRef } from 'react';
import { ChevronRight, Download, Upload, XCircle, CheckCircle, Info, AlertTriangle, Users, BookOpen, PenTool, Languages, Home as HomeIcon, Palette, Book, Globe, Library, FileText, Image as ImageIcon, Zap } from 'lucide-react';
import StoryInput from './components/StoryInput';
import AssetGallery from './components/AssetGallery';
import Storyboard from './components/Storyboard';
import { StoryData, StorySegment, ProcessingStatus, AspectRatio, ImageSize, TranslationCache } from './types';
import * as GeminiService from './services/geminiService';
import * as StorageService from './services/storageService';
import { compressImage } from './utils/imageUtils';
import SlideshowPlayer from './components/SlideshowPlayer';
import WebtoonReader from './components/WebtoonReader';
import BeatMaker from './components/BeatMaker';

enum View {
  STUDIO = 'STUDIO',
  FRONTEND = 'FRONTEND',
  BEATMAKER = 'BEATMAKER'
}

enum Tab {
  INPUT = 'input',
  ASSETS = 'assets',
  STORYBOARD = 'storyboard'
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
  const [readerFormat, setReaderFormat] = useState<'immersive' | 'webtoon'>('webtoon'); // NEW: Reader format selection

  // Batch Translation State
  const [isBatchTranslating, setIsBatchTranslating] = useState(false);
  const [isVocabGenerating, setIsVocabGenerating] = useState(false);

  const addToast = (message: string, type: string = 'info') => {
      const id = Math.random().toString(36).substring(7);
      setToasts(prev => [...prev, { id, type, message }]);
      setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 6000);
  };

  useEffect(() => {
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

  const handleAnalyzeStory = async (text: string, style: string) => {
    setStatus(ProcessingStatus.ANALYZING);
    setError(null);
    addToast(`Analyzing Narrative Structure...`, "info");
    try {
      // In Studio mode, we just analyze structure. Translation happens in Frontend.
      const data = await GeminiService.analyzeStoryText(text, style);
      if (!data.segments || data.segments.length === 0) {
          throw new Error("No segments returned.");
      }

      const initializedSegments = data.segments.map(s => ({
          ...s,
          selectedGridIndices: s.selectedGridIndices || [],
          generatedImageUrls: s.generatedImageUrls || [],
          translations: s.translations || {} // Initialize translation cache
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
      console.error("Analysis error:", error);
      setStatus(ProcessingStatus.ERROR);
      const errorMsg = error?.message || "Unknown error";
      setError(`Analysis failed: ${errorMsg}. Check browser console for details.`);
      addToast(`Analysis failed: ${errorMsg}`, "error");
    }
  };

  const handleReAnalyze = async () => {
      if (!storyData) return;
      const fullText = storyData.segments
          .map(s => s.text)
          .filter(text => text && text.trim().length > 0)
          .join('\n\n');
      await handleAnalyzeStory(fullText, storyData.artStyle);
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
             
             const segmentsToTranslate = updatedSegments.filter(s => hasTranslatableContent(s) && !s.translations?.[targetLang]);
             
             if (segmentsToTranslate.length > 0) {
                 const translatedResults = await GeminiService.translateSegments(segmentsToTranslate, targetLang);
                 
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

  const hasTranslatableContent = (segment: StorySegment) => {
    if (segment.text && segment.text.trim().length > 0) return true;
    if (segment.panels?.some(p => (p.caption || '').trim().length > 0)) return true;
    if (segment.choices?.some(c => (c.text || '').trim().length > 0)) return true;
    return false;
  };

  const hasUsableTranslation = (segment: StorySegment, language: string) => {
    if (!hasTranslatableContent(segment)) return true;
    const cache = segment.translations?.[language];
    if (!cache || typeof cache.text !== 'string' || cache.text.trim().length === 0) return false;

    const panels = segment.panels || [];
    if (!cache.captions || cache.captions.length < panels.length) {
        if (panels.some(p => (p.caption || '').trim().length > 0)) return false;
    } else {
        for (let i = 0; i < panels.length; i++) {
            const sourceCaption = panels[i]?.caption || '';
            if (sourceCaption.trim().length > 0 && (!cache.captions[i] || cache.captions[i].trim().length === 0)) {
                return false;
            }
        }
    }

    const choices = segment.choices || [];
    if (choices.length > 0) {
        if (!cache.choices || cache.choices.length < choices.length) return false;
        for (let i = 0; i < choices.length; i++) {
            const sourceChoice = choices[i]?.text || '';
            if (sourceChoice.trim().length > 0 && (!cache.choices[i] || cache.choices[i].trim().length === 0)) {
                return false;
            }
        }
    }

    return true;
  };

  const applyTranslationCache = (segment: StorySegment, language: string) => {
    const cache = segment.translations?.[language];
    if (!cache || !cache.text || cache.text.trim().length === 0) return segment;

    return {
        ...segment,
        text: cache.text,
        tokens: cache.tokens,
        panels: segment.panels.map((p, idx) => ({ ...p, caption: cache.captions?.[idx] || p.caption })),
        choices: segment.choices?.map((c, idx) => ({ ...c, text: cache.choices?.[idx] || c.text }))
    };
  };

  const handleOpenReader = async () => {
    if (!storyData) return;
    setIsTranslating(true);
    
    try {
        const segmentsMissingTranslation = storyData.segments.filter(s => hasTranslatableContent(s) && !hasUsableTranslation(s, learningLanguage));
        let updatedSegments = storyData.segments;

        if (segmentsMissingTranslation.length === 0) {
            addToast(`Opening ${learningLanguage} Reader (Cached).`, "success");
        } else {
            addToast(`Translating ${segmentsMissingTranslation.length} segments to ${learningLanguage}...`, "info");
            const translatedResults = await GeminiService.translateSegments(segmentsMissingTranslation, learningLanguage);

            updatedSegments = storyData.segments.map(seg => {
                const translatedSeg = translatedResults.find(t => t.id === seg.id);
                if (!translatedSeg || !translatedSeg.text || translatedSeg.text.trim().length === 0) return seg;

                return {
                    ...seg,
                    translations: {
                        ...(seg.translations || {}),
                        [learningLanguage]: {
                            text: translatedSeg.text,
                            tokens: translatedSeg.tokens || [],
                            captions: translatedSeg.panels.map(p => p.caption),
                            choices: translatedSeg.choices?.map(c => c.text) || []
                        }
                    }
                };
            });

            setStoryData(prev => prev ? ({
                ...prev,
                segments: updatedSegments,
                completedTranslations: {
                    ...(prev.completedTranslations || {}),
                    [learningLanguage]: updatedSegments.every(s => hasUsableTranslation(s, learningLanguage))
                }
            }) : null);
            addToast("Translation complete.", "success");
        }

        const translatedSegments = updatedSegments.map(s => applyTranslationCache(s, learningLanguage));
        
        setReaderData({
            ...storyData,
            segments: translatedSegments,
            learningLanguage,
            nativeLanguage
        });
        setShowReader(true);

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
    reader.onload = async (e) => {
        const result = e.target?.result as string;
        if (result) {
            // Compress uploaded image before storing to save memory
            const compressedResult = await compressImage(result, 0.85);
            setStoryData(prev => {
                if (!prev) return null;
                if (type === 'cover') {
                    return { ...prev, cover: { imageUrl: compressedResult } };
                }
                if (type === 'character') {
                    return { ...prev, characters: prev.characters.map(c => c.id === id ? { ...c, imageUrl: compressedResult } : c) };
                } else {
                    return { ...prev, settings: prev.settings.map(s => s.id === id ? { ...s, imageUrl: compressedResult } : s) };
                }
            });
            addToast("Asset uploaded and optimized successfully", "success");
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

  const getLastGeneratedImage = (segment: StorySegment) => {
    const urls = segment.generatedImageUrls || [];
    for (let i = urls.length - 1; i >= 0; i--) {
        const url = urls[i];
        if (url && url.trim().length > 0) return url;
    }
    if (segment.masterGridImageUrl && segment.masterGridImageUrl.trim().length > 0) {
        return segment.masterGridImageUrl;
    }
    return undefined;
  };

  const getSceneTextForPanel = (segment: StorySegment, panelIndex: number) => {
    const panel = segment.panels?.[panelIndex];
    const caption = panel?.caption;
    if (caption && caption.trim().length > 0) return caption;
    if (segment.text && segment.text.trim().length > 0) return segment.text;
    const visualPrompt = panel?.visualPrompt;
    if (visualPrompt && visualPrompt.trim().length > 0) return visualPrompt;
    if (segment.scenePrompt && segment.scenePrompt.trim().length > 0) return segment.scenePrompt;
    return '';
  };

  // Cache for establishing shots per location (settingId -> imageUrl)
  const establishingShotsRef = useRef<Record<string, string>>({});

  const handleGenerateScene = async (segmentId: string) => {
    if (!storyData) return;
    const segmentIndex = storyData.segments.findIndex(s => s.id === segmentId);
    if (segmentIndex < 0) return;

    setStoryData(prev => prev ? ({ ...prev, segments: prev.segments.map(s => s.id === segmentId ? { ...s, isGenerating: true } : s) }) : null);
    addToast("🎬 Starting progressive scene generation...", "info");

    try {
      const segment = storyData.segments[segmentIndex];
      const fullStoryText = storyData.segments
          .map(s => s.text)
          .filter(text => text && text.trim().length > 0)
          .join('\n\n');

      // Gather character info
      const characterRefs: string[] = [];
      const characterDescriptions: { name: string; description: string }[] = [];

      if (segment.characterIds && segment.characterIds.length > 0) {
          segment.characterIds.forEach(charId => {
              const char = storyData.characters.find(c => c.id === charId);
              if (!char) return;
              characterDescriptions.push({ name: char.name, description: char.description });
              if (char.imageUrl) characterRefs.push(char.imageUrl);
          });
      }

      // Gather setting info
      const setting = storyData.settings.find(s => s.id === segment.settingId);
      const settingRef = setting?.imageUrl;
      const settingDescription = setting ? `${setting.name}: ${setting.description}` : undefined;

      // Get previous scene info for continuity
      let previousSceneImage: string | undefined = undefined;
      let previousSceneText: string | undefined = undefined;
      if (segmentIndex > 0) {
          const prevSegment = storyData.segments[segmentIndex - 1];
          previousSceneImage = getLastGeneratedImage(prevSegment);
          previousSceneText = prevSegment.text;
      }

      // Get establishing shot for this location (if exists)
      const locationId = segment.settingId || 'default';
      const existingEstablishingShot = establishingShotsRef.current[locationId];

      const panelCount = segment.panels && segment.panels.length > 0 ? segment.panels.length : 1;
      const generatedImageUrls: string[] = new Array(panelCount).fill("");
      const totalPanels = storyData.segments.length;

      for (let i = 0; i < panelCount; i++) {
          const panel = segment.panels?.[i];
          const sceneText = getSceneTextForPanel(segment, i);
          if (!sceneText || sceneText.trim().length === 0) continue;

          // Get background type from panel, default to BOKEH (standard webtoon style)
          const backgroundType = panel?.backgroundType || 'BOKEH';
          const cameraAngle = panel?.cameraAngle || 'THREE_QUARTER';

          // Check if this is the first panel in a new location
          const isFirstPanelInLocation = backgroundType === 'DETAILED' && !existingEstablishingShot;

          addToast(`🔍 Analyzing scene ${segmentIndex + 1} for continuity...`, "info");

          // Use the new progressive generation system
          const result = await GeminiService.generateSceneImageProgressive({
              currentSceneText: sceneText,
              fullStoryContext: fullStoryText,
              previousSceneImage,
              previousSceneText,
              characterRefs,
              characterDescriptions,
              settingRef,
              settingDescription,
              panelNumber: segmentIndex + 1,
              totalPanels,
              suggestedCameraAngle: cameraAngle,
              suggestedBackgroundType: backgroundType,
              isFirstPanelInLocation,
              globalStyle: storyData.visualStyleGuide
          });

          generatedImageUrls[i] = result.imageUrl;

          // Update previous scene for next iteration
          previousSceneImage = result.imageUrl;
          previousSceneText = sceneText;

          // Store as establishing shot if it was a DETAILED background
          if (isFirstPanelInLocation && result.imageUrl) {
              establishingShotsRef.current[locationId] = result.imageUrl;
              console.log(`Stored establishing shot for location: ${locationId}`);
          }

          // Log the detailed prompt used
          console.log(`\n📋 Panel ${segmentIndex + 1} generated with prompt:`, result.usedPrompt);
      }

      const primaryImage = generatedImageUrls.find(url => url && url.trim().length > 0);
      const selectedGridIndices = generatedImageUrls
          .map((url, idx) => (url && url.trim().length > 0 ? idx : -1))
          .filter(idx => idx >= 0);

      setStoryData(prev => prev ? ({
          ...prev,
          segments: prev.segments.map(s => s.id === segmentId ? {
              ...s,
              masterGridImageUrl: primaryImage || s.masterGridImageUrl,
              generatedImageUrls,
              selectedGridIndices,
              isGenerating: false
          } : s)
      }) : null);
      addToast("✅ Scene generated with progressive analysis!", "success");
    } catch (e: any) {
       console.error("Scene generation failed:", e);
       setStoryData(prev => prev ? ({ ...prev, segments: prev.segments.map(s => s.id === segmentId ? { ...s, isGenerating: false } : s) }) : null);
       addToast("Visual generation failed: " + (e?.message || "Unknown error"), "error");
    }
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
                    onClick={() => setCurrentView(View.BEATMAKER)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${currentView === View.BEATMAKER ? 'bg-gradient-to-r from-rose-500 to-orange-500 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                  >
                      <Zap className="w-3.5 h-3.5" /> Beat Maker
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
                            <button 
                                onClick={handleReAnalyze}
                                className="p-2 md:px-3 md:py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 border border-amber-500/50 rounded flex items-center gap-2 transition-all shadow-[0_0_15px_rgba(245,158,11,0.1)]" 
                                title="Repair / Re-Analyze Imported Story"
                            >
                                <Zap className="w-4 h-4 fill-current" /> 
                                <span className="hidden md:inline text-xs font-bold">Re-Analyze</span>
                            </button>

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
                            
                            <button onClick={handleExportPrompts} className="p-2 md:px-3 md:py-1.5 bg-slate-800 rounded border border-slate-700 flex items-center gap-2 hover:bg-slate-700 transition-colors" title="Download Image Prompts Only">
                                <ImageIcon className="w-4 h-4" /> 
                                <span className="hidden md:inline text-xs font-bold">Export Prompts</span>
                            </button>

                            <button onClick={handleExportText} className="p-2 md:px-3 md:py-1.5 bg-slate-800 rounded border border-slate-700 flex items-center gap-2 hover:bg-slate-700 transition-colors" title="Download Text Only">
                                <FileText className="w-4 h-4" /> 
                                <span className="hidden md:inline text-xs font-bold">Export Text</span>
                            </button>

                            <button onClick={handleExport} className="p-2 md:px-3 md:py-1.5 bg-slate-800 rounded border border-slate-700 flex items-center gap-2 hover:bg-slate-700 transition-colors" title="Export Project (Full)">
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

                    {/* Reader Format Toggle */}
                    <div className="mt-6 pt-6 border-t border-slate-700">
                        <label className="text-xs font-bold text-amber-300 uppercase tracking-wider mb-3 block">Reader Format</label>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setReaderFormat('webtoon')}
                                className={`flex-1 p-4 rounded-xl border transition-all ${
                                    readerFormat === 'webtoon'
                                        ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                                        : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-600'
                                }`}
                            >
                                <div className="text-lg font-bold mb-1">Webtoon</div>
                                <div className="text-xs opacity-70">Classic vertical scroll, text between panels</div>
                            </button>
                            <button
                                onClick={() => setReaderFormat('immersive')}
                                className={`flex-1 p-4 rounded-xl border transition-all ${
                                    readerFormat === 'immersive'
                                        ? 'bg-indigo-500/20 border-indigo-500 text-indigo-300'
                                        : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-600'
                                }`}
                            >
                                <div className="text-lg font-bold mb-1">Immersive</div>
                                <div className="text-xs opacity-70">Fullscreen dark mode, floating captions</div>
                            </button>
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
                    onGenerateScene={handleGenerateScene}
                    onPlayAudio={handleGenerateAndPlayAudio}
                    onStopAudio={handleStopAudio}
                />}
            </>
        )}

        {/* BEAT MAKER VIEW */}
        {currentView === View.BEATMAKER && (
            <div className="h-[calc(100vh-8rem)]">
                <BeatMaker
                    initialText={storyData?.segments.map(s => s.text).filter(Boolean).join(' ') || ''}
                    onSegmentsReady={(segments) => {
                        if (storyData) {
                            setStoryData({ ...storyData, segments });
                            addToast("Beats exported to storyboard!", "success");
                            setCurrentView(View.STUDIO);
                            setActiveTab(Tab.STORYBOARD);
                        }
                    }}
                />
            </div>
        )}

        {/* Reader (triggered from Frontend) - Shows Webtoon or Immersive based on selection */}
        {showReader && readerData && (
            readerFormat === 'webtoon' ? (
                <WebtoonReader
                    segments={readerData.segments}
                    onClose={() => setShowReader(false)}
                    onPlayAudio={handleGenerateAndPlayAudio}
                    onStopAudio={handleStopAudio}
                />
            ) : (
                <SlideshowPlayer
                    segments={readerData.segments}
                    onClose={() => setShowReader(false)}
                    onPlayAudio={handleGenerateAndPlayAudio}
                    onStopAudio={handleStopAudio}
                    nativeLanguage={nativeLanguage}
                    learningLanguage={readerData.learningLanguage}
                    vocabulary={storyData?.vocabulary}
                />
            )
        )}
      </main>
    </div>
  );
}
