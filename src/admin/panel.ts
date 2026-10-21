// The site panel at /admin/. It edits src/data/photos.json, videos.json, fylki.json, pages.json, site.json and texts.json, the same files
// the site is built from, and saves them with any new pictures as one commit on main; the site then rebuilds by itself.
import { GitHub, GitHubError, OWNER, REPO, type Change } from './github';
import { shrink, slugify } from './images';
import { videoId } from '../lib/videos';
import { pageSlug } from '../lib/slug';
import { SHAPES, cutOf } from '../lib/banner-shapes';

type Size = 'normal' | 'wide' | 'big';
type Photo = { src: string; alt: string; size?: Size; home?: boolean };
type Video = { url: string; title?: string; by?: string; poster?: string; home?: boolean };
type Member = { name: string; title?: string; portrait?: string; discord?: string };
type Role = 'leaders' | 'thegns' | 'merkismadr' | 'hirdmenn';
/** A place on the map of the Jarldom, in percent of the map's width and height from its top left corner. */
type Spot = { x: number; y: number };
type PinSize = 'small' | 'normal' | 'big';
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
  /** Where its banner stands on the map of the Jarldom. */
  mapAt?: Spot;
  /** Its name above its banner on the map; under it when left out. */
  mapNameAbove?: boolean;
  /** Colours from its banner for its own page, as BannerColors in src/data/clan.ts. */
  colors?: { accent: string; glow?: string };
  /** How the bottom of its banner is cut, an id from src/lib/banner-shapes.ts; straight when left out. */
  shape?: string;
};
type Fylki = Flokkr & {
  /** Its role on the clan's Discord server; everyone with it is listed on the Fylki's page. */
  discordRole?: string;
  flokkr?: Flokkr[];
  /** For a Fylki that was a Flokkr: its old page, which the site forwards here. */
  movedFrom?: string;
};
type Post = { title: string; date: string; text?: string[]; picture?: string };
/** Any other banner on the map: an ally, a castle, a battlefield. */
type Marker = { name: string; banner?: string; link?: string; size?: PinSize; at: Spot; nameAbove?: boolean };
/** A name written on the map, such as a sea or a land. */
type MapLabel = { text: string; size?: PinSize; tilt?: number; light?: boolean; at: Spot };
/** Pages that stay off the site until they are turned on. */
type Pages = {
  news: { on?: boolean; posts: Post[] };
  map: {
    on?: boolean;
    picture?: string;
    intro?: string;
    /** false hides the names under the banners. */
    names?: boolean;
    clanAt?: Spot;
    clanNameAbove?: boolean;
    markers?: Marker[];
    labels?: MapLabel[];
  };
};
/** The clan's own banner: its picture (drawn in its colours without one) and its shape. */
type ClanBanner = { banner?: string; shape?: string };
/** Settings for the whole site: the clan's own banner, and poles over every banner. */
type Site = { banners?: { clan?: ClanBanner; poles?: boolean } };
/** The words and pictures of the home page, the Jarldom and Ranks pages, and what Google shows (texts.json). */
type Texts = {
  google: { title: string; description: string };
  hero: { picture?: string; alt?: string; eyebrow?: string; text?: string; facts?: string[] };
  about: { eyebrow?: string; title: string; text?: string; pillars?: { name: string; text?: string; image?: string; alt?: string; video?: string }[] };
  week: { title: string; text?: string; events?: { day: string; name: string; text?: string; monthly?: boolean }[] };
  media: { eyebrow?: string; title: string; gamesText?: string; games?: { name: string; image?: string }[] };
  faq: { eyebrow?: string; title: string; questions?: { q: string; a: string }[] };
  join: { picture?: string; eyebrow?: string; title: string; text?: string; steps?: { title: string; text?: string }[] };
  jarldom: { text?: string };
  ranks: { text?: string; hall: { picture?: string; alt?: string; eyebrow?: string; title: string; text?: string } };
};
type Data = { photos: Photo[]; videos: Video[]; fylki: Fylki[]; pages: Pages; site: Site; texts: Texts };
type Key = keyof Data;
type Tab = 'photos' | 'videos' | 'fylki' | 'news' | 'map' | 'texts';
const TABS: Tab[] = ['photos', 'videos', 'fylki', 'news', 'map', 'texts'];

const FILES: Record<Key, string> = {
  photos: 'src/data/photos.json',
  videos: 'src/data/videos.json',
  fylki: 'src/data/fylki.json',
  pages: 'src/data/pages.json',
  site: 'src/data/site.json',
  texts: 'src/data/texts.json',
};
const NAMES: Record<Key, string> = { photos: 'photos', videos: 'videos', fylki: 'Fylki', pages: 'pages', site: 'banner settings', texts: 'texts' };
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
/** Backgrounds and other pictures of the pages, from the Texts tab. */
const SITE_IMG = '/img/site/';
const TOKEN_KEY = 'vsc-panel-token';
const TAB_KEY = 'vsc-panel-tab';
const COLS_KEY = 'vsc-panel-cols';

