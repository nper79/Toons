
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { StoryData, AspectRatio, ImageSize, ManhwaPanel } from "../types";

const getAi = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

const MODEL_TEXT_ANALYSIS = 'gemini-3-pro-preview'; 
const MODEL_IMAGE_GEN = 'gemini-3-pro-image-preview'; 
const MODEL_IMAGE_GEN_FALLBACK = 'gemini-2.5-flash-image'; 
const MODEL_IMAGE_EDIT = 'gemini-3-pro-image-preview'; 
const MODEL_TTS = 'gemini-2.5-flash-preview-tts';
const MODEL_VIDEO_FAST = 'veo-3.1-fast-generate-preview';
const MODEL_VIDEO_HD = 'veo-3.1-generate-preview';

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

export const regeneratePanelPrompts = async (
    segmentText: string,
    fullStoryText: string,
    style: string,
    contextInfo: string
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
                        visualPrompt: { type: Type.STRING, description: "EXTREMELY DETAILED visual description." },
                        caption: { type: Type.STRING },
                        cameraAngle: { type: Type.STRING },
                        shotType: { type: Type.STRING, enum: ['ESTABLISHING', 'CHARACTER', 'ACTION', 'DETAIL'], description: "Panel 1 is usually ESTABLISHING. Others are CHARACTER/ACTION." }
                    },
                    required: ["panelIndex", "visualPrompt", "caption", "cameraAngle", "shotType"]
                },
                description: "Exactly 4 narrative beats."
            }
        },
        required: ["panels"]
    };

    const systemInstruction = `
    You are a Cinematographer and Art Director for a high-budget Manhwa.
    **TASK**: Rewrite visual prompts for the TARGET SEGMENT provided.
    
    **CRITICAL STRATEGY: SPATIAL ISOLATION (Avoid Hallucinations)**
    AI generators hallucinate if you describe the room twice. You must hide the room after Panel 1.
    
    **PANEL 1 (ESTABLISHING)**: 
    - Wide Shot. Show the layout, furniture, and setting clearly.
    - **LIGHTING**: Ensure characters are WELL LIT (No accidental silhouettes unless requested).
    
    **PANEL 2, 3, 4 (ISOLATION)**:
    - **FORBIDDEN**: Do NOT describe the room, walls, windows, or furniture positions.
    - **FOCUS**: ZOOM IN on the specific subject (Face, Hand, Object, Shoe).
    - **BACKGROUND**: Must be "Abstract Blur", "Speed Lines", or "Solid Color".
    
    **COSTUME CONSISTENCY**:
    - If the character is wearing "Office Heels", NEVER describe "Sneakers" in an action shot.
    - If the character has "Long Hair", do not change it.
    - Adhere strictly to the defined character details in ${contextInfo}.
    
    **CONTEXT**: ${contextInfo}`;

    const response = await ai.models.generateContent({
        model: MODEL_TEXT_ANALYSIS,
        contents: `
FULL STORY:
${fullStoryText}

TARGET SEGMENT:
${segmentText}

ART STYLE: ${style}`,
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
            colorPalette: { type: Type.STRING, description: "The 3 dominant colors of this place (e.g., 'Dark Blue, Silver, White'). Used for abstract backgrounds." }
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
    required: ["title", "artStyle", "segments", "characters", "settings"]
  };

  const systemInstruction = `
  You are an expert Director for Interactive Manhwa.
  
  **CRITICAL RULE FOR SETTINGS**:
  When defining 'settings', you MUST create a 'colorPalette'. This is crucial for the "Bokeh/Blur" technique.
  
  **CRITICAL RULE FOR CHARACTERS**:
  Define explicit clothing details (shoes, shirt, pants) in the description to ensure consistency.
  
  **VISUAL PACING (ISOLATION RULE)**: 
  - Panel 1: Establishing Shot (Show Room).
  - Panel 2-4: ISOLATION SHOTS (Close-ups, Macro, Abstract Backgrounds).
  
  **CHUNK RULE**: VERBATIM segments of 3-4 sentences.
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

  return JSON.parse(response.text || "{}");
};

export const generateImage = async (
  prompt: string, 
  aspectRatio: AspectRatio = AspectRatio.MOBILE, 
  imageSize: ImageSize = ImageSize.K1, 
  refImages?: string[],
  globalStyle?: string,
  cinematicDNA?: any,
  useGridMode: boolean = false,
  gridVariations?: string[]
): Promise<string> => {
  const ai = getAi();
  
  let styleInstruction = `Style: ${globalStyle || 'Manhwa/Webtoon'}. High-quality Korean Webtoon style. Cel-shaded, sharp lines.`;
  styleInstruction += " CONSISTENCY: Match the character and environment references exactly.";

  const systemInstruction = `You are an expert concept artist. ${styleInstruction}. IMPORTANT: NO TEXT ON IMAGES. No speech bubbles, no labels.
  
  **LIGHTING RULE**: Ensure the subject is well-lit. Avoid silhouettes unless explicitly requested.
  **CLOTHING RULE**: Characters must wear exactly what is described in the prompt. Do not change shoes or clothes between panels.
  `;
  const promptParts = [`Visual prompt: ${prompt}`];
  
  if (useGridMode && gridVariations) {
    // FORCE 2x2 GRID INSTRUCTION
    promptParts.push(`
    **MANDATORY LAYOUT: 2x2 GRID (FOUR QUADRANTS)**
    - The output image MUST be a single image divided into exactly 4 panels (2 rows, 2 columns).
    - Draw CLEAR BLACK BORDERS between the 4 panels.
    - Do NOT generate a single scene. Do NOT generate a 1x4 strip.
    
    **PANEL ASSIGNMENTS:**
    1. TOP-LEFT: ${gridVariations[0]}
    2. TOP-RIGHT: ${gridVariations[1]}
    3. BOTTOM-LEFT: ${gridVariations[2]}
    4. BOTTOM-RIGHT: ${gridVariations[3]}
    
    CONSISTENCY: Characters must look identical in all 4 panels.
    `);
  }

  const parts: any[] = [{ text: promptParts.join("\n") }];
  
  if (refImages && refImages.length > 0) {
    refImages.forEach(b64 => {
      const base64Data = b64.includes(',') ? b64.split(',')[1] : b64;
      parts.push({ inlineData: { mimeType: 'image/png', data: base64Data } });
    });
    parts.push({ text: "Use these images for strict style and identity ground truth." });
  }

  try {
      const response = await ai.models.generateContent({
        model: MODEL_IMAGE_GEN,
        contents: { parts },
        config: { imageConfig: { aspectRatio, imageSize }, systemInstruction }
      });
      const data = response.candidates?.[0].content.parts.find((p: any) => p.inlineData)?.inlineData?.data;
      if (!data) throw new Error("No image data");
      return `data:image/png;base64,${data}`;
  } catch (error: any) {
      const fallbackResponse = await ai.models.generateContent({
        model: MODEL_IMAGE_GEN_FALLBACK,
        contents: { parts },
        config: { imageConfig: { aspectRatio } },
      });
      const data = fallbackResponse.candidates?.[0].content.parts.find((p: any) => p.inlineData)?.inlineData?.data;
      if (!data) throw new Error("Image gen failed");
      return `data:image/png;base64,${data}`;
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
