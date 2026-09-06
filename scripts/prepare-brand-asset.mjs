import sharp from "sharp";

const [input, ...outputs] = process.argv.slice(2);

if (!input || outputs.length === 0) {
  throw new Error("Usage: node scripts/prepare-brand-asset.mjs <input> <output...>");
}

const image = sharp(input).resize(512, 512, { fit: "cover" });

await Promise.all(outputs.map((output) => image
  .clone()
  .webp({ quality: 88, effort: 6, smartSubsample: true })
  .toFile(output)));
