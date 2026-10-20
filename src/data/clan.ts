// Clan content in one place. Edit text here; pages read from it.
import photos from './photos.json';
import videoList from './videos.json';
import fylkiList from './fylki.json';

export const DISCORD_URL = 'https://discord.gg/volsung-clan';

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

export const pillars: Pillar[] = [
  {
    name: 'Persistent Bannerlord',
    text: "One of the server's major factions. Daily player-led combat against other clans for resources, land and glory, fuelled by one of the strongest civilian divisions in the mod.",
    image: '/img/desert-march.webp',
    alt: 'The clan on the march across the desert',
  },
  {
    name: 'Weekly Events',
    text: 'Three main events every week with hundreds of other players. All optional, so you play on your own schedule.',
    image: '/img/bre-event.webp',
    alt: 'The Völsung shieldwall clashing with another faction on a forest hill',
  },
  {
    name: 'Training',
    text: 'Several sessions a month on settings, combat mechanics and groupfighting, plus dedicated sessions for archers and cavalry.',
    image: '/img/shields-close.webp',
    alt: 'Völsung shields locked together',
  },
  {
    name: 'Fieldbattles',
    text: 'Native fieldbattles against other clans, 20v20 and 25v25, and internal skirmish nights with mixed teams in competitive style.',
    image: '/img/meadow-wall.webp',
    alt: 'A long Völsung shieldwall facing the enemy across a meadow',
  },
];

export type Event = {
  day: 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';
  name: string;
  text: string;
  monthly?: boolean;
};

/** The fixed week, shown until the Discord calendar (Sesh) is connected and when it has nothing planned. */
export const events: Event[] = [
  { day: 'Tue', name: 'Middle-Earth', text: 'Lord of the Rings field battle with unique skins, weapons and maps.' },
  { day: 'Sat', name: 'Chronicles Drengr', text: '10th–11th century Europe with realistic damage, speed and armour.' },
  { day: 'Sun', name: 'BRE Sunday', text: 'Modded field battle, 500+ players, custom Völsung classes.' },
  { day: 'Sun', name: 'Promotion Ceremony', text: 'Last Sunday of the month, in our great hall.', monthly: true },
];

/** Time zone of calendar dates and times when the visitor's browser cannot convert them to their own. */
export const CLAN_TIME_ZONE = 'Europe/Berlin';

export type Member = {
  name: string;
  /** Rank or role shown under the name, e.g. "Hofðingi · Infantry". */
  title?: string;
  /** Path under /public, e.g. /img/fylki/leon.jpg. */
  portrait?: string;
};

/** The LS (leadership) of a Fylki. Empty lists show as "To be announced". */
export type FylkiLeadership = {
  leaders: Member[];
  thegns: Member[];
  merkismadr: Member[];
  hirdmenn: Member[];
};

/** A smaller band under a Fylki. One with a description or saga gets its own page at /fylki/<fylki>/<flokkr>/. */
export type Flokkr = {
  slug: string;
  /** Without the word Flokkr, e.g. Tryggr. */
  name: string;
  subtitle?: string;
  /** Path under /public, e.g. /img/fylki/tryggr.png. */
  banner?: string;
  description?: string;
  /** Heading over the saga, e.g. "The Sworn Warband of Norðmǿrr Fylki". */
  loreTitle?: string;
  lore: string[];
};

export type Fylki = {
  slug: string;
  name: string;
  /** Short line under the banner, e.g. "Fylki of the Jarl". Optional. */
  subtitle?: string;
  /** Path under /public, e.g. /img/fylki/nordmorr.png. Leave empty until the banner is ready. */
  banner?: string;
  flokkr: Flokkr[];
  description: string;
  ls: FylkiLeadership;
  /** Heading over the saga, e.g. "The Royal House of the North". Optional. */
  loreTitle?: string;
  /** The saga of the Fylki, one string per paragraph. */
  lore: string[];
  /** Screenshots of this Fylki, like the main gallery: files in src/assets/gallery/. The section stays hidden while the list is empty. */
  gallery: GalleryImage[];
};

