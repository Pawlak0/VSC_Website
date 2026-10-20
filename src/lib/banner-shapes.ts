// How the bottom of a banner is cut, chosen for each Fylki and Flokkr (and the clan's own banner) in the site panel.
// Each shape is a CSS clip-path over the banner's box, in percent of its width (x) and height (y), so the picture is cut
// to it at any size. The site and the panel both draw banners with these.

type Point = [number, number];
const polygon = (points: Point[]) => `polygon(${points.map(([x, y]) => `${x}% ${y}%`).join(', ')})`;
/** The top corners, which every shape keeps square. */
const TOP: Point[] = [[0, 0], [100, 0]];
const round = (n: number) => Math.round(n * 10) / 10;

/** A row of `n` teeth along the bottom, `depth` percent of the height deep. */
function teeth(n: number, depth: number): Point[] {
  const points: Point[] = [[100, 100 - depth]];
  for (let i = n - 1; i >= 0; i--) points.push([round(((i + 0.5) * 100) / n), 100], [round((i * 100) / n), 100 - depth]);
  return points;
}

/** The bottom as a curve from the right side to the left, through `steps` points. */
function curve(y: (x: number) => number, steps = 16): Point[] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const x = 100 - (i * 100) / steps;
    return [round(x), round(y(x))] as Point;
  });
}

export type BannerShape = { id: string; label: string; cut?: string };

export const SHAPES: BannerShape[] = [
  { id: 'straight', label: 'Straight' },
  { id: 'point', label: 'Point', cut: polygon([...TOP, [100, 84], [50, 100], [0, 84]]) },
  { id: 'long-point', label: 'Long point', cut: polygon([...TOP, [100, 68], [50, 100], [0, 68]]) },
  { id: 'swallowtail', label: 'Swallowtail', cut: polygon([...TOP, [100, 100], [50, 82], [0, 100]]) },
  { id: 'notch', label: 'Notch', cut: polygon([...TOP, [100, 100], [50, 91], [0, 100]]) },
  { id: 'three-tails', label: 'Three tails', cut: polygon([...TOP, [100, 100], [75, 86], [50, 100], [25, 86], [0, 100]]) },
  { id: 'square-notch', label: 'Square notch', cut: polygon([...TOP, [100, 100], [65, 100], [65, 88], [35, 88], [35, 100], [0, 100]]) },
  { id: 'dagged', label: 'Dagged', cut: polygon([...TOP, ...teeth(5, 8)]) },
  { id: 'fringe', label: 'Fringe', cut: polygon([...TOP, ...teeth(12, 4)]) },
  { id: 'rounded', label: 'Rounded', cut: polygon([...TOP, ...curve((x) => 86 + 14 * Math.sqrt(1 - ((x - 50) / 50) ** 2))]) },
  // Steep at the sides, to a point in the middle, like the foot of a shield.
  { id: 'shield', label: 'Shield', cut: polygon([...TOP, ...curve((x) => { const t = 1 - Math.abs(x - 50) / 50; return 66 + 34 * t * (2 - t); })]) },
  { id: 'slanted', label: 'Slanted', cut: polygon([...TOP, [100, 86], [0, 100]]) },
  {
    id: 'torn',
    label: 'Torn',
    cut: polygon([
      ...TOP,
      [100, 90], [95, 96], [89, 91], [82, 99], [74, 93], [67, 97], [58, 90], [50, 98], [42, 92],
      [33, 100], [25, 93], [17, 97], [9, 91], [4, 95], [0, 92],
    ]),
  },
];

/** The clip-path of a shape, or nothing for a straight banner or a shape this site does not know. */
export const cutOf = (shape?: string) => SHAPES.find((s) => s.id === shape)?.cut;
