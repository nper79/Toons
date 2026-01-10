
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { StoryData, AspectRatio, ImageSize, ManhwaPanel, StorySegment, WordDefinition, SpeechBubble, BubbleType, TailDirection, TextPanel, TextPanelType, VNSpeech, VNSpeechType } from "../types";
import { compressImage } from "../utils/imageUtils";

const getAi = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

const MODEL_TEXT_ANALYSIS = 'gemini-3-pro-preview'; 
const MODEL_IMAGE_GEN = 'gemini-3-pro-image-preview'; 
const MODEL_IMAGE_GEN_FALLBACK = 'gemini-2.5-flash-image'; 
const MODEL_IMAGE_EDIT = 'gemini-3-pro-image-preview'; 
const MODEL_TTS = 'gemini-2.5-flash-preview-tts';
const MODEL_VIDEO_FAST = 'veo-3.1-fast-generate-preview';
const MODEL_VIDEO_HD = 'veo-3.1-generate-preview';

// NEW: Ultra-fast model for dictionary lookups
const MODEL_FAST_DEFINITIONS = 'gemini-flash-lite-latest';

// NEW: Stable model for Forensic Vision Analysis (Flash is more robust for pure JSON extraction from images)
const MODEL_FORENSIC = 'gemini-3-flash-preview';

export const VOICES = [
  { name: 'Puck', gender: 'Male', style: 'Neutral & Clear' },
  { name: 'Charon', gender: 'Male', style: 'Deep & Grave' },
  { name: 'Kore', gender: 'Female', style: 'Soothing & Calm' },
  { name: 'Fenrir', gender: 'Male', style: 'Intense & Resonant' },
  { name: 'Zephyr', gender: 'Female', style: 'Bright & Energetic' },
  { name: 'Aoede', gender: 'Female', style: 'Confident & Professional' }
];

let currentAudio: HTMLAudioElement | null = null;

export const stopAudio = () => {
  if (currentAudio) {
    try {
      currentAudio.pause();
      currentAudio.onended = null;
      currentAudio = null;
    } catch (e) {
      console.warn("Error stopping audio", e);
    }
  }
};

export const playAudio = async (audioData: ArrayBuffer): Promise<void> => {
  stopAudio();
  const blob = createWavBlob(audioData);
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  currentAudio = audio;
  return new Promise((resolve) => {
    audio.onended = () => { URL.revokeObjectURL(url); resolve(); };
    audio.play();
  });
};

// NEW: Generate a prompt specifically for the Cover Art
export const generateCoverPrompt = async (
    title: string,
    characters: any[],
    summary: string,
    style: string
): Promise<string> => {
    const ai = getAi();
    
    const response = await ai.models.generateContent({
        model: MODEL_TEXT_ANALYSIS,
        contents: `
        You are an Art Director for a top Webtoon/Manhwa platform.
        Create a prompt for the **COVER ART** (Vertical 3:4).
        
        **STORY DETAILS**:
        Title: ${title}
        Characters: ${characters.map(c => c.name + " (" + c.description + ")").join(', ')}
        Summary Snippet: ${summary.slice(0, 500)}...
        
        **REQUIREMENTS**:
        1. COMPOSITION: Dynamic, eye-catching, high contrast. Vertical layout.
        2. SUBJECT: Feature the protagonist(s) prominently.
        3. STYLE: ${style}. Masterpiece, 8k resolution, highly detailed.
        4. CRITICAL: **NO TEXT**. The image must be clean art. No title text, no speech bubbles.
        
        Return ONLY the visual prompt string.
        `,
    });
    return response.text || "";
};

// Helper: Get camera angle instruction for dynamic composition
const getCameraAngleInstruction = (cameraAngle?: string): string => {
    switch (cameraAngle) {
        case 'OVER_SHOULDER':
            return 'Camera positioned behind one character looking at another. Show back of head/shoulder of near character, face of far character.';
        case 'SIDE_PROFILE':
            return 'Camera positioned to the side, showing character in full profile view. Emphasizes silhouette and emotion.';
        case 'THREE_QUARTER':
            return 'Camera at 45-degree angle to character. Shows both face and body language. Dynamic and engaging composition.';
        case 'LOW_ANGLE':
            return 'Camera positioned below eye level, looking up at character. Makes subject appear powerful, imposing, or heroic.';
        case 'HIGH_ANGLE':
            return 'Camera positioned above eye level, looking down at character. Makes subject appear vulnerable or smaller.';
        case 'DUTCH_ANGLE':
            return 'Camera tilted at an angle (10-30 degrees). Creates unease, tension, or dynamic action feel.';
        case 'POV':
            return 'First-person perspective. Show what the character sees - their hands, objects they interact with.';
        case 'BIRDS_EYE':
            return 'Camera directly above looking down. Great for establishing shots showing layout and isolation.';
        case 'WORMS_EYE':
            return 'Camera at ground level looking up dramatically. Extreme low angle for dramatic effect.';
        case 'FRONTAL':
        default:
            return 'Character facing camera directly. Use for impactful eye-contact moments only.';
    }
};

// Helper: Get background instruction based on type
const getBackgroundInstruction = (backgroundType?: string): string => {
    switch (backgroundType) {
        case 'WHITE':
            return `**BACKGROUND: PURE WHITE**
- Draw the character on a PURE WHITE or very light cream background.
- NO walls, NO furniture, NO environment details.
- Focus ONLY on the character's upper body or full figure.
- Use sparingly - only for very simple dialogue moments.`;

        case 'GRADIENT':
            return `**BACKGROUND: SOFT GRADIENT**
- Use a soft color gradient background (warm to cool tones).
- Can show HINTS of environment (blurred shapes, soft shadows).
- Subtle vignette effect around edges.
- Emotional, dreamy atmosphere.
- Character should be the focus but environment is suggested.`;

        case 'BOKEH':
            return `**BACKGROUND: BOKEH/BLUR (PREFERRED FOR DIALOGUE)**
- Background should be SOFTLY BLURRED (bokeh effect).
- Show abstract shapes of the environment (furniture, walls) but out of focus.
- Character in sharp focus, background creates depth.
- Use warm or cool tones matching the scene mood.
- This gives context while keeping focus on the character.`;

        case 'SPEEDLINES':
            return `**BACKGROUND: SPEED LINES/ACTION**
- Use dramatic speed lines radiating from a focal point.
- Can include screen tones or halftone patterns.
- Dynamic, energetic composition.
- Character in motion or dramatic pose.
- High contrast, manga/manhwa action style.`;

        case 'SPLIT':
            return `**BACKGROUND: SPLIT PANEL (TWO SCENES)**
- Create a SPLIT COMPOSITION with TWO distinct scenes side by side.
- Use a vertical divider (line or contrast) to separate them.
- Left side: one character/action. Right side: another character/action.
- Each side can have its own background treatment.
- Perfect for showing simultaneous events or contrasting reactions.
- Like manga panels showing two people on a phone call.`;

        case 'DETAILED':
        default:
            return `**BACKGROUND: DETAILED ENVIRONMENT**
- Show the FULL environment with walls, furniture, and details.
- This is an ESTABLISHING SHOT - show the complete setting.
- Include architectural details and room layout.
- Character should be placed within the environment naturally.
- Use for scene transitions and location introductions ONLY.`;
    }
};

export const generateStreamlinedSceneImage = async ({
    sceneText,
    fullStoryText,
    refImages,
    previousBeatImage,
    globalStyle,
    aspectRatio = AspectRatio.MOBILE,
    imageSize = ImageSize.K1,
    characterNames = [],
    backgroundType = 'DETAILED',
    establishingShot,
    cameraAngle = 'THREE_QUARTER',
    costumeDescription
}: {
    sceneText: string;
    fullStoryText: string;
    refImages: string[];
    previousBeatImage?: string;
    globalStyle?: string;
    aspectRatio?: AspectRatio;
    imageSize?: ImageSize;
    characterNames?: string[];
    backgroundType?: string;
    establishingShot?: string; // Reference image for the location
    cameraAngle?: string; // Camera angle for dynamic composition
    costumeDescription?: string; // Current clothing state
}): Promise<string> => {
    const ai = getAi();
    const style = globalStyle || "Manhwa/Webtoon";
    const safeSceneText = sceneText.trim();
    const safeStoryText = fullStoryText.trim();

    // Get background-specific instructions
    const bgInstruction = getBackgroundInstruction(backgroundType);
    const cameraInstruction = getCameraAngleInstruction(cameraAngle);

    const promptLines = [
        "Illustrate ONLY this scene in manhwa style, nothing beyond this scene:",
        "",
        `"${safeSceneText}"`,
    ];

    if (characterNames.length > 0) {
        promptLines.push("", `Characters in scene: ${characterNames.join(", ")}`);
    }

    // Add costume/clothing instruction if provided
    if (costumeDescription) {
        promptLines.push("", `=== CLOTHING STATE (CRITICAL) ===`);
        promptLines.push(`Character is wearing: ${costumeDescription}`);
        promptLines.push(`DO NOT change the clothing. Draw EXACTLY this outfit.`);
        promptLines.push(`===================================`);
    }

    promptLines.push(
        "",
        "=== CAMERA ANGLE INSTRUCTION ===",
        `Angle: ${cameraAngle}`,
        cameraInstruction,
        "================================",
        "",
        "=== BACKGROUND RENDERING INSTRUCTION ===",
        bgInstruction,
        "=========================================",
        "",
        "General Rules:",
        "* No speech bubbles or text",
        "* Attached images are for character/style reference",
        "* Keep clothing EXACTLY as specified above",
        "* Use the EXACT camera angle specified"
    );

    if (safeStoryText.length > 0 && backgroundType === 'DETAILED') {
        promptLines.push("", "Story context:", safeStoryText.slice(0, 500));
    }

    const systemInstruction = `You are a professional manhwa illustrator. Style: ${style}.
CRITICAL RULES:
- No speech bubbles, captions, or on-image text.
- STRICTLY FOLLOW the background instruction provided.
- If background is WHITE/GRADIENT/BOKEH, do NOT draw detailed rooms.
- Only draw detailed environments for DETAILED background type.
- Keep clothing and character appearance consistent.`;

    const parts: any[] = [];

    // Add establishing shot reference for non-detailed backgrounds (to maintain character appearance)
    if (establishingShot && backgroundType !== 'DETAILED') {
        const base64Data = establishingShot.includes(",") ? establishingShot.split(",")[1] : establishingShot;
        parts.push({ text: "CHARACTER/STYLE REFERENCE (use for character appearance only, NOT background):" });
        parts.push({ inlineData: { mimeType: "image/png", data: base64Data } });
    }

    // Add character/setting references
    const allRefs = [...refImages];
    if (previousBeatImage && !allRefs.includes(previousBeatImage)) allRefs.push(previousBeatImage);

    allRefs.forEach((img) => {
        const base64Data = img.includes(",") ? img.split(",")[1] : img;
        parts.push({ inlineData: { mimeType: "image/png", data: base64Data } });
    });
    parts.push({ text: promptLines.join("\n") });

    try {
        const response = await ai.models.generateContent({
            model: MODEL_IMAGE_GEN,
            contents: { parts },
            config: {
                imageConfig: { aspectRatio, imageSize },
                systemInstruction
            }
        });
        const data = response.candidates?.[0].content.parts.find((p: any) => p.inlineData)?.inlineData?.data;
        if (!data) throw new Error("No image data");
        const rawBase64 = `data:image/png;base64,${data}`;
        return await compressImage(rawBase64, 0.85);
    } catch (error: any) {
        const fallbackResponse = await ai.models.generateContent({
            model: MODEL_IMAGE_GEN_FALLBACK,
            contents: { parts },
            config: { imageConfig: { aspectRatio } }
        });
        const data = fallbackResponse.candidates?.[0].content.parts.find((p: any) => p.inlineData)?.inlineData?.data;
        if (!data) throw new Error("Image gen failed");
        const rawBase64 = `data:image/png;base64,${data}`;
        return await compressImage(rawBase64, 0.85);
    }
};

