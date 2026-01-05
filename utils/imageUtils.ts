
/**
 * Crops a specific cell from a 2x2 grid image with high precision.
 * @param base64Image The full master grid image
 * @param index The index of the cell (0-3)
 * @returns Promise resolving to the cropped base64 image
 */
export const cropGridCell = (base64Image: string, index: number): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
          reject(new Error("Could not get canvas context"));
          return;
        }
  
        // 2x2 grid calculation
        const cellWidth = img.width / 2;
        const cellHeight = img.height / 2;
  
        const col = index % 2;
        const row = Math.floor(index / 2);
  
        const sx = col * cellWidth;
        const sy = row * cellHeight;
  
        canvas.width = cellWidth;
        canvas.height = cellHeight;
  
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        ctx.drawImage(
          img,
          sx, sy, cellWidth, cellHeight,
          0, 0, cellWidth, cellHeight
        );
  
        resolve(canvas.toDataURL('image/png', 1.0));
      };
      
      img.onerror = (e) => reject(e);
      img.src = base64Image;
    });
  };
