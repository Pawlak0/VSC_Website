# VSC_Website

Website of **The Völsung Clan**, a Mount & Blade II: Bannerlord community. Built with [Astro](https://astro.build/) and hosted for free on GitHub Pages at [volsungclan.com](https://volsungclan.com).

## Site panel

Photos, videos and the Fylki pages are edited at [volsungclan.com/admin/](https://volsungclan.com/admin/). Editors sign in with a GitHub token (classic, `public_repo` scope) from an account with write access to this repository; the token stays in their browser. Saving makes one commit on `main` with the changed data files and any new pictures, and the site rebuilds. Photos are shrunk in the browser to at most 2560 px JPEG before they are saved; banners stay PNG. A picture removed in the panel is deleted from the repository on save. The panel's code is in `src/admin/` and `src/pages/admin/`.

## Editing content

Most text lives in one file: [`src/data/clan.ts`](src/data/clan.ts).

| What | Where |
| --- | --- |
| "Who we are" points, with a picture or a YouTube video under each | `pillars` |
| Weekly events | `events` |
| Fylki (name, banner, Flokkr, description, LS, saga, photos, page colours) | `src/data/fylki.json`, editable in the site panel; `colors` (`{ accent, glow }`, taken from the banner) colour that unit's own page and light its banner; a Flokkr has the same fields apart from its own Flokkr, and one with a description, saga, LS or photos gets its own page at `/fylki/<fylki>/<flokkr>/`. The panel's "Make it a Fylki" turns a grown Flokkr into a Fylki, and its old page forwards to the new one (`movedFrom`) |
| Ranks and leadership | `tiers`, `shieldwall`, `folk`, `leaders` (rank icons go in `public/img/ranks/`, set as `icon`) |
| Gallery images | `src/data/photos.json`, editable in the site panel; pictures go in `src/assets/gallery/` and the build resizes them; `home: true` also puts one on the home page, the Media page shows all of them |
| Members' videos | `src/data/videos.json`, editable in the site panel: a YouTube link (title and channel come from YouTube; `title` and `by` override them), or a video that is not on YouTube as `/video/name.mp4` in `public/video/` with a still `name.webp` next to it and a `title`; `home: true` also shows it on the home page above the photos, the Media page shows all of them; both stay hidden while the list is empty |
| News and the map of the Jarldom | `src/data/pages.json`, editable in the site panel's News and Map tabs; each page exists only while it is turned `on`. News posts are `{ title, date, text, picture }`, each with its own page at `/news/<date>-<title>/`, the three newest also on the home page. The map is a picture in `public/img/fylki/`; on it stand the clan banner (`clanAt`), each Fylki and Flokkr at its `mapAt` in `fylki.json`, other `markers` (`{ name, banner, link, size }`) and `labels` written in the site's lettering (`{ text, size, tilt, light }`), all placed by `{ x, y }` in percent. A banner's name hangs under it unless it has `mapNameAbove: true` (`clanNameAbove` for the clan, `nameAbove` for a marker). Their look is shared with the panel in `src/styles/jarldom-map.css` |
| The clan's own banner, banner shapes and poles | `src/data/site.json`, editable at the top of the site panel's Fylki tab: `banners.clan` (`{ banner, shape }`; without a `banner` the site draws it in black and white) and `banners.poles` (`true` hangs every banner from a pole). Each Fylki and Flokkr picks its `shape` in `fylki.json`, one of the cuts in `src/lib/banner-shapes.ts` (straight when left out) |
| Creators (members' channels) | `creators`, as `{ name, url }`; the block shows once the list has someone |
| Other games | `otherGames`; a picture goes in `public/img/games/` and is set as `image` |
| Questions above "Join today" | `faq` |
| Discord invite | `DISCORD_URL` |

A Fylki banner goes in `public/img/fylki/`, for example `public/img/fylki/nordmorr.webp`, and is set as `"banner": "/img/fylki/nordmorr.webp"`. Every entry in `fylki.json` gets its own page at `/fylki/<slug>/`; without a `slug` the address is made from the name (Norðmǿrr becomes `nordmorr`).

Each Fylki's LS (leadership) is set in its `ls` field, with four lists: `leaders`, `thegns`, `merkismadr` and `hirdmenn`. A member looks like `{ "name": "Leon", "title": "Lendr Maðr · Infantry", "portrait": "/img/fylki/leon.jpg" }`; `title` and `portrait` are optional.

The Fylki's saga goes in `lore` (one string per paragraph, with an optional heading in `loreTitle`; past four paragraphs the rest folds under "Read the whole saga") and its screenshots in `gallery` (`{ src, alt, size }`, files in `src/assets/gallery/` like the main gallery). The media section appears once `gallery` has at least one image.

### Discord counts

The members and online counts under the hero come from the public Discord invite (`DISCORD_URL`), with no bot or token. They are read when the site builds and refreshed in the visitor's browser; if Discord does not answer, the line is left out. The workflow rebuilds the site every hour to keep them, and the calendar, fresh. GitHub pauses hourly runs after 60 days without commits; they restart from the Actions tab.

### Discord calendar (Sesh)

"Where to find us" lists the next events (up to six, within 30 days) from the clan's Sesh calendar. The feed address from Sesh's `/link` command is stored as the repository secret `SESH_ICS_URL` (Settings → Secrets and variables → Actions) and never in the code, since anyone with it can read the calendar. Without JavaScript dates and times are shown in `CLAN_TIME_ZONE` (`src/data/clan.ts`); otherwise visitors see them in their own time zone. When an event's name matches one in `events`, the site uses that description, and a monthly one gets a dotted line. Without the secret, or when the calendar is empty, the fixed `events` week is shown.

### Scroll effects

Blocks fade up as they scroll into view. Add `data-reveal` to an element to bring it in as one piece, or `data-stagger` to bring its children in one after another. The styles are at the end of `src/styles/global.css`; visitors who ask their system for reduced motion get the page without effects.

## Running locally

Requires Node 22.

```sh
npm install
npm run dev      # http://localhost:4321
npm run build    # output in dist/
```

## Deployment

Every push to `main` builds the site and deploys it to GitHub Pages (`.github/workflows/deploy.yml`). Pull requests only run the build, so a broken change shows up before merging.

One-time setup in the repository: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

### Domain (OVHcloud)

The site is served at `volsungclan.com`. The first domain, `volsung-clan.tech`, sends visitors there with an OVHcloud redirection (that works for http:// links only). Because it is published by GitHub Actions, GitHub ignores the `public/CNAME` file, so the domain is set in **Settings → Pages → Custom domain**.

In the OVHcloud DNS zone for the domain (the bare domain is written `@` there), set:

| Type | Subdomain | Target |
| --- | --- | --- |
| A | @ | 185.199.108.153 |
| A | @ | 185.199.109.153 |
| A | @ | 185.199.110.153 |
| A | @ | 185.199.111.153 |
| AAAA | @ | 2606:50c0:8000::153 |
| AAAA | @ | 2606:50c0:8001::153 |
| AAAA | @ | 2606:50c0:8002::153 |
| AAAA | @ | 2606:50c0:8003::153 |
| CNAME | www | pawlak0.github.io. |

Remove the A and AAAA records OVHcloud adds for its own hosting on `@`, and remove other records on `www` (a CNAME cannot sit next to them). Leave NS, MX, SPF and TXT records alone. Once GitHub has issued the certificate, tick **Enforce HTTPS** in Settings → Pages.

### Search engines

The domain also lives in `astro.config.mjs` (`site`). Every page gets its canonical address, the sitemap (`/sitemap.xml`) and `robots.txt` from it, so a new domain means changing `site`, `public/CNAME` and the custom domain in Settings → Pages. The home page also describes the clan to search engines (name, Discord link) in a `ld+json` block in `src/layouts/Base.astro`.

To get the site into Google, add the domain in [Google Search Console](https://search.google.com/search-console) as a Domain property, verify it with the TXT record it gives (in the OVHcloud DNS zone), then submit `https://<domain>/sitemap.xml` under Sitemaps.
