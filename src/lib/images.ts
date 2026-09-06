/* Client-side image intake for developer listings.
   Uploads are downscaled + re-encoded locally before being stored, so the
   document store stays small. Mirrors the production pipeline where the
   backend normalizes listing assets (icon 512px, feature graphic 1024×500,
   screenshots per-device) into the object-storage vault. */

export interface ImageResult { ok: true; dataUrl: string; width: number; height: number }
export type ImageOutcome = ImageResult | { ok: false; error: string };

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) { reject(new Error("Not an image file")); return; }
    if (file.size > 12 * 1024 * 1024) { reject(new Error("Image too large (max 12 MB)")); return; }
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not decode image")); };
    img.src = url;
  });
}

export async function processImage(file: File, maxDim: number, format: "png" | "jpeg" = "jpeg", quality = 0.82): Promise<ImageOutcome> {
  try {
    const img = await loadImage(file);
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return { ok: false, error: "Canvas unavailable" };
    if (format === "jpeg") { ctx.fillStyle = "#0a1834"; ctx.fillRect(0, 0, w, h); }
    ctx.drawImage(img, 0, 0, w, h);
    return { ok: true, dataUrl: canvas.toDataURL(format === "png" ? "image/png" : "image/jpeg", quality), width: w, height: h };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Image processing failed" };
  }
}

/* square-crop for icons — Play Store requires a full-bleed square icon */
export async function processIcon(file: File, size = 320): Promise<ImageOutcome> {
  try {
    const img = await loadImage(file);
    const side = Math.min(img.width, img.height);
    const sx = (img.width - side) / 2, sy = (img.height - side) / 2;
    const canvas = document.createElement("canvas");
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return { ok: false, error: "Canvas unavailable" };
    ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
    return { ok: true, dataUrl: canvas.toDataURL("image/png"), width: size, height: size };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Image processing failed" };
  }
}

export async function processFeatureArt(file: File): Promise<ImageOutcome> {
  /* feature graphic: downscaled to 1280 wide JPEG */
  return processImage(file, 1280, "jpeg", 0.82);
}

export async function processScreenshot(file: File): Promise<ImageOutcome> {
  return processImage(file, 620, "jpeg", 0.74);
}
