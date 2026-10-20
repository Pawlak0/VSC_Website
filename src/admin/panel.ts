// The site panel at /admin/. It edits src/data/photos.json, videos.json, fylki.json and pages.json, the same files
// the site is built from, and saves them with any new pictures as one commit on main; the site then rebuilds by itself.
import { GitHub, GitHubError, OWNER, REPO, type Change } from './github';
import { shrink, slugify } from './images';
import { videoId } from '../lib/videos';
import { pageSlug } from '../lib/slug';

type Size = 'normal' | 'wide' | 'big';
type Photo = { src: string; alt: string; size?: Size; home?: boolean };
type Video = { url: string; title?: string; by?: string; poster?: string; home?: boolean };
type Member = { name: string; title?: string; portrait?: string };
type Role = 'leaders' | 'thegns' | 'merkismadr' | 'hirdmenn';
/** A Flokkr has every field of a Fylki apart from its own Flokkr, so one that grows can become a Fylki as it is. */
type Flokkr = {
  name: string;
  slug?: string;
  subtitle?: string;
  banner?: string;
  description?: string;
  ls?: Partial<Record<Role, Member[]>>;
  loreTitle?: string;
  lore?: string[];
  gallery?: Photo[];
};
type Fylki = Flokkr & {
  flokkr?: Flokkr[];
  /** For a Fylki that was a Flokkr: its old page, which the site forwards here. */
  movedFrom?: string;
  /** Where its banner stands on the map of the Jarldom, in percent of the map's width and height. */
  mapAt?: { x: number; y: number };
};
type Post = { title: string; date: string; text?: string[]; picture?: string };
/** Pages that stay off the site until they are turned on. */
type Pages = { news: { on?: boolean; posts: Post[] }; map: { on?: boolean; picture?: string; intro?: string } };
type Data = { photos: Photo[]; videos: Video[]; fylki: Fylki[]; pages: Pages };
type Key = keyof Data;

const FILES: Record<Key, string> = {
  photos: 'src/data/photos.json',
  videos: 'src/data/videos.json',
  fylki: 'src/data/fylki.json',
  pages: 'src/data/pages.json',
};
const NAMES: Record<Key, string> = { photos: 'photos', videos: 'videos', fylki: 'Fylki', pages: 'pages' };
const KEYS = Object.keys(FILES) as Key[];
const ROLES: [Role, string][] = [
  ['leaders', 'Leadership'],
  ['thegns', 'Thegns'],
  ['merkismadr', 'Merkismaðr'],
  ['hirdmenn', 'Hirðmaðr'],
];
// Photos are built into small copies, so they live in src/; banners, portraits and the map are served as they are.
const GALLERY = '/src/assets/gallery/';
const FYLKI_IMG = '/img/fylki/';
const TOKEN_KEY = 'vsc-panel-token';
const TAB_KEY = 'vsc-panel-tab';
const COLS_KEY = 'vsc-panel-cols';

const repoPath = (value: string) => (value.startsWith(GALLERY) ? value.slice(1) : `public${value}`);
const managed = (value?: string) => !!value && (value.startsWith(GALLERY) || value.startsWith(FYLKI_IMG));
const serialize = (v: unknown) => JSON.stringify(v, null, 2) + '\n';
const slugOf = (u: Flokkr) => pageSlug(u.slug || u.name);
/** Every Fylki and Flokkr; they have the same pictures and required fields. */
const units = (d: Data): Flokkr[] => d.fylki.flatMap((f) => [f, ...(f.flokkr ?? [])]);
/** Whether a Flokkr has its own page on the site, as hasPage in src/data/clan.ts decides. */
const hasPage = (k: Flokkr) =>
  Boolean(k.description?.trim() || k.lore?.length || k.gallery?.length || ROLES.some(([r]) => k.ls?.[r]?.some((m) => m.name?.trim())));

function store(kind: 'local' | 'session') {
  try {
    return kind === 'local' ? localStorage : sessionStorage;
  } catch {
    return null;
  }
}
const remember = (key: string, value: string | null, kind: 'local' | 'session' = 'local') => {
  try {
    if (value === null) store(kind)?.removeItem(key);
    else store(kind)?.setItem(key, value);
  } catch {}
};
const recall = (key: string, kind: 'local' | 'session' = 'local') => {
  try {
    return store(kind)?.getItem(key) ?? null;
  } catch {
    return null;
  }
};

// ---------- state ----------

let gh: GitHub;
let login = '';
/** The commit the panel last loaded or saved; a save builds on it. */
let base = '';
let data: Data = { photos: [], videos: [], fylki: [], pages: { news: { posts: [] }, map: {} } };
/** Each data file as it is on GitHub at `base`, to tell what changed. */
const saved = {} as Record<Key, string>;
/** Files in the picture folders on GitHub, as repo paths. */
let repoFiles = new Set<string>();
/** Pictures picked in this session and not saved yet: repo path to the shrunk file. */
const uploads = new Map<string, Blob>();
/** Picture values (as written in the data) to a URL the browser can show now. */
const previews = new Map<string, string>();
/** Built tiles of the gallery photos, from /admin/thumbs.json. */
let thumbs: Record<string, string> = {};
let tab: Key = (recall(TAB_KEY, 'session') as Key) || 'photos';
let fylkiIndex = 0;
/** The Flokkr of that Fylki open in the form, or null for the Fylki itself. */
let flokkrIndex: number | null = null;
let busy = false;

// ---------- small DOM helpers ----------

