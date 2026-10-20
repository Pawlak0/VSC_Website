// Smaller copies of the map of the Jarldom for smaller screens, so a phone does not download the whole picture.
// The panel keeps the map in public/, which Astro serves as it is, so the copies are made here at build time with
// sharp, the library Astro uses for its own pictures. They are only resized, and saved at a JPEG quality high enough
// that the copy cannot be told apart from the full map shrunk to the same size.
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { jarldomMap } from '../data/clan';

const WIDTHS = [960, 1440];
const QUALITY = 95;

export type MapCopy = { name: string; width: number; src: string };
type MapPicture = { width: number; height: number; copies: MapCopy[]; file: Buffer };

let loaded: Promise<MapPicture | null> | undefined;

/** The map's own size and its smaller copies, smallest first. Null while the map is off, or if it cannot be read. */
export const mapPicture = () => (loaded ??= load());

async function load(): Promise<MapPicture | null> {
  if (!jarldomMap.on || !jarldomMap.picture) return null;
  try {
    const file = await readFile(join(process.cwd(), 'public', jarldomMap.picture));
    const { default: sharp } = await import('sharp');
    const { width = 0, height = 0 } = await sharp(file).metadata();
    // In the file name, so a new map is never mixed up with the copies of an old one in a browser's cache.
    const hash = createHash('sha1').update(file).digest('hex').slice(0, 8);
    const copies = WIDTHS.filter((w) => w < width * 0.9).map((w) => ({ name: `${hash}-${w}`, width: w, src: `/img/map/${hash}-${w}.jpg` }));
    return { width, height, copies, file };
  } catch (e) {
    console.warn(`Map of the Jarldom: no smaller copies (${(e as Error).message}); the page uses the picture as it is.`);
    return null;
  }
}

export async function mapCopy(width: number) {
  const map = await mapPicture();
  const { default: sharp } = await import('sharp');
  return sharp(map!.file).resize({ width }).jpeg({ quality: QUALITY }).toBuffer();
}
