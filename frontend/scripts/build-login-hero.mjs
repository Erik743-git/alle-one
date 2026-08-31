/**
 * Exporta a arte original do login em alta qualidade (sem overlays).
 * Rode: npm run build:login-hero
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = join(root, "public");
const masterPath = join(publicDir, "login-hero-master.png");

if (!existsSync(masterPath)) {
  console.error("Adicione public/login-hero-master.png");
  process.exit(1);
}

const masterMeta = await sharp(masterPath).metadata();
const srcW = masterMeta.width ?? 1536;
const srcH = masterMeta.height ?? 1024;
const aspect = srcW / srcH;

async function writeVariants(baseName, pipeline) {
  await pipeline
    .clone()
    .jpeg({ quality: 96, mozjpeg: true, chromaSubsampling: "4:4:4" })
    .toFile(join(publicDir, `${baseName}.jpg`));

  await pipeline
    .clone()
    .webp({ quality: 96, effort: 6, smartSubsample: false })
    .toFile(join(publicDir, `${baseName}.webp`));

  await pipeline
    .clone()
    .avif({ quality: 90, effort: 6 })
    .toFile(join(publicDir, `${baseName}.avif`));

  console.log(`  ✓ ${baseName}`);
}

function upscaleMaster(width) {
  const height = Math.round(width / aspect);
  return sharp(masterPath).resize(width, height, {
    fit: "fill",
    kernel: sharp.kernel.lanczos3,
  });
}

console.log(`Fonte: login-hero-master.png (${srcW}×${srcH})`);

for (const [suffix, width] of [
  ["", 1920],
  ["-2x", 2560],
  ["-3x", 3200],
]) {
  await writeVariants(`login-hero-desktop${suffix}`, upscaleMaster(width));
}

{
  const cropW = Math.round(srcW * 0.72);
  const pipeline = sharp(masterPath)
    .extract({ left: 0, top: 0, width: cropW, height: srcH })
    .resize(1200, 2133, {
      fit: "cover",
      position: "left top",
      kernel: sharp.kernel.lanczos3,
    });

  await writeVariants("login-hero-mobile", pipeline);
}

console.log("\nPronto.");