type Kid = Node | string | null | undefined | false;
function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, any> = {}, ...kids: Kid[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const k of kids) if (k !== null && k !== undefined && k !== false) el.append(k);
  // After the children, so a select's value finds its option.
  for (const [k, v] of Object.entries(props)) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k in el) (el as any)[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  return el;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
/** Children for replaceChildren, which would write a skipped one out as "null". */
const present = (...kids: Kid[]) => kids.filter((k): k is Node | string => k !== null && k !== undefined && k !== false);

/** Writes a field; an emptied optional field is left out of the file rather than kept as "". */
function setField(obj: any, key: string, value: string, keepEmpty = false) {
  if (value === '' && !keepEmpty) delete obj[key];
  else obj[key] = value;
  changed();
}

function input(obj: any, key: string, opts: { placeholder?: string; required?: boolean; area?: number; type?: string } = {}) {
  const props = {
    value: obj[key] ?? '',
    placeholder: opts.placeholder ?? '',
    'data-required': opts.required ? '1' : null,
    oninput: (e: Event) => {
      const el = e.target as HTMLInputElement;
      el.classList.remove('invalid');
      setField(obj, key, opts.area ? el.value : el.value.trimStart(), opts.required);
    },
  };
  return opts.area ? h('textarea', { rows: opts.area, ...props }) : h('input', { type: opts.type ?? 'text', ...props });
}

/** A saga or a post as one text box, paragraphs split by an empty line. */
function sagaInput(obj: { lore?: string[]; text?: string[] }, rows: number, key: 'lore' | 'text' = 'lore') {
  return h('textarea', {
    rows,
    class: 'saga',
    value: (obj[key] ?? []).join('\n\n'),
    placeholder: 'Leave an empty line between paragraphs.',
    oninput: (e: Event) => {
      obj[key] = (e.target as HTMLTextAreaElement).value
        .split(/\n\s*\n/)
        .map((p) => p.replace(/\s+/g, ' ').trim())
        .filter(Boolean);
      changed();
    },
  });
}

function select(obj: any, key: string, options: [string, string][], fallback: string) {
  return h(
    'select',
    { value: obj[key] ?? fallback, onchange: (e: Event) => setField(obj, key, (e.target as HTMLSelectElement).value) },
    ...options.map(([value, label]) => h('option', { value }, label)),
  );
}

function toggle(obj: any, key: string, label: string, after?: () => void) {
  return h(
    'label',
    { class: 'toggle' },
    h('input', {
      type: 'checkbox',
      checked: !!obj[key],
      onchange: (e: Event) => {
        obj[key] = (e.target as HTMLInputElement).checked;
        changed();
        after?.();
      },
    }),
    h('span', {}, label),
  );
}

const field = (label: string, control: HTMLElement, hint?: string) =>
  h('label', { class: 'field' }, h('span', { class: 'label' }, label), control, hint ? h('small', {}, hint) : null);

function move<T>(list: T[], from: number, to: number) {
  if (to < 0 || to > list.length) return;
  const [item] = list.splice(from, 1);
  list.splice(from < to ? to - 1 : to, 0, item);
  changed();
}

function removeButton(list: unknown[], i: number, redraw: () => void, what: string) {
  return h(
    'button',
    {
      type: 'button',
      class: 'remove',
      title: `Remove this ${what}`,
      onclick: () => {
        if (!confirm(`Remove this ${what}? It goes when you save.`)) return;
        list.splice(i, 1);
        changed();
        redraw();
      },
    },
    'Remove',
  );
}

/** Move and remove buttons for item `i` of `list`. */
function tools(list: unknown[], i: number, redraw: () => void, what: string, vertical = false) {
  return h(
    'div',
    { class: 'tools' },
    h('button', { type: 'button', title: 'Move earlier', disabled: i === 0, onclick: () => (move(list, i, i - 1), redraw()) }, vertical ? '↑' : '←'),
    h('button', { type: 'button', title: 'Move later', disabled: i === list.length - 1, onclick: () => (move(list, i, i + 2), redraw()) }, vertical ? '↓' : '→'),
    removeButton(list, i, redraw, what),
  );
}

// Cards are dragged by their picture, so text in the fields can still be selected with the mouse.
let dragging: { list: unknown[]; i: number } | null = null;
function draggable(card: HTMLElement, handle: HTMLElement, list: unknown[], i: number, redraw: () => void) {
  handle.addEventListener('pointerdown', () => (card.draggable = true));
  card.addEventListener('pointerup', () => (card.draggable = false));
  card.addEventListener('dragstart', (e) => {
    dragging = { list, i };
    e.dataTransfer?.setData('text/plain', String(i));
    card.classList.add('dragging');
  });
  card.addEventListener('dragend', () => {
    card.draggable = false;
    card.classList.remove('dragging');
  });
  // Left or right of the card, or above or below it when each row holds one card.
  const side = (e: DragEvent) => {
    const r = card.getBoundingClientRect();
    const oneRow = getComputedStyle(card.parentElement!).gridTemplateColumns.trim().split(/\s+/).length === 1;
    if (oneRow) return e.clientY > r.top + r.height / 2 ? 'below' : 'above';
    return e.clientX > r.left + r.width / 2 ? 'after' : 'before';
  };
  const marks = ['drop-before', 'drop-after', 'drop-above', 'drop-below'];
  card.addEventListener('dragover', (e) => {
    if (dragging?.list !== list) return;
    e.preventDefault();
    card.classList.remove(...marks);
    card.classList.add(`drop-${side(e)}`);
  });
  card.addEventListener('dragleave', () => card.classList.remove(...marks));
  card.addEventListener('drop', (e) => {
    e.preventDefault();
    card.classList.remove(...marks);
    if (!dragging || dragging.list !== list) return;
    const s = side(e);
    move(list, dragging.i, i + (s === 'after' || s === 'below' ? 1 : 0));
    dragging = null;
    redraw();
  });
}

// ---------- pictures ----------

/** Shows a picture from the data: a fresh upload, a built tile, the live site, or straight from GitHub. */
function showImage(img: HTMLImageElement, value?: string) {
  if (!value) return;
  const local = previews.get(value) ?? (value.startsWith(GALLERY) ? thumbs[value] : value);
  img.onerror = async () => {
    img.onerror = null;
    try {
      const url = URL.createObjectURL(await gh.blob(repoPath(value), base));
      previews.set(value, url);
      img.src = url;
    } catch {
      img.alt = 'Picture not found';
    }
  };
  if (local) img.src = local;
  else img.onerror(new Event('error'));
}

function uniqueValue(dir: string, name: string, ext: string) {
  const taken = (v: string) => repoFiles.has(repoPath(v)) || uploads.has(repoPath(v)) || previews.has(v);
  let value = `${dir}${name}.${ext}`;
  for (let n = 2; taken(value); n++) value = `${dir}${name}-${n}.${ext}`;
  return value;
}

/** Shrinks a picked file and keeps it for the next save. Returns the value to write in the data. */
async function addPicture(file: File, kind: 'photo' | 'banner' | 'portrait' | 'map', name = file.name) {
  const png = kind === 'banner';
  const blob = await shrink(file, kind === 'photo' || kind === 'map' ? 2560 : 900, png ? 'image/png' : 'image/jpeg');
  const value = uniqueValue(kind === 'photo' ? GALLERY : FYLKI_IMG, slugify(name), png ? 'png' : 'jpg');
  uploads.set(repoPath(value), blob);
  previews.set(value, URL.createObjectURL(blob));
  return value;
}

function pickFiles(multiple: boolean, then: (files: File[]) => void) {
  const el = h('input', { type: 'file', accept: 'image/*', multiple });
  el.addEventListener('change', () => then([...(el.files ?? [])]));
  el.click();
}

/** Every managed picture the data points at. */
function pictures(d: Data): Set<string> {
  const out = new Set<string>();
  const add = (v?: string) => managed(v) && out.add(v!);
  d.photos.forEach((p) => add(p.src));
  for (const u of units(d)) {
    add(u.banner);
    for (const [role] of ROLES) u.ls?.[role]?.forEach((m) => add(m.portrait));
    u.gallery?.forEach((p) => add(p.src));
  }
  d.pages?.news?.posts?.forEach((p) => add(p.picture));
  add(d.pages?.map?.picture);
  return out;
}

// ---------- photos ----------

function photoCard(list: Photo[], i: number, withHome: boolean, redraw: () => void) {
  const p = list[i];
  const img = h('img', { alt: p.alt, loading: 'lazy' });
  img.draggable = false;
  showImage(img, p.src);
  const pic = h('div', { class: 'pic', title: 'Drag to reorder' }, img, h('span', { class: 'num' }, String(i + 1)));
  const card = h(
    'article',
    { class: `card${withHome && p.home ? ' on-home' : ''}` },
    pic,
    h(
      'div',
      { class: 'fields' },
      field('What it shows', input(p, 'alt', { required: true, placeholder: 'e.g. Shieldwall in the rain at night' })),
      h(
        'div',
        { class: 'row' },
        field('Size', select(p, 'size', [['normal', 'Normal'], ['wide', 'Wide'], ['big', 'Big']], 'normal')),
        withHome ? toggle(p, 'home', 'Home page', redraw) : null,
      ),
      tools(list, i, redraw, 'photo'),
    ),
  );
  draggable(card, pic, list, i, redraw);
  return card;
}

function photoGrid(list: Photo[], withHome: boolean) {
  const grid = h('div', { class: 'grid' });
  const redraw = () => grid.replaceChildren(...list.map((_, i) => photoCard(list, i, withHome, redraw)));
  redraw();
  return { grid, redraw };
}

function uploadPhotos(list: Photo[], redraw: () => void, status: HTMLElement) {
  pickFiles(true, async (files) => {
    if (!files.length) return;
    status.textContent = `Preparing ${files.length} photo${files.length > 1 ? 's' : ''}…`;
    const added: Photo[] = [];
    for (const file of files) {
      try {
        added.push({ src: await addPicture(file, 'photo'), alt: '', size: 'normal', home: false });
      } catch (e) {
        alert((e as Error).message);
      }
    }
    list.unshift(...added);
    status.textContent = added.length ? 'Added at the start. Describe each one, then save.' : '';
    changed();
    redraw();
    (document.querySelector('.grid input[data-required]') as HTMLInputElement | null)?.focus();
  });
}

function photosView() {
  const { grid, redraw } = photoGrid(data.photos, true);
  const status = h('span', { class: 'status' });
  const count = () => `${data.photos.length} photos, ${data.photos.filter((p) => p.home).length} on the home page`;
  return h(
    'section',
    {},
    h(
      'div',
      { class: 'bar' },
      h('div', {}, h('h2', {}, 'Photos'), h('p', {}, 'Every photo shows on the Media page, in this order. Gold ones show on the home page too. Drag a picture to move it.')),
      h('button', { type: 'button', class: 'btn btn-gold', onclick: () => uploadPhotos(data.photos, redraw, status) }, 'Add photos'),
    ),
    h('p', { class: 'meta' }, count(), ' ', status),
    grid,
  );
}

// ---------- videos ----------

function videoThumb(v: Video) {
  const id = videoId(v.url);
  if (id) return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  if (/^\/video\/.+\.(mp4|webm)$/i.test(v.url)) return v.poster || v.url.replace(/\.\w+$/, '.webp');
  return '';
}

function videoCard(list: Video[], i: number, redraw: () => void) {
  const v = list[i];
  const img = h('img', { alt: '', loading: 'lazy', src: videoThumb(v) });
  img.draggable = false;
  const pic = h('div', { class: 'pic video', title: 'Drag to reorder' }, img, h('span', { class: 'num' }, String(i + 1)));
  const url = input(v, 'url', { required: true, placeholder: 'https://www.youtube.com/watch?v=…' });
  url.addEventListener('change', () => (img.src = videoThumb(v)));
  const fromYouTube = videoId(v.url) ? 'From YouTube' : '';
  const card = h(
    'article',
    { class: `card${v.home ? ' on-home' : ''}` },
    pic,
    h(
      'div',
      { class: 'fields' },
      field('Link', url),
      field('Title', input(v, 'title', { placeholder: fromYouTube || 'Title' })),
      h('div', { class: 'row' }, field('Made by', input(v, 'by', { placeholder: fromYouTube || 'Member' })), toggle(v, 'home', 'Home page', redraw)),
      tools(list, i, redraw, 'video'),
    ),
  );
  draggable(card, pic, list, i, redraw);
  return card;
}

function videosView() {
  const grid = h('div', { class: 'grid' });
  const redraw = () => grid.replaceChildren(...data.videos.map((_, i) => videoCard(data.videos, i, redraw)));
  redraw();
  const link = h('input', { type: 'url', placeholder: 'Paste a YouTube link' });
  const add = () => {
    const url = link.value.trim();
    if (!videoId(url) && !/^\/video\/.+\.(mp4|webm)$/i.test(url)) return alert('That is not a YouTube video link.');
    data.videos.unshift({ url, home: false });
    link.value = '';
    changed();
    redraw();
  };
  link.addEventListener('keydown', (e) => e.key === 'Enter' && add());
  return h(
    'section',
    {},
    h(
      'div',
      { class: 'bar' },
      h('div', {}, h('h2', {}, 'Videos'), h('p', {}, 'Newest first. The title and channel come from YouTube unless you write your own. Gold ones show on the home page too.')),
      h('div', { class: 'add' }, link, h('button', { type: 'button', class: 'btn btn-gold', onclick: add }, 'Add video')),
    ),
    grid,
  );
}

// ---------- Fylki ----------

function bannerBox(obj: { banner?: string; name: string }, redraw: () => void, label = 'Banner') {
  const img = h('img', { alt: '' });
  showImage(img, obj.banner);
  return h(
    'div',
    { class: 'banner-box' },
    h('div', { class: `banner-pic${obj.banner ? '' : ' empty'}` }, obj.banner ? img : h('span', {}, label)),
    h(
      'div',
      { class: 'tools' },
      h(
        'button',
        {
          type: 'button',
          onclick: () =>
            pickFiles(false, async ([file]) => {
              if (!file) return;
              obj.banner = await addPicture(file, 'banner', `${obj.name || 'banner'}-banner`);
              changed();
              redraw();
            }),
        },
        obj.banner ? 'Replace' : 'Upload',
      ),
      obj.banner ? h('button', { type: 'button', class: 'remove', onclick: () => (delete obj.banner, changed(), redraw()) }, 'Remove') : null,
    ),
    h('small', {}, 'PNG with a clear background, as it comes from the game.'),
  );
}

function memberRow(list: Member[], i: number, redraw: () => void) {
  const m = list[i];
  const img = h('img', { alt: '' });
  showImage(img, m.portrait);
  const portrait = h(
    'button',
    {
      type: 'button',
      class: `portrait${m.portrait ? '' : ' empty'}`,
      title: m.portrait ? 'Replace the portrait' : 'Add a portrait (optional)',
      onclick: () =>
        pickFiles(false, async ([file]) => {
          if (!file) return;
          m.portrait = await addPicture(file, 'portrait', m.name || 'portrait');
          changed();
          redraw();
        }),
    },
    m.portrait ? img : '+',
  );
  return h(
    'div',
    { class: 'member' },
    portrait,
    h('div', { class: 'fields' }, input(m, 'name', { required: true, placeholder: 'Name' }), input(m, 'title', { placeholder: 'Rank or role (optional)' })),
    tools(list, i, redraw, 'member', true),
    m.portrait ? h('button', { type: 'button', class: 'link', onclick: () => (delete m.portrait, changed(), redraw()) }, 'Remove portrait') : null,
  );
}

function lsBox(u: Flokkr) {
  return h(
    'div',
    { class: 'ls' },
    ...ROLES.map(([role, name]) => {
      const col = h('div', { class: 'role' });
      const redraw = () => {
        const list = u.ls?.[role] ?? [];
        col.replaceChildren(
          h('h4', {}, name),
          ...list.map((_, i) => memberRow(list, i, redraw)),
          h(
            'button',
            {
              type: 'button',
              class: 'btn btn-ghost small',
              onclick: () => {
                ((u.ls ??= {})[role] ??= []).push({ name: '' });
                changed();
                redraw();
                (col.querySelector('.member:last-of-type input') as HTMLInputElement | null)?.focus();
              },
            },
            'Add',
          ),
        );
      };
      redraw();
      return col;
    }),
  );
}

/** Opens a Flokkr's own form, or the Fylki's form again with `null`. */
function openFlokkr(i: number | null) {
  flokkrIndex = i;
  render();
  if (i === null) document.querySelector('.flokkr-list')?.scrollIntoView({ block: 'center' });
  else window.scrollTo(0, 0);
}

/** The Flokkr of a Fylki as small cards; each one opens a form like the Fylki's own. */
function flokkrBox(f: Fylki) {
  const box = h('div', { class: 'flokkr-list' });
  const redraw = () => {
    const list = f.flokkr ?? [];
    box.replaceChildren(
      ...list.map((k, i) => {
        const img = h('img', { alt: '' });
        showImage(img, k.banner);
        return h(
          'article',
          { class: 'flokkr-card' },
          h('div', { class: `banner-pic${k.banner ? '' : ' empty'}` }, k.banner ? img : h('span', {}, 'Banner')),
          h(
            'div',
            { class: 'fields' },
            h('b', {}, k.name || 'New Flokkr'),
            h('small', {}, hasPage(k) ? `Own page at /fylki/${slugOf(f)}/${slugOf(k)}/` : 'Only its banner on the Fylki page, until it has a description, saga, LS or photos.'),
            h('button', { type: 'button', class: 'btn btn-ghost small', onclick: () => openFlokkr(i) }, 'Edit'),
            tools(list, i, redraw, 'Flokkr'),
          ),
        );
      }),
      h(
        'button',
        {
          type: 'button',
          class: 'btn btn-ghost',
          onclick: () => {
            (f.flokkr ??= []).push({ name: '' });
            changed();
            openFlokkr(f.flokkr.length - 1);
          },
        },
        'Add Flokkr',
      ),
    );
  };
  redraw();
  return box;
}

/** A Flokkr that has grown becomes a Fylki with everything it has, and its old page forwards to the new one. */
function promote(k: Flokkr, parent: Fylki) {
  const slug = slugOf(k);
  if (!k.name.trim()) return alert('Give this Flokkr a name first.');
  if (data.fylki.some((x) => slugOf(x) === slug)) return alert(`There is already a Fylki at /fylki/${slug}/. Change this Flokkr's page address first.`);
  if (!confirm(`Make ${k.name} a Fylki of its own? It leaves ${parent.name} and keeps its banner, saga, LS and photos. It happens when you save.`)) return;
  parent.flokkr!.splice(parent.flokkr!.indexOf(k), 1);
  data.fylki.push({
    slug,
    name: k.name,
    subtitle: k.subtitle,
    banner: k.banner,
    description: k.description ?? '',
    flokkr: [],
    ls: k.ls,
    loreTitle: k.loreTitle,
    lore: k.lore,
    gallery: k.gallery,
    movedFrom: hasPage(k) ? `/fylki/${slugOf(parent)}/${slug}/` : undefined,
  });
  fylkiIndex = data.fylki.length - 1;
  flokkrIndex = null;
  changed();
  render();
  window.scrollTo(0, 0);
}

function pickFromPhotos(onPick: (p: Photo[]) => void) {
  const chosen = new Set<Photo>();
  const dialog = h('dialog', { class: 'picker' });
  const done = () => {
    dialog.close();
    dialog.remove();
  };
  dialog.append(
    h('h3', {}, 'Pick from the clan photos'),
    h(
      'div',
      { class: 'grid picks' },
      ...data.photos.map((p) => {
        const img = h('img', { alt: p.alt, loading: 'lazy' });
        showImage(img, p.src);
        const b = h('button', { type: 'button', class: 'pick', title: p.alt }, img);
        b.addEventListener('click', () => (chosen.has(p) ? chosen.delete(p) : chosen.add(p), b.classList.toggle('on', chosen.has(p))));
        return b;
      }),
    ),
    h(
      'div',
      { class: 'tools' },
      h('button', { type: 'button', class: 'btn btn-ghost', onclick: done }, 'Cancel'),
      h('button', { type: 'button', class: 'btn btn-gold', onclick: () => (onPick([...chosen].map((p) => ({ src: p.src, alt: p.alt, size: 'normal' }))), done()) }, 'Add picked'),
    ),
  );
  document.body.append(dialog);
  dialog.showModal();
}

/** The form of a Fylki, or of one of its Flokkr when `parent` is given: both have the same fields. */
function unitForm(u: Fylki, parent?: Fylki) {
  const what = parent ? 'Flokkr' : 'Fylki';
  const form = h('div', { class: 'fylki-form' });
  const redraw = () => {
    const gallery = u.gallery ?? [];
    const { grid } = photoGrid(gallery, false);
    const status = h('span', { class: 'status' });
    form.replaceChildren(
      ...present(
        h(
          'div',
          { class: 'panel-box basics' },
          bannerBox(u, redraw),
          h(
            'div',
            { class: 'fields' },
            field('Name', input(u, 'name', { required: true, placeholder: parent ? 'e.g. Tryggr' : '' }), parent ? 'Without the word Flokkr.' : undefined),
            field(
              'Page address',
              input(u, 'slug', { placeholder: 'Made from the name' }),
              `The part after /fylki/${parent ? `${slugOf(parent)}/` : ''} in the link. Changing it breaks links people already shared.`,
            ),
            field('Line under the banner', input(u, 'subtitle', { placeholder: parent ? 'Optional' : 'e.g. Fylki of the Jarl' })),
            field(
              'Description',
              input(u, 'description', { area: 3 }),
              parent ? 'With a description, saga, LS or photos, the Flokkr gets its own page.' : 'One or two sentences under the name.',
            ),
          ),
        ),
        !parent && u.movedFrom ? h('p', { class: 'meta' }, `This Fylki grew out of a Flokkr. Its old page, ${u.movedFrom}, forwards here.`) : null,
        h('h3', {}, 'Saga'),
        h(
          'div',
          { class: 'panel-box' },
          field('Saga title', input(u, 'loreTitle', { placeholder: parent ? 'e.g. The Sworn Warband of Norðmǿrr Fylki' : 'e.g. The Royal House of the North' })),
          field('Saga', sagaInput(u, parent ? 10 : 16), parent ? undefined : 'Past four paragraphs the rest folds under “Read the whole saga”.'),
        ),
        parent ? null : h('h3', {}, 'Flokkr'),
        parent ? null : flokkrBox(u),
        h('h3', {}, 'LS (leadership)'),
        h('p', { class: 'meta' }, 'An empty list shows as “To be announced”. The leader goes first.'),
        lsBox(u),
        h('h3', {}, `Photos of ${u.name || `this ${what}`}`),
        h(
          'div',
          { class: 'tools' },
          h(
            'button',
            {
              type: 'button',
              class: 'btn btn-ghost',
              onclick: () =>
                pickFromPhotos((picked) => {
                  (u.gallery ??= []).push(...picked);
                  changed();
                  redraw();
                }),
            },
            'Pick from clan photos',
          ),
          h(
            'button',
            {
              type: 'button',
              class: 'btn btn-ghost',
              onclick: () => {
                u.gallery ??= [];
                uploadPhotos(u.gallery, redraw, status);
              },
            },
            'Upload photos',
          ),
          status,
        ),
        gallery.length ? grid : h('p', { class: 'meta' }, 'No photos yet; the section stays hidden on the page.'),
        h(
          'div',
          { class: 'danger' },
          parent
            ? h(
                'div',
                { class: 'promote' },
                h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => promote(u, parent) }, 'Make it a Fylki'),
                h('small', {}, 'For when it grows big enough: it becomes a Fylki with everything above, and its old page forwards to the new one.'),
              )
            : null,
          h(
            'button',
            {
              type: 'button',
              class: 'remove',
              onclick: () => {
                if (!confirm(`Remove ${u.name || `this ${what}`} and its page from the site? It goes when you save.`)) return;
                if (parent) {
                  parent.flokkr!.splice(parent.flokkr!.indexOf(u), 1);
                } else {
                  data.fylki.splice(data.fylki.indexOf(u), 1);
                  fylkiIndex = 0;
                }
                flokkrIndex = null;
                changed();
                render();
              },
            },
            `Remove ${u.name || `this ${what}`}`,
          ),
        ),
      ),
    );
  };
  redraw();
  return form;
}

