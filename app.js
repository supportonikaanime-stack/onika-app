// ==========================================
// 1. НАСТРОЙКА SUPABASE
// ==========================================
const SUPABASE_URL = 'https://wsaykqhojwfhpqzxptke.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndzYXlrcWhvandmaHBxenhwdGtlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1MzAxMDgsImV4cCI6MjEwODEwNjEwOH0.6eHuhYt2CyVvIurt-TW3MgP4VE0kzv39vqVHwskodLk';

let supabaseClient = null;
try { if (window.supabase) supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY); } catch(e) { console.error('Ошибка Supabase:', e); }

const tg = window.Telegram?.WebApp;
let MY_ID = null, MY_PUBLIC_ID = null, MY_NAME = 'Гость', MY_PHOTO_URL = '';
let ACTIVE_BANNER_URL = '', ACTIVE_TITLE_DATA = null, ACTIVE_EFFECT_CSS = '', ACTIVE_BADGE_URL = '';
let PENDING_VERIFY_EMAIL = '';

if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
    try { tg.expand(); tg.setHeaderColor('#0a0a0f'); tg.setBackgroundColor('#0a0a0f'); } catch(e) {}
    MY_ID = tg.initDataUnsafe.user.id;
    MY_NAME = tg.initDataUnsafe.user.first_name + (tg.initDataUnsafe.user.last_name ? ' ' + tg.initDataUnsafe.user.last_name : '');
    MY_PHOTO_URL = tg.initDataUnsafe.user.photo_url || '';
}

function escapeHTML(str) { if (str == null) return ''; return String(str).replace(/[&<>'"]/g, t => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[t] || t)); }
function safeUrl(url) { if (!url || typeof url !== 'string') return ''; if (url.startsWith('/')) return 'https://shikimori.io' + url; try { const u = new URL(url, location.origin); return (u.protocol==='http:'||u.protocol==='https:')?u.href:''; } catch { return ''; } }

window._previewCache = {};
function cachePreviewItem(item) { const key = 'p_' + Math.random().toString(36).slice(2, 10); window._previewCache[key] = item; return key; }

// ==========================================
// 1.1 АВТОРИЗАЦИЯ
// ==========================================
let authMode = 'login';
function switchAuthTab(mode) { authMode = mode; document.getElementById('tab-login').classList.toggle('active', mode==='login'); document.getElementById('tab-register').classList.toggle('active', mode==='register'); document.getElementById('form-login').style.display = mode==='login'?'block':'none'; document.getElementById('form-register').style.display = mode==='register'?'block':'none'; document.getElementById('form-verify').style.display='none'; showAuthError(''); }
function showAuthError(msg) { const el = document.getElementById('authError'); if (!el) return; if (!msg) { el.classList.remove('active'); el.textContent=''; return; } el.textContent=msg; el.classList.add('active'); }

async function handleLogin() {
    if (!supabaseClient) { showAuthError('Сервис авторизации недоступен'); return; }
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    if (!email||!password) { showAuthError('Заполните все поля'); return; }
    const btn = document.getElementById('login-btn');
    btn.disabled=true; btn.textContent='Вход...'; showAuthError('');
    try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) throw error;
        MY_ID = data.user.id;
        MY_NAME = data.user.user_metadata?.nickname || 'Игрок';
        hideAuthScreen();
        await loadProfileData();
        loadHomePage();
    } catch(e) {
        showAuthError('Неверный email или пароль');
    } finally {
        btn.disabled=false; btn.textContent='Войти';
    }
}

async function handleRegister() {
    if (!supabaseClient) { showAuthError('Сервис авторизации недоступен'); return; }
    const email = document.getElementById('reg-email').value.trim();
    const nickname = document.getElementById('reg-nickname').value.trim();
    const password = document.getElementById('reg-password').value;
    if (!email||!nickname||!password) { showAuthError('Заполните все поля'); return; }
    if (nickname.length<3) { showAuthError('Никнейм должен быть не менее 3 символов'); return; }
    if (nickname.length>12) { showAuthError('Никнейм должен быть не более 12 символов'); return; }
    if (!/^[a-zA-Z0-9_]+$/.test(nickname)) { showAuthError('Только латиница, цифры и _'); return; }
    if (password.length<6) { showAuthError('Пароль должен быть не менее 6 символов'); return; }
    const btn = document.getElementById('register-btn');
    btn.disabled=true; btn.textContent='Проверка...'; showAuthError('');
    try {
        const { data: existing } = await supabaseClient.from('users').select('id').ilike('name', nickname).limit(1);
        if (existing && existing.length>0) { showAuthError('Этот никнейм уже занят'); btn.disabled=false; btn.textContent='Создать аккаунт'; return; }
        btn.textContent='Регистрация...';
        const { data, error } = await supabaseClient.auth.signUp({ email, password, options: { data: { nickname } } });
        if (error) throw error;
        if (data.session) {
            MY_ID = data.user.id;
            MY_NAME = nickname;
            await supabaseClient.from('users').upsert({ id: data.user.id, name: nickname, avatar_url: '', xp: 0, coins: 0, episodes_watched: 0, minutes_watched: 0, days_streak: 1, unlocked_achievements: [] }, { onConflict: 'id' });
            hideAuthScreen();
            await loadProfileData();
            loadHomePage();
            showToast('Добро пожаловать!');
            return;
        }
        PENDING_VERIFY_EMAIL = email;
        document.getElementById('form-register').style.display='none';
        document.getElementById('form-verify').style.display='block';
        document.getElementById('authError').classList.remove('active');
        showToast('Код отправлен на почту!');
    } catch(e) {
        showAuthError(e.message||'Ошибка регистрации');
    } finally {
        btn.disabled=false; btn.textContent='Создать аккаунт';
    }
}

async function handleVerifyCode() {
    if (!supabaseClient) { showAuthError('Сервис авторизации недоступен'); return; }
    const code = document.getElementById('verify-code').value.trim();
    if (!code||code.length!==8) { showAuthError('Введите 8-значный код'); return; }
    const btn = document.getElementById('verify-btn');
    btn.disabled=true; btn.textContent='Проверка...'; showAuthError('');
    try {
        const { data, error } = await supabaseClient.auth.verifyOtp({ email: PENDING_VERIFY_EMAIL, token: code, type: 'email' });
        if (error) throw error;
        if (data.session) {
            MY_ID = data.user.id;
            MY_NAME = data.user.user_metadata?.nickname || 'Игрок';
            await supabaseClient.from('users').upsert({ id: MY_ID, name: MY_NAME, avatar_url: '', xp: 0, coins: 0, episodes_watched: 0, minutes_watched: 0, days_streak: 1, unlocked_achievements: [] }, { onConflict: 'id' });
            hideAuthScreen();
            await loadProfileData();
            loadHomePage();
            showToast('Почта подтверждена!');
        }
    } catch(e) {
        showAuthError('Неверный или просроченный код');
    } finally {
        btn.disabled=false; btn.textContent='Подтвердить';
    }
}

function hideAuthScreen() { document.getElementById('authScreen')?.classList.remove('active'); }
function showAuthScreen() { document.getElementById('authScreen')?.classList.add('active'); }
async function initAuth() {
    if (MY_ID && tg && tg.initDataUnsafe && tg.initDataUnsafe.user) { hideAuthScreen(); return; }
    if (supabaseClient) {
        try {
            const { data: { session } } = await supabaseClient.auth.getSession();
            if (session && session.user) {
                MY_ID = session.user.id;
                MY_NAME = session.user.user_metadata?.nickname || 'Игрок';
                const { data: dbUser } = await supabaseClient.from('users').select('id').eq('id', MY_ID).single();
                if (!dbUser) await supabaseClient.from('users').upsert({ id: MY_ID, name: MY_NAME, avatar_url: '', xp: 0, coins: 0, episodes_watched: 0, minutes_watched: 0, days_streak: 1, unlocked_achievements: [] }, { onConflict: 'id' });
                hideAuthScreen();
                return;
            }
        } catch(e) {}
        showAuthScreen();
    } else showAuthScreen();
}
async function signOut() { try { if (supabaseClient) await supabaseClient.auth.signOut(); } catch(e) {} localStorage.removeItem('onika_stats'); location.reload(); }

// ==========================================
// 2. SKELETONS + RIPPLE
// ==========================================
const Skeletons = {
    cards(count=6) { let h=''; for(let i=0;i<count;i++) h+=`<div class="skeleton-card"><div class="skeleton skeleton-poster"></div><div class="skeleton-card-title"></div></div>`; return h; },
    friends(count=3) { let h=''; for(let i=0;i<count;i++) h+=`<div class="skeleton-friend"><div class="skeleton skeleton-circle"></div><div class="skeleton-friend-info"><div class="skeleton skeleton-text"></div><div class="skeleton skeleton-text short"></div></div></div>`; return h; },
    shopItems(count=4) { let h=''; for(let i=0;i<count;i++) h+=`<div class="skeleton-shop-item"><div class="skeleton skeleton-shop-img"></div><div class="skeleton-shop-info"><div class="skeleton skeleton-text"></div><div class="skeleton skeleton-text short"></div></div></div>`; return h; }
};
document.addEventListener('pointerdown', function(e) {
    const btn = e.target.closest('.ripple-btn, .btn-primary, .filter-btn, .genre-pill, .my-list-tab, .tab-btn');
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const ripple = document.createElement('span');
    ripple.className='ripple';
    ripple.style.width=ripple.style.height=size+'px';
    ripple.style.left=(e.clientX-rect.left-size/2)+'px';
    ripple.style.top=(e.clientY-rect.top-size/2)+'px';
    if (!btn.classList.contains('ripple-btn')) btn.classList.add('ripple-btn');
    btn.appendChild(ripple);
    setTimeout(()=>ripple.remove(),650);
}, { passive: true });

// ==========================================
// 3. API — AniList + AniLibria + Shikimori
// ==========================================
const PROXY_URL = 'https://onika-api.relaxdev.ru/?target=';
const ANILIST_URL = 'https://graphql.anilist.co';
const SHIKIMORI_GRAPHQL = 'https://shikimori.io/api/graphql';
const ANILIBRIA_API = 'https://aniliberty.top/api/v1';

const API_AniList = {
    async fetch(query, variables = {}) {
        const res = await fetch(PROXY_URL + encodeURIComponent(ANILIST_URL), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query, variables }) });
        if (!res.ok) throw new Error('AniList HTTP ' + res.status);
        const d = await res.json();
        if (d.errors) throw new Error('AniList: ' + d.errors[0].message);
        return d.data;
    },
    _mediaFields: `id idMal title{romaji english native} averageScore episodes status format seasonYear coverImage{extraLarge large medium} genres trailer{id}`,
    async getCatalog(page, limit, filters) {
        const perPage = Math.min(limit || 30, 50);
        const vars = { page: page || 1, perPage };
        let args = ['type: ANIME', 'sort: POPULARITY_DESC'];
        if (filters && filters.search) { vars.search = filters.search; args.push('search: $search'); }
        if (filters && filters.year) { vars.seasonYear = parseInt(filters.year); args.push('seasonYear: $seasonYear'); }
        if (filters && filters.genre) { vars.genre = filters.genre; args.push('genre: $genre'); }
        if (filters && filters.status) { const m={ongoing:'RELEASING',released:'FINISHED',anons:'NOT_YET_RELEASED'}; vars.status=m[filters.status]; if(vars.status) args.push('status: $status'); }
        const sortMap={popularity:'POPULARITY_DESC',ranked:'SCORE_DESC',aired_on:'START_DATE_DESC'};
        const sort = sortMap[filters?.sort] || 'POPULARITY_DESC';
        const q = `query($page:Int,$perPage:Int${vars.search?', $search:String':''}${vars.seasonYear?', $seasonYear:Int':''}${vars.genre?', $genre:String':''}${vars.status?', $status:MediaStatus':''}){Page(page:$page,perPage:$perPage){media(${args.filter(a=>!a.startsWith('sort')).join(', ')},sort:${sort}){${this._mediaFields}}}}`;
        const data = await this.fetch(q, vars).catch(()=>null);
        return data?.Page?.media || [];
    },
    async getDetails(id) {
        const cleanId = String(id).replace('anilist_','');
        const q = `query($id:Int){Media(id:$id,type:ANIME){${this._mediaFields} description(asHtml:false) bannerImage}}`;
        const data = await this.fetch(q, { id: parseInt(cleanId) }).catch(()=>null);
        return data?.Media || null;
    },
    async getRandom(limit) {
        const q = `query($page:Int,$perPage:Int){Page(page:$page,perPage:$perPage){media(type:ANIME,sort:POPULARITY_DESC){${this._mediaFields}}}}`;
        const data = await this.fetch(q, { page: 1, perPage: Math.min((limit||5)*6,50) }).catch(()=>null);
        return (data?.Page?.media || []).sort(()=>Math.random()-0.5).slice(0, limit||5);
    },
    async getSeasonal(limit) {
        const now = new Date(); const month = now.getMonth();
        let season = 'WINTER'; if (month>=3&&month<6) season='SPRING'; else if (month>=6&&month<9) season='SUMMER'; else if (month>=9) season='FALL';
        const q = `query($page:Int,$perPage:Int,$season:MediaSeason,$seasonYear:Int){Page(page:$page,perPage:$perPage){media(type:ANIME,season:$season,seasonYear:$seasonYear,sort:POPULARITY_DESC){${this._mediaFields}}}}`;
        const data = await this.fetch(q, { page:1, perPage:Math.min((limit||6)*2,50), season, seasonYear:now.getFullYear() }).catch(()=>null);
        return (data?.Page?.media || []).slice(0, limit||6);
    },
    async getUpcoming(limit) {
        const now = new Date(); const month = now.getMonth();
        let season = 'WINTER', year = now.getFullYear();
        if (month >= 0 && month < 3) { season = 'SPRING'; }
        else if (month >= 3 && month < 6) { season = 'SUMMER'; }
        else if (month >= 6 && month < 9) { season = 'FALL'; }
        else { season = 'WINTER'; year += 1; }
        const q = `query($page:Int,$perPage:Int,$season:MediaSeason,$seasonYear:Int){Page(page:$page,perPage:$perPage){media(type:ANIME,season:$season,seasonYear:$seasonYear,status:NOT_YET_RELEASED,sort:POPULARITY_DESC){${this._mediaFields}}}}`;
        const data = await this.fetch(q, { page:1, perPage:Math.min((limit||6)*2,50), season, seasonYear:year }).catch(()=>null);
        return (data?.Page?.media || []).slice(0, limit||6);
    },
    async getTopRated(limit = 6) {
        const q = `query($page:Int,$perPage:Int){Page(page:$page,perPage:$perPage){media(type:ANIME,sort:SCORE_DESC){${this._mediaFields}}}}`;
        const data = await this.fetch(q, { page: 1, perPage: Math.min(limit, 50) }).catch(()=>null);
        return data?.Page?.media || [];
    }
};

const API_AniLibria = {
    async searchRussian(searchTitle) {
        if (!searchTitle) return null;
        const cleanSearch = searchTitle.replace(/\s*\([^)]*\)/g,'').trim();
        if (!cleanSearch) return null;
        const url = `${ANILIBRIA_API}/anime/releases?f[search]=${encodeURIComponent(cleanSearch)}&limit=1`;
        try {
            const res = await fetch(PROXY_URL + encodeURIComponent(url));
            if (!res.ok) return null;
            const data = await res.json();
            const item = data?.data && data.data[0];
            if (item) return item.name?.main || item.name?.english || null;
        } catch(e) { }
        return null;
    }
};

