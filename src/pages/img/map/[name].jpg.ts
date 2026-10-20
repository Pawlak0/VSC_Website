// Smaller copies of the map of the Jarldom, made at build time; see src/lib/map-picture.ts.
import type { APIRoute } from 'astro';
import { mapCopy, mapPicture } from '../../../lib/map-picture';

export async function getStaticPaths() {
  return ((await mapPicture())?.copies ?? []).map((c) => ({ params: { name: c.name }, props: { width: c.width } }));
}

export const GET: APIRoute = async ({ props }) => new Response(new Uint8Array(await mapCopy(props.width)), { headers: { 'Content-Type': 'image/jpeg' } });
