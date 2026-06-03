/**
 * Remove fundo preto/quase-preto e grava PNG com alpha (transparência).
 * Uso: node scripts/fix-logo-transparency.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "public");

const BLACK_THRESHOLD = 40;

async function removeDarkBackground(inputPath, outputPath) {
  const { data, info } = await sharp(inputPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (r <= BLACK_THRESHOLD && g <= BLACK_THRESHOLD && b <= BLACK_THRESHOLD) {
      data[i + 3] = 0;
    }
  }

  const tmpPath = `${outputPath}.tmp.png`;
  await sharp(data, {
    raw: {
      width: info.width,
      height: info.height,
      channels: 4,
    },
  })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(tmpPath);

  fs.renameSync(tmpPath, outputPath);
  console.log(`OK ${path.basename(outputPath)} (${info.width}x${info.height})`);
}

const cinzaSource = fs.existsSync(path.join(publicDir, "logo-alle.png"))
  ? path.join(publicDir, "logo-alle.png")
  : path.join(publicDir, "logo-alle-cinza.png");

await removeDarkBackground(
  path.join(publicDir, "logo-alle-branca.png"),
  path.join(publicDir, "logo-alle-branca.png"),
);
await removeDarkBackground(cinzaSource, path.join(publicDir, "logo-alle-cinza.png"));