const API_Shikimori = {
    async fetchGraphQL(query) {
        const res = await fetch(PROXY_URL + encodeURIComponent(SHIKIMORI_GRAPHQL), { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({query}) });
        if (!res.ok) throw new Error('Shikimori HTTP ' + res.status);
        const d = await res.json();
        if (d.errors) throw new Error('Shikimori: ' + d.errors[0].message);
        return d.data;
    },
    async getRussianData(searchTitle) {
        if (!searchTitle) return { russian:null, description:null };
        const clean = searchTitle.replace(/\s*\([^)]*\)/g,'').trim();
        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                const q = `{animes(search:"${clean.replace(/"/g,'')}",limit:1){id name russian description}}`;
                const d = await this.fetchGraphQL(q);
                if (d.animes && d.animes.length) return { russian: d.animes[0].russian || null, description: d.animes[0].description || null };
                break;
            } catch(e) {
                if (attempt === 1) await new Promise(r => setTimeout(r, 300));
            }
        }
        return { russian:null, description:null };
    }
};

async function getCachedTitle(anilistId) {
    if (!supabaseClient) return null;
    try {
        const { data } = await supabaseClient.from('anime_cache').select('title_ru, description').eq('id', String(anilistId)).single();
        return data || null;
    } catch(e) { return null; }
}

async function saveCachedTitle(anilistId, titleRu, description) {
    if (!supabaseClient) return;
    try {
        if (titleRu && titleRu !== 'Без названия') {
            await supabaseClient.from('anime_cache').upsert({ id: String(anilistId), title_ru: titleRu, description: description || '', updated_at: new Date().toISOString() }, { onConflict: 'id' });
        }
    } catch(e) {}
}

async function processWithLimit(items, limit, asyncProcessor) {
    const results = [];
    const executing = [];
    for (const item of items) {
        const p = Promise.resolve().then(() => asyncProcessor(item));
        results.push(p);
        const e = p.then(() => executing.splice(executing.indexOf(e), 1));
        executing.push(e);
        if (executing.length >= limit) await Promise.race(executing);
    }
    return Promise.all(results);
}

async function buildAnimeObject(raw) {
    const searchTitle = raw.title?.english || raw.title?.romaji || raw.title?.native || '';
    const anilistId = String(raw.id);

    const cached = await getCachedTitle(anilistId);
    if (cached && cached.title_ru) {
        return {
            id: 'anilist_' + raw.id,
            rawId: raw.id,
            idMal: raw.idMal,
            title_ru: cached.title_ru,
            title_raw: searchTitle,
            title: cached.title_ru,
            year: raw.seasonYear || '--',
            episodes: raw.episodes || '?',
            images: { jpg: { image_url: raw.coverImage?.extraLarge || raw.coverImage?.large || '' } },
            description: cached.description || raw.description || 'Описание отсутствует.',
            genres: raw.genres || [],
            score: raw.averageScore ? (raw.averageScore/10).toFixed(1) : 0,
            status: raw.status==='RELEASING'?'Онгоинг':raw.status==='FINISHED'?'Завершено':raw.status==='NOT_YET_RELEASED'?'Анонс':'Анонс',
            kind: raw.format || 'TV',
            trailerId: raw.trailer?.id || null,
            banner_image: raw.bannerImage || null
        };
    }

    let russianFromAniLibria = null;
    try { russianFromAniLibria = await API_AniLibria.searchRussian(searchTitle); } catch(e) {}

    let shikiData = { russian:null, description:null };
    if (!russianFromAniLibria) {
        shikiData = await API_Shikimori.getRussianData(searchTitle);
    }

    const finalRussianTitle = russianFromAniLibria || shikiData.russian || raw.title?.english || raw.title?.romaji || raw.title?.native || 'Без названия';
    const score = raw.averageScore ? (raw.averageScore/10).toFixed(1) : 0;
    let cleanDesc = shikiData.description || raw.description || 'Описание отсутствует.';
    cleanDesc = cleanDesc.replace(/\[[^\]]*\]/g,'').replace(/<[^>]*>?/gm,'').trim();

    if (russianFromAniLibria || shikiData.russian) {
        await saveCachedTitle(anilistId, finalRussianTitle, cleanDesc);
    }

    return {
        id: 'anilist_' + raw.id,
        rawId: raw.id,
        idMal: raw.idMal,
        title_ru: finalRussianTitle,
        title_raw: searchTitle,
        title: finalRussianTitle,
        year: raw.seasonYear || '--',
        episodes: raw.episodes || '?',
        images: { jpg: { image_url: raw.coverImage?.extraLarge || raw.coverImage?.large || '' } },
        description: cleanDesc,
        genres: raw.genres || [],
        score,
        status: raw.status==='RELEASING'?'Онгоинг':raw.status==='FINISHED'?'Завершено':raw.status==='NOT_YET_RELEASED'?'Анонс':'Анонс',
        kind: raw.format || 'TV',
        trailerId: raw.trailer?.id || null,
        banner_image: raw.bannerImage || null
    };
}

const API = {
    _cache: new Map(),
    async _cached(key, fn) {
        if (this._cache.has(key) && Date.now()-this._cache.get(key).t < 5*60*1000) return this._cache.get(key).d;
        try { const d = await fn(); this._cache.set(key,{d,t:Date.now()}); return d; } catch(e) { return null; }
    },
    getCatalog(page,limit,filters) {
        return this._cached(`c_${page}_${limit}_${JSON.stringify(filters||{})}`, async()=>{
            const raw=await API_AniList.getCatalog(page,limit,filters);
            return await processWithLimit(raw, 4, buildAnimeObject);
        });
    },
    getDetails(id) {
        return this._cached(`d_${id}`, async()=>{
            const raw=await API_AniList.getDetails(id);
            return raw?await buildAnimeObject(raw):null;
        });
    },
    getRandom(limit) {
        return this._cached(`r_${limit}`, async()=>{
            const raw=await API_AniList.getRandom(limit);
            return await processWithLimit(raw, 4, buildAnimeObject);
        });
    },
    getSeasonal(limit) {
        return this._cached(`s_${limit}`, async()=>{
            const raw=await API_AniList.getSeasonal(limit);
            return await processWithLimit(raw, 4, buildAnimeObject);
        });
    },
    getUpcoming(limit) {
        return this._cached(`u_${limit}`, async()=>{
            const raw=await API_AniList.getUpcoming(limit);
            return await processWithLimit(raw, 4, buildAnimeObject);
        });
    },
    getTopRated(limit) {
        return this._cached(`top_${limit}`, async()=>{
            const raw=await API_AniList.getTopRated(limit);
            return await processWithLimit(raw, 4, buildAnimeObject);
        });
    }
};

// ==========================================
// 4. ИГРА
// ==========================================
let currentAnimeForPlayer = null, selectedVoice = '', selectedPlayer = '';
const VOICES = [{id:'anilibria',name:'AniLibria',icon:'🎙️'},{id:'studioband',name:'StudioBand',icon:'🎙️'},{id:'jamclub',name:'JAM Club',icon:'🎙️'},{id:'original',name:'Оригинал (Субтитры)',icon:'📝'}];
const PLAYERS = [{id:'kodik',name:'Kodik',icon:'▶️'},{id:'sibnet',name:'Sibnet',icon:'🎬'},{id:'veoveo',name:'Veoveo',icon:'🎥'}];
let catalogPage=1, isCatalogLoading=false, hasMoreCatalog=true, catalogRequestVersion=0;
let currentFilters = {search:'',genre:'',year:'',status:'',sort:'popularity'};
let currentMyListFilter='all', previousScreen='catalog', searchDebounceTimer;
let currentShopTab='banners';
let isPreviewMode=false, previewItem=null, savedStats=null;

const GENRES=[{id:'1',name:'Action'},{id:'22',name:'Romance'},{id:'4',name:'Comedy'},{id:'10',name:'Fantasy'},{id:'8',name:'Drama'},{id:'2',name:'Adventure'},{id:'24',name:'Sci-Fi'},{id:'36',name:'Slice of Life'},{id:'41',name:'Thriller'},{id:'14',name:'Horror'},{id:'7',name:'Mystery'}];
const YEARS=[{id:'2024',name:'2024'},{id:'2023',name:'2023'},{id:'2022',name:'2022'},{id:'2021',name:'2021'},{id:'2020',name:'2020'}];
const STATUSES=[{id:'ongoing',name:'Онгоинг'},{id:'released',name:'Завершено'},{id:'anons',name:'Анонс'}];
const SORTS=[{id:'popularity',name:'По популярности'},{id:'ranked',name:'По рейтингу'},{id:'aired_on',name:'Новинки'}];

