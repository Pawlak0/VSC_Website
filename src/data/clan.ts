// Clan content in one place; pages read from it. The texts and pictures of the pages are in texts.json, edited in the
// site panel's Texts tab.
import photos from './photos.json';
import videoList from './videos.json';
import fylkiList from './fylki.json';
import extraPages from './pages.json';
import siteSettings from './site.json';
import siteTexts from './texts.json';
import { pageSlug } from '../lib/slug';
import { SHAPES } from '../lib/banner-shapes';

export const DISCORD_URL = 'https://discord.gg/volsung-clan';
/** The clan's Discord server, where each Fylki's members are read from by its role. */
export const DISCORD_GUILD_ID = '1309581602619129948';
/** Discord user IDs of members who asked not to be listed on the Fylki pages. */
export const UNLISTED: string[] = [];

/** The pillars under "Who we are". A YouTube video replaces the picture when `video` is set. */
export type Pillar = {
  name: string;
  text: string;
  /** Path under /public, e.g. /img/desert-march.webp. */
  image: string;
  alt: string;
  /** YouTube video id, the part after watch?v= in the link. Optional. */
  video?: string;
};

// The words and pictures of the pages, from the site panel (texts.json). A row left without its name is skipped.
type Texts = typeof siteTexts;
const full = <T>(rows: T[] | undefined, key: keyof T) => (rows ?? []).filter((r) => String(r[key] ?? '').trim());
export const texts = {
  ...siteTexts,
  hero: { ...siteTexts.hero, facts: (siteTexts.hero.facts ?? []).filter((f) => f.trim()) },
  join: { ...siteTexts.join, steps: full(siteTexts.join.steps, 'title') },
} as Texts;

export const pillars: Pillar[] = full(siteTexts.about.pillars as Pillar[], 'name');

export type Event = {
  day: 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';
  name: string;
  text: string;
  monthly?: boolean;
};

/** The fixed week, shown until the Discord calendar (Sesh) is connected and when it has nothing planned. */
export const events: Event[] = full(siteTexts.week.events as Event[], 'name');

/** Time zone of calendar dates and times when the visitor's browser cannot convert them to their own. */
export const CLAN_TIME_ZONE = 'Europe/Berlin';

export type Member = {
  name: string;
  /** Rank or role shown under the name, e.g. "Hofðingi · Infantry". */
  title?: string;
  /** Path under /public, e.g. /img/fylki/leon.jpg. */
  portrait?: string;
};

/** The LS (leadership) of a Fylki or a Flokkr. Empty lists show as "To be announced". */
export type FylkiLeadership = {
  leaders: Member[];
  thegns: Member[];
  merkismadr: Member[];
  hirdmenn: Member[];
};

/**
 * A smaller band under a Fylki, with the same fields as a Fylki apart from its own Flokkr, so one that grows
 * can become a Fylki with everything it has (the site panel does it in one click).
 * One with a description, saga, LS or photos gets its own page at /fylki/<fylki>/<flokkr>/.
 */
export type Flokkr = {
  slug: string;
  /** Without the word Flokkr, e.g. Tryggr. */
  name: string;
  subtitle?: string;
  /** Path under /public, e.g. /img/fylki/tryggr.png. */
  banner?: string;
  description?: string;
  ls: FylkiLeadership;
  /** Heading over the saga, e.g. "The Sworn Warband of Norðmǿrr Fylki". */
  loreTitle?: string;
  lore: string[];
  gallery: GalleryImage[];
  /** Where its banner stands on the map of the Jarldom; see Spot. */
  mapAt?: Spot;
  /** Its name above its banner on the map, instead of under it. */
  mapNameAbove?: boolean;
  /** Colours from its banner for its own page; see BannerColors. */
  colors?: BannerColors;
  /** How the bottom of its banner is cut, an id from SHAPES in src/lib/banner-shapes.ts. Straight when empty. */
  shape?: string;
};

/**
 * Colours taken from a banner, as #rrggbb. On the unit's own page `accent` takes the place of the site's gold (small
 * headings, link lines, the banner's frame) and lights the banner. `glow`, when set, lights the banner instead and also
 * tints the lines and bands between the sections. The menu at the top and the footer keep the clan's gold.
 */
