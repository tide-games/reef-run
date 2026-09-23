# Reef Run 🪸

**Chart your course before the tide. The next Bitcoin block places the reefs.**

A 5×5 chart hides 3, 5 or 7 reefs. Plot a course — up to 10 tiles — *before*
anyone knows where the reefs lie. In **⚓ Tide** mode your course and a random
mark are committed against a block that does not exist yet on **Blake's
testnet4** — the BLAKE2b fork of Bitcoin testnet4 (parted at block 150,308),
served by [mempool.guide](https://mempool.guide/testnet4). Runs committed
before the move settle and verify on plain testnet4, the chain they chose; when it is
mined (plus one confirmation, because [reorgs are real](https://github.com/melvincarvalho/tavern/issues/1)),
`sha256(blockHash | mark)` places the reefs. Every sounding clear and the course
pays `C(25,K)/C(25−R,K)` less a 3% edge — you shape your own odds twice over,
and **every combination has the identical expected value**.

Pure static — one `index.html` plus [`reef.js`](reef.js), every pixel from code.
No build, no assets, no server. **verify ✓** in the log recomputes the whole
run in your browser from public chain data, and reports honestly if the chain
reorged under a settled block.

**Play: <https://tide-games.github.io/reef-run/>** · part of
[the fleet](https://tide-games.github.io/)

## Playing

- **Practice** runs sail at once; **⚓ Tide** seals your course to the next
  Blake testnet4 block; the **Daily** chart is the same for everyone each day
  (its reef count changes daily), scored by the × your course survives, with a
  spoiler-free share strip and a rank against the fleet.
- **Let it ride** after a win, then ride on or bank it — the stake you see is
  always the stake that sails.
- A **captain's log** with stats and milestones; a refit when the purse runs dry.
- Keyboard play (arrows across the chart), screen-reader narration of every
  sounding, reduced motion, and a phone layout that keeps the reveal in view.

## The maths is a library

`reef.js` is pure — no DOM, no clock, no network, no crypto. Exact
combinatorics, deterministic reef placement (seeded Fisher–Yates), a
seed-shuffled reveal order that never touches the outcome, and an offline
verifier — ready to vendor into a server that wants to re-check a claimed win.

```sh
node tests.js   # 27 checks: Pascal's identity, EV-identical pricing, placement
                # fairness over 20k seeds (4σ), settlement, empirical win rates
```

## Roadmap

- [x] The game — provably fair runs, play-money purse, 1-conf settlement, reorg-aware verify
- [ ] Courier in/out: sealed gold via the trail, gated on
      [tideholm#154](https://github.com/melvincarvalho/tideholm/issues/154)

Doubloons are play money. Testnet4 only. When a boundary isn't airtight, the
page says so.
