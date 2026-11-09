import { expect, it } from "vitest";
import { rasterizeNotificationIcon } from "./notification-icon.web";

const RED = [255, 0, 0, 255];
const TRANSPARENT = [0, 0, 0, 0];

function svgDataUri(attributes: string, body: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" ${attributes}>${body}</svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

function redPngDataUri(size: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2d context unavailable");
  context.fillStyle = "#ff0000";
  context.fillRect(0, 0, size, size);
  return canvas.toDataURL("image/png");
}

async function readPng(dataUrl: string, points: Record<string, [number, number]>) {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2d context unavailable");
  context.drawImage(image, 0, 0);
  const colors: Record<string, number[]> = {};
  for (const [name, [x, y]] of Object.entries(points)) {
    colors[name] = Array.from(context.getImageData(x, y, 1, 1).data);
  }
  return { size: [image.naturalWidth, image.naturalHeight], ...colors };
}

it("draws a sized SVG icon edge to edge into a 256px PNG", async () => {
  const png = await rasterizeNotificationIcon(
    svgDataUri('width="32" height="32"', '<rect width="32" height="32" fill="#ff0000"/>'),
  );

  expect(png?.slice(0, 22)).toBe("data:image/png;base64,");
  expect(await readPng(png ?? "", { corner: [2, 2], center: [128, 128] })).toEqual({
    size: [256, 256],
    corner: RED,
    center: RED,
  });
});

it("draws an SVG icon that only declares a viewBox edge to edge", async () => {
  const png = await rasterizeNotificationIcon(
    svgDataUri('viewBox="0 0 24 24"', '<rect width="24" height="24" fill="#ff0000"/>'),
  );

  expect(await readPng(png ?? "", { corner: [2, 2], center: [128, 128] })).toEqual({
    size: [256, 256],
    corner: RED,
    center: RED,
  });
});

it("scales a small PNG icon up to fill the 256px PNG", async () => {
  const png = await rasterizeNotificationIcon(redPngDataUri(16));

  expect(await readPng(png ?? "", { corner: [2, 2], center: [128, 128] })).toEqual({
    size: [256, 256],
    corner: RED,
    center: RED,
  });
});

it("centers a wide icon without stretching it", async () => {
  const png = await rasterizeNotificationIcon(
    svgDataUri('width="64" height="32"', '<rect width="64" height="32" fill="#ff0000"/>'),
  );

  expect(
    await readPng(png ?? "", { topBand: [128, 10], center: [128, 128], bottomBand: [128, 245] }),
  ).toEqual({
    size: [256, 256],
    topBand: TRANSPARENT,
    center: RED,
    bottomBand: TRANSPARENT,
  });
});

it("returns null for data that is not an image", async () => {
  expect(await rasterizeNotificationIcon(`data:image/png;base64,${btoa("not a png")}`)).toBeNull();
});
