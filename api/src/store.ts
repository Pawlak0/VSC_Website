// The members' database (Cloudflare D1, kept in the EU): who has signed in, and their sessions. A session's cookie is
// a random token; the database keeps only its SHA-256 hash, so a copy of the database cannot be used to sign in.
import { avatarOf, nameOf, type Member } from './discord';

export const SESSION_DAYS = 30;
const DAY = 24 * 60 * 60 * 1000;

export type Account = { id: string; name: string; avatar: string; first_seen: number; checked_at: number; show_discord: number; steam: string | null };

/** What a member chose to show on their profile: a button to message them on Discord, and a link to their Steam profile. */
export type Links = { discord: boolean; steam: string | null };

export function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function sha256(text: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Records a member who has just signed in or been confirmed by the bot, and lifts a freeze if they had one. */
export async function saveMember(db: D1Database, m: Member, guild: string, now: number, signedIn: boolean): Promise<void> {
  await db
    .prepare(
      `INSERT INTO members (id, name, avatar, first_seen, last_login, checked_at, left_at) VALUES (?1, ?2, ?3, ?4, ?4, ?4, NULL)
       ON CONFLICT (id) DO UPDATE SET name = ?2, avatar = ?3, checked_at = ?4, left_at = NULL, last_login = CASE WHEN ?5 THEN ?4 ELSE last_login END`,
    )
    .bind(m.user.id, nameOf(m), avatarOf(m, guild), now, signedIn ? 1 : 0)
    .run();
}

/** Starts a session and returns the token for its cookie. Expired sessions of the same member go at the same time. */
export async function startSession(db: D1Database, memberId: string, now: number): Promise<string> {
  const token = randomToken();
  await db.batch([
    db.prepare('DELETE FROM sessions WHERE member_id = ? AND expires_at <= ?').bind(memberId, now),
    db.prepare('INSERT INTO sessions (token_hash, member_id, created_at, expires_at) VALUES (?, ?, ?, ?)').bind(await sha256(token), memberId, now, now + SESSION_DAYS * DAY),
  ]);
  return token;
}

/** The member a session cookie belongs to, while the session lasts and the member has not left. */
export async function findSession(db: D1Database, token: string, now: number): Promise<Account | null> {
  return db
    .prepare(
      `SELECT m.id, m.name, m.avatar, m.first_seen, m.checked_at, m.show_discord, m.steam FROM sessions s JOIN members m ON m.id = s.member_id
       WHERE s.token_hash = ? AND s.expires_at > ? AND m.left_at IS NULL`,
    )
    .bind(await sha256(token), now)
    .first<Account>();
}

export async function saveLinks(db: D1Database, memberId: string, links: Links): Promise<void> {
  await db.prepare('UPDATE members SET show_discord = ?, steam = ? WHERE id = ?').bind(links.discord ? 1 : 0, links.steam, memberId).run();
}

/** Every member's chosen links, for the website to put on the profiles when it builds: only members still in the clan
 * who turned something on. */
export async function publicLinks(db: D1Database): Promise<Record<string, Partial<Links>>> {
  const { results } = await db
    .prepare('SELECT id, show_discord, steam FROM members WHERE left_at IS NULL AND (show_discord = 1 OR steam IS NOT NULL)')
    .all<{ id: string; show_discord: number; steam: string | null }>();
  return Object.fromEntries(results.map((r) => [r.id, { ...(r.show_discord ? { discord: true } : {}), ...(r.steam ? { steam: r.steam } : {}) }]));
}

export async function endSession(db: D1Database, token: string): Promise<void> {
  await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run();
}

export async function endAllSessions(db: D1Database, memberId: string): Promise<void> {
  await db.prepare('DELETE FROM sessions WHERE member_id = ?').bind(memberId).run();
}

/** Someone without the role any more: signed out everywhere at once, account kept frozen in case they come back. */
export async function freeze(db: D1Database, memberId: string, now: number): Promise<void> {
  await db.batch([
    db.prepare('DELETE FROM sessions WHERE member_id = ?').bind(memberId),
    db.prepare('UPDATE members SET left_at = COALESCE(left_at, ?) WHERE id = ?').bind(now, memberId),
  ]);
}

/** Deletes everything kept about a member, on their own request. */
export async function forget(db: D1Database, memberId: string): Promise<void> {
  await db.batch([db.prepare('DELETE FROM sessions WHERE member_id = ?').bind(memberId), db.prepare('DELETE FROM members WHERE id = ?').bind(memberId)]);
}

/** Counts an attempt to sign in from one network address and says whether it is still under the limit for the minute. */
export async function underLimit(db: D1Database, address: string, perMinute: number, now: number): Promise<boolean> {
  const row = await db
    .prepare('INSERT INTO hits (key, minute, count) VALUES (?, ?, 1) ON CONFLICT (key, minute) DO UPDATE SET count = count + 1 RETURNING count')
    .bind(await sha256(`sign-in ${address}`), Math.floor(now / 60000))
    .first<{ count: number }>();
  return (row?.count ?? 0) <= perMinute;
}

/** Hourly upkeep: expired sessions, old attempt counts, and accounts of people who left the clan over 4 months ago. */
export async function tidy(db: D1Database, now: number): Promise<void> {
  const fourMonthsAgo = new Date(now);
  fourMonthsAgo.setUTCMonth(fourMonthsAgo.getUTCMonth() - 4);
  await db.batch([
    db.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now),
    db.prepare('DELETE FROM hits WHERE minute < ?').bind(Math.floor(now / 60000) - 60),
    db.prepare('DELETE FROM sessions WHERE member_id IN (SELECT id FROM members WHERE left_at <= ?)').bind(fourMonthsAgo.getTime()),
    db.prepare('DELETE FROM members WHERE left_at <= ?').bind(fourMonthsAgo.getTime()),
  ]);
}

/** Members whose role was last confirmed over a day ago, oldest first. */
export async function dueForCheck(db: D1Database, now: number, limit: number): Promise<string[]> {
  const { results } = await db.prepare('SELECT id FROM members WHERE left_at IS NULL AND checked_at <= ? ORDER BY checked_at LIMIT ?').bind(now - DAY, limit).all<{ id: string }>();
  return results.map((r) => r.id);
}
