// Clansmen's names as they read on the clan's Discord, such as "ᚲ [Lǫgmaðr] Pawlak": a rune that puts the ranks in
// order, then the rank as a tag, then the name itself.

/** The name past the runes, marks and tags in front of it. */
export const plainName = (name: string) => name.replace(/^(?:[^\p{L}\p{N}\[]|\p{Script=Runic}|\[[^\]]*\])*/u, '').trim() || name;