function fylkiView() {
  fylkiIndex = Math.min(fylkiIndex, Math.max(0, data.fylki.length - 1));
  const f = data.fylki[fylkiIndex];
  const k = f && flokkrIndex !== null ? f.flokkr?.[flokkrIndex] : undefined;
  if (!k) flokkrIndex = null;
  return h(
    'section',
    {},
    h('div', { class: 'bar' }, h('div', {}, h('h2', {}, 'Fylki'), h('p', {}, 'Each Fylki has its own page. The order here is the order on the home page and in the menu.'))),
    h(
      'div',
      { class: 'subtabs' },
      ...data.fylki.map((x, i) =>
        h('button', { type: 'button', class: i === fylkiIndex ? 'on' : '', onclick: () => ((fylkiIndex = i), (flokkrIndex = null), render()) }, x.name || 'New Fylki'),
      ),
      fylkiIndex > 0 ? h('button', { type: 'button', class: 'link', onclick: () => (move(data.fylki, fylkiIndex, fylkiIndex - 1), fylkiIndex--, render()) }, '← Move earlier') : null,
      h(
        'button',
        {
          type: 'button',
          class: 'link',
          onclick: () => {
            data.fylki.push({ name: '', description: '', flokkr: [], ls: { leaders: [], thegns: [], merkismadr: [], hirdmenn: [] }, lore: [], gallery: [] });
            fylkiIndex = data.fylki.length - 1;
            flokkrIndex = null;
            changed();
            render();
          },
        },
        '+ Add Fylki',
      ),
    ),
    k
      ? h(
          'div',
          { class: 'crumbs' },
          h('button', { type: 'button', class: 'link', onclick: () => openFlokkr(null) }, `← Back to ${f.name || 'the Fylki'}`),
          h('span', {}, `Flokkr ${k.name || 'New Flokkr'}`),
        )
      : null,
    k ? unitForm(k, f) : f ? unitForm(f) : h('p', {}, 'No Fylki yet.'),
  );
}

