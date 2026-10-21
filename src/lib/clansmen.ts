// The clan's people, read from the clan's Discord server while the site builds: each Fylki's members (everyone who has
// the role set for that Fylki in the site panel) and a profile for every Clansman, with their ranks, medals and other
// games taken from their roles. The site rebuilds every hour, so a role given or taken away shows within the hour.
// The clan's bot reads the server with the DISCORD_BOT_TOKEN secret in GitHub; without it, or when Discord does not
// answer, the lists and profiles stay out. Pictures are copied into the site, so visitors' browsers never ask Discord.
import { createHash } from 'node:crypto';
import { plainName } from './names';
import { CLANSMAN_ROLE_ID, DISCORD_GUILD_ID, PROFILE_SECTIONS, UNLISTED, folk, fylki, shieldwall, tiers, type Rank } from '../data/clan';

// Overridable only to try the lists against a pretend Discord.
const API: string = import.meta.env.DISCORD_API ?? 'https://discord.com/api/v10';
const CDN: string = import.meta.env.DISCORD_CDN ?? 'https://cdn.discordapp.com';
// Discord asks every caller to name itself.
const AGENT = 'DiscordBot (https://volsungclan.com, 1)';
const PICTURE = 96;
const MEDAL = 64;
const PAGE = 1000;

type GuildMember = {
  user: { id: string; username: string; global_name?: string | null; avatar?: string | null; bot?: boolean };
  nick?: string | null;
  avatar?: string | null;
  roles: string[];
  joined_at?: string | null;
};

type GuildRole = { id: string; name: string; position: number; color?: number; icon?: string | null; unicode_emoji?: string | null };

export type Clansman = {
  id: string;
  /** Their nickname on the clan's server, else their Discord name. */
  name: string;
  /** Their Discord picture, copied into the site; missing when it could not be copied. */
  picture?: string;
};

/** A medal is a role in the Medals section of the server's roles. */
export type Medal = {
  name: string;
  /** The role's own icon, copied into the site. */
  icon?: string;
  /** The emoji a role can show instead of an icon. */
  emoji?: string;
  /** The role's colour, as #rrggbb. */
  color?: string;
};

export type Profile = Clansman & {
  /** The name without the marks and rank tags in front of it, such as "‹ [Lǫgmaðr] ", for the page's heading. */
  plainName: string;
  /** The slug of their Fylki. */
  fylki?: string;
  /** Their ranks on the Ranks page, highest first, found by role name. */
  ranks: Rank[];
  medals: Medal[];
  /** Roles in the Other Games section. */
  games: string[];
  /** When they joined the clan's server. */
  joined?: string;
};

type Lists = { byRole: Map<string, Clansman[]>; profiles: Profile[]; pictures: Map<string, Buffer> };

let loaded: Promise<Lists | null> | undefined;
const lists = () => (loaded ??= read(import.meta.env.DISCORD_BOT_TOKEN));

/** Everyone with the role, sorted by name. Null when the lists cannot be read, so the page leaves them out. */
export async function clansmenWith(role?: string): Promise<Clansman[] | null> {
  if (!role) return null;
  const all = await lists();
  return all ? (all.byRole.get(role) ?? []) : null;
}

/** A profile for everyone with the Clansman role or a Fylki's role, sorted by name; empty when Discord cannot be read. */
export async function profiles(): Promise<Profile[]> {
  return (await lists())?.profiles ?? [];
}

/** The copied pictures by file name, served from /img/members/ (members) and /img/medals/ (medal icons). */
export async function memberPictures(folder: 'members' | 'medals'): Promise<[string, Buffer][]> {
  return [...((await lists())?.pictures ?? [])].filter(([name]) => name.startsWith(`${folder}/`)).map(([name, file]) => [name.slice(folder.length + 1), file]);
}

