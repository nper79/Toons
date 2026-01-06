
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { StoryData, AspectRatio, ImageSize, ManhwaPanel, StorySegment, WordDefinition } from "../types";
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

// STEP 1: FORENSIC ANALYSIS (Dedicated Function)
const performForensicAnalysis = async (
    previousImage: string | undefined, 
    previousText: string | undefined
): Promise<any> => {
    const ai = getAi();
    
    const schema = {
        type: Type.OBJECT,
        properties: {
            exact_outfit: { type: Type.STRING, description: "The EXACT clothing seen. E.g. 'White bathrobe with belt'. If naked, say 'Naked'." },
            held_item: { type: Type.STRING, description: "What is in their hands? BE SPECIFIC. If it is a Mop/Broom, say 'Floor Mop'. If a knife, say 'Knife'. If empty, say 'None'." },
            environment_state: { type: Type.STRING, description: "Is it a bathroom? Kitchen? Is there steam?" }
        },
        required: ["exact_outfit", "held_item", "environment_state"]
    };

    const parts: any[] = [];
    if (previousImage) {
        const base64Data = previousImage.includes(',') ? previousImage.split(',')[1] : previousImage;
        parts.push({ inlineData: { mimeType: 'image/png', data: base64Data } });
        parts.push({ text: "Look at this image. What exactly is the character wearing and holding? Don't generalize. If it's a mop, call it a mop." });
    }
    if (previousText) {
        parts.push({ text: `Previous Context Text: "${previousText}"` });
    }
    
    // If no previous data, return defaults
    if (parts.length === 0) return { exact_outfit: "Casual clothes", held_item: "None", environment_state: "Generic" };

    const response = await ai.models.generateContent({
        model: MODEL_FORENSIC, // Switched to Flash to prevent 500 Errors
        contents: { parts: parts },
        config: {
            responseMimeType: "application/json",
            responseSchema: schema,
            systemInstruction: "You are a Forensic Image Analyst. Identify the specific objects and clothing in the scene."
        }
    });

    return JSON.parse(response.text || "{}");
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
            text: { type: Type.STRING, description: "MUST MATCH 'sourceLanguage' EXACTLY. Verbatim copy of the input segment." },
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
              items: {
                  type: Type.OBJECT,
                  properties: {
                      panelIndex: { type: Type.INTEGER },
                      visualPrompt: { type: Type.STRING, description: "IN ENGLISH." },
                      caption: { type: Type.STRING, description: "MUST MATCH 'sourceLanguage' EXACTLY." },
                      cameraAngle: { type: Type.STRING },
                      shotType: { type: Type.STRING, enum: ['ESTABLISHING', 'CHARACTER', 'ACTION', 'DETAIL'] }
                  },
                  required: ["panelIndex", "visualPrompt", "caption", "cameraAngle", "shotType"]
              }
            }
          },
          required: ["id", "text", "type", "settingId", "characterIds", "scenePrompt", "panels"]
        }
      }
    },
    required: ["sourceLanguage", "title", "artStyle", "segments", "characters", "settings"]
  };

  const systemInstruction = `
  You are a Text Extraction Algorithm (v4.0).
  
  **PRIMARY FUNCTION**:
  You take a text input and split it into JSON segments.
  
  **STRICT CONSTRAINT: PHOTOCOPYING MODE**
  1. You are FORBIDDEN from generating original text for the 'text' or 'caption' fields.
  2. You must COPY the source text character-for-character.
  3. If the input is in Portuguese, the output 'text' MUST be in Portuguese.
  4. If the input is in Czech, the output 'text' MUST be in Czech.
  
  **INTERNAL LOGIC**:
  [INPUT] -> [DETECT LANGUAGE] -> [COPY TEXT TO JSON] -> [GENERATE ENGLISH VISUAL PROMPTS]
  
  **VISUAL INSTRUCTION**:
  - 'visualPrompt': Must be in ENGLISH. Describe the scene for an image generator.
  
  **VERIFICATION**:
  - Does 'text' match the source input verbatim? YES/NO. If NO, retry.
  `;

  const response = await ai.models.generateContent({
    model: MODEL_TEXT_ANALYSIS,
    contents: `FULL RAW TEXT:\n${storyText}\n\nSTYLE: ${artStyle}`,
    config: {
      responseMimeType: "application/json",
      responseSchema: schema,
      systemInstruction: systemInstruction,
      thinkingConfig: { thinkingBudget: 8192 }
    }
  });

  const result = JSON.parse(response.text || "{}");
  // We can log the detected language for debugging if needed
  if (result.sourceLanguage) {
      console.log(`Detected Story Language: ${result.sourceLanguage}`);
  }
  return result;
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
      const fallbackResponse = await ai.models.generateContent({
        model: MODEL_IMAGE_GEN_FALLBACK,
        contents: { parts: promptParts },
        config: { imageConfig: { aspectRatio } },
      });
      const data = fallbackResponse.candidates?.[0].content.parts.find((p: any) => p.inlineData)?.inlineData?.data;
      if (!data) throw new Error("Image gen failed");
      // COMPRESSION STEP
      const rawBase64 = `data:image/png;base64,${data}`;
      return await compressImage(rawBase64, 0.85);
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