/** What each LS role means, shown on every Fylki page. */
export const lsRoles: { key: keyof FylkiLeadership; name: string; text: string }[] = [
  { key: 'leaders', name: 'Leadership', text: 'The leaders of the Fylki' },
  { key: 'thegns', name: 'Thegns', text: 'Officers of the Fylki' },
  { key: 'merkismadr', name: 'Merkismaðr', text: 'Bannerman, the trusted sigil holder' },
  { key: 'hirdmenn', name: 'Hirðmaðr', text: 'Bodyguard of the Fylki leader' },
];

/** The page address of a Fylki: Norðmǿrr becomes nordmorr. */
const slugify = (s: string) =>
  s.toLowerCase().replace(/ð/g, 'd').replace(/þ/g, 'th').replace(/æ/g, 'ae').replace(/[øǿ]/g, 'o')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const named = (list?: Member[]) => (list ?? []).filter((m) => m?.name);

// Kept in fylki.json, which the site panel at /admin/ edits. A field the panel leaves out counts as empty,
// and a row added without a name or picture is skipped.
export const fylki: Fylki[] = (fylkiList as Partial<Fylki>[])
  .filter((f) => f.name)
  .map((f) => ({
    slug: slugify(f.slug || f.name!),
    name: f.name!,
    subtitle: f.subtitle || undefined,
    banner: f.banner || undefined,
    description: f.description || 'Description to come.',
    // A Flokkr used to be only a name; both forms still work.
    flokkr: ((f.flokkr ?? []) as (Partial<Flokkr> | string)[])
      .map((k) => (typeof k === 'string' ? { name: k } : k))
      .filter((k) => k?.name)
      .map((k) => ({
        slug: slugify(k.slug || k.name!),
        name: k.name!,
        subtitle: k.subtitle || undefined,
        banner: k.banner || undefined,
        description: k.description || undefined,
        loreTitle: k.loreTitle || undefined,
        lore: (k.lore ?? []).filter(Boolean),
      })),
    ls: {
      leaders: named(f.ls?.leaders),
      thegns: named(f.ls?.thegns),
      merkismadr: named(f.ls?.merkismadr),
      hirdmenn: named(f.ls?.hirdmenn),
    },
    loreTitle: f.loreTitle || undefined,
    lore: (f.lore ?? []).filter(Boolean),
    gallery: (f.gallery ?? []).filter((g) => g?.src),
  }));

/** Whether a Flokkr has enough written about it for a page of its own. */
export const hasPage = (k: Flokkr) => Boolean(k.description || k.lore.length);

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

export const otherGames: Game[] = [
  { name: 'Crusader Kings' },
  { name: 'Counter-Strike' },
  { name: 'Total War' },
  { name: 'Wardogs' },
  { name: 'Valheim' },
];

/** Questions newcomers ask, shown above "Join today" and written in the words people search with. */
export const faq: { q: string; a: string }[] = [
  {
    q: 'How do I join The Völsung Clan?',
    a: 'Join our Discord, post a short application in #applications using the template, and leadership will help you through onboarding.',
  },
  {
    q: 'Do I need Bannerlord multiplayer experience?',
    a: 'No. We are a newcomer-friendly clan: trainings, guides and experienced players help you learn the shieldwall, the bow or a civilian role. Cavalry is the exception: a place among our riders is earned and reserved for the best.',
  },
  {
    q: 'Where is the clan based and when do you play?',
    a: 'We are an EU clan. Our weekly events run in the evening, Central European Time: Middle-Earth on Tuesday, Chronicles on Saturday and BRE on Sunday. Persistent Bannerlord runs every day.',
  },
  {
    q: 'What do you play besides the events?',
    a: `Persistent Bannerlord, the open-world mod where we are one of the major factions, and community sessions of ${otherGames.map((g) => g.name).join(', ')} and more.`,
  },
  {
    q: 'How do ranks and promotions work?',
    a: 'The first ranks are Thrall and Folk. After that you climb the Infantry, Archer or Civilian ladder of the Skjaldborg. Promotions are earned through both your skill and your activity in the clan. They are announced at the Promotion Ceremony on the last Sunday of every month, and it is fine if you cannot make it to the ceremony.',
  },
];