// ==========================================
// 5. НАВИГАЦИЯ
// ==========================================
function switchTab(tabName, element) {
    document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
    const scr = document.getElementById(`screen-${tabName}`); if(scr) scr.classList.add('active');
    if (element) { document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active')); element.classList.add('active'); }
    else { document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active')); const map={home:0,catalog:1,my:2,friends:3,profile:4}; const items=document.querySelectorAll('.nav-item'); if(map[tabName]!==undefined&&items[map[tabName]]) items[map[tabName]].classList.add('active'); }
    if (tabName !== 'home') stopSlideShow();
    if (tabName==='profile') loadProfileData();
    if (tabName==='catalog'&&document.getElementById('catalog-grid').children.length===0) { initCatalogFilters(); loadCatalog(true); }
    if (tabName==='my') renderMyList();
    if (tabName==='voice') { document.getElementById('voice-title').textContent='Выбор озвучки'; renderVoiceSelection(); }
    if (tabName==='player') { document.getElementById('player-title').textContent='Выбор плеера'; renderPlayerSelection(); }
    if (tabName==='episodes') { document.getElementById('eps-title').textContent='Выбор серии'; renderEpisodesSelection(); }
    if (tabName==='friends') loadFriends();
    if (tabName==='achievements') renderAchievementsPage();
}
function goBackFromDetail() { if (previousScreen==='my') switchTab('my'); else if (previousScreen==='home') switchTab('home'); else if (previousScreen==='friends') switchTab('friends'); else switchTab('catalog'); }
function toggleFilters() { const w=document.getElementById('filters-wrapper'); const c=document.getElementById('filter-chevron'); if(!w)return; if(w.classList.contains('filters-collapsed')){w.classList.remove('filters-collapsed');if(c)c.style.transform='rotate(180deg)';}else{w.classList.add('filters-collapsed');if(c)c.style.transform='rotate(0deg)';} }
function resetCatalogFilters() { currentFilters={search:'',genre:'',year:'',status:'',sort:'popularity'}; document.getElementById('search-input').value=''; const y=document.getElementById('filter-btn-year');if(y)y.innerHTML='Год ⌄'; const s=document.getElementById('filter-btn-status');if(s)s.innerHTML='Статус ⌄'; const so=document.getElementById('filter-btn-sort');if(so)so.innerHTML='Сортировка ⌄'; document.querySelectorAll('#genre-filters .genre-pill').forEach(el=>el.classList.remove('active')); const all=document.querySelector('#genre-filters .genre-pill');if(all){all.classList.add('active');all.innerHTML='<div class="dot"></div>Все';} loadCatalog(true); }

function openUserFromTop(id) { previousScreen = 'home'; openFriendProfile(id); }
function openUserFromComments(id) { previousScreen = 'detail'; openFriendProfile(id); }

function applyTitleToElement(titleEl, titleData) {
    if (!titleEl) return;
    if (!titleData) { titleEl.style.display='none'; return; }
    titleEl.style.display='inline-flex';
    titleEl.className='user-title-display';
    titleEl.removeAttribute('data-title');
    titleEl.style.color=''; titleEl.style.border=''; titleEl.style.background=''; titleEl.style.textShadow='';
    if (titleData.is_animated) {
        titleEl.className='user-title-display animated-title';
        titleEl.setAttribute('data-title', titleData.animation_key||'gold');
        titleEl.innerHTML=`<span class="title-text">${escapeHTML(titleData.name)}</span>`;
    } else {
        titleEl.style.color=titleData.color||'#fff';
        titleEl.style.borderColor=titleData.color||'#fff';
        titleEl.textContent=titleData.name;
    }
}

async function syncProfileToDB(forceLocal=false) {
    if (!MY_ID||!supabaseClient) return;
    let stats=getStats();
    try {
        const payload={ id:MY_ID, name:MY_NAME, avatar_url:stats.avatar_url||MY_PHOTO_URL||'', episodes_watched:stats.episodesWatched, minutes_watched:stats.minutesWatched, days_streak:stats.daysStreak, active_banner:stats.active_banner, active_title:stats.active_title, active_effect:stats.active_effect, active_badge:stats.active_badge, unlocked_achievements:stats.unlockedAchievements||[], last_watched:stats.favedAnime.length>0?stats.favedAnime[stats.favedAnime.length-1].id:null };
        const {data:remote}=await supabaseClient.from('users').select('coins,xp').eq('id',MY_ID).single();
        if (!remote||forceLocal) { payload.coins=stats.coins; payload.xp=stats.xp; }
        else { payload.coins=Math.max(remote.coins||0,stats.coins||0); payload.xp=Math.max(remote.xp||0,stats.xp||0); }
        await supabaseClient.from('users').upsert(payload,{onConflict:'id'});
    } catch(e) {}
}
function copyMyId() { if (!MY_PUBLIC_ID) return; navigator.clipboard.writeText(MY_PUBLIC_ID.toString()).then(()=>showToast('ID скопирован!')).catch(()=>{}); }

async function loadProfileData() {
    let stats = getStats();
    if (stats.active_banner_url) ACTIVE_BANNER_URL = stats.active_banner_url;
    if (MY_ID && supabaseClient) {
        try {
            const { data: dbUser } = await supabaseClient.from('users').select('*').eq('id', MY_ID).single();
            if (dbUser) {
                MY_PUBLIC_ID = dbUser.public_id;
                stats.coins = Math.max(stats.coins||0, dbUser.coins||0);
                stats.xp = Math.max(stats.xp||0, dbUser.xp||0);
                setElText('my-tg-id', MY_PUBLIC_ID||'...');
                setElText('tg-name', dbUser.name||MY_NAME);
                const avEl = document.getElementById('tg-avatar');
                if (avEl) { const u = dbUser.avatar_url||MY_PHOTO_URL; avEl.innerHTML = u ? `<img src="${safeUrl(u)}" style="width:100%;height:100%;object-fit:cover;">` : `<span>${escapeHTML((dbUser.name||'?')[0].toUpperCase())}</span>`; }
                if (dbUser.active_banner) { stats.active_banner = dbUser.active_banner; const {data:b}=await supabaseClient.from('banners').select('image_url').eq('id',dbUser.active_banner).single(); if(b){ACTIVE_BANNER_URL=safeUrl(b.image_url);stats.active_banner_url=ACTIVE_BANNER_URL;} }
                if (dbUser.active_title) { const {data:t}=await supabaseClient.from('titles').select('*').eq('id',dbUser.active_title).single(); if(t){ACTIVE_TITLE_DATA=t;stats.active_title=t.id;} } else {ACTIVE_TITLE_DATA=null;stats.active_title=null;}
                if (dbUser.active_effect) { const {data:e}=await supabaseClient.from('effects').select('*').eq('id',dbUser.active_effect).single(); if(e){ACTIVE_EFFECT_CSS=e.css_class;stats.active_effect=e.id;} } else {ACTIVE_EFFECT_CSS='';stats.active_effect=null;}
                if (dbUser.active_badge) { const {data:bd}=await supabaseClient.from('badges').select('image_url').eq('id',dbUser.active_badge).single(); if(bd){ACTIVE_BADGE_URL=safeUrl(bd.image_url);stats.active_badge=dbUser.active_badge;} } else {ACTIVE_BADGE_URL='';stats.active_badge=null;}
                saveStats(stats);
            }
        } catch(e) {}
    }
    const today = new Date().toDateString();
    if (stats.lastVisit !== today) { stats.daysStreak += 1; stats.lastVisit = today; stats.xp += 5; stats.coins += 10; stats.watchedToday = []; saveStats(stats); showToast('Ежедневный вход! +5 XP'); }
    checkAchievements(stats); saveStats(stats);
    const lvl = Math.floor(stats.xp/100)+1, rank = LEVEL_TITLES[Math.min(lvl-1,LEVEL_TITLES.length-1)]||'Легенда';
    setElText('user-level',lvl); setElText('user-level-text',lvl); setElText('user-rank',rank); setElText('user-xp-current',stats.xp%100); setElText('user-xp-next',100); setElWidth('user-xp-bar',(stats.xp%100)+'%'); setElText('user-coins',stats.coins||0);
    const total = ACHIEVEMENTS.length;
    setElText('ach-points',stats.unlockedAchievements.length*10); setElText('ach-earned',stats.unlockedAchievements.length); setElText('ach-total-count',total); setElWidth('ach-bar',(stats.unlockedAchievements.length/total)*100+'%');
    const next = ACHIEVEMENTS.find(a=>!stats.unlockedAchievements.includes(a.id));
    if (next) { setElText('next-ach-name',next.name); setElText('next-ach-reward',next.coins); } else { setElText('next-ach-name','Все выполнено!'); setElText('next-ach-reward','0'); }

    const bEl = document.getElementById('profile-banner'); if (bEl) bEl.style.backgroundImage = ACTIVE_BANNER_URL ? `url('${ACTIVE_BANNER_URL}')` : 'none';
    renderEffectParticles(document.getElementById('particle-effect-container'), ACTIVE_EFFECT_CSS);
    const badgeEl = document.getElementById('user-badge-img'); if (badgeEl) { if (ACTIVE_BADGE_URL) { badgeEl.src=ACTIVE_BADGE_URL; badgeEl.style.display='block'; } else badgeEl.style.display='none'; }
    const tCont = document.getElementById('user-title-container'), tEl = document.getElementById('user-active-title'); if (ACTIVE_TITLE_DATA) { tCont.style.display='block'; applyTitleToElement(tEl, ACTIVE_TITLE_DATA); } else tCont.style.display='none';
    await syncProfileToDB();
}

async function uploadAvatar(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (!supabaseClient) { showToast('Сервис недоступен'); return; }
    if (file.size > 5 * 1024 * 1024) { showToast('Файл слишком большой (макс. 5 МБ)'); event.target.value = ''; return; }
    if (!file.type.startsWith('image/')) { showToast('Пожалуйста, выберите изображение'); return; }
    showToast('Загрузка...');
    try {
        const fileExt = file.name.split('.').pop();
        const fileName = `${MY_ID}_${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabaseClient.storage.from('avatars').upload(fileName, file, { upsert: true });
        if (uploadError) throw uploadError;
        const { data: { publicUrl } } = supabaseClient.storage.from('avatars').getPublicUrl(fileName);
        const { error: dbError } = await supabaseClient.from('users').update({ avatar_url: publicUrl }).eq('id', MY_ID);
        if (dbError) throw dbError;
        let s = getStats(); s.avatar_url = publicUrl; saveStats(s);
        const avatarEl = document.getElementById('tg-avatar');
        if (avatarEl) avatarEl.innerHTML = `<img src="${publicUrl}" style="width:100%; height:100%; object-fit:cover;">`;
        showToast('Аватарка обновлена!');
    } catch (error) {
        console.error(error); showToast('Ошибка загрузки: ' + error.message);
    } finally { event.target.value = ''; }
}

function renderEffectParticles(container, effectClass) {
    if (!container) return;
    container.innerHTML = ''; container.className = 'effect-container';
    if (!effectClass) return;
    container.classList.add(effectClass);
    const count = effectClass === 'effect-matrix' ? 50 : 30;
    const animMap = { 'effect-sparks': 'riseUp', 'effect-sakura': 'fallDown', 'effect-stars': 'twinkle', 'effect-snow': 'snowFall', 'effect-bubbles': 'bubbleUp', 'effect-leaves': 'leafFall', 'effect-matrix': 'matrixFall', 'effect-fire': 'fireRise' };
    const animName = animMap[effectClass] || 'riseUp';
    for (let i = 0; i < count; i++) {
        const span = document.createElement('span');
        const size = effectClass === 'effect-matrix' ? 2 : Math.random() * 4 + 2;
        span.style.left = `${Math.random() * 100}%`; span.style.width = `${size}px`; span.style.height = effectClass === 'effect-matrix' ? '15px' : `${size}px`;
        span.style.animationName = animName; span.style.animationDuration = `${Math.random() * 3 + 2}s`; span.style.animationDelay = `${Math.random() * 5}s`;
        container.appendChild(span);
    }
}

// ==========================================
// 6. ПРЕДПРОСМОТР
// ==========================================
function startPreview(type, item) {
    if (isPreviewMode || !item) return;
    isPreviewMode = true; previewItem = { type, item };
    savedStats = JSON.parse(JSON.stringify(getStats()));
    savedStats._active_banner_url = ACTIVE_BANNER_URL; savedStats._active_title_data = ACTIVE_TITLE_DATA; savedStats._active_effect_css = ACTIVE_EFFECT_CSS; savedStats._active_badge_url = ACTIVE_BADGE_URL;
    if (type === 'banner') ACTIVE_BANNER_URL = safeUrl(item.image_url);
    else if (type === 'title') ACTIVE_TITLE_DATA = item;
    else if (type === 'effect') ACTIVE_EFFECT_CSS = item.css_class;
    else if (type === 'badge') ACTIVE_BADGE_URL = safeUrl(item.image_url);
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('screen-preview')?.classList.add('active');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    renderPreviewCard();
    const bar = document.getElementById('previewBar'); const btn = document.getElementById('preview-btn-buy');
    if (!bar || !btn) return;
    btn.textContent = item.price === 0 ? 'Получить' : `Купить и надеть · ${item.price}`;
    btn.style.opacity = getStats().coins < item.price ? '0.5' : '1';
    bar.classList.add('active');
}
function startPreviewById(type, cacheKey) {
    const item = window._previewCache[cacheKey];
    if (!item) return;
    startPreview(type, item);
}
function renderPreviewCard() {
    const stats = getStats();
    const bannerEl = document.getElementById('preview-banner');
    if (bannerEl) bannerEl.style.backgroundImage = ACTIVE_BANNER_URL ? `url('${ACTIVE_BANNER_URL}')` : 'none';
    const avatarEl = document.getElementById('preview-avatar');
    if (avatarEl) { if (stats.avatar_url || MY_PHOTO_URL) avatarEl.innerHTML = `<img src="${safeUrl(stats.avatar_url || MY_PHOTO_URL)}" style="width:100%; height:100%; object-fit:cover;">`; else avatarEl.innerHTML = `<span>${escapeHTML((MY_NAME || '?')[0].toUpperCase())}</span>`; }
    setElText('preview-name', MY_NAME || 'Гость');
    const badgeEl = document.getElementById('preview-badge-img');
    if (badgeEl) { if (ACTIVE_BADGE_URL) { badgeEl.src = ACTIVE_BADGE_URL; badgeEl.style.display = 'block'; } else { badgeEl.style.display = 'none'; } }
    const titleContainer = document.getElementById('preview-title-container'); const titleEl = document.getElementById('preview-active-title');
    if (titleContainer && titleEl) { if (ACTIVE_TITLE_DATA) { titleContainer.style.display = 'block'; applyTitleToElement(titleEl, ACTIVE_TITLE_DATA); } else { titleContainer.style.display = 'none'; } }
    setElText('preview-coins', stats.coins || 0);
    const currentLevel = Math.floor(stats.xp / 100) + 1;
    setElText('preview-level', currentLevel); setElText('preview-level-text', currentLevel); setElText('preview-rank', LEVEL_TITLES[Math.min(currentLevel - 1, LEVEL_TITLES.length - 1)] || 'Легенда'); setElText('preview-xp-current', stats.xp % 100); setElText('preview-xp-next', 100);
    setElWidth('preview-xp-bar', (stats.xp % 100) + '%');
    renderEffectParticles(document.getElementById('preview-particle-container'), ACTIVE_EFFECT_CSS);
}
function cancelPreview() {
    if (!isPreviewMode) return;
    if (savedStats) { ACTIVE_BANNER_URL = savedStats._active_banner_url || ''; ACTIVE_TITLE_DATA = savedStats._active_title_data || null; ACTIVE_EFFECT_CSS = savedStats._active_effect_css || ''; ACTIVE_BADGE_URL = savedStats._active_badge_url || ''; }
    isPreviewMode = false; previewItem = null; savedStats = null;
    document.getElementById('previewBar')?.classList.remove('active');
    switchTab('profile'); switchProfileTab('shop');
}
async function executePreview() {
    if (!isPreviewMode || !previewItem) return;
    const { type, item } = previewItem;
    const stats = getStats();
    if (stats.coins < item.price) { showToast('Недостаточно монет!'); return; }
    document.getElementById('previewBar')?.classList.remove('active');
    isPreviewMode = false; previewItem = null;
    if (type === 'banner') await buyBanner(item.id, item.price);
    else await buyItem(type, item.id, item.price);
    savedStats = null;
    switchTab('profile'); switchProfileTab('shop'); await loadProfileData();
}

// ==========================================
// 7. МАГАЗИН
// ==========================================
function switchShopTab(tabName, element) {
    currentShopTab = tabName;
    document.querySelectorAll('.shop-tab').forEach(el => el.classList.remove('active'));
    if (element) element.classList.add('active');
    renderShopTab(tabName);
}
function renderShopTab(tabName) {
    const container = document.getElementById('shop-items-container');
    if (!container) return;
    container.innerHTML = Skeletons.shopItems(4);
    if (tabName === 'banners') renderBannersInShop(container);
    else if (tabName === 'titles') renderTitlesInShop(container);
    else if (tabName === 'frames') renderFramesInShop(container);
    else if (tabName === 'effects') renderEffectsInShop(container);
    else if (tabName === 'badges') renderBadgesInShop(container);
}
async function renderBannersInShop(container) {
    let stats = getStats();
    if (!supabaseClient) { container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: #888;">Сервис недоступен</div>'; return; }
    try {
        const { data: banners, error: bErr } = await supabaseClient.from('banners').select('*');
        if (bErr) throw bErr;
        const { data: owned } = await supabaseClient.from('user_banners').select('banner_id').eq('user_id', MY_ID);
        const ownedIds = new Set((owned || []).map(o => o.banner_id));
        if (currentShopTab !== 'banners') return;
        let html = '';
        const rarities = [ { key: 'common', name: 'Обычные', color: '#ccc', class: 'common' }, { key: 'rare', name: 'Редкие', color: '#00d2ff', class: 'rare' }, { key: 'epic', name: 'Эпические', color: '#b44aff', class: 'epic' }, { key: 'legendary', name: 'Легендарные', color: '#ffd700', class: 'legendary' } ];
        rarities.forEach(rarity => {
            const list = (banners || []).filter(b => (b.rarity || 'common') === rarity.key);
            if (list.length === 0) return;
            html += `<div class="shop-category-header ${rarity.class}"><span style="color: ${rarity.color};">●</span> ${rarity.name}<span class="count">${list.length}</span></div>`;
            list.forEach(b => {
                const isActive = stats.active_banner === b.id;
                const isOwned = ownedIds.has(b.id);
                let btnHtml = isActive ? `<div style="font-size:12px; color:#2ecc71; font-weight:bold; margin-top:5px;">Установлен</div>` : isOwned ? `<div style="font-size:12px; color:#ffd700; font-weight:bold; margin-top:5px;">Надеть</div>` : `<div style="font-size:12px; color:#5b5bff; font-weight:bold; margin-top:5px;">${b.price === 0 ? 'Получить' : b.price + ''}</div>`;
                const key = cachePreviewItem(b);
                html += `<div class="shop-item" onclick="startPreviewById('banner', '${key}')"><div class="shop-img" style="background-image: url('${safeUrl(b.image_url)}')"></div><div class="shop-info"><div class="shop-name">${escapeHTML(b.name)}</div>${btnHtml}</div></div>`;
            });
        });
        container.innerHTML = html || '<div style="grid-column: 1/-1; text-align: center; color: #888;">Пока нет баннеров</div>';
    } catch(e) { console.error(e); if (currentShopTab === 'banners') container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: #f44;">Ошибка</div>'; }
}
async function renderTitlesInShop(container) {
    if (!supabaseClient) { container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: #888;">Сервис недоступен</div>'; return; }
    let stats = getStats();
    try {
        const { data: items } = await supabaseClient.from('titles').select('*');
        if (currentShopTab !== 'titles') return;
        let html = '';
        (items || []).forEach(t => {
            const isActive = stats.active_title === t.id;
            let btnHtml = isActive ? `<div style="font-size:12px; color:#2ecc71; font-weight:bold; margin-top:5px;">Активен</div>` : `<div style="font-size:12px; color:#5b5bff; font-weight:bold; margin-top:5px;">${t.price}</div>`;
            let titleHtml = t.is_animated ? `<div class="user-title-display animated-title" data-title="${escapeHTML(t.animation_key || 'gold')}" style="position:relative; font-size:11px; padding: 3px 10px;"><span class="title-text">${escapeHTML(t.name)}</span></div>` : `<div class="user-title-display" style="color:${escapeHTML(t.color)}; border-color:${escapeHTML(t.color)}; font-size:11px; padding: 3px 10px;">${escapeHTML(t.name)}</div>`;
            const key = cachePreviewItem(t);
            html += `<div class="shop-item" onclick="startPreviewById('title', '${key}')"><div class="shop-img" style="background: #111; display:flex; align-items:center; justify-content:center; padding: 10px; box-sizing: border-box; overflow: hidden;">${titleHtml}</div><div class="shop-info"><div class="shop-name">${escapeHTML(t.name)}${t.is_animated ? ' *' : ''}</div>${btnHtml}</div></div>`;
        });
        container.innerHTML = html || '<div style="grid-column: 1/-1; text-align: center; color: #888;">Пока нет титулов</div>';
    } catch(e) { console.error(e); }
}
async function renderFramesInShop(container) {
    if (!supabaseClient) { container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: #888;">Сервис недоступен</div>'; return; }
    try {
        const { data: items } = await supabaseClient.from('frames').select('*');
        if (currentShopTab !== 'frames') return;
        let html = '';
        (items || []).forEach(f => {
            const key = cachePreviewItem(f);
            html += `<div class="shop-item" onclick="startPreviewById('frame', '${key}')"><div class="shop-img" style="background-image: url('${safeUrl(f.image_url)}')"></div><div class="shop-info"><div class="shop-name">${escapeHTML(f.name)}</div><div style="font-size:12px; color:#5b5bff; font-weight:bold; margin-top:5px;">${f.price}</div></div></div>`;
        });
        container.innerHTML = html || '<div style="grid-column: 1/-1; text-align: center; color: #888;">Пока нет рамок</div>';
    } catch(e) { console.error(e); }
}
async function renderEffectsInShop(container) {
    if (!supabaseClient) { container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: #888;">Сервис недоступен</div>'; return; }
    let stats = getStats();
    try {
        const { data: items } = await supabaseClient.from('effects').select('*');
        if (currentShopTab !== 'effects') return;
        let html = '';
        (items || []).forEach(e => {
            const isActive = stats.active_effect === e.id;
            let btnHtml = isActive ? `<div style="font-size:12px; color:#2ecc71; font-weight:bold; margin-top:5px;">Активен</div>` : `<div style="font-size:12px; color:#5b5bff; font-weight:bold; margin-top:5px;">${e.price}</div>`;
            const key = cachePreviewItem(e);
            html += `<div class="shop-item" onclick="startPreviewById('effect', '${key}')"><div class="shop-img ${e.css_class}" style="background: #111; display:flex; align-items:center; justify-content:center;"><div class="avatar" style="width:40px; height:40px; font-size:12px; background:#333; border:1px solid #555;">AA</div></div><div class="shop-info"><div class="shop-name">${escapeHTML(e.name)}</div>${btnHtml}</div></div>`;
        });
        container.innerHTML = html || '<div style="grid-column: 1/-1; text-align: center; color: #888;">Пока нет эффектов</div>';
    } catch(e) { console.error(e); }
}
async function renderBadgesInShop(container) {
    if (!supabaseClient) { container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: #888;">Сервис недоступен</div>'; return; }
    let stats = getStats();
    try {
        const { data: items } = await supabaseClient.from('badges').select('*');
        if (currentShopTab !== 'badges') return;
        let html = '';
        const rarities = [ { key: 'common', name: 'Обычные', color: '#ccc', class: 'common' }, { key: 'rare', name: 'Редкие', color: '#00d2ff', class: 'rare' }, { key: 'epic', name: 'Эпические', color: '#b44aff', class: 'epic' }, { key: 'legendary', name: 'Легендарные', color: '#ffd700', class: 'legendary' } ];
        rarities.forEach(rarity => {
            const list = (items || []).filter(b => (b.rarity || 'common') === rarity.key);
            if (list.length === 0) return;
            html += `<div class="shop-category-header ${rarity.class}"><span style="color: ${rarity.color};">●</span> ${rarity.name}<span class="count">${list.length}</span></div>`;
            list.forEach(b => {
                const isActive = stats.active_badge === b.id;
                let btnHtml = isActive ? `<div style="font-size:12px; color:#2ecc71; font-weight:bold; margin-top:5px;">Активен</div>` : `<div style="font-size:12px; color:#5b5bff; font-weight:bold; margin-top:5px;">${b.price}</div>`;
                const key = cachePreviewItem(b);
                html += `<div class="shop-item" onclick="startPreviewById('badge', '${key}')"><div class="shop-img" style="background: #222; display:flex; align-items:center; justify-content:center;"><img src="${safeUrl(b.image_url)}" style="width:50px; height:50px; object-fit:contain;"></div><div class="shop-info"><div class="shop-name">${escapeHTML(b.name)}</div>${btnHtml}</div></div>`;
            });
        });
        container.innerHTML = html || '<div style="grid-column: 1/-1; text-align: center; color: #888;">Пока нет значков</div>';
    } catch(e) { console.error(e); }
}

async function buyItem(type, itemId, price) {
    let stats = getStats();
    if (stats.coins < price) { showToast('Недостаточно монет!'); return; }
    if (!supabaseClient) return;
    try {
        const { data: existing } = await supabaseClient.from('user_inventory').select('id').eq('user_id', MY_ID).eq('item_type', type).eq('item_id', itemId).limit(1);
        if (existing && existing.length > 0) {
            if (type === 'title') await applyTitle(itemId); else if (type === 'effect') await applyEffect(itemId); else if (type === 'badge') await applyBadge(itemId); else if (type === 'frame') await applyFrame(itemId);
            return;
        }
    } catch(e) { console.error(e); }
    stats.coins -= price; saveStats(stats);
    try {
        const { error } = await supabaseClient.from('user_inventory').insert({ user_id: MY_ID, item_type: type, item_id: itemId });
        if (error) throw error;
        await syncProfileToDB(true);
        showToast('Покупка успешна!');
        if (type === 'title') await applyTitle(itemId); else if (type === 'effect') await applyEffect(itemId); else if (type === 'badge') await applyBadge(itemId); else if (type === 'frame') await applyFrame(itemId);
        else { await loadProfileData(); renderShopTab(type + 's'); }
    } catch(e) {
        console.error(e); stats.coins += price; saveStats(stats);
        showToast('Ошибка покупки — монеты возвращены'); await syncProfileToDB(true);
    }
}
async function applyTitle(titleId) { if (!supabaseClient) return; let stats = getStats(); try { await supabaseClient.from('users').update({ active_title: titleId }).eq('id', MY_ID); stats.active_title = titleId; saveStats(stats); showToast('Титул надет!'); await loadProfileData(); renderShopTab('titles'); } catch(e) {} }
async function resetTitle() { if (!supabaseClient) return; let stats = getStats(); try { await supabaseClient.from('users').update({ active_title: null }).eq('id', MY_ID); stats.active_title = null; saveStats(stats); ACTIVE_TITLE_DATA = null; showToast('Титул снят'); await loadProfileData(); } catch(e) {} }
async function applyEffect(effectId) { if (!supabaseClient) return; let stats = getStats(); try { await supabaseClient.from('users').update({ active_effect: effectId }).eq('id', MY_ID); stats.active_effect = effectId; saveStats(stats); showToast('Эффект надет!'); await loadProfileData(); renderShopTab('effects'); } catch(e) {} }
async function resetEffect() { if (!supabaseClient) return; let stats = getStats(); try { await supabaseClient.from('users').update({ active_effect: null }).eq('id', MY_ID); stats.active_effect = null; saveStats(stats); ACTIVE_EFFECT_CSS = ''; showToast('Эффект снят'); await loadProfileData(); } catch(e) {} }
async function applyBadge(badgeId) { if (!supabaseClient) return; let stats = getStats(); try { await supabaseClient.from('users').update({ active_badge: badgeId }).eq('id', MY_ID); stats.active_badge = badgeId; saveStats(stats); showToast('Значок надет!'); await loadProfileData(); renderShopTab('badges'); } catch(e) {} }
async function resetBadge() { if (!supabaseClient) return; let stats = getStats(); try { await supabaseClient.from('users').update({ active_badge: null }).eq('id', MY_ID); stats.active_badge = null; saveStats(stats); ACTIVE_BADGE_URL = ''; showToast('Значок снят'); await loadProfileData(); } catch(e) {} }
async function applyFrame(frameId) { if (!supabaseClient) return; let stats = getStats(); try { await supabaseClient.from('users').update({ active_frame: frameId }).eq('id', MY_ID); stats.active_frame = frameId; saveStats(stats); showToast('Рамка надета!'); await loadProfileData(); renderShopTab('frames'); } catch(e) {} }
async function buyBanner(bannerId, price) {
    let stats = getStats();
    if (stats.coins < price) { showToast('Недостаточно монет!'); return; }
    if (!supabaseClient) return;
    try {
        const { data: existing } = await supabaseClient.from('user_banners').select('id').eq('user_id', MY_ID).eq('banner_id', bannerId).limit(1);
        if (existing && existing.length > 0) {
            stats.active_banner = bannerId;
            const { data: b } = await supabaseClient.from('banners').select('image_url').eq('id', bannerId).single();
            if (b) { stats.active_banner_url = safeUrl(b.image_url); ACTIVE_BANNER_URL = stats.active_banner_url; }
            saveStats(stats); await syncProfileToDB(true);
            showToast('Баннер надет!'); await loadProfileData(); renderShopTab('banners'); return;
        }
    } catch(e) { console.error(e); }
    stats.coins -= price; stats.hasPurchasedBanner = true; saveStats(stats);
    try {
        const { error } = await supabaseClient.from('user_banners').insert({ user_id: MY_ID, banner_id: bannerId });
        if (error) throw error;
        stats.active_banner = bannerId;
        const { data: b } = await supabaseClient.from('banners').select('image_url').eq('id', bannerId).single();
        if (b) { stats.active_banner_url = safeUrl(b.image_url); ACTIVE_BANNER_URL = stats.active_banner_url; }
        saveStats(stats); checkAchievements(stats); await syncProfileToDB(true);
        showToast('Баннер получен!'); await loadProfileData(); renderShopTab('banners');
    } catch(e) {
        console.error(e); stats.coins += price; stats.hasPurchasedBanner = false; saveStats(stats);
        showToast('Ошибка — монеты возвращены'); await syncProfileToDB(true);
    }
}
async function resetBanner() {
    let stats = getStats();
    stats.active_banner = null; stats.active_banner_url = '';
    saveStats(stats); await syncProfileToDB(true);
    ACTIVE_BANNER_URL = '';
    const bannerEl = document.getElementById('profile-banner');
    if (bannerEl) bannerEl.style.backgroundImage = 'none';
    showToast('Баннер снят');
}

// ==========================================
// 8. ДРУЗЬЯ
// ==========================================
async function loadFriends() {
    const listContainer = document.getElementById('friends-list-container');
    if (!listContainer || !supabaseClient || !MY_ID) return;
    listContainer.innerHTML = Skeletons.friends(3);
    try {
        const { data: incoming } = await supabaseClient.from('friends').select('user_id').eq('friend_id', MY_ID).eq('status', 'pending');
        const { data: accepted } = await supabaseClient.from('friends').select('friend_id').eq('user_id', MY_ID).eq('status', 'accepted');
        let html = '';
        if (incoming && incoming.length > 0) {
            const inIds = incoming.map(f => f.user_id);
            const { data: inUsers } = await supabaseClient.from('users').select('*').in('id', inIds);
            if (inUsers && inUsers.length > 0) {
                html += '<h3 style="padding: 0 20px 10px; font-size: 16px; color: #ffd700;">Заявки в друзья</h3>';
                inUsers.forEach(u => {
                    const nameChar = u.name && u.name[0] ? escapeHTML(u.name[0].toUpperCase()) : '?';
                    const avatarUrl = u.avatar_url ? safeUrl(u.avatar_url) : '';
                    html += `<div class="friend-card" style="background: rgba(255,215,0,0.05); border-color: rgba(255,215,0,0.2);"><div class="friend-avatar">${avatarUrl ? `<img src="${avatarUrl}" onerror="this.style.display='none'; this.parentElement.innerHTML='${nameChar}';">` : nameChar}</div><div class="friend-info"><h3>${escapeHTML(u.name)}</h3><p>ID: ${escapeHTML(u.public_id || '...')}</p></div><div style="display: flex; gap: 5px; margin-left: auto;"><button onclick="acceptFriend('${escapeHTML(String(u.id))}')" style="background: #2ecc71; color: #fff; border: none; padding: 6px 10px; border-radius: 8px; font-weight: bold; cursor: pointer;"><svg class="icon-inline" style="stroke:#fff;width:14px;height:14px;"><use href="#oa-check"></use></svg></button><button onclick="rejectFriend('${escapeHTML(String(u.id))}')" style="background: #e74c3c; color: #fff; border: none; padding: 6px 10px; border-radius: 8px; font-weight: bold; cursor: pointer;"><svg class="icon-inline" style="stroke:#fff;width:14px;height:14px;"><use href="#oa-close"></use></svg></button></div></div>`;
                });
            }
        }
        html += '<h3 style="padding: 10px 20px 10px; font-size: 16px; color: #fff;">Мои друзья</h3>';
        if (!accepted || accepted.length === 0) html += '<div style="padding: 0 20px; color: #888; font-size: 14px;">Пока никого нет</div>';
        else {
            const accIds = accepted.map(f => f.friend_id);
            const { data: accUsers } = await supabaseClient.from('users').select('*').in('id', accIds);
            if (accUsers && accUsers.length > 0) {
                accUsers.forEach(friend => {
                    const nameChar = friend.name && friend.name[0] ? escapeHTML(friend.name[0].toUpperCase()) : '?';
                    const avatarUrl = friend.avatar_url ? safeUrl(friend.avatar_url) : '';
                    html += `<div class="friend-card" onclick="openFriendProfile('${escapeHTML(String(friend.id))}', '${escapeHTML(friend.name).replace(/'/g, "\\'")}')"><div class="friend-avatar">${avatarUrl ? `<img src="${avatarUrl}" onerror="this.style.display='none'; this.parentElement.innerHTML='${nameChar}';">` : nameChar}</div><div class="friend-info"><h3>${escapeHTML(friend.name)}</h3><p>ID: ${escapeHTML(friend.public_id || '...')} • Ур. ${Math.floor((friend.xp||0) / 100) + 1}</p></div><div style="margin-left: auto; color: #5b5bff; font-size: 20px;">›</div></div>`;
                });
            }
        }
        listContainer.innerHTML = html;
    } catch (e) { listContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: #ff4444;">Ошибка</div>'; }
}
async function searchFriend() {
    const searchId = document.getElementById('friend-search-input').value.trim();
    const resultContainer = document.getElementById('search-result-container');
    if (!searchId) return;
    if (!supabaseClient) return;
    if (String(searchId) === String(MY_PUBLIC_ID)) { resultContainer.innerHTML = '<div style="color: #ffd700; text-align: center; font-size: 14px;">Это ваш ID</div>'; return; }
    resultContainer.innerHTML = '<div style="color: #888; text-align: center; font-size: 14px;">Поиск...</div>';
    try {
        const { data: userData } = await supabaseClient.from('users').select('*').eq('public_id', searchId).single();
        if (!userData) { resultContainer.innerHTML = '<div style="color: #ff4444; text-align: center; font-size: 14px;">Не найден</div>'; return; }
        const nameChar = userData.name && userData.name[0] ? escapeHTML(userData.name[0].toUpperCase()) : '?';
        const avatarUrl = userData.avatar_url ? safeUrl(userData.avatar_url) : '';
        resultContainer.innerHTML = `<div class="friend-card" style="margin: 0; background: rgba(91,91,255,0.1); border-color: #5b5bff;"><div class="friend-avatar">${avatarUrl ? `<img src="${avatarUrl}">` : nameChar}</div><div class="friend-info"><h3>${escapeHTML(userData.name)}</h3><p>ID: ${escapeHTML(userData.public_id || '...')}</p></div><button onclick="sendFriendRequest('${escapeHTML(String(userData.id))}')" style="background: #5b5bff; color: #fff; border: none; padding: 8px 15px; border-radius: 10px; font-weight: bold; margin-left: auto; cursor: pointer;">Заявка</button></div>`;
    } catch (e) { resultContainer.innerHTML = '<div style="color: #ff4444; text-align: center; font-size: 14px;">Ошибка</div>'; }
}
async function sendFriendRequest(friendId) {
    if (!supabaseClient) return;
    try {
        const { data: existing } = await supabaseClient.from('friends').select('id').eq('user_id', MY_ID).eq('friend_id', friendId).limit(1);
        if (existing && existing.length > 0) { showToast('Заявка уже отправлена'); return; }
        const { error } = await supabaseClient.from('friends').insert({ user_id: MY_ID, friend_id: friendId, status: 'pending' });
        if (error) throw error;
        document.getElementById('search-result-container').innerHTML = '';
        document.getElementById('friend-search-input').value = '';
        showToast('Заявка отправлена!'); loadFriends();
    } catch(e) { console.error(e); showToast('Ошибка отправки'); }
}
async function acceptFriend(userId) {
    if (!supabaseClient) return;
    try {
        await supabaseClient.from('friends').update({ status: 'accepted' }).eq('user_id', userId).eq('friend_id', MY_ID);
        await supabaseClient.from('friends').insert({ user_id: MY_ID, friend_id: userId, status: 'accepted' });
        loadFriends();
    } catch(e) { console.error(e); showToast('Ошибка'); }
}
async function rejectFriend(userId) {
    if (!supabaseClient) return;
    try { await supabaseClient.from('friends').delete().eq('user_id', userId).eq('friend_id', MY_ID); loadFriends(); } catch(e) { console.error(e); }
}
async function removeFriend(friendId) {
    if (!supabaseClient) return;
    try {
        const { error } = await supabaseClient.from('friends').delete().or(`and(user_id.eq.${MY_ID},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${MY_ID})`);
        if (error) throw error;
        switchTab('friends');
    } catch(e) { console.error(e); showToast('Ошибка удаления'); }
}
async function openFriendProfile(id, name = '') {
    if (!supabaseClient) return;
    switchTab('friend-profile');
    const container = document.getElementById('friend-profile-content');
    container.innerHTML = '<div style="text-align: center; padding: 40px; color: #888;">Загрузка...</div>';
    try {
        const { data: friend, error } = await supabaseClient.from('users').select('*').eq('id', id).single();
        if (error || !friend) throw new Error('Не найден');
        const lvl = Math.floor((friend.xp || 0) / 100) + 1;
        const rank = LEVEL_TITLES[Math.min(lvl - 1, LEVEL_TITLES.length - 1)] || 'Легенда';
        let friendAchCount = 0;
        let achSource = friend.unlocked_achievements;
        if (id === MY_ID) friendAchCount = (getStats().unlockedAchievements || []).length;
        else if (achSource) { try { let p = typeof achSource === 'string' ? JSON.parse(achSource) : achSource; if (Array.isArray(p)) friendAchCount = p.length; } catch(e) {} }
        const totalAchCount = ACHIEVEMENTS.length;
        const achPoints = friendAchCount * 10;
        let lastWatchedHtml = '';
        if (friend.last_watched) {
            const animeData = await API.getDetails(friend.last_watched);
            if (animeData) lastWatchedHtml = `<div style="margin-top: 15px; padding: 15px; background: rgba(91,91,255,0.1); border-radius: 12px; border: 1px solid rgba(91,91,255,0.2); cursor: pointer;" onclick="openAnimeDetail('${escapeHTML(animeData.id)}', 'friends')"><div style="font-size: 12px; color: #888; margin-bottom: 8px;">Последнее аниме:</div><div style="display: flex; gap: 10px; align-items: center;"><img src="${safeUrl(animeData.images.jpg.image_url)}" style="width: 40px; height: 55px; border-radius: 6px; object-fit: cover;"><div style="font-size: 14px; font-weight: bold; color: #fff;">${escapeHTML(animeData.title_ru)}</div></div></div>`;
        }
        const avatarUrl = friend.avatar_url ? safeUrl(friend.avatar_url) : '';
        const nameChar = friend.name && friend.name[0] ? escapeHTML(friend.name[0].toUpperCase()) : '?';
        const avatarHtml = avatarUrl ? `<img src="${avatarUrl}" style="width: 100%; height: 100%; object-fit: cover;">` : nameChar;
        let friendBanner = '';
        if (friend.active_banner) { const { data: b } = await supabaseClient.from('banners').select('image_url').eq('id', friend.active_banner).single(); if (b) friendBanner = `style="background-image: url('${safeUrl(b.image_url)}');"`; }
        let friendTitleHtml = '';
        if (friend.active_title) { const { data: t } = await supabaseClient.from('titles').select('*').eq('id', friend.active_title).single(); if (t) { if (t.is_animated) friendTitleHtml = `<div class="user-title-display animated-title" data-title="${escapeHTML(t.animation_key || 'gold')}"><span class="title-text">${escapeHTML(t.name)}</span></div>`; else friendTitleHtml = `<div class="user-title-display" style="color: ${escapeHTML(t.color)}; border-color: ${escapeHTML(t.color)};">${escapeHTML(t.name)}</div>`; } }
        let friendEffectClass = '';
        if (friend.active_effect) { const { data: e } = await supabaseClient.from('effects').select('css_class').eq('id', friend.active_effect).single(); if (e) friendEffectClass = e.css_class; }
        let friendBadgeHtml = '';
        if (friend.active_badge) { const { data: bd } = await supabaseClient.from('badges').select('image_url').eq('id', friend.active_badge).single(); if (bd) friendBadgeHtml = `<img src="${safeUrl(bd.image_url)}" class="user-badge-icon" alt="badge">`; }
        container.innerHTML = `
            <div class="user-card-wrapper">
                <div class="user-card-top" ${friendBanner}>
                    <div class="effect-container ${friendEffectClass}" id="friend-particle-container"></div>
                    <div class="user-card-top-content">
                        <div class="avatar-container"><div class="avatar" style="background: linear-gradient(135deg, #5b5bff, #b44aff); display: flex; align-items: center; justify-content: center; font-size: 32px; font-weight: bold; color: #fff; overflow: hidden;">${avatarHtml}</div></div>
                        <div class="user-details">
                            <div class="user-name-row"><h2>${escapeHTML(friend.name)}</h2>${friendBadgeHtml}</div>
                            ${friendTitleHtml}
                            <div class="id-container"><span style="color: #ccc; font-size: 12px;">ID:</span><span style="color: #fff; font-weight: bold; font-size: 14px;">${escapeHTML(friend.public_id || '...')}</span></div>
                        </div>
                    </div>
                </div>
                <div class="user-card-bottom">
                    <div class="level-row">
                        <div class="level-badge"><img src="level_icon.png" class="level-badge-img" alt="level" onerror="this.style.display='none'"><span class="level-number">${lvl}</span></div>
                        <div class="level-info">
                            <div class="level-title">УРОВЕНЬ ${lvl} <span class="rank">${rank}</span></div>
                            <div class="xp-bar-container"><div class="xp-bar-fill" style="width: ${(friend.xp || 0) % 100}%;"></div></div>
                            <div class="xp-text">${(friend.xp || 0) % 100} / 100 XP</div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="achievements-card" style="margin-top: 15px; cursor: default;">
                <div class="ach-header">
                    <div class="ach-icon-big"><img src="achievements_main.png" style="width: 100%; height: 100%; object-fit: contain;" onerror="this.style.display='none'; this.parentElement.innerHTML='<svg class=\'icon-inline\' style=\'color:#ffd700;width:60px;height:60px;\'><use href=\'#oa-achievement\'></use></svg>';"></div>
                    <div class="ach-info"><h3>ДОСТИЖЕНИЯ</h3><p>${achPoints} очков</p></div>
                    <div class="ach-total">${friendAchCount}/${totalAchCount}</div>
                </div>
                <div class="ach-progress-wrap"><div class="ach-progress-bar" style="width: ${(friendAchCount / totalAchCount) * 100}%;"></div></div>
            </div>
            ${lastWatchedHtml}
            <button onclick="removeFriend('${escapeHTML(String(friend.id))}')" style="width: 100%; margin-top: 20px; padding: 14px; border-radius: 14px; border: 1px solid rgba(255,45,120,0.3); background: rgba(255,45,120,0.1); color: #ff2d78; font-weight: bold; font-size: 15px; cursor: pointer;">Удалить из друзей</button>`;
        setTimeout(() => { renderEffectParticles(document.getElementById('friend-particle-container'), friendEffectClass); }, 100);
    } catch (e) { console.error(e); container.innerHTML = '<div style="text-align: center; padding: 40px; color: #ff4444;">Ошибка</div>'; }
}

