import { GoogleGenAI, Type, Modality } from "@google/genai";
import { StoryData, AspectRatio, ImageSize, ManhwaPanel, StorySegment, WordDefinition } from "../types";
import { compressImage } from "../utils/imageUtils";

const getAi = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

const MODEL_TEXT_ANALYSIS = 'gemini-3-pro-preview'; 
const MODEL_IMAGE_GEN = 'gemini-3-pro-image-preview'; 
const MODEL_IMAGE_GEN_FALLBACK = 'gemini-2.5-flash-image'; 
const MODEL_TTS = 'gemini-2.5-flash-preview-tts';

// NEW: Ultra-fast model for dictionary lookups
const MODEL_FAST_DEFINITIONS = 'gemini-flash-lite-latest';
const MODEL_FORENSIC = 'gemini-3-flash-preview';

// Helper for strict text comparison (removes spaces/punctuation)
const normalize = (s: string) => s.toLowerCase().replace(/[\s\p{P}]+/gu, '');

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

export const generateCoverPrompt = async (
    title: string,
    characters: any[],
    summary: string,
    style: string
): Promise<string> => {
    const ai = getAi();
    const response = await ai.models.generateContent({
        model: MODEL_TEXT_ANALYSIS,
        contents: `Create vertical 3:4 cover art prompt for: ${title}. Style: ${style}. Characters: ${characters.map(c => c.name).join(',')}. NO TEXT. Return ONLY the prompt string.`,
    });
    return response.text || "";
};

// UPDATED: Batch translate with Echo Detection & Auto-Retry
export const translateSegments = async (segments: StorySegment[], targetLanguage: string): Promise<StorySegment[]> => {
  const ai = getAi();
  const CHUNK_SIZE = 3;
  const allTranslatedSegments: StorySegment[] = [];

  const processChunk = async (chunk: StorySegment[], attempt = 1): Promise<StorySegment[]> => {
      const textPayload = chunk.map(s => ({ 
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
                translatedText: { type: Type.STRING },
                tokenizedText: { type: Type.ARRAY, items: { type: Type.STRING } },
                translatedCaptions: { type: Type.ARRAY, items: { type: Type.STRING } },
                translatedChoices: { type: Type.ARRAY, items: { type: Type.STRING } }
              },
              required: ["id", "translatedText", "tokenizedText", "translatedCaptions"]
            }
          }
        },
        required: ["translations"]
      };

      try {
          const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: `STRICT TRANSLATION TASK: Translate into ${targetLanguage}. 
            CRITICAL RULE: DO NOT RETURN ENGLISH IF THE TARGET IS ${targetLanguage}.
            IF the translation matches the input English exactly, you failed.
            Input: ${JSON.stringify(textPayload)}`,
            config: {
              responseMimeType: "application/json",
              responseSchema: schema
            }
          });

          const result = JSON.parse(response.text || "{}");
          const translations = result.translations || [];

          return chunk.map(segment => {
            const trans = translations.find((t: any) => t.id === segment.id);
            if (!trans) return segment;

            // VALIDATION: Check for "Echo" Error
            if (targetLanguage !== 'English') {
                const normSource = normalize(segment.text);
                const normTrans = normalize(trans.translatedText);
                if (normSource === normTrans && normSource.length > 3) {
                     throw new Error(`AI returned identical English text for ${segment.id} in ${targetLanguage}. Retrying...`);
                }
            }

            return {
                ...segment,
                text: trans.translatedText,
                tokens: trans.tokenizedText,
                panels: segment.panels.map((p, idx) => ({ ...p, caption: trans.translatedCaptions[idx] || p.caption })),
                choices: segment.choices?.map((c, idx) => ({ ...c, text: trans.translatedChoices?.[idx] || c.text }))
            };
          });
      } catch (e) {
          console.error(`Chunk translation attempt ${attempt} failed`, e);
          if (attempt < 3) {
              await new Promise(r => setTimeout(r, 1000 * attempt));
              return processChunk(chunk, attempt + 1);
          }
          return chunk; 
      }
  };

  for (let i = 0; i < segments.length; i += CHUNK_SIZE) {
      const chunk = segments.slice(i, i + CHUNK_SIZE);
      const translatedChunk = await processChunk(chunk);
      allTranslatedSegments.push(...translatedChunk);
  }

  return allTranslatedSegments;
};

export const getWordDefinition = async (word: string, contextSentence: string, targetLanguage: string): Promise<{ definition: string, pronunciation?: string }> => {
  const ai = getAi();
  const schema = {
    type: Type.OBJECT,
    properties: {
      definition: { type: Type.STRING },
      pronunciation: { type: Type.STRING }
    },
    required: ["definition"]
  };
  const response = await ai.models.generateContent({
    model: MODEL_FAST_DEFINITIONS,
    contents: `Define "${word}" in context of "${contextSentence}" into ${targetLanguage}.`,
    config: { responseMimeType: "application/json", responseSchema: schema }
  });
  return JSON.parse(response.text || "{}");
};