// ---------- pages that can be turned on ----------

function postCard(list: Post[], i: number, redraw: () => void) {
  const p = list[i];
  const img = h('img', { alt: '' });
  showImage(img, p.picture);
  const pick = () =>
    pickFiles(false, async ([file]) => {
      if (!file) return;
      p.picture = await addPicture(file, 'photo');
      changed();
      redraw();
    });
  return h(
    'article',
    { class: 'post' },
    h(
      'div',
      { class: 'post-pic' },
      h('div', { class: `pic${p.picture ? '' : ' empty'}` }, p.picture ? img : h('span', {}, 'No picture')),
      h(
        'div',
        { class: 'tools' },
        h('button', { type: 'button', onclick: pick }, p.picture ? 'Replace' : 'Add picture'),
        p.picture ? h('button', { type: 'button', class: 'remove', onclick: () => (delete p.picture, changed(), redraw()) }, 'Remove') : null,
      ),
    ),
    h(
      'div',
      { class: 'fields' },
      h('div', { class: 'row' }, field('Title', input(p, 'title', { required: true, placeholder: 'e.g. Tryggr takes the field' })), field('Date', input(p, 'date', { type: 'date', required: true }))),
      field('Text', sagaInput(p, 6, 'text')),
      h('div', { class: 'tools' }, removeButton(list, i, redraw, 'post')),
    ),
  );
}

