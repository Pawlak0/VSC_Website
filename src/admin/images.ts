// Pictures are made smaller in the browser before they are saved, so a 4K screenshot does not land in the repo.

/** A file name from a picture's own name: "Bre 6 (final).PNG" becomes "bre-6-final". */
export function slugify(name: string): string {
  return (
    name
      .replace(/\.[^.]+$/, '')
      .toLowerCase()
      .replace(/ð/g, 'd')
      .replace(/þ/g, 'th')
      .replace(/æ/g, 'ae')
      .replace(/[øǿ]/g, 'o')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'picture'
  );
}

/** At most `maxWidth` wide, as JPEG for photos or PNG where a clear background matters (banners). */
export async function shrink(file: File, maxWidth: number, type: 'image/jpeg' | 'image/png'): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxWidth / bitmap.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot resize pictures.');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((ok, bad) =>
    canvas.toBlob((b) => (b ? ok(b) : bad(new Error(`Could not read ${file.name}.`))), type, type === 'image/jpeg' ? 0.9 : undefined),
  );
}
