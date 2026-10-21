// The Discord pictures of the members on the Fylki pages and profiles, copied at build time; see src/lib/clansmen.ts.
import type { APIRoute } from 'astro';
import { memberPictures } from '../../../lib/clansmen';

export async function getStaticPaths() {
  return (await memberPictures('members')).map(([name, file]) => ({ params: { name }, props: { file } }));
}

export const GET: APIRoute = ({ props }) => new Response(new Uint8Array(props.file as Buffer), { headers: { 'Content-Type': 'image/webp' } });
