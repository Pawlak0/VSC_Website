// Helpers for News posts: their dates in words and their pictures, which sit in src/assets/gallery/ like the photos.
import { getImage } from 'astro:assets';
import type { ImageMetadata } from 'astro';

const files = import.meta.glob<{ default: ImageMetadata }>('/src/assets/gallery/*.{png,jpg,jpeg,webp,avif}', { eager: true });

/** 2026-10-18 becomes 18 October 2026. */
export const newsDate = (d: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : d;

/** A post's picture at most `width` wide; JPEG for the picture shown when a post is shared. */
export async function postPicture(src: string | undefined, width: number, format: 'webp' | 'jpg' = 'webp') {
  const file = src ? files[src]?.default : undefined;
  if (!file) return undefined;
  return (await getImage({ src: file, width: Math.min(file.width, width), format, quality: 80 })).src;
}