function newsBox(news: Pages['news']) {
  const list = h('div', { class: 'posts' });
  const redraw = () =>
    list.replaceChildren(...(news.posts.length ? news.posts.map((_, i) => postCard(news.posts, i, redraw)) : [h('p', { class: 'meta' }, 'No posts yet.')]));
  redraw();
  const add = () => {
    news.posts.unshift({ title: '', date: new Date().toISOString().slice(0, 10), text: [] });
    changed();
    redraw();
    (list.querySelector('input[data-required]') as HTMLInputElement | null)?.focus();
  };
  return h(
    'div',
    { class: 'page-box' },
    h(
      'div',
      { class: 'bar' },
      h('div', {}, h('h3', {}, 'News'), h('p', { class: 'meta' }, 'A page at /news/ with the newest post first. While it is off, the page does not exist.')),
      h('div', { class: 'add' }, toggle(news, 'on', 'On the site'), h('button', { type: 'button', class: 'btn btn-gold', onclick: add }, 'Add post')),
    ),
    list,
  );
}

const keep = (n: number) => Math.round(Math.min(100, Math.max(0, n)) * 10) / 10;

/** The map with a banner for each Fylki on it, dragged into place; a Fylki is put on or taken off with its button. */
function mapEditor(picture: string, redraw: () => void) {
  const img = h('img', { alt: '' });
  img.draggable = false;
  showImage(img, picture);
  const stage = h('div', { class: 'map-stage' }, img);
  for (const f of data.fylki.filter((x) => x.mapAt)) {
    const flag = h('img', { alt: '' });
    flag.draggable = false;
    showImage(flag, f.banner);
    const pin = h('div', { class: 'map-pin', title: `Drag ${f.name || 'this Fylki'} onto its land` }, h('span', { class: 'banner-pic' }, f.banner ? flag : null), h('b', {}, f.name || 'New Fylki'));
    const place = () => ((pin.style.left = `${f.mapAt!.x}%`), (pin.style.top = `${f.mapAt!.y}%`));
    place();
    pin.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      pin.setPointerCapture(e.pointerId);
      // Where on the banner it was grabbed, so it does not jump under the pointer.
      const r = pin.querySelector('.banner-pic')!.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      const drag = (ev: PointerEvent) => {
        const s = stage.getBoundingClientRect();
        f.mapAt = { x: keep(((ev.clientX - dx - s.left) / s.width) * 100), y: keep(((ev.clientY - dy - s.top) / s.height) * 100) };
        place();
      };
      pin.addEventListener('pointermove', drag);
      pin.addEventListener('pointerup', () => (pin.removeEventListener('pointermove', drag), changed()), { once: true });
    });
    stage.append(pin);
  }
  return h(
    'div',
    { class: 'map-edit' },
    stage,
    h(
      'div',
      { class: 'tools' },
      ...data.fylki.map((f, i) =>
        f.mapAt
          ? h('button', { type: 'button', onclick: () => (delete f.mapAt, changed(), redraw()) }, `Take ${f.name || 'New Fylki'} off`)
          : // Side by side across the middle, so banners put on one after another do not cover each other.
            h('button', { type: 'button', onclick: () => ((f.mapAt = { x: 15 + ((i * 17) % 75), y: 50 }), changed(), redraw()) }, `Put ${f.name || 'New Fylki'} on the map`),
      ),
    ),
  );
}