// ==========================================
// 9. ПЛЕЕР
// ==========================================
function startWatching(anime) { currentAnimeForPlayer = anime; switchTab('voice'); }
function renderVoiceSelection() { const c = document.getElementById('voice-list'); let h = ''; VOICES.forEach(v => { h += `<div class="ripple-btn" onclick="selectVoice('${v.id}', '${escapeHTML(v.name)}')" style="background: #14141f; border: 1px solid rgba(255,255,255,0.1); padding: 16px; border-radius: 14px; display: flex; align-items: center; gap: 15px; cursor: pointer;"><div style="font-size: 24px;">${v.icon}</div><div style="font-size: 16px; font-weight: 600; color: #fff;">${escapeHTML(v.name)}</div></div>`; }); if (c) c.innerHTML = h; }
function selectVoice(id, name) { selectedVoice = name; switchTab('player'); }
function renderPlayerSelection() { const c = document.getElementById('player-list'); let h = ''; PLAYERS.forEach(p => { h += `<div class="ripple-btn" onclick="selectPlayer('${p.id}', '${escapeHTML(p.name)}')" style="background: #14141f; border: 1px solid rgba(255,255,255,0.1); padding: 16px; border-radius: 14px; display: flex; align-items: center; gap: 15px; cursor: pointer;"><div style="font-size: 24px;">${p.icon}</div><div style="font-size: 16px; font-weight: 600; color: #fff;">${escapeHTML(p.name)}</div></div>`; }); if (c) c.innerHTML = h; }
function selectPlayer(id, name) { selectedPlayer = name; switchTab('episodes'); }
function renderEpisodesSelection() {
    const vt = document.getElementById('selected-voice-text'); if (vt) vt.textContent = selectedVoice;
    const pt = document.getElementById('selected-player-text'); if (pt) pt.textContent = selectedPlayer;
    const c = document.getElementById('episodes-list');
    if (!c || !currentAnimeForPlayer) return;
    let total = currentAnimeForPlayer.episodes || 12; if (total > 50) total = 50;
    let h = '';
    for (let i = 1; i <= total; i++) h += `<div class="ripple-btn" onclick="playEpisode(${i})" style="background: #1a1a20; border: 1px solid rgba(255,255,255,0.1); padding: 15px; border-radius: 12px; text-align: center; font-size: 16px; font-weight: bold; color: #fff; cursor: pointer;">${i}</div>`;
    c.innerHTML = h;
}
function playEpisode(epNum) {
    let stats = getStats();
    stats.episodesWatched += 1; stats.minutesWatched += 24;
    saveStats(stats); checkAchievements(stats); addXP(5); syncProfileToDB(true);
    if (tg && tg.showAlert) tg.showAlert(`Просмотр:\n${currentAnimeForPlayer.title_ru}\n${selectedVoice}\n${selectedPlayer}\nСерия: ${epNum}`);
    else showToast(`Серия ${epNum} (плеер в разработке)`);
    currentAnimeForPlayer = null; switchTab('home');
}

