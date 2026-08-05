// Hand-authored level chunks, 24 cells wide on a 2-unit grid.
//
// Scatter functions produce clutter; composition has to be authored. These are
// stitched end to end to build the act, so editing the level means editing text.
//
//   ' '  void (no floor — reads as a dark drop)
//   '.'  floor
//   '='  walkway floor (lighter plate)
//   '-'  wall running east-west
//   '|'  wall running north-south
//   'D'  door section    'W' window section  (orientation follows neighbours)
//   'o'  column
//   'c'  crate      'C' container    'k' long crate
//   'p'  computer   'v' vessel       'S' shelf
//   'T'  teleporter 'L' laser        'P' pod
//
// Anything unrecognised falls back to plain floor.

export const CHUNK_WIDTH = 24;

// Columns 8..15 are the walkway in every chunk, so the act stays traversable
// whatever order the chunks are stitched in.
export const LANE_MIN = 8;
export const LANE_MAX = 15;

// Void is doing as much work as floor here. The facility has to read as
// platforms in dark space, the way the concept art does — a wall-to-wall floor
// slab just reads as an endless corridor.
//
//                0        8       16
//                |        |        |
const LANDING = [
  '    ....========....    ',
  '    ....========....    ',
  '  ..oo..========..oo..  ',
  '  ......========......  ',
  '  .cc...========...CC.  ',
  '  ......========......  ',
  '  ..----========----..  ',
  '  ..|T.|========|.T|..  ',
  '  ..|..|========|..|..  ',
  '  ..----========----..  ',
  '  ......========......  ',
  '    ....========....    ',
  '      ..========..      ',
];

// Deliberately lopsided: a heavy block on the left, loose clutter on the right.
const REFINERY = [
  '  .----.========..      ',
  '  .|pp|.========..oo..  ',
  '  .|..|.========......  ',
  '  .|L.|.========..cc..  ',
  '  .|..|.========......  ',
  '  .--D-.========..----  ',
  '  ......========..|S|.  ',
  '  ..o...========..|.|.  ',
  '  ......========..----  ',
  '   .....========......  ',
  '    ....========..k...  ',
  '     ...========......  ',
];

const YARD = [
  '        ========        ',
  '   ..o..========..o..   ',
  '   .....========.....   ',
  '  ..CCC.========.kkk..  ',
  '  ..CCC.========.kkk..  ',
  '   .....========.....   ',
  '        ========        ',
  '   .----========----.   ',
  '   .|v.|========|.v|.   ',
  '   .----========----.   ',
  '        ========        ',
  '     ...========...     ',
];

const GATEHOUSE = [
  '     ...========...     ',
  '   .----========----.   ',
  '   .|..|========|..|.   ',
  '   .|p.|========|.p|.   ',
  '   .|..|========|..|.   ',
  '   .W..|========|..W.   ',
  '   .|..|========|..|.   ',
  '   .|T.|========|.T|.   ',
  '   .|..|========|..|.   ',
  '   .----========----.   ',
  '     ...========...     ',
];

// Pad/truncate to a uniform width so the renderer can index cells directly.
function normalise(rows: string[]): string[] {
  return rows.map((row) => row.slice(0, CHUNK_WIDTH).padEnd(CHUNK_WIDTH, ' '));
}

export const CHUNKS: string[][] = [LANDING, REFINERY, YARD, GATEHOUSE].map(normalise);

// Chunk order down the act. Repeats are fine — they read as one facility.
export const CHUNK_SEQUENCE = [0, 2, 1, 3, 0, 2, 1, 3, 2, 1, 0, 3];
