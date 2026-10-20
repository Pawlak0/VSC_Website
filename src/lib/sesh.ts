// Upcoming events from the clan's Sesh calendar on Discord. Sesh's /link command gives a calendar
// feed (.ics); its address is kept as the SESH_ICS_URL secret in GitHub, never in the repository.
import ICAL from 'ical.js';

export type CalendarEvent = {
  start: Date;
  name: string;
  text: string;
  /** Time zone the event was written in, when the feed names one. */
  zone?: string;
};

/** Events from `from` to `to`, earliest first. Null when the feed is not set or cannot be read. */
export async function upcomingEvents(url: string | undefined, from: Date, to: Date): Promise<CalendarEvent[] | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const events = eventsBetween(await res.text(), from, to);
    console.log(`[sesh] ${events.length} events in the calendar window`);
    for (const e of events) console.log(`[sesh] ${e.start.toISOString()} ${e.name}${e.zone ? ` (${e.zone})` : ''}`);
    return events;
  } catch (e) {
    console.warn(`[sesh] calendar not loaded, the page keeps the fixed week: ${(e as Error).message}`);
    return null;
  }
}

export function eventsBetween(ics: string, from: Date, to: Date): CalendarEvent[] {
  const root = new ICAL.Component(ICAL.parse(ics));
  for (const tz of root.getAllSubcomponents('vtimezone')) ICAL.TimezoneService.register(tz);

  // A moved or renamed occurrence of a repeating event comes as a separate entry with the same UID.
  const all = root.getAllSubcomponents('vevent').map((v) => new ICAL.Event(v));
  const masters = new Map(all.filter((e) => !e.isRecurrenceException()).map((e) => [e.uid, e]));
  const orphans = all.filter((e) => e.isRecurrenceException() && !masters.get(e.uid));
  for (const e of all) if (e.isRecurrenceException()) masters.get(e.uid)?.relateException(e);

  const out: CalendarEvent[] = [];
  const add = (item: (typeof all)[number], start: InstanceType<typeof ICAL.Time>) => {
    const zone = item.component.getFirstProperty('dtstart')?.getParameter('tzid') ?? undefined;
    // A zone the feed names but does not define would otherwise be read as the build server's clock (UTC).
    const date = (zone && start.zone === ICAL.Timezone.localTimezone && wallClockIn(start, zone)) || start.toJSDate();
    if (date < from || date >= to) return;
    if (item.component.getFirstPropertyValue('status') === 'CANCELLED') return;
    const name = (item.summary ?? '').trim();
    if (name) out.push({ start: date, name, text: firstLine(item.description), zone });
  };
  for (const e of [...masters.values(), ...orphans]) {
    if (!e.isRecurring()) {
      add(e, e.startDate);
      continue;
    }
    const it = e.iterator();
    for (let t = it.next(); t && t.toJSDate() < to; t = it.next()) {
      const occurrence = e.getOccurrenceDetails(t);
      add(occurrence.item, occurrence.startDate);
    }
  }
  return out.sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** The moment a wall-clock time in an IANA time zone (e.g. Europe/Athens) happens. Null for a zone name Intl does not know. */
function wallClockIn(t: InstanceType<typeof ICAL.Time>, zone: string): Date | null {
  let format: Intl.DateTimeFormat;
  try {
    format = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
  } catch {
    return null;
  }
  const offset = (at: number) => {
    const p = Object.fromEntries(format.formatToParts(at).map((x) => [x.type, Number(x.value)]));
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - at;
  };
  const wall = Date.UTC(t.year, t.month - 1, t.day, t.hour, t.minute, t.second);
  // The offset is checked a second time at the found moment, so a date next to a clock change still lands right.
  const first = wall - offset(wall);
  return new Date(wall - offset(first));
}

/** First readable line of a Discord-style description, without markdown or links. */
function firstLine(description?: string | null) {
  const line =
    (description ?? '')
      .split('\n')
      .map((l) => l.replace(/<[^>]*>/g, '').replace(/[*_~`>#|]/g, '').trim())
      .find((l) => l && !/^https?:\/\//.test(l)) ?? '';
  return line.length > 140 ? `${line.slice(0, 139).trimEnd()}…` : line;
}
