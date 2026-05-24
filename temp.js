
// ─── SUPABASE CONFIG ───
// NOTE: Replace these with your own Supabase project URL and anon key
// Get them free at supabase.com → New Project → Settings → API
const SUPABASE_URL = 'https://xedowomkiprpcxutwaos.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhlZG93b21raXBycGN4dXR3YW9zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2MzE5OTksImV4cCI6MjA5NTIwNzk5OX0.VTpvNMmyypJvCQEk9HGynQTITkEDqnCIslZTxldSUmg';

// ─── SQL to run in Supabase SQL editor ───
// Run this once to set up your database:
/*
-- Spaces table
create table spaces (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  emoji text default '✨',
  code text unique not null,
  created_by uuid references auth.users,
  created_at timestamptz default now()
);

-- Space members table
create table space_members (
  id uuid default gen_random_uuid() primary key,
  space_id uuid references spaces on delete cascade,
  user_id uuid references auth.users on delete cascade,
  username text,
  joined_at timestamptz default now(),
  unique(space_id, user_id)
);

-- Memories table
create table memories (
  id uuid default gen_random_uuid() primary key,
  space_id uuid references spaces on delete cascade,
  user_id uuid references auth.users,
  username text,
  title text,
  date date,
  album text,
  tags text[] default '{}',
  note text,
  data_url text,
  fav boolean default false,
  created_at timestamptz default now()
);

-- Enable Row Level Security
alter table spaces enable row level security;
alter table space_members enable row level security;
alter table memories enable row level security;

-- Policies: allow authenticated users full access (simplest for a shared app)
create policy "allow all for authenticated" on spaces for all to authenticated using (true) with check (true);
create policy "allow all for authenticated" on space_members for all to authenticated using (true) with check (true);
create policy "allow all for authenticated" on memories for all to authenticated using (true) with check (true);

-- Enable realtime
alter publication supabase_realtime add table memories;
alter publication supabase_realtime add table space_members;
*/

let sb, currentUser, currentUsername, currentSpace;
let memories = [], globalTags = [], activeTagFilters = new Set();
let currentDetailId = null, pendingFiles = [], currentTab = 'all';
let realtimeChannel = null;

const today = new Date().toISOString().split('T')[0];

function initSupabase() {
  try {
    sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    return true;
  } catch(e) {
    return false;
  }
}

async function init() {
  if (!initSupabase()) {
    showSetupGuide();
    return;
  }
  const { data: { session } } = await sb.auth.getSession();
  document.getElementById('loading').style.display = 'none';
  if (session) {
    currentUser = session.user;
    currentUsername = session.user.user_metadata?.username || session.user.email?.split('@')[0] || 'friend';
    showLobby();
  } else {
    showAuth();
  }
}

function showSetupGuide() {
  document.getElementById('loading').style.display = 'none';
  document.getElementById('auth-view').style.display = 'flex';
  document.getElementById('auth-form').innerHTML = `
    <div style="background:var(--vp);border:2px solid var(--vl);border-radius:16px;padding:1.25rem;font-size:12px;font-weight:600;color:var(--text);line-height:1.8">
      <p style="font-weight:800;color:var(--violet);margin-bottom:8px">✦ quick setup needed!</p>
      <p>To make this work, you need a free <a href="https://supabase.com" target="_blank" style="color:var(--violet)">Supabase</a> account:</p>
      <ol style="margin:8px 0 8px 16px;line-height:2">
        <li>Go to <strong>supabase.com</strong> → New Project</li>
        <li>Run the SQL in the code comments (SQL Editor tab)</li>
        <li>Copy your Project URL + anon key from Settings → API</li>
        <li>Replace <code style="background:var(--vl);padding:1px 5px;border-radius:4px">SUPABASE_URL</code> and <code style="background:var(--vl);padding:1px 5px;border-radius:4px">SUPABASE_KEY</code> in this file's source</li>
      </ol>
      <p style="color:var(--muted)">It takes about 5 minutes and is completely free ♡</p>
    </div>`;
}

