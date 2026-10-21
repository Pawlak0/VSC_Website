// Upcoming events from the clan's Sesh calendar on Discord. Sesh's /link command gives a calendar
// feed (.ics); its address is kept as the SESH_ICS_URL secret in GitHub, never in the repository.
// The parsing is shared with the clan's API, which serves the same events between rebuilds (api/src/calendar.ts).
import { eventsBetween, type CalendarEvent } from '../../api/src/calendar';

export type { CalendarEvent };

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
