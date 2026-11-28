// Large artwork stays in IndexedDB. The key that makes a draft accessible
// belongs to one browser tab and survives a reload.
(() => {
  'use strict';
  const prefix = 'adot.svg-trace.';
  const kinds = ['source', 'vector', 'settings', 'editor', 'ai'];
  const request = req => new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const done = tx => new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onabort = () => reject(tx.error || new Error('Draft transaction interrupted.'));
  });

  window.createSvgTraceTabDraft = function (onError) {
    let tab, db, version = 0, ready = false;
    let latest = {}, uncommitted = {}, leaseRelease;
    let warned = false;
    function warn() {
      if (!warned) { warned = true; onError(); }
    }
    // sessionStorage is copied when a tab is duplicated. A live tab cannot
    // lend its draft to another open window, even when both use the same URL.
    function claim(id) {
      if (!navigator.locks) return Promise.resolve(true);
      return new Promise((resolve, reject) => {
        navigator.locks.request(prefix+id, {ifAvailable:true}, async lock => {
          if (!lock) { resolve(false); return; }
          const held = new Promise(release => { leaseRelease = release; });
          resolve(true);
          await held;
        }).catch(reject);
      });
    }
    async function prune() {
      const locks = navigator.locks ? await navigator.locks.query() : null;
      const held = new Set(locks?.held.map(lock => lock.name));
      const tx = db.transaction(['tabs','parts'], 'readwrite'), tabs = tx.objectStore('tabs');
      const finished = done(tx);
      const items = await request(tabs.getAll());
      const idle = items.filter(t => t.id !== tab && !held.has(prefix+t.id)).sort((a,b) => b.time-a.time);
      idle.forEach((t, i) => {
        if (t.time < Date.now()-7*86400000 || i >= 12) {
          tabs.delete(t.id);
          for (const k of kinds) tx.objectStore('parts').delete([t.id,k]);
        }
      });
      await finished;
    }
    // Small, synchronous recovery journal just for edits whose transaction
    // is still in flight when the user refreshes immediately after editing.
    function journal() {
      if (!tab || !ready || !Object.keys(uncommitted).length) return;
      const parts = {...uncommitted};
      delete parts.source; // image blobs are written directly on upload
      try {
        sessionStorage.setItem(prefix+'journal', JSON.stringify({
          tab, source:latest.source?.value?.id, vector:latest.vector?.value?.id, parts,
        }));
      } catch (_) {
        // Undo history can exceed the browser's synchronous storage quota.
        // Keep the current geometry in the journal if possible. IndexedDB
        // still receives the complete snapshot, including history.
        try {
          if (parts.editor?.value) {
            const {undo,redo,...geometry} = parts.editor.value;
            parts.editor = {...parts.editor,value:{...geometry,undo:[],redo:[]}};
          }
          sessionStorage.setItem(prefix+'journal',JSON.stringify({
            tab,source:latest.source?.value?.id,vector:latest.vector?.value?.id,parts,
          }));
        } catch (_) { /* The full transaction may already have committed. */ }
      }
    }
    function write(records) {
      if (!db || !Object.keys(records).length) return;
      try {
        const tx = db.transaction(['tabs','parts'], 'readwrite');
        const finished = done(tx);
        for (const [kind,record] of Object.entries(records)) tx.objectStore('parts').put(record,[tab,kind]);
        tx.objectStore('tabs').put({id:tab,time:Date.now()});
        tx.commit?.();
        finished.then(() => {
          for (const [k,r] of Object.entries(records)) if (uncommitted[k] === r) delete uncommitted[k];
        }).catch(warn);
      } catch (_) { warn(); }
    }
    function set(patch) {
      version = Math.max(Date.now(),version+1);
      const batch = {};
      for (const [kind,value] of Object.entries(patch)) {
        if (!kinds.includes(kind)) continue;
        batch[kind] = {version,value};
      }
      Object.assign(latest,batch);
      Object.assign(uncommitted,batch);
      if (ready) write(batch);
    }
    async function load() {
      try {
        tab = sessionStorage.getItem(prefix+'tab') || crypto.randomUUID();
        // Fallback for browsers without Web Locks which clone an opener's
        // storage on a new navigation. A reload remains in the current tab.
        if (!navigator.locks && window.opener && performance.getEntriesByType('navigation')[0]?.type === 'navigate') tab = crypto.randomUUID();
        if (!await claim(tab)) { tab = crypto.randomUUID(); await claim(tab); }
        sessionStorage.setItem(prefix+'tab',tab);
        const open = indexedDB.open('adot-svg-trace-drafts',1);
        open.onupgradeneeded = () => {
          open.result.createObjectStore('tabs',{keyPath:'id'});
          open.result.createObjectStore('parts');
        };
        db = await request(open);
        db.onversionchange = () => { db.close(); db = null; warn(); };
        const tx = db.transaction(['parts','tabs'],'readwrite');
        const finished = done(tx);
        tx.objectStore('tabs').put({id:tab,time:Date.now()});
        const saved = Object.fromEntries(await Promise.all(kinds.map(async k => [k,await request(tx.objectStore('parts').get([tab,k]))])));
        await finished;
        let recovery;
        try { recovery = JSON.parse(sessionStorage.getItem(prefix+'journal')); } catch (_) { /* no journal */ }
        if (recovery?.tab === tab && saved.source?.value?.id === recovery.source && recovery.parts) {
          for (const k of ['settings','vector','editor','ai']) {
            const r = recovery.parts[k];
            if (r && r.version > (saved[k]?.version || 0) &&
                (k !== 'editor' || saved.vector?.value?.id === recovery.vector)) {
              saved[k] = r; if (!uncommitted[k]) uncommitted[k] = r;
            }
          }
        }
        latest = {...saved,...latest};
        version = Math.max(version,...Object.values(latest).map(r => r?.version || 0));
        ready = true;
        write({...uncommitted});
        prune().catch(() => {});
        return Object.fromEntries(kinds.map(k => [k,latest[k]?.value]));
      } catch (_) { ready = true; warn(); return {}; }
    }
    window.addEventListener('pagehide', () => leaseRelease?.());
    window.addEventListener('pageshow', async event => {
      if (!event.persisted || !ready || !tab || !db) return;
      try {
        if (!await claim(tab)) {
          tab = crypto.randomUUID(); await claim(tab);
          sessionStorage.setItem(prefix+'tab',tab);
          write(Object.fromEntries(Object.entries(latest).filter(([,r]) => r)));
        }
      } catch (_) { warn(); }
    });
    return {load,set,journal};
  };
})();
