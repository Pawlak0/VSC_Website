// The links Clansmen chose to show on their profiles: a button to message them on Discord, and their Steam profile.
// Members set them on the account page and the clan's API keeps them (api/); the site reads them when it builds.
import { API_URL } from './members';

export type ProfileLinks = { discord?: boolean; steam?: string };

let all: Promise<Record<string, ProfileLinks>> | undefined;

/** Everyone's links by Discord user ID, read once per build. Empty when the API does not answer. */
export function profileLinks(): Promise<Record<string, ProfileLinks>> {
  return (all ??= (async () => {
    try {
      const res = await fetch(`${API_URL}/links`, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error(`the API answered ${res.status}`);
      const links: Record<string, ProfileLinks> = await res.json();
      // The API only keeps Steam profile links, but the site checks again before linking anywhere.
      for (const l of Object.values(links)) if (l.steam && !l.steam.startsWith('https://steamcommunity.com/')) delete l.steam;
      console.log(`[api] Profile links: ${Object.keys(links).length} members show some`);
      return links;
    } catch (e) {
      console.warn(`[api] Profile links left out: ${e instanceof Error ? e.message : e}`);
      return {};
    }
  })());
}