export type BannerColors = { accent: string; glow?: string };
/** The colour a banner is lit in: its glow, or its accent when it has no glow. */
export const glowOf = (c?: BannerColors) => c && (c.glow ?? c.accent);

/** A place on the map of the Jarldom, in percent of the map's width (x) and height (y) from its top left corner. */
export type Spot = { x: number; y: number };

export type Fylki = {
  slug: string;
  name: string;
  /** Its role on the clan's Discord server. Everyone with it is listed on the Fylki's page, refreshed every hour. Optional. */
  discordRole?: string;
  /** Short line under the banner, e.g. "Fylki of the Jarl". Optional. */
  subtitle?: string;
  /** Path under /public, e.g. /img/fylki/nordmorr.webp. Leave empty until the banner is ready. */
  banner?: string;
  flokkr: Flokkr[];
  description: string;
  ls: FylkiLeadership;
  /** Heading over the saga, e.g. "The People of Norðmǿrr". Optional. */
  loreTitle?: string;
  /** The saga of the Fylki, one string per paragraph. */
  lore: string[];
  /** Screenshots of this Fylki, like the main gallery: files in src/assets/gallery/. The section stays hidden while the list is empty. */
  gallery: GalleryImage[];
  /** For a Fylki that grew out of a Flokkr: its old page, e.g. /fylki/nordmorr/tryggr/, which now forwards here (astro.config.mjs). */
  movedFrom?: string;
  /** Where its banner stands on the map of the Jarldom. */
  mapAt?: Spot;
  /** Its name above its banner on the map. */
  mapNameAbove?: boolean;
  /** Colours from its banner for its own page. */
  colors?: BannerColors;
  /** How the bottom of its banner is cut. */
  shape?: string;
};

/** What each LS role means, shown on every Fylki and Flokkr page. */
export const lsRoles = (unit: 'Fylki' | 'Flokkr'): { key: keyof FylkiLeadership; name: string; text: string }[] => [
  { key: 'leaders', name: 'Leadership', text: `The leaders of the ${unit}` },
  { key: 'thegns', name: 'Thegns', text: `Officers of the ${unit}` },
  { key: 'merkismadr', name: 'Merkismaðr', text: 'Bannerman, the trusted sigil holder' },
  { key: 'hirdmenn', name: 'Hirðmaðr', text: `Bodyguard of the ${unit} leader` },
];