const repoPath = (value: string) => (value.startsWith(GALLERY) ? value.slice(1) : `public${value}`);
const managed = (value?: string) => !!value && (value.startsWith(GALLERY) || value.startsWith(FYLKI_IMG) || value.startsWith(SITE_IMG));
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
let data = { photos: [], videos: [], fylki: [], pages: { news: { posts: [] }, map: {} }, site: {}, texts: {} } as unknown as Data;
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
let tab: Tab = TABS.find((t) => t === recall(TAB_KEY, 'session')) ?? 'photos';
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

/** Shrinks a picked file and keeps it for the next save. Returns the value to write in the data.
 *  A background (across the whole screen) and a picture of a page (Texts tab) are saved as WebP, which is much
 *  smaller at the same look; a browser that cannot write WebP (Safari) saves a JPEG instead. */
async function addPicture(file: File, kind: 'photo' | 'banner' | 'portrait' | 'map' | 'background' | 'picture', name = file.name) {
  const png = kind === 'banner';
  const site = kind === 'background' || kind === 'picture';
  const width = kind === 'photo' || kind === 'map' || kind === 'background' ? 2560 : kind === 'picture' ? 1600 : 900;
  let blob = await shrink(file, width, png ? 'image/png' : site ? 'image/webp' : 'image/jpeg');
  if (site && blob.type !== 'image/webp') blob = await shrink(file, width, 'image/jpeg');
  const ext = png ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
  const value = uniqueValue(kind === 'photo' ? GALLERY : site ? SITE_IMG : FYLKI_IMG, slugify(name), ext);
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
  d.pages?.map?.markers?.forEach((m) => add(m.banner));
  add(d.site?.banners?.clan?.banner);
  const t = d.texts;
  [t?.hero?.picture, t?.join?.picture, t?.ranks?.hall?.picture].forEach(add);
  t?.about?.pillars?.forEach((p) => add(p.image));
  t?.media?.games?.forEach((g) => add(g.image));
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

function bannerBox(obj: { banner?: string; name?: string }, redraw: () => void, label = 'Banner', fileName = `${obj.name || 'banner'}-banner`) {
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
              obj.banner = await addPicture(file, 'banner', fileName);
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
    h(
      'div',
      { class: 'fields' },
      input(m, 'name', { required: true, placeholder: 'Name' }),
      input(m, 'title', { placeholder: 'Rank or role (optional)' }),
      input(m, 'discord', { placeholder: 'Discord user ID, if the name does not find them' }),
    ),
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
    mapAt: k.mapAt,
    mapNameAbove: k.mapNameAbove,
    colors: k.colors,
    shape: k.shape,
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

/** The site's gold, where a new colour starts. */
const GOLD = '#c49c55';

/** One colour of the page: a box that turns it on or off, and the colour itself. */
function colorPick(u: Flokkr, key: 'accent' | 'glow', label: string, redraw: () => void) {
  const value = u.colors?.[key];
  return h(
    'label',
    { class: 'color-pick' },
    h('input', {
      type: 'checkbox',
      checked: !!value,
      // The glow only goes with an accent.
      disabled: key === 'glow' && !u.colors,
      onchange: (e: Event) => {
        if ((e.target as HTMLInputElement).checked) {
          u.colors ??= { accent: GOLD };
          if (key === 'glow') u.colors.glow = u.colors.accent;
        } else if (key === 'accent') delete u.colors;
        else delete u.colors!.glow;
        changed();
        redraw();
      },
    }),
    h('span', {}, label),
    h('input', {
      type: 'color',
      value: value ?? GOLD,
      disabled: !value,
      oninput: (e: Event) => {
        u.colors![key] = (e.target as HTMLInputElement).value;
        changed();
      },
    }),
  );
}

/** The cut a banner has now; one the panel no longer knows counts as straight. */
const shapeNow = (v?: string) => (SHAPES.some((s) => s.cut && s.id === v) ? v! : 'straight');

/** Every cut of a banner's bottom, each drawn as a small banner with `look`'s picture; a click picks it. */
function shapePicker(obj: Record<string, any>, key: string, look: { banner?: string; main?: boolean }, redraw: () => void) {
  const now = shapeNow(obj[key]);
  return h(
    'div',
    { class: 'shapes' },
    ...SHAPES.map((s) =>
      h(
        'button',
        {
          type: 'button',
          class: `shape${s.id === now ? ' on' : ''}`,
          title: s.label,
          'aria-pressed': String(s.id === now),
          onclick: () => {
            if (s.cut) obj[key] = s.id;
            else delete obj[key];
            changed();
            redraw();
          },
        },
        bannerEl({ ...look, shape: s.id }),
        h('small', {}, s.label),
      ),
    ),
  );
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
            parent
              ? null
              : field(
                  'Discord role ID',
                  input(u, 'discordRole', { placeholder: 'e.g. 1553798318537179198' }),
                  'Everyone with this role on the clan’s Discord is listed on the page, refreshed every hour. In Discord: Server Settings → Roles, right-click the role → Copy Role ID. Empty hides the list.',
                ),
            field(
              'Description',
              input(u, 'description', { area: 3 }),
              parent ? 'With a description, saga, LS or photos, the Flokkr gets its own page.' : 'One or two sentences under the name.',
            ),
            h(
              'div',
              { class: 'field' },
              h('span', { class: 'label' }, 'Colours of its page'),
              h('div', { class: 'color-picks' }, colorPick(u, 'accent', 'Accent', redraw), colorPick(u, 'glow', 'Glow', redraw)),
              h(
                'small',
                {},
                `Take them from the banner. The accent takes the place of the gold on the ${what} page, and the glow lights the banner and tints the page. Without them the page has the site's gold.`,
              ),
            ),
            h(
              'div',
              { class: 'field' },
              h('span', { class: 'label' }, 'Shape of the banner'),
              shapePicker(u, 'shape', u, redraw),
              h('small', {}, 'How the bottom of the banner is cut, everywhere on the site. The picture is cut with it, so a shape with deep cuts suits a banner with nothing important at the bottom.'),
            ),
          ),
        ),
        !parent && u.movedFrom ? h('p', { class: 'meta' }, `This Fylki grew out of a Flokkr. Its old page, ${u.movedFrom}, forwards here.`) : null,
        h('h3', {}, 'Saga'),
        h(
          'div',
          { class: 'panel-box' },
          field('Saga title', input(u, 'loreTitle', { placeholder: parent ? 'e.g. The Sworn Warband of Norðmǿrr Fylki' : 'e.g. The People of Norðmǿrr' })),
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

/** Poles over the banners in the panel too, as on the site (class on <body>, global.css). */
const showPoles = () => document.body.classList.toggle('banner-poles', data.site.banners?.poles === true);

/** For every banner at once: poles over them. */
function bannerSettings() {
  const banners = (data.site.banners ??= {});
  return h(
    'div',
    { class: 'banner-settings' },
    toggle(banners, 'poles', 'Banners on poles', showPoles),
    h('small', {}, 'Poles go over every banner on the site. Each banner picks its own shape in its form.'),
  );
}

/** The clan's own banner, over the Fylki on the Jarldom page and on the map: its picture and its shape, folded away. */
function clanBannerForm() {
  const box = h('div', { class: 'panel-box basics clan-banner' });
  const redraw = () => {
    const clan = ((data.site.banners ??= {}).clan ??= {});
    box.replaceChildren(
      bannerBox(clan, redraw, 'Drawn', 'volsung-clan-banner'),
      h(
        'div',
        { class: 'fields' },
        h('small', {}, 'Over the Fylki on the Jarldom page and on the map. Without a picture the site draws it in black and white.'),
        h('div', { class: 'field' }, h('span', { class: 'label' }, 'Shape of the banner'), shapePicker(clan, 'shape', { ...clan, main: true }, redraw)),
      ),
    );
  };
  redraw();
  return h('details', { class: 'clan-banner-fold' }, h('summary', {}, 'Banner of the Völsung Clan'), box);
}

function fylkiView() {
  fylkiIndex = Math.min(fylkiIndex, Math.max(0, data.fylki.length - 1));
  const f = data.fylki[fylkiIndex];
  const k = f && flokkrIndex !== null ? f.flokkr?.[flokkrIndex] : undefined;
  if (!k) flokkrIndex = null;
  return h(
    'section',
    {},
    h('div', { class: 'bar' }, h('div', {}, h('h2', {}, 'Fylki'), h('p', {}, 'Each Fylki has its own page. The order here is the order on the Jarldom page and in the menu.')), bannerSettings()),
    flokkrIndex === null ? clanBannerForm() : null,
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

// ---------- News ----------

/** A post's page on the site, as src/data/clan.ts names it. */
const postId = (p: Post) => pageSlug(`${p.date ?? ''} ${p.title}`);
/** Whether a post is on the site already: saved, with News turned on. */
function published(p: Post) {
  const live = JSON.parse(saved.pages) as Pages;
  return !!live.news?.on && live.news.posts.some((q) => q.title && postId(q) === postId(p));
}

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
      h(
        'div',
        { class: 'tools' },
        removeButton(list, i, redraw, 'post'),
        published(p) ? h('a', { class: 'textlink', href: `/news/${postId(p)}/`, target: '_blank', rel: 'noopener' }, 'Open on the site') : null,
      ),
    ),
  );
}

function newsView() {
  const news = data.pages.news;
  const count = h('p', { class: 'meta' });
  const list = h('div', { class: 'posts' });
  const redraw = () => {
    count.textContent = `${news.posts.length} post${news.posts.length === 1 ? '' : 's'}${news.on ? '' : '. News is off, so none of them is on the site yet.'}`;
    list.replaceChildren(...(news.posts.length ? news.posts.map((_, i) => postCard(news.posts, i, redraw)) : [h('p', { class: 'meta' }, 'No posts yet.')]));
  };
  redraw();
  const add = () => {
    news.posts.unshift({ title: '', date: new Date().toISOString().slice(0, 10), text: [] });
    changed();
    redraw();
    (list.querySelector('input[data-required]') as HTMLInputElement | null)?.focus();
  };
  return h(
    'section',
    {},
    h(
      'div',
      { class: 'bar' },
      h(
        'div',
        {},
        h('h2', {}, 'News'),
        h('p', {}, 'Posts on the News page, the newest first, each with a page of its own. While News is off, none of it is on the site.'),
      ),
      h('div', { class: 'add switch' }, toggle(news, 'on', 'On the site', redraw), h('button', { type: 'button', class: 'btn btn-gold', onclick: add }, 'Add post')),
    ),
    count,
    list,
  );
}

// ---------- map of the Jarldom ----------

const keep = (n: number) => Math.round(Math.min(100, Math.max(0, n)) * 10) / 10;
const SIZES: [PinSize, string][] = [
  ['small', 'Small'],
  ['normal', 'Normal'],
  ['big', 'Big'],
];

/** Everything that can stand on the map, in the order of the list beside it. */
type Pin = {
  name: string;
  banner?: string;
  main?: boolean;
  shape?: string;
  size: PinSize;
  sub?: boolean;
  get: () => Spot | undefined;
  set: (s?: Spot) => void;
  /** Its name above the banner instead of under it, which is left out of the file. */
  above?: boolean;
  setAbove: (above: boolean) => void;
};
function mapPins(map: Pages['map']): Pin[] {
  const unit = (u: Flokkr, size: PinSize, fallback: string, sub = false): Pin => ({
    name: u.name || fallback,
    banner: u.banner,
    shape: u.shape,
    size,
    sub,
    get: () => u.mapAt,
    set: (s) => (s ? (u.mapAt = s) : delete u.mapAt),
    above: u.mapNameAbove,
    setAbove: (a) => (a ? (u.mapNameAbove = true) : delete u.mapNameAbove),
  });
  return [
    { name: 'The Völsung Clan', main: true, banner: data.site.banners?.clan?.banner, shape: data.site.banners?.clan?.shape, size: 'big',
      get: () => map.clanAt,
      set: (s) => (s ? (map.clanAt = s) : delete map.clanAt),
      above: map.clanNameAbove,
      setAbove: (a) => (a ? (map.clanNameAbove = true) : delete map.clanNameAbove),
    },
    ...data.fylki.flatMap((f) => [unit(f, 'normal', 'New Fylki'), ...(f.flokkr ?? []).map((k) => unit(k, 'small', 'New Flokkr', true))]),
    ...(map.markers ?? []).map(
      (m): Pin => ({
        name: m.name || 'New banner',
        banner: m.banner,
        size: m.size ?? 'normal',
        get: () => m.at,
        set: (s) => s && (m.at = s),
        above: m.nameAbove,
        setAbove: (a) => (a ? (m.nameAbove = true) : delete m.nameAbove),
      }),
    ),
  ];
}

/** Side by side across the middle, so things put on one after another do not cover each other. */
function freeSpot(map: Pages['map']): Spot {
  const n = mapPins(map).filter((p) => p.get()).length + (map.labels ?? []).length;
  return { x: 15 + ((n * 17) % 75), y: 50 };
}

/** A banner as the site shows it (src/components/Banner.astro), cut to its shape; the clan's own is drawn in its colours without a picture. */
function bannerEl(pin: { banner?: string; main?: boolean; shape?: string }) {
  let inside: Kid = null;
  if (pin.banner) {
    const img = h('img', { alt: '' });
    img.draggable = false;
    showImage(img, pin.banner);
    inside = img;
  } else if (pin.main) inside = h('i', { class: 'emblem', 'aria-hidden': 'true' });
  const cut = cutOf(pin.shape);
  const el = h('span', { class: `banner${pin.main ? ' main' : pin.banner ? '' : ' todo'}${cut ? ' shaped' : ''}` }, h('span', { class: 'cloth' }, inside));
  if (cut) el.style.setProperty('--cut', cut);
  return el;
}

/** Lets `el` be dragged around the map; `grip` is the part whose middle is the point. */
function dragOnMap(el: HTMLElement, grip: HTMLElement, stage: HTMLElement, get: () => Spot, set: (s: Spot) => void) {
  const place = () => ((el.style.left = `${get().x}%`), (el.style.top = `${get().y}%`));
  place();
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    // Where it was grabbed, so it does not jump under the pointer.
    const r = grip.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    const drag = (ev: PointerEvent) => {
      const s = stage.getBoundingClientRect();
      set({ x: keep(((ev.clientX - dx - s.left) / s.width) * 100), y: keep(((ev.clientY - dy - s.top) / s.height) * 100) });
      place();
    };
    el.addEventListener('pointermove', drag);
    el.addEventListener('lostpointercapture', () => (el.removeEventListener('pointermove', drag), changed()), { once: true });
  });
}

