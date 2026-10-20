/** The page address of a Fylki or Flokkr, made from its name: Norðmǿrr becomes nordmorr. The site panel uses it too. */
export const pageSlug = (s: string) =>
  s.toLowerCase().replace(/ð/g, 'd').replace(/þ/g, 'th').replace(/æ/g, 'ae').replace(/[øǿ]/g, 'o')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
