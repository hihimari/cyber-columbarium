/* 賽博靈骨塔 — Supabase adapter.
 * Provides the same window.claude.use('db' | 'user') interface the page was written for,
 * backed by one Supabase table (public.docs) plus anonymous / email sign-in.
 */
(function () {
  const SUPA_URL = 'https://tdgryiwtbcjezhkegxoo.supabase.co';
  const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRkZ3J5aXd0YmNqZXpoa2VneG9vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxMDcyNzAsImV4cCI6MjEwNzY4MzI3MH0.xflMJjSAw8qcWQvHVzrS9puTYeah965tHbuy14EBc7w';
  const SITE_URL = location.origin + location.pathname;

  const sb = window.supabase.createClient(SUPA_URL, SUPA_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });

  let uid = null, userEmail = null, ownerIds = null;
  const profileCache = {};

  /* ---------- tiny DOM helper ---------- */
  function el(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
    return e;
  }
  const css = `
  .ga-bg{position:fixed;inset:0;z-index:100;display:grid;place-items:center;padding:16px;background:rgba(239,243,250,.82);backdrop-filter:blur(8px)}
  .ga-card{width:min(400px,100%);background:#fff;border-radius:24px;padding:28px 24px;box-shadow:0 30px 70px -30px rgba(42,51,80,.5);display:grid;gap:14px;font-family:"Noto Sans TC",system-ui,sans-serif;color:#2A3350}
  .ga-card h2{margin:0;font-size:26px;letter-spacing:.12em;color:#D8362A}
  .ga-card p{margin:0;color:#7D89A7;font-size:14px;line-height:1.7}
  .ga-card input{border:1px solid rgba(42,51,80,.15);border-radius:999px;padding:12px 16px;font:inherit;font-size:15px;background:#EFF3FA;color:#2A3350;width:100%;box-sizing:border-box}
  .ga-btn{border:0;border-radius:999px;padding:12px 18px;font:inherit;font-weight:500;letter-spacing:.08em;color:#fff;background:linear-gradient(135deg,#6B9CDE,#8FC0EA);cursor:pointer}
  .ga-btn:disabled{opacity:.5}
  .ga-link{background:none;border:0;padding:0;color:#4A78C2;font:inherit;font-size:13px;cursor:pointer;justify-self:start}
  .ga-msg{font-size:13px;color:#C2410C;min-height:1em}
  .ga-ok{font-size:13px;color:#2F7F5F}
  .ga-chip{display:inline-flex;align-items:center;gap:6px;height:40px;padding:0 12px;border-radius:999px;border:0;background:transparent;color:#4A78C2;font:inherit;font-size:13px;cursor:pointer;max-width:140px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
  .ga-chip:hover{background:#EFF3FA}
  .ga-google{display:flex;align-items:center;justify-content:center;gap:10px;border:1px solid rgba(42,51,80,.18);border-radius:999px;padding:11px 18px;background:#fff;color:#2A3350;font:inherit;font-weight:500;cursor:pointer}
  .ga-google:hover{background:#F6F8FC}
  .ga-or{font-size:12px;color:#9AA4BE;text-align:center;margin-top:4px}
  .ga-small{font-size:11px;color:#9AA4BE;word-break:break-all}
  `;
  document.head.append(el('style', { text: css }));

  /* ---------- sign-in gate ---------- */
  function emailLoginForm(card, back) {
    const email = el('input', { type: 'email', placeholder: '您綁定的 Email', autocomplete: 'email' });
    const msg = el('div', { class: 'ga-msg' });
    const btn = el('button', { class: 'ga-btn', type: 'submit', text: '寄送登入連結' });
    card.replaceChildren(
      el('h2', { text: '用 Email 登入' }),
      el('p', { text: '輸入之前綁定過的 Email，我們會寄一封登入連結給您，點開就會回到您原本的身分。' }),
      el('form', { style: 'display:grid;gap:12px', onsubmit: async (e) => {
        e.preventDefault();
        const v = email.value.trim(); if (!v) return;
        btn.disabled = true; msg.className = 'ga-msg'; msg.textContent = '';
        const { error } = await sb.auth.signInWithOtp({ email: v, options: { shouldCreateUser: false, emailRedirectTo: SITE_URL } });
        btn.disabled = false;
        if (error) { msg.textContent = /not found|Signups not allowed/i.test(error.message) ? '這個 Email 還沒有綁定過，請先用暱稱進塔，再到「帳號」綁定 Email。' : '寄送失敗：' + error.message; return; }
        msg.className = 'ga-ok'; msg.textContent = '登入連結已寄出，請到信箱點開連結（可能在垃圾郵件匣）。';
      } }, email, btn),
      msg,
      el('button', { class: 'ga-link', type: 'button', text: '← 改用暱稱進塔', onclick: back }));
    setTimeout(() => email.focus(), 0);
  }
  function googleMark() {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 48 48'); s.setAttribute('width', '18'); s.setAttribute('height', '18'); s.setAttribute('aria-hidden', 'true');
    s.innerHTML = '<path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.8 6C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.4-4.1 7-10.1 7-17.6z"/><path fill="#FBBC05" d="M10.5 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.3.8-4.7l-7.8-6C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.8-6z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.8 6C6.6 42.6 14.6 48 24 48z"/>';
    return s;
  }
  async function googleSignIn() {
    const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: SITE_URL } });
    if (error) notice('Google 登入失敗：' + error.message);
  }
  function notice(text) {
    const card = el('div', { class: 'ga-card', role: 'dialog', 'aria-modal': 'true' });
    const bg = el('div', { class: 'ga-bg', onclick: (e) => { if (e.target === bg) bg.remove(); } }, card);
    card.append(el('h2', { text: '提醒' }), el('p', { text }), el('button', { class: 'ga-btn', type: 'button', text: '知道了', onclick: () => bg.remove() }));
    document.body.append(bg);
  }
  function gate() {
    return new Promise((resolve) => {
      const card = el('div', { class: 'ga-card', role: 'dialog', 'aria-modal': 'true' });
      const bg = el('div', { class: 'ga-bg' }, card);
      const showNick = () => {
        const name = el('input', { type: 'text', maxlength: '16', placeholder: '例如：阿明', autocomplete: 'nickname' });
        const msg = el('div', { class: 'ga-msg' });
        const btn = el('button', { class: 'ga-btn', type: 'submit', text: '進塔' });
        card.replaceChildren(
          el('h2', { text: '賽博靈骨塔' }),
          el('p', { text: '取一個暱稱就能進塔上香、敲木魚、留言。之後可以到「帳號」綁定 Email，換手機也能用同一個身分。' }),
          el('form', { style: 'display:grid;gap:12px', onsubmit: async (e) => {
            e.preventDefault();
            const n = name.value.trim(); if (!n) { msg.textContent = '請輸入暱稱。'; return; }
            btn.disabled = true; msg.textContent = '';
            const { data, error } = await sb.auth.signInAnonymously();
            if (error) { btn.disabled = false; msg.textContent = '進塔失敗：' + error.message; return; }
            uid = data.user.id;
            await saveProfile({ name: n.slice(0, 16) });
            bg.remove(); resolve();
          } }, name, btn),
          msg,
          el('div', { class: 'ga-or', text: '已經綁定過帳號？' }),
          el('button', { class: 'ga-google', type: 'button', onclick: googleSignIn }, googleMark(), '用 Google 登入'),
          el('button', { class: 'ga-link', type: 'button', text: '用 Email 登入', onclick: () => emailLoginForm(card, showNick) }));
        setTimeout(() => name.focus(), 0);
      };
      showNick();
      document.body.append(bg);
    });
  }
  async function saveProfile(patch) {
    const path = 'profiles/' + uid;
    const cur = profileCache[uid] || {};
    const data = { ...cur, ...patch };
    delete data.id;
    profileCache[uid] = { ...data, id: uid };
    await sb.from('docs').upsert({ path, coll: 'profiles', id: uid, data, updated_at: new Date().toISOString() });
  }
  async function loadProfiles(ids) {
    const need = ids.filter((i) => i && !profileCache[i]);
    if (need.length) {
      const { data } = await sb.from('docs').select('id,data').eq('coll', 'profiles').in('id', need);
      for (const r of data || []) profileCache[r.id] = { ...r.data, id: r.id };
      for (const i of need) if (!profileCache[i]) profileCache[i] = { id: i, name: '' };
    }
  }
  const domReady = new Promise((r) => document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', r, { once: true }) : r());
  const ready = (async () => {
    const { data } = await sb.auth.getSession();
    await domReady;
    if (data.session) {
      uid = data.session.user.id; userEmail = data.session.user.email || null;
      await loadProfiles([uid]);
      const meta = data.session.user.user_metadata || {};
      if (!profileCache[uid] || !profileCache[uid].name) await saveProfile({ name: (meta.full_name || meta.name || (userEmail || '香客').split('@')[0]).slice(0, 16) });
    } else {
      await gate();
    }
    const { data: owners } = await sb.from('site_owner').select('uid');
    ownerIds = new Set((owners || []).map((o) => o.uid));
    sb.auth.onAuthStateChange((_e, s) => { if (s && s.user) { userEmail = s.user.email || null; } });
    mountAccountChip();
    const q = new URLSearchParams(location.search + '&' + location.hash.slice(1));
    const err = q.get('error_description') || q.get('error');
    if (err) {
      history.replaceState(null, '', SITE_URL);
      notice(/already|linked|exists/i.test(err) ? '這個 Google 帳號已經綁定在另一個身分上了。若要回到那個身分，請登出後用「用 Google 登入」。' : '登入或綁定沒有完成：' + err);
    } else if (sessionStorage.getItem('ga-linking')) {
      sessionStorage.removeItem('ga-linking');
      const { data: u } = await sb.auth.getUser();
      if ((u.user && u.user.identities || []).some((i) => i.provider === 'google')) notice('已綁定 Google 帳號。之後換瀏覽器或換手機，在進塔畫面按「用 Google 登入」就能回到這個身分。');
    }
  })();

  /* ---------- account chip + panel ---------- */
  function avatarFor(id, name) {
    let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) | 0;
    const hue = Math.abs(h) % 360, ch = (name || '香').trim().slice(0, 1) || '香';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" rx="20" fill="hsl(${hue},55%,70%)"/><text x="20" y="26" text-anchor="middle" font-size="18" font-family="sans-serif" fill="#fff">${ch.replace(/[<&>"]/g, '')}</text></svg>`;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }
  function mountAccountChip() {
    const bar = document.querySelector('.pillbar'); if (!bar) return;
    const chip = el('button', { class: 'ga-chip', type: 'button', title: '帳號' });
    const paint = () => { chip.textContent = '帳號：' + ((profileCache[uid] && profileCache[uid].name) || '香客'); };
    paint();
    chip.addEventListener('click', () => openAccount(paint));
    bar.insertBefore(chip, bar.querySelector('#btn-new'));
  }
  function openAccount(paint) {
    const card = el('div', { class: 'ga-card', role: 'dialog', 'aria-modal': 'true' });
    const bg = el('div', { class: 'ga-bg', onclick: (e) => { if (e.target === bg) bg.remove(); } }, card);
    const name = el('input', { type: 'text', maxlength: '16', value: (profileCache[uid] && profileCache[uid].name) || '' });
    const email = el('input', { type: 'email', placeholder: 'you@example.com', value: userEmail || '' });
    const msg = el('div', { class: 'ga-msg' });
    const googleRow = el('div', { style: 'display:grid;gap:8px' }, el('p', { text: '正在讀取綁定狀態…' }));
    sb.auth.getUser().then(({ data: u }) => {
      const g = (u.user && u.user.identities || []).find((i) => i.provider === 'google');
      if (g) googleRow.replaceChildren(el('p', { class: 'ga-ok', text: '已綁定 Google' + (g.identity_data && g.identity_data.email ? '（' + g.identity_data.email + '）' : '') + '。換瀏覽器時在進塔畫面按「用 Google 登入」即可。' }));
      else googleRow.replaceChildren(
        el('p', { text: '綁定 Google 帳號後，換瀏覽器或換手機按一下就能回到這個身分，不用收信。' }),
        el('button', { class: 'ga-google', type: 'button', onclick: async () => {
          sessionStorage.setItem('ga-linking', '1');
          const { error } = await sb.auth.linkIdentity({ provider: 'google', options: { redirectTo: SITE_URL } });
          if (error) { sessionStorage.removeItem('ga-linking'); msg.className = 'ga-msg'; msg.textContent = '綁定失敗：' + error.message; }
        } }, googleMark(), '綁定 Google 帳號'));
    });
    card.append(
      el('h2', { text: '我的帳號' }),
      el('p', { text: '暱稱會顯示在香客名冊和留言上。' }),
      el('form', { style: 'display:grid;gap:10px', onsubmit: async (e) => {
        e.preventDefault(); const n = name.value.trim(); if (!n) return;
        await saveProfile({ name: n.slice(0, 16) }); paint(); msg.className = 'ga-ok'; msg.textContent = '暱稱已更新。';
      } }, name, el('button', { class: 'ga-btn', type: 'submit', text: '更新暱稱' })),
      googleRow,
      el('p', { text: userEmail ? '已綁定 Email（' + userEmail + '），換裝置時也可以用 Email 登入。' : '也可以綁定 Email，換裝置時用 Email 登入。' }),
      el('form', { style: 'display:grid;gap:10px', onsubmit: async (e) => {
        e.preventDefault(); const v = email.value.trim(); if (!v || v === userEmail) return;
        const { error } = await sb.auth.updateUser({ email: v }, { emailRedirectTo: SITE_URL });
        if (error) { msg.className = 'ga-msg'; msg.textContent = '綁定失敗：' + error.message; return; }
        msg.className = 'ga-ok'; msg.textContent = '確認信已寄出，請到信箱點開連結完成綁定。';
      } }, email, el('button', { class: 'ga-btn', type: 'submit', text: userEmail ? '更換 Email' : '綁定 Email' })),
      msg,
      el('div', { class: 'ga-small', text: '帳號代碼：' + uid }),
      el('button', { class: 'ga-link', type: 'button', text: '關閉', onclick: () => bg.remove() }));
    document.body.append(bg);
  }

  /* ---------- document store (Firestore-like surface used by the page) ---------- */
  const cache = new Map();            // path -> data
  const collQueries = new Map();      // coll -> Set(query listener)
  const docSubs = new Map();          // path -> Set(fn)
  const loadedColls = new Set(), loadedDocs = new Set();
  const parentOf = (p) => p.split('/').slice(0, -1).join('/');
  const idOf = (p) => p.split('/').pop();
  const snap = (p, d) => ({ id: idOf(p), exists: d !== undefined, data: () => d, metadata: { fromCache: false, hasPendingWrites: false } });
  const mapErr = (error) => ({ code: (error && (error.code === '42501' || /row-level security|permission/i.test(error.message || ''))) ? 'invalid_argument' : 'unavailable', message: (error && error.message) || 'error' });

  function emitColl(coll) {
    const set = collQueries.get(coll); if (!set) return;
    const all = [];
    for (const [p, d] of cache) if (parentOf(p) === coll) all.push([p, d]);
    for (const q of set) q.deliver(all);
  }
  function emitDoc(path) {
    const set = docSubs.get(path); if (!set) return;
    const s = snap(path, cache.get(path));
    for (const fn of set) { try { fn(s); } catch (e) { console.error(e); } }
  }
  function applyRow(path, data) {
    if (data === undefined) cache.delete(path); else cache.set(path, data);
    emitColl(parentOf(path)); emitDoc(path);
  }
  async function fetchColl(coll) {
    const { data, error } = await sb.from('docs').select('path,data').eq('coll', coll).order('updated_at', { ascending: false }).limit(5000);
    if (error) throw mapErr(error);
    const seen = new Set();
    for (const r of data) { cache.set(r.path, r.data); seen.add(r.path); }
    for (const p of [...cache.keys()]) if (parentOf(p) === coll && !seen.has(p)) cache.delete(p);
    loadedColls.add(coll); emitColl(coll);
  }
  async function fetchDoc(path) {
    const { data, error } = await sb.from('docs').select('data').eq('path', path).maybeSingle();
    if (error) throw mapErr(error);
    if (data) cache.set(path, data.data); else cache.delete(path);
    loadedDocs.add(path);
    return data ? data.data : undefined;
  }
  let channel = null;
  function ensureRealtime() {
    if (channel) return;
    channel = sb.channel('docs-all')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'docs' }, (payload) => {
        if (payload.eventType === 'DELETE') { const p = payload.old && payload.old.path; if (p) applyRow(p, undefined); }
        else if (payload.new && payload.new.path) applyRow(payload.new.path, payload.new.data);
      })
      .subscribe();
    // safety net in case a realtime event is missed
    setInterval(() => {
      for (const c of collQueries.keys()) fetchColl(c).catch(() => {});
      for (const p of docSubs.keys()) fetchDoc(p).then(() => emitDoc(p)).catch(() => {});
    }, 45000);
  }
  async function writeDoc(path, data) {
    const prev = cache.get(path);
    applyRow(path, data);
    const { error } = await sb.from('docs').upsert({ path, coll: parentOf(path), id: idOf(path), data, updated_at: new Date().toISOString() });
    if (error) { applyRow(path, prev); throw mapErr(error); }
  }
  function docRef(path) {
    return {
      id: idOf(path), path,
      async get() { const d = await fetchDoc(path); return snap(path, d); },
      set(data) { return writeDoc(path, JSON.parse(JSON.stringify(data))); },
      async update(patch) {
        const cur = cache.has(path) ? cache.get(path) : await fetchDoc(path);
        if (cur === undefined) throw { code: 'invalid_argument', message: 'document does not exist' };
        const next = { ...cur };
        for (const [k, v] of Object.entries(patch)) { if (v && typeof v === 'object' && v.__delete__) delete next[k]; else next[k] = v; }
        return writeDoc(path, JSON.parse(JSON.stringify(next)));
      },
      async delete() {
        const prev = cache.get(path);
        applyRow(path, undefined);
        const { error } = await sb.from('docs').delete().eq('path', path);
        if (error) { applyRow(path, prev); throw mapErr(error); }
      },
      onSnapshot(next, err) {
        ensureRealtime();
        if (!docSubs.has(path)) docSubs.set(path, new Set());
        docSubs.get(path).add(next);
        if (loadedDocs.has(path)) setTimeout(() => next(snap(path, cache.get(path))), 0);
        else fetchDoc(path).then(() => emitDoc(path)).catch((e) => err && err(e));
        return () => docSubs.get(path).delete(next);
      },
      collection(sub) { return collRef(path + '/' + sub); },
    };
  }
  function collRef(coll, order, lim) {
    const q = {
      path: coll,
      orderBy(field, dir) { return collRef(coll, { field, dir: dir || 'asc' }, lim); },
      limit(n) { return collRef(coll, order, n); },
      where() { return q; },
      doc(id) { return docRef(coll + '/' + (id || Math.random().toString(36).slice(2, 12) + Date.now().toString(36))); },
      async add(data) { const r = q.doc(); await r.set(data); return r; },
      shape(all) {
        let rows = all.map(([p, d]) => snap(p, d));
        if (order) {
          const f = order.field, s = order.dir === 'desc' ? -1 : 1;
          rows.sort((a, b) => { const x = a.data()[f], y = b.data()[f]; return (x > y ? 1 : x < y ? -1 : 0) * s; });
        }
        if (lim) rows = rows.slice(0, lim);
        return { docs: rows, size: rows.length, empty: !rows.length, docChanges: () => [], metadata: { fromCache: false, hasPendingWrites: false } };
      },
      async get() {
        await fetchColl(coll);
        const all = []; for (const [p, d] of cache) if (parentOf(p) === coll) all.push([p, d]);
        return q.shape(all);
      },
      onSnapshot(next, err) {
        ensureRealtime();
        const listener = { deliver: (all) => { try { next(q.shape(all)); } catch (e) { console.error(e); } } };
        if (!collQueries.has(coll)) collQueries.set(coll, new Set());
        collQueries.get(coll).add(listener);
        if (loadedColls.has(coll)) { const all = []; for (const [p, d] of cache) if (parentOf(p) === coll) all.push([p, d]); setTimeout(() => listener.deliver(all), 0); }
        else fetchColl(coll).catch((e) => err && err(e));
        return () => collQueries.get(coll).delete(listener);
      },
    };
    return q;
  }
  const db = { doc: docRef, collection: (p) => collRef(p) };

  /* ---------- viewer identity ---------- */
  const isOwner = () => !!(ownerIds && uid && ownerIds.has(uid));
  const profileOut = (id) => {
    const p = profileCache[id] || { name: '' };
    return { id, name: p.name || '', avatarUrl: avatarFor(id, p.name), color: '#6B9CDE', email: null, isMe: id === uid, guest: false };
  };
  const user = {
    async id() { return uid; },
    async isOwner() { return isOwner(); },
    async canEdit() { return isOwner(); },
    async can(name) { return name === 'data.write' ? !!uid : null; },
    async name() { return (profileCache[uid] && profileCache[uid].name) || ''; },
    async avatarUrl() { return avatarFor(uid, profileCache[uid] && profileCache[uid].name); },
    async me() { return { ...profileOut(uid), email: userEmail, isOwner: isOwner(), canEdit: isOwner() }; },
    async profiles(ids) {
      const list = Array.isArray(ids) ? ids : [ids];
      await loadProfiles(list);
      const out = {}; for (const i of list) out[i] = profileOut(i);
      return out;
    },
    async search() { return []; },
  };

  /* ---------- owner-only import of towers from the old claude.ai site (open the page with #import) ---------- */
  ready.then(() => {
    if (location.hash !== '#import' || !isOwner()) return;
    const ta = el('textarea', { style: 'width:100%;min-height:160px;border-radius:14px;border:1px solid rgba(42,51,80,.15);padding:10px;font:12px monospace', placeholder: '貼上從舊網站匯出的資料' });
    const msg = el('div', { class: 'ga-msg' });
    const card = el('div', { class: 'ga-card' },
      el('h2', { text: '匯入舊塔位' }), ta,
      el('button', { class: 'ga-btn', type: 'button', text: '匯入', onclick: async () => {
        try {
          const j = JSON.parse(ta.value);
          let n = 0;
          for (const t of j.towers || []) {
            const { id, ...rest } = t;
            await writeDoc('towers/' + id, { ...rest, claimedBy: null, createdBy: uid });
            n++;
          }
          if (j.marquee && j.marquee.text) await writeDoc('site/marquee', { text: j.marquee.text, at: Date.now(), by: uid });
          msg.className = 'ga-ok'; msg.textContent = `已匯入 ${n} 座塔位${j.marquee && j.marquee.text ? '與跑馬燈' : ''}。`;
          ta.value = '';
        } catch (e) { msg.className = 'ga-msg'; msg.textContent = '匯入失敗：' + (e.message || e.code || e); }
      } }),
      msg,
      el('button', { class: 'ga-link', type: 'button', text: '關閉', onclick: () => { bg.remove(); history.replaceState(null, '', location.pathname); } }));
    const bg = el('div', { class: 'ga-bg' }, card);
    document.body.append(bg);
  });

  window.claude = { use: async (name) => { await ready; return name === 'db' ? db : name === 'user' ? user : null; } };
})();