export const batchDefineVocabulary = async (words: string[], targetLanguage: string): Promise<Record<string, WordDefinition>> => {
    if (words.length === 0) return {};
    const ai = getAi();
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
                            definition: { type: Type.STRING },
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
                contents: `Define these words into ${targetLanguage}: ${JSON.stringify(chunk)}`,
                config: { responseMimeType: "application/json", responseSchema: schema }
            });
            const result = JSON.parse(response.text || "{}");
            if (result.definitions) {
                result.definitions.forEach((def: any) => {
                    combinedResults[def.word] = { definition: def.definition, pronunciation: def.pronunciation };
                });
            }
        } catch (e) { console.error("Batch vocab error", e); }
    }
    return combinedResults;
};

export const analyzeStoryText = async (storyText: string, artStyle: string): Promise<StoryData> => {
  const ai = getAi();
  const schema = {
    type: Type.OBJECT,
    properties: {
      sourceLanguage: { type: Type.STRING },
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
            description: { type: Type.STRING }
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
            description: { type: Type.STRING },
            spatialLayout: { type: Type.STRING },
            colorPalette: { type: Type.STRING }
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
            text: { type: Type.STRING },
            type: { type: Type.STRING, enum: ['MAIN', 'BRANCH', 'MERGE_POINT'] },
            choices: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: { text: { type: Type.STRING }, targetSegmentId: { type: Type.STRING } }
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
                      visualPrompt: { type: Type.STRING },
                      caption: { type: Type.STRING },
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
  const response = await ai.models.generateContent({
    model: MODEL_TEXT_ANALYSIS,
    contents: `Analyze this story verbatim: ${storyText}. Style: ${artStyle}`,
    config: { responseMimeType: "application/json", responseSchema: schema }
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
    const schema = {
        type: Type.OBJECT,
        properties: {
            panels: { 
                type: Type.ARRAY, 
                items: {
                    type: Type.OBJECT,
                    properties: {
                        panelIndex: { type: Type.INTEGER },
                        visualPrompt: { type: Type.STRING },
                        caption: { type: Type.STRING },
                        cameraAngle: { type: Type.STRING },
                        shotType: { type: Type.STRING, enum: ['ESTABLISHING', 'CHARACTER', 'ACTION', 'DETAIL', 'CLOSE-UP'] }
                    },
                    required: ["panelIndex", "visualPrompt", "caption", "cameraAngle", "shotType"]
                }
            }
        },
        required: ["panels"]
    };
    const response = await ai.models.generateContent({
        model: MODEL_TEXT_ANALYSIS,
        contents: `Regenerate 4 panel prompts for: ${segmentText}. Context: ${contextInfo}`,
        config: { responseMimeType: "application/json", responseSchema: schema }
    });
    const result = JSON.parse(response.text || "{}");
    return result.panels || [];
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
  continuityImage?: string,
  locationContinuityImages?: string[]
): Promise<string> => {
  const ai = getAi();
  const systemInstruction = `Art Director. Style: ${globalStyle}. NO TEXT. CLEAN ART.`;
  let promptParts: any[] = [];
  if (locationContinuityImages) locationContinuityImages.forEach(img => promptParts.push({ inlineData: { mimeType: 'image/png', data: img.split(',')[1] } }));
  if (continuityImage) promptParts.push({ inlineData: { mimeType: 'image/png', data: continuityImage.split(',')[1] } });
  if (refImages) refImages.forEach(img => promptParts.push({ inlineData: { mimeType: 'image/png', data: img.split(',')[1] } }));
  
  if (useGridMode && gridVariations) promptParts.push({ text: `2x2 grid: 1:${gridVariations[0]}, 2:${gridVariations[1]}, 3:${gridVariations[2]}, 4:${gridVariations[3]}` });
  else promptParts.push({ text: prompt });

  try {
      const response = await ai.models.generateContent({
        model: MODEL_IMAGE_GEN,
        contents: { parts: promptParts },
        config: { imageConfig: { aspectRatio, imageSize }, systemInstruction }
      });
      const data = response.candidates?.[0].content.parts.find((p: any) => p.inlineData)?.inlineData?.data;
      if (!data) throw new Error("No data");
      return await compressImage(`data:image/png;base64,${data}`, 0.85);
  } catch (error: any) {
      const fallback = await ai.models.generateContent({
        model: MODEL_IMAGE_GEN_FALLBACK,
        contents: { parts: promptParts },
        config: { imageConfig: { aspectRatio } },
      });
      const data = fallback.candidates?.[0].content.parts.find((p: any) => p.inlineData)?.inlineData?.data;
      return await compressImage(`data:image/png;base64,${data}`, 0.85);
  }
};

export const generateSpeech = async (text: string, voiceName: string = 'Puck'): Promise<ArrayBuffer> => {
  const ai = getAi();
  const response = await ai.models.generateContent({
    model: MODEL_TTS,
    contents: [{ parts: [{ text }] }],
    config: { responseModalities: [Modality.AUDIO], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } } },
  });
  const data = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
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