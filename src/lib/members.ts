// The website's side of the members' sign-in. The sign-in itself runs on the clan's API (api/ in this repository),
// which keeps the session in a cookie no script on the page can read. It also sets a plain "signed in" cookie, so a
// page asks the API who is signed in only when someone is.

export const API_URL: string = import.meta.env.PUBLIC_API_URL ?? 'https://api.volsungclan.com';

/** Where the "Log in with Discord" button goes; Discord sends the member back to `back` on this site. */
export const loginUrl = (back = '/account/') => `${API_URL}/auth/login?return=${encodeURIComponent(back)}`;

export type Me = { id: string; name: string; avatar: string; memberSince: number };

export const maybeSignedIn = () => document.cookie.split(/;\s*/).includes('vsc_signed_in=1');

/** The signed-in member, or null. Throws when the API cannot be reached. */
export async function whoAmI(): Promise<Me | null> {
  const res = await fetch(`${API_URL}/me`, { credentials: 'include', cache: 'no-store' });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`The sign-in service answered ${res.status}`);
  return res.json();
}

/** Log out here, log out everywhere, or delete the account. */
export async function act(what: 'logout' | 'logout-all' | 'delete'): Promise<void> {
  const path = { logout: '/auth/logout', 'logout-all': '/auth/logout-all', delete: '/me/delete' }[what];
  const res = await fetch(API_URL + path, { method: 'POST', credentials: 'include' });
  if (!res.ok && res.status !== 401) throw new Error(`The sign-in service answered ${res.status}`);
}