function mapBox(map: Pages['map']) {
  const box = h('div', { class: 'page-box' });
  const redraw = () =>
    box.replaceChildren(
      ...present(
        h(
          'div',
          { class: 'bar' },
          h(
            'div',
            {},
            h('h3', {}, 'Map of the Jarldom'),
            h('p', { class: 'meta' }, 'A page at /map/ with each Fylki’s banner on its land; a click on a banner opens the Fylki. It is also linked from the Jarldom menu and the home page.'),
          ),
          h('div', { class: 'add' }, toggle(map, 'on', 'On the site')),
        ),
        field('Text over the map', input(map, 'intro', { area: 2, placeholder: 'The lands of the Völsung Fylki. Click a banner to visit its Fylki.' })),
        h(
          'div',
          { class: 'tools' },
          h(
            'button',
            {
              type: 'button',
              class: 'btn btn-ghost',
              onclick: () =>
                pickFiles(false, async ([file]) => {
                  if (!file) return;
                  map.picture = await addPicture(file, 'map', 'jarldom-map');
                  changed();
                  redraw();
                }),
            },
            map.picture ? 'Replace the map' : 'Upload the map',
          ),
          map.picture ? h('button', { type: 'button', class: 'remove', onclick: () => (delete map.picture, changed(), redraw()) }, 'Remove the map') : null,
        ),
        map.picture
          ? h('p', { class: 'meta' }, 'Drag each banner onto its land. The banners grow and shrink with the map, as on the site.')
          : h('p', { class: 'meta' }, 'No map yet. Until there is one, the page says the map is still being drawn.'),
        map.picture ? mapEditor(map.picture, redraw) : null,
      ),
    );
  redraw();
  return box;
}