/** The map as the site shows it, with everything on it dragged into place. Returns it with a function that redraws it. */
function mapStage(map: Pages['map']) {
  const img = h('img', { alt: '' });
  img.draggable = false;
  showImage(img, map.picture);
  const stage = h('div', { class: 'jarldom map-stage' });
  const draw = () => {
    stage.classList.toggle('nameless', map.names === false);
    const labels = (map.labels ?? []).map((l) => {
      const el = h('span', { class: `map-label ${l.size ?? 'normal'}${l.light ? ' light' : ''}`, title: 'Drag this name into place' }, l.text || 'New name');
      el.style.setProperty('--tilt', `${l.tilt ?? 0}deg`);
      dragOnMap(el, el, stage, () => l.at, (s) => (l.at = s));
      return el;
    });
    const pins = mapPins(map)
      .filter((p) => p.get())
      .map((p) => {
        const banner = bannerEl(p);
        const el = h('div', { class: `pennant ${p.size} map-pin${p.above ? ' name-above' : ''}`, title: `Drag ${p.name} onto its land` }, banner, h('b', {}, h('span', {}, p.name)));
        dragOnMap(el, banner, stage, () => p.get()!, p.set);
        return el;
      });
    stage.replaceChildren(img, ...labels, ...pins);
  };
  draw();
  return { stage, draw };
}