// NEW: Translate segments on the fly for the Reader
export const translateSegments = async (segments: StorySegment[], targetLanguage: string): Promise<StorySegment[]> => {
  const ai = getAi();
  
  // Prepare a simplified payload to save tokens
  const textPayload = segments.map(s => ({ 
      id: s.id, 
      text: s.text, 
      captions: s.panels?.map(p => p.caption) || [],
      choices: s.choices?.map(c => c.text) || []
  }));

  const schema = {
    type: Type.OBJECT,
    properties: {
      translations: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING },
            translatedText: { type: Type.STRING, description: "Natural translation suitable for a comic. NO artificial spaces for Japanese/Chinese." },
            tokenizedText: { 
                type: Type.ARRAY, 
                items: { type: Type.STRING },
                description: "Array of individual semantic words/tokens. For Japanese: ['私', 'は', '学生', 'です']. For English: ['I', 'am', 'a', 'student']." 
            },
            translatedCaptions: { type: Type.ARRAY, items: { type: Type.STRING } },
            translatedChoices: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ["id", "translatedText", "tokenizedText", "translatedCaptions"]
        }
      }
    },
    required: ["translations"]
  };

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Translate the following narrative content into ${targetLanguage}. 
    
    **TOKENIZATION RULE FOR ASIAN LANGUAGES (Japanese, Chinese, Thai)**:
    1. 'translatedText': Must look NATURAL. Do **NOT** add spaces between words. (e.g., "私は学生です")
    2. 'tokenizedText': Provide the array of individual clickable words. (e.g., ["私", "は", "学生", "です"])
    
    For alphabetic languages (English, Spanish), 'translatedText' and 'tokenizedText' logic is standard (spaces in text, words in array).
    
    CONTENT: ${JSON.stringify(textPayload)}`,
    config: {
      responseMimeType: "application/json",
      responseSchema: schema
    }
  });

  const result = JSON.parse(response.text || "{}");
  const translations = result.translations || [];

  // Merge translations back into segments
  return segments.map(segment => {
    const trans = translations.find((t: any) => t.id === segment.id);
    if (!trans) return segment;

    return {
        ...segment,
        text: trans.translatedText,
        tokens: trans.tokenizedText, // Store the tokens for the UI
        panels: segment.panels.map((p, idx) => ({
            ...p,
            caption: trans.translatedCaptions[idx] || p.caption
        })),
        choices: segment.choices?.map((c, idx) => ({
            ...c,
            text: trans.translatedChoices?.[idx] || c.text
        }))
    };
  });
};

// NEW: Interactive Dictionary Feature (Single Word)
export const getWordDefinition = async (word: string, contextSentence: string, targetLanguage: string): Promise<{ definition: string, pronunciation?: string }> => {
  const ai = getAi();
  
  const schema = {
    type: Type.OBJECT,
    properties: {
      definition: { type: Type.STRING, description: `The meaning of the word '${word}' in the language ${targetLanguage}, considering the context.` },
      pronunciation: { type: Type.STRING, description: "Phonetic pronunciation if applicable." }
    },
    required: ["definition"]
  };

  const response = await ai.models.generateContent({
    model: MODEL_FAST_DEFINITIONS,
    contents: `Define the word "${word}" found in this sentence: "${contextSentence}". 
    Translate the definition into ${targetLanguage}. Keep it concise (under 20 words).`,
    config: {
      responseMimeType: "application/json",
      responseSchema: schema
    }
  });

  return JSON.parse(response.text || "{}");
};

// NEW: Batch Vocabulary Generation
export const batchDefineVocabulary = async (
    words: string[], 
    targetLanguage: string
): Promise<Record<string, WordDefinition>> => {
    if (words.length === 0) return {};
    
    const ai = getAi();
    
    // Chunking to prevent token limits (max 50 words per call)
    const chunkSize = 50;
    let combinedResults: Record<string, WordDefinition> = {};

    for (let i = 0; i < words.length; i += chunkSize) {
        const chunk = words.slice(i, i + chunkSize);
        
        const schema = {
            type: Type.OBJECT,
            properties: {
                definitions: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            word: { type: Type.STRING },
                            definition: { type: Type.STRING, description: `Definition in ${targetLanguage}` },
                            pronunciation: { type: Type.STRING }
                        },
                        required: ["word", "definition"]
                    }
                }
            },
            required: ["definitions"]
        };

        try {
            const response = await ai.models.generateContent({
                model: MODEL_FAST_DEFINITIONS,
                contents: `
                Act as a Dictionary. Define the following words into ${targetLanguage}.
                Return a JSON array.
                WORDS: ${JSON.stringify(chunk)}
                `,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: schema
                }
            });

            const result = JSON.parse(response.text || "{}");
            if (result.definitions) {
                result.definitions.forEach((def: any) => {
                    combinedResults[def.word] = {
                        definition: def.definition,
                        pronunciation: def.pronunciation
                    };
                });
            }
        } catch (e) {
            console.error("Batch vocab error", e);
        }
    }

    return combinedResults;
};

// STEP 1: FORENSIC ANALYSIS (Dedicated Function) - Enhanced version with spatial tracking
const performForensicAnalysis = async (
    previousImage: string | undefined,
    previousText: string | undefined
): Promise<any> => {
    const ai = getAi();

    const schema = {
        type: Type.OBJECT,
        properties: {
            exact_outfit: { type: Type.STRING, description: "The EXACT clothing seen. E.g. 'White bathrobe with belt'. If naked, say 'Naked'." },
            outfit_details: { type: Type.STRING, description: "Colors, patterns, accessories. E.g. 'Brown pencil skirt, white blouse tucked in, black heels, beige handbag'" },
            held_item: { type: Type.STRING, description: "What is in their hands? BE SPECIFIC. If it is a Mop/Broom, say 'Floor Mop'. If a knife, say 'Knife'. If empty, say 'None'." },
            environment_state: { type: Type.STRING, description: "Describe the location. E.g. 'Dark alley with brick walls, dim streetlight, wet pavement'" },
            character_state: { type: Type.STRING, description: "Character's physical state. E.g. 'Sweating, scared expression, running pose'" },
            time_of_day: { type: Type.STRING, description: "Morning, afternoon, evening, night based on lighting" },
            weather_lighting: { type: Type.STRING, description: "Lighting conditions. E.g. 'Harsh fluorescent office lights', 'Dim alley with weak streetlamp'" },
            // NEW: Spatial layout tracking for consistency
            spatial_layout: {
                type: Type.OBJECT,
                properties: {
                    character_position: { type: Type.STRING, description: "Where is the character in frame? E.g. 'center', 'left side', 'right side', 'lying in bed'" },
                    key_objects: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                object_name: { type: Type.STRING, description: "Name of the object. E.g. 'alarm clock', 'phone', 'lamp', 'window'" },
                                position: { type: Type.STRING, description: "Position relative to character. E.g. 'left of bed', 'right nightstand', 'on wall behind'" },
                                description: { type: Type.STRING, description: "Brief description. E.g. 'digital clock showing 7:45', 'smartphone with black case'" }
                            },
                            required: ["object_name", "position"]
                        },
                        description: "List of important objects in the scene and their positions"
                    },
                    room_layout: { type: Type.STRING, description: "Brief description of room layout. E.g. 'Bed against left wall, door on right, window above bed'" }
                },
                required: ["character_position", "key_objects"]
            },
            camera_angle_used: { type: Type.STRING, description: "What camera angle was used? E.g. 'three-quarter view from left', 'high angle looking down', 'frontal close-up'" }
        },
        required: ["exact_outfit", "outfit_details", "held_item", "environment_state", "character_state", "time_of_day", "weather_lighting", "spatial_layout", "camera_angle_used"]
    };

    const parts: any[] = [];
    if (previousImage) {
        const base64Data = previousImage.includes(',') ? previousImage.split(',')[1] : previousImage;
        parts.push({ inlineData: { mimeType: 'image/png', data: base64Data } });
        parts.push({ text: `Analyze this manhwa panel image in EXTREME detail:
1. Character appearance and EXACT clothing (colors, styles)
2. SPATIAL LAYOUT: Where is each object positioned? (left/right/center, near/far)
3. Key objects in scene and their EXACT positions
4. Camera angle used
5. Lighting and time of day

This is critical for maintaining visual consistency in the next panel.` });
    }
    if (previousText) {
        parts.push({ text: `Scene context: "${previousText}"` });
    }

    // If no previous data, return defaults
    if (parts.length === 0) return {
        exact_outfit: "Unknown",
        outfit_details: "Unknown",
        held_item: "None",
        environment_state: "Unknown",
        character_state: "Neutral",
        time_of_day: "Unknown",
        weather_lighting: "Normal lighting",
        spatial_layout: {
            character_position: "Unknown",
            key_objects: [],
            room_layout: "Unknown"
        },
        camera_angle_used: "Unknown"
    };

    const response = await ai.models.generateContent({
        model: MODEL_FORENSIC,
        contents: { parts: parts },
        config: {
            responseMimeType: "application/json",
            responseSchema: schema,
            systemInstruction: `You are a Forensic Image Analyst for manhwa/webtoon production.
Your job is to extract EVERY visual detail from panels to ensure consistency in the next panel.

CRITICAL: Track SPATIAL POSITIONS of objects:
- If there's an alarm clock on the LEFT side of the bed, note it as "left of bed"
- If there's a phone on the RIGHT nightstand, note it as "right nightstand"
- If the window is behind the character, note it as "behind character / back wall"

These spatial positions MUST remain consistent in subsequent panels.

Also track:
- Exact clothing colors and styles
- Character pose and expression
- Camera angle used
- Lighting conditions`
        }
    });

    return JSON.parse(response.text || "{}");
};

// NEW: Progressive Scene Prompt Generator - generates detailed prompts at image generation time
export interface ProgressivePromptContext {
    currentSceneText: string;
    fullStoryContext: string;
    previousSceneImage?: string;
    previousSceneText?: string;
    characterDescriptions: { name: string; description: string }[];
    settingDescription?: string;
    panelNumber: number;
    totalPanels: number;
    suggestedCameraAngle?: string;
    suggestedBackgroundType?: string;
    isFirstPanelInLocation?: boolean;
}

export interface DetailedScenePrompt {
    visualPrompt: string;
    characterAppearance: string;
    clothing: string;
    environment: string;
    lighting: string;
    cameraAngle: string;
    cameraInstruction: string;
    mood: string;
    action: string;
    spatialPositioning: string; // NEW: Explicit object positioning instructions
}

export const generateProgressiveScenePrompt = async (context: ProgressivePromptContext): Promise<DetailedScenePrompt> => {
    const ai = getAi();

    // STEP 1: Forensic Analysis of previous scene
    let forensicData: any = {
        exact_outfit: "Not established yet",
        outfit_details: "To be determined by story context",
        held_item: "None",
        environment_state: "Not established",
        character_state: "Neutral",
        time_of_day: "Not specified",
        weather_lighting: "Normal",
        spatial_layout: {
            character_position: "Unknown",
            key_objects: [],
            room_layout: "Unknown"
        },
        camera_angle_used: "Unknown"
    };

    if (context.previousSceneImage) {
        try {
            console.log("🔍 Running forensic analysis on previous scene...");
            forensicData = await performForensicAnalysis(context.previousSceneImage, context.previousSceneText);
            console.log("📋 Forensic results:", forensicData);
            if (forensicData.spatial_layout?.key_objects) {
                console.log("📍 Spatial layout:", forensicData.spatial_layout);
            }
        } catch (e) {
            console.error("Forensic analysis failed, using defaults", e);
        }
    }

    // Format spatial layout for prompt
    const formatSpatialLayout = () => {
        if (!forensicData.spatial_layout) return "No spatial data available";
        const layout = forensicData.spatial_layout;
        let result = `Character position: ${layout.character_position || 'Unknown'}\n`;
        if (layout.key_objects && layout.key_objects.length > 0) {
            result += "Key objects:\n";
            layout.key_objects.forEach((obj: any) => {
                result += `- ${obj.object_name}: ${obj.position}${obj.description ? ` (${obj.description})` : ''}\n`;
            });
        }
        if (layout.room_layout) {
            result += `Room layout: ${layout.room_layout}`;
        }
        return result;
    };

    // STEP 2: Generate detailed prompt with full context
    const schema = {
        type: Type.OBJECT,
        properties: {
            visualPrompt: {
                type: Type.STRING,
                description: "A MASSIVE, detailed visual description (minimum 8-10 sentences). Include character appearance, exact clothing, pose, expression, environment details, lighting, camera angle, and mood."
            },
            characterAppearance: {
                type: Type.STRING,
                description: "Detailed description of the character's face, hair, body type, skin tone"
            },
            clothing: {
                type: Type.STRING,
                description: "EXACT clothing description with colors and styles. Must match previous scene unless story indicates change."
            },
            environment: {
                type: Type.STRING,
                description: "Detailed environment description - walls, floor, furniture, objects, weather"
            },
            lighting: {
                type: Type.STRING,
                description: "Lighting setup - source, color, shadows, atmosphere"
            },
            cameraAngle: {
                type: Type.STRING,
                enum: ['OVER_SHOULDER', 'SIDE_PROFILE', 'THREE_QUARTER', 'LOW_ANGLE', 'HIGH_ANGLE', 'DUTCH_ANGLE', 'POV', 'BIRDS_EYE', 'WORMS_EYE', 'FRONTAL']
            },
            cameraInstruction: {
                type: Type.STRING,
                description: "Specific camera/framing instruction for the illustrator"
            },
            mood: {
                type: Type.STRING,
                description: "Emotional tone of the scene - tense, calm, romantic, scary, etc."
            },
            action: {
                type: Type.STRING,
                description: "What the character is DOING in this exact moment"
            },
            spatialPositioning: {
                type: Type.STRING,
                description: "CRITICAL: Describe where key objects are positioned. E.g. 'Alarm clock on left nightstand, phone on right nightstand, window behind bed on back wall, door to the right of frame'. Must maintain consistency with previous panel."
            }
        },
        required: ["visualPrompt", "characterAppearance", "clothing", "environment", "lighting", "cameraAngle", "cameraInstruction", "mood", "action", "spatialPositioning"]
    };

    const characterContext = context.characterDescriptions.map(c => `${c.name}: ${c.description}`).join('\n');

    const spatialLayoutInfo = formatSpatialLayout();

    const systemInstruction = `You are a Senior Manhwa Art Director creating detailed visual prompts for illustrators.

YOUR TASK: Generate an extremely detailed visual prompt for Panel ${context.panelNumber}/${context.totalPanels}.

=== CONTINUITY RULES (CRITICAL) ===
The previous scene analysis found:
- Character was wearing: ${forensicData.exact_outfit}
- Clothing details: ${forensicData.outfit_details}
- Holding: ${forensicData.held_item}
- Environment: ${forensicData.environment_state}
- Character state: ${forensicData.character_state}
- Time of day: ${forensicData.time_of_day}
- Lighting: ${forensicData.weather_lighting}
- Previous camera angle: ${forensicData.camera_angle_used || 'Unknown'}

=== SPATIAL LAYOUT (CRITICAL FOR OBJECT CONSISTENCY) ===
${spatialLayoutInfo}

**SPATIAL CONSISTENCY RULES**:
1. Objects MUST remain in the same positions relative to each other
2. If an alarm clock was on the LEFT of the bed, it STAYS on the left
3. If a phone was on the RIGHT nightstand, it STAYS on the right
4. Window, door, and furniture positions must be consistent
5. When changing camera angles, maintain the spatial relationships (mirror the positions if viewing from opposite side)

YOU MUST MAINTAIN CONTINUITY:
1. If character was wearing "${forensicData.exact_outfit}" in previous scene, they MUST wear the SAME outfit unless the story explicitly mentions changing clothes
2. If character was holding "${forensicData.held_item}", they should still have it unless they put it down
3. Environment should be consistent with "${forensicData.environment_state}" unless location changed
4. Time of day "${forensicData.time_of_day}" should be consistent unless story indicates time passing
5. SPATIAL LAYOUT: All objects must remain in their established positions