async function read(token?: string): Promise<Lists | null> {
  const roles = new Set(fylki.map((f) => f.discordRole).filter((r): r is string => Boolean(r)));
  if (!token) {
    console.warn('[discord] DISCORD_BOT_TOKEN is not set, the Fylki pages leave out their members and there are no profiles');
    return null;
  }
  try {
    const [members, guildRoles] = await Promise.all([everyone(token), get<GuildRole[]>(token, `/guilds/${DISCORD_GUILD_ID}/roles`)]);
    const listed = members.filter((m) => !m.user.bot && !UNLISTED.includes(m.user.id) && m.roles.some((r) => r === CLANSMAN_ROLE_ID || roles.has(r)));
    const pictures = new Map<string, Buffer>();
    const pictureOf = new Map<string, string>();
    const copy = async (folder: string, id: string, url: string, size: number) => {
      const file = await copyPicture(url, size);
      if (!file) return;
      const name = `${id}-${createHash('sha1').update(url).digest('hex').slice(0, 8)}`;
      pictures.set(`${folder}/${name}`, file);
      pictureOf.set(`${folder}/${id}`, `/img/${folder}/${name}.webp`);
    };
    const sections = roleSections(guildRoles);
    const medalRoles = guildRoles.filter((r) => sections.medals.has(r.id) && r.icon);
    const jobs = [
      ...listed.map((m) => () => copy('members', m.user.id, avatarUrl(m), PICTURE)),
      ...medalRoles.map((r) => () => copy('medals', r.id, `${CDN}/role-icons/${r.id}/${r.icon}.png?size=128`, MEDAL)),
    ];
    for (let i = 0; i < jobs.length; i += 25) await Promise.all(jobs.slice(i, i + 25).map((job) => job()));

    const clansman = (m: GuildMember): Clansman => ({ id: m.user.id, name: nameOf(m), picture: pictureOf.get(`members/${m.user.id}`) });
    const byName = (a: Clansman, b: Clansman) => sortKey(a.name).localeCompare(sortKey(b.name), 'en');
    const byRole = new Map<string, Clansman[]>();
    for (const role of roles) {
      const people = listed.filter((m) => m.roles.includes(role)).map(clansman).sort(byName);
      byRole.set(role, people);
      console.log(`[discord] ${fylki.find((f) => f.discordRole === role)?.name}: ${people.length} members`);
    }

    // Roles from the top of the server's list down, the order Discord shows them in on a profile.
    const ordered = [...guildRoles].sort((a, b) => b.position - a.position);
    const rankOf = new Map(ordered.flatMap((r) => (rankNamed(r.name) ? [[r.id, rankNamed(r.name)!] as const] : [])));
    const profileList = listed
      .map((m): Profile => {
        const own = ordered.filter((r) => m.roles.includes(r.id));
        const tag = nameOf(m).match(/\[([^\]]+)\]/)?.[1];
        const ranks = [...new Set(own.map((r) => rankOf.get(r.id)).filter((r): r is Rank => Boolean(r)))];
        if (!ranks.length && tag && rankNamed(tag)) ranks.push(rankNamed(tag)!);
        return {
          ...clansman(m),
          plainName: plainName(nameOf(m)),
          fylki: fylki.find((f) => f.discordRole && m.roles.includes(f.discordRole))?.slug,
          ranks: ranks.sort((a, b) => RANKS.indexOf(a) - RANKS.indexOf(b)),
          medals: own
            .filter((r) => sections.medals.has(r.id))
            .map((r) => ({ name: r.name, icon: pictureOf.get(`medals/${r.id}`), emoji: r.unicode_emoji ?? undefined, color: r.color ? `#${r.color.toString(16).padStart(6, '0')}` : undefined })),
          games: own.filter((r) => sections.games.has(r.id)).map((r) => r.name),
          joined: m.joined_at ?? undefined,
        };
      })
      .sort(byName);
    const names = (ids: Set<string>) => ordered.filter((r) => ids.has(r.id)).map((r) => r.name).join(', ') || 'none';
    console.log(`[discord] ${profileList.length} profiles, ${profileList.filter((p) => p.medals.length).length} with medals`);
    console.log(`[discord] medals: ${names(sections.medals)}`);
    console.log(`[discord] other games: ${names(sections.games)}`);
    return { byRole, profiles: profileList, pictures };
  } catch (e) {
    console.warn(`[discord] members not loaded, the Fylki pages leave them out and there are no profiles: ${(e as Error).message}`);
    return null;
  }
}

async function get<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bot ${token}`, 'User-Agent': AGENT }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Discord answered ${res.status}`);
  return (await res.json()) as T;
}

/** Every member of the clan's server, a thousand at a time. */
async function everyone(token: string): Promise<GuildMember[]> {
  const all: GuildMember[] = [];
  for (let after = '0'; ; ) {
    const page = await get<GuildMember[]>(token, `/guilds/${DISCORD_GUILD_ID}/members?limit=${PAGE}&after=${after}`);
    all.push(...page);
    if (page.length < PAGE) return all;
    after = page[page.length - 1].user.id;
  }
}

/** A divider names a section of the role list: it starts with a line or a mark, not a letter or a number. */
const isDivider = (r: GuildRole) => r.id !== DISCORD_GUILD_ID && /^[^\p{L}\p{N}]/u.test(r.name.trim());

/** The roles under each section's divider, down to the next divider. */
function roleSections(roles: GuildRole[]): Record<keyof typeof PROFILE_SECTIONS, Set<string>> {
  const ordered = [...roles].sort((a, b) => b.position - a.position);
  const under = (word: string) => {
    const start = ordered.findIndex((r) => isDivider(r) && r.name.toLowerCase().includes(word));
    const found = new Set<string>();
    if (start < 0) return found;
    for (const r of ordered.slice(start + 1)) {
      if (isDivider(r) || r.id === DISCORD_GUILD_ID) break;
      found.add(r.id);
    }
    return found;
  };
  return { medals: under(PROFILE_SECTIONS.medals), games: under(PROFILE_SECTIONS.games) };
}

/** Every rank on the Ranks page, highest first. */
const RANKS: Rank[] = [...tiers.flatMap((t) => t.ranks), ...shieldwall.flatMap((row) => [row.infantry, row.archers, row.civilians]), ...folk];
/** Names compared without accents and case, so the role "Lǫgmaðr" is the rank "Lögmaðr". */
const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase();
const rankNamed = (name: string) => RANKS.find((r) => fold(r.name) === fold(name));

const nameOf = (m: GuildMember) => m.nick || m.user.global_name || m.user.username;

/** Sorts past the marks and tags but by the rune in front, which the clan uses to put the ranks in order. */
const sortKey = (name: string) => (name.replace(/^(?:[^\p{L}\p{N}\[]|\[[^\]]*\])*/u, '').trim() || name).toLocaleLowerCase('en');

/** Their picture on the clan's server, else on Discord, else one of Discord's default ones. */
function avatarUrl(m: GuildMember): string {
  if (m.avatar) return `${CDN}/guilds/${DISCORD_GUILD_ID}/users/${m.user.id}/avatars/${m.avatar}.png?size=128`;
  if (m.user.avatar) return `${CDN}/avatars/${m.user.id}/${m.user.avatar}.png?size=128`;
  return `${CDN}/embed/avatars/${Number((BigInt(m.user.id) >> 22n) % 6n)}.png`;
}

async function copyPicture(url: string, size: number): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': AGENT }, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const { default: sharp } = await import('sharp');
    return await sharp(Buffer.from(await res.arrayBuffer()))
      .resize(size, size, { fit: size === MEDAL ? 'contain' : 'cover', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    return null;
  }
}