// ==========================================
// 10. КАТАЛОГ / ДЕТАЛИ / КОММЕНТАРИИ
// ==========================================
function initCatalogFilters() {
    const gc = document.getElementById('genre-filters');
    if (!gc) return;
    let h = `<div class="genre-pill ripple-btn active" onclick="setGenreFilter('', this)"><div class="dot"></div>Все</div>`;
    GENRES.forEach(g => { h += `<div class="genre-pill ripple-btn" onclick="setGenreFilter('${escapeHTML(g.name)}', this)">${escapeHTML(g.name)}</div>`; });
    gc.innerHTML = h;
}
function setGenreFilter(genreName, btn) { currentFilters.genre = genreName; document.querySelectorAll('#genre-filters .genre-pill').forEach(el => el.classList.remove('active')); if (btn) btn.classList.add('active'); if (genreName === '' && btn) btn.innerHTML = '<div class="dot"></div>Все'; loadCatalog(true); }
function searchAnime() { clearTimeout(searchDebounceTimer); searchDebounceTimer = setTimeout(() => { currentFilters.search = document.getElementById('search-input').value.trim(); loadCatalog(true); }, 500); }
function openFilterModal(type) {
    const modal = document.getElementById('filterModal'); const title = document.getElementById('filter-modal-title'); const container = document.getElementById('filter-options-container');
    let options = [], currentVal = currentFilters[type];
    if (type === 'year') { options = YEARS; title.textContent = 'Год выхода'; }
    if (type === 'status') { options = STATUSES; title.textContent = 'Статус'; }
    if (type === 'sort') { options = SORTS; title.textContent = 'Сортировка'; }
    let h = `<button class="filter-option-btn ${currentVal === '' ? 'active' : ''}" onclick="applyFilter('${type}', '')">Любой</button>`;
    options.forEach(o => { h += `<button class="filter-option-btn ${currentVal === o.id ? 'active' : ''}" onclick="applyFilter('${type}', '${o.id}')">${escapeHTML(o.name)}</button>`; });
    container.innerHTML = h; modal.classList.add('active');
}
function applyFilter(type, value) {
    currentFilters[type] = value; closeModal('filterModal');
    const btnId = type === 'year' ? 'filter-btn-year' : type === 'status' ? 'filter-btn-status' : 'filter-btn-sort';
    const btn = document.getElementById(btnId);
    let name = 'Любой';
    if (value) { const list = type === 'year' ? YEARS : type === 'status' ? STATUSES : SORTS; name = list.find(o => o.id === value)?.name || 'Любой'; }
    else name = type === 'year' ? 'Год' : type === 'status' ? 'Статус' : 'Сортировка';
    if (btn) btn.innerHTML = `${name} ⌄`;
    loadCatalog(true);
}
async function loadCatalog(reset = false) {
    if (isCatalogLoading) return;
    isCatalogLoading = true;
    const myVersion = ++catalogRequestVersion;
    const grid = document.getElementById('catalog-grid'); const lm = document.getElementById('load-more-btn');
    if (!grid) { isCatalogLoading = false; return; }
    if (reset) { grid.innerHTML = Skeletons.cards(6); hasMoreCatalog = true; catalogPage = 1; }
    try {
        const items = await API.getCatalog(catalogPage, 30, currentFilters);
        if (myVersion !== catalogRequestVersion) return;
        if (reset) grid.innerHTML = '';
        if (!items || items.length === 0) {
            if (reset) grid.innerHTML = '<div class="loading-text">Ничего не найдено</div>';
            hasMoreCatalog = false; if (lm) lm.style.display = 'none'; return;
        }
        items.forEach(anime => {
            const title = escapeHTML(anime.title_ru);
            const img = safeUrl(anime.images.jpg.image_url);
            const score = anime.score ? Number(anime.score).toFixed(1) : '?';
            grid.insertAdjacentHTML('beforeend', `<div class="catalog-card fade-in" onclick="openAnimeDetail('${escapeHTML(anime.id)}', 'catalog')"><img class="catalog-card-img" src="${img}" loading="lazy"><div style="position:absolute;top:8px;right:8px;background:rgba(0,0,0,0.7);padding:2px 6px;border-radius:6px;font-size:10px;color:#ffd700;font-weight:bold;display:flex;align-items:center;gap:2px;"><svg class="icon-star" style="width:10px;height:10px;"><use href="#oa-star"></use></svg> ${score}</div><div class="catalog-card-title">${title}</div></div>`);
        });
        hasMoreCatalog = items.length >= 30;
        if (lm) lm.style.display = hasMoreCatalog ? 'inline-block' : 'none';
    } catch (e) { console.error(e); if (reset && myVersion === catalogRequestVersion) grid.innerHTML = '<div class="loading-text" style="color:#ff4444;">Ошибка</div>'; if (lm) lm.style.display = 'none'; }
    finally { isCatalogLoading = false; }
}
function loadMoreCatalog() { if (!hasMoreCatalog || isCatalogLoading) return; catalogPage++; loadCatalog(false); }