=== CAMERA ANGLE RULES ===
Suggested angle: ${context.suggestedCameraAngle || 'THREE_QUARTER'}
- AVOID FRONTAL unless absolutely necessary for emotional impact
- THREE_QUARTER is the most versatile and dynamic
- OVER_SHOULDER for dialogue between two characters
- LOW_ANGLE for powerful/dramatic moments
- HIGH_ANGLE for vulnerability
- DUTCH_ANGLE for tension/unease
- POV for showing what character sees

=== BACKGROUND TYPE ===
Suggested: ${context.suggestedBackgroundType || 'BOKEH'}
- DETAILED: Only for establishing shots (first panel of new location)
- BOKEH: Default for dialogue/character focus (blurred background with context)
- GRADIENT: Emotional moments
- SPEEDLINES: Action/shock
- WHITE: Almost never use

=== OUTPUT REQUIREMENTS ===
1. visualPrompt must be MINIMUM 8-10 detailed sentences
2. Include EXACT clothing colors and styles
3. Include specific pose and expression
4. Include environment details appropriate to background type
5. Include lighting direction and mood
6. Include camera framing instruction`;

    const userPrompt = `
=== CURRENT SCENE TEXT ===
"${context.currentSceneText}"

=== PREVIOUS SCENE TEXT ===
"${context.previousSceneText || 'This is the first scene'}"

=== CHARACTER DESCRIPTIONS ===
${characterContext || 'No specific character descriptions provided'}

=== SETTING ===
${context.settingDescription || 'Not specified'}

=== FULL STORY CONTEXT ===
${context.fullStoryContext.slice(0, 2000)}

Generate a detailed visual prompt for this scene. Remember:
- Maintain clothing continuity from previous scene
- Use dynamic camera angle (not frontal)
- Match the emotional tone of the text
`;

    const response = await ai.models.generateContent({
        model: MODEL_TEXT_ANALYSIS,
        contents: userPrompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: schema,
            systemInstruction,
            thinkingConfig: { thinkingBudget: 4096 }
        }
    });

    const result = JSON.parse(response.text || "{}");
    console.log("📝 Generated detailed prompt:", result);

    return result;
};

// NEW: Generate scene image with progressive prompt generation
export const generateSceneImageProgressive = async ({
    currentSceneText,
    fullStoryContext,
    previousSceneImage,
    previousSceneText,
    characterRefs,
    characterDescriptions,
    settingRef,
    settingDescription,
    panelNumber,
    totalPanels,
    suggestedCameraAngle,
    suggestedBackgroundType,
    isFirstPanelInLocation,
    globalStyle,
    aspectRatio = AspectRatio.MOBILE,
    imageSize = ImageSize.K1
}: {
    currentSceneText: string;
    fullStoryContext: string;
    previousSceneImage?: string;
    previousSceneText?: string;
    characterRefs: string[];
    characterDescriptions: { name: string; description: string }[];
    settingRef?: string;
    settingDescription?: string;
    panelNumber: number;
    totalPanels: number;
    suggestedCameraAngle?: string;
    suggestedBackgroundType?: string;
    isFirstPanelInLocation?: boolean;
    globalStyle?: string;
    aspectRatio?: AspectRatio;
    imageSize?: ImageSize;
}): Promise<{ imageUrl: string; usedPrompt: DetailedScenePrompt }> => {
    const ai = getAi();
    const style = globalStyle || "Manhwa/Webtoon";

    // STEP 1: Generate detailed prompt progressively
    console.log(`\n🎬 Generating prompt for panel ${panelNumber}/${totalPanels}...`);

    const detailedPrompt = await generateProgressiveScenePrompt({
        currentSceneText,
        fullStoryContext,
        previousSceneImage,
        previousSceneText,
        characterDescriptions,
        settingDescription,
        panelNumber,
        totalPanels,
        suggestedCameraAngle,
        suggestedBackgroundType,
        isFirstPanelInLocation
    });

    // STEP 2: Build image generation prompt
    const bgInstruction = getBackgroundInstruction(suggestedBackgroundType);
    const cameraInstruction = getCameraAngleInstruction(detailedPrompt.cameraAngle);

    const imagePrompt = `
Illustrate ONLY this scene in ${style} style:

"${currentSceneText}"

=== DETAILED VISUAL DIRECTION ===
${detailedPrompt.visualPrompt}

=== CHARACTER APPEARANCE ===
${detailedPrompt.characterAppearance}

=== CLOTHING (MUST MATCH EXACTLY) ===
${detailedPrompt.clothing}

=== ENVIRONMENT ===
${detailedPrompt.environment}

=== LIGHTING ===
${detailedPrompt.lighting}

=== CAMERA ===
Angle: ${detailedPrompt.cameraAngle}
${cameraInstruction}
Framing: ${detailedPrompt.cameraInstruction}

=== MOOD ===
${detailedPrompt.mood}

=== ACTION ===
${detailedPrompt.action}

=== SPATIAL POSITIONING (CRITICAL FOR CONSISTENCY) ===
${detailedPrompt.spatialPositioning || 'No specific positioning established yet'}

=== BACKGROUND TYPE ===
${bgInstruction}

=== RULES ===
* NO speech bubbles or text
* NO Korean/Japanese/Chinese characters
* Attached images are for character/style reference ONLY
* MUST use the EXACT clothing described above
* MUST use the specified camera angle
* MUST maintain object positions as described in SPATIAL POSITIONING
`;

    const systemInstruction = `You are an expert manhwa illustrator. Style: ${style}.

