// @ts-check
import { defineConfig } from 'astro/config';
import { readdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

// Photos uploaded through the panel can be full-size screenshots. The pages use only the resized copies, so the
// originals the build also copies out are left unpublished. The panel's thumbs.json counts as using its tiles.
const dropUnusedImages = {
  name: 'drop-unused-images',
  hooks: {
    'astro:build:done': async ({ dir }) => {
      const root = dir.pathname;
      const files = await readdir(root, { recursive: true });
      let used = '';
      for (const f of files) if (/\.(html|css|js|xml|json)$/.test(f)) used += await readFile(join(root, f), 'utf8');
      for (const f of await readdir(join(root, '_astro'))) {
        if (/\.(png|jpe?g|webp|avif)$/i.test(f) && !used.includes(f) && !used.includes(encodeURI(f))) await rm(join(root, '_astro', f));
      }
    },
  },
};

export default defineConfig({
  site: 'https://volsungclan.com',
  integrations: [dropUnusedImages],
  // Older addresses keep working: Fylki from before the names were corrected, and the Gallery page, now part of Media.
  redirects: {
    '/fylki/nordmor': '/fylki/nordmorr/',
    '/fylki/kattegad': '/fylki/kattegat/',
    '/gallery': '/media/',
  },
});
