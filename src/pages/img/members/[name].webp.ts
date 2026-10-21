// The Discord pictures of the members listed on the Fylki pages, copied at build time; see src/lib/clansmen.ts.
import type { APIRoute } from 'astro';
import { memberPictures } from '../../../lib/clansmen';

export async function getStaticPaths() {
  return (await memberPictures()).map(([name, file]) => ({ params: { name }, props: { file } }));
}

export const GET: APIRoute = ({ props }) => new Response(new Uint8Array(props.file as Buffer), { headers: { 'Content-Type': 'image/webp' } });