/** A box that puts a banner's name above it on the map. */
function nameAbove(p: Pin, after: () => void) {
  return h(
    'label',
    { class: 'toggle small' },
    h('input', { type: 'checkbox', checked: !!p.above, onchange: (e: Event) => (p.setAbove((e.target as HTMLInputElement).checked), changed(), after()) }),
    h('span', {}, 'Name above'),
  );
}

/** The clan, every Fylki and its Flokkr, each put on the map or taken off with its button. */
function pinList(map: Pages['map'], redraw: () => void) {
  const rows = mapPins(map)
    .slice(0, 1 + units(data).length)
    .map((p) => {
      const on = !!p.get();
      return h(
        'div',
        { class: `pin-row${p.sub ? ' sub' : ''}` },
        bannerEl(p),
        h('div', { class: 'pin-name' }, h('span', {}, p.name), on ? nameAbove(p, redraw) : null),
        h(
          'button',
          { type: 'button', title: on ? `Take ${p.name} off the map` : `Put ${p.name} on the map`, onclick: () => (p.set(on ? undefined : freeSpot(map)), changed(), redraw()) },
          on ? 'Take off' : 'Put on',
        ),
      );
    });
  return h('div', { class: 'pin-list' }, h('h4', {}, 'Banners'), ...rows);
}

