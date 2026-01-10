import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
    ChevronRight, Users, MapPin, Shirt, Camera,
    Sparkles, Loader2, Trash2, Plus, ArrowDown,
    Square, Focus, Zap, SplitSquareHorizontal, Image as ImageIcon,
    FileText, CheckCircle, Send, MessageSquare, Brain, Eye, Play, RefreshCw,
    Download, Upload, FolderArchive, UserCircle, Palette, PlayCircle, Save, Library, Clock
} from 'lucide-react';
import { StorySegment, BackgroundType, SegmentType, AspectRatio, ImageSize, SpeechBubble, TextPanel, VNSpeech } from '../types';
import * as GeminiService from '../services/geminiService';
import { BeatAnalysisResult, ExtractedCharacter, CharacterSheet } from '../services/geminiService';
import JSZip from 'jszip';
import WebtoonReader from './WebtoonReader';
import SpeechBubbleRenderer from './SpeechBubbleRenderer';
import TextPanelRenderer from './TextPanelRenderer';

// Extended beat with image URL, speech bubbles, text panels, and VN speeches
interface BeatWithImage extends BeatAnalysisResult {
    imageUrl?: string;
    isGenerating?: boolean;
    speechBubbles?: SpeechBubble[];
    isGeneratingSpeechBubbles?: boolean;
    textPanels?: TextPanel[];
    isGeneratingTextPanels?: boolean;
    vnSpeeches?: VNSpeech[];
    isGeneratingVNSpeeches?: boolean;
}

// Saved story for library
interface SavedStory {
    id: string;
    name: string;
    dateSaved: string;
    beatCount: number;
    imageCount: number;
    inputText: string;
    sourceLanguage: string;
    beats: BeatWithImage[];
    extractedCharacters: ExtractedCharacter[];
    characterSheets: CharacterSheet[];
}

interface BeatMakerProps {
    onSegmentsReady?: (segments: StorySegment[]) => void;
    initialText?: string;
}

const CAMERA_ANGLES = [
    'OVER_SHOULDER', 'SIDE_PROFILE', 'THREE_QUARTER', 'LOW_ANGLE',
    'HIGH_ANGLE', 'DUTCH_ANGLE', 'POV', 'BIRDS_EYE', 'WORMS_EYE', 'FRONTAL'
];

const BACKGROUND_TYPES: { value: BackgroundType; label: string; icon: any; color: string }[] = [
    { value: 'DETAILED', label: 'Detailed', icon: ImageIcon, color: 'emerald' },
    { value: 'BOKEH', label: 'Bokeh', icon: Focus, color: 'blue' },
    { value: 'GRADIENT', label: 'Gradient', icon: Sparkles, color: 'purple' },
    { value: 'SPEEDLINES', label: 'Action', icon: Zap, color: 'orange' },
    { value: 'SPLIT', label: 'Split', icon: SplitSquareHorizontal, color: 'pink' },
    { value: 'WHITE', label: 'White', icon: Square, color: 'slate' },
];

