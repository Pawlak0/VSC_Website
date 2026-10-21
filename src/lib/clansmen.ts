// The members of each Fylki, read from the clan's Discord server while the site builds: everyone who has the role set
// for that Fylki in the site panel. The site rebuilds every hour, so a role given or taken away shows within the hour.
// The clan's bot reads the server with the DISCORD_BOT_TOKEN secret in GitHub; without it, or when Discord does not
// answer, the lists stay hidden. Pictures are copied into the site, so visitors' browsers never ask Discord for them.
import { createHash } from 'node:crypto';
import { DISCORD_GUILD_ID, UNLISTED, fylki } from '../data/clan';

// Overridable only to try the lists against a pretend Discord.
const API: string = import.meta.env.DISCORD_API ?? 'https://discord.com/api/v10';
const CDN: string = import.meta.env.DISCORD_CDN ?? 'https://cdn.discordapp.com';
// Discord asks every caller to name itself.
const AGENT = 'DiscordBot (https://volsungclan.com, 1)';
const PICTURE = 96;
const PAGE = 1000;

type GuildMember = {
  user: { id: string; username: string; global_name?: string | null; avatar?: string | null; bot?: boolean };
  nick?: string | null;
  avatar?: string | null;
  roles: string[];
};

export type Clansman = {
  id: string;
  /** Their nickname on the clan's server, else their Discord name. */
  name: string;
  /** Their Discord picture, copied into the site; missing when it could not be copied. */
  picture?: string;
};

type Lists = { byRole: Map<string, Clansman[]>; pictures: Map<string, Buffer> };

let loaded: Promise<Lists | null> | undefined;
const lists = () => (loaded ??= read(import.meta.env.DISCORD_BOT_TOKEN));

/** Everyone with the role, sorted by name. Null when the lists cannot be read, so the page leaves them out. */
export async function clansmenWith(role?: string): Promise<Clansman[] | null> {
  if (!role) return null;
  const all = await lists();
  return all ? (all.byRole.get(role) ?? []) : null;
}

/** The copied pictures by file name, served from /img/members/. */
export async function memberPictures(): Promise<[string, Buffer][]> {
  return [...((await lists())?.pictures ?? [])];
}

async function read(token?: string): Promise<Lists | null> {
  const roles = new Set(fylki.map((f) => f.discordRole).filter((r): r is string => Boolean(r)));
  if (!roles.size) return null;
  if (!token) {
    console.warn('[discord] DISCORD_BOT_TOKEN is not set, the Fylki pages leave out their members');
    return null;
  }
  try {
    const listed = (await everyone(token)).filter((m) => !m.user.bot && !UNLISTED.includes(m.user.id) && m.roles.some((r) => roles.has(r)));
    const pictures = new Map<string, Buffer>();
    const pictureOf = new Map<string, string>();
    for (let i = 0; i < listed.length; i += 10) {
      await Promise.all(
        listed.slice(i, i + 10).map(async (m) => {
          const url = avatarUrl(m);
          const file = await copyPicture(url);
          if (!file) return;
          const name = `${m.user.id}-${createHash('sha1').update(url).digest('hex').slice(0, 8)}`;
          pictures.set(name, file);
          pictureOf.set(m.user.id, `/img/members/${name}.webp`);
        }),
      );
    }
    const byRole = new Map<string, Clansman[]>();
    for (const role of roles) {
      const people = listed
        .filter((m) => m.roles.includes(role))
        .map((m) => ({ id: m.user.id, name: nameOf(m), picture: pictureOf.get(m.user.id) }))
        .sort((a, b) => sortKey(a.name).localeCompare(sortKey(b.name), 'en'));
      byRole.set(role, people);
      console.log(`[discord] ${fylki.find((f) => f.discordRole === role)?.name}: ${people.length} members`);
    }
    return { byRole, pictures };
  } catch (e) {
    console.warn(`[discord] members not loaded, the Fylki pages leave them out: ${(e as Error).message}`);
    return null;
  }
}

/** Every member of the clan's server, a thousand at a time. */
async function everyone(token: string): Promise<GuildMember[]> {
  const all: GuildMember[] = [];
  for (let after = '0'; ; ) {
    const res = await fetch(`${API}/guilds/${DISCORD_GUILD_ID}/members?limit=${PAGE}&after=${after}`, {
      headers: { Authorization: `Bot ${token}`, 'User-Agent': AGENT },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`Discord answered ${res.status}`);
    const page = (await res.json()) as GuildMember[];
    all.push(...page);
    if (page.length < PAGE) return all;
    after = page[page.length - 1].user.id;
  }
}

const nameOf = (m: GuildMember) => m.nick || m.user.global_name || m.user.username;

/** Sorts by the name itself, past leading marks and tags such as "‹ [Lǫgmaðr] ". */
const sortKey = (name: string) => (name.replace(/^(?:[^\p{L}\p{N}\[]|\[[^\]]*\])*/u, '') || name).toLocaleLowerCase('en');

/** Their picture on the clan's server, else on Discord, else one of Discord's default ones. */
function avatarUrl(m: GuildMember): string {
  if (m.avatar) return `${CDN}/guilds/${DISCORD_GUILD_ID}/users/${m.user.id}/avatars/${m.avatar}.png?size=128`;
  if (m.user.avatar) return `${CDN}/avatars/${m.user.id}/${m.user.avatar}.png?size=128`;
  return `${CDN}/embed/avatars/${Number((BigInt(m.user.id) >> 22n) % 6n)}.png`;
}

async function copyPicture(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': AGENT }, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const { default: sharp } = await import('sharp');
    return await sharp(Buffer.from(await res.arrayBuffer()))
      .resize(PICTURE, PICTURE, { fit: 'cover' })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    return null;
  }
}
