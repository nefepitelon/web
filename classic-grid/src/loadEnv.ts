import fs from "node:fs";
import path from "node:path";

/** 读取项目根 .env（不依赖 dotenv 包）。已存在的 process.env 优先不覆盖。 */
export function loadEnv(file = path.resolve(process.cwd(), ".env")): void {
  if (!fs.existsSync(/* turbopackIgnore: true */ file)) return;
  const text = fs.readFileSync(/* turbopackIgnore: true */ file, "utf8");
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 1) continue;
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1);
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] == null || process.env[key] === "") process.env[key] = val;
  }
}
