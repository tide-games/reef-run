// tests.js — run: node tests.js  (exits non-zero on failure)
import { createHash } from 'node:crypto';
import {
  GRID, REEF_OPTIONS, MAX_PICKS, EDGE_BPS,
  comb, chance, quote, reefsFromSeed, revealOrder, settle, verifyRun,
} from './reef.js';

let fails = 0;
function ok(cond, name, detail) {
  if (cond) console.log('  ok ', name);
  else { fails++; console.error('  FAIL', name, detail ?? ''); }
}
const sha256 = (s) => createHash('sha256').update(s).digest('hex');

// ---- counting
ok(comb(25, 0) === 1 && comb(25, 25) === 1, 'comb edges');
ok(comb(25, 2) === 300 && comb(5, 2) === 10, 'comb small values');
ok(comb(25, 12) === 5200300, 'comb largest used value is exact');
ok(comb(3, 5) === 0, 'comb k>n is zero');
{
  // Pascal's identity across the whole used range
  let pascal = true;
  for (let n = 2; n <= GRID; n++) for (let k = 1; k < n; k++) {
    if (comb(n, k) !== comb(n - 1, k - 1) + comb(n - 1, k)) pascal = false;
  }
  ok(pascal, "Pascal's identity holds for every n,k in range");
}

// ---- chance
ok(Math.abs(chance(3, 1) - 22 / 25) < 1e-12, 'one pick vs three reefs is 22/25');
ok(chance(7, 10) > 0 && chance(7, 10) < 0.02, 'the longest course vs most reefs is a longshot');
{
  let monotone = true;
  for (const r of REEF_OPTIONS) for (let k = 2; k <= MAX_PICKS; k++) {
    if (chance(r, k) >= chance(r, k - 1)) monotone = false;
  }
  ok(monotone, 'longer courses are always riskier');
}

// ---- pricing: identical EV everywhere
{
  let evOk = true;
  for (const r of REEF_OPTIONS) for (let k = 1; k <= MAX_PICKS; k++) {
    const q = quote(r, k, 1_000_000);
    if (Math.abs(q.chance * q.multiplier - (1 - EDGE_BPS / 10_000)) > 1e-9) evOk = false;
  }
  ok(evOk, 'every (reefs, picks) course has identical EV: 1 - edge');
}
ok(quote(7, 10, 100).payout > quote(3, 1, 100).payout, 'the longshot pays more');
ok(quote(3, 1, 100).payout > 100, 'even the safest course pays above the stake');
{
  let threw = 0;
  for (const bad of [[4, 3, 100], [3, 0, 100], [3, 11, 100], [3, 3, 0], [3, 3, 1.5]]) {
    try { quote(...bad); } catch { threw++; }
  }
  ok(threw === 5, 'bad reef counts, pick counts and stakes are refused');
}

// ---- reef placement
{
  const seed = sha256('reef-seed');
  const a = reefsFromSeed(seed, 5), b = reefsFromSeed(seed, 5);
  ok(JSON.stringify(a) === JSON.stringify(b), 'same seed places the same reefs');
  ok(a.length === 5 && new Set(a).size === 5, 'exactly R distinct reefs');
  ok(a.every((t) => t >= 0 && t < GRID), 'reefs stay on the chart');
  ok(JSON.stringify(reefsFromSeed(sha256('other'), 5)) !== JSON.stringify(a),
    'different seeds place different reefs');
}
{
  // uniformity: over many seeds every tile hosts a reef about equally often
  const counts = new Array(GRID).fill(0);
  const N = 20_000, R = 5;
  for (let i = 0; i < N; i++) for (const t of reefsFromSeed(sha256('u' + i), R)) counts[t]++;
  const expected = (N * R) / GRID;
  const worst = Math.max(...counts.map((c) => Math.abs(c - expected)));
  ok(worst < 4 * Math.sqrt(expected), '20k placements: every tile hosts reefs at fair frequency (4 sigma)',
    `worst dev ${worst.toFixed(0)} vs limit ${(4 * Math.sqrt(expected)).toFixed(0)}`);
}

// ---- reveal order is a permutation of the course, deterministic, outcome-free
{
  const seed = sha256('reveal-seed');
  const picks = [0, 7, 12, 18, 24];
  const o1 = revealOrder(seed, picks), o2 = revealOrder(seed, picks);
  ok(JSON.stringify(o1) === JSON.stringify(o2), 'reveal order replays identically');
  ok(JSON.stringify([...o1].sort((a, b) => a - b)) === JSON.stringify(picks),
    'reveal order is exactly the course, shuffled');
}

// ---- settle
{
  const seed = sha256('settle-seed');
  const reefTiles = reefsFromSeed(seed, 5);
  const open = Array.from({ length: GRID }, (_, i) => i).filter((t) => !reefTiles.includes(t));
  const win = settle({ picks: open.slice(0, 4), reefs: 5, stake: 100, seedHex: seed });
  ok(win.won && win.payout === quote(5, 4, 100).payout && win.delta === win.payout - 100,
    'an all-clear course pays the quoted amount');
  const lose = settle({ picks: [reefTiles[0], ...open.slice(0, 3)], reefs: 5, stake: 100, seedHex: seed });
  ok(!lose.won && lose.payout === 0 && lose.delta === -100 && lose.hits.length === 1,
    'one reef sinks the course');
  let threw = 0;
  for (const bad of [[], [1, 1], [25], [-1], [2.5]]) {
    try { settle({ picks: bad, reefs: 5, stake: 100, seedHex: seed }); } catch { threw++; }
  }
  ok(threw === 5, 'empty, duplicate, off-chart and fractional tiles are refused');
}

// ---- verify is settle from first principles
{
  const seed = sha256(sha256('blockhash') + '|' + 'mark123');
  const v = verifyRun({ seedHex: seed, picks: [1, 2, 3], reefs: 3, stake: 250 });
  const again = verifyRun({ seedHex: seed, picks: [1, 2, 3], reefs: 3, stake: 250 });
  ok(JSON.stringify(v) === JSON.stringify(again), 'verification is deterministic');
  ok(v.reefTiles.length === 3, 'verify exposes the reef chart');
}

// ---- long-run fairness: empirical win rate tracks the quoted chance
{
  for (const [r, k] of [[3, 3], [5, 5], [7, 2]]) {
    const picks = [0, 4, 8, 12, 16, 20, 24, 1, 5, 9].slice(0, k);
    let wins = 0;
    const N = 20_000;
    for (let i = 0; i < N; i++) {
      if (settle({ picks, reefs: r, stake: 10, seedHex: sha256(`fair${r}-${k}-${i}`) }).won) wins++;
    }
    const p = chance(r, k), sd = Math.sqrt(N * p * (1 - p));
    ok(Math.abs(wins - N * p) < 4 * sd,
      `20k runs at reefs=${r} picks=${k}: wins track the quoted chance (4 sigma)`,
      `${wins} vs ${(N * p).toFixed(0)}±${(4 * sd).toFixed(0)}`);
  }
}

if (fails) { console.error(`\n${fails} failing`); process.exit(1); }
console.log('\nall tests pass');
