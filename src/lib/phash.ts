/**
 * Perceptual image fingerprint (browser only).
 *
 * A 64-bit difference hash: the image is reduced to greyscale at 9x8 and each
 * pixel is compared with its right-hand neighbour. Cropping, resizing and
 * recompression barely move the result, so the same Google Maps photo still
 * matches when it arrives as a phone screenshot.
 */

const WIDTH = 9;
const HEIGHT = 8;

async function toBitmap(source: Blob | string): Promise<ImageBitmap> {
  if (typeof source === "string") {
    const res = await fetch(source);
    return createImageBitmap(await res.blob());
  }
  return createImageBitmap(source);
}

export async function fingerprint(source: Blob | string): Promise<string> {
  const bitmap = await toBitmap(source);
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("canvas_unavailable");
  ctx.drawImage(bitmap, 0, 0, WIDTH, HEIGHT);
  bitmap.close?.();

  const { data } = ctx.getImageData(0, 0, WIDTH, HEIGHT);
  const grey: number[] = [];
  for (let i = 0; i < data.length; i += 4) {
    grey.push(0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!);
  }

  let bits = "";
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH - 1; x += 1) {
      bits += grey[y * WIDTH + x]! > grey[y * WIDTH + x + 1]! ? "1" : "0";
    }
  }

  let hex = "";
  for (let i = 0; i < bits.length; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  return hex;
}

/** Small preview kept alongside the fingerprint so staff can see what matched. */
export async function thumbnailDataUrl(source: Blob | string, maxSize = 240): Promise<string | null> {
  try {
    const bitmap = await toBitmap(source);
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    return canvas.toDataURL("image/jpeg", 0.7);
  } catch {
    return null;
  }
}

/** First frame of a screen recording, so a video can be fingerprinted too. */
export async function firstVideoFrame(file: File): Promise<Blob | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.src = URL.createObjectURL(file);
    const cleanup = () => URL.revokeObjectURL(video.src);
    video.onloadeddata = () => {
      video.currentTime = Math.min(0.5, (video.duration || 1) / 2);
    };
    video.onseeked = () => {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        cleanup();
        resolve(null);
        return;
      }
      ctx.drawImage(video, 0, 0);
      canvas.toBlob((blob) => {
        cleanup();
        resolve(blob);
      }, "image/jpeg", 0.85);
    };
    video.onerror = () => {
      cleanup();
      resolve(null);
    };
  });
}
