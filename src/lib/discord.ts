// Member and online counts from the public Discord invite. Discord answers this without a bot
// or a token. The site reads it while it builds and the browser refreshes it on load.

export type DiscordCounts = { members: number; online: number };

export const inviteCode = (url: string) => new URL(url).pathname.split('/').filter(Boolean).pop() ?? '';

export const inviteApi = (code: string) => `https://discord.com/api/v10/invites/${code}?with_counts=true`;

/** Null when Discord cannot be reached, so the page builds without the counts. */
export async function fetchCounts(code: string): Promise<DiscordCounts | null> {
  try {
    const res = await fetch(inviteApi(code), { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = await res.json();
    const members = data.approximate_member_count;
    const online = data.approximate_presence_count;
    return typeof members === 'number' && typeof online === 'number' ? { members, online } : null;
  } catch {
    return null;
  }
}