function markerCard(list: Marker[], i: number, redraw: () => void, drawStage: () => void) {
  const m = list[i];
  const name = input(m, 'name', { required: true, placeholder: 'e.g. Our allies of the Raven Clan' });
  name.addEventListener('input', drawStage);
  const size = select(m, 'size', SIZES, 'normal');
  size.addEventListener('change', drawStage);
  const above = h(
    'label',
    { class: 'toggle' },
    h('input', {
      type: 'checkbox',
      checked: !!m.nameAbove,
      onchange: (e: Event) => {
        if ((e.target as HTMLInputElement).checked) m.nameAbove = true;
        else delete m.nameAbove;
        changed();
        drawStage();
      },
    }),
    h('span', {}, 'Name above the banner'),
  );
  return h(
    'article',
    { class: 'marker-card' },
    bannerBox(m, redraw),
    h(
      'div',
      { class: 'fields' },
      field('Name', name),
      field('Link', input(m, 'link', { placeholder: 'https://… or /fylki/…' }), 'Optional. A click on the banner opens it.'),
      field('Size', size),
      h('div', { class: 'tools' }, above, removeButton(list, i, redraw, 'banner')),
    ),
  );
}

function labelRow(list: MapLabel[], i: number, redraw: () => void, drawStage: () => void) {
  const l = list[i];
  const text = input(l, 'text', { required: true, placeholder: 'e.g. Norðrvegr' });
  text.addEventListener('input', drawStage);
  const size = select(l, 'size', SIZES, 'normal');
  size.addEventListener('change', drawStage);
  const colour = h(
    'select',
    {
      value: l.light ? 'light' : 'dark',
      onchange: (e: Event) => {
        if ((e.target as HTMLSelectElement).value === 'light') l.light = true;
        else delete l.light;
        changed();
        drawStage();
      },
    },
    h('option', { value: 'dark' }, 'Dark ink'),
    h('option', { value: 'light' }, 'Light, for a dark sea'),
  );
  const degrees = h('output', {}, `${l.tilt ?? 0}°`);
  const tilt = h('input', {
    type: 'range',
    min: -60,
    max: 60,
    step: 1,
    value: l.tilt ?? 0,
    oninput: (e: Event) => {
      const v = Number((e.target as HTMLInputElement).value);
      if (v) l.tilt = v;
      else delete l.tilt;
      degrees.textContent = `${v}°`;
      changed();
      drawStage();
    },
  });
  return h(
    'div',
    { class: 'label-row' },
    field('Name', text),
    field('Size', size),
    field('Colour', colour),
    h('label', { class: 'field tilt' }, h('span', { class: 'label' }, 'Tilt ', degrees), tilt),
    h('div', { class: 'tools' }, removeButton(list, i, redraw, 'name')),
  );
}