CRITICAL RULES:
1. CLOTHING CONSISTENCY: Draw the EXACT clothing described. Do not change colors or styles.
2. CAMERA ANGLE: Use the specified angle (${detailedPrompt.cameraAngle}). Do NOT default to frontal.
3. NO TEXT: No speech bubbles, sound effects, or any text in the image.
4. BACKGROUND: Follow the background type instruction strictly.
5. QUALITY: High-quality Korean Webtoon style. Cel-shaded, sharp lines.
6. SPATIAL CONSISTENCY: Objects MUST remain in their established positions. If the alarm clock was on the LEFT of the bed, it stays on the LEFT. If the phone was on the RIGHT nightstand, it stays on the RIGHT. When the camera angle changes, maintain logical spatial relationships.`;

    // STEP 3: Build parts with reference images
    const parts: any[] = [];

    // Add previous scene for continuity reference
    if (previousSceneImage) {
        const base64Data = previousSceneImage.includes(',') ? previousSceneImage.split(',')[1] : previousSceneImage;
        parts.push({ text: "CONTINUITY REFERENCE (previous scene - match clothing and style):" });
        parts.push({ inlineData: { mimeType: 'image/png', data: base64Data } });
    }

    // Add character references
    characterRefs.forEach((img, idx) => {
        const base64Data = img.includes(',') ? img.split(',')[1] : img;
        parts.push({ text: `CHARACTER REFERENCE ${idx + 1} (face/hair reference only):` });
        parts.push({ inlineData: { mimeType: 'image/png', data: base64Data } });
    });

    // Add setting reference
    if (settingRef) {
        const base64Data = settingRef.includes(',') ? settingRef.split(',')[1] : settingRef;
        parts.push({ text: "LOCATION REFERENCE (environment style):" });
        parts.push({ inlineData: { mimeType: 'image/png', data: base64Data } });
    }

    // Add the prompt
    parts.push({ text: imagePrompt });

    // STEP 4: Generate image
    try {
        const response = await ai.models.generateContent({
            model: MODEL_IMAGE_GEN,
            contents: { parts },
            config: {
                imageConfig: { aspectRatio, imageSize },
                systemInstruction
            }
        });

        const data = response.candidates?.[0].content.parts.find((p: any) => p.inlineData)?.inlineData?.data;
        if (!data) throw new Error("No image data");

        const rawBase64 = `data:image/png;base64,${data}`;
        const compressedImage = await compressImage(rawBase64, 0.85);

        return {
            imageUrl: compressedImage,
            usedPrompt: detailedPrompt
        };
    } catch (error: any) {
        console.error("Primary model failed, trying fallback...", error);

        // Fallback
        const fallbackResponse = await ai.models.generateContent({
            model: MODEL_IMAGE_GEN_FALLBACK,
            contents: { parts },
            config: { imageConfig: { aspectRatio } }
        });

        const data = fallbackResponse.candidates?.[0].content.parts.find((p: any) => p.inlineData)?.inlineData?.data;
        if (!data) throw new Error("Image generation failed");

        const rawBase64 = `data:image/png;base64,${data}`;
        const compressedImage = await compressImage(rawBase64, 0.85);

        return {
            imageUrl: compressedImage,
            usedPrompt: detailedPrompt
        };
    }
};

export const regeneratePanelPrompts = async (
    segmentText: string,
    fullStoryText: string,
    style: string,
    contextInfo: string,
    previousSegmentImage?: string,
    previousSegmentText?: string
): Promise<ManhwaPanel[]> => {
    const ai = getAi();

    // --- PHASE 1: FORENSIC AUDIT (The "Truth" Step) ---
    // We do this in a separate call to ensure the "Mop" isn't hallucinated away.
    let forensicData = { exact_outfit: "Unknown", held_item: "None", environment_state: "Unknown" };
    
    if (previousSegmentImage || previousSegmentText) {
        try {
            forensicData = await performForensicAnalysis(previousSegmentImage, previousSegmentText);
            console.log("Forensic Analysis Result:", forensicData);
        } catch (e) {
            console.error("Forensic analysis failed", e);
            // Don't crash the whole process, just log it. The next phase will run with 'Unknown' state.
        }
    }
    
    // --- PHASE 2: GENERATION (The "Drafting" Step) ---
    const schema = {
        type: Type.OBJECT,
        properties: {
            sourceLanguage: { type: Type.STRING, description: "The detected language of the Input text (e.g. 'Czech', 'Korean')." },
            panels: { 
                type: Type.ARRAY, 
                items: {
                    type: Type.OBJECT,
                    properties: {
                        panelIndex: { type: Type.INTEGER },
                        visualPrompt: { type: Type.STRING, description: "A MASSIVE, detailed paragraph (min 6 sentences) IN ENGLISH." },
                        caption: { type: Type.STRING, description: "The text bubble content. MUST MATCH 'sourceLanguage' EXACTLY." },
                        cameraAngle: { type: Type.STRING },
                        shotType: { type: Type.STRING, enum: ['ESTABLISHING', 'CHARACTER', 'ACTION', 'DETAIL', 'CLOSE-UP'] }
                    },
                    required: ["panelIndex", "visualPrompt", "caption", "cameraAngle", "shotType"]
                },
                description: "Exactly 4 narrative beats."
            }
        },
        required: ["sourceLanguage", "panels"]
    };

    const systemInstruction = `
    You are a Storyboard Re-Generator.
    
    **CRITICAL INSTRUCTION: LANGUAGE ANCHOR**
    1. Detect the language of the Input Text below.
    2. Store it in 'sourceLanguage'.
    3. Ensure ALL 'caption' fields are in 'sourceLanguage'.
    4. Ensure ALL 'visualPrompt' fields are in English.
    
    **DO NOT TRANSLATE THE CAPTIONS**.
    If Input is: "Pes štěkal." (Czech)
    Output 'caption': "Pes štěkal."
    Output 'visualPrompt': "A dog barking..." (English)
    
    **FORENSIC CONTINUITY**:
    - Outfit: ${forensicData.exact_outfit}
    - Item: ${forensicData.held_item}
    `;
    
    const parts: any[] = [];
    
    parts.push({ 
        text: `
        INPUT TEXT: "${segmentText}"
        CONTEXT: ${contextInfo}
        ` 
    });

    const response = await ai.models.generateContent({
        model: MODEL_TEXT_ANALYSIS,
        contents: { parts: parts },
        config: {
            responseMimeType: "application/json",
            responseSchema: schema,
            systemInstruction: systemInstruction,
            thinkingConfig: { thinkingBudget: 4096 }
        }
    });

    const result = JSON.parse(response.text || "{}");
    return result.panels || [];
};

export const analyzeStoryText = async (storyText: string, artStyle: string): Promise<StoryData> => {
  const ai = getAi();

  const sentenceRegex = /[^.!?\u2026]+(?:[.!?\u2026]+["')\]\u201D\u2019]*)?|[^.!?\u2026]+$/g;
  const countSentences = (value: string) => (value.match(sentenceRegex) || []).length;
  const normalizeCoverage = (value: string) => value.replace(/\s+/g, '');

  const totalSentences = countSentences(storyText);
  const minSegments = Math.max(1, Math.ceil(totalSentences / 3));
  // UPDATED: Allow silent beats even for short texts - AI decides placement creatively
  // Minimum 1 silent beat for any text with 2+ sentences, scale up from there
  const minSilentBeats = totalSentences >= 2 ? Math.max(1, Math.floor(totalSentences / 4)) : 0;

  const schema = {
    type: Type.OBJECT,
    properties: {
      sourceLanguage: { type: Type.STRING, description: "The detected language of the FULL RAW TEXT (e.g., 'Czech', 'Spanish', 'Korean')." },
      title: { type: Type.STRING },
      artStyle: { type: Type.STRING },
      visualStyleGuide: { type: Type.STRING },
      characters: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING },
            name: { type: Type.STRING },
            description: { type: Type.STRING, description: "Detailed appearance: Clothing, Hair, Shoes, Colors." }
          },
          required: ["id", "name", "description"]
        }
      },
      settings: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING },
            name: { type: Type.STRING },
            description: { type: Type.STRING, description: "General atmosphere and visual mood." },
            spatialLayout: { type: Type.STRING, description: "TECHNICAL BLUEPRINT: Where is the bed, door, window?" },
            colorPalette: { type: Type.STRING, description: "The 3 dominant colors of this place." }
          },
          required: ["id", "name", "description", "spatialLayout", "colorPalette"]
        }
      },
      segments: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING },
            text: { type: Type.STRING, description: "MUST MATCH 'sourceLanguage' EXACTLY. Verbatim copy of the input beat. For silent beats use empty string." },
            type: { type: Type.STRING, enum: ['MAIN', 'BRANCH', 'MERGE_POINT'] },
            costumeOverride: { type: Type.STRING, description: "CRITICAL: The specific outfit/state of the character in THIS segment." },
            choices: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        text: { type: Type.STRING },
                        targetSegmentId: { type: Type.STRING }
                    }
                }
            },
            nextSegmentId: { type: Type.STRING },
            settingId: { type: Type.STRING },
            characterIds: { type: Type.ARRAY, items: { type: Type.STRING } },
            scenePrompt: { type: Type.STRING },
            panels: {
              type: Type.ARRAY,
              minItems: 1,
              maxItems: 1,
              items: {
                  type: Type.OBJECT,
                  properties: {
                      panelIndex: { type: Type.INTEGER },
                      visualPrompt: { type: Type.STRING, description: "IN ENGLISH. Can be short. For silent beats, describe the wordless visual moment. MUST include current clothing state." },
                      caption: { type: Type.STRING, description: "MUST MATCH 'sourceLanguage' EXACTLY. For silent beats use empty string." },
                      cameraAngle: { type: Type.STRING, enum: ['OVER_SHOULDER', 'SIDE_PROFILE', 'THREE_QUARTER', 'LOW_ANGLE', 'HIGH_ANGLE', 'DUTCH_ANGLE', 'POV', 'BIRDS_EYE', 'WORMS_EYE', 'FRONTAL'], description: "Camera angle. FRONTAL should be used sparingly (max 20% of panels). Prefer dynamic angles like OVER_SHOULDER, SIDE_PROFILE, THREE_QUARTER." },
                      shotType: { type: Type.STRING, enum: ['ESTABLISHING', 'CHARACTER', 'ACTION', 'DETAIL', 'CLOSE-UP'] },
                      backgroundType: { type: Type.STRING, enum: ['DETAILED', 'BOKEH', 'GRADIENT', 'SPEEDLINES', 'SPLIT', 'WHITE'], description: "Background strategy. DETAILED=establishing shots only. BOKEH=default for dialogue (blurred bg with context). GRADIENT=emotional moments. SPEEDLINES=action/shock. SPLIT=two scenes side by side. WHITE=rare, pure white." }
                  },
                  required: ["panelIndex", "visualPrompt", "caption", "cameraAngle", "shotType", "backgroundType"]
              }
            }
          },
          required: ["id", "text", "type", "settingId", "characterIds", "scenePrompt", "panels"]
        }
      }
    },
    required: ["sourceLanguage", "title", "artStyle", "segments", "characters", "settings"]
  };

  const buildSystemInstruction = (attempt: number) => `
  You are a Manhwa Director creating a storyboard with both DIALOGUE PANELS and SILENT ILLUSTRATION PANELS.

  GOAL: Transform the input text into a cinematic manhwa experience by:
  1. Splitting dialogue/narration into panels (1-3 sentences each)
  2. INSERTING SILENT BEATS (panels with NO text, only visuals) to create pacing and atmosphere
  3. CHOOSING THE RIGHT BACKGROUND TYPE for each panel (this is CRITICAL for visual consistency)
  4. USING DYNAMIC CAMERA ANGLES - avoid static frontal shots
  5. TRACKING CLOTHING/COSTUME CHANGES logically through the story

  === CAMERA ANGLE STRATEGY (CRITICAL FOR DYNAMIC VISUALS) ===
  PROBLEM: Too many frontal shots make the manhwa look static and boring.
  SOLUTION: Use a VARIETY of camera angles. FRONTAL should be MAX 20% of panels.

  **CAMERA ANGLE RULES**:
  - OVER_SHOULDER: Perfect for dialogue between two characters
  - SIDE_PROFILE: Shows character emotion, great for contemplation
  - THREE_QUARTER: Dynamic view showing face + body language (USE OFTEN)
  - LOW_ANGLE: Makes character look powerful, dramatic entrances
  - HIGH_ANGLE: Shows vulnerability, overview shots
  - DUTCH_ANGLE: Tension, unease, dramatic moments
  - POV: What character sees (looking at phone, opening door)
  - BIRDS_EYE: Establishing shots, showing isolation
  - WORMS_EYE: Looking up at character, dramatic effect
  - FRONTAL: Use SPARINGLY (max 20%) - direct eye contact moments only

  **ANGLE DISTRIBUTION TARGET**:
  - THREE_QUARTER: 30% (most versatile)
  - OVER_SHOULDER: 20% (dialogue scenes)
  - SIDE_PROFILE: 15% (emotional beats)
  - LOW/HIGH_ANGLE: 15% (dramatic moments)
  - POV/DUTCH: 10% (tension/perspective)
  - FRONTAL: 10% (direct address only)

  === CLOTHING/COSTUME LOGIC (CRITICAL FOR CONSISTENCY) ===
  PROBLEM: Characters changing clothes between panels without reason breaks immersion.
  SOLUTION: Track clothing state logically. Use "costumeOverride" field.

  **CLOTHING STATE RULES**:
  1. WAKING UP: Character should be in sleepwear/pajamas/nightgown (NOT business clothes)
  2. AT HOME ALONE: Casual clothes, loungewear, or home clothes
  3. GOING OUTSIDE: Add outer layer (coat, jacket) if weather requires
  4. WORK/OFFICE: Business attire (suit, formal wear)
  5. BED/INTIMATE: Appropriate sleepwear or state

  **COSTUME TRANSITIONS MUST BE EXPLICIT**:
  - If character "gets dressed" in the text → show the transition
  - If character "takes off coat" → reflect this in subsequent panels
  - If character was naked/showering → they stay that way until text says they dress
  - NEVER have character suddenly wearing different clothes without text justification

  **costumeOverride FIELD**:
  - Set this for EVERY segment to track current clothing state
  - Examples: "Pajamas - light blue nightgown", "Business casual - white blouse, gray skirt", "Just woke up - messy hair, oversized t-shirt", "Wet from shower - wrapped in towel"
  - Be SPECIFIC: don't just say "casual" - describe the actual clothes

  WHAT ARE SILENT BEATS?
  Silent beats are panels with NO dialogue (text = "", caption = "") that show:
  - A character's reaction shot before they speak
  - An environmental establishing shot
  - A dramatic pause or tension moment
  - A transition between scenes
  - An action without words (walking, looking, reaching...)

  BEAT PLACEMENT STRATEGY:
  - ALWAYS insert at least ${minSilentBeats} silent beat(s) throughout the story
  - Place silent beats BEFORE important dialogue to build anticipation
  - Place silent beats AFTER dramatic moments to let them breathe
  - Use silent beats to show character emotions without words
  - Example flow: [Silent: character approaches] -> [Dialogue] -> [Silent: reaction] -> [Dialogue]

  **BACKGROUND TYPE STRATEGY (CRITICAL FOR WEBTOON STYLE)**:
  Professional webtoons use BOKEH as the DEFAULT - it gives context while keeping focus on characters.

  - **DETAILED**: Use ONLY for (MAX 1-2 per story):
    * First panel of a NEW location (establishing shot)
    * Scene transitions when entering a completely new place
    * NEVER use for dialogue panels

  - **BOKEH** (DEFAULT - use most often):
    * All dialogue panels - character speaking with blurred background
    * Shows environment context without distracting
    * Inner monologue with soft environmental hints
    * This is the STANDARD webtoon look

  - **GRADIENT**: Use for:
    * Emotional climax moments (sadness, joy, fear)
    * Dreamlike sequences or memories
    * Romantic tension
    * Silent contemplation beats

  - **SPEEDLINES**: Use for:
    * Action/running/fighting
    * Sudden shock or surprise
    * Dramatic reveals
    * Tension spikes

  - **SPLIT**: Use for:
    * Phone conversations (show both speakers)
    * Simultaneous events in different places
    * Contrasting reactions (one happy, one sad)
    * Two characters' perspectives

  - **WHITE**: Use RARELY:
    * Only for very simple exposition
    * Absolute minimal scenes
    * Avoid using WHITE - prefer BOKEH

  EXAMPLE FLOW:
  [DETAILED+BIRDS_EYE: city skyline] -> [BOKEH+THREE_QUARTER: woman walks to work] -> [BOKEH+OVER_SHOULDER: dialogue] -> [GRADIENT+SIDE_PROFILE: emotional moment] -> [SPEEDLINES+DUTCH: panic/running] -> [SPLIT+THREE_QUARTER: phone call with two people] -> [BOKEH+LOW_ANGLE: dialogue continues]

  STORY BEATS (with text):
  - Must contain 1-3 sentences from the input, verbatim
  - text and panel.caption must match exactly
  - Copy text exactly as written, preserve all punctuation

  SILENT BEATS (no text):
  - text = "" (empty string)
  - panel.caption = "" (empty string)
  - panel.visualPrompt = detailed English description of what to illustrate (INCLUDE CURRENT CLOTHING STATE)
  - Must NOT invent new plot, only show atmosphere, reactions, or implied action

  COVERAGE RULE:
  - When all non-empty segment texts are concatenated (ignoring whitespace), they must equal the input exactly.
  - Do NOT skip any input text. Do NOT add invented dialogue.

  OUTPUT RULES:
  - type: MAIN for all segments
  - panels: exactly 1 item per segment
  - panelIndex: 0
  - cameraAngle: MUST vary - use THREE_QUARTER, OVER_SHOULDER, SIDE_PROFILE often. FRONTAL max 20%
  - shotType: ESTABLISHING for first beat and scene changes, CHARACTER for dialogue, ACTION for emphasis, CLOSE-UP for reactions, DETAIL otherwise
  - backgroundType: MUST be set for every panel (see strategy above)
  - costumeOverride: MUST describe current clothing state explicitly
  - visualPrompt: MUST include current clothing description
  - settingId: empty string if unsure
  - characterIds: empty array if unsure

  ${attempt > 1 ? "RETRY: Your previous attempt failed validation. Ensure you have at least " + minSilentBeats + " silent beats (text='') AND that all input text is preserved verbatim in story beats." : ""}
  `;

  const validate = (result: any) => {
    console.log("=== VALIDATION START ===");
    console.log("Total sentences in input:", totalSentences);
    console.log("Min silent beats required:", minSilentBeats);

    const segments = result?.segments || [];
    if (!Array.isArray(segments) || segments.length === 0) {
        console.log("Validation failed: no segments returned");
        return false;
    }
    console.log("Segments returned:", segments.length);

    // Check text coverage - all input text must be preserved
    const normalizedInput = normalizeCoverage(storyText);
    const normalizedOutput = normalizeCoverage(segments.map((s: any) => s.text || '').filter((text: string) => text.trim().length > 0).join(' '));

    // Relaxed comparison - check if lengths are similar (within 5% tolerance)
    const lengthDiff = Math.abs(normalizedInput.length - normalizedOutput.length);
    const tolerance = Math.max(normalizedInput.length * 0.05, 10); // 5% or 10 chars min

    if (!normalizedInput || lengthDiff > tolerance) {
        console.log("Validation failed: text coverage mismatch");
        console.log("Input length:", normalizedInput.length, "Output length:", normalizedOutput.length, "Diff:", lengthDiff);
        // Log first 100 chars of each for comparison
        console.log("Input preview:", normalizedInput.slice(0, 100));
        console.log("Output preview:", normalizedOutput.slice(0, 100));
        return false;
    }

    // Check minimum silent beats requirement (only if minSilentBeats > 0)
    const silentBeats = segments.filter((s: any) => (s?.text || '').trim().length === 0);
    console.log("Silent beats found:", silentBeats.length);

    if (minSilentBeats > 0 && silentBeats.length < minSilentBeats) {
        console.log(`Validation failed: need ${minSilentBeats} silent beats, got ${silentBeats.length}`);
        return false;
    }

    // Validate each segment structure
    for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        const text = segment?.text || '';
        const panel = segment?.panels?.[0];

        // Must have exactly 1 panel
        if (!panel || !segment?.panels || segment.panels.length !== 1) {
            console.log(`Validation failed: segment ${i} missing panel`);
            return false;
        }

        // Must be type MAIN
        if (segment?.type !== 'MAIN') {
            console.log(`Validation failed: segment ${i} type not MAIN, got:`, segment?.type);
            return false;
        }

        // Silent beat validation
        if (text.trim().length === 0) {
            // Caption should also be empty for silent beats (but be lenient)
            if ((panel.caption || '').trim().length !== 0) {
                console.log(`Warning: silent beat ${i} has non-empty caption, auto-clearing`);
                panel.caption = ""; // Auto-fix instead of failing
            }
            // Must have a visual prompt
            if (!panel.visualPrompt || panel.visualPrompt.trim().length === 0) {
                console.log(`Validation failed: silent beat ${i} missing visualPrompt`);
                return false;
            }
            continue;
        }

        // Story beat validation - very relaxed sentence count (allow up to 6 for flexibility)
        const sentenceCount = countSentences(text);
        if (sentenceCount < 1 || sentenceCount > 6) {
            console.log(`Validation failed: segment ${i} sentence count ${sentenceCount} out of range`);
            return false;
        }

        // Caption should match text (but be lenient - just warn)
        if (panel.caption !== text) {
            console.log(`Warning: segment ${i} caption doesn't match text exactly, auto-fixing`);
            panel.caption = text; // Auto-fix
        }
    }

    console.log("=== VALIDATION PASSED ===");
    return true;
  };

  for (let attempt = 1; attempt <= 3; attempt++) {
    console.log(`\n=== ATTEMPT ${attempt}/3 ===`);
    try {
      const response = await ai.models.generateContent({
        model: MODEL_TEXT_ANALYSIS,
        contents: `FULL RAW TEXT:
${storyText}

STYLE: ${artStyle}`,
        config: {
          responseMimeType: "application/json",
          responseSchema: schema,
          systemInstruction: buildSystemInstruction(attempt),
          thinkingConfig: { thinkingBudget: 8192 }
        }
      });

      const rawText = response.text || "{}";
      console.log("API response length:", rawText.length);

      let result;
      try {
        result = JSON.parse(rawText);
      } catch (parseError) {
        console.log("JSON parse error:", parseError);
        console.log("Raw response preview:", rawText.slice(0, 500));
        continue;
      }

      console.log("Parsed result - segments:", result?.segments?.length || 0);

      if (validate(result)) {
        if (result.sourceLanguage) {
            console.log(`Detected Story Language: ${result.sourceLanguage}`);
        }
        return result;
      }

      console.log(`Attempt ${attempt} validation failed, retrying...`);
    } catch (apiError: any) {
      console.log(`API error on attempt ${attempt}:`, apiError?.message || apiError);
      if (attempt === 3) throw apiError;
    }
  }

  throw new Error("Beat segmentation failed after 3 attempts. Check console for details.");
};

