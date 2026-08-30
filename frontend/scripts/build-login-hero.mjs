/**
 * Gera variantes do hero do login a partir de uma arte mestre.
 *
 * Coloque `public/login-hero-master.png` (ideal: 3840×2160, PNG sem compressão)
 * e rode: npm run build:login-hero
 *
 * Sem o master, usa `login-hero-2x.jpg` como fonte (melhora WebP/AVIF, não cria detalhe novo).
 */
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = join(root, "public");

const masterPath = join(publicDir, "login-hero-master.png");
const fallbackPath = join(publicDir, "login-hero-2x.jpg");
const sourcePath = existsSync(masterPath) ? masterPath : fallbackPath;

if (!existsSync(sourcePath)) {
  console.error(
    "Nenhuma fonte encontrada. Adicione public/login-hero-master.png ou login-hero-2x.jpg",
  );
  process.exit(1);
}

const VARIANTS = [
  { name: "login-hero.jpg", width: 1280, jpeg: 90, webp: 90, avif: 85 },
  { name: "login-hero-2x.jpg", width: 1920, jpeg: 92, webp: 92, avif: 88 },
  { name: "login-hero-3x.jpg", width: 2560, jpeg: 92, webp: 92, avif: 88 },
];

const meta = await sharp(sourcePath).metadata();
const sourceResolved = resolve(sourcePath);

console.log(
  `Fonte: ${sourcePath.replace(publicDir, "public")} (${meta.width}×${meta.height})`,
);

for (const variant of VARIANTS) {
  if ((meta.width ?? 0) < variant.width * 0.85 && variant.width > 1280) {
    console.log(`  skip ${variant.name} — fonte menor que ${variant.width}px`);
    continue;
  }

  const pipeline = sharp(sourcePath).resize({
    width: variant.width,
    withoutEnlargement: true,
    fit: "inside",
  });

  const jpegPath = resolve(join(publicDir, variant.name));
  const isSameAsSource = jpegPath === sourceResolved;

  if (!isSameAsSource) {
    await pipeline
      .clone()
      .jpeg({ quality: variant.jpeg, mozjpeg: true, chromaSubsampling: "4:4:4" })
      .toFile(jpegPath);
  }

  const webpPath = join(publicDir, variant.name.replace(/\.jpg$/, ".webp"));
  await pipeline
    .clone()
    .webp({ quality: variant.webp, effort: 6 })
    .toFile(webpPath);

  const avifPath = join(publicDir, variant.name.replace(/\.jpg$/, ".avif"));
  await pipeline
    .clone()
    .avif({ quality: variant.avif, effort: 6 })
    .toFile(avifPath);

  console.log(
    `  ✓ ${variant.name}${isSameAsSource ? " (mantido, só webp/avif)" : ""} (+ webp, avif)`,
  );
}

console.log("\nPronto.");