function mapView() {
  const map = data.pages.map;
  const view = h('section', {});
  const redraw = () => {
    const { stage, draw } = mapStage(map);
    const names = h(
      'label',
      { class: 'toggle' },
      h('input', {
        type: 'checkbox',
        checked: map.names !== false,
        onchange: (e: Event) => {
          if ((e.target as HTMLInputElement).checked) delete map.names;
          else map.names = false;
          changed();
          draw();
        },
      }),
      h('span', {}, 'Names by the banners'),
    );
    // Left out of the file until something is added.
    const markers = map.markers ?? [];
    const labels = map.labels ?? [];
    const addMarker = () => ((map.markers ??= []).push({ name: '', size: 'normal', at: freeSpot(map) }), changed(), redraw());
    const addLabel = () => ((map.labels ??= []).push({ text: '', at: freeSpot(map) }), changed(), redraw());
    view.replaceChildren(
      ...present(
        h(
          'div',
          { class: 'bar' },
          h(
            'div',
            {},
            h('h2', {}, 'Map of the Jarldom'),
            h('p', {}, 'A page with the banners of the clan, its Fylki and Flokkr on their lands; a click on a banner opens its page. While it is on, the menu at the top and the Jarldom page link to it.'),
          ),
          h('div', { class: 'add switch' }, toggle(map, 'on', 'On the site')),
        ),
        h(
          'div',
          { class: 'page-box' },
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
            map.picture ? names : null,
          ),
          map.picture ? null : h('p', { class: 'meta' }, 'No map yet. Until there is one, the page says the map is still being drawn.'),
        ),
        map.picture
          ? h(
              'p',
              { class: 'meta' },
              'Drag the banners and names into place. A name stands under its banner unless “Name above” is ticked beside it. Everything grows and shrinks with the map as on the site; on a phone the names by the banners and the small names are left out.',
            )
          : null,
        map.picture ? h('div', { class: 'map-edit' }, stage, pinList(map, redraw)) : null,
        map.picture
          ? h(
              'div',
              { class: 'page-box' },
              h(
                'div',
                { class: 'bar' },
                h('div', {}, h('h3', {}, 'Other banners'), h('p', { class: 'meta' }, 'Allies, castles, battlefields: anything else with a banner. Each one goes on the map as soon as it is added.')),
                h('button', { type: 'button', class: 'btn btn-gold', onclick: addMarker }, 'Add banner'),
              ),
              markers.length ? h('div', { class: 'markers' }, ...markers.map((_, i) => markerCard(markers, i, redraw, draw))) : null,
            )
          : null,
        map.picture
          ? h(
              'div',
              { class: 'page-box' },
              h(
                'div',
                { class: 'bar' },
                h(
                  'div',
                  {},
                  h('h3', {}, 'Names on the map'),
                  h('p', { class: 'meta' }, 'Seas, lands and places written on the map in the site’s lettering, so Old Norse names come out right. Leave them out of the picture itself.'),
                ),
                h('button', { type: 'button', class: 'btn btn-gold', onclick: addLabel }, 'Add a name'),
              ),
              ...labels.map((_, i) => labelRow(labels, i, redraw, draw)),
            )
          : null,
      ),
    );
  };
  redraw();
  return view;
}

// ---------- texts and pictures of the pages ----------

const DAYS: [string, string][] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => [d, d]);
/** The parts of the Texts tab folded open, kept while the panel is open. */
const openParts = new Set<string>(['Google']);

function textsMissing(t?: Texts) {
  if (!t) return false;
  const blank = (v?: string) => !v?.trim();
  return (
    blank(t.google?.title) ||
    blank(t.google?.description) ||
    [t.about, t.week, t.media, t.faq, t.join, t.ranks?.hall].some((part) => blank(part?.title)) ||
    (t.about?.pillars ?? []).some((p) => blank(p.name)) ||
    (t.week?.events ?? []).some((e) => blank(e.name)) ||
    (t.media?.games ?? []).some((g) => blank(g.name)) ||
    (t.faq?.questions ?? []).some((q) => blank(q.q) || blank(q.a)) ||
    (t.join?.steps ?? []).some((s) => blank(s.title))
  );
}

/** One part of a page, folded; `build` draws its fields and is called again whenever a list in it changes. */
function part(title: string, hint: string, build: (redraw: () => void) => Kid[]) {
  const box = h('div', { class: 'panel-box' });
  const redraw = () => box.replaceChildren(...present(hint ? h('p', { class: 'meta' }, hint) : null, ...build(redraw)));
  redraw();
  const fold = h('details', { class: 'text-part', open: openParts.has(title) }, h('summary', {}, title), box);
  fold.addEventListener('toggle', () => (fold.open ? openParts.add(title) : openParts.delete(title)));
  return fold;
}

/** A picture of a page with its Upload, Replace and Remove buttons. */
function pagePicture(obj: Record<string, any>, key: string, kind: 'background' | 'picture', fileName: string, hint: string, redraw: () => void, removable = true) {
  const img = h('img', { alt: '' });
  showImage(img, obj[key]);
  const pick = () =>
    pickFiles(false, async ([file]) => {
      if (!file) return;
      obj[key] = await addPicture(file, kind, fileName);
      changed();
      redraw();
    });
  return h(
    'div',
    { class: `page-pic ${kind}` },
    h('div', { class: `pic${obj[key] ? '' : ' empty'}` }, obj[key] ? img : h('span', {}, 'No picture')),
    h(
      'div',
      { class: 'tools' },
      h('button', { type: 'button', onclick: pick }, obj[key] ? 'Replace' : 'Upload'),
      obj[key] && removable ? h('button', { type: 'button', class: 'remove', onclick: () => (delete obj[key], changed(), redraw()) }, 'Remove') : null,
    ),
    h('small', {}, hint),
  );
}

