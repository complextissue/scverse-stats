import { promises as fs } from "fs";
import { join } from "path";

export async function saveJson(filename: string, data: any): Promise<void> {
  const outputDir = join(process.cwd(), "output");
  await fs.mkdir(outputDir, { recursive: true });
  const outputPath = join(outputDir, filename);
  await fs.writeFile(outputPath, JSON.stringify(data, null, 2));
  console.log(`Saved ${filename}`);
}

export async function loadJson(filename: string): Promise<any | null> {
  try {
    const outputDir = join(process.cwd(), "output");
    const filePath = join(outputDir, filename);
    const content = await fs.readFile(filePath, "utf8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
