// Clansmen's names as they read on the clan's Discord, such as "ᚲ [Lǫgmaðr] Pawlak": a rune that puts the ranks in
// order, then the rank as a tag, then the name itself.

/** The name past the runes, marks and tags in front of it. */
export const plainName = (name: string) => name.replace(/^(?:[^\p{L}\p{N}\[]|\p{Script=Runic}|\[[^\]]*\])*/u, '').trim() || name;

/** A name as the Fylki lists show it: without any runes, split into the rank tag in front (if there is one, without
 * its brackets) and the name itself. "ᚲ [Lǫgmaðr] Pawlak" gives { tag: 'Lǫgmaðr', name: 'Pawlak' }. */
export function splitName(full: string): { tag?: string; name: string } {
  const bare = full.replace(/\p{Script=Runic}/gu, '').replace(/\s+/g, ' ').trim();
  const lead = /^(?:[^\p{L}\p{N}\[]|\[[^\]]*\])*/u.exec(bare)![0];
  const tags = [...lead.matchAll(/\[([^\]]*)\]/g)].map((m) => m[1].trim()).filter(Boolean);
  const name = bare.slice(lead.length).trim();
  if (!name) return { name: bare || full };
  return tags.length ? { tag: tags.join(' · '), name } : { name };
}
