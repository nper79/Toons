
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

export type ShotType = 'ESTABLISHING' | 'CHARACTER' | 'ACTION' | 'DETAIL';

export interface ManhwaPanel {
  panelIndex: number;
  visualPrompt: string; 
  caption: string; 
  cameraAngle: string;
  shotType?: ShotType; // NEW: Determines if we use the Blur Trick
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

export interface StorySegment {
  id: string;
  text: string; 
  settingId: string;
  characterIds: string[];
  
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
  
  audioUrl?: string;
  audioDuration?: number;
  videoUrl?: string;
  isVideoGenerating?: boolean;
  isGenerating?: boolean;
}

export interface StoryData {
  title: string;
  artStyle: string;
  visualStyleGuide: string; 
  cinematicDNA: CinematicDNA; 
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