const BeatMaker: React.FC<BeatMakerProps> = ({ onSegmentsReady, initialText = '' }) => {
    const [inputText, setInputText] = useState(initialText);
    const [beats, setBeats] = useState<BeatWithImage[]>([]);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [selectedBeatId, setSelectedBeatId] = useState<string | null>(null);
    const [showFlowView, setShowFlowView] = useState(true);
    const [sourceLanguage, setSourceLanguage] = useState<string>('');
    const [error, setError] = useState<string | null>(null);

    // Image Generation State
    const [isGeneratingImages, setIsGeneratingImages] = useState(false);
    const [generatingBeatIndex, setGeneratingBeatIndex] = useState<number>(-1);
    const [imageGenProgress, setImageGenProgress] = useState<string>('');
    const [imagesToGenerate, setImagesToGenerate] = useState<number>(5); // Default to 5
    const [bubblesToGenerate, setBubblesToGenerate] = useState<number>(5); // Default to 5
    const [isGeneratingBubbles, setIsGeneratingBubbles] = useState(false);
    const [bubbleGenProgress, setBubbleGenProgress] = useState<string>('');

    // Text Panels State (Webtoon-style)
    const [panelsToGenerate, setPanelsToGenerate] = useState<number>(5);
    const [isGeneratingPanels, setIsGeneratingPanels] = useState(false);
    const [panelGenProgress, setPanelGenProgress] = useState<string>('');

    // Import/Export State
    const [isExporting, setIsExporting] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Character Sheets State
    const [extractedCharacters, setExtractedCharacters] = useState<ExtractedCharacter[]>([]);
    const [characterSheets, setCharacterSheets] = useState<CharacterSheet[]>([]);
    const [isExtractingCharacters, setIsExtractingCharacters] = useState(false);
    const [isGeneratingSheets, setIsGeneratingSheets] = useState(false);
    const [sheetGenProgress, setSheetGenProgress] = useState<string>('');

    // Player State
    const [showPlayer, setShowPlayer] = useState(false);

    // Story Library State
    const [savedStories, setSavedStories] = useState<SavedStory[]>([]);
    const [showLibrary, setShowLibrary] = useState(false);
    const [saveDialogOpen, setSaveDialogOpen] = useState(false);
    const [newStoryName, setNewStoryName] = useState('');

    // Load library from localStorage on mount
    useEffect(() => {
        const loadLibrary = () => {
            try {
                const libraryData = localStorage.getItem('beatmaker_library');
                if (libraryData) {
                    const stories: SavedStory[] = JSON.parse(libraryData);
                    setSavedStories(stories);
                }
            } catch (e) {
                console.error('Failed to load library:', e);
            }
        };
        loadLibrary();
    }, []);

    // Save current project to library
    const handleSaveToLibrary = () => {
        if (!newStoryName.trim() || beats.length === 0) return;

        const newStory: SavedStory = {
            id: `story-${Date.now()}`,
            name: newStoryName.trim(),
            dateSaved: new Date().toISOString(),
            beatCount: beats.length,
            imageCount: beats.filter(b => b.imageUrl).length,
            inputText,
            sourceLanguage,
            beats: beats.map(b => ({ ...b, isGenerating: false })),
            extractedCharacters,
            characterSheets
        };

        const updatedLibrary = [...savedStories, newStory];
        setSavedStories(updatedLibrary);

        try {
            localStorage.setItem('beatmaker_library', JSON.stringify(updatedLibrary));
            console.log('✅ Story saved to library:', newStory.name);
        } catch (e) {
            console.error('Failed to save to library:', e);
            setError('Failed to save story. localStorage may be full.');
        }

        setSaveDialogOpen(false);
        setNewStoryName('');
    };

    // Load story from library
    const handleLoadFromLibrary = (storyId: string) => {
        const story = savedStories.find(s => s.id === storyId);
        if (!story) return;

        setInputText(story.inputText);
        setSourceLanguage(story.sourceLanguage);
        setBeats(story.beats);
        setExtractedCharacters(story.extractedCharacters);
        setCharacterSheets(story.characterSheets);

        if (story.beats.length > 0) {
            setSelectedBeatId(story.beats[0].id);
        }

        setShowLibrary(false);
        console.log('✅ Story loaded from library:', story.name);
    };

    // Delete story from library
    const handleDeleteFromLibrary = (storyId: string) => {
        const updatedLibrary = savedStories.filter(s => s.id !== storyId);
        setSavedStories(updatedLibrary);

        try {
            localStorage.setItem('beatmaker_library', JSON.stringify(updatedLibrary));
            console.log('✅ Story deleted from library');
        } catch (e) {
            console.error('Failed to delete from library:', e);
        }
    };

    // Convert beats to segments for the player (includes VN speeches)
    const beatsAsSegments: StorySegment[] = useMemo(() => {
        return beats.map(beat => ({
            id: beat.id,
            text: beat.text,
            settingId: '',
            characterIds: [],
            costumeOverride: beat.clothingState,
            panels: [{
                panelIndex: 0,
                visualPrompt: beat.visualPrompt,
                caption: beat.text,
                cameraAngle: beat.cameraAngle,
                backgroundType: beat.backgroundType as BackgroundType
            }],
            type: SegmentType.MAIN,
            selectedGridIndices: beat.imageUrl ? [0] : [],
            generatedImageUrls: beat.imageUrl ? [beat.imageUrl] : [],
            masterGridImageUrl: beat.imageUrl,
            vnSpeeches: beat.vnSpeeches // Pass VN speeches to player
        }));
    }, [beats]);

    // AI-Powered Analysis
    const handleAnalyze = async () => {
        if (!inputText.trim()) return;
        setIsAnalyzing(true);
        setError(null);

        try {
            console.log("🎬 Starting AI Beat Analysis...");
            const result = await GeminiService.analyzeBeatsMaker(inputText);

            if (result.beats && result.beats.length > 0) {
                setBeats(result.beats);
                setSourceLanguage(result.sourceLanguage || '');
                setSelectedBeatId(result.beats[0].id);
                console.log("✅ AI Analysis complete:", result.totalBeats, "beats");
            } else {
                setError("AI returned no beats. Try again or check your text.");
            }
        } catch (e: any) {
            console.error("AI Analysis failed:", e);
            setError(e?.message || "Analysis failed. Please try again.");
        } finally {
            setIsAnalyzing(false);
        }
    };

    // Extract characters from text
    const handleExtractCharacters = async () => {
        if (!inputText.trim()) return;
        setIsExtractingCharacters(true);
        setError(null);

        try {
            console.log("👤 Extracting characters from story...");
            const characters = await GeminiService.extractCharactersFromStory(inputText);
            setExtractedCharacters(characters);
            console.log("✅ Characters extracted:", characters.length);
        } catch (e: any) {
            console.error("Character extraction failed:", e);
            setError(e?.message || "Failed to extract characters.");
        } finally {
            setIsExtractingCharacters(false);
        }
    };

    // Generate character sheets for all extracted characters
    const handleGenerateCharacterSheets = async () => {
        if (extractedCharacters.length === 0 || isGeneratingSheets) return;

        setIsGeneratingSheets(true);
        setError(null);
        const newSheets: CharacterSheet[] = [];

        for (let i = 0; i < extractedCharacters.length; i++) {
            const character = extractedCharacters[i];
            setSheetGenProgress(`Generating sheet for ${character.name} (${i + 1}/${extractedCharacters.length})...`);

            try {
                console.log(`🎨 Generating character sheet for ${character.name}...`);
                const sheetImageUrl = await GeminiService.generateCharacterSheet(character);
                newSheets.push({ character, sheetImageUrl });
                setCharacterSheets([...newSheets]); // Update progressively
                console.log(`✅ Character sheet generated for ${character.name}`);
            } catch (e: any) {
                console.error(`Failed to generate sheet for ${character.name}:`, e);
                // Continue with next character
            }
        }

        setCharacterSheets(newSheets);
        setIsGeneratingSheets(false);
        setSheetGenProgress('');
    };

    // Generate single character sheet
    const handleGenerateSingleSheet = async (characterId: string) => {
        const character = extractedCharacters.find(c => c.id === characterId);
        if (!character) return;

        setSheetGenProgress(`Generating sheet for ${character.name}...`);

        try {
            const sheetImageUrl = await GeminiService.generateCharacterSheet(character);
            setCharacterSheets(prev => {
                const existing = prev.findIndex(s => s.character.id === characterId);
                if (existing >= 0) {
                    const updated = [...prev];
                    updated[existing] = { character, sheetImageUrl };
                    return updated;
                }
                return [...prev, { character, sheetImageUrl }];
            });
            console.log(`✅ Character sheet regenerated for ${character.name}`);
        } catch (e: any) {
            console.error(`Failed to regenerate sheet:`, e);
            setError(e?.message || 'Sheet generation failed');
        } finally {
            setSheetGenProgress('');
        }
    };

    const handleUpdateBeat = (beatId: string, updates: Partial<BeatWithImage>) => {
        setBeats(prev => prev.map(b =>
            b.id === beatId ? { ...b, ...updates } : b
        ));
    };

    const handleAddSilentBeat = (afterIndex: number) => {
        const prevBeat = beats[afterIndex];
        const newBeat: BeatAnalysisResult = {
            id: `beat-new-${Date.now()}`,
            beatIndex: afterIndex + 1,
            text: '',
            isSilent: true,
            characters: prevBeat?.characters || [],
            sameEnvironmentAsPrevious: true,
            environmentDescription: prevBeat?.environmentDescription || 'Same as previous',
            clothingState: prevBeat?.clothingState || 'Same as previous',
            cameraAngle: 'THREE_QUARTER',
            backgroundType: 'GRADIENT',
            visualPrompt: '[Silent beat - describe the visual moment]',
            analysisReasoning: 'Manually added silent beat for pacing'
        };

        const newBeats = [...beats];
        newBeats.splice(afterIndex + 1, 0, newBeat);
        newBeats.forEach((b, i) => b.beatIndex = i);
        setBeats(newBeats);
        setSelectedBeatId(newBeat.id);
    };

    const handleDeleteBeat = (beatId: string) => {
        setBeats(prev => {
            const filtered = prev.filter(b => b.id !== beatId);
            filtered.forEach((b, i) => b.beatIndex = i);
            return filtered;
        });
        setSelectedBeatId(null);
    };

    const selectedBeat = useMemo(() =>
        beats.find(b => b.id === selectedBeatId),
        [beats, selectedBeatId]
    );

    // Helper to check if clothing states are similar
    const isSameClothing = (clothing1: string, clothing2: string): boolean => {
        if (!clothing1 || !clothing2) return false;
        const normalize = (s: string) => s.toLowerCase().trim();
        const c1 = normalize(clothing1);
        const c2 = normalize(clothing2);
        // Check for exact match or common clothing references
        if (c1 === c2) return true;
        if (c1.includes('same') || c2.includes('same')) return true;
        if (c1.includes('previous') || c2.includes('previous')) return true;
        // Check for similar clothing descriptions (e.g., "office wear", "casual clothes")
        const keywords1 = c1.split(/[\s,]+/).filter(w => w.length > 3);
        const keywords2 = c2.split(/[\s,]+/).filter(w => w.length > 3);
        const commonKeywords = keywords1.filter(k => keywords2.includes(k));
        return commonKeywords.length >= 2;
    };

    // Generate images for beats progressively (respects imagesToGenerate limit)
    const handleGenerateAllImages = async () => {
        if (beats.length === 0 || isGeneratingImages) return;

        setIsGeneratingImages(true);
        setError(null);

        // Find the starting point: first beat without an image
        let startIndex = 0;
        for (let i = 0; i < beats.length; i++) {
            if (!beats[i].imageUrl) {
                startIndex = i;
                break;
            }
            // If all have images, start from the beginning
            if (i === beats.length - 1) {
                startIndex = 0;
            }
        }

        // Calculate end index based on limit
        const endIndex = Math.min(startIndex + imagesToGenerate, beats.length);
        const totalToGenerate = endIndex - startIndex;

        // Find the previous image for continuity (from beats before startIndex)
        let previousImage: string | undefined = undefined;
        let previousClothing: string = '';

        for (let i = startIndex - 1; i >= 0; i--) {
            if (beats[i].imageUrl) {
                previousImage = beats[i].imageUrl;
                previousClothing = beats[i].clothingState;
                break;
            }
        }

        // Build character reference images array (with names for prompt)
        const characterRefImages = characterSheets.map(s => s.sheetImageUrl);
        const characterRefNames = characterSheets.map(s => s.character.name);

        let generatedCount = 0;
        for (let i = startIndex; i < endIndex; i++) {
            const beat = beats[i];
            generatedCount++;
            setGeneratingBeatIndex(i);
            setImageGenProgress(`Generating beat ${i + 1} (${generatedCount}/${totalToGenerate})...`);

            // Mark this beat as generating
            setBeats(prev => prev.map((b, idx) =>
                idx === i ? { ...b, isGenerating: true } : b
            ));

            try {
                console.log(`🎨 Generating image for beat ${i + 1}...`);

                // Check if clothing is the same as previous beat
                const sameClothingAsPrevious = i > 0 && isSameClothing(beat.clothingState, previousClothing);

                // Build character identification section
                let characterSection = '';
                if (characterSheets.length > 0) {
                    // Find which characters are in this beat
                    const charactersInBeat = beat.characters || [];
                    const matchedSheets = characterSheets.filter(s =>
                        charactersInBeat.some(c =>
                            c.toLowerCase().includes(s.character.name.toLowerCase()) ||
                            s.character.name.toLowerCase().includes(c.toLowerCase())
                        )
                    );

                    if (matchedSheets.length > 0) {
                        characterSection = `
=== CHARACTERS IN THIS SCENE (USE REFERENCE SHEETS) ===
${matchedSheets.map(s => `- ${s.character.name}: ${s.character.appearance}. Wearing: ${s.character.clothing}`).join('\n')}
IMPORTANT: Match the character appearances EXACTLY as shown in the provided reference sheets.
The reference sheets have the character names labeled - use them to identify who is who.
`;
                    }
                }

                // Build the prompt with clothing and environment context
                let clothingInstruction = `Character clothing: ${beat.clothingState}`;

                // If same clothing, add STRONG instructions to maintain exact appearance
                if (sameClothingAsPrevious && previousImage) {
                    clothingInstruction = `CRITICAL - CLOTHING CONTINUITY: The character wears EXACTLY the same outfit as in the reference image.
Maintain identical: clothing colors, patterns, style, accessories.
Original clothing description: ${beat.clothingState}
IMPORTANT: Do NOT change any clothing colors or details from the reference image.`;
                    console.log(`👔 Beat ${i + 1}: Same clothing as previous - enforcing continuity`);
                }

                const fullPrompt = `${beat.visualPrompt}
${characterSection}
${clothingInstruction}
Environment: ${beat.environmentDescription}
Camera angle: ${beat.cameraAngle}
Mood/Atmosphere: ${beat.analysisReasoning}`;

                // Combine character sheet refs with previous image for reference
                const allRefImages: string[] = [
                    ...characterRefImages,
                    ...(previousImage ? [previousImage] : [])
                ];

                const imageUrl = await GeminiService.generateImage(
                    fullPrompt,
                    AspectRatio.MOBILE,
                    ImageSize.K1,
                    allRefImages.length > 0 ? allRefImages : undefined,
                    characterSheets.length > 0
                        ? `Korean Manhwa/Webtoon style, high quality, cel-shaded. USE THE CHARACTER REFERENCE SHEETS to identify characters by name. Characters: ${characterRefNames.join(', ')}.`
                        : (sameClothingAsPrevious && previousImage
                            ? 'Korean Manhwa/Webtoon style, high quality, cel-shaded. MAINTAIN EXACT SAME CHARACTER APPEARANCE AND CLOTHING from reference.'
                            : 'Korean Manhwa/Webtoon style, high quality, cel-shaded'),
                    undefined,
                    false,
                    undefined,
                    previousImage // Action continuity
                );

                // Update beat with generated image
                setBeats(prev => prev.map((b, idx) =>
                    idx === i ? { ...b, imageUrl, isGenerating: false } : b
                ));

                // Store for next iteration continuity
                previousImage = imageUrl;
                previousClothing = beat.clothingState;

                console.log(`✅ Beat ${i + 1} image generated`);

            } catch (e: any) {
                console.error(`Failed to generate image for beat ${i + 1}:`, e);
                setBeats(prev => prev.map((b, idx) =>
                    idx === i ? { ...b, isGenerating: false } : b
                ));
                // Continue with next beat instead of stopping
            }
        }

        setIsGeneratingImages(false);
        setGeneratingBeatIndex(-1);
        setImageGenProgress('');
    };

    // Generate image for a single beat
    const handleGenerateSingleImage = async (beatId: string) => {
        const beatIndex = beats.findIndex(b => b.id === beatId);
        if (beatIndex < 0) return;

        const beat = beats[beatIndex];

        // Mark as generating
        setBeats(prev => prev.map(b =>
            b.id === beatId ? { ...b, isGenerating: true } : b
        ));

        try {
            // Find the best reference image for continuity
            let referenceImage: string | undefined = undefined;
            let previousClothing: string = '';

            for (let i = beatIndex - 1; i >= 0; i--) {
                if (beats[i].imageUrl) {
                    referenceImage = beats[i].imageUrl;
                    previousClothing = beats[i].clothingState;
                    break;
                }
            }

            // Build character reference images array
            const characterRefImages = characterSheets.map(s => s.sheetImageUrl);
            const characterRefNames = characterSheets.map(s => s.character.name);

            // Check if clothing is the same as the reference beat
            const sameClothingAsReference = referenceImage && isSameClothing(beat.clothingState, previousClothing);

            // Build character identification section
            let characterSection = '';
            if (characterSheets.length > 0) {
                const charactersInBeat = beat.characters || [];
                const matchedSheets = characterSheets.filter(s =>
                    charactersInBeat.some(c =>
                        c.toLowerCase().includes(s.character.name.toLowerCase()) ||
                        s.character.name.toLowerCase().includes(c.toLowerCase())
                    )
                );

                if (matchedSheets.length > 0) {
                    characterSection = `
=== CHARACTERS IN THIS SCENE (USE REFERENCE SHEETS) ===
${matchedSheets.map(s => `- ${s.character.name}: ${s.character.appearance}. Wearing: ${s.character.clothing}`).join('\n')}
IMPORTANT: Match the character appearances EXACTLY as shown in the provided reference sheets.
`;
                }
            }

            // Build the prompt with clothing and environment context
            let clothingInstruction = `Character clothing: ${beat.clothingState}`;

            if (sameClothingAsReference && referenceImage) {
                clothingInstruction = `CRITICAL - CLOTHING CONTINUITY: The character wears EXACTLY the same outfit as in the reference image.
Maintain identical: clothing colors, patterns, style, accessories.
Original clothing description: ${beat.clothingState}
IMPORTANT: Do NOT change any clothing colors or details from the reference image.`;
                console.log(`👔 Beat ${beatIndex + 1}: Same clothing as reference - enforcing continuity`);
            }

            const fullPrompt = `${beat.visualPrompt}
${characterSection}
${clothingInstruction}
Environment: ${beat.environmentDescription}
Camera angle: ${beat.cameraAngle}
Mood/Atmosphere: ${beat.analysisReasoning}`;

            // Combine character sheet refs with previous image
            const allRefImages: string[] = [
                ...characterRefImages,
                ...(referenceImage ? [referenceImage] : [])
            ];

            const imageUrl = await GeminiService.generateImage(
                fullPrompt,
                AspectRatio.MOBILE,
                ImageSize.K1,
                allRefImages.length > 0 ? allRefImages : undefined,
                characterSheets.length > 0
                    ? `Korean Manhwa/Webtoon style, high quality, cel-shaded. USE THE CHARACTER REFERENCE SHEETS to identify characters by name. Characters: ${characterRefNames.join(', ')}.`
                    : (sameClothingAsReference && referenceImage
                        ? 'Korean Manhwa/Webtoon style, high quality, cel-shaded. MAINTAIN EXACT SAME CHARACTER APPEARANCE AND CLOTHING from reference.'
                        : 'Korean Manhwa/Webtoon style, high quality, cel-shaded'),
                undefined,
                false,
                undefined,
                referenceImage
            );

            setBeats(prev => prev.map(b =>
                b.id === beatId ? { ...b, imageUrl, isGenerating: false } : b
            ));

            console.log(`✅ Beat ${beatIndex + 1} image regenerated`);

        } catch (e: any) {
            console.error(`Failed to generate image:`, e);
            setBeats(prev => prev.map(b =>
                b.id === beatId ? { ...b, isGenerating: false } : b
            ));
            setError(e?.message || 'Image generation failed');
        }
    };

    // Generate speech bubbles for a single beat
    const handleGenerateSpeechBubbles = async (beatId: string) => {
        const beat = beats.find(b => b.id === beatId);
        if (!beat || !beat.imageUrl || !beat.text || beat.isSilent) {
            console.log('❌ Cannot generate speech bubbles: missing image, text, or beat is silent');
            return;
        }

        // Mark as generating
        setBeats(prev => prev.map(b =>
            b.id === beatId ? { ...b, isGeneratingSpeechBubbles: true } : b
        ));

        try {
            console.log(`💬 Generating speech bubbles for beat "${beat.text.slice(0, 40)}..."`);

            const result = await GeminiService.generateSpeechBubbles(
                beat.imageUrl,
                beat.text,
                beat.characters || [],
                beat.visualPrompt
            );

            setBeats(prev => prev.map(b =>
                b.id === beatId ? {
                    ...b,
                    speechBubbles: result.speechBubbles,
                    isGeneratingSpeechBubbles: false
                } : b
            ));

            console.log(`✅ Generated ${result.speechBubbles.length} speech bubbles`);

        } catch (e: any) {
            console.error(`Failed to generate speech bubbles:`, e);
            setBeats(prev => prev.map(b =>
                b.id === beatId ? { ...b, isGeneratingSpeechBubbles: false } : b
            ));
            setError(e?.message || 'Speech bubble generation failed');
        }
    };

    // Generate speech bubbles for selected number of beats that have images and dialogue
    const handleGenerateAllSpeechBubbles = async () => {
        const beatsWithImagesAndText = beats.filter(b => b.imageUrl && b.text && !b.isSilent);

        if (beatsWithImagesAndText.length === 0) {
            setError('No beats with both images and dialogue to generate bubbles for');
            return;
        }

        // Limit to the selected number
        const beatsToProcess = beatsWithImagesAndText.slice(0, bubblesToGenerate);

        setIsGeneratingBubbles(true);
        console.log(`💬 Generating speech bubbles for ${beatsToProcess.length} beats...`);

        for (let i = 0; i < beatsToProcess.length; i++) {
            const beat = beatsToProcess[i];
            setBubbleGenProgress(`Generating bubbles ${i + 1}/${beatsToProcess.length}...`);
            await handleGenerateSpeechBubbles(beat.id);
        }

        setIsGeneratingBubbles(false);
        setBubbleGenProgress('');
        console.log('✅ Speech bubbles generated');
    };

    // Generate text panels for a single beat (Webtoon-style)
    const handleGenerateTextPanels = async (beatId: string) => {
        const beat = beats.find(b => b.id === beatId);
        if (!beat || !beat.text || beat.isSilent) {
            console.log('❌ Cannot generate text panels: missing text or beat is silent');
            return;
        }

        // Mark as generating
        setBeats(prev => prev.map(b =>
            b.id === beatId ? { ...b, isGeneratingTextPanels: true } : b
        ));

        try {
            console.log(`📝 Generating text panels for beat "${beat.text.slice(0, 40)}..."`);

            const result = await GeminiService.generateTextPanels(
                beat.id,
                beat.text,
                beat.characters || []
            );

            setBeats(prev => prev.map(b =>
                b.id === beatId ? {
                    ...b,
                    textPanels: result.textPanels,
                    isGeneratingTextPanels: false
                } : b
            ));

            console.log(`✅ Generated ${result.textPanels.length} text panels`);

        } catch (e: any) {
            console.error(`Failed to generate text panels:`, e);
            setBeats(prev => prev.map(b =>
                b.id === beatId ? { ...b, isGeneratingTextPanels: false } : b
            ));
            setError(e?.message || 'Text panel generation failed');
        }
    };

    // Generate text panels for selected number of beats
    const handleGenerateAllTextPanels = async () => {
        const beatsWithText = beats.filter(b => b.text && !b.isSilent);

        if (beatsWithText.length === 0) {
            setError('No beats with dialogue to generate text panels for');
            return;
        }

        // Limit to the selected number
        const beatsToProcess = beatsWithText.slice(0, panelsToGenerate);

        setIsGeneratingPanels(true);
        console.log(`📝 Generating text panels for ${beatsToProcess.length} beats...`);

        for (let i = 0; i < beatsToProcess.length; i++) {
            const beat = beatsToProcess[i];
            setPanelGenProgress(`Generating panels ${i + 1}/${beatsToProcess.length}...`);
            await handleGenerateTextPanels(beat.id);
        }

        setIsGeneratingPanels(false);
        setPanelGenProgress('');
        console.log('✅ Text panels generated');
    };

    // Generate VN speeches for a single beat (Visual Novel style)
    const handleGenerateVNSpeeches = async (beatId: string) => {
        const beat = beats.find(b => b.id === beatId);
        if (!beat || !beat.text || beat.isSilent) {
            console.log('❌ Cannot generate VN speeches: missing text or beat is silent');
            return;
        }

        // Mark as generating
        setBeats(prev => prev.map(b =>
            b.id === beatId ? { ...b, isGeneratingVNSpeeches: true } : b
        ));

        try {
            console.log(`🎭 Generating VN speeches for beat "${beat.text.slice(0, 40)}..."`);

            const result = await GeminiService.generateVNSpeeches(
                beat.id,
                beat.text,
                beat.characters || []
            );

            setBeats(prev => prev.map(b =>
                b.id === beatId ? {
                    ...b,
                    vnSpeeches: result.vnSpeeches,
                    isGeneratingVNSpeeches: false
                } : b
            ));

            console.log(`✅ Generated ${result.vnSpeeches.length} VN speeches`);

        } catch (e: any) {
            console.error(`Failed to generate VN speeches:`, e);
            setBeats(prev => prev.map(b =>
                b.id === beatId ? { ...b, isGeneratingVNSpeeches: false } : b
            ));
            setError(e?.message || 'VN speech generation failed');
        }
    };

    // Generate VN speeches for selected number of beats
    const handleGenerateAllVNSpeeches = async () => {
        const beatsWithText = beats.filter(b => b.text && !b.isSilent);

        if (beatsWithText.length === 0) {
            setError('No beats with dialogue to generate VN speeches for');
            return;
        }

        // Limit to the selected number
        const beatsToProcess = beatsWithText.slice(0, panelsToGenerate);

        setIsGeneratingPanels(true);
        console.log(`🎭 Generating VN speeches for ${beatsToProcess.length} beats...`);

        for (let i = 0; i < beatsToProcess.length; i++) {
            const beat = beatsToProcess[i];
            setPanelGenProgress(`Generating speeches ${i + 1}/${beatsToProcess.length}...`);
            await handleGenerateVNSpeeches(beat.id);
        }

        setIsGeneratingPanels(false);
        setPanelGenProgress('');
        console.log('✅ VN speeches generated');
    };

    // Convert beats to segments for export (includes generated images)
    const handleExportToStoryboard = () => {
        const segments: StorySegment[] = beats.map(beat => ({
            id: beat.id,
            text: beat.text,
            settingId: '',
            characterIds: [],
            costumeOverride: beat.clothingState,
            panels: [{
                panelIndex: 0,
                visualPrompt: beat.visualPrompt,
                caption: beat.text,
                cameraAngle: beat.cameraAngle,
                backgroundType: beat.backgroundType as BackgroundType
            }],
            type: SegmentType.MAIN,
            selectedGridIndices: beat.imageUrl ? [0] : [],
            generatedImageUrls: beat.imageUrl ? [beat.imageUrl] : [],
            masterGridImageUrl: beat.imageUrl,
            vnSpeeches: beat.vnSpeeches
        }));

        onSegmentsReady?.(segments);
    };

    // Count how many beats have images
    const beatsWithImages = beats.filter(b => b.imageUrl).length;

    // Export to ZIP file
    const handleExportZip = async () => {
        if (beats.length === 0) return;

        setIsExporting(true);
        setError(null);

        try {
            const zip = new JSZip();

            // Create beats data without the base64 images (we'll store them separately)
            // Speech bubbles, text panels, and VN speeches are preserved in the beat data
            const beatsData = beats.map((beat, idx) => ({
                ...beat,
                imageUrl: beat.imageUrl ? `images/beat_${idx + 1}.png` : undefined,
                isGenerating: false,
                isGeneratingSpeechBubbles: false,
                isGeneratingTextPanels: false,
                isGeneratingVNSpeeches: false,
                // speechBubbles, textPanels, and vnSpeeches arrays are preserved automatically from spread
            }));

            // Create characters data with reference to sheet images
            const charactersData = extractedCharacters.map(char => ({
                ...char,
                sheetImagePath: characterSheets.find(s => s.character.id === char.id)
                    ? `characters/${char.id}.png`
                    : undefined
            }));

            // Count speech bubbles, text panels, and VN speeches
            const beatsWithBubbles = beats.filter(b => b.speechBubbles && b.speechBubbles.length > 0).length;
            const totalBubbles = beats.reduce((sum, b) => sum + (b.speechBubbles?.length || 0), 0);
            const beatsWithPanels = beats.filter(b => b.textPanels && b.textPanels.length > 0).length;
            const totalPanels = beats.reduce((sum, b) => sum + (b.textPanels?.length || 0), 0);
            const beatsWithVNSpeeches = beats.filter(b => b.vnSpeeches && b.vnSpeeches.length > 0).length;
            const totalVNSpeeches = beats.reduce((sum, b) => sum + (b.vnSpeeches?.length || 0), 0);

            // Add metadata
            const metadata = {
                version: '1.4', // Updated version for VN speeches support
                exportDate: new Date().toISOString(),
                sourceLanguage,
                inputText,
                totalBeats: beats.length,
                beatsWithImages: beatsWithImages,
                beatsWithSpeechBubbles: beatsWithBubbles,
                totalSpeechBubbles: totalBubbles,
                beatsWithTextPanels: beatsWithPanels,
                totalTextPanels: totalPanels,
                beatsWithVNSpeeches: beatsWithVNSpeeches,
                totalVNSpeeches: totalVNSpeeches,
                totalCharacters: extractedCharacters.length,
                charactersWithSheets: characterSheets.length
            };

            // Add JSON files
            zip.file('metadata.json', JSON.stringify(metadata, null, 2));
            zip.file('beats.json', JSON.stringify(beatsData, null, 2));
            zip.file('characters.json', JSON.stringify(charactersData, null, 2));

            // Create images folder and add beat images
            const imagesFolder = zip.folder('images');
            for (let i = 0; i < beats.length; i++) {
                const beat = beats[i];
                if (beat.imageUrl && beat.imageUrl.startsWith('data:')) {
                    const base64Data = beat.imageUrl.split(',')[1];
                    if (base64Data && imagesFolder) {
                        imagesFolder.file(`beat_${i + 1}.png`, base64Data, { base64: true });
                    }
                }
            }

            // Create characters folder and add character sheet images
            const charactersFolder = zip.folder('characters');
            for (const sheet of characterSheets) {
                if (sheet.sheetImageUrl && sheet.sheetImageUrl.startsWith('data:')) {
                    const base64Data = sheet.sheetImageUrl.split(',')[1];
                    if (base64Data && charactersFolder) {
                        charactersFolder.file(`${sheet.character.id}.png`, base64Data, { base64: true });
                    }
                }
            }

            // Generate and download ZIP
            const content = await zip.generateAsync({ type: 'blob' });
            const url = URL.createObjectURL(content);
            const a = document.createElement('a');
            a.href = url;
            a.download = `beatmaker_${new Date().toISOString().slice(0, 10)}_${beats.length}beats.zip`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            console.log(`✅ ZIP exported successfully:
- ${beats.length} beats
- ${beatsWithImages} images
- ${beatsWithBubbles} beats with speech bubbles (${totalBubbles} total bubbles)
- ${characterSheets.length} character sheets`);
        } catch (e: any) {
            console.error('Export failed:', e);
            setError(e?.message || 'Export failed');
        } finally {
            setIsExporting(false);
        }
    };

    // Import from ZIP file
    const handleImportZip = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setIsImporting(true);
        setError(null);

        try {
            const zip = await JSZip.loadAsync(file);

            // Read metadata
            const metadataFile = zip.file('metadata.json');
            if (metadataFile) {
                const metadataText = await metadataFile.async('string');
                const metadata = JSON.parse(metadataText);
                setSourceLanguage(metadata.sourceLanguage || '');
                setInputText(metadata.inputText || '');
            }

            // Read beats data
            const beatsFile = zip.file('beats.json');
            if (!beatsFile) {
                throw new Error('Invalid ZIP: beats.json not found');
            }

            const beatsText = await beatsFile.async('string');
            const importedBeats: BeatWithImage[] = JSON.parse(beatsText);

            // Load beat images
            const imagesFolder = zip.folder('images');
            if (imagesFolder) {
                for (let i = 0; i < importedBeats.length; i++) {
                    const beat = importedBeats[i];
                    if (beat.imageUrl && beat.imageUrl.startsWith('images/')) {
                        const imagePath = beat.imageUrl.replace('images/', '');
                        const imageFile = imagesFolder.file(imagePath);
                        if (imageFile) {
                            const imageData = await imageFile.async('base64');
                            importedBeats[i].imageUrl = `data:image/png;base64,${imageData}`;
                        }
                    }
                }
            }

            // Read characters data (if exists - for v1.1+ ZIPs)
            const charactersFile = zip.file('characters.json');
            const importedCharacters: ExtractedCharacter[] = [];
            const importedSheets: CharacterSheet[] = [];

            if (charactersFile) {
                const charactersText = await charactersFile.async('string');
                const charactersData = JSON.parse(charactersText);

                // Load character sheet images
                const charactersFolder = zip.folder('characters');

                for (const charData of charactersData) {
                    // Extract character info (remove sheetImagePath from the stored data)
                    const { sheetImagePath, ...character } = charData;
                    importedCharacters.push(character as ExtractedCharacter);

                    // Load sheet image if exists
                    if (sheetImagePath && charactersFolder) {
                        const sheetFileName = sheetImagePath.replace('characters/', '');
                        const sheetFile = charactersFolder.file(sheetFileName);
                        if (sheetFile) {
                            const sheetImageData = await sheetFile.async('base64');
                            importedSheets.push({
                                character: character as ExtractedCharacter,
                                sheetImageUrl: `data:image/png;base64,${sheetImageData}`
                            });
                        }
                    }
                }

                console.log(`📦 Loaded ${importedCharacters.length} characters, ${importedSheets.length} sheets`);
            }

            // Update state
            setBeats(importedBeats);
            setExtractedCharacters(importedCharacters);
            setCharacterSheets(importedSheets);

            if (importedBeats.length > 0) {
                setSelectedBeatId(importedBeats[0].id);
            }

            // Count imported speech bubbles
            const importedBubbles = importedBeats.filter(b => b.speechBubbles && b.speechBubbles.length > 0).length;
            const totalImportedBubbles = importedBeats.reduce((sum, b) => sum + (b.speechBubbles?.length || 0), 0);

            console.log(`✅ Imported ${importedBeats.length} beats from ZIP:
- ${importedBeats.filter(b => b.imageUrl).length} with images
- ${importedBubbles} with speech bubbles (${totalImportedBubbles} total bubbles)
- ${importedCharacters.length} characters, ${importedSheets.length} sheets`);
        } catch (e: any) {
            console.error('Import failed:', e);
            setError(e?.message || 'Import failed');
        } finally {
            setIsImporting(false);
            // Reset file input
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    const getBgColorClass = (bgType: string) => {
        switch (bgType) {
            case 'DETAILED': return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
            case 'BOKEH': return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
            case 'GRADIENT': return 'bg-purple-500/20 text-purple-300 border-purple-500/30';
            case 'SPEEDLINES': return 'bg-orange-500/20 text-orange-300 border-orange-500/30';
            case 'SPLIT': return 'bg-pink-500/20 text-pink-300 border-pink-500/30';
            default: return 'bg-slate-500/20 text-slate-300 border-slate-500/30';
        }
    };

    return (
        <div className="h-full flex flex-col bg-[#0a0f1a]">
            {/* Header */}
            <div className="border-b border-slate-800 px-6 py-4 flex items-center justify-between bg-slate-900/50">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-rose-500 to-orange-500 rounded-xl flex items-center justify-center">
                            <Brain className="w-5 h-5 text-white" />
                        </div>
                        Beat Maker
                        <span className="text-xs bg-indigo-500/20 text-indigo-300 px-2 py-1 rounded-full font-normal">
                            AI-Powered
                        </span>
                    </h1>
                    <p className="text-sm text-slate-500 mt-1">
                        Gemini analyzes your text and creates beats with camera angles, backgrounds, and prompts
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    {sourceLanguage && (
                        <span className="text-xs bg-slate-800 text-slate-400 px-3 py-1.5 rounded-lg border border-slate-700">
                            Detected: {sourceLanguage}
                        </span>
                    )}

                    {/* Character sheet progress */}
                    {(isExtractingCharacters || isGeneratingSheets) && (
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-violet-500/20 border border-violet-500/30 rounded-lg">
                            <Loader2 className="w-4 h-4 animate-spin text-violet-400" />
                            <span className="text-xs text-violet-300 font-medium">
                                {isExtractingCharacters ? 'Extracting characters...' : sheetGenProgress}
                            </span>
                        </div>
                    )}

                    {/* Image generation progress */}
                    {isGeneratingImages && (
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/20 border border-amber-500/30 rounded-lg">
                            <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                            <span className="text-xs text-amber-300 font-medium">{imageGenProgress}</span>
                        </div>
                    )}

                    {/* Speech bubble generation progress */}
                    {isGeneratingBubbles && bubbleGenProgress && (
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-pink-500/20 border border-pink-500/30 rounded-lg">
                            <Loader2 className="w-4 h-4 animate-spin text-pink-400" />
                            <span className="text-xs text-pink-300 font-medium">{bubbleGenProgress}</span>
                        </div>
                    )}

                    {/* Text panel generation progress */}
                    {isGeneratingPanels && panelGenProgress && (
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/20 border border-emerald-500/30 rounded-lg">
                            <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                            <span className="text-xs text-emerald-300 font-medium">{panelGenProgress}</span>
                        </div>
                    )}

                    {/* Character count badge */}
                    {characterSheets.length > 0 && (
                        <span className="text-xs bg-violet-500/20 text-violet-300 px-3 py-1.5 rounded-lg border border-violet-500/30 flex items-center gap-1">
                            <UserCircle className="w-3 h-3" />
                            {characterSheets.length} characters
                        </span>
                    )}

                    {/* Image count badge */}
                    {beats.length > 0 && beatsWithImages > 0 && (
                        <span className="text-xs bg-cyan-500/20 text-cyan-300 px-3 py-1.5 rounded-lg border border-cyan-500/30">
                            {beatsWithImages}/{beats.length} images
                        </span>
                    )}

                    {/* VN Speeches count badge */}
                    {beats.length > 0 && beats.filter(b => b.vnSpeeches && b.vnSpeeches.length > 0).length > 0 && (
                        <span className="text-xs bg-amber-500/20 text-amber-300 px-3 py-1.5 rounded-lg border border-amber-500/30">
                            {beats.filter(b => b.vnSpeeches && b.vnSpeeches.length > 0).length}/{beats.length} VN speeches
                        </span>
                    )}

                    <button
                        onClick={() => setShowFlowView(!showFlowView)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                            showFlowView
                                ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                                : 'bg-slate-800 text-slate-400 border border-slate-700'
                        }`}
                    >
                        Flow View
                    </button>

                    {/* Play Story Button */}
                    {beatsWithImages > 0 && (
                        <button
                            onClick={() => setShowPlayer(true)}
                            className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-lg text-sm font-bold flex items-center gap-2 transition-all"
                        >
                            <PlayCircle className="w-4 h-4" />
                            Play Story
                        </button>
                    )}

                    {/* Character Sheets Button - show when characters are extracted but sheets not generated */}
                    {extractedCharacters.length > 0 && (
                        <button
                            onClick={handleGenerateCharacterSheets}
                            disabled={isGeneratingSheets || isExtractingCharacters}
                            className="px-4 py-2 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 disabled:from-slate-700 disabled:to-slate-700 text-white rounded-lg text-sm font-bold flex items-center gap-2 transition-all"
                        >
                            {isGeneratingSheets ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Generating...
                                </>
                            ) : (
                                <>
                                    <Palette className="w-4 h-4" />
                                    Generate Sheets ({extractedCharacters.length})
                                </>
                            )}
                        </button>
                    )}

                    {/* Generate Images Button with Selector */}
                    {beats.length > 0 && (
                        <div className="flex items-center gap-1">
                            <select
                                value={imagesToGenerate}
                                onChange={(e) => setImagesToGenerate(parseInt(e.target.value))}
                                disabled={isGeneratingImages}
                                className="h-10 px-2 bg-slate-800 border border-slate-600 rounded-l-lg text-sm text-cyan-300 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none cursor-pointer disabled:opacity-50"
                            >
                                <option value={1}>1 image</option>
                                <option value={3}>3 images</option>
                                <option value={5}>5 images</option>
                                <option value={10}>10 images</option>
                                <option value={beats.length}>All ({beats.length})</option>
                            </select>
                            <button
                                onClick={handleGenerateAllImages}
                                disabled={isGeneratingImages || isAnalyzing}
                                className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:from-slate-700 disabled:to-slate-700 text-white rounded-r-lg text-sm font-bold flex items-center gap-2 transition-all h-10"
                            >
                                {isGeneratingImages ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Generating...
                                    </>
                                ) : (
                                    <>
                                        <Play className="w-4 h-4" />
                                        Generate
                                    </>
                                )}
                            </button>
                        </div>
                    )}

                    {/* Generate Speech Bubbles Button with Selector */}
                    {beatsWithImages > 0 && (
                        <div className="flex items-center gap-1">
                            <select
                                value={bubblesToGenerate}
                                onChange={(e) => setBubblesToGenerate(parseInt(e.target.value))}
                                disabled={isGeneratingBubbles}
                                className="h-10 px-2 bg-slate-800 border border-slate-600 rounded-l-lg text-sm text-pink-300 focus:ring-2 focus:ring-pink-500 focus:border-pink-500 outline-none cursor-pointer disabled:opacity-50"
                            >
                                <option value={1}>1 bubble</option>
                                <option value={5}>5 bubbles</option>
                                <option value={10}>10 bubbles</option>
                                <option value={beats.filter(b => b.imageUrl && b.text && !b.isSilent).length}>
                                    All ({beats.filter(b => b.imageUrl && b.text && !b.isSilent).length})
                                </option>
                            </select>
                            <button
                                onClick={handleGenerateAllSpeechBubbles}
                                disabled={isGeneratingBubbles}
                                className="px-4 py-2 bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 disabled:from-slate-700 disabled:to-slate-700 text-white rounded-r-lg text-sm font-bold flex items-center gap-2 transition-all h-10"
                            >
                                {isGeneratingBubbles ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Generating...
                                    </>
                                ) : (
                                    <>
                                        <MessageSquare className="w-4 h-4" />
                                        Add Bubbles
                                    </>
                                )}
                            </button>
                        </div>
                    )}

                    {/* Generate VN Speeches Button (Visual Novel style) */}
                    {beats.filter(b => b.text && !b.isSilent).length > 0 && (
                        <div className="flex items-center gap-1">
                            <select
                                value={panelsToGenerate}
                                onChange={(e) => setPanelsToGenerate(parseInt(e.target.value))}
                                disabled={isGeneratingPanels}
                                className="h-10 px-2 bg-slate-800 border border-slate-600 rounded-l-lg text-sm text-amber-300 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none cursor-pointer disabled:opacity-50"
                            >
                                <option value={1}>1 beat</option>
                                <option value={5}>5 beats</option>
                                <option value={10}>10 beats</option>
                                <option value={beats.filter(b => b.text && !b.isSilent).length}>
                                    All ({beats.filter(b => b.text && !b.isSilent).length})
                                </option>
                            </select>
                            <button
                                onClick={handleGenerateAllVNSpeeches}
                                disabled={isGeneratingPanels}
                                className="px-4 py-2 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 disabled:from-slate-700 disabled:to-slate-700 text-white rounded-r-lg text-sm font-bold flex items-center gap-2 transition-all h-10"
                            >
                                {isGeneratingPanels ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Generating...
                                    </>
                                ) : (
                                    <>
                                        <MessageSquare className="w-4 h-4" />
                                        VN Speeches
                                    </>
                                )}
                            </button>
                        </div>
                    )}

                    {/* Download ZIP Button */}
                    {beats.length > 0 && (
                        <button
                            onClick={handleExportZip}
                            disabled={isExporting}
                            className="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:bg-slate-700 text-white rounded-lg text-sm font-bold flex items-center gap-2 transition-all"
                        >
                            {isExporting ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Exporting...
                                </>
                            ) : (
                                <>
                                    <Download className="w-4 h-4" />
                                    Download ZIP
                                </>
                            )}
                        </button>
                    )}

                    {/* Save to Library Button */}
                    {beats.length > 0 && (
                        <button
                            onClick={() => setSaveDialogOpen(true)}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-bold flex items-center gap-2 transition-all border border-indigo-500"
                        >
                            <Save className="w-4 h-4" />
                            Save to Library
                        </button>
                    )}

                    {/* Import ZIP Button */}
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".zip"
                        onChange={handleImportZip}
                        className="hidden"
                    />
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isImporting}
                        className="px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 text-white rounded-lg text-sm font-bold flex items-center gap-2 transition-all border border-slate-600"
                    >
                        {isImporting ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Importing...
                            </>
                        ) : (
                            <>
                                <Upload className="w-4 h-4" />
                                Import ZIP
                            </>
                        )}
                    </button>

                    {beats.length > 0 && (
                        <button
                            onClick={handleExportToStoryboard}
                            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-bold flex items-center gap-2 transition-all"
                        >
                            <Send className="w-4 h-4" />
                            Export to Storyboard
                        </button>
                    )}
                </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
                {/* Left Panel - Text Input */}
                <div className="w-80 border-r border-slate-800 flex flex-col bg-slate-900/30">
                    <div className="p-4 border-b border-slate-800">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">
                            Story Text Input
                        </label>
                        <textarea
                            value={inputText}
                            onChange={(e) => setInputText(e.target.value)}
                            placeholder="Paste your story text here... The AI will analyze it and create beats automatically."
                            className="w-full h-48 bg-slate-900 border border-slate-700 rounded-xl p-3 text-sm text-white placeholder-slate-600 resize-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                        />

                        {error && (
                            <div className="mt-2 p-2 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-400">
                                {error}
                            </div>
                        )}

                        <div className="flex gap-2 mt-3">
                            <button
                                onClick={handleAnalyze}
                                disabled={isAnalyzing || !inputText.trim()}
                                className="flex-1 py-3 bg-gradient-to-r from-rose-600 to-orange-600 hover:from-rose-500 hover:to-orange-500 disabled:from-slate-700 disabled:to-slate-700 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all"
                            >
                                {isAnalyzing ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Analyzing...
                                    </>
                                ) : (
                                    <>
                                        <Brain className="w-4 h-4" />
                                        Analyze with AI
                                    </>
                                )}
                            </button>

                            <button
                                onClick={handleExtractCharacters}
                                disabled={isExtractingCharacters || !inputText.trim()}
                                className="py-3 px-3 bg-violet-600 hover:bg-violet-500 disabled:bg-slate-700 text-white rounded-xl font-bold text-sm flex items-center justify-center transition-all"
                                title="Extract characters to create reference sheets"
                            >
                                {isExtractingCharacters ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <UserCircle className="w-4 h-4" />
                                )}
                            </button>
                        </div>

                        <p className="text-[10px] text-slate-600 mt-2 text-center">
                            AI will segment text, detect characters, track clothing, and generate prompts
                        </p>
                    </div>

                    {/* Story Library Section */}
                    <div className="p-3 border-b border-slate-800 bg-indigo-500/5">
                        <div className="flex items-center justify-between mb-2">
                            <button
                                onClick={() => setShowLibrary(!showLibrary)}
                                className="text-xs font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-1 hover:text-indigo-300 transition-colors"
                            >
                                <Library className="w-3 h-3" />
                                Story Library ({savedStories.length})
                            </button>
                            {savedStories.length > 0 && (
                                <span className="text-[10px] text-emerald-400">{savedStories.length} saved</span>
                            )}
                        </div>

                        {showLibrary && (
                            <>
                                {savedStories.length === 0 ? (
                                    <div className="text-center py-4 text-slate-500">
                                        <Library className="w-8 h-8 mx-auto mb-2 opacity-20" />
                                        <p className="text-[10px]">No saved stories yet</p>
                                        <p className="text-[9px] mt-1">Create beats and click "Save to Library"</p>
                                    </div>
                                ) : (
                                    <div className="space-y-2 max-h-48 overflow-y-auto">
                                        {savedStories.map(story => (
                                            <div
                                                key={story.id}
                                                className="bg-slate-800/50 rounded-lg p-2 border border-slate-700/50 hover:border-indigo-500/30 transition-colors"
                                            >
                                                <div className="flex items-start justify-between gap-2">
                                                    <div className="flex-1 min-w-0">
                                                        <h4 className="text-xs font-bold text-white truncate">{story.name}</h4>
                                                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                                                            <span className="text-[9px] text-slate-500 flex items-center gap-1">
                                                                <FileText className="w-2.5 h-2.5" />
                                                                {story.beatCount} beats
                                                            </span>
                                                            <span className="text-[9px] text-slate-500 flex items-center gap-1">
                                                                <ImageIcon className="w-2.5 h-2.5" />
                                                                {story.imageCount} images
                                                            </span>
                                                            <span className="text-[9px] text-slate-500 flex items-center gap-1">
                                                                <Clock className="w-2.5 h-2.5" />
                                                                {new Date(story.dateSaved).toLocaleDateString()}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-col gap-1">
                                                        <button
                                                            onClick={() => handleLoadFromLibrary(story.id)}
                                                            className="p-1.5 bg-indigo-500/20 hover:bg-indigo-500/30 rounded-lg transition-colors"
                                                            title="Load story"
                                                        >
                                                            <Upload className="w-3 h-3 text-indigo-400 rotate-180" />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteFromLibrary(story.id)}
                                                            className="p-1.5 hover:bg-red-500/20 rounded-lg transition-colors"
                                                            title="Delete story"
                                                        >
                                                            <Trash2 className="w-3 h-3 text-red-400" />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    {/* Character Sheets Section - Always show if extracting or has characters */}
                    {(isExtractingCharacters || extractedCharacters.length > 0 || characterSheets.length > 0) && (
                        <div className="p-3 border-b border-slate-800 bg-violet-500/5">
                            <div className="text-xs font-bold text-violet-400 uppercase tracking-wider mb-2 flex items-center justify-between">
                                <span className="flex items-center gap-1">
                                    <UserCircle className="w-3 h-3" />
                                    Character Sheets
                                    {extractedCharacters.length > 0 && ` (${extractedCharacters.length})`}
                                </span>
                                {characterSheets.length > 0 && (
                                    <span className="text-emerald-400 text-[10px]">{characterSheets.length} generated</span>
                                )}
                            </div>

                            {/* Loading state while extracting */}
                            {isExtractingCharacters && (
                                <div className="flex items-center gap-2 p-3 bg-slate-800/50 rounded-lg border border-violet-500/30">
                                    <Loader2 className="w-4 h-4 animate-spin text-violet-400" />
                                    <span className="text-xs text-violet-300">Extracting characters from story...</span>
                                </div>
                            )}

                            {/* Generating sheets progress */}
                            {isGeneratingSheets && sheetGenProgress && (
                                <div className="flex items-center gap-2 p-2 mb-2 bg-purple-500/10 rounded-lg border border-purple-500/30">
                                    <Loader2 className="w-3 h-3 animate-spin text-purple-400" />
                                    <span className="text-[10px] text-purple-300">{sheetGenProgress}</span>
                                </div>
                            )}

                            {/* Character list */}
                            {extractedCharacters.length > 0 && (
                                <>
                                    <div className="space-y-2 max-h-48 overflow-y-auto">
                                        {extractedCharacters.map(char => {
                                            const sheet = characterSheets.find(s => s.character.id === char.id);
                                            return (
                                                <div key={char.id} className="bg-slate-800/50 rounded-lg p-2 border border-slate-700/50 hover:border-violet-500/30 transition-colors">
                                                    <div className="flex items-start gap-2">
                                                        {/* Sheet thumbnail or placeholder */}
                                                        <div className="w-14 h-14 rounded-lg bg-slate-900 flex-shrink-0 overflow-hidden border border-slate-700">
                                                            {sheet ? (
                                                                <img
                                                                    src={sheet.sheetImageUrl}
                                                                    alt={char.name}
                                                                    className="w-full h-full object-cover"
                                                                />
                                                            ) : (
                                                                <div className="w-full h-full flex items-center justify-center">
                                                                    <UserCircle className="w-6 h-6 text-slate-600" />
                                                                </div>
                                                            )}
                                                        </div>

                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-1 flex-wrap">
                                                                <span className="text-xs font-bold text-white">{char.name}</span>
                                                                <span className={`text-[8px] px-1.5 py-0.5 rounded-full ${
                                                                    char.role === 'protagonist' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                                                                    char.role === 'antagonist' ? 'bg-red-500/20 text-red-300 border border-red-500/30' :
                                                                    'bg-slate-600/50 text-slate-400 border border-slate-500/30'
                                                                }`}>
                                                                    {char.role}
                                                                </span>
                                                                {sheet && (
                                                                    <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                                                        ✓ sheet
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <p className="text-[9px] text-slate-500 line-clamp-2 mt-0.5">
                                                                {char.clothing}
                                                            </p>
                                                        </div>

                                                        {/* Regenerate button */}
                                                        <button
                                                            onClick={() => handleGenerateSingleSheet(char.id)}
                                                            disabled={isGeneratingSheets}
                                                            className="p-1.5 hover:bg-violet-500/20 rounded-lg transition-colors"
                                                            title={sheet ? "Regenerate sheet" : "Generate sheet"}
                                                        >
                                                            <RefreshCw className={`w-3 h-3 ${sheet ? 'text-slate-500' : 'text-violet-400'}`} />
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* Generate All Sheets button */}
                                    {extractedCharacters.length > 0 && characterSheets.length < extractedCharacters.length && (
                                        <button
                                            onClick={handleGenerateCharacterSheets}
                                            disabled={isGeneratingSheets}
                                            className="w-full mt-2 py-2 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 disabled:from-slate-700 disabled:to-slate-700 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all"
                                        >
                                            {isGeneratingSheets ? (
                                                <>
                                                    <Loader2 className="w-3 h-3 animate-spin" />
                                                    Generating...
                                                </>
                                            ) : (
                                                <>
                                                    <Palette className="w-3 h-3" />
                                                    Generate All Sheets ({extractedCharacters.length - characterSheets.length} remaining)
                                                </>
                                            )}
                                        </button>
                                    )}
                                </>
                            )}
                        </div>
                    )}

                    {/* Beat List */}
                    <div className="flex-1 overflow-y-auto p-2">
                        <div className="text-xs font-bold text-slate-500 uppercase tracking-wider px-2 py-2 flex items-center justify-between">
                            <span>AI Generated Beats ({beats.length})</span>
                            <span className="text-slate-600">{beats.filter(b => b.isSilent).length} silent</span>
                        </div>

                        {beats.map((beat, idx) => (
                            <div key={beat.id}>
                                <button
                                    onClick={() => setSelectedBeatId(beat.id)}
                                    className={`w-full text-left p-3 rounded-lg mb-1 transition-all ${
                                        selectedBeatId === beat.id
                                            ? 'bg-indigo-500/20 border border-indigo-500/50'
                                            : 'bg-slate-800/50 border border-transparent hover:bg-slate-800'
                                    }`}
                                >
                                    <div className="flex gap-3">
                                        {/* Thumbnail */}
                                        <div className="relative w-12 h-16 rounded overflow-hidden bg-slate-900 flex-shrink-0">
                                            {beat.imageUrl ? (
                                                <img src={beat.imageUrl} alt="" className="w-full h-full object-cover" />
                                            ) : beat.isGenerating ? (
                                                <div className="w-full h-full flex items-center justify-center">
                                                    <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                                                </div>
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center">
                                                    <ImageIcon className="w-4 h-4 text-slate-600" />
                                                </div>
                                            )}
                                            <div className="absolute top-0 left-0 w-4 h-4 bg-black/60 flex items-center justify-center">
                                                <span className="text-[8px] text-white font-bold">{idx + 1}</span>
                                            </div>
                                        </div>

                                        {/* Info */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-1 mb-1 flex-wrap">
                                                {beat.isSilent && (
                                                    <span className="text-[9px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded font-bold">
                                                        SILENT
                                                    </span>
                                                )}
                                                <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold border ${getBgColorClass(beat.backgroundType)}`}>
                                                    {beat.backgroundType}
                                                </span>
                                            </div>
                                            <p className="text-[10px] text-slate-400 line-clamp-2">
                                                {beat.isSilent ? beat.visualPrompt?.slice(0, 40) + '...' : beat.text?.slice(0, 60) || '(no text)'}
                                            </p>
                                        </div>
                                    </div>
                                </button>

                                <button
                                    onClick={() => handleAddSilentBeat(idx)}
                                    className="w-full py-1 text-[10px] text-slate-600 hover:text-indigo-400 flex items-center justify-center gap-1 opacity-0 hover:opacity-100 transition-all"
                                >
                                    <Plus className="w-3 h-3" /> Add silent beat
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Center Panel - Flow View */}
                {showFlowView && (
                    <div className="flex-1 overflow-auto p-6 bg-[#080c14]">
                        <div className="flex flex-col items-center min-w-max">
                            {/* Start Node */}
                            <div className="px-6 py-3 bg-gradient-to-r from-rose-500 to-orange-500 text-white rounded-xl font-bold text-sm shadow-lg shadow-rose-500/20">
                                Start - Beat Segmentation
                            </div>

                            {beats.map((beat, idx) => (
                                <div key={beat.id} className="flex flex-col items-center">
                                    {/* Connector */}
                                    <div className="w-0.5 h-6 bg-slate-700" />
                                    <ArrowDown className="w-4 h-4 text-slate-600 -my-1" />

                                    {/* Decision Node for Environment Change */}
                                    {idx > 0 && !beat.sameEnvironmentAsPrevious && (
                                        <>
                                            <div className="w-0.5 h-4 bg-emerald-500/50" />
                                            <div className="px-4 py-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg flex items-center gap-2 text-emerald-400 text-xs font-medium">
                                                <MapPin className="w-3 h-3" />
                                                New Location Detected
                                            </div>
                                            <div className="w-0.5 h-4 bg-emerald-500/50" />
                                            <ArrowDown className="w-4 h-4 text-emerald-500 -my-1" />
                                        </>
                                    )}

                                    {/* Beat Node */}
                                    <div
                                        onClick={() => setSelectedBeatId(beat.id)}
                                        className={`relative w-96 rounded-xl border-2 overflow-hidden cursor-pointer transition-all ${
                                            selectedBeatId === beat.id
                                                ? 'border-indigo-500 shadow-lg shadow-indigo-500/20'
                                                : beat.isSilent
                                                    ? 'border-amber-500/30 bg-amber-900/10'
                                                    : 'border-slate-700 bg-slate-900/50 hover:border-slate-600'
                                        }`}
                                    >
                                        {/* Beat Header */}
                                        <div className={`px-4 py-2 border-b flex items-center justify-between ${
                                            beat.isSilent ? 'border-amber-500/20 bg-amber-500/10' : 'border-slate-800 bg-slate-800/50'
                                        }`}>
                                            <span className="text-xs font-bold text-slate-400">
                                                Beat {idx + 1} {beat.isSilent && '(Silent)'}
                                            </span>
                                            <div className="flex items-center gap-2">
                                                <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold border ${getBgColorClass(beat.backgroundType)}`}>
                                                    {beat.backgroundType}
                                                </span>
                                                <span className="text-[9px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/30">
                                                    {beat.cameraAngle}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Text Panels BEFORE image (Webtoon-style) */}
                                        {beat.textPanels && beat.textPanels.length > 0 && (
                                            <TextPanelRenderer
                                                panels={beat.textPanels}
                                                position="before"
                                            />
                                        )}

                                        {/* Generated Image (if exists) */}
                                        {beat.imageUrl && (
                                            <div className="relative w-full aspect-[9/16] bg-black group/image">
                                                <img
                                                    src={beat.imageUrl}
                                                    alt={`Beat ${idx + 1}`}
                                                    className="w-full h-full object-cover"
                                                />

                                                {/* Speech Bubbles Overlay - ONLY if no text panels */}
                                                {(!beat.textPanels || beat.textPanels.length === 0) && beat.speechBubbles && beat.speechBubbles.length > 0 && (
                                                    <SpeechBubbleRenderer
                                                        bubbles={beat.speechBubbles}
                                                        imageWidth={384} // width of aspect-[9/16] container
                                                        imageHeight={682} // calculated height
                                                    />
                                                )}

                                                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />

                                                {/* Regenerate overlay button */}
                                                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 opacity-0 group-hover/image:opacity-100 transition-opacity bg-black/40">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleGenerateSingleImage(beat.id);
                                                        }}
                                                        disabled={beat.isGenerating || isGeneratingImages}
                                                        className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 text-white rounded-lg text-sm font-bold flex items-center gap-2 transition-all shadow-lg"
                                                    >
                                                        <RefreshCw className="w-4 h-4" />
                                                        Regenerate
                                                    </button>
                                                    {beat.text && !beat.isSilent && (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleGenerateVNSpeeches(beat.id);
                                                            }}
                                                            disabled={beat.isGeneratingVNSpeeches}
                                                            className="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:bg-slate-700 text-white rounded-lg text-sm font-bold flex items-center gap-2 transition-all shadow-lg"
                                                        >
                                                            {beat.isGeneratingVNSpeeches ? (
                                                                <>
                                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                                    Generating...
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <MessageSquare className="w-4 h-4" />
                                                                    {beat.vnSpeeches && beat.vnSpeeches.length > 0 ? 'Update' : 'Add'} VN Speeches
                                                                </>
                                                            )}
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        {/* Generating placeholder */}
                                        {beat.isGenerating && (
                                            <div className="w-full aspect-[9/16] bg-slate-900 flex flex-col items-center justify-center gap-3">
                                                <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
                                                <span className="text-xs text-cyan-300 font-medium">Generating...</span>
                                            </div>
                                        )}

                                        {/* Text Panels AFTER image (Webtoon-style) */}
                                        {beat.textPanels && beat.textPanels.length > 0 && (
                                            <TextPanelRenderer
                                                panels={beat.textPanels}
                                                position="after"
                                            />
                                        )}

                                        {/* Beat Content */}
                                        <div className="p-4">
                                            {/* Text */}
                                            <p className="text-sm text-slate-300 mb-3 line-clamp-2">
                                                {beat.isSilent ? (
                                                    <span className="italic text-amber-300/70">{beat.visualPrompt?.slice(0, 80)}...</span>
                                                ) : `"${beat.text}"`}
                                            </p>

                                            {/* Analysis Info Grid */}
                                            <div className="grid grid-cols-2 gap-2 text-[10px]">
                                                <div className="flex items-center gap-1.5 text-slate-500 bg-slate-800/50 rounded px-2 py-1">
                                                    <Users className="w-3 h-3 text-indigo-400" />
                                                    <span className="truncate">{beat.characters?.join(', ') || 'Unknown'}</span>
                                                </div>
                                                <div className="flex items-center gap-1.5 text-slate-500 bg-slate-800/50 rounded px-2 py-1">
                                                    <MapPin className="w-3 h-3 text-emerald-400" />
                                                    <span className={beat.sameEnvironmentAsPrevious ? 'text-slate-500' : 'text-emerald-400'}>
                                                        {beat.sameEnvironmentAsPrevious ? 'Same env' : 'New location'}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-1.5 text-slate-500 bg-slate-800/50 rounded px-2 py-1 col-span-2">
                                                    <Shirt className="w-3 h-3 text-pink-400" />
                                                    <span className="truncate">{beat.clothingState}</span>
                                                </div>
                                            </div>

                                            {/* AI Reasoning */}
                                            {beat.analysisReasoning && !beat.imageUrl && (
                                                <div className="mt-3 p-2 bg-indigo-500/5 border border-indigo-500/20 rounded-lg">
                                                    <div className="flex items-center gap-1 text-[9px] text-indigo-400 font-bold mb-1">
                                                        <Brain className="w-3 h-3" />
                                                        AI Reasoning
                                                    </div>
                                                    <p className="text-[10px] text-slate-500 line-clamp-2">
                                                        {beat.analysisReasoning}
                                                    </p>
                                                </div>
                                            )}
                                        </div>

                                        {/* Status indicator */}
                                        <div className="absolute top-2 right-2">
                                            {beat.imageUrl ? (
                                                <CheckCircle className="w-4 h-4 text-emerald-500" />
                                            ) : beat.isGenerating ? (
                                                <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                                            ) : (
                                                <div className="w-4 h-4 rounded-full border-2 border-slate-600" />
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}

                            {beats.length > 0 && (
                                <>
                                    <div className="w-0.5 h-6 bg-slate-700" />
                                    <ArrowDown className="w-4 h-4 text-slate-600 -my-1" />
                                    <div className="w-0.5 h-4 bg-slate-700" />

                                    {/* Summary Node */}
                                    <div className="w-80 p-4 bg-slate-800/50 border border-slate-700 rounded-xl text-center">
                                        <div className="text-sm font-bold text-white mb-2">Analysis Complete</div>
                                        <div className="grid grid-cols-3 gap-2 text-[10px]">
                                            <div className="bg-slate-900 rounded p-2">
                                                <div className="text-lg font-bold text-indigo-400">{beats.length}</div>
                                                <div className="text-slate-500">Total Beats</div>
                                            </div>
                                            <div className="bg-slate-900 rounded p-2">
                                                <div className="text-lg font-bold text-amber-400">{beats.filter(b => b.isSilent).length}</div>
                                                <div className="text-slate-500">Silent</div>
                                            </div>
                                            <div className="bg-slate-900 rounded p-2">
                                                <div className="text-lg font-bold text-emerald-400">{beats.filter(b => !b.sameEnvironmentAsPrevious).length}</div>
                                                <div className="text-slate-500">Locations</div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="w-0.5 h-6 bg-slate-700" />
                                    <ArrowDown className="w-4 h-4 text-slate-600 -my-1" />
                                    <div className="w-0.5 h-4 bg-slate-700" />

                                    {/* End Node */}
                                    <div className="px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl font-bold text-sm shadow-lg shadow-emerald-500/20">
                                        Ready for Image Generation
                                    </div>
                                </>
                            )}

                            {beats.length === 0 && (
                                <div className="mt-8 text-center text-slate-600">
                                    <Brain className="w-16 h-16 mx-auto mb-4 opacity-20" />
                                    <p className="text-sm">Paste your story text and click "Analyze with AI"</p>
                                    <p className="text-xs mt-1">The AI will create beats with full analysis</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Right Panel - Beat Editor */}
                <div className="w-96 border-l border-slate-800 flex flex-col bg-slate-900/30">
                    {selectedBeat ? (
                        <>
                            <div className="p-4 border-b border-slate-800">
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="text-lg font-bold text-white">
                                        Beat {selectedBeat.beatIndex + 1}
                                    </h3>
                                    <button
                                        onClick={() => handleDeleteBeat(selectedBeat.id)}
                                        className="p-2 text-red-400 hover:bg-red-500/20 rounded-lg transition-all"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>

                                {/* Generated Image Preview */}
                                {selectedBeat.imageUrl && (
                                    <div className="relative rounded-lg overflow-hidden mb-3 aspect-[9/16]">
                                        <img
                                            src={selectedBeat.imageUrl}
                                            alt={`Beat ${selectedBeat.beatIndex + 1}`}
                                            className="w-full h-full object-cover"
                                        />

                                        {/* Speech Bubbles Overlay */}
                                        {selectedBeat.speechBubbles && selectedBeat.speechBubbles.length > 0 && (
                                            <SpeechBubbleRenderer
                                                bubbles={selectedBeat.speechBubbles}
                                                imageWidth={384}
                                                imageHeight={682}
                                            />
                                        )}
                                    </div>
                                )}

                                {/* Generate/Regenerate Image Button */}
                                <button
                                    onClick={() => handleGenerateSingleImage(selectedBeat.id)}
                                    disabled={selectedBeat.isGenerating || isGeneratingImages}
                                    className="w-full py-3 mb-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:from-slate-700 disabled:to-slate-700 text-white rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all"
                                >
                                    {selectedBeat.isGenerating ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            Generating...
                                        </>
                                    ) : selectedBeat.imageUrl ? (
                                        <>
                                            <RefreshCw className="w-4 h-4" />
                                            Regenerate Image
                                        </>
                                    ) : (
                                        <>
                                            <Play className="w-4 h-4" />
                                            Generate Image
                                        </>
                                    )}
                                </button>

                                {/* Generate Speech Bubbles Button */}
                                {selectedBeat.imageUrl && selectedBeat.text && !selectedBeat.isSilent && (
                                    <button
                                        onClick={() => handleGenerateSpeechBubbles(selectedBeat.id)}
                                        disabled={selectedBeat.isGeneratingSpeechBubbles}
                                        className="w-full py-3 mb-3 bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 disabled:from-slate-700 disabled:to-slate-700 text-white rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all"
                                    >
                                        {selectedBeat.isGeneratingSpeechBubbles ? (
                                            <>
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                Generating...
                                            </>
                                        ) : selectedBeat.speechBubbles && selectedBeat.speechBubbles.length > 0 ? (
                                            <>
                                                <MessageSquare className="w-4 h-4" />
                                                Update Speech Bubbles ({selectedBeat.speechBubbles.length})
                                            </>
                                        ) : (
                                            <>
                                                <MessageSquare className="w-4 h-4" />
                                                Add Speech Bubbles
                                            </>
                                        )}
                                    </button>
                                )}

                                {/* Silent toggle */}
                                <label className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-lg cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={selectedBeat.isSilent}
                                        onChange={(e) => handleUpdateBeat(selectedBeat.id, {
                                            isSilent: e.target.checked,
                                            text: e.target.checked ? '' : selectedBeat.text
                                        })}
                                        className="w-4 h-4 rounded border-slate-600 text-amber-500 focus:ring-amber-500"
                                    />
                                    <span className="text-sm text-slate-300">Silent Beat (no dialogue)</span>
                                </label>
                            </div>

                            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                                {/* Text */}
                                {!selectedBeat.isSilent && (
                                    <div>
                                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                                            <MessageSquare className="w-3 h-3" /> Dialogue / Narration
                                        </label>
                                        <textarea
                                            value={selectedBeat.text}
                                            onChange={(e) => handleUpdateBeat(selectedBeat.id, { text: e.target.value })}
                                            className="w-full h-24 bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm text-white resize-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                                        />
                                    </div>
                                )}

                                {/* Visual Prompt */}
                                <div>
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                                        <Eye className="w-3 h-3" /> Visual Prompt (AI Generated)
                                    </label>
                                    <textarea
                                        value={selectedBeat.visualPrompt}
                                        onChange={(e) => handleUpdateBeat(selectedBeat.id, { visualPrompt: e.target.value })}
                                        className="w-full h-32 bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm text-cyan-300 font-mono resize-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none"
                                    />
                                </div>

                                {/* AI Reasoning */}
                                {selectedBeat.analysisReasoning && (
                                    <div>
                                        <label className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                                            <Brain className="w-3 h-3" /> AI Reasoning
                                        </label>
                                        <div className="p-3 bg-indigo-500/10 border border-indigo-500/30 rounded-lg text-xs text-slate-400">
                                            {selectedBeat.analysisReasoning}
                                        </div>
                                    </div>
                                )}

                                {/* Environment */}
                                <div>
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                                        <MapPin className="w-3 h-3" /> Environment
                                    </label>
                                    <div className="flex items-center gap-2 mb-2">
                                        <label className="flex items-center gap-2 p-2 bg-slate-800/50 rounded-lg cursor-pointer flex-1">
                                            <input
                                                type="checkbox"
                                                checked={selectedBeat.sameEnvironmentAsPrevious}
                                                onChange={(e) => handleUpdateBeat(selectedBeat.id, { sameEnvironmentAsPrevious: e.target.checked })}
                                                className="w-4 h-4 rounded border-slate-600 text-emerald-500 focus:ring-emerald-500"
                                            />
                                            <span className="text-xs text-slate-400">Same as previous</span>
                                        </label>
                                    </div>
                                    <input
                                        type="text"
                                        value={selectedBeat.environmentDescription}
                                        onChange={(e) => handleUpdateBeat(selectedBeat.id, { environmentDescription: e.target.value })}
                                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                                    />
                                </div>

                                {/* Clothing State */}
                                <div>
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                                        <Shirt className="w-3 h-3" /> Clothing State
                                    </label>
                                    <input
                                        type="text"
                                        value={selectedBeat.clothingState}
                                        onChange={(e) => handleUpdateBeat(selectedBeat.id, { clothingState: e.target.value })}
                                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-pink-300 focus:ring-2 focus:ring-pink-500 focus:border-pink-500 outline-none"
                                    />
                                </div>

                                {/* Camera Angle */}
                                <div>
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                                        <Camera className="w-3 h-3" /> Camera Angle
                                    </label>
                                    <select
                                        value={selectedBeat.cameraAngle}
                                        onChange={(e) => handleUpdateBeat(selectedBeat.id, { cameraAngle: e.target.value })}
                                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-cyan-300 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none"
                                    >
                                        {CAMERA_ANGLES.map(angle => (
                                            <option key={angle} value={angle}>{angle}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Background Type */}
                                <div>
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                                        <ImageIcon className="w-3 h-3" /> Background Type
                                    </label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {BACKGROUND_TYPES.map(bg => {
                                            const Icon = bg.icon;
                                            const isSelected = selectedBeat.backgroundType === bg.value;
                                            return (
                                                <button
                                                    key={bg.value}
                                                    onClick={() => handleUpdateBeat(selectedBeat.id, { backgroundType: bg.value })}
                                                    className={`p-2 rounded-lg border text-center transition-all ${
                                                        isSelected
                                                            ? getBgColorClass(bg.value)
                                                            : 'bg-slate-800/50 border-slate-700 text-slate-500 hover:border-slate-600'
                                                    }`}
                                                >
                                                    <Icon className="w-4 h-4 mx-auto mb-1" />
                                                    <span className="text-[10px] font-bold">{bg.label}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Characters */}
                                <div>
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                                        <Users className="w-3 h-3" /> Characters in Scene
                                    </label>
                                    <input
                                        type="text"
                                        value={selectedBeat.characters?.join(', ') || ''}
                                        onChange={(e) => handleUpdateBeat(selectedBeat.id, {
                                            characters: e.target.value.split(',').map(c => c.trim()).filter(Boolean)
                                        })}
                                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                                    />
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-slate-500 p-8">
                            <FileText className="w-12 h-12 mb-4 opacity-30" />
                            <p className="text-sm text-center">
                                Select a beat from the flow to edit its properties
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* Story Player - Visual Novel Style */}
            {showPlayer && beatsAsSegments.length > 0 && (
                <WebtoonReader
                    segments={beatsAsSegments}
                    onClose={() => setShowPlayer(false)}
                    onPlayAudio={async () => {}} // No audio in BeatMaker
                    onStopAudio={() => {}}
                />
            )}

            {/* Save to Library Dialog */}
            {saveDialogOpen && (
                <div className="fixed inset-0 z-[20000] flex items-center justify-center bg-black/80 backdrop-blur-sm">
                    <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-12 h-12 bg-indigo-500/20 rounded-xl flex items-center justify-center">
                                <Save className="w-6 h-6 text-indigo-400" />
                            </div>
                            <div>
                                <h3 className="text-xl font-bold text-white">Save to Library</h3>
                                <p className="text-sm text-slate-400">Give your story a name</p>
                            </div>
                        </div>

                        <div className="mb-4">
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">
                                Story Name
                            </label>
                            <input
                                type="text"
                                value={newStoryName}
                                onChange={(e) => setNewStoryName(e.target.value)}
                                onKeyPress={(e) => {
                                    if (e.key === 'Enter') {
                                        handleSaveToLibrary();
                                    }
                                }}
                                placeholder="My awesome story..."
                                autoFocus
                                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                            />
                        </div>

                        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3 mb-4">
                            <div className="grid grid-cols-2 gap-2 text-xs">
                                <div className="flex items-center gap-2 text-slate-400">
                                    <FileText className="w-3 h-3 text-indigo-400" />
                                    <span>{beats.length} beats</span>
                                </div>
                                <div className="flex items-center gap-2 text-slate-400">
                                    <ImageIcon className="w-3 h-3 text-cyan-400" />
                                    <span>{beatsWithImages} images</span>
                                </div>
                                {extractedCharacters.length > 0 && (
                                    <>
                                        <div className="flex items-center gap-2 text-slate-400">
                                            <UserCircle className="w-3 h-3 text-violet-400" />
                                            <span>{extractedCharacters.length} characters</span>
                                        </div>
                                        <div className="flex items-center gap-2 text-slate-400">
                                            <Palette className="w-3 h-3 text-purple-400" />
                                            <span>{characterSheets.length} sheets</span>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={() => {
                                    setSaveDialogOpen(false);
                                    setNewStoryName('');
                                }}
                                className="flex-1 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm font-bold transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveToLibrary}
                                disabled={!newStoryName.trim()}
                                className="flex-1 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 disabled:from-slate-700 disabled:to-slate-700 text-white rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2"
                            >
                                <Save className="w-4 h-4" />
                                Save
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BeatMaker;