function pagesView() {
  return h(
    'section',
    {},
    h('div', { class: 'bar' }, h('div', {}, h('h2', {}, 'Pages'), h('p', {}, 'Pages that stay off the site until you turn them on. One that is on shows in the menu.'))),
    newsBox(data.pages.news),
    mapBox(data.pages.map),
  );
}

// ---------- saving ----------

function pending() {
  const files = KEYS.filter((k) => serialize(data[k]) !== saved[k]);
  const now = pictures(data);
  const added = [...uploads.keys()].filter((p) => [...now].some((v) => repoPath(v) === p));
  const before = pictures(Object.fromEntries(KEYS.map((k) => [k, JSON.parse(saved[k])])) as Data);
  const removed = [...before].filter((v) => !now.has(v) && repoFiles.has(repoPath(v))).map(repoPath);
  return { files, added, removed };
}

let scheduled = false;
function changed() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    const { files, added, removed } = pending();
    const any = files.length || added.length || removed.length;
    const parts = [files.map((k) => NAMES[k]).join(', ')];
    if (added.length) parts.push(`${added.length} new picture${added.length > 1 ? 's' : ''}`);
    if (removed.length) parts.push(`${removed.length} picture${removed.length > 1 ? 's' : ''} removed`);
    $('save-text').textContent = any ? `Unsaved changes: ${parts.filter(Boolean).join(', ')}` : 'Everything is saved.';
    $<HTMLButtonElement>('save').disabled = !any || busy;
    $<HTMLButtonElement>('discard').disabled = !any || busy;
    document.body.classList.toggle('dirty', !!any);
  });
}

function missing(): HTMLElement | null {
  const empty = [...document.querySelectorAll<HTMLInputElement>('[data-required]')].filter((el) => !el.value.trim());
  empty.forEach((el) => el.classList.add('invalid'));
  if (empty.length) return empty[0];
  // Fields on other tabs are not on the page; check the data itself.
  const bad =
    data.photos.some((p) => !p.alt?.trim() || !p.src) ||
    data.videos.some((v) => !v.url?.trim()) ||
    units(data).some((u) => !u.name?.trim() || ROLES.some(([r]) => u.ls?.[r]?.some((m) => !m.name?.trim())) || u.gallery?.some((p) => !p.alt?.trim())) ||
    data.pages.news.posts.some((p) => !p.title?.trim());
  return bad ? document.body : null;
}

function message(text: string, kind: 'ok' | 'error' = 'ok') {
  const el = $('message');
  el.className = `message ${kind}`;
  el.replaceChildren(text);
  el.hidden = false;
  if (kind === 'ok') setTimeout(() => (el.hidden = true), 8000);
}

