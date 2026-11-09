// ============================================================
// DROP LOGISTICS — Client-side image resize/compress helper
// ============================================================
// Phone cameras routinely produce 8-20MB photos (even more for HEIC/ProRAW).
// Uploading those as-is as base64 JSON is slow on mobile data and can blow
// past server body-size limits, which is what made "upload a photo" silently
// fail for riders and customers. Resizing/recompressing in the browser before
// upload fixes both: smaller payloads, faster uploads, and well under any
// reasonable server limit, with no visible quality loss for this app's use
// (ID photos, vehicle plates, item photos, avatars).

/**
 * Reads a File/Blob, downscales it so its longest side is at most `maxDim`
 * pixels, re-encodes as JPEG at `quality`, and resolves to a data URL
 * (e.g. "data:image/jpeg;base64,...") ready to send to /api/uploads/image.
 */
export function fileToResizedBase64(
  file: File,
  maxDim = 1280,
  quality = 0.82
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Could not decode image'));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width >= height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          // Fallback: couldn't get a canvas context, just use the original.
          resolve(reader.result as string);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