async function openAnimeDetail(id, fromScreen = 'catalog') {
    previousScreen = fromScreen; switchTab('detail');
    const container = document.getElementById('detail-content');
    container.innerHTML = '<div style="text-align: center; padding: 40px; color: #888;">Загрузка...</div>';
    try {
        const anime = await API.getDetails(id);
        if (!anime) throw new Error('Not found');
        let userRating = 0;
        let comments = [];
        if (supabaseClient && MY_ID) {
            try {
                const { data: listItem } = await supabaseClient.from('user_lists').select('rating').eq('user_id', MY_ID).eq('anime_id', id).single();
                if (listItem && listItem.rating) userRating = listItem.rating;
                const { data: cmts } = await supabaseClient.from('anime_comments').select('*').eq('anime_id', id).order('created_at', { ascending: false });
                comments = cmts || [];
            } catch(e) { console.error(e); }
        }
        
        const title = escapeHTML(anime.title_ru);
        const titleRaw = escapeHTML(anime.title_raw || anime.title_ru);
        const desc = escapeHTML(anime.description);
        const score = anime.score ? Number(anime.score).toFixed(1) : '?';
        const poster = safeUrl(anime.images.jpg.image_url);

        const stats = getStats();
        const favEntry = (stats.favedAnime || []).find(a => a.id === anime.id);
        const isFaved = !!favEntry;
        
        window._animeCache = window._animeCache || {};
        window._animeCache[anime.id] = anime;

        // Генерация кадров
        let screenshotsHtml = '';
        let hasScreenshots = false;
        if (anime.trailerId) {
            const ytFrames = [
                `https://img.youtube.com/vi/${anime.trailerId}/maxresdefault.jpg`,
                `https://img.youtube.com/vi/${anime.trailerId}/sddefault.jpg`,
                `https://img.youtube.com/vi/${anime.trailerId}/hqdefault.jpg`,
                `https://img.youtube.com/vi/${anime.trailerId}/mqdefault.jpg`
            ];
            hasScreenshots = true;
            screenshotsHtml = ytFrames.map((url, i) => `
                <div style="scroll-snap-align: start; flex: 0 0 75%; aspect-ratio: 16/9; border-radius: 12px; overflow: hidden; background: #222; border: 1px solid rgba(255,255,255,0.1); position: relative;">
                    <img src="${url}" loading="lazy" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.parentElement.style.display='none'">
                    ${i === 0 ? `<div style="position: absolute; inset: 0; background: rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center;"><svg style="width: 40px; height: 40px; fill: #fff; stroke: none; filter: drop-shadow(0 2px 5px rgba(0,0,0,0.8));"><use href="#oa-play"></use></svg></div>` : ''}
                </div>
            `).join('');
        }

        const isUpcoming = anime.status === 'Анонс';
        const watchBtnHtml = isUpcoming 
            ? `<button class="btn-primary" style="background: #2a2a3e; color: #888; box-shadow: none; cursor: not-allowed;" disabled><svg class="icon-inline" style="stroke:#888;fill:#888;width:20px;height:20px;margin-right:8px;"><use href="#oa-clock"></use></svg> Скоро</button>`
            : `<button class="btn-primary ripple-btn" onclick="startWatching(window._animeCache['${escapeHTML(anime.id)}'])" style="padding: 18px; font-size: 18px; display:flex;align-items:center;justify-content:center;gap:8px; border-radius: 14px;"><svg class="icon-inline" style="stroke:#fff;fill:#fff;width:22px;height:22px;"><use href="#oa-play"></use></svg> Смотреть</button>`;

        let starsHtml = '';
        for (let i = 1; i <= 5; i++) { 
            const active = i <= userRating ? 'color: #ffd700;' : 'color: #444;'; 
            starsHtml += `<span onclick="rateAnime('${escapeHTML(anime.id)}', ${i})" style="font-size: 32px; cursor: pointer; ${active} display:inline-block; transition: transform 0.1s;" onpointerdown="this.style.transform='scale(0.9)'" onpointerup="this.style.transform='scale(1)'" onpointerleave="this.style.transform='scale(1)'">★</span>`; 
        }

        let commentsHtml = '';
        if (comments && comments.length > 0) {
            comments.forEach(c => {
                const aUrl = c.user_avatar ? safeUrl(c.user_avatar) : '';
                const nameChar = c.user_name && c.user_name[0] ? escapeHTML(c.user_name[0].toUpperCase()) : '?';
                const av = aUrl ? `<img src="${aUrl}" style="width: 100%; height: 100%; object-fit: cover;">` : nameChar;
                const date = new Date(c.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
                const clickAttr = c.user_id ? `onclick="openUserFromComments('${escapeHTML(String(c.user_id))}')"` : '';
                const cursorStyle = c.user_id ? 'cursor: pointer;' : '';
                commentsHtml += `
                    <div style="display: flex; gap: 10px; margin-bottom: 15px; ${cursorStyle} transition: transform 0.15s ease;" ${clickAttr} onpointerdown="${c.user_id ? "this.style.transform='scale(0.98)'" : ''}" onpointerup="${c.user_id ? "this.style.transform='scale(1)'" : ''}" onpointerleave="${c.user_id ? "this.style.transform='scale(1)'" : ''}">
                        <div class="friend-avatar" style="width: 36px; height: 36px; flex-shrink: 0; font-size: 14px;">${av}</div>
                        <div style="flex: 1; background: rgba(255,255,255,0.05); padding: 10px; border-radius: 12px;">
                            <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                                <span style="font-size: 13px; font-weight: bold; color: #fff;">${escapeHTML(c.user_name)}</span>
                                <span style="font-size: 11px; color: #888;">${date}</span>
                            </div>
                            <p style="font-size: 13px; color: #ccc;">${escapeHTML(c.text)}</p>
                        </div>
                    </div>`;
            });
        } else commentsHtml = '<div style="font-size: 13px; color: #888; text-align: center; padding: 10px;">Пока нет комментариев</div>';

        container.innerHTML = `
        <div class="fade-in" style="position: relative;">
            <div style="position: absolute; top: -20px; left: -20px; width: calc(100% + 40px); height: 350px; z-index: -1; overflow: hidden;">
                <img src="${poster}" style="width: 100%; height: 100%; object-fit: cover; object-position: center top; opacity: 0.5; mask-image: linear-gradient(to bottom, black 10%, transparent 100%); -webkit-mask-image: linear-gradient(to bottom, black 10%, transparent 100%);">
                <div style="position: absolute; inset: 0; background: linear-gradient(to bottom, transparent 40%, var(--bg) 95%);"></div>
            </div>

            <div style="padding-top: 100px;">
                <div style="display: flex; gap: 16px; margin-bottom: 25px; align-items: flex-end;">
                    <img class="detail-poster" src="${poster}" style="width: 110px; border-radius: 12px; border: 2px solid rgba(255,255,255,0.1); box-shadow: 0 10px 30px rgba(0,0,0,0.5); object-fit: cover; aspect-ratio: 2/3; flex-shrink: 0;">
                    <div style="flex: 1; min-width: 0; padding-bottom: 2px;">
                        <h1 style="font-size: 20px; font-weight: 800; line-height: 1.15; margin-bottom: 6px; color: #fff; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;">${title}</h1>
                        <p style="font-size: 12px; color: #aaa; margin-bottom: 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${titleRaw} (${anime.year})</p>
                        
                        <div style="display: flex; align-items: center; gap: 6px; font-size: 14px; font-weight: 700; color: #fff;">
                            <svg style="width:16px;height:16px;color:#ffd700;fill:#ffd700;stroke:none;"><use href="#oa-star"></use></svg>
                            ${score} <span style="color: #666; font-weight: 500; font-size: 13px;">${anime.year}</span>
                        </div>
                    </div>
                </div>

                <div style="display: flex; gap: 12px; margin-bottom: 25px; align-items: stretch;">
                    <div style="flex: 1;">
                        ${watchBtnHtml}
                    </div>
                    <button onclick="openStatusModal('${escapeHTML(anime.id)}')" style="background: ${isFaved ? 'rgba(91,91,255,0.2)' : 'rgba(255,255,255,0.08)'}; border: 1px solid ${isFaved ? '#5b5bff' : 'rgba(255,255,255,0.1)'}; color: ${isFaved ? '#5b5bff' : '#fff'}; width: 56px; border-radius: 14px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: 0.2s;" onpointerdown="this.style.transform='scale(0.95)'" onpointerup="this.style.transform='scale(1)'" onpointerleave="this.style.transform='scale(1)'">
                        <svg style="width: 26px; height: 26px; fill: ${isFaved ? '#5b5bff' : 'none'}; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round;"><use href="#oa-bookmark"></use></svg>
                    </button>
                </div>

                <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 20px; align-items: center;">
                    ${(anime.genres || []).map(g => `<span style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: #ccc; padding: 8px 16px; border-radius: 20px; font-size: 14px;">${escapeHTML(g)}</span>`).join('')}
                    <span style="background: ${isUpcoming ? 'rgba(255,193,7,0.15)' : 'rgba(46,204,113,0.15)'}; border: 1px solid ${isUpcoming ? 'rgba(255,193,7,0.4)' : 'rgba(46,204,113,0.4)'}; color: ${isUpcoming ? '#ffc107' : '#2ecc71'}; padding: 8px 16px; border-radius: 20px; font-size: 14px; font-weight: 600;">${escapeHTML(anime.status)}</span>
                </div>

                <div style="margin-bottom: 25px;">
                    <p id="desc-text" style="color: #ccc; font-size: 15px; line-height: 1.6; display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden;">${desc}</p>
                    <button id="desc-btn" onclick="toggleDescription()" style="display: none; background: none; border: none; color: #5b5bff; font-weight: 700; font-size: 15px; margin-top: 8px; cursor: pointer; padding: 0; display: flex; align-items: center; gap: 4px;">Читать дальше <svg style="width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:2;"><use href="#oa-chevron-down"></use></svg></button>
                </div>

                ${hasScreenshots ? `
                <div style="margin-bottom: 30px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                        <h3 style="font-size: 18px; color: #fff; margin: 0;">Кадры</h3>
                        <a href="https://youtube.com/watch?v=${anime.trailerId}" target="_blank" style="color: #5b5bff; font-size: 13px; font-weight: 600; text-decoration: none;">Смотреть трейлер →</a>
                    </div>
                    <div style="display: flex; gap: 10px; overflow-x: auto; scroll-snap-type: x mandatory; scrollbar-width: none; padding-bottom: 5px; margin: 0 -20px; padding-left: 20px; padding-right: 20px;">
                        ${screenshotsHtml}
                    </div>
                </div>` : ''}

                <div style="background: #14141f; border-radius: 16px; padding: 20px; margin-bottom: 25px; text-align: center; border: 1px solid rgba(255,255,255,0.05);">
                    <h3 style="font-size: 16px; color: #fff; margin-bottom: 12px;">Ваша оценка:</h3>
                    <div style="display: flex; justify-content: center; gap: 8px;">${starsHtml}</div>
                </div>

                <div style="margin-bottom: 40px;">
                    <h3 style="font-size: 18px; margin-bottom: 15px; color: #fff; display:flex;align-items:center;gap:8px;"><svg class="icon-inline" style="width:20px;height:20px;"><use href="#oa-message"></use></svg> Комментарии</h3>
                    <div style="display: flex; gap: 10px; margin-bottom: 20px;">
                        <input type="text" id="comment-input" placeholder="Написать отзыв..." style="flex: 1; background: #14141f; border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 14px 16px; color: #fff; font-size: 15px; outline: none;">
                        <button onclick="sendComment('${escapeHTML(anime.id)}')" class="ripple-btn" style="background: #5b5bff; border: none; border-radius: 12px; padding: 0 20px; color: #fff; font-weight: bold; cursor: pointer; display:flex;align-items:center;justify-content:center;"><svg class="icon-inline" style="stroke:#fff;width:18px;height:18px;"><use href="#oa-send"></use></svg></button>
                    </div>
                    <div>${commentsHtml}</div>
                </div>
            </div>
        </div>`;

        setTimeout(() => { 
            const d = document.getElementById('desc-text'); 
            const b = document.getElementById('desc-btn'); 
            if (d && b && d.scrollHeight > d.clientHeight) b.style.display = 'flex'; 
        }, 50);
    } catch (e) { 
        console.error(e); 
        container.innerHTML = '<div style="text-align: center; padding: 40px; color: #ff4444;">Ошибка загрузки</div>'; 
    }
}

async function rateAnime(animeId, rating) {
    if (!supabaseClient || !MY_ID) return;
    try {
        const { data: ex } = await supabaseClient.from('user_lists').select('id').eq('user_id', MY_ID).eq('anime_id', animeId).single();
        if (ex) await supabaseClient.from('user_lists').update({ rating }).eq('user_id', MY_ID).eq('anime_id', animeId);
        else await supabaseClient.from('user_lists').insert({ user_id: MY_ID, anime_id: animeId, status: 'planned', rating });
        const starDiv = document.querySelector('#detail-content div[style*="justify-content: center; gap: 8px"]');
        if (starDiv) { starDiv.querySelectorAll('span').forEach((sp, i) => { sp.style.color = (i + 1) <= rating ? '#ffd700' : '#444'; }); }
        showToast(`Оценка ${rating}`);
    } catch(e) { showToast('Ошибка'); }
}
async function sendComment(animeId) {
    const input = document.getElementById('comment-input');
    const text = input.value.trim();
    if (!text) { showToast('Напишите текст!'); return; }
    if (!supabaseClient || !MY_ID) return;
    try {
        const { error } = await supabaseClient.from('anime_comments').insert({ anime_id: animeId, user_id: MY_ID, user_name: MY_NAME, user_avatar: getStats().avatar_url || MY_PHOTO_URL, text });
        if (error) throw error;
        input.value = ''; showToast('Отправлено!'); openAnimeDetail(animeId, previousScreen);
    } catch(e) { console.error(e); showToast('Ошибка'); }
}
function openStatusModal(id) { const t = window._animeCache && window._animeCache[id] ? window._animeCache[id].title_ru : 'Аниме'; document.getElementById('status-anime-title').textContent = t; document.getElementById('statusModal').classList.add('active'); window._currentAnimeForStatus = id; }
async function setAnimeStatus(status) {
    const id = window._currentAnimeForStatus; if (!id) return;
    let stats = getStats();
    let animeData = (window._animeCache && window._animeCache[id]) || null;
    stats.favedAnime = stats.favedAnime || [];
    const idx = stats.favedAnime.findIndex(a => a.id === id);
    if (status === 'favorite') { if (idx < 0 && animeData) { stats.favedAnime.push({ ...animeData }); saveStats(stats); } }
    else { if (idx >= 0) { stats.favedAnime.splice(idx, 1); saveStats(stats); } }
    if (status === 'completed' && animeData) { const eps = Number(animeData.episodes) || 0; if (eps > 0) { stats.episodesWatched += eps; stats.minutesWatched += eps * 24; } saveStats(stats); }
    closeModal('statusModal');
    if (!supabaseClient || !MY_ID) { showToast('Ошибка'); return; }
    try {
        await supabaseClient.from('user_lists').delete().eq('user_id', MY_ID).eq('anime_id', id);
        if (status !== '') { await supabaseClient.from('user_lists').insert({ user_id: MY_ID, anime_id: id, status }); showToast('Статус обновлен!'); }
        else showToast('Удалено из списка');
        const hb = document.querySelector(`#detail-content button[onclick^="openStatusModal('${id}')"]`);
        if (hb) { if (status !== '') { hb.style.background = 'rgba(91,91,255,0.2)'; hb.style.borderColor = '#5b5bff'; hb.style.color = '#5b5bff'; hb.classList.add('faved'); } else { hb.style.background = 'rgba(255,255,255,0.1)'; hb.style.color = '#fff'; hb.classList.remove('faved'); } }
        checkAchievements(stats); await syncProfileToDB(true);
    } catch(e) { console.error(e); showToast('Ошибка'); }
}
function toggleDescription() { const d = document.getElementById('desc-text'); const b = document.getElementById('desc-btn'); if (d.style.webkitLineClamp === '4' || d.style.webkitLineClamp === '') { d.style.webkitLineClamp = 'unset'; b.innerHTML = 'Свернуть ▲'; } else { d.style.webkitLineClamp = '4'; b.innerHTML = 'Читать дальше ▼'; } }
async function openRandomAnime() { if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('medium'); showToast('Ищем...'); try { const items = await API.getRandom(1); if (items && items.length > 0) openAnimeDetail(items[0].id, 'catalog'); } catch (e) {} }

// ==========================================
// 11. МОЁ
// ==========================================
function filterMyList(type, btn) { currentMyListFilter = type; document.querySelectorAll('.my-list-tab').forEach(el => el.classList.remove('active')); if (btn) btn.classList.add('active'); renderMyList(); }
async function renderMyList() {
    const grid = document.getElementById('my-grid'); if (!grid) return;
    grid.innerHTML = Skeletons.cards(4);
    if (!supabaseClient || !MY_ID) { grid.innerHTML = '<div class="loading-text">Войдите, чтобы увидеть список</div>'; return; }
    try {
        let q = supabaseClient.from('user_lists').select('*').eq('user_id', MY_ID);
        if (currentMyListFilter !== 'all') q = q.eq('status', currentMyListFilter);
        const { data: list, error } = await q;
        if (error) throw error;
        if (!list || list.length === 0) { grid.innerHTML = '<div class="loading-text">Тут пусто</div>'; return; }
        const ca = getStats().cachedAnime || {};
        const items = await Promise.all(list.map(async f => {
            let a = ca[f.anime_id];
            if (a) return a;
            try { const d = await API.getDetails(f.anime_id); if (d) { let s = getStats(); s.cachedAnime = s.cachedAnime || {}; s.cachedAnime[f.anime_id] = d; saveStats(s); return d; } } catch(e) { console.error(e); }
            return null;
        }));
        grid.innerHTML = '';
        items.filter(Boolean).forEach(anime => renderMyListCard(anime, grid));
        if (items.filter(Boolean).length === 0) grid.innerHTML = '<div class="loading-text">Не удалось загрузить</div>';
    } catch (e) { console.error(e); grid.innerHTML = '<div class="loading-text" style="color:#ff4444;">Ошибка</div>'; }
}
function renderMyListCard(anime, grid) {
    const title = escapeHTML(anime.title_ru);
    const img = safeUrl(anime.images.jpg.image_url);
    const score = anime.score ? Number(anime.score).toFixed(1) : '?';
    grid.insertAdjacentHTML('beforeend', `<div class="catalog-card fade-in" onclick="openAnimeDetail('${escapeHTML(anime.id)}', 'my')"><img class="catalog-card-img" src="${img}" loading="lazy"><div style="position: absolute; top: 8px; right: 8px; background: rgba(0,0,0,0.7); padding: 2px 6px; border-radius: 6px; font-size: 10px; color: #ffd700; font-weight: bold; display:flex;align-items:center;gap:2px;"><svg class="icon-star" style="width:10px;height:10px;"><use href="#oa-star"></use></svg> ${score}</div><div class="catalog-card-title">${title}</div></div>`);
}

// ==========================================
// 12. СЕКЦИИ ГЛАВНОЙ
// ==========================================
async function loadPopularByRating(limit = 6) {
    const list = document.getElementById('popular-list'); if (!list) return;
    list.innerHTML = Skeletons.cards(4);
    try {
        const items = await API.getTopRated(limit);
        if (items && items.length > 0) {
            renderSectionCards(list, items, 'home');
        } else {
            list.innerHTML = '<div class="loading-text">Не удалось загрузить</div>';
        }
    } catch (e) {
        console.error(e);
        list.innerHTML = '<div class="loading-text" style="color:#ff4444;">Ошибка загрузки</div>';
    }
}

async function loadUpcomingAnime(limit = 6) {
    const list = document.getElementById('upcoming-list'); if (!list) return;
    list.innerHTML = Skeletons.cards(4);
    try {
        const items = await API.getUpcoming(limit);
        if (items && items.length > 0) {
            renderSectionCards(list, items, 'home');
        } else {
            list.innerHTML = '<div class="loading-text">Пока нет анонсов</div>';
        }
    } catch (e) {
        console.error(e);
        list.innerHTML = '<div class="loading-text" style="color:#ff4444;">Ошибка загрузки</div>';
    }
}

async function loadTopUsers() {
    const container = document.getElementById('top-users-list');
    const section = document.getElementById('section-top-users');
    if (!container || !section || !supabaseClient) return;

    try {
        const { data: users, error } = await supabaseClient
            .from('users')
            .select('*')
            .order('xp', { ascending: false })
            .limit(20);

        if (error) throw error;
        if (!users || users.length === 0) return;

        const sortedUsers = users.sort((a, b) => {
            const scoreA = (a.xp || 0) + ((a.unlocked_achievements || []).length * 1000) + ((a.minutes_watched || 0) / 60);
            const scoreB = (b.xp || 0) + ((b.unlocked_achievements || []).length * 1000) + ((b.minutes_watched || 0) / 60);
            return scoreB - scoreA;
        }).slice(0, 5);

        const topUsersHtml = await Promise.all(sortedUsers.map(async (user, index) => {
            let titleHtml = '';
            let badgeHtml = '';

            if (user.active_title) {
                const { data: titleData } = await supabaseClient.from('titles').select('*').eq('id', user.active_title).single();
                if (titleData) {
                    if (titleData.is_animated) {
                        titleHtml = `<div class="user-title-display animated-title" data-title="${escapeHTML(titleData.animation_key || 'gold')}" style="font-size:9px; padding: 1px 6px; margin-top: 3px; height: 14px; line-height: 12px;"><span class="title-text">${escapeHTML(titleData.name)}</span></div>`;
                    } else {
                        titleHtml = `<div class="user-title-display" style="color:${escapeHTML(titleData.color)}; border-color:${escapeHTML(titleData.color)}; font-size:9px; padding: 1px 6px; margin-top: 3px; height: 14px; line-height: 12px;">${escapeHTML(titleData.name)}</div>`;
                    }
                }
            }

            if (user.active_badge) {
                const { data: badgeData } = await supabaseClient.from('badges').select('image_url').eq('id', user.active_badge).single();
                if (badgeData) {
                    badgeHtml = `<img src="${safeUrl(badgeData.image_url)}" style="width:16px; height:16px; object-fit:contain; margin-left: 4px;" alt="badge">`;
                }
            }

            const avatarUrl = user.avatar_url ? safeUrl(user.avatar_url) : '';
            const nameChar = user.name && user.name[0] ? escapeHTML(user.name[0].toUpperCase()) : '?';
            const avatarHtml = avatarUrl ? `<img src="${avatarUrl}" style="width:100%; height:100%; object-fit:cover;">` : nameChar;

            const lvl = Math.floor((user.xp || 0) / 100) + 1;
            const achCount = (user.unlocked_achievements || []).length;
            const hours = Math.floor((user.minutes_watched || 0) / 60);

            let rankIndicator = '';
            let nameColor = 'var(--text)';

            if (index === 0) {
                rankIndicator = `<svg style="width:14px; height:14px; margin-right: 8px; filter: drop-shadow(0 0 6px #FFD700);"><use href="#oa-dot-gold"></use></svg>`;
                nameColor = '#FFD700';
            } else if (index === 1) {
                rankIndicator = `<svg style="width:14px; height:14px; margin-right: 8px; filter: drop-shadow(0 0 6px #87CEEB);"><use href="#oa-dot-blue"></use></svg>`;
                nameColor = '#87CEEB';
            } else if (index === 2) {
                rankIndicator = `<svg style="width:14px; height:14px; margin-right: 8px; filter: drop-shadow(0 0 6px #2ecc71);"><use href="#oa-dot-green"></use></svg>`;
                nameColor = '#2ecc71';
            } else {
                rankIndicator = `<div style="width: 18px; height: 18px; margin-right: 8px; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.08); border-radius: 50%; font-size: 11px; font-weight: bold; color: #aaa; flex-shrink: 0;">${index + 1}</div>`;
            }

            const statBlock = `
                <div style="display: flex; justify-content: space-around; width: 100%; margin-top: 8px; background: rgba(0,0,0,0.2); border-radius: 8px; padding: 6px 0;">
                    <div style="display: flex; flex-direction: column; align-items: center; gap: 2px;">
                        <svg class="icon-inline" style="width: 14px; height: 14px; color: #ffd700;"><use href="#oa-star"></use></svg>
                        <span style="font-size: 11px; font-weight: bold; color: #fff; line-height: 1;">${lvl}</span>
                        <span style="font-size: 8px; color: #888; text-transform: uppercase;">lvl</span>
                    </div>
                    <div style="display: flex; flex-direction: column; align-items: center; gap: 2px;">
                        <svg class="icon-inline" style="width: 14px; height: 14px; color: #b44aff;"><use href="#oa-trophy"></use></svg>
                        <span style="font-size: 11px; font-weight: bold; color: #fff; line-height: 1;">${achCount}</span>
                        <span style="font-size: 8px; color: #888; text-transform: uppercase;">ach</span>
                    </div>
                    <div style="display: flex; flex-direction: column; align-items: center; gap: 2px;">
                        <svg class="icon-inline" style="width: 14px; height: 14px; color: #00d2ff;"><use href="#oa-clock"></use></svg>
                        <span style="font-size: 11px; font-weight: bold; color: #fff; line-height: 1;">${hours}</span>
                        <span style="font-size: 8px; color: #888; text-transform: uppercase;">hrs</span>
                    </div>
                </div>
            `;

            return `
                <div onclick="openUserFromTop('${escapeHTML(String(user.id))}')" style="display: flex; align-items: flex-start; background: #14141f; border-radius: 12px; padding: 12px; border: 1px solid rgba(255,255,255,0.05); cursor: pointer; transition: transform 0.15s ease;" onpointerdown="this.style.transform='scale(0.98)'" onpointerup="this.style.transform='scale(1)'" onpointerleave="this.style.transform='scale(1)'">
                    <div style="display: flex; align-items: center; margin-right: 12px; margin-top: 2px;">
                        ${rankIndicator}
                        <div class="friend-avatar" style="width: 46px; height: 46px; font-size: 18px; border: 2px solid ${index < 3 ? nameColor : 'rgba(255,255,255,0.1)'};">
                            ${avatarHtml}
                        </div>
                    </div>
                    
                    <div style="flex: 1; min-width: 0;">
                        <div style="display: flex; align-items: center; gap: 4px;">
                            <h3 style="color: ${nameColor}; font-size: 15px; margin: 0; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHTML(user.name)}</h3>
                            ${badgeHtml}
                        </div>
                        ${titleHtml}
                        ${statBlock}
                    </div>
                </div>
            `;
        }));

        container.innerHTML = topUsersHtml.join('');
        section.style.display = 'block';

    } catch (e) {
        console.error('[Top Users] Ошибка загрузки:', e);
        section.style.display = 'none';
    }
}

function renderSectionCards(container, items, fromScreen = 'home') {
    if (!container) return;
    if (!items || items.length === 0) { container.innerHTML = '<div class="loading-text">Не удалось загрузить</div>'; return; }
    container.innerHTML = items.map(anime => { const title = escapeHTML(anime.title_ru); const img = safeUrl(anime.images.jpg.image_url); return `<div class="card" onclick="openAnimeDetail('${escapeHTML(anime.id)}', '${fromScreen}')"><img class="card-img" src="${img}" loading="lazy"><div class="card-title">${title}</div></div>`; }).join('');
}

// ==========================================
// 13. ГЛАВНАЯ
// ==========================================
let heroData = []; let currentSlide = 0; let slideInterval; let sectionObserverInstance = null;
function getSectionObserver() { if (!sectionObserverInstance) { sectionObserverInstance = new IntersectionObserver((entries) => { entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('fade-in-section'); sectionObserverInstance.unobserve(entry.target); } }); }, { threshold: 0.1 }); } return sectionObserverInstance; }
let observedSections = new WeakSet(); let heroParallaxAttached = false;

