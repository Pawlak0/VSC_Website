// The width and height of a picture the site panel keeps in public/, read at build time, so the page keeps its room
// before the picture loads.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function pictureSize(src?: string): Promise<{ width?: number; height?: number }> {
  if (!src?.startsWith('/')) return {};
  try {
    const { default: sharp } = await import('sharp');
    const { width, height } = await sharp(await readFile(join(process.cwd(), 'public', src))).metadata();
    return { width, height };
  } catch {
    return {};
  }
}