// ─── AUTH ───
let authMode = 'login';
function toggleAuthTab(mode) {
  authMode = mode;
  document.getElementById('tab-login').classList.toggle('active', mode === 'login');
  document.getElementById('tab-signup').classList.toggle('active', mode === 'signup');
  document.getElementById('field-username').style.display = mode === 'signup' ? 'block' : 'none';
  document.getElementById('btn-auth').textContent = mode === 'login' ? 'sign in ♡' : 'create account ♡';
  document.getElementById('auth-err').classList.remove('show');
}

async function handleAuth() {
  const email = document.getElementById('inp-email').value.trim();
  const password = document.getElementById('inp-password').value;

  const btn = document.getElementById('btn-auth');
  const errEl = document.getElementById('auth-err');

  errEl.classList.remove('show');

  if (!email || !password) {
    showErr(errEl, 'please fill in all fields!');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'hold on...';

  try {

    if (authMode === 'signup') {

      const username =
        document.getElementById('inp-username').value.trim()
        || email.split('@')[0];

      const { error } = await sb.auth.signUp({
        email,
        password,
        options: {
          data: { username }
        }
      });

      if (error) throw error;

      const { data: { user } } = await sb.auth.getUser();

      currentUser = user;
      currentUsername = username;

    } else {

      const { error } = await sb.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;

      const { data: { user } } = await sb.auth.getUser();

      currentUser = user;

      currentUsername =
        user.user_metadata?.username
        || user.email?.split('@')[0]
        || 'friend';
    }

    showLobby();

  } catch(e) {

    showErr(errEl, e.message || 'something went wrong~');

    btn.disabled = false;

    btn.textContent =
      authMode === 'login'
      ? 'sign in ♡'
      : 'create account ♡';
  }
}
function showErr(el, msg) { el.textContent = msg; el.classList.add('show'); }

function showAuth() { document.getElementById('auth-view').style.display = 'flex'; document.getElementById('lobby-view').style.display = 'none'; document.getElementById('app-view').style.display = 'none'; }

async function handleLogout() {
  if (realtimeChannel) sb.removeChannel(realtimeChannel);
  await sb.auth.signOut();
  currentUser = currentUsername = currentSpace = null;
  memories = []; globalTags = []; activeTagFilters = new Set();
  showAuth();
}

// ─── LOBBY ───
async function showLobby() {
  document.getElementById('auth-view').style.display = 'none';
  document.getElementById('app-view').style.display = 'none';
  document.getElementById('lobby-view').style.display = 'block';
  document.getElementById('lobby-username').textContent = currentUsername;
  if (realtimeChannel) { sb.removeChannel(realtimeChannel); realtimeChannel = null; }
  await loadSpaces();
}

async function loadSpaces() {
  const grid = document.getElementById('spaces-grid');
  grid.innerHTML = '<div class="space-card new-space-card" onclick="showCreateSpace()"><div class="plus">✦</div><p>create a space</p></div>';
  const { data: memberRows } = await sb.from('space_members').select('space_id').eq('user_id', currentUser.id);
  if (!memberRows?.length) return;
  const ids = memberRows.map(r => r.space_id);
  const { data: spaces } = await sb.from('spaces').select('*').in('id', ids);
  if (!spaces?.length) return;
  const { data: memCounts } = await sb.from('memories').select('space_id').in('space_id', ids);
  spaces.forEach(space => {
    const count = memCounts?.filter(m => m.space_id === space.id).length || 0;
    const card = document.createElement('div');
    card.className = 'space-card';
    card.innerHTML = `<div class="space-emoji">${space.emoji || '✨'}</div><div class="space-name">${esc(space.name)}</div><div class="space-code">code: ${space.code}</div><div class="space-count">${count} memor${count === 1 ? 'y' : 'ies'}</div>`;
    card.onclick = () => enterSpace(space);
    grid.insertBefore(card, grid.firstChild);
  });
}

const EMOJIS = ['🌸','🌊','🌅','☕','🎂','🌴','❄️','🪴','🚗','✨','🎵','🌙','🌈','🍜','🏔️','🎨','🌻','🍵','🦋','🎪'];
function showCreateSpace() {
  const g = document.getElementById('emoji-grid');
  g.innerHTML = EMOJIS.map((e,i) => `<div class="emoji-opt${i===0?' active':''}" onclick="selectEmoji(this,'${e}')">${e}</div>`).join('');
  document.getElementById('new-space-name').value = '';
  document.getElementById('create-err').classList.remove('show');
  document.getElementById('create-space-modal').style.display = 'flex';
}
function selectEmoji(el, emoji) {
  document.querySelectorAll('.emoji-opt').forEach(e => e.classList.remove('active'));
  el.classList.add('active');
}
function getSelectedEmoji() { const a = document.querySelector('.emoji-opt.active'); return a ? a.textContent : '✨'; }

function randCode() { return Math.random().toString(36).substring(2,8).toUpperCase(); }

async function createSpace() {
  const name = document.getElementById('new-space-name').value.trim();
  const errEl = document.getElementById('create-err');
  if (!name) { showErr(errEl, 'give your space a name!'); return; }
  const btn = document.getElementById('btn-create-space');
  btn.disabled = true; btn.textContent = 'creating...';
  try {
    const code = randCode();
    const { data: space, error } = await sb.from('spaces').insert({ name, emoji: getSelectedEmoji(), code, created_by: currentUser.id }).select().single();
    if (error) throw error;
    await sb.from('space_members').insert({ space_id: space.id, user_id: currentUser.id, username: currentUsername });
    document.getElementById('create-space-modal').style.display = 'none';
    enterSpace(space);
  } catch(e) {
    showErr(errEl, e.message || 'could not create space~');
    btn.disabled = false; btn.textContent = 'create space ♡';
  }
}

async function joinSpace() {
  const code = document.getElementById('inp-join-code').value.trim().toUpperCase();
  const errEl = document.getElementById('join-err');
  errEl.classList.remove('show');
  if (!code) { showErr(errEl, 'enter a space code!'); return; }
  const { data: space, error } = await sb.from('spaces').select('*').eq('code', code).single();
  if (error || !space) { showErr(errEl, 'space not found~ double check the code!'); return; }
  const { error: me } = await sb.from('space_members').upsert({ space_id: space.id, user_id: currentUser.id, username: currentUsername }, { onConflict: 'space_id,user_id' });
  document.getElementById('inp-join-code').value = '';
  enterSpace(space);
}

// ─── ENTER SPACE ───
async function enterSpace(space) {
  currentSpace = space;
  document.getElementById('lobby-view').style.display = 'none';
  document.getElementById('app-view').style.display = 'block';
  document.getElementById('app-space-name').innerHTML = `${space.emoji} ${esc(space.name)}`;
  document.getElementById('app-space-code').innerHTML = `code: <strong>${space.code}</strong> — share with friends ♡`;
  document.getElementById('inp-date').value = today;
  memories = [];
  globalTags = [];
  await loadMemories();
  subscribeRealtime();
  switchTab('all');
}

async function loadMemories() {
  const { data } = await sb.from('memories').select('*').eq('space_id', currentSpace.id).order('created_at', { ascending: false });
  memories = data || [];
  updateMemberCount();
}

async function updateMemberCount() {
  const { data } = await sb.from('space_members').select('username').eq('space_id', currentSpace.id);
  const count = data?.length || 1;
  document.getElementById('space-member-count').textContent = count === 1 ? 'you (invite someone!)' : `${count} people`;
  document.getElementById('online-count').textContent = `${count} member${count !== 1 ? 's' : ''} ✦`;
}

// ─── REALTIME ───
function subscribeRealtime() {
  if (realtimeChannel) sb.removeChannel(realtimeChannel);
  realtimeChannel = sb.channel(`space-${currentSpace.id}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'memories', filter: `space_id=eq.${currentSpace.id}` }, payload => {
      if (!memories.find(m => m.id === payload.new.id)) {
        memories.unshift(payload.new);
        refreshCurrentView();
      }
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'memories', filter: `space_id=eq.${currentSpace.id}` }, payload => {
      memories = memories.filter(m => m.id !== payload.old.id);
      refreshCurrentView();
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'memories', filter: `space_id=eq.${currentSpace.id}` }, payload => {
      const idx = memories.findIndex(m => m.id === payload.new.id);
      if (idx !== -1) memories[idx] = payload.new;
      refreshCurrentView();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'space_members', filter: `space_id=eq.${currentSpace.id}` }, () => { updateMemberCount(); })
    .subscribe();
}

function refreshCurrentView() {
  if (currentTab === 'all') renderAll();
  else if (currentTab === 'timeline') renderTimeline();
  else if (currentTab === 'albums') renderAlbums();
}

function goToLobby() { showLobby(); }

// ─── TABS ───
function switchTab(tab) {
  currentTab = tab;
  ['all','timeline','albums','upload'].forEach(v => document.getElementById('view-'+v).style.display = 'none');
  document.getElementById('view-'+tab).style.display = '';
  document.querySelectorAll('.tab').forEach((t,i) => t.classList.toggle('active', ['all','timeline','albums','upload'][i] === tab));
  if (tab === 'all') renderAll();
  else if (tab === 'timeline') renderTimeline();
  else if (tab === 'albums') renderAlbums();
  else if (tab === 'upload') refreshAlbumDl();
}

// ─── FILTER ───
function getFiltered() {
  const q = (document.getElementById('search').value || '').toLowerCase();
  const af = document.getElementById('filter-album').value;
  const sort = document.getElementById('sort').value;
  let list = memories.filter(m => {
    const mq = !q || (m.title||'').toLowerCase().includes(q) || (m.note||'').toLowerCase().includes(q) || (m.tags||[]).some(t => t.includes(q));
    const ma = !af || m.album === af;
    const mt = activeTagFilters.size === 0 || [...activeTagFilters].every(t => (m.tags||[]).includes(t));
    return mq && ma && mt;
  });
  list.sort((a,b) => sort === 'newest' ? new Date(b.date||b.created_at) - new Date(a.date||a.created_at) : new Date(a.date||a.created_at) - new Date(b.date||b.created_at));
  return list;
}

// ─── CARD ───
function tagCls(i) { return ['mtag mtag-v','mtag mtag-p','mtag mtag-g'][i%3]; }
function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function cardHTML(m) {
  const tags = m.tags||[];
  const img = m.data_url ? `<img src="${esc(m.data_url)}" alt="${esc(m.title)}" loading="lazy">` : `<div style="width:100%;aspect-ratio:4/3;background:var(--vp);display:flex;align-items:center;justify-content:center;font-size:32px">📷</div>`;
  const tagsHTML = tags.slice(0,3).map((t,i) => `<span class="${tagCls(i)}">${esc(t)}</span>`).join('');
  return `<div class="mcard-wrap">
    <div class="mcard" onclick="openModal('${m.id}')">
      ${img}
      <div class="mcard-body">
        <div class="mcard-title">${esc(m.title||'untitled')}</div>
        <div class="mcard-meta">${formatDate(m.date)}${m.album ? ' · '+esc(m.album) : ''}${m.username ? ' · '+esc(m.username) : ''}</div>
        ${tagsHTML ? `<div class="mcard-tags">${tagsHTML}</div>` : ''}
      </div>
    </div>
    <button class="fav-btn${m.fav?' on':''}" onclick="event.stopPropagation();toggleFav('${m.id}')">${m.fav?'♥':'♡'}</button>
  </div>`;
}

// ─── RENDER ALL ───
function renderAll() {
  renderTagFilters(); refreshAlbumSelect(); renderStats();
  const list = getFiltered(), g = document.getElementById('memory-grid');
  if (!list.length) { g.innerHTML = `<div class="no-results"><span style="font-size:40px;display:block;margin-bottom:10px">🌸</span><p>no memories found~</p></div>`; return; }
  g.innerHTML = list.map(cardHTML).join('');
}

function renderStats() {
  const favs = memories.filter(m => m.fav).length;
  const albums = [...new Set(memories.map(m => m.album).filter(Boolean))].length;
  document.getElementById('stats-row').innerHTML = `<div class="stat-pill"><strong>${memories.length}</strong> memories</div><div class="stat-pill"><strong>${albums}</strong> albums</div><div class="stat-pill"><strong>${favs}</strong> favourites ♡</div>`;
}

function syncGlobalTags() { const f = [...new Set(memories.flatMap(m => m.tags||[]))]; globalTags = [...new Set([...globalTags,...f])]; }

function renderTagFilters() {
  syncGlobalTags();
  const row = document.getElementById('tag-filters'), addWrap = row.querySelector('.tag-add-wrap');
  row.innerHTML = '';
  globalTags.forEach(t => {
    const span = document.createElement('span');
    span.className = 'tag'+(activeTagFilters.has(t)?' active':'');
    span.onclick = () => toggleTag(t);
    span.innerHTML = `${esc(t)}<button class="tag-del" onclick="event.stopPropagation();deleteGlobalTag('${esc(t)}')">✕</button>`;
    row.appendChild(span);
  });
  row.appendChild(addWrap || createAddWrap());
}

function createAddWrap() {
  const w = document.createElement('div');
  w.className = 'tag-add-wrap';
  w.innerHTML = `<input class="tag-add-input" id="tag-add-input" type="text" placeholder="+ new tag" maxlength="24" onkeydown="if(event.key==='Enter')addGlobalTag()"/><button class="tag-add-btn" onclick="addGlobalTag()">+</button>`;
  return w;
}

function addGlobalTag() { const inp = document.getElementById('tag-add-input'), val = inp.value.trim().toLowerCase(); if(val && !globalTags.includes(val)){globalTags.push(val);} inp.value=''; renderTagFilters(); }
function deleteGlobalTag(t) { globalTags = globalTags.filter(x => x!==t); activeTagFilters.delete(t); renderTagFilters(); renderAll(); }
function toggleTag(t) { activeTagFilters.has(t)?activeTagFilters.delete(t):activeTagFilters.add(t); renderAll(); }

function refreshAlbumSelect() {
  const sel = document.getElementById('filter-album'), val = sel.value;
  const albums = [...new Set(memories.map(m => m.album).filter(Boolean))];
  sel.innerHTML = '<option value="">all albums</option>' + albums.map(a => `<option value="${esc(a)}"${val===a?' selected':''}>${esc(a)}</option>`).join('');
}

function refreshAlbumDl() {
  const dl = document.getElementById('album-dl');
  const albums = [...new Set(memories.map(m => m.album).filter(Boolean))];
  dl.innerHTML = albums.map(a => `<option value="${esc(a)}">`).join('');
}

async function toggleFav(id) {
  const m = memories.find(x => x.id === id); if(!m) return;
  m.fav = !m.fav;
  await sb.from('memories').update({ fav: m.fav }).eq('id', id);
  renderAll();
}

// ─── TIMELINE ───
function renderTimeline() {
  const sorted = [...memories].sort((a,b) => new Date(b.date||b.created_at) - new Date(a.date||a.created_at));
  if (!sorted.length) { document.getElementById('timeline-content').innerHTML = `<div class="empty-state"><span class="ei">🕰️</span><p>your story starts here ✦</p></div>`; return; }
  const groups = {};
  sorted.forEach(m => { const d = new Date((m.date||m.created_at)+'T12:00:00'); const key = d.toLocaleString('default',{month:'long',year:'numeric'}); if(!groups[key])groups[key]=[]; groups[key].push(m); });
  document.getElementById('timeline-content').innerHTML = Object.entries(groups).map(([month,items]) => `<div class="timeline-group"><div class="timeline-month"><span class="dot"></span>${month}</div><div class="masonry">${items.map(cardHTML).join('')}</div></div>`).join('');
}

// ─── ALBUMS ───
function renderAlbums() {
  const map = {};
  memories.forEach(m => { const a = m.album||'uncategorized'; if(!map[a])map[a]={count:0,thumb:null}; map[a].count++; if(!map[a].thumb&&m.data_url)map[a].thumb=m.data_url; });
  const c = document.getElementById('albums-content');
  if(!Object.keys(map).length){c.innerHTML=`<div class="empty-state"><span class="ei">📁</span><p>no albums yet, darling~</p></div>`;return;}
  c.innerHTML = Object.entries(map).map(([name,data]) => `<div class="album-card" onclick="filterByAlbum('${esc(name)}')">${data.thumb?`<img class="album-thumb" src="${data.thumb}" alt="${esc(name)}">`:`<div class="album-thumb-ph">📁</div>`}<div class="album-info"><div class="album-name">${esc(name)}</div><div class="album-count">${data.count} memor${data.count===1?'y':'ies'}</div></div></div>`).join('');
}

function filterByAlbum(name) { switchTab('all'); setTimeout(() => { document.getElementById('filter-album').value = name === 'uncategorized' ? '' : name; renderAll(); }, 50); }

// ─── FILE UPLOAD ───
function handleDrop(e) { e.preventDefault(); handleFiles(e.dataTransfer.files); }
function handleFiles(files) {
  pendingFiles = [];
  const prev = document.getElementById('file-previews');
  prev.innerHTML = '';
  Array.from(files).forEach(file => {
    const r = new FileReader();
    r.onload = e2 => {
      pendingFiles.push({ dataUrl: e2.target.result });
      const img = document.createElement('img');
      img.src = e2.target.result; prev.appendChild(img);
    };
    r.readAsDataURL(file);
  });
  if (files.length && !document.getElementById('inp-title').value) {
    document.getElementById('inp-title').value = files[0].name.replace(/\.[^.]+$/,'');
  }
}

// ─── SAVE MEMORY ───
async function saveMemory() {
  const title = document.getElementById('inp-title').value.trim() || 'untitled';
  const date = document.getElementById('inp-date').value || today;
  const album = document.getElementById('inp-album').value.trim() || null;
  const tags = document.getElementById('inp-tags').value.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
  const note = document.getElementById('inp-note').value.trim() || null;
  const btn = document.getElementById('btn-save-mem');
  btn.disabled = true; btn.textContent = 'saving...';
  try {
    const toInsert = pendingFiles.length ? pendingFiles.map((f,i) => ({ space_id: currentSpace.id, user_id: currentUser.id, username: currentUsername, title: pendingFiles.length>1 ? title+' '+(i+1) : title, date, album, tags, note, data_url: f.dataUrl, fav: false })) : [{ space_id: currentSpace.id, user_id: currentUser.id, username: currentUsername, title, date, album, tags, note, data_url: null, fav: false }];
    const { error } = await sb.from('memories').insert(toInsert);
    if (error) throw error;
    pendingFiles = [];
    document.getElementById('file-previews').innerHTML = '';
    ['inp-title','inp-album','inp-tags','inp-note'].forEach(id => document.getElementById(id).value='');
    document.getElementById('inp-date').value = today;
    document.getElementById('file-input').value = '';
    const msg = document.getElementById('save-msg');
    msg.classList.add('show');
    setTimeout(() => msg.classList.remove('show'), 2500);
  } catch(e) {
    alert('could not save: ' + e.message);
  } finally {
    btn.disabled = false; btn.textContent = 'save memory ♡';
  }
}

// ─── MODAL ───
function openModal(id) {
  const m = memories.find(x => x.id === id); if(!m) return;
  currentDetailId = id;
  document.getElementById('det-title').textContent = m.title || 'untitled';
  document.getElementById('det-date').textContent = formatDate(m.date);
  document.getElementById('det-album').textContent = m.album || '—';
  document.getElementById('det-note').textContent = m.note || '';
  document.getElementById('det-author').textContent = m.username ? `added by ${m.username}` : '';
  document.getElementById('det-tags').innerHTML = (m.tags||[]).map((t,i) => `<span class="${tagCls(i)}">${esc(t)}</span>`).join('');
  document.getElementById('det-media').innerHTML = m.data_url ? `<img class="det-img" src="${esc(m.data_url)}" alt="${esc(m.title)}">` : `<div class="det-ph">📷</div>`;
  const canDel = m.user_id === currentUser.id;
  document.getElementById('btn-del-mem').style.display = canDel ? '' : 'none';
  document.getElementById('modal').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeModal() { document.getElementById('modal').style.display = 'none'; document.body.style.overflow = ''; }

async function deleteMemory() {
  if (!currentDetailId) return;
  const { error } = await sb.from('memories').delete().eq('id', currentDetailId);
  if (!error) { memories = memories.filter(m => m.id !== currentDetailId); closeModal(); refreshCurrentView(); }
}

document.addEventListener('keydown', e => { if(e.key==='Escape') closeModal(); });

function formatDate(d) {
  if (!d) return '';
  try { return new Date(d+'T12:00:00').toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}); } catch(e) { return d; }
}

init();
