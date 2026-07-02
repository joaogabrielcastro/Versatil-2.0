/**
 * Gera ícones quadrados para PWA a partir do logo.
 * Uso: npm run icons:generate
 */
import sharp from "sharp";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "public", "versatil-academia-logo.png");
const BG = { r: 244, g: 244, b: 245, alpha: 1 };

async function squareIcon(size, logoScale, outName) {
  const logoMax = Math.round(size * logoScale);
  const logoBuf = await sharp(source)
    .resize(logoMax, logoMax, { fit: "inside" })
    .png()
    .toBuffer();

  const meta = await sharp(logoBuf).metadata();
  const logoW = meta.width ?? logoMax;
  const logoH = meta.height ?? logoMax;

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: BG,
    },
  })
    .composite([
      {
        input: logoBuf,
        left: Math.round((size - logoW) / 2),
        top: Math.round((size - logoH) / 2),
      },
    ])
    .png()
    .toFile(path.join(root, "public", outName));

  console.log(outName);
}

// Ícones de instalação — logo ocupa ~90% do quadrado
for (const size of [192, 512]) {
  await squareIcon(size, 0.9, `icon-${size}.png`);
}

// Maskable Android — área segura ~80%, logo um pouco menor
for (const size of [192, 512]) {
  await squareIcon(size, 0.72, `icon-maskable-${size}.png`);
}

// Apple + favicons
await squareIcon(180, 0.9, "apple-touch-icon.png");
await squareIcon(32, 0.88, "favicon-32.png");
await squareIcon(16, 0.88, "favicon-16.png");

console.log("Ícones PWA gerados.");