async function save() {
  const first = missing();
  if (first) {
    if (first !== document.body) first.focus();
    return message('Some required fields are empty: every photo needs a description, every video a link, every Fylki, Flokkr and member a name, and every post a title. Empty ones are marked red, or on another tab.', 'error');
  }
  const { files, added, removed } = pending();
  busy = true;
  changed();
  $('save').textContent = 'Saving…';
  try {
    let parent = base;
    const head = await gh.head();
    if (head !== base) {
      // Someone saved meanwhile. Fine, unless they changed a file this save also changes.
      for (const k of files) {
        const theirs = serialize(JSON.parse(await gh.text(FILES[k], head)));
        if (theirs !== saved[k]) {
          throw new Error(`Someone else saved ${NAMES[k]} after you opened the panel. Copy what you changed, reload the page, and make the change again.`);
        }
      }
      parent = head;
    }
    const changes: Change[] = [
      ...files.map((k) => ({ path: FILES[k], text: serialize(data[k]) })),
      ...added.map((path) => ({ path, blob: uploads.get(path)! })),
      ...removed.map((path) => ({ path, remove: true as const })),
    ];
    const what = [...files.map((k) => NAMES[k]), ...(added.length && !files.length ? ['pictures'] : [])];
    const subject = `Update ${what.join(' and ').replace(/ and (?=.* and )/g, ', ')} from the site panel`;
    base = await gh.commit(`${subject}\n\nSaved by ${login} at ${location.origin}/admin/.`, changes, parent);
    for (const k of KEYS) saved[k] = serialize(data[k]);
    added.forEach((p) => (repoFiles.add(p), uploads.delete(p)));
    removed.forEach((p) => repoFiles.delete(p));
    message('Saved. The site updates by itself in a minute or two.');
  } catch (e) {
    const err = e as Error;
    message(err instanceof GitHubError && err.status === 409 ? 'Someone else saved at the same moment. Save again.' : err.message, 'error');
  } finally {
    busy = false;
    $('save').textContent = 'Save';
    changed();
  }
}

function discard() {
  if (!confirm('Throw away everything you changed since the last save?')) return;
  data = Object.fromEntries(KEYS.map((k) => [k, JSON.parse(saved[k])])) as Data;
  uploads.clear();
  flokkrIndex = null;
  render();
  changed();
}

// ---------- sign in and layout ----------

/** Cards per row in the photo and video grids, kept for the next visit. */
function setCols(n: string) {
  document.body.dataset.cols = n;
  remember(COLS_KEY, n);
  document.querySelectorAll<HTMLButtonElement>('#cols button').forEach((b) => b.classList.toggle('on', b.dataset.cols === n));
}

function render() {
  remember(TAB_KEY, tab, 'session');
  document.querySelectorAll<HTMLButtonElement>('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  const view = tab === 'photos' ? photosView() : tab === 'videos' ? videosView() : tab === 'fylki' ? fylkiView() : pagesView();
  $('content').replaceChildren(view);
}

async function load() {
  base = await gh.head();
  const [photos, videos, fylki, pages, galleryFiles, fylkiFiles] = await Promise.all([
    gh.text(FILES.photos, base),
    gh.text(FILES.videos, base),
    gh.text(FILES.fylki, base),
    gh.text(FILES.pages, base),
    gh.list(GALLERY.slice(1, -1), base),
    gh.list(`public${FYLKI_IMG.slice(0, -1)}`, base),
  ]);
  data = { photos: JSON.parse(photos), videos: JSON.parse(videos), fylki: JSON.parse(fylki), pages: JSON.parse(pages) };
  for (const k of KEYS) saved[k] = serialize(data[k]);
  repoFiles = new Set([...galleryFiles, ...fylkiFiles]);
  try {
    const res = await fetch('/admin/thumbs.json', { cache: 'no-store' });
    if (res.ok) thumbs = await res.json();
  } catch {}
}

async function signIn(token: string, keep: boolean) {
  const client = new GitHub(token);
  const [user, repo] = await Promise.all([client.user(), client.repo()]);
  if (!repo.permissions?.push) throw new Error(`${user.login} cannot change ${OWNER}/${REPO} yet. Pawlak adds you in the repository's Settings, Collaborators.`);
  gh = client;
  login = user.login;
  remember(TOKEN_KEY, token, keep ? 'local' : 'session');
  await load();
  $('signin').hidden = true;
  $('app').hidden = false;
  $('who').textContent = login;
  render();
  changed();
}

function signOut() {
  if (document.body.classList.contains('dirty') && !confirm('You have unsaved changes. Sign out anyway?')) return;
  remember(TOKEN_KEY, null);
  remember(TOKEN_KEY, null, 'session');
  location.reload();
}

export async function start() {
  $('tabs').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button');
    if (!b?.dataset.tab) return;
    tab = b.dataset.tab as Key;
    render();
  });
  setCols(recall(COLS_KEY) ?? '4');
  $('cols').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button');
    if (b?.dataset.cols) setCols(b.dataset.cols);
  });
  $('save').addEventListener('click', save);
  $('discard').addEventListener('click', discard);
  $('signout').addEventListener('click', signOut);
  window.addEventListener('beforeunload', (e) => {
    if (document.body.classList.contains('dirty')) e.preventDefault();
  });

  const form = $<HTMLFormElement>('signin-form');
  const error = $('signin-error');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const token = (form.elements.namedItem('token') as HTMLInputElement).value.trim();
    const keep = (form.elements.namedItem('keep') as HTMLInputElement).checked;
    error.hidden = true;
    form.classList.add('busy');
    try {
      await signIn(token, keep);
    } catch (err) {
      error.textContent = err instanceof GitHubError && err.status === 401 ? 'GitHub did not accept this token. Check it was copied whole.' : (err as Error).message;
      error.hidden = false;
    } finally {
      form.classList.remove('busy');
    }
  });

  const token = recall(TOKEN_KEY) ?? recall(TOKEN_KEY, 'session');
  if (token) {
    try {
      await signIn(token, recall(TOKEN_KEY) !== null);
      return;
    } catch (err) {
      if (err instanceof GitHubError && err.status === 401) {
        remember(TOKEN_KEY, null);
        remember(TOKEN_KEY, null, 'session');
      }
      error.textContent = (err as Error).message;
      error.hidden = false;
    }
  }
  $('signin').hidden = false;
}
