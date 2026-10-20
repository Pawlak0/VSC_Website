// Small copies of every gallery photo for the panel, keyed by the path the data files use.
import type { APIRoute, ImageMetadata } from 'astro';
import { getImage } from 'astro:assets';

const files = import.meta.glob<{ default: ImageMetadata }>('/src/assets/gallery/*.{png,jpg,jpeg,webp,avif}', { eager: true });

export const GET: APIRoute = async () => {
  const thumbs: Record<string, string> = {};
  for (const [path, file] of Object.entries(files)) {
    thumbs[path] = (await getImage({ src: file.default, width: Math.min(file.default.width, 480), format: 'webp', quality: 70 })).src;
  }
  return new Response(JSON.stringify(thumbs), { headers: { 'Content-Type': 'application/json' } });
};