async function loadHomePage() {
    const seasonalList = document.getElementById('seasonal-list');
    const heroSlider = document.getElementById('heroSlider');
    const heroProgressBar = document.getElementById('heroProgressBar');

    if (heroSlider) heroSlider.innerHTML = `<div class="hero-slide active"><div style="position:absolute; inset:0; background: linear-gradient(135deg, #1a1a24, #12121a);"></div></div>`;
    if (heroProgressBar) heroProgressBar.innerHTML = '';
    if (seasonalList) seasonalList.innerHTML = Skeletons.cards(4);

    try {
        const heroItems = await API.getRandom(5);
        if (heroItems && heroItems.length > 0) {
            heroData = heroItems.map(a => ({ id: a.id, title: a.title_ru, poster: a.images.jpg.image_url, score: a.score ? Number(a.score).toFixed(1) : '?', type: a.kind || 'TV', year: a.year }));
        } else { throw new Error('empty hero'); }
    } catch (e) { console.warn('[Home] Hero fallback (empty)'); heroData = []; }
    initHeroSlider();

    try {
        const seasonalItems = await API.getSeasonal(6);
        if (seasonalItems && seasonalItems.length > 0) renderSectionCards(seasonalList, seasonalItems, 'home');
        else { if (seasonalList) seasonalList.innerHTML = '<div class="loading-text">Не удалось загрузить</div>'; }
    } catch(e) { if (seasonalList) seasonalList.innerHTML = '<div class="loading-text">Не удалось загрузить</div>'; }

    loadPopularByRating(6);
    loadUpcomingAnime(6);
    loadTopUsers();

    const obs = getSectionObserver();
    document.querySelectorAll('.content-section').forEach(sec => { if (!observedSections.has(sec)) { obs.observe(sec); observedSections.add(sec); } });
}

function initHeroSlider() {
    const slider = document.getElementById('heroSlider');
    const progressBar = document.getElementById('heroProgressBar');
    if (!slider || !heroData || heroData.length === 0) return;
    let sliderHTML = '', progressHTML = '';

    heroData.forEach((anime, index) => {
        sliderHTML += `
            <div class="hero-slide ${index === 0 ? 'active' : ''}" data-index="${index}">
                <div class="hero-bg-poster" id="hero-bg-poster-${index}" style="background-image: url('${safeUrl(anime.poster)}'); background-position: center top;"></div>
                <div class="hero-gradient"></div>
                <div class="hero-content">
                    <div class="hero-badges">
                        <span class="badge star"><svg class="icon-star"><use href="#oa-star"></use></svg> ${escapeHTML(anime.score)}</span>
                        <span class="badge">${escapeHTML(anime.type)}</span>
                        <span class="badge">${escapeHTML(anime.year)}</span>
                    </div>
                    <h1 class="hero-title">${escapeHTML(anime.title)}</h1>
                    <div class="hero-actions">
                        <button class="btn-primary" onclick="openAnimeDetail('${escapeHTML(anime.id)}', 'home')"><svg class="icon-inline" style="stroke:#fff;fill:#fff;width:16px;height:16px;"><use href="#oa-play"></use></svg> Смотреть</button>
                        <button class="btn-icon-heart" onclick="openStatusModal('${escapeHTML(anime.id)}')"><svg><use href="#oa-bookmark"></use></svg></button>
                    </div>
                </div>
            </div>`;
        progressHTML += `<div class="hero-progress-seg ${index === 0 ? 'active' : ''}" id="hero-prog-${index}"><div class="fill"></div></div>`;
    });

    slider.innerHTML = sliderHTML;
    if (progressBar) progressBar.innerHTML = progressHTML;

    startSlideShow(); addSwipeSupport(slider);
    if (!heroParallaxAttached) { addHeroParallax(); heroParallaxAttached = true; }
    window._animeCache = window._animeCache || {};
    heroData.forEach(a => { window._animeCache[a.id] = a; });
}

function addHeroParallax() {
    const hero = document.getElementById('heroSection'); if (!hero) return;
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    hero.addEventListener('mousemove', (e) => {
        const rect = hero.getBoundingClientRect(); const x = (e.clientX - rect.left) / rect.width - 0.5; const y = (e.clientY - rect.top) / rect.height - 0.5;
        const activeBg = document.querySelector('.hero-slide.active .hero-bg-poster');
        if (activeBg) activeBg.style.transform = `translate(${x * 15}px, ${y * 15}px)`;
    });
    hero.addEventListener('mouseleave', () => {
        const activeBg = document.querySelector('.hero-slide.active .hero-bg-poster'); if (activeBg) activeBg.style.transform = '';
    });
}

