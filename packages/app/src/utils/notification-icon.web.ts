/**
 * Edge of the square PNG an icon is drawn into. macOS shows the image as a thumbnail
 * beside the text and full width when the notification is expanded, so it is drawn
 * well above sidebar size.
 */
const ICON_SIZE = 256;

/**
 * Draw an image data URI into a square PNG data URL, centered and scaled to fit.
 *
 * Electron's `nativeImage` decodes only PNG and JPEG, and project icons are often SVG
 * or ICO. It returns null when the source does not decode.
 */
export async function rasterizeNotificationIcon(source: string): Promise<string | null> {
  const image = await loadImage(source);
  if (!image?.naturalWidth || !image.naturalHeight) {
    return null;
  }
  const canvas = document.createElement("canvas");
  canvas.width = ICON_SIZE;
  canvas.height = ICON_SIZE;
  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }
  // Chromium sizes an SVG without width/height at its CSS concrete size (300×150, or
  // its viewBox ratio fitted into that), so the natural size keeps the aspect ratio
  const scale = ICON_SIZE / Math.max(image.naturalWidth, image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    image,
    (ICON_SIZE - drawWidth) / 2,
    (ICON_SIZE - drawHeight) / 2,
    drawWidth,
    drawHeight,
  );
  return canvas.toDataURL("image/png");
}

// Waits for `load`, not `decode()`: Chromium settles `decode()` of a bitmap through the
// compositor, which stops while the window is hidden, and notifications fire while it is.
// `drawImage` decodes synchronously instead.
function loadImage(source: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", () => resolve(null));
    image.src = source;
  });
}