export const generateImage = async (
  prompt: string, 
  aspectRatio: AspectRatio = AspectRatio.MOBILE, 
  imageSize: ImageSize = ImageSize.K1, 
  refImages?: string[],
  globalStyle?: string,
  cinematicDNA?: any,
  useGridMode: boolean = false,
  gridVariations?: string[],
  continuityImage?: string, // Action Continuity
  locationContinuityImages?: string[] // UPDATED: Location/Architectural Continuity (Array)
): Promise<string> => {
  const ai = getAi();
  
  let styleInstruction = `Style: ${globalStyle || 'Manhwa/Webtoon'}. High-quality Korean Webtoon style. Cel-shaded, sharp lines.`;
  styleInstruction += " CONSISTENCY: Match the character and environment references exactly.";

  const systemInstruction = `You are an expert concept artist. ${styleInstruction}.
  
  **VISUAL HIERARCHY OF TRUTH (CRITICAL)**:
  1. **[FORCED OUTFIT] INSTRUCTION**: If the prompt text contains specific clothing instructions (e.g., "Naked", "Pajamas"), this **OVERRIDES** the clothing in the Reference Images.
     - The Reference Images are for **FACIAL FEATURES & HAIR ONLY**.
     - Do NOT simply copy the shirt from the reference image if the text says "Naked".
  
  2. **LOCATION CONTINUITY**: If 'LOCATION REFERENCES' are provided, they are the Absolute Truth for the room.
     - You MUST use the exact same walls, floor, lighting, and furniture from those images.
     - Do NOT hallucinate a new room. Combine the visual information from the references to build the environment.
  
  3. **ACTION CONTINUITY**: If a 'SCENE CONTINUITY' image is provided, match the character's clothing state from it (unless overruled by Rule 1).
  
  **ENVIRONMENTAL CONSISTENCY STRATEGY (BACKGROUND HIDING)**:
  - **PROBLEM**: Generating detailed rooms in every panel causes "hallucinations" (walls moving, doors changing).
  - **SOLUTION**: You must strictly obey "NO BACKGROUND" or "WHITE BACKGROUND" instructions in the prompt.
  - **IF prompt says "White background"**: Draw the character on PURE WHITE or pure solid color. Do NOT draw walls or furniture.
  - **IF prompt says "Bokeh"**: Blur the background into unrecognizable abstract blobs.
  - **IF prompt says "Abstract"**: Use screen tones, speed lines, or soft gradients.
  - **ONLY** draw the detailed room if the prompt explicitly says "ESTABLISHING SHOT" or "SHOW FULL ROOM".
  
  **CRITICAL: NO TEXT & NO ASIAN CHARACTERS**
  1. Do NOT generate speech bubbles, sound effects (SFX), or labels.
  2. STRICTLY FORBIDDEN: Korean Hangul, Japanese Kanji/Kana, Chinese Hanzi.
  3. If environment text is absolutely unavoidable (e.g., a street sign), use ENGLISH only.
  4. The output must be "Clean Art" (textless).
  `;
  
  // Construct the prompt content
  let promptParts: any[] = [];

  // 1. Add Location Continuity (Environment Architecture) - UPDATED FOR MULTIPLE IMAGES
  if (locationContinuityImages && locationContinuityImages.length > 0) {
      promptParts.push({ text: "**LOCATION REFERENCE (ARCHITECTURAL TRUTH)**: The following images define the specific room/background. Combine these views to create the environment. Copy walls, floor, lighting, and furniture style EXACTLY." });
      locationContinuityImages.forEach(img => {
          const base64Data = img.includes(',') ? img.split(',')[1] : img;
          promptParts.push({ inlineData: { mimeType: 'image/png', data: base64Data } });
      });
  }

  // 2. Add Continuity Image (Action/Clothing state)
  if (continuityImage) {
      const base64Data = continuityImage.includes(',') ? continuityImage.split(',')[1] : continuityImage;
      promptParts.push({ text: "**SCENE ACTION CONTINUITY**: This is the immediately preceding moment. Match the clothing/state shown here exactly." });
      promptParts.push({ inlineData: { mimeType: 'image/png', data: base64Data } });
  }

  // 3. Add Character/Setting Refs
  if (refImages && refImages.length > 0) {
    promptParts.push({ text: "**IDENTITY REFERENCE (FACE/HAIR ONLY)**: Use these for facial features. IGNORE CLOTHING if prompt specifies otherwise." });
    refImages.forEach(b64 => {
      const base64Data = b64.includes(',') ? b64.split(',')[1] : b64;
      promptParts.push({ inlineData: { mimeType: 'image/png', data: base64Data } });
    });
  }

  // 4. Add Prompt
  if (useGridMode && gridVariations && gridVariations.length >= 4) {
    // REPLICATING THE PROVEN PROMPT STRUCTURE:
    const gridPrompt = `2x2 image: Top left image: ${gridVariations[0]} Top right image: ${gridVariations[1]} Bottom left image: ${gridVariations[2]} Bottom right image: ${gridVariations[3]}`;
    promptParts.push({ text: gridPrompt });
  } else {
    promptParts.push({ text: `Visual prompt: ${prompt}` });
  }

  try {
      const response = await ai.models.generateContent({
        model: MODEL_IMAGE_GEN,
        contents: { parts: promptParts },
        config: { imageConfig: { aspectRatio, imageSize }, systemInstruction }
      });
      const data = response.candidates?.[0].content.parts.find((p: any) => p.inlineData)?.inlineData?.data;
      if (!data) throw new Error("No image data");
      // COMPRESSION STEP: Convert raw PNG to optimized JPEG
      const rawBase64 = `data:image/png;base64,${data}`;
      return await compressImage(rawBase64, 0.85);
  } catch (error: any) {
      console.warn("Primary image generation failed, trying fallback model...", error?.message);

      try {
          const fallbackResponse = await ai.models.generateContent({
            model: MODEL_IMAGE_GEN_FALLBACK,
            contents: { parts: promptParts },
            config: { imageConfig: { aspectRatio } },
          });

          const data = fallbackResponse?.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData)?.inlineData?.data;
          if (!data) {
              console.error("Fallback response structure:", JSON.stringify(fallbackResponse?.candidates?.[0], null, 2));
              throw new Error("Image generation failed - no image data in response");
          }

          // COMPRESSION STEP
          const rawBase64 = `data:image/png;base64,${data}`;
          return await compressImage(rawBase64, 0.85);
      } catch (fallbackError: any) {
          console.error("Fallback image generation also failed:", fallbackError?.message);
          throw new Error(`Image generation failed: ${error?.message || 'Unknown error'}. Fallback also failed: ${fallbackError?.message || 'Unknown error'}`);
      }
  }
};

export const generateSpeech = async (text: string, voiceName: string = 'Puck'): Promise<ArrayBuffer> => {
  const ai = getAi();
  const response = await ai.models.generateContent({
    model: MODEL_TTS,
    contents: [{ parts: [{ text }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
    },
  });
  const data = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!data) throw new Error("Speech synthesis failed");
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
};

export const createWavBlob = (audioData: ArrayBuffer, sampleRate: number = 24000): Blob => {
  const dataLen = audioData.byteLength;
  const buffer = new ArrayBuffer(44 + dataLen);
  const view = new DataView(buffer);
  const writeString = (v: DataView, o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataLen, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataLen, true);
  new Uint8Array(buffer, 44).set(new Uint8Array(audioData));
  return new Blob([buffer], { type: 'audio/wav' });
};

// ============================================================================
// BEAT MAKER - Character Extraction & Sheet Generation
// ============================================================================

export interface ExtractedCharacter {
    id: string;
    name: string;
    role: string; // e.g., "protagonist", "antagonist", "supporting"
    appearance: string; // Physical description
    clothing: string; // Default/initial clothing
    personality: string; // Brief personality traits for expression guidance
}

export interface CharacterSheet {
    character: ExtractedCharacter;
    sheetImageUrl: string;
}

/**
 * Extract characters from story text
 * Returns a list of unique characters with their descriptions
 */
export const extractCharactersFromStory = async (
    storyText: string
): Promise<ExtractedCharacter[]> => {
    const ai = getAi();

    const schema = {
        type: Type.OBJECT,
        properties: {
            characters: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        id: { type: Type.STRING, description: "Unique ID like 'char-protagonist' or 'char-minho'" },
                        name: {
                            type: Type.STRING,
                            description: "Character name. If unnamed, use descriptive name like 'Protagonist', 'The Woman', 'Office Worker', 'Intruder'"
                        },
                        role: {
                            type: Type.STRING,
                            enum: ['protagonist', 'antagonist', 'supporting', 'background'],
                            description: "Role in the story"
                        },
                        appearance: {
                            type: Type.STRING,
                            description: "Detailed physical appearance: age, gender, ethnicity, hair (color, style, length), eye color, face shape, body type, height, distinguishing features"
                        },
                        clothing: {
                            type: Type.STRING,
                            description: "Default/initial clothing when first introduced. Be VERY specific: colors, style, accessories. E.g., 'Gray pencil skirt suit with white blouse, black heels, brown leather handbag'"
                        },
                        personality: {
                            type: Type.STRING,
                            description: "Key personality traits that affect expressions/poses. E.g., 'Reserved, serious, independent' or 'Energetic, cheerful, clumsy'"
                        }
                    },
                    required: ["id", "name", "role", "appearance", "clothing", "personality"]
                }
            }
        },
        required: ["characters"]
    };

    const systemInstruction = `You are a Character Designer for a Manhwa/Webtoon production.

Your job is to extract ALL characters from the story text and create detailed character profiles.

=== CHARACTER EXTRACTION RULES ===
1. Extract EVERY character mentioned or implied in the story
2. For unnamed characters, create descriptive names like "The Protagonist", "The Intruder", "Office Colleague"
3. The NAME must be clear and identifiable - it will be displayed on the character reference sheet

=== APPEARANCE GUIDELINES ===
Be EXTREMELY specific about:
- Age range (20s, 30s, etc.)
- Gender
- Ethnicity/skin tone
- Hair: color, style, length (e.g., "Black hair in a low bun", "Short silver-gray hair")
- Face: shape, notable features
- Body: build, height
- Any distinguishing marks or features

=== CLOTHING GUIDELINES ===
Describe the CHARACTER'S SIGNATURE OUTFIT in detail:
- For "office worker": specify exact colors and style
- E.g., "Dark gray fitted blazer and matching pencil skirt, white silk blouse, sheer black stockings, black kitten heels, brown leather structured handbag"
- This will be used as their DEFAULT look in the character sheet`;

    const response = await ai.models.generateContent({
        model: MODEL_TEXT_ANALYSIS,
        contents: `Extract all characters from this story:

${storyText}

For each character, provide detailed physical description and their signature clothing.
If a character is unnamed (like "I" or "the woman"), give them a descriptive name.`,
        config: {
            responseMimeType: "application/json",
            responseSchema: schema,
            systemInstruction
        }
    });

    const result = JSON.parse(response.text || "{}");
    console.log("👤 Characters extracted:", result.characters?.length || 0);

    return result.characters || [];
};

/**
 * Generate a character reference sheet image
 * The image will include the character name as a label
 */
export const generateCharacterSheet = async (
    character: ExtractedCharacter,
    artStyle: string = "Korean Manhwa/Webtoon style"
): Promise<string> => {
    const ai = getAi();

    // Create a comprehensive character sheet prompt
    const sheetPrompt = `Create a CHARACTER REFERENCE SHEET for "${character.name}".

=== LAYOUT ===
A 2x2 grid showing the character in 4 different views:
- Top Left: FULL BODY FRONT VIEW - Standing pose, facing camera
- Top Right: FULL BODY SIDE PROFILE - Standing, showing silhouette
- Bottom Left: FULL BODY 3/4 VIEW - Dynamic three-quarter angle
- Bottom Right: FACE CLOSE-UP - Head and shoulders, showing expression

=== CHARACTER DETAILS ===
Name: ${character.name}
Role: ${character.role}
Appearance: ${character.appearance}
Clothing: ${character.clothing}
Personality: ${character.personality}

=== VISUAL REQUIREMENTS ===
- ALL 4 VIEWS must show the EXACT SAME character with CONSISTENT appearance
- Same hair color, eye color, face shape, body type across all views
- Same clothing in all views (except face close-up which shows upper body)
- Clean, white/light gray background
- Professional character sheet layout
- High detail on face and clothing

=== IMPORTANT: CHARACTER NAME LABEL ===
Include the text "${character.name}" as a clear label at the TOP of the image.
This label is CRITICAL for identification.`;

    const systemInstruction = `You are creating a professional character reference sheet for manhwa/webtoon production.

STYLE: ${artStyle}
QUALITY: High detail, clean lines, professional illustration

CRITICAL REQUIREMENTS:
1. The character must look IDENTICAL in all 4 views (consistency is paramount)
2. Include the character's NAME as text at the top of the sheet
3. White/neutral background - this is a REFERENCE SHEET, not a scene
4. Show clear details of clothing, hair, and facial features
5. Expression should match the character's personality`;

    const parts: any[] = [];
    parts.push({ text: sheetPrompt });

    try {
        const response = await ai.models.generateContent({
            model: MODEL_IMAGE_GEN,
            contents: { parts },
            config: {
                imageConfig: {
                    aspectRatio: AspectRatio.LANDSCAPE,  // Landscape for reference sheet layout
                    imageSize: ImageSize.K2 // Higher quality for reference
                },
                systemInstruction
            }
        });

        const data = response.candidates?.[0].content.parts.find((p: any) => p.inlineData)?.inlineData?.data;
        if (!data) throw new Error("No image data");

        const rawBase64 = `data:image/png;base64,${data}`;
        return await compressImage(rawBase64, 0.9); // Less compression for reference sheet quality

    } catch (error: any) {
        console.error("Character sheet generation failed, trying fallback...", error);

        // Fallback to simpler prompt
        const fallbackResponse = await ai.models.generateContent({
            model: MODEL_IMAGE_GEN_FALLBACK,
            contents: { parts },
            config: {
                imageConfig: { aspectRatio: AspectRatio.LANDSCAPE }
            }
        });

        const data = fallbackResponse.candidates?.[0].content.parts.find((p: any) => p.inlineData)?.inlineData?.data;
        if (!data) throw new Error("Character sheet generation failed");

        const rawBase64 = `data:image/png;base64,${data}`;
        return await compressImage(rawBase64, 0.9);
    }
};

