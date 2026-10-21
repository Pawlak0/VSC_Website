// The clan's API at api.volsungclan.com: Discord sign-in for members of the Völsung Clan. The website stays static on
// GitHub Pages and asks this Worker who is signed in. Only people on the clan's Discord server with the Völsung
// Clansman role get in; the role is checked at sign-in, again at most an hour later while they use the site, and by
// the hourly check, which signs out anyone who has lost it.
import { DiscordError, exchangeCode, membership, ownMembership, revoke } from './discord';
import { SESSION_DAYS, dueForCheck, endAllSessions, endSession, findSession, forget, freeze, randomToken, saveMember, startSession, tidy, underLimit, type Account } from './store';

export interface Env {
  DB: D1Database;
  /** The website, the only page allowed to call this API. */
  SITE: string;
  /** This Worker's own address, where Discord sends people back. */
  API: string;
  /** Where the "signed in" hint cookie is readable; empty when trying it out locally. */
  COOKIE_DOMAIN: string;
  DISCORD_CLIENT_ID: string;
  DISCORD_GUILD_ID: string;
  MEMBER_ROLE_ID: string;
  DISCORD_API: string;
  DISCORD_AUTHORIZE: string;
  DISCORD_CLIENT_SECRET: string;
  DISCORD_BOT_TOKEN: string;
}

// The session cookie belongs to this API alone and scripts on the page cannot read it (__Host-, HttpOnly). The hint
// cookie says only that someone is signed in, so pages know to ask this API who it is.
const SESSION = '__Host-vsc_session';
const LOGIN = '__Host-vsc_login';
const HINT = 'vsc_signed_in';
const RECHECK = 60 * 60 * 1000;
const SIGN_INS_PER_MINUTE = 20;

const cookie = (name: string, value: string, maxAge: number, more = '') => `${name}=${value}; Path=/; Max-Age=${maxAge}; Secure; SameSite=Lax${more}`;
const sessionCookie = (token: string, maxAge: number) => cookie(SESSION, token, maxAge, '; HttpOnly');
const hintCookie = (env: Env, on: boolean) => cookie(HINT, on ? '1' : '', on ? SESSION_DAYS * 86400 : 0, env.COOKIE_DOMAIN ? `; Domain=${env.COOKIE_DOMAIN}` : '');
const signedOut = (env: Env) => [sessionCookie('', 0), hintCookie(env, false)];

