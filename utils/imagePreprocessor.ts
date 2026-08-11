export interface ImageEnhanceOptions {
  enableEnhancement?: boolean;
  contrast?: number; // 0 to 100 (e.g. 35 = +35% contrast)
  brightness?: number; // -50 to 50
  grayscale?: boolean;
  binarize?: boolean; // convert to black/white threshold
  threshold?: number; // 0 to 255 (default 140)
  sharpen?: boolean;
}

/**
 * Preprocesses a base64 or Image element using HTML5 Canvas to enhance
 * text legibility for scanned documents and low-quality photos.
 */
export async function enhanceImageBase64(
  base64Src: string,
  options: ImageEnhanceOptions = {}
): Promise<string> {
  const {
    enableEnhancement = true,
    contrast = 35,
    brightness = 10,
    grayscale = true,
    binarize = false,
    threshold = 145,
    sharpen = true,
  } = options;

  if (!enableEnhancement || !base64Src) return base64Src;

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          resolve(base64Src);
          return;
        }

        canvas.width = img.width;
        canvas.height = img.height;

        // Draw original image
        ctx.drawImage(img, 0, 0);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        const len = data.length;

        // Contrast factor calculation: factor = (259 * (contrast + 255)) / (255 * (259 - contrast))
        const cVal = Math.min(100, Math.max(-100, contrast));
        const factor = (259 * (cVal + 255)) / (255 * (259 - cVal));

        // Brightness offset
        const bVal = Math.min(100, Math.max(-100, brightness));

        for (let i = 0; i < len; i += 4) {
          let r = data[i];
          let g = data[i + 1];
          let b = data[i + 2];

          // 1. Grayscale (Luminance weighting for human perception)
          if (grayscale || binarize) {
            const gray = 0.299 * r + 0.587 * g + 0.114 * b;
            r = gray;
            g = gray;
            b = gray;
          }

          // 2. Brightness
          if (bVal !== 0) {
            r += bVal;
            g += bVal;
            b += bVal;
          }

          // 3. Contrast adjustment
          if (cVal !== 0) {
            r = factor * (r - 128) + 128;
            g = factor * (g - 128) + 128;
            b = factor * (b - 128) + 128;
          }

          // Clamp values 0-255
          r = Math.min(255, Math.max(0, r));
          g = Math.min(255, Math.max(0, g));
          b = Math.min(255, Math.max(0, b));

          // 4. Binarization
          if (binarize) {
            const avg = (r + g + b) / 3;
            const bw = avg >= threshold ? 255 : 0;
            r = bw;
            g = bw;
            b = bw;
          }

          data[i] = r;
          data[i + 1] = g;
          data[i + 2] = b;
        }

        ctx.putImageData(imageData, 0, 0);

        // 5. Sharpening filter if enabled
        if (sharpen && !binarize) {
          const sharpData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const s = sharpData.data;
          const w = canvas.width;
          const h = canvas.height;

          // 3x3 Sharpen kernel mix
          const mix = 0.35; // Sharpening intensity

          for (let y = 1; y < h - 1; y++) {
            for (let x = 1; x < w - 1; x++) {
              const idx = (y * w + x) * 4;

              for (let c = 0; c < 3; c++) {
                const current = data[idx + c];
                const top = data[((y - 1) * w + x) * 4 + c];
                const bottom = data[((y + 1) * w + x) * 4 + c];
                const left = data[(y * w + (x - 1)) * 4 + c];
                const right = data[(y * w + (x + 1)) * 4 + c];

                const sharpened = 5 * current - top - bottom - left - right;
                s[idx + c] = Math.min(255, Math.max(0, current + (sharpened - current) * mix));
              }
            }
          }
          ctx.putImageData(sharpData, 0, 0);
        }

        resolve(canvas.toDataURL('image/jpeg', 0.92));
      } catch (e) {
        console.error('Image enhancement error:', e);
        resolve(base64Src);
      }
    };

    img.onerror = () => {
      resolve(base64Src);
    };

    img.src = base64Src;
  });
}
