// reef.js — pure course maths for Reef Run.
//
// Same discipline as tavern.js and regatta.js: no DOM, no clock, no network,
// no crypto. The caller supplies hashes as hex; everything here is a pure
// function of its arguments, so it runs identically in a browser, in node
// tests, in an offline verifier, or vendored into a game server that wants
// to re-check a claimed win (BUILDING-GAMES.md §5).
//
// The game: a GRID of tiles hides R reefs, placed by the deciding seed
// (sha256(blockHash|mark), computed by the caller). BEFORE the tide, the
// player charts a course — K distinct tiles. If every charted tile is open
// water, the course pays C(GRID,K)/C(GRID-R,K) less the house edge; one reef
// on the course sinks it. The player shapes their own odds twice over:
// more reefs and longer courses both raise the multiplier.

export const GRID = 25;            // 5×5 — every tile index is 0..24
export const REEF_OPTIONS = [3, 5, 7];
export const MAX_PICKS = 10;
export const EDGE_BPS = 300;       // 3% house edge, identical for every course

// ---------------------------------------------------------------- counting

// Exact binomial coefficients. GRID is small, so plain floats stay exact
// (C(25,12) ≈ 5.2e6 — far inside integer-safe range).
export function comb(n, k) {
  if (k < 0 || k > n) return 0;
  k = Math.min(k, n - k);
  let out = 1;
  for (let i = 1; i <= k; i++) out = (out * (n - k + i)) / i;
  return Math.round(out);
}

// Probability that a K-tile course misses all R reefs.
export function chance(reefs, picks) {
  return comb(GRID - reefs, picks) / comb(GRID, picks);
}

// ---------------------------------------------------------------- pricing

export function quote(reefs, picks, stake, { edgeBps = EDGE_BPS } = {}) {
  if (!REEF_OPTIONS.includes(reefs)) throw new Error('quote: bad reef count');
  if (!Number.isInteger(picks) || picks < 1 || picks > MAX_PICKS) {
    throw new Error('quote: picks must be 1..' + MAX_PICKS);
  }
  if (!Number.isInteger(stake) || stake <= 0) throw new Error('quote: stake must be a positive integer');
  const p = chance(reefs, picks);
  const multiplier = (1 / p) * (1 - edgeBps / 10_000);
  const payout = Math.floor(stake * multiplier);
  return { chance: p, multiplier, payout, risk: stake };
}

// ---------------------------------------------------------------- the reefs

// xorshift128 seeded from the deciding seed — identical to the regatta's,
// deterministic and portable. No Math.random anywhere near an outcome.
function prng(seedHex) {
  const clean = String(seedHex).replace(/[^0-9a-fA-F]/g, '').padEnd(32, '7');
  let a = parseInt(clean.slice(0, 8), 16) | 0;
  let b = parseInt(clean.slice(8, 16), 16) | 0;
  let c = parseInt(clean.slice(16, 24), 16) | 0;
  let d = parseInt(clean.slice(24, 32), 16) | 0;
  return function next() {
    const t = b << 9; let r = b * 5; r = ((r << 7) | (r >>> 25)) * 9;
    c ^= a; d ^= b; b ^= c; a ^= d; c ^= t; d = (d << 11) | (d >>> 21);
    return ((r >>> 0) / 4294967296);
  };
}

// Where the reefs lie: a partial Fisher–Yates over 0..GRID-1 driven by the
// seed. The first R drawn indices are the reefs. Deterministic — the same
// seed places the same reefs on any machine, which is the whole proof.
export function reefsFromSeed(seedHex, reefs) {
  if (!REEF_OPTIONS.includes(reefs)) throw new Error('reefsFromSeed: bad reef count');
  const rand = prng(seedHex);
  const tiles = Array.from({ length: GRID }, (_, i) => i);
  for (let i = 0; i < reefs; i++) {
    const j = i + Math.floor(rand() * (GRID - i));
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
  }
  return tiles.slice(0, reefs).sort((a, b) => a - b);
}

// The reveal order for the theatre: every non-course tile stays hidden; the
// course itself is revealed tile by tile in a seed-shuffled order, so the
// drama differs run to run but replays identically. Pure presentation —
// the outcome never depends on it.
export function revealOrder(seedHex, picks) {
  const rand = prng(seedHex + 'reveal');
  const order = [...picks];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

// ---------------------------------------------------------------- settling

export function settle({ picks, reefs, stake, seedHex, edgeBps = EDGE_BPS }) {
  if (!Array.isArray(picks) || !picks.length) throw new Error('settle: no course');
  if (new Set(picks).size !== picks.length) throw new Error('settle: duplicate tiles');
  if (picks.some((t) => !Number.isInteger(t) || t < 0 || t >= GRID)) {
    throw new Error('settle: tile off the chart');
  }
  const reefTiles = reefsFromSeed(seedHex, reefs);
  const reefSet = new Set(reefTiles);
  const hits = picks.filter((t) => reefSet.has(t));
  const won = hits.length === 0;
  const payout = won ? quote(reefs, picks.length, stake, { edgeBps }).payout : 0;
  return { won, hits, reefTiles, payout, delta: payout - stake };
}

// Re-derive a whole claimed run from first principles. seedHex must be
// sha256(blockHashHex + '|' + mark) computed by the caller.
export function verifyRun({ seedHex, picks, reefs, stake, edgeBps = EDGE_BPS }) {
  return settle({ picks, reefs, stake, seedHex, edgeBps });
}