/** A list in a part: its rows, and a button that adds one. */
function rows<T>(list: T[], row: (item: T, i: number) => Kid[], add: () => T, what: string, redraw: () => void, cls = '') {
  return h(
    'div',
    { class: `text-rows ${cls}` },
    ...list.map((item, i) => h('div', { class: 'text-row' }, h('div', { class: 'body' }, ...present(...row(item, i))), tools(list, i, redraw, what, true))),
    h('button', { type: 'button', class: 'btn btn-ghost small', onclick: () => (list.push(add()), changed(), redraw()) }, `Add ${what}`),
  );
}

/** How the home page shows in Google, redrawn while the title and description are typed. */
function googlePreview(g: Texts['google']) {
  const title = h('b');
  const text = h('span');
  const counts = h('small');
  const draw = () => {
    title.textContent = g.title;
    text.textContent = g.description;
    counts.textContent = `Title ${g.title.length} characters, description ${g.description.length}. Google shows about 60 of the title and 155 of the description; the rest is cut off with …, but still counts in searches.`;
  };
  draw();
  return { preview: h('div', { class: 'google-preview' }, h('span', {}, 'volsungclan.com'), title, text), counts, draw };
}

function textsView() {
  const t = data.texts;
  const g = googlePreview(t.google);
  const googleTitle = input(t.google, 'title', { required: true });
  const googleText = input(t.google, 'description', { required: true, area: 3 });
  googleTitle.addEventListener('input', g.draw);
  googleText.addEventListener('input', g.draw);
  const facts = (t.hero.facts ??= []);
  const pillars = (t.about.pillars ??= []);
  const events = (t.week.events ??= []);
  const games = (t.media.games ??= []);
  const questions = (t.faq.questions ??= []);
  const steps = (t.join.steps ??= []);
  const factInput = (i: number) =>
    h('input', {
      value: facts[i],
      placeholder: 'e.g. 3+ weekly events',
      oninput: (e: Event) => ((facts[i] = (e.target as HTMLInputElement).value), changed()),
    });
  const videoInput = (p: (typeof pillars)[number]) =>
    h('input', {
      value: p.video ? `https://youtu.be/${p.video}` : '',
      placeholder: 'https://www.youtube.com/watch?v=…',
      oninput: (e: Event) => {
        const el = e.target as HTMLInputElement;
        const id = videoId(el.value.trim());
        el.classList.toggle('invalid', !!el.value.trim() && !id);
        if (id) p.video = id;
        else delete p.video;
        changed();
      },
    });
  return h(
    'section',
    { class: 'texts-view' },
    h(
      'div',
      { class: 'bar' },
      h(
        'div',
        {},
        h('h2', {}, 'Texts and pictures'),
        h('p', {}, 'The words and pictures of the home page, the Jarldom and Ranks pages, and what Google shows. Each part folds open. A field left empty is left off the site, except the ones marked red when empty.'),
      ),
    ),
    part('Google', 'The title and description Google shows for the home page, and Discord when someone shares the link. Google picks up a change some days after it is saved; Search Console, URL inspection, Request indexing makes it sooner.', () => [
      g.preview,
      field('Title', googleTitle),
      field('Description', googleText),
      g.counts,
    ]),
    part('Home page: top', 'The first screen of the home page, over the background picture.', (redraw) => [
      pagePicture(t.hero, 'picture', 'background', 'home-background', 'Across the whole screen, so a wide picture (16:9) at least 1920 pixels across. The text sits on the left, so keep what matters on the right.', redraw, false),
      field('What the background shows', input(t.hero, 'alt', { placeholder: 'For search engines and blind visitors.' })),
      field('Line over the clan name', input(t.hero, 'eyebrow')),
      field('Text under the clan name', input(t.hero, 'text', { area: 2 })),
      h('div', { class: 'field' }, h('span', { class: 'label' }, 'Tags under the buttons'), rows(facts, (_, i) => [factInput(i)], () => '', 'tag', redraw, 'inline'), h('small', {}, 'A number at the start, like 3+ or 500+, is written in bold.')),
    ]),
    part('Home page: Who we are', 'The light band under the first screen, with a column for each thing the clan does.', (redraw) => [
      field('Small line', input(t.about, 'eyebrow')),
      field('Heading', input(t.about, 'title', { required: true })),
      field('Text', input(t.about, 'text', { area: 3 })),
      h('h4', {}, 'Columns'),
      rows(
        pillars,
        (p) => [
          pagePicture(p, 'image', 'picture', p.name || 'column', 'A YouTube video plays in its place when it has one.', redraw),
          h(
            'div',
            { class: 'fields' },
            field('Name', input(p, 'name', { required: true })),
            field('Text', input(p, 'text', { area: 4 })),
            field('What the picture shows', input(p, 'alt')),
            field('YouTube video', videoInput(p), 'Optional. Without a picture the video shows its own.'),
          ),
        ],
        () => ({ name: '' }),
        'column',
        redraw,
        'cards',
      ),
    ]),
    part('Home page: the week', 'Where to find us. While the Discord calendar has events planned it shows those; an event there with the same name as one here gets the text from here.', (redraw) => [
      field('Heading', input(t.week, 'title', { required: true })),
      field('Text', input(t.week, 'text', { area: 2 }), 'The site adds whether these are the next events on the calendar or the fixed week.'),
      h('h4', {}, 'The fixed week'),
      rows(
        events,
        (e) => [
          h('div', { class: 'row' }, field('Day', select(e, 'day', DAYS, 'Mon')), field('Name', input(e, 'name', { required: true })), toggle(e, 'monthly', 'Once a month')),
          field('Text', input(e, 'text')),
        ],
        () => ({ day: 'Mon', name: '' }),
        'event',
        redraw,
      ),
    ]),
    part('Home page: Media', 'The photos and videos come from the Photos and Videos tabs; here are the words around them and the other games.', (redraw) => [
      field('Small line', input(t.media, 'eyebrow')),
      field('Heading', input(t.media, 'title', { required: true })),
      field('Text over the other games', input(t.media, 'gamesText')),
      h('h4', {}, 'Other games'),
      rows(
        games,
        (gm) => [pagePicture(gm, 'image', 'picture', gm.name || 'game', 'Optional. Without one the tile shows the clan serpent.', redraw), h('div', { class: 'fields' }, field('Name', input(gm, 'name', { required: true })))],
        () => ({ name: '' }),
        'game',
        redraw,
        'cards',
      ),
    ]),
    part('Home page: Questions', 'Questions newcomers ask, each folding open to its answer. Written in the words people search with, they also help Google.', (redraw) => [
      field('Small line', input(t.faq, 'eyebrow')),
      field('Heading', input(t.faq, 'title', { required: true })),
      rows(questions, (q) => [field('Question', input(q, 'q', { required: true })), field('Answer', input(q, 'a', { required: true, area: 3 }))], () => ({ q: '', a: '' }), 'question', redraw),
    ]),
    part('Home page: Join today', 'The last part of the home page, over its own background picture.', (redraw) => [
      pagePicture(t.join, 'picture', 'background', 'join-background', 'A wide picture; it is shown dark under the text.', redraw, false),
      field('Small line', input(t.join, 'eyebrow')),
      field('Heading', input(t.join, 'title', { required: true })),
      field('Text', input(t.join, 'text', { area: 2 })),
      h('h4', {}, 'Steps'),
      rows(steps, (st) => [field('Title', input(st, 'title', { required: true })), field('Text', input(st, 'text'))], () => ({ title: '' }), 'step', redraw),
    ]),
    part('Jarldom page', 'The page with the clan banner and every Fylki; the banners are set on the Fylki tab.', () => [field('Text under the heading', input(t.jarldom, 'text', { area: 3 }))]),
    part('Ranks page', 'The ranks themselves are part of the site; here are the text under the heading and the great hall at the bottom.', (redraw) => [
      field('Text under the heading', input(t.ranks, 'text', { area: 2 })),
      h('h4', {}, 'The great hall'),
      pagePicture(t.ranks.hall, 'picture', 'picture', 'great-hall', 'A click on it opens it full size.', redraw),
      field('What the picture shows', input(t.ranks.hall, 'alt')),
      field('Small line', input(t.ranks.hall, 'eyebrow')),
      field('Heading', input(t.ranks.hall, 'title', { required: true })),
      field('Text', input(t.ranks.hall, 'text', { area: 3 })),
    ]),
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
    data.pages.news.posts.some((p) => !p.title?.trim()) ||
    (data.pages.map.markers ?? []).some((m) => !m.name?.trim()) ||
    (data.pages.map.labels ?? []).some((l) => !l.text?.trim()) ||
    textsMissing(data.texts);
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
    return message('Some required fields are empty: every photo needs a description, every video a link, every Fylki, Flokkr, member and banner on the map a name, every post a title, every name on the map its text, and every heading, name and question on the Texts tab its words. Empty ones are marked red, or on another tab.', 'error');
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
  const views: Record<Tab, () => HTMLElement> = { photos: photosView, videos: videosView, fylki: fylkiView, news: newsView, map: mapView, texts: textsView };
  showPoles();
  $('content').replaceChildren(views[tab]());
}

async function load() {
  base = await gh.head();
  const [photos, videos, fylki, pages, site, texts, galleryFiles, fylkiFiles, siteFiles] = await Promise.all([
    gh.text(FILES.photos, base),
    gh.text(FILES.videos, base),
    gh.text(FILES.fylki, base),
    gh.text(FILES.pages, base),
    gh.text(FILES.site, base),
    gh.text(FILES.texts, base),
    gh.list(GALLERY.slice(1, -1), base),
    gh.list(`public${FYLKI_IMG.slice(0, -1)}`, base),
    gh.list(`public${SITE_IMG.slice(0, -1)}`, base),
  ]);
  data = { photos: JSON.parse(photos), videos: JSON.parse(videos), fylki: JSON.parse(fylki), pages: JSON.parse(pages), site: JSON.parse(site), texts: JSON.parse(texts) };
  for (const k of KEYS) saved[k] = serialize(data[k]);
  repoFiles = new Set([...galleryFiles, ...fylkiFiles, ...siteFiles]);
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
    tab = b.dataset.tab as Tab;
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
