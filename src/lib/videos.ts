// Members' videos for the home and Media pages. A YouTube link needs nothing else: YouTube's oEmbed
// endpoint gives the title and channel at build time. A video file kept in public/video/ plays from the site.
import type { Video } from '../data/clan';

export type VideoCard = {
  url: string;
  title: string;
  by?: string;
  /** The picture on the card. */
  thumb: string;
  /** Set for a YouTube video: its id, for the player. */
  youtube?: string;
  /** Set for a video file on the site: the still shown before it plays. */
  poster?: string;
  home?: boolean;
};

/** The video id in a watch, youtu.be, Shorts, live or embed link. Null when the link is not a YouTube video. */
export function videoId(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^(www|m)\./, '');
    if (host === 'youtu.be') return u.pathname.slice(1) || null;
    if (host !== 'youtube.com' && host !== 'youtube-nocookie.com') return null;
    if (u.pathname === '/watch') return u.searchParams.get('v');
    return u.pathname.match(/^\/(?:shorts|live|embed)\/([\w-]+)/)?.[1] ?? null;
  } catch {
    return null;
  }
}

/** A video file served by the site itself, e.g. /video/heathens.mp4. */
const isFile = (url: string) => /^\/video\/.+\.(mp4|webm)$/i.test(url);

async function details(url: string): Promise<{ title?: string; author_name?: string }> {
  try {
    const res = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    console.warn(`[youtube] no title for ${url}: ${(e as Error).message}`);
    return {};
  }
}

// Both pages ask for the same list during one build, so YouTube is asked once.
let cards: Promise<VideoCard[]> | undefined;

export function videoCards(list: Video[]): Promise<VideoCard[]> {
  cards ??= Promise.all(
    list.map(async (v): Promise<VideoCard | null> => {
      // The panel may leave empty fields as "", so those count as not set.
      if (isFile(v.url)) {
        // The still sits next to the file with the same name, unless `poster` names another.
        const poster = v.poster || v.url.replace(/\.\w+$/, '.webp');
        return { url: v.url, title: v.title || 'Völsung video', by: v.by || undefined, thumb: poster, poster, home: v.home };
      }
      const id = videoId(v.url);
      if (!id) {
        console.warn(`[videos] not a YouTube link or a file in /video/, skipped: ${v.url}`);
        return null;
      }
      const d = v.title && v.by ? {} : await details(v.url);
      return { url: v.url, title: v.title || d.title || 'Völsung video', by: v.by || d.author_name, thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, youtube: id, home: v.home };
    }),
  ).then((all) => all.filter((c): c is VideoCard => c !== null));
  return cards;
}
