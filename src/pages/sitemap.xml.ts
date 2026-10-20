// The list of pages search engines should index, built from the same data as the pages.
import type { APIRoute } from 'astro';
import { fylki, hasPage } from '../data/clan';

export const GET: APIRoute = ({ site }) => {
  const pages = [
    '/',
    '/media/',
    ...fylki.flatMap((f) => [`/fylki/${f.slug}/`, ...f.flokkr.filter(hasPage).map((k) => `/fylki/${f.slug}/${k.slug}/`)]),
  ];
  const urls = pages.map((p) => `  <url><loc>${new URL(p, site)}</loc></url>`).join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml' } });
};