// ============================================================================
// BEAT MAKER - AI-Powered Progressive Beat Analysis
// ============================================================================

export interface BeatAnalysisResult {
    id: string;
    beatIndex: number;
    text: string;
    isSilent: boolean;

    // AI Analysis Results
    characters: string[];
    sameEnvironmentAsPrevious: boolean;
    environmentDescription: string;
    clothingState: string;
    cameraAngle: string;
    backgroundType: string;

    // AI Generated Prompt
    visualPrompt: string;

    // Reasoning (for transparency)
    analysisReasoning: string;
}

export interface BeatMakerAnalysisResponse {
    sourceLanguage: string;
    totalBeats: number;
    beats: BeatAnalysisResult[];
}

/**
 * AI-Powered Beat Analysis
 * Takes raw story text and analyzes it progressively, beat by beat.
 * Each beat is analyzed considering the previous beat's context.
 */
export const analyzeBeatsMaker = async (
    storyText: string,
    previousBeatImage?: string
): Promise<BeatMakerAnalysisResponse> => {
    const ai = getAi();

    const schema = {
        type: Type.OBJECT,
        properties: {
            sourceLanguage: {
                type: Type.STRING,
                description: "Detected language of the input text (e.g., 'English', 'Portuguese', 'Japanese')"
            },
            totalBeats: { type: Type.INTEGER },
            beats: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        id: { type: Type.STRING },
                        beatIndex: { type: Type.INTEGER },
                        text: {
                            type: Type.STRING,
                            description: "The dialogue/narration for this beat. Empty string for silent beats."
                        },
                        isSilent: {
                            type: Type.BOOLEAN,
                            description: "True if this is a silent beat (no dialogue, just visual)"
                        },
                        characters: {
                            type: Type.ARRAY,
                            items: { type: Type.STRING },
                            description: "List of character names present in this beat"
                        },
                        sameEnvironmentAsPrevious: {
                            type: Type.BOOLEAN,
                            description: "Is this beat in the same location as the previous beat?"
                        },
                        environmentDescription: {
                            type: Type.STRING,
                            description: "Description of the environment/location"
                        },
                        clothingState: {
                            type: Type.STRING,
                            description: "What the character(s) are wearing. Must be specific (e.g., 'Blue pajamas', 'Business suit with red tie')"
                        },
                        cameraAngle: {
                            type: Type.STRING,
                            enum: ['OVER_SHOULDER', 'SIDE_PROFILE', 'THREE_QUARTER', 'LOW_ANGLE', 'HIGH_ANGLE', 'DUTCH_ANGLE', 'POV', 'BIRDS_EYE', 'WORMS_EYE', 'FRONTAL'],
                            description: "Camera angle for this beat"
                        },
                        backgroundType: {
                            type: Type.STRING,
                            enum: ['DETAILED', 'BOKEH', 'GRADIENT', 'SPEEDLINES', 'SPLIT', 'WHITE'],
                            description: "Background rendering strategy"
                        },
                        visualPrompt: {
                            type: Type.STRING,
                            description: "Detailed visual prompt in ENGLISH (minimum 4-6 sentences). Describe the scene, characters, poses, expressions, lighting, etc."
                        },
                        analysisReasoning: {
                            type: Type.STRING,
                            description: "Brief explanation of why you made these choices (camera angle, background type, etc.)"
                        }
                    },
                    required: ["id", "beatIndex", "text", "isSilent", "characters", "sameEnvironmentAsPrevious", "environmentDescription", "clothingState", "cameraAngle", "backgroundType", "visualPrompt", "analysisReasoning"]
                }
            }
        },
        required: ["sourceLanguage", "totalBeats", "beats"]
    };

    const systemInstruction = `You are a Senior Manhwa Storyboard Director. Your job is to analyze story text and break it into BEATS for illustration.

=== WHAT IS A BEAT? ===
A beat is a single panel/moment in a manhwa. Each beat should be:
- 1-3 sentences of dialogue/narration, OR
- A SILENT beat (no text, just a visual moment)

=== PROGRESSIVE ANALYSIS RULES ===
For EACH beat, you must analyze it considering the PREVIOUS beat:

1. **CHARACTERS**: Who is in the scene? List all characters present.

2. **ENVIRONMENT**:
   - Is this the SAME location as the previous beat? (sameEnvironmentAsPrevious)
   - Describe the environment in detail
   - If it's a new location, mark sameEnvironmentAsPrevious = false

3. **CLOTHING STATE** (CRITICAL):
   - What is each character wearing?
   - If the previous beat established clothing, it MUST stay the same unless the text explicitly mentions changing
   - Be SPECIFIC: "Blue silk pajamas" not just "pajamas"
   - Track state: "Just woke up - messy hair, nightgown" or "Business meeting - formal suit"

4. **CAMERA ANGLE**:
   - FRONTAL: Use sparingly (max 20%) - only for direct emotional impact
   - THREE_QUARTER: Most versatile, use often (30%)
   - OVER_SHOULDER: Great for dialogue between characters
   - SIDE_PROFILE: Emotional moments, contemplation
   - LOW_ANGLE: Power, drama
   - HIGH_ANGLE: Vulnerability
   - DUTCH_ANGLE: Tension, unease
   - POV: Showing what character sees
   - BIRDS_EYE: Establishing shots

5. **BACKGROUND TYPE**:
   - DETAILED: Only for first panel of NEW location (establishing shot)
   - BOKEH: Default for most dialogue (blurred background)
   - GRADIENT: Emotional moments
   - SPEEDLINES: Action, shock, dramatic reveals
   - SPLIT: Two simultaneous scenes (phone calls, etc.)
   - WHITE: Almost never use

6. **SILENT BEATS**:
   - Insert silent beats (isSilent=true, text="") for:
     * Reaction shots before important dialogue
     * Dramatic pauses
     * Scene transitions
     * Character emotions without words
   - Aim for 1 silent beat per 3-4 dialogue beats

7. **VISUAL PROMPT**:
   - Must be in ENGLISH
   - Minimum 4-6 sentences
   - Include: character appearance, pose, expression, clothing, environment details, lighting, mood
   - Be specific and detailed

=== EXAMPLE FLOW ===
Beat 1: [DETAILED, BIRDS_EYE] "I am a woman who lives alone..." - Establishing shot of apartment
Beat 2: [SILENT, BOKEH, THREE_QUARTER] - Character waking up in bed, stretching
Beat 3: [BOKEH, THREE_QUARTER] "The alarm went off..." - Close on character with alarm clock
Beat 4: [SILENT, GRADIENT, SIDE_PROFILE] - Character staring out window, contemplative
Beat 5: [BOKEH, OVER_SHOULDER] "I work an office job..." - Character looking at mirror/reflection`;

    const userPrompt = `Analyze this story text and break it into beats for manhwa illustration:

=== STORY TEXT ===
${storyText}

=== INSTRUCTIONS ===
1. Break the text into beats (1-3 sentences each)
2. Insert silent beats where appropriate for pacing
3. For EACH beat, analyze: characters, environment, clothing, camera angle, background type
4. Generate a detailed visual prompt (in English) for each beat
5. Track continuity - if a character was wearing pajamas, they stay in pajamas until text says otherwise

Return the structured beat analysis.`;

    const parts: any[] = [];

    // If we have a previous beat image, include it for visual continuity reference
    if (previousBeatImage) {
        const base64Data = previousBeatImage.includes(',') ? previousBeatImage.split(',')[1] : previousBeatImage;
        parts.push({ text: "PREVIOUS BEAT IMAGE (for visual continuity reference):" });
        parts.push({ inlineData: { mimeType: 'image/png', data: base64Data } });
    }

    parts.push({ text: userPrompt });

    const response = await ai.models.generateContent({
        model: MODEL_TEXT_ANALYSIS,
        contents: { parts },
        config: {
            responseMimeType: "application/json",
            responseSchema: schema,
            systemInstruction,
            thinkingConfig: { thinkingBudget: 8192 }
        }
    });

    const result = JSON.parse(response.text || "{}");

    console.log("🎬 Beat Maker Analysis Complete:", result.totalBeats, "beats generated");
    console.log("📝 Beats:", result.beats?.map((b: any) => ({
        index: b.beatIndex,
        silent: b.isSilent,
        camera: b.cameraAngle,
        bg: b.backgroundType,
        text: b.text?.slice(0, 50) + '...'
    })));

    return result;
};

/**
 * Analyze a single beat with context from previous beat
 * Used for step-by-step progressive analysis
 */
export const analyzeSingleBeat = async (
    beatText: string,
    beatIndex: number,
    previousBeatAnalysis?: BeatAnalysisResult,
    previousBeatImage?: string
): Promise<BeatAnalysisResult> => {
    const ai = getAi();

    const schema = {
        type: Type.OBJECT,
        properties: {
            characters: { type: Type.ARRAY, items: { type: Type.STRING } },
            sameEnvironmentAsPrevious: { type: Type.BOOLEAN },
            environmentDescription: { type: Type.STRING },
            clothingState: { type: Type.STRING },
            cameraAngle: {
                type: Type.STRING,
                enum: ['OVER_SHOULDER', 'SIDE_PROFILE', 'THREE_QUARTER', 'LOW_ANGLE', 'HIGH_ANGLE', 'DUTCH_ANGLE', 'POV', 'BIRDS_EYE', 'WORMS_EYE', 'FRONTAL']
            },
            backgroundType: {
                type: Type.STRING,
                enum: ['DETAILED', 'BOKEH', 'GRADIENT', 'SPEEDLINES', 'SPLIT', 'WHITE']
            },
            visualPrompt: { type: Type.STRING },
            analysisReasoning: { type: Type.STRING }
        },
        required: ["characters", "sameEnvironmentAsPrevious", "environmentDescription", "clothingState", "cameraAngle", "backgroundType", "visualPrompt", "analysisReasoning"]
    };

    const previousContext = previousBeatAnalysis ? `
=== PREVIOUS BEAT CONTEXT ===
- Characters: ${previousBeatAnalysis.characters.join(', ')}
- Environment: ${previousBeatAnalysis.environmentDescription}
- Clothing: ${previousBeatAnalysis.clothingState}
- Camera Angle: ${previousBeatAnalysis.cameraAngle}
- Background: ${previousBeatAnalysis.backgroundType}
` : "This is the FIRST beat - establish the scene.";

    const systemInstruction = `You are analyzing beat #${beatIndex + 1} of a manhwa storyboard.

${previousContext}

=== CONTINUITY RULES ===
1. If previous beat had character wearing "${previousBeatAnalysis?.clothingState || 'unknown'}", maintain the SAME clothing unless text says otherwise
2. If same location, sameEnvironmentAsPrevious = true
3. Vary camera angles - avoid repeating the same angle twice in a row
4. Use DETAILED background only for first panel of a NEW location

Generate detailed analysis for this beat.`;

    const parts: any[] = [];

    if (previousBeatImage) {
        const base64Data = previousBeatImage.includes(',') ? previousBeatImage.split(',')[1] : previousBeatImage;
        parts.push({ text: "Previous beat image for continuity:" });
        parts.push({ inlineData: { mimeType: 'image/png', data: base64Data } });
    }

    parts.push({ text: `Analyze this beat text:\n"${beatText}"` });

    const response = await ai.models.generateContent({
        model: MODEL_TEXT_ANALYSIS,
        contents: { parts },
        config: {
            responseMimeType: "application/json",
            responseSchema: schema,
            systemInstruction
        }
    });

    const result = JSON.parse(response.text || "{}");

    return {
        id: `beat-${beatIndex}`,
        beatIndex,
        text: beatText,
        isSilent: !beatText || beatText.trim().length === 0,
        ...result
    };
};

/**
 * Analyze image to detect faces, bodies, and existing text/elements
 * This helps avoid placing speech bubbles over important visual elements
 */