const named = (list?: Member[]) => (list ?? []).filter((m) => m?.name);
const leadership = (ls?: Partial<FylkiLeadership>): FylkiLeadership => ({
  leaders: named(ls?.leaders),
  thegns: named(ls?.thegns),
  merkismadr: named(ls?.merkismadr),
  hirdmenn: named(ls?.hirdmenn),
});
const photosOf = (list?: GalleryImage[]) => (list ?? []).filter((g) => g?.src);
const spot = (s?: Partial<Spot>): Spot | undefined => (Number.isFinite(s?.x) && Number.isFinite(s?.y) ? { x: s!.x!, y: s!.y! } : undefined);
const hex = (v?: string) => (/^#[0-9a-f]{6}$/i.test(v ?? '') ? v : undefined);
const colorsOf = (c?: Partial<BannerColors>): BannerColors | undefined => (hex(c?.accent) ? { accent: c!.accent!, glow: hex(c?.glow) } : undefined);
const shapeOf = (v?: string) => (SHAPES.some((s) => s.cut && s.id === v) ? v : undefined);

// Kept in fylki.json, which the site panel at /admin/ edits. A field the panel leaves out counts as empty,
// and a row added without a name or picture is skipped.
export const fylki: Fylki[] = (fylkiList as Partial<Fylki>[])
  .filter((f) => f.name)
  .map((f) => ({
    slug: pageSlug(f.slug || f.name!),
    name: f.name!,
    discordRole: /^\d{17,20}$/.test(f.discordRole?.trim() ?? '') ? f.discordRole!.trim() : undefined,
    subtitle: f.subtitle || undefined,
    banner: f.banner || undefined,
    description: f.description || 'Description to come.',
    // A Flokkr used to be only a name; both forms still work.
    flokkr: ((f.flokkr ?? []) as (Partial<Flokkr> | string)[])
      .map((k) => (typeof k === 'string' ? { name: k } : k))
      .filter((k) => k?.name)
      .map((k) => ({
        slug: pageSlug(k.slug || k.name!),
        name: k.name!,
        subtitle: k.subtitle || undefined,
        banner: k.banner || undefined,
        description: k.description || undefined,
        ls: leadership(k.ls),
        loreTitle: k.loreTitle || undefined,
        lore: (k.lore ?? []).filter(Boolean),
        gallery: photosOf(k.gallery),
        mapAt: spot(k.mapAt),
        mapNameAbove: k.mapNameAbove === true,
        colors: colorsOf(k.colors),
        shape: shapeOf(k.shape),
      })),
    ls: leadership(f.ls),
    loreTitle: f.loreTitle || undefined,
    lore: (f.lore ?? []).filter(Boolean),
    gallery: photosOf(f.gallery),
    movedFrom: f.movedFrom || undefined,
    mapAt: spot(f.mapAt),
    mapNameAbove: f.mapNameAbove === true,
    colors: colorsOf(f.colors),
    shape: shapeOf(f.shape),
  }));

/** Whether a Flokkr has enough about it for a page of its own. */
export const hasPage = (k: Flokkr) =>
  Boolean(k.description || k.lore.length || k.gallery.length || Object.values(k.ls).some((list) => list.length));

export type Rank = {
  name: string;
  text: string;
  /** Path under /public, e.g. /img/ranks/drengr.webp. Shown at 32 px next to the name. */
  icon?: string;
};
export type Tier = { name: string; meaning: string; ranks: Rank[] };

export const tiers: Tier[] = [
  {
    name: 'Óð-Ræði',
    meaning: 'The Wise Council',
    ranks: [
      { name: 'Jarl', text: 'The ruler of the Völsung clan', icon: '/img/ranks/jarl.webp' },
      { name: 'Lendr Maðr', text: 'High leadership, the strategic core', icon: '/img/ranks/lendrmadr.webp' },
    ],
  },
  {
    name: 'Aðal',
    meaning: 'The Nobles',
    ranks: [
      { name: 'Hofðingi', text: 'A chief, headstrong and decisive', icon: '/img/ranks/hofdingi.webp' },
      { name: 'Foringi', text: 'Commander of many victories', icon: '/img/ranks/foringi.webp' },
      { name: 'Lögmaðr', text: 'Lawman, capable and astute', icon: '/img/ranks/logmadr.webp' },
      { name: 'Seiðr', text: 'Seer, steward of the civilian branch', icon: '/img/ranks/seidr.webp' },
    ],
  },
  {
    name: 'Hýski',
    meaning: 'The Household',
    ranks: [
      { name: 'Hof-Verðir', text: 'Sacred ground guard, the fighting elite', icon: '/img/ranks/hofverdir.webp' },
      { name: 'Húskarl', text: "The Jarl's chosen protectors", icon: '/img/ranks/huskarl.webp' },
      { name: 'Merkismaðr', text: 'Bannerman of a Fylki', icon: '/img/ranks/merkismadr.webp' },
      { name: 'Hirðmaðr', text: 'Fylki leader bodyguard', icon: '/img/ranks/hirdmadr.webp' },
      { name: 'Skáld', text: 'Poet, expert of the civilian branch', icon: '/img/ranks/skald.webp' },
      { name: 'Visamaðr', text: 'Guide, veteran of civilian roles', icon: '/img/ranks/visamadr.webp' },
      { name: 'Mannaforað', text: 'Retired leadership', icon: '/img/ranks/mannaforad.webp' },
    ],
  },
];

/** The Skjaldborg (Shieldwall) has three parallel ladders, highest rank first. */
export const shieldwall: { infantry: Rank; archers: Rank; civilians: Rank }[] = [
  { infantry: { name: 'Vikingr', text: 'Veteran raider', icon: '/img/ranks/vikingr.webp' }, archers: { name: 'Langbogimaðr', text: 'Longbowman', icon: '/img/ranks/langbogimadr.webp' }, civilians: { name: 'Goði', text: 'Heathen priest', icon: '/img/ranks/godi.webp' } },
  { infantry: { name: 'Rekkr', text: 'Experienced warrior', icon: '/img/ranks/rekkr.webp' }, archers: { name: 'Frodiskyti', text: 'Wise archer', icon: '/img/ranks/frodiskyti.webp' }, civilians: { name: 'Rýnstrmaðr', text: 'Rune carver', icon: '/img/ranks/rynstrmadr.webp' } },
  { infantry: { name: 'Drengr', text: 'Climbing the ranks', icon: '/img/ranks/drengr.webp' }, archers: { name: 'Vördr', text: 'Watchman', icon: '/img/ranks/vordr.webp' }, civilians: { name: 'Brynjasmiðr', text: 'Mail smith', icon: '/img/ranks/brynjasmidr.webp' } },
  { infantry: { name: 'Bondi', text: "A warrior's beginning", icon: '/img/ranks/bondi.webp' }, archers: { name: 'Bogimaðr', text: 'Bowman, fresh to war', icon: '/img/ranks/bogimadr.webp' }, civilians: { name: 'Trételgja', text: 'Tree feller', icon: '/img/ranks/tretelgja.webp' } },
];

/** The first ranks of the Skjaldborg, shared by every branch, highest first. */
export const folk: Rank[] = [
  { name: 'Folk', text: 'Full-fledged members of the clan', icon: '/img/ranks/folk.webp' },
  { name: 'Thrall', text: 'Earned their rights through willingness to fight', icon: '/img/ranks/thrall.webp' },
];

export const leaders = [
  { rune: 'ᚠ', name: 'Teemu', role: 'Jarl · Overseer' },
  { rune: 'ᚦ', name: 'Leon', role: 'Lendr Maðr · Admin & Infantry' },
  { rune: 'ᚦ', name: 'Dries', role: 'Lendr Maðr · Infantry' },
  { rune: 'ᚦ', name: 'Yuniku', role: 'Lendr Maðr · Ranged' },
];

// Photos and videos live in photos.json and videos.json, and the Fylki in fylki.json; the site panel at /admin/ edits them (src/admin/).

export type GalleryImage = {
  /** A picture in src/assets/gallery/, e.g. /src/assets/gallery/rain-shieldwall.webp. The build resizes it, so a full screenshot is fine. */
  src: string;
  alt: string;
  /** How much of the grid it takes: big is two by two, wide is two across. */
  size?: 'normal' | 'big' | 'wide';
  /** Shown on the home page too; every photo is on the Media page. */
  home?: boolean;
};

export const gallery = (photos as GalleryImage[]).filter((g) => g?.src);

/** Videos by Völsung members, newest first. For a YouTube video only the link is needed: the build reads its title and channel from YouTube, and a `title` or `by` written here wins. A video that is not on YouTube can sit in public/video/ as an .mp4, with a still of the same name as .webp. */
export type Video = {
  /** e.g. https://www.youtube.com/watch?v=…, https://youtu.be/…, a Shorts link, or /video/name.mp4. */
  url: string;
  title?: string;
  /** Who made it, shown under the title. */
  by?: string;
  /** For a video file: the still shown on the card, when it is not the .webp of the same name. */
  poster?: string;
  /** Shown on the home page too, above the photos; every video is on the Media page. */
  home?: boolean;
};

export const videos = (videoList as Video[]).filter((v) => v?.url);

/** A post on the News page; each one also has a page of its own at /news/<id>/. */
export type Post = {
  /** Made from the date and title, e.g. 2026-10-20-tryggr-takes-the-field. */
  id: string;
  title: string;
  /** e.g. 2026-10-20; the newest post comes first. */
  date: string;
  /** One string per paragraph. */
  text: string[];
  /** A picture in src/assets/gallery/, like the photos. Optional. */
  picture?: string;
};

/** How big a banner stands on the map: Flokkr are small, Fylki normal, the clan's own banner big. */
export type PinSize = 'small' | 'normal' | 'big';

/** Anything else on the map: an allied clan, a castle, a battlefield. A marker with a link opens it. */
export type Marker = {
  name: string;
  /** Path under /public, e.g. /img/fylki/allies.png, like a Fylki banner. */
  banner?: string;
  link?: string;
  size: PinSize;
  at: Spot;
  /** Its name above its banner instead of under it. */
  nameAbove: boolean;
};

/** A name written on the map itself, such as a sea or a land, in the site's lettering so Old Norse names come out right. */
export type MapLabel = {
  text: string;
  size: PinSize;
  /** Degrees, clockwise; 0 is level. */
  tilt: number;
  /** Bone letters for a dark sea; otherwise dark ink. */
  light: boolean;
  at: Spot;
};

// Pages that are not on the site until they are turned on in the site panel (pages.json): News, and the map of the
// Jarldom. On the map stand the clan's banner (`clanAt`), each Fylki and Flokkr placed on it (`mapAt` in fylki.json)
// and any other markers, and names written on the map. The map itself is a picture in /img/fylki/.
type ExtraPages = {
  news?: { on?: boolean; posts?: Partial<Post>[] };
  map?: {
    on?: boolean;
    picture?: string;
    intro?: string;
    names?: boolean;
    clanAt?: Spot;
    clanNameAbove?: boolean;
    markers?: Partial<Marker>[];
    labels?: Partial<MapLabel>[];
  };
};
const extra = extraPages as ExtraPages;

export const news = {
  on: Boolean(extra.news?.on),
  posts: (extra.news?.posts ?? [])
    .filter((p) => p?.title)
    .map(
      (p): Post => ({
        id: pageSlug(`${p.date ?? ''} ${p.title}`),
        title: p.title!,
        date: p.date ?? '',
        text: (p.text ?? []).filter(Boolean),
        picture: p.picture || undefined,
      }),
    )
    .sort((a, b) => b.date.localeCompare(a.date))
    // Two posts with the same date and title would share a page.
    .filter((p, i, all) => all.findIndex((o) => o.id === p.id) === i),
};

export const jarldomMap = {
  on: Boolean(extra.map?.on),
  picture: extra.map?.picture || undefined,
  intro: extra.map?.intro || undefined,
  /** Names by the banners, under each one unless it says above; on a small screen they are left out anyway. */
  names: extra.map?.names !== false,
  clanAt: spot(extra.map?.clanAt),
  clanNameAbove: extra.map?.clanNameAbove === true,
  markers: (extra.map?.markers ?? [])
    .filter((m) => m?.name && spot(m.at))
    .map(
      (m): Marker => ({ name: m.name!, banner: m.banner || undefined, link: m.link || undefined, size: m.size ?? 'normal', at: spot(m.at)!, nameAbove: m.nameAbove === true }),
    ),
  labels: (extra.map?.labels ?? [])
    .filter((l) => l?.text?.trim() && spot(l.at))
    .map((l): MapLabel => ({ text: l.text!.trim(), size: l.size ?? 'normal', tilt: Number(l.tilt) || 0, light: Boolean(l.light), at: spot(l.at)! })),
};

/** Members who stream or make videos. The Creators block stays hidden while the list is empty. */
export type Creator = {
  name: string;
  /** Their channel, e.g. https://www.twitch.tv/name or https://www.youtube.com/@name. */
  url: string;
  /** Path under /public, e.g. /img/creators/leon.jpg. Optional. */
  image?: string;
};

export const creators: Creator[] = [];

export type Game = {
  name: string;
  /** Path under /public, e.g. /img/games/valheim.jpg. Until it is set the tile shows only the name. */
  image?: string;
};

export const otherGames: Game[] = full(siteTexts.media.games as Game[], 'name');

/** Questions newcomers ask, shown above "Join today" and written in the words people search with. */
export const faq: { q: string; a: string }[] = full(siteTexts.faq.questions, 'q');

// Settings for the whole site from the site panel (site.json): the clan's own banner (its picture, drawn in its colours
// without one, and its shape) and whether every banner hangs from a pole.
const settings = siteSettings as { banners?: { clan?: { banner?: string; shape?: string }; poles?: boolean } };
export const bannerLook = {
  clan: { banner: settings.banners?.clan?.banner || undefined, shape: shapeOf(settings.banners?.clan?.shape) },
  poles: settings.banners?.poles === true,
};