function goToSlide(index) {
    const slides = document.querySelectorAll('.hero-slide'); const progs = document.querySelectorAll('.hero-progress-seg');
    slides.forEach(s => s.classList.remove('active')); progs.forEach(p => { p.classList.remove('active'); p.classList.remove('done'); });
    if (slides[index]) slides[index].classList.add('active');
    for (let i = 0; i < index; i++) { if (progs[i]) progs[i].classList.add('done'); }
    if (progs[index]) progs[index].classList.add('active');
    currentSlide = index;
}
function nextSlide() { if (heroData.length === 0) return; currentSlide = (currentSlide + 1) % heroData.length; goToSlide(currentSlide); }
function startSlideShow() { if (slideInterval) clearInterval(slideInterval); slideInterval = setInterval(nextSlide, 5000); }
function stopSlideShow() { if (slideInterval) { clearInterval(slideInterval); slideInterval = null; } }
function addSwipeSupport(element) {
    let touchStartX = 0;
    element.addEventListener('touchstart', e => { touchStartX = e.changedTouches[0].screenX; stopSlideShow(); }, { passive: true });
    element.addEventListener('touchend', e => {
        const diff = touchStartX - e.changedTouches[0].screenX;
        if (diff > 50) nextSlide(); else if (diff < -50) { currentSlide = (currentSlide - 1 + heroData.length) % heroData.length; goToSlide(currentSlide); }
        startSlideShow();
    }, { passive: true });
}

// ==========================================
// 14. ДОСТИЖЕНИЯ И XP
// ==========================================
const RARITY_STYLES = { common: { color: '#ccc', class: 'common' }, rare: { color: '#00d2ff', class: 'rare' }, epic: { color: '#b44aff', class: 'epic' }, legendary: { color: '#ffd700', class: 'legendary' } };
const ACHIEVEMENTS = [
    { id: 'c1', name: "Киносеанс", desc: "Посмотреть любое аниме", rarity: 'common', xp: 10, coins: 100, check: s => s.episodesWatched >= 1, progress: s => Math.min(s.episodesWatched, 1), max: 1, imgUrl: "cinema.png" },
    { id: 'c2', name: "Марафонец", desc: "3 часа на сайте", rarity: 'common', xp: 20, coins: 100, check: s => s.totalMinutesOnSite >= 180, progress: s => Math.min(s.totalMinutesOnSite, 180), max: 180, imgUrl: "marathon.png" },
    { id: 'c3', name: "Постоянный гость", desc: "7 дней подряд", rarity: 'common', xp: 30, coins: 200, check: s => s.daysStreak >= 7, progress: s => Math.min(s.daysStreak, 7), max: 7, imgUrl: "guest.png" },
    { id: 'c4', name: "Новичок", desc: "Достичь 10 уровня", rarity: 'common', xp: 50, coins: 500, check: s => Math.floor(s.xp/100)+1 >= 10, progress: s => Math.min(Math.floor(s.xp/100)+1, 10), max: 10, imgUrl: "newbie.png" },
    { id: 'r1', name: "Коллекционер", desc: "10 аниме", rarity: 'rare', xp: 50, coins: 300, check: s => s.episodesWatched >= 10, progress: s => Math.min(s.episodesWatched, 10), max: 10, imgUrl: "collector.png" },
    { id: 'r2', name: "Опытный зритель", desc: "20 уровень", rarity: 'rare', xp: 100, coins: 600, check: s => Math.floor(s.xp/100)+1 >= 20, progress: s => Math.min(Math.floor(s.xp/100)+1, 20), max: 20, imgUrl: "experienced.png" },
    { id: 'r3', name: "Знаток", desc: "40 уровень", rarity: 'rare', xp: 100, coins: 750, check: s => Math.floor(s.xp/100)+1 >= 40, progress: s => Math.min(Math.floor(s.xp/100)+1, 40), max: 40, imgUrl: "expert.png" },
    { id: 'r4', name: "Перфекционист", desc: "Все обычные", rarity: 'rare', xp: 110, coins: 800, check: s => ACHIEVEMENTS.filter(a => a.rarity === 'common').every(a => s.unlockedAchievements.includes(a.id)), progress: s => ACHIEVEMENTS.filter(a => a.rarity === 'common' && s.unlockedAchievements.includes(a.id)).length, max: 4 },
    { id: 'e1', name: "Заядлый анимешник", desc: "20 аниме", rarity: 'epic', xp: 200, coins: 600, check: s => s.episodesWatched >= 20, progress: s => Math.min(s.episodesWatched, 20), max: 20, imgUrl: "hardcore.png" },
    { id: 'e2', name: "Верный фанат", desc: "30 дней подряд", rarity: 'epic', xp: 500, coins: 1000, check: s => s.daysStreak >= 30, progress: s => Math.min(s.daysStreak, 30), max: 30, imgUrl: "fan.png" },
    { id: 'e3', name: "Модник", desc: "Купить аксессуар", rarity: 'epic', xp: 500, coins: 1000, check: s => s.hasPurchasedBanner, progress: s => s.hasPurchasedBanner ? 1 : 0, max: 1, imgUrl: "fashionista.png" },
    { id: 'e4', name: "Фанат", desc: "50 аниме в избранном", rarity: 'epic', xp: 500, coins: 1000, check: s => s.favedAnime.length >= 50, progress: s => Math.min(s.favedAnime.length, 50), max: 50, imgUrl: "fan_fav.png" }
];
const LEVEL_TITLES = ["Первый эпизод","Любопытный зритель","Случайный странник","Ученик манги","Читатель субтитров","Собиратель тайтлов","Ночной марафонец","Ценитель опенингов","Знаток сейю","Ловец спойлеров","Страж таймлайна","Искатель шедевров","Коллекционер жанров","Следопыт сезона","Архивариус эпизодов","Пилот меха","Ученик додзё","Начинающий маг","Дух сакуры","Странник измерений","Хранитель клинка","Проводник сюжета","Алхимик эмоций","Писец рецензий","Охотник за онгоингами","Мастер бинджвотча","Сэнпай сайта","Хранитель лора","Ткач теорий","Лунный самурай","Небесный курьер","Хранитель опенингов","Повелитель плейлистов","Критик с катаной","Мудрец субтитров","Дубляжный маг","Страж спойлеров","Картограф арок","Коллекционер аватарок","Ловец редких тайтлов","Хроникёр сезонов","Мастер клиффхэнгеров","Дуэлянт мнений","Хранитель уютного уголка","Рыцарь романтики","Тень сёнэна","Адепт исэкая","Архимаг тайтлов","Небесный отаку","Странник по мирам","Хранитель легенд","Мастер сюжетных поворотов","Голос фандома","Судья сезона","Хранитель аниме-реликвий","Пилот звёздного поезда","Лунный библиотекарь","Самурай субботы","Повелитель финальных титров","Искатель скрытых жемчужин","Маг рекомендаций","Страж уютных вечеров","Рыцарь онгоинга","Дух обсуждений","Хранитель мемов","Мастер аниме-детектива","Небесный критик","Повелитель сезонных марафонов","Хранитель канона","Ткач фанфиков","Оракул спойлеров","Лунный сэнпай","Самурай рейтингов","Архивариус легенд","Маг жанров","Страж ночных просмотров","Повелитель опенингов","Хранитель тропов","Рыцарь вечернего просмотра","Дух фестиваля","Мастер эмоциональных качелей","Следопыт забытых тайтлов","Хранитель аниме-хроник","Небесный администратор","Самурай финального эпизода","Оракул сезонов","Повелитель легендарных арок","Хранитель аниме-вселенной","Маг идеального топа","Дух великого марафона","Рыцарь вечного онгоинга","Архимаг фандома","Страж золотой коллекции","Легенда аниме-сайта","Небесный хранитель тайтлов","Великий отаку-владыка","Хранитель последнего эпизода","Мастер пересмотров","Дух аниме-сообщества","Верховный хранитель сезонов"];

const CACHED_ANIME_LIMIT = 80;
function trimCachedAnime(s) {
    if (!s.cachedAnime) return;
    const keys = Object.keys(s.cachedAnime);
    if (keys.length > CACHED_ANIME_LIMIT) {
        const toRemove = keys.length - CACHED_ANIME_LIMIT;
        for (let i = 0; i < toRemove; i++) delete s.cachedAnime[keys[i]];
    }
}

function getStats() {
    let s = JSON.parse(localStorage.getItem('onika_stats'));
    if (!s) { s = { episodesWatched: 0, minutesWatched: 0, daysStreak: 1, xp: 0, coins: 0, active_banner: null, active_banner_url: '', active_title: null, active_effect: null, active_badge: null, active_frame: null, lastVisit: new Date().toDateString(), unlockedAchievements: [], favedAnime: [], watchedToday: [], cachedAnime: {}, totalMinutesOnSite: 0, hasPurchasedBanner: false, _lastAwardedHours: 0, avatar_url: '' }; localStorage.setItem('onika_stats', JSON.stringify(s)); }
    if (!s.unlockedAchievements) s.unlockedAchievements = [];
    if (!s.favedAnime) s.favedAnime = [];
    if (!s.watchedToday) s.watchedToday = [];
    if (s.coins === undefined) s.coins = 0;
    if (!s.cachedAnime) s.cachedAnime = {};
    if (s.totalMinutesOnSite === undefined) s.totalMinutesOnSite = 0;
    if (s.hasPurchasedBanner === undefined) s.hasPurchasedBanner = false;
    if (s._lastAwardedHours === undefined) s._lastAwardedHours = 0;
    return s;
}
function saveStats(s) { trimCachedAnime(s); localStorage.setItem('onika_stats', JSON.stringify(s)); }
function checkAchievements(s) {
    let totalChanged = false; let iterations = 0;
    while (iterations < 5) {
        let changed = false;
        ACHIEVEMENTS.forEach(a => {
            if (!s.unlockedAchievements.includes(a.id) && a.check(s)) {
                s.unlockedAchievements.push(a.id); s.coins += a.coins; s.xp += a.xp; changed = true; totalChanged = true;
                showToast(`${a.name}! +${a.xp} XP, +${a.coins}`);
            }
        });
        if (!changed) break;
        iterations++;
    }
    if (totalChanged) { saveStats(s); syncProfileToDB(true).catch(() => {}); }
    return totalChanged;
}
function addXP(amount) {
    let s = getStats(); const oldL = Math.floor(s.xp/100)+1; s.xp += amount; const newL = Math.floor(s.xp/100)+1;
    if (newL > oldL) { const rc = Math.floor(100 + Math.pow(newL, 2.5) * 2); s.coins += rc; showLevelUpPopup(newL, LEVEL_TITLES[Math.min(newL-1, LEVEL_TITLES.length-1)] || 'Легенда', rc); if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success'); } else showToast(`+${amount} XP`);
    saveStats(s); checkAchievements(s);
}
function addXPForTime(min) {
    let s = getStats();
    s.totalMinutesOnSite = (s.totalMinutesOnSite || 0) + min;
    const hoursEarned = Math.floor(s.totalMinutesOnSite / 60);
    const lastAwarded = s._lastAwardedHours || 0;
    if (hoursEarned > lastAwarded) {
        const delta = hoursEarned - lastAwarded; s._lastAwardedHours = hoursEarned; saveStats(s);
        addXP(delta * 2); showToast(`+${delta * 2} XP за ${delta} ч`);
    } else saveStats(s);
}
function showLevelUpPopup(l, r, c) { const p = document.getElementById('levelUpPopup'); if (!p) return; document.getElementById('popup-level').textContent = l; document.getElementById('popup-rank').textContent = r; document.getElementById('popup-coins').textContent = c; p.classList.add('show'); setTimeout(() => p.classList.remove('show'), 4000); }
function setElText(id, t) { const el = document.getElementById(id); if (el) el.textContent = t; }
function setElWidth(id, w) { const el = document.getElementById(id); if (el) el.style.width = w; }
function showToast(msg) { const t = document.createElement('div'); t.textContent = msg; t.style.cssText = `position:fixed;bottom:80px;left:50%;transform:translate(-50%,0);background:linear-gradient(135deg,#5b5bff,#7d7dff);color:#fff;padding:12px 22px;border-radius:24px;font-weight:700;font-size:14px;z-index:99999;box-shadow:0 8px 30px rgba(91,91,255,0.5);text-align:center;max-width:85vw;animation:toastIn 0.4s cubic-bezier(0.22,1,0.36,1);`; document.body.appendChild(t); setTimeout(() => { t.style.animation = 'toastOut 0.3s ease forwards'; setTimeout(() => t.remove(), 300); }, 2400); }

function switchProfileTab(tab) {
    const bp = document.getElementById('tab-btn-profile'), bs = document.getElementById('tab-btn-shop'), bst = document.getElementById('tab-btn-settings');
    const cp = document.getElementById('profile-content-tab'), cs = document.getElementById('settings-content-tab'), csh = document.getElementById('shop-content-tab');
    [bp, bs, bst].forEach(b => b && b.classList.remove('active'));
    [cp, cs, csh].forEach(c => c && (c.style.display = 'none'));
    if (tab === 'profile') { if (bp) bp.classList.add('active'); if (cp) cp.style.display = 'block'; }
    else if (tab === 'shop') { if (bs) bs.classList.add('active'); if (csh) { csh.style.display = 'block'; renderShopTab(currentShopTab); } }
    else { if (bst) bst.classList.add('active'); if (cs) cs.style.display = 'block'; }
}
function openLevelModal() { document.getElementById('levelModal').classList.add('active'); }
function closeModal(id) { const el = document.getElementById(id); if (el) el.classList.remove('active'); }
function openAchievementsPage() { switchTab('achievements'); }
function renderAchievementsPage() {
    const s = getStats(); const c = document.getElementById('achievements-list-container');
    if (!c) return;
    setElText('page-ach-earned', s.unlockedAchievements.length); setElText('page-ach-total', ACHIEVEMENTS.length);
    const rarities = [{ key: 'common', name: 'Обычные', color: '#ccc', class: 'common' }, { key: 'rare', name: 'Редкие', color: '#00d2ff', class: 'rare' }, { key: 'epic', name: 'Эпические', color: '#b44aff', class: 'epic' }, { key: 'legendary', name: 'Легендарные', color: '#ffd700', class: 'legendary' }];
    let html = '';
    rarities.forEach(r => {
        const list = ACHIEVEMENTS.filter(a => a.rarity === r.key); if (list.length === 0) return;
        const done = list.filter(a => s.unlockedAchievements.includes(a.id)).length;
        html += `<div class="ach-category-header ${r.class}"><span style="color: ${r.color};">●</span> ${r.name}<span class="count">${done} / ${list.length}</span></div>`;
        list.forEach(a => {
            const isDone = s.unlockedAchievements.includes(a.id);
            const rs = RARITY_STYLES[a.rarity];
            const pc = a.progress(s); const pp = (pc / a.max) * 100;
            const ic = a.imgUrl ? `<img src="${safeUrl(a.imgUrl)}" alt="${escapeHTML(a.name)}" onerror="this.style.display='none'">` : '<svg class="icon-inline" style="color:#ffd700;"><use href="#oa-achievement"></use></svg>';
            html += `<div class="ach-list-item ${rs.class} ${isDone ? 'completed' : ''}"><div class="ach-list-icon" style="color: ${rs.color}">${ic}</div><div class="ach-list-info"><h4>${escapeHTML(a.name)}</h4><p>${escapeHTML(a.desc)}</p>${!isDone ? `<div class="ach-progress-mini"><div style="width: ${pp}%; background: ${rs.color}"></div></div><div style="font-size: 10px; color: #888; margin-top: 2px;">${pc} / ${a.max}</div>` : ''}</div><div class="ach-reward-badge">+${a.xp} XP, +${a.coins}</div>${isDone ? '<div class="ach-status-icon" style="color: #ffd700;"><svg class="icon-inline" style="width:20px;height:20px;"><use href="#oa-check"></use></svg></div>' : ''}</div>`;
        });
    });
    c.innerHTML = html;
}

// ==========================================
// 15. ИНИЦИАЛИЗАЦИЯ
// ==========================================
setInterval(() => { if (document.visibilityState === 'visible') addXPForTime(1); }, 60000);
document.addEventListener('DOMContentLoaded', async () => {
    try { await initAuth(); } catch(e) { console.error(e); }
    try { await loadProfileData(); } catch(e) { console.error(e); }
    loadHomePage();
});
