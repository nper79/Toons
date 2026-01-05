import JSZip from 'jszip';
import saveAs from 'file-saver';
import { StoryData, Character, Setting, StorySegment } from '../types';

// Helper to extract base64 data
const getBase64Data = (dataUrl: string) => dataUrl.split(',')[1];

// Helper to fetch blob data from a blob URL
const fetchBlobData = async (blobUrl: string): Promise<Blob> => {
  const response = await fetch(blobUrl);
  return await response.blob();
};

export const exportProject = async (storyData: StoryData) => {
  const zip = new JSZip();
  const assetsFolder = zip.folder("assets");
  
  // Clone data to avoid mutating state
  const dataToSave = JSON.parse(JSON.stringify(storyData));
  
  // Process Characters (Images are Data URIs - Sync)
  dataToSave.characters.forEach((char: Character) => {
    if (char.imageUrl && char.imageUrl.startsWith('data:')) {
      const fileName = `char_${char.id}.png`;
      assetsFolder?.file(fileName, getBase64Data(char.imageUrl), { base64: true });
      char.imageUrl = `assets/${fileName}`;
    }
  });

  // Process Settings (Images are Data URIs - Sync)
  dataToSave.settings.forEach((setting: Setting) => {
    if (setting.imageUrl && setting.imageUrl.startsWith('data:')) {
      const fileName = `setting_${setting.id}.png`;
      assetsFolder?.file(fileName, getBase64Data(setting.imageUrl), { base64: true });
      setting.imageUrl = `assets/${fileName}`;
    }
  });

  // Process Segments (Async needed for Blob URLs)
  // We use a regular for loop to handle async await
  for (const segment of dataToSave.segments) {
    // 1. Images (Data URIs - Sync)
    if (segment.generatedImageUrls && Array.isArray(segment.generatedImageUrls)) {
        segment.generatedImageUrls.forEach((url: string, index: number) => {
            if (url && url.startsWith('data:')) {
                const fileName = `segment_${segment.id}_img_${index}.png`;
                assetsFolder?.file(fileName, getBase64Data(url), { base64: true });
                segment.generatedImageUrls[index] = `assets/${fileName}`;
            }
        });
    }

    if (segment.masterGridImageUrl && segment.masterGridImageUrl.startsWith('data:')) {
      const fileName = `segment_${segment.id}_master_grid.png`;
      assetsFolder?.file(fileName, getBase64Data(segment.masterGridImageUrl), { base64: true });
      segment.masterGridImageUrl = `assets/${fileName}`;
    }
    
    // 2. Audio (Blob URLs - Async)
    if (segment.audioUrl && segment.audioUrl.startsWith('blob:')) {
        try {
            const fileName = `segment_${segment.id}_audio.wav`;
            const blob = await fetchBlobData(segment.audioUrl);
            assetsFolder?.file(fileName, blob); // JSZip supports Blobs directly
            segment.audioUrl = `assets/${fileName}`;
        } catch (e) {
            console.warn(`Failed to export audio for segment ${segment.id}`, e);
            // Delete broken URL to avoid import errors later
            delete segment.audioUrl;
            delete segment.audioDuration;
        }
    }

    // Clean up
    delete segment.generatedImageUrl;
    delete segment.imageOptions;
    // Remove generating flags
    delete segment.isGenerating;
  }

  // Add the JSON file
  zip.file("story_data.json", JSON.stringify(dataToSave, null, 2));

  // Generate and save
  const content = await zip.generateAsync({ type: "blob" });
  saveAs(content, `storyboard_project_${new Date().toISOString().slice(0, 10)}.zip`);
};

export const importProject = async (file: File): Promise<{ data: StoryData, warnings: string[] }> => {
  const zip = await JSZip.loadAsync(file);
  const warnings: string[] = [];
  
  const jsonFile = zip.file("story_data.json");
  if (!jsonFile) throw new Error("Invalid project file: story_data.json not found");

  const jsonContent = await jsonFile.async("string");
  const storyData = JSON.parse(jsonContent);

  // Helper to reconstruct Base64 Image
  const reconstructImage = async (path: string): Promise<string | undefined> => {
    if (!path || !path.startsWith('assets/')) return path;
    const fileName = path.split('/')[1];
    const imgFile = zip.folder("assets")?.file(fileName);
    if (imgFile) {
      const base64 = await imgFile.async("base64");
      return `data:image/png;base64,${base64}`;
    }
    return undefined;
  };

  // Helper to reconstruct Audio Blob URL
  const reconstructAudio = async (path: string): Promise<string | undefined> => {
      if (!path || !path.startsWith('assets/')) return path; 
      const fileName = path.split('/')[1];
      const audioFile = zip.folder("assets")?.file(fileName);
      if (audioFile) {
          const blob = await audioFile.async("blob");
          // Re-create the WAV type explicitly just in case
          const wavBlob = new Blob([blob], { type: 'audio/wav' }); 
          return URL.createObjectURL(wavBlob);
      }
      return undefined;
  };

  // Restore images and audio
  await Promise.all(storyData.characters.map(async (c: any) => {
    if (c.imageUrl) c.imageUrl = await reconstructImage(c.imageUrl);
    c.isGenerating = false;
  }));

  await Promise.all(storyData.settings.map(async (s: any) => {
    if (s.imageUrl) s.imageUrl = await reconstructImage(s.imageUrl);
    s.isGenerating = false;
  }));

  let brokenAudioCount = 0;

  await Promise.all(storyData.segments.map(async (s: any) => {
    s.isGenerating = false; // Reset state
    
    // Images
    if (s.generatedImageUrls && Array.isArray(s.generatedImageUrls)) {
        const restoredUrls = await Promise.all(s.generatedImageUrls.map((url: string) => reconstructImage(url)));
        s.generatedImageUrls = restoredUrls.filter((u): u is string => !!u);
    }
    if (s.generatedImageUrl) {
        const restored = await reconstructImage(s.generatedImageUrl);
        if (restored) {
             if (!s.generatedImageUrls) s.generatedImageUrls = [];
             s.generatedImageUrls.push(restored);
        }
        delete s.generatedImageUrl;
    }
    if (s.masterGridImageUrl) s.masterGridImageUrl = await reconstructImage(s.masterGridImageUrl);

    // Audio Recovery
    if (s.audioUrl) {
        if (s.audioUrl.startsWith('assets/')) {
            s.audioUrl = await reconstructAudio(s.audioUrl);
        } else if (s.audioUrl.startsWith('blob:') || s.audioUrl.startsWith('http')) {
            // Found a broken/temporary link. 
            // We MUST clear this so the UI allows regeneration.
            brokenAudioCount++;
            s.audioUrl = undefined;
            s.audioDuration = undefined;
        }
    }
  }));

  if (brokenAudioCount > 0) {
      warnings.push(`Restored project, but removed ${brokenAudioCount} expired audio links. Please click 'Generate Audio' to recreate them.`);
  }

  return { data: storyData as StoryData, warnings };
};