const analyzeImageForSafeBubbleZones = async (imageUrl: string): Promise<any> => {
    const ai = getAi();

    const analysisSchema = {
        type: Type.OBJECT,
        properties: {
            faces: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        position: { type: Type.STRING, description: "Location description like 'left side', 'center', 'right side'" },
                        boundingBox: {
                            type: Type.OBJECT,
                            properties: {
                                x: { type: Type.NUMBER, description: "X center as percentage (0-100)" },
                                y: { type: Type.NUMBER, description: "Y center as percentage (0-100)" },
                                width: { type: Type.NUMBER, description: "Width as percentage" },
                                height: { type: Type.NUMBER, description: "Height as percentage" }
                            }
                        }
                    }
                }
            },
            bodies: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        position: { type: Type.STRING },
                        boundingBox: {
                            type: Type.OBJECT,
                            properties: {
                                x: { type: Type.NUMBER },
                                y: { type: Type.NUMBER },
                                width: { type: Type.NUMBER },
                                height: { type: Type.NUMBER }
                            }
                        }
                    }
                }
            },
            existingText: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        text: { type: Type.STRING, description: "Text already in the image" },
                        position: {
                            type: Type.OBJECT,
                            properties: {
                                x: { type: Type.NUMBER },
                                y: { type: Type.NUMBER }
                            }
                        }
                    }
                },
                description: "Any text, numbers, or labels already visible in the image"
            },
            safeZones: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        description: { type: Type.STRING, description: "Description like 'top-left corner', 'bottom center', 'left margin'" },
                        boundingBox: {
                            type: Type.OBJECT,
                            properties: {
                                x: { type: Type.NUMBER },
                                y: { type: Type.NUMBER },
                                width: { type: Type.NUMBER },
                                height: { type: Type.NUMBER }
                            }
                        },
                        priority: { type: Type.NUMBER, description: "1-10, higher is better for bubble placement" }
                    }
                },
                description: "Empty areas safe for placing speech bubbles"
            }
        },
        required: ["faces", "bodies", "existingText", "safeZones"]
    };

    const base64Data = imageUrl.includes(',') ? imageUrl.split(',')[1] : imageUrl;

    const response = await ai.models.generateContent({
        model: MODEL_TEXT_ANALYSIS,
        contents: {
            parts: [
                { inlineData: { mimeType: 'image/png', data: base64Data } },
                { text: `CRITICAL ANALYSIS: Analyze this manhwa/webtoon panel image in EXTREME detail.

Your task is to map out the image so we can place speech bubbles WITHOUT covering faces or important elements.

ANALYZE:
1. **FACES**: Find every face/head. Give precise bounding boxes (x, y, width, height as percentages).
2. **BODIES**: Find character bodies/torsos. Give bounding boxes.
3. **EXISTING TEXT/NUMBERS**: Detect ANY text, numbers, labels already in the image (like "0%", "12%", signs, etc.). We must NOT duplicate this text!
4. **SAFE ZONES**: Identify EMPTY areas (backgrounds, sky, edges, margins) where bubbles can go without covering anything important.

For safe zones, prioritize:
- Corners and edges (if empty)
- Background areas (sky, walls, empty space)
- Areas between characters
- Top/bottom margins

Rate each safe zone 1-10 (10 = perfect, lots of space; 1 = tight fit)` }
            ]
        },
        config: {
            responseMimeType: "application/json",
            responseSchema: analysisSchema,
            thinkingConfig: { thinkingBudget: 4096 }
        }
    });

    return JSON.parse(response.text || '{"faces": [], "bodies": [], "existingText": [], "safeZones": []}');
};

/**
 * Generate Speech Bubbles for a webtoon panel
 * Uses 2-phase approach: analyze image first, then position bubbles safely
 */
export const generateSpeechBubbles = async (
    imageUrl: string,
    dialogueText: string,
    characters: string[],
    beatContext?: string
): Promise<{ speechBubbles: any[] }> => {
    const ai = getAi();

    // PHASE 1: Analyze image to find safe zones
    console.log('📸 Phase 1: Analyzing image for safe bubble placement zones...');
    const imageAnalysis = await analyzeImageForSafeBubbleZones(imageUrl);
    console.log(`✅ Found ${imageAnalysis.faces.length} faces, ${imageAnalysis.existingText.length} existing text elements, ${imageAnalysis.safeZones.length} safe zones`);

    // PHASE 2: Generate bubbles using safe zones
    const schema = {
        type: Type.OBJECT,
        properties: {
            speechBubbles: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        id: { type: Type.STRING, description: "Unique ID like 'bubble-1'" },
                        speaker: { type: Type.STRING, description: "Character name or 'narrator'" },
                        text: { type: Type.STRING, description: "The dialogue text" },
                        position: {
                            type: Type.OBJECT,
                            properties: {
                                x: { type: Type.NUMBER, description: "X coordinate as percentage (0-100)" },
                                y: { type: Type.NUMBER, description: "Y coordinate as percentage (0-100)" }
                            },
                            required: ["x", "y"]
                        },
                        bubbleType: {
                            type: Type.STRING,
                            enum: ['speech', 'thought', 'narration', 'shout', 'whisper', 'scream'],
                            description: "Type of speech bubble"
                        },
                        tailDirection: {
                            type: Type.STRING,
                            enum: ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'left', 'right', 'none'],
                            description: "Direction the bubble tail points towards the speaker"
                        },
                        size: {
                            type: Type.OBJECT,
                            properties: {
                                width: { type: Type.NUMBER, description: "Estimated width as percentage (15-35)" },
                                height: { type: Type.NUMBER, description: "Estimated height as percentage (10-25)" }
                            },
                            required: ["width", "height"]
                        },
                        style: {
                            type: Type.OBJECT,
                            properties: {
                                backgroundColor: { type: Type.STRING, description: "Hex color like #ffffff" },
                                borderColor: { type: Type.STRING, description: "Hex color like #000000" },
                                textColor: { type: Type.STRING, description: "Hex color like #000000" },
                                fontSize: { type: Type.NUMBER, description: "Relative size (0.8-1.3)" }
                            }
                        },
                        order: { type: Type.NUMBER, description: "Reading order (1, 2, 3...)" }
                    },
                    required: ["id", "speaker", "text", "position", "bubbleType", "tailDirection", "size", "order"]
                }
            }
        },
        required: ["speechBubbles"]
    };

    // Build system instruction with analysis data
    const facesInfo = imageAnalysis.faces.length > 0
        ? `\n=== FACES TO AVOID ===\n${imageAnalysis.faces.map((f: any, i: number) =>
            `Face ${i + 1}: ${f.position} (x:${f.boundingBox.x}%, y:${f.boundingBox.y}%, w:${f.boundingBox.width}%, h:${f.boundingBox.height}%)`
        ).join('\n')}\nNEVER place bubbles over these areas!`
        : '';

    const existingTextInfo = imageAnalysis.existingText.length > 0
        ? `\n=== TEXT ALREADY IN IMAGE ===\n${imageAnalysis.existingText.map((t: any) =>
            `"${t.text}" at (x:${t.position.x}%, y:${t.position.y}%)`
        ).join('\n')}\nDO NOT duplicate this text in your bubbles!`
        : '';

    const safeZonesInfo = imageAnalysis.safeZones.length > 0
        ? `\n=== SAFE ZONES (USE THESE!) ===\n${imageAnalysis.safeZones.map((z: any) =>
            `Zone: ${z.description} (x:${z.boundingBox.x}%, y:${z.boundingBox.y}%, w:${z.boundingBox.width}%, h:${z.boundingBox.height}%) - Priority: ${z.priority}/10`
        ).join('\n')}\nPrioritize high-priority zones!`
        : '';

    const systemInstruction = `You are a professional Webtoon Speech Bubble Designer.

IMAGE ANALYSIS RESULTS:
${facesInfo}
${existingTextInfo}
${safeZonesInfo}

CRITICAL PLACEMENT RULES:
1. **MUST USE SAFE ZONES**: Position bubbles ONLY in the safe zones identified above
2. **NEVER cover faces**: Avoid all face bounding boxes by at least 15% margin
3. **DO NOT duplicate existing text**: If text/numbers already exist in the image, don't add them again
4. **USE APPROPRIATE SIZES**:
   - Short text (1-30 chars): width 20-25%, height 12-18%
   - Medium text (31-60 chars): width 28-35%, height 18-25%
   - Long text (61+ chars): width 35-45%, height 25-35%
5. **MAXIMUM 3 BUBBLES per panel**: Don't create too many small bubbles, combine into fewer larger ones
6. **SPREAD BUBBLES OUT**: Maintain at least 20% distance between bubble centers
7. **AVOID BOTTOM 15%**: Don't place bubbles in the very bottom of the image

READING ORDER (Korean Webtoon):
- Top to bottom flow
- If multiple bubbles at same height, left-to-right
- Number them: 1, 2, 3...

BUBBLE TYPES:
- 'speech': Normal dialogue (rounded bubble)
- 'thought': Internal thoughts (cloud-style)
- 'narration': Narrator text (rectangular, no tail)
- 'shout': Loud speech (use for exclamations)
- 'whisper': Quiet speech

TAIL DIRECTION - MUST POINT TO SPEAKER'S MOUTH:
1. Identify where the speaker's FACE/MOUTH is in the image
2. Determine bubble position relative to face:
   - If bubble is ABOVE-LEFT of face → tail points 'bottom-right' (towards face below-right)
   - If bubble is ABOVE-RIGHT of face → tail points 'bottom-left' (towards face below-left)
   - If bubble is BELOW-LEFT of face → tail points 'top-right' (towards face above-right)
   - If bubble is BELOW-RIGHT of face → tail points 'top-left' (towards face above-left)
   - If bubble is DIRECTLY LEFT of face → tail points 'right' (towards face)
   - If bubble is DIRECTLY RIGHT of face → tail points 'left' (towards face)
   - If bubble is DIRECTLY ABOVE face → tail points down (use 'bottom-left' or 'bottom-right')
   - If bubble is DIRECTLY BELOW face → tail points up (use 'top-left' or 'top-right')
3. For NARRATOR boxes or off-screen speakers → use 'none'

EXAMPLE: If speaker's face is at (40%, 60%) and bubble is at (20%, 30%):
- Bubble is LEFT and ABOVE the face
- Tail should point 'bottom-right' (towards the face)

SIZE GUIDELINES - CALCULATE BASED ON TEXT LENGTH:
- Very short (1-10 chars): width 15-18%, height 12-15%
- Short (11-25 chars): width 20-25%, height 15-18%
- Medium (26-50 chars): width 25-30%, height 18-22%
- Long (51-80 chars): width 30-35%, height 22-28%
- Very long (80+ chars): width 35-40%, height 28-35% OR split into multiple bubbles

CRITICAL: Ensure bubbles are LARGE ENOUGH to fit all text comfortably. Better too big than text overflowing!

Characters: ${characters.join(', ')}
${beatContext ? `Context: ${beatContext}` : ''}

IMPORTANT: Split dialogue intelligently into 2-3 smaller bubbles if it's too long.`;

    const base64Data = imageUrl.includes(',') ? imageUrl.split(',')[1] : imageUrl;

    // Build detailed face positions for tail direction calculation
    const facePositionsText = imageAnalysis.faces.length > 0
        ? `\n\nFACE POSITIONS (for tail direction):\n${imageAnalysis.faces.map((f: any, i: number) =>
            `Face ${i + 1}: Center at (${f.boundingBox.x}%, ${f.boundingBox.y}%) - ${f.position}`
        ).join('\n')}`
        : '';

    const parts: any[] = [
        { inlineData: { mimeType: 'image/png', data: base64Data } },
        { text: `Using the safe zones identified above, place speech bubbles for this dialogue:

"${dialogueText}"

REQUIREMENTS:
1. Place bubbles ONLY in safe zones identified above
2. DO NOT cover faces (avoid all face bounding boxes)
3. Calculate bubble size based on text length - ensure text fits comfortably
4. For each bubble, determine tail direction by:
   a. Identifying which character is speaking
   b. Finding that character's face position from the list above
   c. Calculating tail direction so it points FROM bubble CENTER TO face position
${facePositionsText}

Make bubbles LARGE ENOUGH for text. Better too big than text overflowing!` }
    ];

    const response = await ai.models.generateContent({
        model: MODEL_TEXT_ANALYSIS,
        contents: { parts },
        config: {
            responseMimeType: "application/json",
            responseSchema: schema,
            systemInstruction,
            thinkingConfig: { thinkingBudget: 4096 }
        }
    });

    const result = JSON.parse(response.text || '{"speechBubbles": []}');

    // Post-process: Comprehensive validation and adjustment
    if (result.speechBubbles && result.speechBubbles.length > 0) {
        // Limit to max 3-4 bubbles per panel - combine if more
        if (result.speechBubbles.length > 4) {
            console.log(`⚠️ Too many bubbles (${result.speechBubbles.length}), combining...`);
            result.speechBubbles = combineBubbles(result.speechBubbles, 3);
        }
        result.speechBubbles = validateAndAdjustBubbles(result.speechBubbles);
    }

    console.log(`💬 Generated ${result.speechBubbles?.length || 0} speech bubbles for panel`);

    return result;
};

/**
 * Combine multiple bubbles into fewer bubbles when there are too many
 */
const combineBubbles = (bubbles: any[], maxBubbles: number): any[] => {
    if (bubbles.length <= maxBubbles) return bubbles;

    // Sort by reading order
    const sorted = [...bubbles].sort((a, b) => a.order - b.order);

    // Combine into maxBubbles groups
    const combined: any[] = [];
    const groupSize = Math.ceil(sorted.length / maxBubbles);

    for (let i = 0; i < maxBubbles; i++) {
        const start = i * groupSize;
        const end = Math.min(start + groupSize, sorted.length);
        const group = sorted.slice(start, end);

        if (group.length === 0) continue;

        // Combine texts
        const combinedText = group.map(b => b.text).join(' ');

        // Use first bubble's properties as base
        const base = group[0];

        combined.push({
            ...base,
            id: `bubble-combined-${i + 1}`,
            text: combinedText,
            order: i + 1,
            // Prefer narration type for combined text
            bubbleType: group.some(b => b.bubbleType === 'narration') ? 'narration' : base.bubbleType
        });
    }

    return combined;
};

/**
 * Comprehensive bubble validation and adjustment
 * Ensures bubbles fit text, don't overlap, and stay within image bounds
 */
