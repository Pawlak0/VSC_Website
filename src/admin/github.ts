// The few GitHub calls the panel needs: read the data files, and save changes as one commit on main.
// Everything runs in the browser with the editor's own token, so there is no server to keep running.

export const OWNER = 'Pawlak0';
export const REPO = 'VSC_Website';
const BRANCH = 'main';
const API = 'https://api.github.com';
const REPO_API = `${API}/repos/${OWNER}/${REPO}`;

export class GitHubError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** One file to write or remove in a commit. Text goes as is; a picture goes as a Blob. */
export type Change = { path: string; text?: string; blob?: Blob; remove?: true };

const encodePath = (path: string) => path.split('/').map(encodeURIComponent).join('/');

const toBase64 = (b: Blob) =>
  new Promise<string>((ok, bad) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(',')[1] ?? '');
    r.onerror = () => bad(r.error);
    r.readAsDataURL(b);
  });

export class GitHub {
  constructor(private token: string) {}

  private async req(url: string, init: RequestInit = {}, accept = 'application/vnd.github+json'): Promise<Response> {
    const res = await fetch(url.startsWith('http') ? url : REPO_API + url, {
      ...init,
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: accept,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
    if (!res.ok) {
      let message = `GitHub answered ${res.status}`;
      try {
        message = (await res.json()).message ?? message;
      } catch {}
      throw new GitHubError(res.status, message);
    }
    return res;
  }

  private async json<T = any>(url: string, init?: RequestInit): Promise<T> {
    return (await this.req(url, init)).json();
  }

  private send<T = any>(url: string, method: string, body: unknown): Promise<T> {
    return this.json<T>(url, { method, body: JSON.stringify(body) });
  }

  user(): Promise<{ login: string; name?: string | null }> {
    return this.json(`${API}/user`);
  }

  repo(): Promise<{ permissions?: { push?: boolean } }> {
    return this.json('');
  }

  async head(): Promise<string> {
    return (await this.json(`/git/ref/heads/${BRANCH}`)).object.sha;
  }

  async text(path: string, ref: string): Promise<string> {
    return (await this.req(`/contents/${encodePath(path)}?ref=${ref}`, {}, 'application/vnd.github.raw')).text();
  }

  async blob(path: string, ref: string): Promise<Blob> {
    return (await this.req(`/contents/${encodePath(path)}?ref=${ref}`, {}, 'application/vnd.github.raw')).blob();
  }

  /** The files in one folder, as repo paths. A folder that does not exist yet is empty. */
  async list(dir: string, ref: string): Promise<string[]> {
    try {
      const items: { path: string; type: string }[] = await this.json(`/contents/${encodePath(dir)}?ref=${ref}`);
      return items.filter((i) => i.type === 'file').map((i) => i.path);
    } catch (e) {
      if (e instanceof GitHubError && e.status === 404) return [];
      throw e;
    }
  }

  /** Writes the changes as one commit on top of `parent` and moves main to it. Fails if main moved meanwhile. */
  async commit(message: string, changes: Change[], parent: string): Promise<string> {
    const { tree } = await this.json(`/git/commits/${parent}`);
    const entries = await Promise.all(
      changes.map(async (c) => {
        if (c.remove) return { path: c.path, mode: '100644', type: 'blob', sha: null };
        if (c.blob) {
          const { sha } = await this.send('/git/blobs', 'POST', { content: await toBase64(c.blob), encoding: 'base64' });
          return { path: c.path, mode: '100644', type: 'blob', sha };
        }
        return { path: c.path, mode: '100644', type: 'blob', content: c.text ?? '' };
      }),
    );
    const newTree = await this.send('/git/trees', 'POST', { base_tree: tree.sha, tree: entries });
    const commit = await this.send('/git/commits', 'POST', { message, tree: newTree.sha, parents: [parent] });
    try {
      await this.send(`/git/refs/heads/${BRANCH}`, 'PATCH', { sha: commit.sha, force: false });
    } catch (e) {
      // 422 here means main moved on after `parent`; nothing was changed.
      if (e instanceof GitHubError && e.status === 422) throw new GitHubError(409, 'main moved on');
      throw e;
    }
    return commit.sha;
  }
}
