/* Fantasy Theater: what an amulet is worth in Fantasy Tokens, what a token costs in money,
   and what the Theater Shop's items score in KvK prep per token. The page's controller is
   js/pages/fantasy-theater.mjs; the data is _data/seasonal/fantasy_theater.json.

   An explore on floor f costs c(f) amulets. It either pauses (10 tokens per amulet spent, and
   the next try's ascent chance rises along the pity ladder) or climbs 1–3 floors. On any floor
   with a reward the player may claim it, which ends the round. Reaching the Theater's top
   gives Fanstars; five send the next round into the Fortress, whose top pays 13,000.

   The best long-run tokens per amulet, r, is the rate at which the best round's expected
   tokens minus r × its expected amulets is zero (a renewal-reward ratio). For a trial r the
   best round is a small dynamic programme over (floor, pity step); r is found by bisection.
   A Fanstar is worth a fifth of what a Fortress round earns above r × its amulets. */
import data from '../_data/seasonal/fantasy_theater.json' with { type: 'json' };

const ASCENT = data.ascentByAttempt;
const STEPS = data.floorsClimbed;
const PAUSE = data.pauseTokensPerAmulet;
const STARS = data.fanstars.reduce((sum, row) => sum + row.stars * row.chance, 0);

/* Best expected (tokens − rate × amulets) for one round of a mode, and the floor it claims at
   from a fresh start. `starValue` is added whenever the Theater's top is reached. */
function round(mode, rate, starValue, claimAt) {
  const memo = new Map();
  const value = (floor, step) => {
    if (floor >= mode.top) return { v: mode.floorReward[mode.top], claim: true };
    const key = floor * 10 + step;
    if (memo.has(key)) return memo.get(key);
    const cost = mode.exploreCost[floor], p = ASCENT[step];
    let climbed = 0;
    for (const { floors, chance } of STEPS) {
      const to = Math.min(floor + floors, mode.top);
      climbed += chance * (value(to, 0).v + (to === mode.top && mode === data.theater ? STARS * starValue : 0));
    }
    const paused = step < ASCENT.length - 1 ? value(floor, step + 1).v : 0;
    const explore = -rate * cost + p * climbed + (1 - p) * (PAUSE * cost + paused);
    const reward = mode.floorReward[floor];
    const claim = reward !== undefined && (claimAt ? floor >= claimAt : reward >= explore);
    const out = claim ? { v: reward, claim: true } : { v: explore, claim: false };
    memo.set(key, out);
    return out;
  };
  return value(1, 0).v;
}

/* Tokens per amulet with the best play, or with the Theater always claimed at `claimAt`. */
export function tokensPerAmulet(claimAt) {
  let lo = 0, hi = 1000;
  for (let i = 0; i < 60; i++) {
    const rate = (lo + hi) / 2;
    const fortress = round(data.fortress, rate, 0);
    const theater = round(data.theater, rate, Math.max(fortress, 0) / data.fanstarsForFortress, claimAt);
    if (theater > 0) lo = rate; else hi = rate;
  }
  return lo;
}

/* The exact spread of amulets one climb from floor 1 to the top takes, and the tokens it pays
   on the way (pauses) plus the top's reward. Every state is (floor, pity step); mass only moves
   up a step or up a floor, so one pass in that order settles it. */
export function climb(mode = data.theater) {
  const states = new Map(), done = new Map();
  const at = (floor, step) => { const key = floor * 10 + step; if (!states.has(key)) states.set(key, new Map()); return states.get(key); };
  const add = (map, amulets, chance) => map.set(amulets, (map.get(amulets) || 0) + chance);
  at(1, 0).set(0, 1);
  let tokens = mode.floorReward[mode.top];
  for (let floor = 1; floor < mode.top; floor++) {
    for (let step = 0; step < ASCENT.length; step++) {
      const here = states.get(floor * 10 + step);
      if (!here) continue;
      const cost = mode.exploreCost[floor], p = ASCENT[step];
      for (const [spent, chance] of here) {
        const after = spent + cost;
        if (p < 1) { add(at(floor, step + 1), after, chance * (1 - p)); tokens += chance * (1 - p) * PAUSE * cost; }
        for (const { floors, chance: c } of STEPS) {
          const to = Math.min(floor + floors, mode.top);
          add(to === mode.top ? done : at(to, 0), after, chance * p * c);
        }
      }
    }
  }
  const sorted = [...done].sort((a, b) => a[0] - b[0]);
  const mean = sorted.reduce((sum, [n, c]) => sum + n * c, 0);
  const quantile = q => { let acc = 0; for (const [n, c] of sorted) { acc += c; if (acc >= q - 1e-12) return n; } return sorted[sorted.length - 1][0]; };
  return { mean, median: quantile(0.5), p90: quantile(0.9), max: sorted[sorted.length - 1][0], tokens };
}

/* Money per amulet and per 1,000 tokens for each pack, at a given tokens-per-amulet rate. */
export function packs(rate) {
  return data.packs.map(pack => {
    const perAmulet = pack.price / pack.amulets;
    return { ...pack, perAmulet, perThousand: perAmulet / rate * 1000, tokens: pack.amulets * rate };
  });
}

/* Every shop line with its KvK points per token. `left` overrides stock by line index. */
export function shop(left = {}) {
  return data.shop.map((line, index) => {
    const item = data.items[line.item], points = item.per * item.kvkPoints;
    return { index, ...line, ...item, id: line.item, points, perToken: points / line.price, left: left[index] ?? line.stock };
  });
}

/* What to buy with `tokens`: the 500-token Mithril first when asked (it is the cheapest
   Mithril anywhere in the shop), then the best KvK points per token while stock lasts. */
export function spend(tokens, left = {}, mithrilFirst = true) {
  const lines = shop(left).filter(line => line.points > 0 || (mithrilFirst && line.priority));
  const order = lines.slice().sort((a, b) => b.perToken - a.perToken || a.price - b.price);
  if (mithrilFirst) {
    const cheapest = lines.filter(l => l.priority).sort((a, b) => a.price - b.price)[0];
    if (cheapest) { order.splice(order.indexOf(cheapest), 1); order.unshift(cheapest); }
  }
  let rest = tokens, points = 0;
  const buys = [];
  for (const line of order) {
    const count = Math.min(line.left, Math.floor(rest / line.price));
    if (count <= 0) continue;
    rest -= count * line.price; points += count * line.points;
    buys.push({ ...line, count, cost: count * line.price, total: count * line.points });
  }
  return { buys, points, left: rest };
}

/* Exploration rewards reached between `spent` and `spent + more` amulets. */
export function track(spent, more) {
  return data.track.filter(m => m.at > spent && m.at <= spent + more).map(m => ({ ...m, ...data.trackItems[m.item] }));
}

export const fanstarsPerClimb = STARS;
export { data };
const FantasyTheater = { tokensPerAmulet, climb, packs, shop, spend, track, fanstarsPerClimb, data };
export default FantasyTheater;
