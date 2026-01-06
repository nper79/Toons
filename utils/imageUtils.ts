
/**
 * Compresses a base64 image string by converting it to JPEG.
 * @param base64Str The original base64 string (PNG or high-res)
 * @param quality Quality from 0 to 1 (default 0.8)
 * @returns Promise resolving to the compressed base64 JPEG string
 */
export const compressImage = async (base64Str: string, quality = 0.8): Promise<string> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) { reject(new Error('No context')); return; }
            
            // Fill white background to prevent transparent PNGs turning black in JPEG
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            ctx.drawImage(img, 0, 0);
            resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = (e) => reject(e);
        img.src = base64Str;
    });
};

/**
 * Crops a specific cell from a 2x2 grid image with high precision.
 * Now outputs JPEG to save significant memory.
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

        // Draw white background just in case
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.drawImage(
          img,
          sx, sy, cellWidth, cellHeight,
          0, 0, cellWidth, cellHeight
        );
  
        // COMPRESSION: Use JPEG at 85% quality instead of PNG
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      
      img.onerror = (e) => reject(e);
      img.src = base64Image;
    });
  };
