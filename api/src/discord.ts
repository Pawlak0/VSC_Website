// The calls to Discord: swapping the sign-in code for a short-lived token, reading the signed-in person's membership
// of the clan server with it, and the bot's look-up of a member, used later to check they still have the role.
import type { Env } from './index';

/** A member of the clan server, as Discord describes them. */
export type Member = {
  user: { id: string; username: string; global_name?: string | null; avatar?: string | null };
  nick?: string | null;
  avatar?: string | null;
  roles: string[];
};

export class DiscordError extends Error {}

// Discord asks every caller to name itself.
const AGENT = 'DiscordBot (https://volsungclan.com, 1)';

const appAuth = (env: Env) => ({
  'User-Agent': AGENT,
  'Content-Type': 'application/x-www-form-urlencoded',
  Authorization: `Basic ${btoa(`${env.DISCORD_CLIENT_ID}:${env.DISCORD_CLIENT_SECRET}`)}`,
});

/** Swaps the code Discord sent back for an access token, which only this Worker ever sees. */
export async function exchangeCode(env: Env, code: string): Promise<string> {
  const res = await fetch(`${env.DISCORD_API}/oauth2/token`, {
    method: 'POST',
    headers: appAuth(env),
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: `${env.API}/auth/callback` }),
  });
  if (!res.ok) throw new DiscordError(`Discord answered ${res.status} to the code`);
  const { access_token } = await res.json<{ access_token?: string }>();
  if (!access_token) throw new DiscordError('Discord sent no token');
  return access_token;
}

/** Cancels the token once the membership is read, so it cannot be used again even by us. */
export async function revoke(env: Env, token: string): Promise<void> {
  await fetch(`${env.DISCORD_API}/oauth2/token/revoke`, {
    method: 'POST',
    headers: appAuth(env),
    body: new URLSearchParams({ token, token_type_hint: 'access_token' }),
  });
}

/** The signed-in person's membership of the clan server, or null when they are not on it. */
export async function ownMembership(env: Env, token: string): Promise<Member | null> {
  return member(await fetch(`${env.DISCORD_API}/users/@me/guilds/${env.DISCORD_GUILD_ID}/member`, { headers: { 'User-Agent': AGENT, Authorization: `Bearer ${token}` } }));
}

/** A member of the clan server looked up by the clan's bot, or null when they have left it. */
export async function membership(env: Env, id: string): Promise<Member | null> {
  return member(await fetch(`${env.DISCORD_API}/guilds/${env.DISCORD_GUILD_ID}/members/${id}`, { headers: { 'User-Agent': AGENT, Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` } }));
}

async function member(res: Response): Promise<Member | null> {
  if (res.status === 404) return null;
  if (!res.ok) throw new DiscordError(`Discord answered ${res.status}`);
  return res.json<Member>();
}

/** The name the clan knows them by: their nickname on the server, else their Discord display name. */
export const nameOf = (m: Member) => m.nick || m.user.global_name || m.user.username;

/** Their avatar on the clan server, else on Discord, else one of Discord's default ones. */
export function avatarOf(m: Member, guild: string): string {
  const cdn = 'https://cdn.discordapp.com';
  if (m.avatar) return `${cdn}/guilds/${guild}/users/${m.user.id}/avatars/${m.avatar}.png?size=128`;
  if (m.user.avatar) return `${cdn}/avatars/${m.user.id}/${m.user.avatar}.png?size=128`;
  return `${cdn}/embed/avatars/${Number((BigInt(m.user.id) >> 22n) % 6n)}.png`;
}
