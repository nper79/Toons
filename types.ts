
export enum ProcessingStatus {
  IDLE = 'IDLE',
  ANALYZING = 'ANALYZING',
  GENERATING_ASSETS = 'GENERATING_ASSETS',
  READY = 'READY',
  ERROR = 'ERROR'
}

export interface Character {
  id: string;
  name: string;
  description: string;
  visualPrompt: string;
  imageUrl?: string;
  isGenerating?: boolean;
}

export interface AuthorizedView {
  id: string;
  name: string;
  description: string;
  imageUrl: string;
}

export interface Setting {
  id: string;
  name: string;
  description: string;
  spatialLayout?: string; // Technical description of item placements
  colorPalette?: string; // NEW: The abstract color vibe (e.g. "Warm amber wood, cool blue moonlight")
  visualPrompt: string;
  imageUrl?: string; // This will now act as the "Master Grid"
  authorizedViews?: AuthorizedView[]; // The sliced individual angles
  isGenerating?: boolean;
}

export interface CinematicDNA {
  cameraSystem: string;
  colorPalette: string;
  lightingPhilosophy: string;
  filmStock: string;
  visualMood: string;
}

export type ShotType = 'ESTABLISHING' | 'CHARACTER' | 'ACTION' | 'DETAIL' | 'CLOSE-UP';

// NEW: Background rendering strategy for manhwa-style panels
export type BackgroundType =
  | 'DETAILED'    // Full environment (establishing shots, scene transitions)
  | 'WHITE'       // Pure white/cream background (rare, only for pure dialogue)
  | 'GRADIENT'    // Soft gradient/vignette (emotional moments, most dialogue)
  | 'BOKEH'       // Blurred background (intimate scenes, close-ups, DEFAULT for dialogue)
  | 'SPEEDLINES'  // Action lines/screen tones (dramatic moments)
  | 'SPLIT';      // Split panel with 2 characters/actions side by side

export interface ManhwaPanel {
  panelIndex: number;
  visualPrompt: string;
  caption: string;
  cameraAngle: string;
  shotType?: ShotType;
  backgroundType?: BackgroundType; // NEW: Controls background rendering strategy
}

export interface StructuredScene {
  subject_details: { appearance: string; clothing: string; expression: string; };
  environment: { setting: string; background_elements: string[]; foreground_elements: string[]; weather_and_atmosphere: string; };
  lighting: { primary_source: string; color_palette: string; shadows: string; };
  camera: { shot_type: string; angle: string; lens_characteristics: string; };
  contextual_inference: string;
}

export interface Choice {
  text: string;
  targetSegmentId: string;
}

export enum SegmentType {
  MAIN = 'MAIN',
  BRANCH = 'BRANCH',
  MERGE_POINT = 'MERGE_POINT'
}

// NEW: Interface to store cached translations
export interface TranslationCache {
  text: string;
  tokens: string[];
  captions: string[];
  choices: string[];
}

// NEW: Interface for Vocabulary Definitions
export interface WordDefinition {
    definition: string;
    pronunciation?: string;
}

export interface StorySegment {
  id: string;
  text: string; 
  tokens?: string[]; // NEW: Semantic breakdown for Asian languages (["私", "は"] for "私は")
  settingId: string;
  characterIds: string[];
  
  // NEW: Specific outfit/state for this segment (e.g. "Naked, wet skin" or "Damaged Armor")
  costumeOverride?: string;

  panels: ManhwaPanel[]; 
  
  scenePrompt?: string; 
  structuredScene?: StructuredScene;
  type: SegmentType;
  parentId?: string;
  choices?: Choice[];
  nextSegmentId?: string;
  
  masterGridImageUrl?: string;
  selectedGridIndices: number[];
  generatedImageUrls: string[]; 
  
  // NEW: Store all generated translations here
  translations?: Record<string, TranslationCache>;

  // VN Speeches for visual novel mode
  vnSpeeches?: VNSpeech[];

  audioUrl?: string;
  audioDuration?: number;
  videoUrl?: string;
  isVideoGenerating?: boolean;
  isGenerating?: boolean;
}

export interface StoryData {
  title: string;
  artStyle: string;
  learningLanguage: string; 
  nativeLanguage: string;   
  visualStyleGuide: string; 
  cinematicDNA: CinematicDNA; 
  
