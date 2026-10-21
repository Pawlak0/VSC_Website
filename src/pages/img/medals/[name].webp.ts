// The icons of the medal roles on the clan's Discord, copied at build time for the profiles; see src/lib/clansmen.ts.
import type { APIRoute } from 'astro';
import { memberPictures } from '../../../lib/clansmen';

export async function getStaticPaths() {
  return (await memberPictures('medals')).map(([name, file]) => ({ params: { name }, props: { file } }));
}

export const GET: APIRoute = ({ props }) => new Response(new Uint8Array(props.file as Buffer), { headers: { 'Content-Type': 'image/webp' } });
