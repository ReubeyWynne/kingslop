/* import-queue.js — where the screenshot import keeps its work between pages.
   The OCR worker dies with the page, so every file in the dock, what was read
   from it and the player's corrections live in IndexedDB (bh-screen-import, one
   object store keyed by entry id). Every call degrades: with storage blocked
   the queue still works in memory for the current page, and `durable` says so.

   ImportQueue.open() → Promise<queue>
   queue.all() → Promise<entries, oldest first>     queue.put(entry) → Promise
   queue.remove(id) → Promise                        queue.durable → boolean */
(function (root) {
  'use strict';
  var DB = 'bh-screen-import', STORE = 'entries', VERSION = 1;

  function memory() {
    var rows = new Map();
    return {
      durable: false,
      all: function () { return Promise.resolve(Array.from(rows.values()).sort(byAdded)); },
      put: function (entry) { rows.set(entry.id, entry); return Promise.resolve(entry); },
      remove: function (id) { rows.delete(id); return Promise.resolve(); }
    };
  }
  function byAdded(a, b) { return (a.added || 0) - (b.added || 0); }
  function request(req) {
    return new Promise(function (resolve, reject) {
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function open() {
    var idb;
    try { idb = root.indexedDB; } catch (e) { idb = null; }
    if (!idb) return Promise.resolve(memory());
    return new Promise(function (resolve, reject) {
      var req = idb.open(DB, VERSION);
      req.onupgradeneeded = function () { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' }); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
      req.onblocked = function () { reject(new Error('Import storage blocked')); };
    }).then(function (db) {
      var fallback = memory();
      function store(mode) { return db.transaction(STORE, mode).objectStore(STORE); }
      // A write that fails (quota, a private window closing storage) keeps the
      // entry in memory for this page rather than losing the player's edits.
      function guard(run, fallbackRun) { try { return run().catch(fallbackRun); } catch (e) { return fallbackRun(); } }
      return {
        durable: true,
        all: function () {
          return guard(function () { return request(store('readonly').getAll()); }, fallback.all).then(function (rows) {
            return fallback.all().then(function (extra) { return rows.concat(extra.filter(function (e) { return !rows.some(function (r) { return r.id === e.id; }); })).sort(byAdded); });
          });
        },
        put: function (entry) { return guard(function () { return request(store('readwrite').put(entry)).then(function () { return entry; }); }, function () { return fallback.put(entry); }); },
        remove: function (id) { fallback.remove(id); return guard(function () { return request(store('readwrite').delete(id)); }, function () { return Promise.resolve(); }); }
      };
    }).catch(function () { return memory(); });
  }

  root.ImportQueue = { open: open, memory: memory };
})(typeof window !== 'undefined' ? window : globalThis);