function readCookie(req: Request, name: string): string | null {
  for (const part of (req.headers.get('Cookie') ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

const baseHeaders = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };
const corsHeaders = (env: Env) => ({ 'Access-Control-Allow-Origin': env.SITE, 'Access-Control-Allow-Credentials': 'true', Vary: 'Origin' });

function respond(env: Env, body: unknown, status = 200, cookies: string[] = []): Response {
  const headers = new Headers({ ...baseHeaders, ...corsHeaders(env) });
  if (body !== null) headers.set('Content-Type', 'application/json');
  for (const c of cookies) headers.append('Set-Cookie', c);
  return new Response(body === null ? null : JSON.stringify(body), { status, headers });
}

function redirect(to: string, cookies: string[] = []): Response {
  const headers = new Headers({ ...baseHeaders, Location: to });
  for (const c of cookies) headers.append('Set-Cookie', c);
  return new Response(null, { status: 302, headers });
}

/** Only addresses on the website itself, so the sign-in cannot be used to send people elsewhere. */
const safePath = (p: string | null) => (p && p.startsWith('/') && !p.startsWith('//') && !p.includes('\\') && p.length < 200 ? p : '/account/');

/** Compares two strings in time that does not depend on where they differ. */
function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const address = (req: Request) => req.headers.get('CF-Connecting-IP') ?? 'unknown';

/** Step 1: off to Discord, with a random state kept in a cookie to prove later that the answer belongs to this visit. */
async function login(req: Request, url: URL, env: Env): Promise<Response> {
  if (!(await underLimit(env.DB, address(req), SIGN_INS_PER_MINUTE, Date.now()))) return redirect(`${env.SITE}/account/?error=busy`);
  const state = randomToken();
  const params = new URLSearchParams({ response_type: 'code', client_id: env.DISCORD_CLIENT_ID, scope: 'identify guilds.members.read', redirect_uri: `${env.API}/auth/callback`, state });
  const back = safePath(url.searchParams.get('return'));
  return redirect(`${env.DISCORD_AUTHORIZE}?${params.toString().replace(/\+/g, '%20')}`, [cookie(LOGIN, `${state}.${encodeURIComponent(back)}`, 600, '; HttpOnly')]);
}

/** Step 2: Discord sends the person back with a code. Only Clansmen get a session; nothing is kept about anyone else. */
async function callback(req: Request, url: URL, env: Env, ctx: ExecutionContext): Promise<Response> {
  const saved = readCookie(req, LOGIN) ?? '';
  const dot = saved.indexOf('.');
  const state = dot > 0 ? saved.slice(0, dot) : '';
  const back = safePath(dot > 0 ? decodeURIComponent(saved.slice(dot + 1)) : null);
  const done = cookie(LOGIN, '', 0, '; HttpOnly');
  const fail = (why: string) => redirect(`${env.SITE}/account/?error=${why}`, [done]);

  if (!(await underLimit(env.DB, address(req), SIGN_INS_PER_MINUTE, Date.now()))) return fail('busy');
  if (url.searchParams.get('error')) return fail('cancelled');
  const code = url.searchParams.get('code');
  if (!code || !state || !same(state, url.searchParams.get('state') ?? '')) return fail('expired');

  let member;
  try {
    const token = await exchangeCode(env, code);
    try {
      member = await ownMembership(env, token);
    } finally {
      ctx.waitUntil(revoke(env, token).catch(() => {}));
    }
  } catch (e) {
    console.warn('Sign-in failed:', e instanceof DiscordError ? e.message : e);
    return fail('failed');
  }
  if (!member) return fail('not-in-clan');
  if (!member.roles.includes(env.MEMBER_ROLE_ID)) return fail('no-role');

  const now = Date.now();
  await saveMember(env.DB, member, env.DISCORD_GUILD_ID, now, true);
  const token = await startSession(env.DB, member.user.id, now);
  return redirect(env.SITE + back, [done, sessionCookie(token, SESSION_DAYS * 86400), hintCookie(env, true)]);
}

/** Asks the clan's bot whether a member still has the role: 'member', 'gone' (now signed out), or 'unknown' when
 * Discord does not answer, in which case nothing changes and the next check tries again. */
async function recheck(env: Env, id: string): Promise<'member' | 'gone' | 'unknown'> {
  let member;
  try {
    member = await membership(env, id);
  } catch (e) {
    console.warn('Role check failed:', e instanceof DiscordError ? e.message : e);
    return 'unknown';
  }
  const now = Date.now();
  if (member?.roles.includes(env.MEMBER_ROLE_ID)) {
    await saveMember(env.DB, member, env.DISCORD_GUILD_ID, now, false);
    return 'member';
  }
  await freeze(env.DB, id, now);
  return 'gone';
}

/** The member behind the request's session cookie, with the role checked again if the last check is over an hour old. */
async function signedIn(req: Request, env: Env): Promise<Account | null> {
  const token = readCookie(req, SESSION);
  if (!token) return null;
  const account = await findSession(env.DB, token, Date.now());
  if (!account) return null;
  if (Date.now() - account.checked_at > RECHECK && (await recheck(env, account.id)) === 'gone') return null;
  return account;
}

async function me(req: Request, env: Env): Promise<Response> {
  const account = await signedIn(req, env);
  if (!account) return respond(env, { error: 'signed-out' }, 401, [hintCookie(env, false)]);
  return respond(env, { id: account.id, name: account.name, avatar: account.avatar, memberSince: account.first_seen });
}

/** Changes come only from the website itself: other sites cannot sign anyone out or delete an account. */
const fromSite = (req: Request, env: Env) => req.headers.get('Origin') === env.SITE;

async function logout(req: Request, env: Env, everywhere: boolean): Promise<Response> {
  if (!fromSite(req, env)) return respond(env, { error: 'forbidden' }, 403);
  const token = readCookie(req, SESSION);
  if (token && everywhere) {
    const account = await findSession(env.DB, token, Date.now());
    if (account) await endAllSessions(env.DB, account.id);
  } else if (token) {
    await endSession(env.DB, token);
  }
  return respond(env, null, 204, signedOut(env));
}

async function deleteAccount(req: Request, env: Env): Promise<Response> {
  if (!fromSite(req, env)) return respond(env, { error: 'forbidden' }, 403);
  const token = readCookie(req, SESSION);
  const account = token && (await findSession(env.DB, token, Date.now()));
  if (!account) return respond(env, { error: 'signed-out' }, 401, signedOut(env));
  await forget(env.DB, account.id);
  return respond(env, null, 204, signedOut(env));
}

export default {
  async fetch(req, env, ctx): Promise<Response> {
    const url = new URL(req.url);
    try {
      if (req.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: { ...corsHeaders(env), 'Access-Control-Allow-Methods': 'GET, POST', 'Access-Control-Max-Age': '600' } });
      }
      switch (`${req.method} ${url.pathname}`) {
        case 'GET /':
          return redirect(env.SITE);
        case 'GET /robots.txt':
          return new Response('User-agent: *\nDisallow: /\n', { headers: { ...baseHeaders, 'Content-Type': 'text/plain' } });
        case 'GET /auth/login':
          return await login(req, url, env);
        case 'GET /auth/callback':
          return await callback(req, url, env, ctx);
        case 'GET /me':
          return await me(req, env);
        case 'POST /auth/logout':
          return await logout(req, env, false);
        case 'POST /auth/logout-all':
          return await logout(req, env, true);
        case 'POST /me/delete':
          return await deleteAccount(req, env);
      }
      return respond(env, { error: 'not-found' }, 404);
    } catch (e) {
      console.error('Request failed:', url.pathname, e instanceof Error ? e.message : e);
      return respond(env, { error: 'server' }, 500);
    }
  },

  // Hourly: tidy up, then ask the bot about up to 40 members whose role was last confirmed over a day ago. Anyone
  // without the role is signed out and frozen; the tidy-up deletes them 4 months later.
  async scheduled(_event, env): Promise<void> {
    const now = Date.now();
    await tidy(env.DB, now);
    for (const id of await dueForCheck(env.DB, now, 40)) {
      if ((await recheck(env, id)) === 'unknown') break;
    }
  },
} satisfies ExportedHandler<Env>;