  // NEW: Track which languages are fully translated
  completedTranslations?: Record<string, boolean>;

  // NEW: Global Vocabulary Cache
  // Structure: vocabulary[sourceWord][targetLanguageCode] = Definition
  vocabulary?: Record<string, Record<string, WordDefinition>>;

  // NEW: Cover Art Data
  cover?: {
    imageUrl?: string;
    visualPrompt?: string;
    isGenerating?: boolean;
  };

  segments: StorySegment[];
  characters: Character[];
  settings: Setting[];
}

export enum AspectRatio {
  SQUARE = "1:1",
  PORTRAIT = "3:4",
  LANDSCAPE = "4:3",
  WIDE = "16:9",
  MOBILE = "9:16",
  CINEMATIC = "21:9"
}

export enum ImageSize {
  K1 = "1K",
  K2 = "2K",
  K4 = "4K"
}

// Speech Bubble Types for Webtoon Dialog System
export type BubbleType =
  | 'speech'      // Normal dialogue
  | 'thought'     // Internal thoughts (cloud-style)
  | 'narration'   // Narrator text (rectangular box)
  | 'shout'       // Loud speech (spiky bubble)
  | 'whisper'     // Quiet speech (dashed border)
  | 'scream';     // Very loud (jagged bubble)

export type TailDirection =
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'
  | 'left'
  | 'right'
  | 'none'; // For narration boxes

export interface SpeechBubble {
  id: string;
  speaker: string; // Character name or 'narrator'
  text: string; // The dialogue text
  position: {
    x: number; // X coordinate (percentage 0-100)
    y: number; // Y coordinate (percentage 0-100)
  };
  bubbleType: BubbleType;
  tailDirection: TailDirection; // Where the bubble tail points
  size?: {
    width: number;  // Estimated width (percentage)
    height: number; // Estimated height (percentage)
  };
  style?: {
    backgroundColor?: string;
    borderColor?: string;
    textColor?: string;
    fontSize?: number; // Relative size (0.8 = smaller, 1.2 = larger)
  };
  order: number; // Reading order (1, 2, 3...)
}

export interface BubbleTranslation {
  language: string; // Language code (e.g., 'en', 'pt', 'ko', 'ja')
  bubbles: Record<string, string>; // bubbleId -> translated text
}

export interface BeatWithBubbles {
  beatId: string;
  imageUrl: string;
  speechBubbles: SpeechBubble[];
  translations?: BubbleTranslation[]; // Translations for different languages
  currentLanguage: string; // Active language
}

// ============================================
// TEXT PANEL SYSTEM (Webtoon-style text boxes)
// ============================================

export type TextPanelType =
  | 'narration'      // Narrator voice (descriptive text)
  | 'inner_thought'  // Character's internal thoughts
  | 'dialogue'       // Spoken dialogue
  | 'sfx'            // Sound effects
  | 'system';        // System messages (like [Affection: 0%])

export interface TextPanel {
  id: string;
  beatId: string; // Which beat this panel belongs to
  type: TextPanelType;
  speaker?: string; // Character name (for dialogue/thoughts)
  text: string;
  order: number; // Reading order within the beat
  style: {
    backgroundColor: string; // Panel background color
    textColor: string;
    fontStyle: 'normal' | 'italic';
    fontWeight: 'normal' | 'bold';
    textAlign: 'left' | 'center' | 'right';
  };
  position: 'before' | 'after'; // Show before or after the image
}

export interface TextPanelTranslation {
  language: string;
  panels: Record<string, string>; // panelId -> translated text
}

// ============================================
// VISUAL NOVEL SPEECH SYSTEM
// ============================================

export type VNSpeechType =
  | 'dialogue'       // Character speaking
  | 'narration'      // Narrator voice
  | 'inner_thought'; // Character's internal thoughts

export interface VNSpeech {
  id: string;
  beatId: string; // Which beat this speech belongs to
  type: VNSpeechType;
  speaker?: string; // Character name (for dialogue/thoughts), undefined for narration
  text: string;
  order: number; // Reading order within the beat (each click advances to next speech)
}

export interface VNSpeechTranslation {
  language: string;
  speeches: Record<string, string>; // speechId -> translated text
}
