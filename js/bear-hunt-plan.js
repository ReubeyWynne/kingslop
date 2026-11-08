/* bear-hunt-plan.js — the Bear Hunt plan for the players who turn up.
   Plain ES5, no DOM, like js/bear-allocator.js: the Bear Hunt page loads it as
   a script (window.BH_HUNT_PLAN) and .dsh/bear-hunt-plan-check.cjs requires it
   in Node.

   P players turn up and everyone launches a rally every five minutes. A player
   joins a rally with one march at most, so each rally takes S = min(14, P − 1)
   joiners. Every five minutes there are S rallies for each player to join,
   whatever the march count, so a player's joins only need to reach those S
   spaces. With 15 or more players the page has always said full rallies let a
   march hit up to 14 ÷ 6 = 2⅓ times every five minutes; that is the turnover T
   a join can manage, so J = ⌈S ÷ T⌉ joins (at most 6) reach every space.
   Fewer joins mean bigger ones, and a march's damage grows with the square
   root of its troops, so with fewer players J drops and the cap rises:

     cap = biggest rally ÷ (S + 2)   S full joins plus a double share for its leader,
                                     rounded down to a whole thousand

   The first group of rallies takes every opening join, rounded up so no
   march queue sits idle: ⌈P × J ÷ S⌉, never more than P. */
(function (root) {
  'use strict';

  var FULL = 14, QUEUES = 6, TURNOVER = 14 / 6, MIN_PLAYERS = 5, MAX_PLAYERS = 100;

  function whole(value, fallback) {
    value = Number(value);
    return isFinite(value) && value > 0 ? Math.floor(value) : fallback;
  }

  function plan(players, rally) {
    var P = Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, whole(players, 15)));
    var R = whole(rally, 0);
    var S = Math.min(FULL, P - 1);
    // A hair under each whole number, so 14 ÷ (14 ÷ 6) comes out as 6, not 7.
    var J = Math.max(1, Math.min(QUEUES, S, Math.ceil(S / TURNOVER - 1e-9)));
    return {
      players: P,
      joiners: S,
      fill: S + 1,
      divisor: S + 2,
      joins: J,
      marches: J + 1,
      // Rounded down to a whole thousand, the kind of number an alliance posts.
      cap: R ? Math.max(1, Math.floor(R / (S + 2) / 1000)) * 1000 : 0,
      rally: R,
      hits: S / J,
      first: Math.min(P, Math.ceil(P * J / S - 1e-9)),
      full: S === FULL
    };
  }

  var api = { plan: plan, FULL: FULL, QUEUES: QUEUES, TURNOVER: TURNOVER, MIN_PLAYERS: MIN_PLAYERS, MAX_PLAYERS: MAX_PLAYERS };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BH_HUNT_PLAN = api;
})(typeof window === 'object' ? window : this);