const validateAndAdjustBubbles = (bubbles: any[]): any[] => {
    const PADDING = 5; // Margin from image edges (%)
    const MIN_GAP = 3; // Minimum gap between bubbles (%)

    // Step 1: Calculate proper sizes based on text length
    let adjustedBubbles = bubbles.map((bubble: any) => {
        const textLength = bubble.text.length;
        const wordCount = bubble.text.split(/\s+/).length;

        // More aggressive size calculation
        // Estimate: ~6-8 characters per line, ~20px per line height
        const charsPerLine = 15; // Conservative estimate
        const estimatedLines = Math.ceil(textLength / charsPerLine);

        let width: number;
        let height: number;

        if (textLength <= 15) {
            width = 18;
            height = 12;
        } else if (textLength <= 30) {
            width = 25;
            height = 15;
        } else if (textLength <= 50) {
            width = 30;
            height = Math.max(18, estimatedLines * 5);
        } else if (textLength <= 80) {
            width = 35;
            height = Math.max(22, estimatedLines * 5);
        } else if (textLength <= 120) {
            width = 40;
            height = Math.max(28, estimatedLines * 5);
        } else {
            width = 45;
            height = Math.max(35, estimatedLines * 5);
        }

        // Cap maximum sizes
        width = Math.min(width, 50);
        height = Math.min(height, 45);

        return {
            ...bubble,
            size: {
                width: Math.max(bubble.size?.width || 0, width),
                height: Math.max(bubble.size?.height || 0, height)
            }
        };
    });

    // Step 2: Ensure bubbles stay within image bounds
    adjustedBubbles = adjustedBubbles.map((bubble: any) => {
        let { x, y } = bubble.position;
        const halfWidth = bubble.size.width / 2;
        const halfHeight = bubble.size.height / 2;

        // Keep bubble inside image with padding
        x = Math.max(halfWidth + PADDING, Math.min(100 - halfWidth - PADDING, x));
        y = Math.max(halfHeight + PADDING, Math.min(100 - halfHeight - PADDING, y));

        return {
            ...bubble,
            position: { x, y }
        };
    });

    // Step 3: Resolve overlaps by repositioning bubbles
    adjustedBubbles = resolveOverlaps(adjustedBubbles, MIN_GAP);

    // Step 4: Final bounds check after repositioning
    adjustedBubbles = adjustedBubbles.map((bubble: any) => {
        let { x, y } = bubble.position;
        const halfWidth = bubble.size.width / 2;
        const halfHeight = bubble.size.height / 2;

        x = Math.max(halfWidth + PADDING, Math.min(100 - halfWidth - PADDING, x));
        y = Math.max(halfHeight + PADDING, Math.min(100 - halfHeight - PADDING, y));

        return {
            ...bubble,
            position: { x, y }
        };
    });

    return adjustedBubbles;
};

/**
 * Detect and resolve overlaps between bubbles
 */
const resolveOverlaps = (bubbles: any[], minGap: number): any[] => {
    const result = [...bubbles];

    // Sort by reading order (top to bottom, left to right)
    result.sort((a, b) => {
        if (Math.abs(a.position.y - b.position.y) < 10) {
            return a.position.x - b.position.x;
        }
        return a.position.y - b.position.y;
    });

    // Check each pair of bubbles for overlap
    for (let i = 0; i < result.length; i++) {
        for (let j = i + 1; j < result.length; j++) {
            const b1 = result[i];
            const b2 = result[j];

            if (bubblesOverlap(b1, b2, minGap)) {
                // Move b2 to avoid overlap
                const moved = findNonOverlappingPosition(b2, result.slice(0, j), minGap);
                result[j] = moved;
            }
        }
    }

    return result;
};

/**
 * Check if two bubbles overlap (including minimum gap)
 */
const bubblesOverlap = (b1: any, b2: any, minGap: number): boolean => {
    const left1 = b1.position.x - b1.size.width / 2 - minGap;
    const right1 = b1.position.x + b1.size.width / 2 + minGap;
    const top1 = b1.position.y - b1.size.height / 2 - minGap;
    const bottom1 = b1.position.y + b1.size.height / 2 + minGap;

    const left2 = b2.position.x - b2.size.width / 2;
    const right2 = b2.position.x + b2.size.width / 2;
    const top2 = b2.position.y - b2.size.height / 2;
    const bottom2 = b2.position.y + b2.size.height / 2;

    return !(left2 > right1 || right2 < left1 || top2 > bottom1 || bottom2 < top1);
};

/**
 * Find a new position for a bubble that doesn't overlap with existing bubbles
 */
const findNonOverlappingPosition = (bubble: any, existingBubbles: any[], minGap: number): any => {
    const originalX = bubble.position.x;
    const originalY = bubble.position.y;

    // Try different positions: down, right, left, up
    const offsets = [
        { dx: 0, dy: 15 },   // Move down
        { dx: 20, dy: 0 },   // Move right
        { dx: -20, dy: 0 },  // Move left
        { dx: 0, dy: -15 },  // Move up
        { dx: 15, dy: 15 },  // Diagonal down-right
        { dx: -15, dy: 15 }, // Diagonal down-left
        { dx: 0, dy: 25 },   // Move further down
        { dx: 0, dy: -25 },  // Move further up
    ];

    for (const offset of offsets) {
        const newX = Math.max(5, Math.min(95, originalX + offset.dx));
        const newY = Math.max(5, Math.min(95, originalY + offset.dy));

        const testBubble = {
            ...bubble,
            position: { x: newX, y: newY }
        };

        let hasOverlap = false;
        for (const existing of existingBubbles) {
            if (bubblesOverlap(existing, testBubble, minGap)) {
                hasOverlap = true;
                break;
            }
        }

        if (!hasOverlap) {
            return testBubble;
        }
    }

    // If all positions overlap, just move it down significantly
    return {
        ...bubble,
        position: {
            x: originalX,
            y: Math.min(90, originalY + 30)
        }
    };
};

// ============================================
// TEXT PANEL SYSTEM (Webtoon-style)
// ============================================

/**
 * Generate Text Panels for webtoon-style display
 * Analyzes text and creates separate text panels instead of overlaying on images
 */
export const generateTextPanels = async (
    beatId: string,
    dialogueText: string,
    characters: string[]
): Promise<{ textPanels: TextPanel[] }> => {
    const ai = getAi();

    const schema = {
        type: Type.OBJECT,
        properties: {
            textPanels: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        type: {
                            type: Type.STRING,
                            enum: ['narration', 'inner_thought', 'dialogue', 'sfx', 'system'],
                            description: "Type of text panel"
                        },
                        speaker: {
                            type: Type.STRING,
                            description: "Character name if dialogue or inner_thought, empty for narration"
                        },
                        text: {
                            type: Type.STRING,
                            description: "The text content"
                        },
                        order: {
                            type: Type.NUMBER,
                            description: "Reading order (1, 2, 3...)"
                        },
                        position: {
                            type: Type.STRING,
                            enum: ['before', 'after'],
                            description: "Show before or after the image"
                        }
                    },
                    required: ["type", "text", "order", "position"]
                }
            }
        },
        required: ["textPanels"]
    };

    const systemInstruction = `You are a Webtoon Text Analyzer. Your job is to analyze story text and split it into separate text panels.

TEXT TYPES:
1. **narration**: Third-person narrator describing scenes, settings, or events
   - Example: "The headquarters pierced the clouds of Seoul..."
   - Example: "Her heart pounded in her chest."
   - Style: Black text, white/cream background, centered

2. **inner_thought**: Character's internal thoughts (first-person, NOT spoken aloud)
   - Example: "To me, it was a dungeon."
   - Example: "Why is he looking at me like that?"
   - Indicators: First-person pronouns (I, me, my), emotional reactions, questions to self
   - Style: Italic text, light gray background

3. **dialogue**: Spoken words (said out loud to another character)
   - Example: "Secretary Lee, come to my office."
   - Indicators: Direct speech, commands, questions to others, conversation
   - Style: Regular text, white background with border

4. **system**: Game-like system messages or status displays
   - Example: "[Affection: 0%]"
   - Example: "[Status: Nervous]"
   - Indicators: Square brackets, colons, numerical values
   - Style: Monospace font, dark background

5. **sfx**: Sound effects (RARE - only for explicit sounds)
   - Example: "CRASH!", "Thud!", "Ring ring"
   - Style: Bold text, transparent background

RULES:
1. Split the text into logical chunks - each distinct thought, statement, or narration is a separate panel
2. Keep each panel short (1-3 sentences max)
3. Identify the TYPE correctly based on context
4. For inner_thought: Look for first-person perspective, emotional reactions, internal questions
5. For dialogue: Look for spoken words, commands, direct address to others
6. For narration: Third-person descriptions, scene-setting, action descriptions
7. Position: Use 'after' for most panels (text appears after image). Use 'before' only for setting-up narration.
8. If text contains "[Something: value]" patterns, mark as 'system' type

Characters in scene: ${characters.join(', ')}`;

    const response = await ai.models.generateContent({
        model: MODEL_TEXT_ANALYSIS,
        contents: {
            parts: [{ text: `Analyze this story text and split into text panels:\n\n"${dialogueText}"` }]
        },
        config: {
            responseMimeType: "application/json",
            responseSchema: schema,
            systemInstruction,
            thinkingConfig: { thinkingBudget: 2048 }
        }
    });

    const result = JSON.parse(response.text || '{"textPanels": []}');

    // Post-process: Add IDs and styles
    if (result.textPanels) {
        result.textPanels = result.textPanels.map((panel: any, idx: number) => {
            const style = getTextPanelStyle(panel.type as TextPanelType);
            return {
                id: `panel-${beatId}-${idx + 1}`,
                beatId,
                ...panel,
                style
            };
        });
    }

    console.log(`📝 Generated ${result.textPanels?.length || 0} text panels for beat`);

    return result;
};

/**
 * Get default style for a text panel type
 */
const getTextPanelStyle = (type: TextPanelType): TextPanel['style'] => {
    switch (type) {
        case 'narration':
            return {
                backgroundColor: '#f8f8f8',
                textColor: '#1a1a1a',
                fontStyle: 'normal',
                fontWeight: 'normal',
                textAlign: 'center'
            };
        case 'inner_thought':
            return {
                backgroundColor: '#f0f0f0',
                textColor: '#333333',
                fontStyle: 'italic',
                fontWeight: 'normal',
                textAlign: 'center'
            };
        case 'dialogue':
            return {
                backgroundColor: '#ffffff',
                textColor: '#000000',
                fontStyle: 'normal',
                fontWeight: 'normal',
                textAlign: 'left'
            };
        case 'system':
            return {
                backgroundColor: '#1a1a2e',
                textColor: '#00ff88',
                fontStyle: 'normal',
                fontWeight: 'bold',
                textAlign: 'center'
            };
        case 'sfx':
            return {
                backgroundColor: 'transparent',
                textColor: '#000000',
                fontStyle: 'normal',
                fontWeight: 'bold',
                textAlign: 'center'
            };
        default:
            return {
                backgroundColor: '#ffffff',
                textColor: '#000000',
                fontStyle: 'normal',
                fontWeight: 'normal',
                textAlign: 'center'
            };
    }
};

/**
 * Generate VN Speeches for visual novel display
 * Analyzes text and divides it into sequential speeches/dialogues
 * Each speech represents one "click" in the visual novel
 */
export const generateVNSpeeches = async (
    beatId: string,
    dialogueText: string,
    characters: string[]
): Promise<{ vnSpeeches: VNSpeech[] }> => {
    const ai = getAi();

    const schema = {
        type: Type.OBJECT,
        properties: {
            vnSpeeches: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        type: {
                            type: Type.STRING,
                            enum: ['dialogue', 'narration', 'inner_thought'],
                            description: "Type of speech"
                        },
                        speaker: {
                            type: Type.STRING,
                            description: "Character name for dialogue/inner_thought, empty string for narration"
                        },
                        text: {
                            type: Type.STRING,
                            description: "The speech text content"
                        },
                        order: {
                            type: Type.NUMBER,
                            description: "Reading order (1, 2, 3...)"
                        }
                    },
                    required: ["type", "text", "order"]
                }
            }
        },
        required: ["vnSpeeches"]
    };

    const systemInstruction = `You are a Visual Novel Speech Analyzer. Your job is to divide story text into sequential speeches for a visual novel format.

In visual novels, the player clicks to advance through dialogue and narration. Each "click" shows one speech bubble at the bottom of the screen.

SPEECH TYPES:
1. **dialogue**: Character speaking out loud (said to another character)
   - Example: "My partner canceled. You will attend with me."
   - Must have speaker name
   - Direct speech, commands, questions to others, conversation

2. **narration**: Third-person narrator describing scenes
   - Example: "The headquarters pierced the clouds of Seoul..."
   - No speaker (narrator is invisible)
   - Scene descriptions, action descriptions, transitions

3. **inner_thought**: Character's internal thoughts (NOT spoken aloud)
   - Example: "Why is he looking at me like that?"
   - Must have speaker name (the character thinking)
   - First-person perspective, emotional reactions, internal questions

CRITICAL RULES:
1. **Divide conversations into individual lines**: Each character's statement is a SEPARATE speech
   - BAD: Create one speech with "Hello! How are you? I'm fine."
   - GOOD: Create 3 speeches: "Hello!", "How are you?", "I'm fine."

2. **Identify the speaker for EVERY dialogue/thought**: Extract character names from the text
   - Look for: "said Maria", "John replied", "she thought", "he wondered"
   - Use character names exactly as they appear in the text

3. **Alternate speakers in conversations**: If you see dialogue without attribution, infer who's speaking based on context and conversation flow

4. **Keep each speech SHORT**: 1-2 sentences max per speech (this is visual novel format!)

5. **Order matters**: Number speeches in the exact order they should appear (1, 2, 3...)

6. **For narration**: Leave speaker empty or set to empty string

EXAMPLE INPUT:
"Hello, how are you?" said Maria.
"I'm doing well, thanks!" replied John.
Maria smiled. "That's great to hear!"

EXAMPLE OUTPUT:
[
  {type: "dialogue", speaker: "Maria", text: "Hello, how are you?", order: 1},
  {type: "dialogue", speaker: "John", text: "I'm doing well, thanks!", order: 2},
  {type: "narration", speaker: "", text: "Maria smiled.", order: 3},
  {type: "dialogue", speaker: "Maria", text: "That's great to hear!", order: 4}
]

Characters in scene: ${characters.join(', ')}`;

    const response = await ai.models.generateContent({
        model: MODEL_TEXT_ANALYSIS,
        contents: {
            parts: [{ text: `Divide this story text into VN speeches:\n\n"${dialogueText}"` }]
        },
        config: {
            responseMimeType: "application/json",
            responseSchema: schema,
            systemInstruction,
            thinkingConfig: { thinkingBudget: 2048 }
        }
    });

    const result = JSON.parse(response.text || '{"vnSpeeches": []}');

    // Post-process: Add IDs
    if (result.vnSpeeches) {
        result.vnSpeeches = result.vnSpeeches.map((speech: any, idx: number) => ({
            id: `vnspeech-${beatId}-${idx + 1}`,
            beatId,
            ...speech,
            speaker: speech.speaker || undefined // Convert empty string to undefined
        }));
    }

    console.log(`🎭 Generated ${result.vnSpeeches?.length || 0} VN speeches for beat`);

    return result;
};
