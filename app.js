// ==========================================
// 1. НАСТРОЙКА SUPABASE
// ==========================================
const SUPABASE_URL = 'https://wsaykqhojwfhpqzxptke.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndzYXlrcWhvandmaHBxenhwdGtlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1MzAxMDgsImV4cCI6MjEwODEwNjEwOH0.6eHuhYt2CyVvIurt-TW3MgP4VE0kzv39vqVHwskodLk';

let supabaseClient = null;
try {
    if (window.supabase) supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
} catch (e) {
    console.error('Ошибка Supabase:', e);
}

// ==========================================
// 1.2 СИСТЕМА РЕЙТИНГА OnikaAnime
// ==========================================
async function getOnikaRating(animeId) {
    if (!supabaseClient) return { avg: null, count: 0 };
    try {
        const { data, error } = await supabaseClient.from('anime_ratings').select('rating').eq('anime_id', String(animeId));
        if (error) throw error;
        if (!data || !data.length) return { avg: null, count: 0 };
        const sum = data.reduce((a, r) => a + Number(r.rating), 0);
        return { avg: Math.round((sum / data.length) * 10) / 10, count: data.length };
    } catch (e) { console.error('getOnikaRating:', e); return { avg: null, count: 0 }; }
}

async function getOnikaRatingsBatch(animeIds) {
    if (!supabaseClient || !animeIds?.length) return {};
    try {
        const ids = animeIds.map(String);
        const { data, error } = await supabaseClient.from('anime_ratings').select('anime_id, rating').in('anime_id', ids);
        if (error) throw error;
        const map = {};
        (data || []).forEach(r => {
            if (!map[r.anime_id]) map[r.anime_id] = { sum: 0, count: 0 };
            map[r.anime_id].sum += Number(r.rating);
            map[r.anime_id].count++;
        });
        const res = {};
        ids.forEach(id => {
            const m = map[id];
            res[id] = m ? { avg: Math.round((m.sum / m.count) * 10) / 10, count: m.count } : { avg: null, count: 0 };
        });
        return res;
    } catch (e) { console.error('getOnikaRatingsBatch:', e); return {}; }
}

async function getMyRating(animeId) {
    if (!supabaseClient || !MY_ID) return null;
    try {
        const { data, error } = await supabaseClient.from('anime_ratings').select('rating').eq('anime_id', String(animeId)).eq('user_id', MY_ID).maybeSingle();
        if (error) throw error;
        return data ? Number(data.rating) : null;
    } catch { return null; }
}

async function saveMyRatingToDb(animeId, rating) {
    if (!supabaseClient || !MY_ID) return false;
    try {
        const r = Math.round(Number(rating) * 10) / 10;
        if (r < 1 || r > 10) return false;
        const { error } = await supabaseClient.from('anime_ratings').upsert(
            { user_id: MY_ID, anime_id: String(animeId), rating: r, updated_at: new Date().toISOString() },
            { onConflict: 'user_id,anime_id' }
        );
        if (error) throw error;
        return true;
    } catch (e) { console.error('saveMyRatingToDb:', e); return false; }
}

async function saveMyRating(animeId, rating) {
    if (!MY_ID) { showToast('Войдите в аккаунт'); return; }
    const val = Math.round(Number(rating) * 10) / 10;
    const ok = await saveMyRatingToDb(animeId, val);
    if (ok) {
        showToast(`Оценка ${val} сохранена`);
        const o = await getOnikaRating(animeId);
        // Обновляем плашки Onika в шапке, если мы на странице аниме
        const avgEl = document.getElementById('onika-avg-value');
        if (avgEl && o.avg != null) {
            avgEl.textContent = o.avg.toFixed(1);
            const countEl = document.getElementById('onika-votes-count');
            if (countEl) countEl.textContent = o.count + ' оценок';
        }
    }
}

let MY_ID = null, MY_PUBLIC_ID = null, MY_NAME = 'Гость', MY_PHOTO_URL = '';
let ACTIVE_BANNER_URL = '', ACTIVE_TITLE_DATA = null, ACTIVE_EFFECT_CSS = '', ACTIVE_BADGE_URL = '';
let PENDING_VERIFY_EMAIL = '';
let currentFriendsTab = 'friends';

const abortRegistry = new Map();
function makeAbort(key) {
    if (abortRegistry.has(key)) {
        try { abortRegistry.get(key).abort(); } catch {}
    }
    const ctrl = new AbortController();
    abortRegistry.set(key, ctrl);
    return ctrl;
}

function escapeHTML(str) {
    if (str == null) return '';
    return String(str).replace(/[&<>'"]/g, t => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[t] || t));
}

function safeUrl(url) {
    if (!url || typeof url !== 'string') return '';
    if (url.startsWith('/') && !url.startsWith('//')) return 'https://shikimori.io' + url;
    try {
        const u = new URL(url, location.origin);
        return (u.protocol === 'http:' || u.protocol === 'https:') ? u.href : '';
    } catch { return ''; }
}

const PLACEHOLDER_POSTER = "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='300' fill='%23222'%3E%3Crect width='200' height='300'/%3E%3Ctext x='50%25' y='50%25' fill='%23666' font-family='sans-serif' font-size='14' text-anchor='middle'%3EНет фото%3C/text%3E%3C/svg%3E";

window._previewCache = {};
function cachePreviewItem(item) {
    const key = 'p_' + Math.random().toString(36).slice(2, 10);
    window._previewCache[key] = item;
    return key;
}

const toastQueue = [];
let toastActive = 0;
const TOAST_MAX = 3;

function showToast(msg) {
    if (toastActive >= TOAST_MAX) { toastQueue.push(msg); return; }
    toastActive++;
    const t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = `position:fixed;bottom:80px;left:50%;transform:translate(-50%,0);background:linear-gradient(135deg,#5b5bff,#7d7dff);color:#fff;padding:12px 22px;border-radius:24px;font-weight:700;font-size:14px;z-index:99999;box-shadow:0 8px 30px rgba(91,91,255,0.5);text-align:center;max-width:85vw;animation:toastIn 0.4s cubic-bezier(0.22,1,0.36,1);`;
    document.body.appendChild(t);
    setTimeout(() => {
        t.style.animation = 'toastOut 0.3s ease forwards';
        setTimeout(() => {
            t.remove();
            toastActive--;
            if (toastQueue.length) showToast(toastQueue.shift());
        }, 300);
    }, 2200);
}

function hidePreloader() {
    const p = document.getElementById('app-preloader');
    if (p) { p.classList.add('hidden'); setTimeout(() => p.remove(), 700); }
}

// ==========================================
// 1.1 АВТОРИЗАЦИЯ
// ==========================================
let authMode = 'login';

function switchAuthTab(mode) {
    authMode = mode;
    document.getElementById('tab-login').classList.toggle('active', mode === 'login');
    document.getElementById('tab-register').classList.toggle('active', mode === 'register');
    document.getElementById('form-login').style.display = mode === 'login' ? 'block' : 'none';
    document.getElementById('form-register').style.display = mode === 'register' ? 'block' : 'none';
    document.getElementById('form-verify').style.display = 'none';
    showAuthError('');
}

function showAuthError(msg) {
    const el = document.getElementById('authError');
    if (!el) return;
    if (!msg) { el.classList.remove('active'); el.textContent = ''; return; }
    el.textContent = msg;
    el.classList.add('active');
}

async function handleLogin() {
    if (!supabaseClient) { showAuthError('Сервис авторизации недоступен'); return; }
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    if (!email || !password) { showAuthError('Заполните все поля'); return; }
    const btn = document.getElementById('login-btn');
    btn.disabled = true; btn.textContent = 'Вход...'; showAuthError('');
    try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) throw error;
        MY_ID = data.user.id;
        MY_NAME = data.user.user_metadata?.nickname || 'Игрок';
        hideAuthScreen();
        await loadProfileData();
        loadHomePage();
    } catch {
        showAuthError('Неверный email или пароль');
    } finally {
        btn.disabled = false; btn.textContent = 'Войти';
    }
}

async function handleRegister() {
    if (!supabaseClient) { showAuthError('Сервис авторизации недоступен'); return; }
    const email = document.getElementById('reg-email').value.trim();
    const nickname = document.getElementById('reg-nickname').value.trim();
    const password = document.getElementById('reg-password').value;
    if (!email || !nickname || !password) { showAuthError('Заполните все поля'); return; }
    if (nickname.length < 3) { showAuthError('Никнейм должен быть не менее 3 символов'); return; }
    if (nickname.length > 12) { showAuthError('Никнейм должен быть не более 12 символов'); return; }
    if (!/^[a-zA-Z0-9_]+$/.test(nickname)) { showAuthError('Только латиница, цифры и _'); return; }
    if (password.length < 6) { showAuthError('Пароль должен быть не менее 6 символов'); return; }
    const btn = document.getElementById('register-btn');
    btn.disabled = true; btn.textContent = 'Проверка...'; showAuthError('');
    try {
        const { data: existing } = await supabaseClient.from('users').select('id').ilike('name', nickname).limit(1);
        if (existing && existing.length > 0) {
            showAuthError('Этот никнейм уже занят');
            btn.disabled = false; btn.textContent = 'Создать аккаунт';
            return;
        }
        btn.textContent = 'Регистрация...';
        const { data, error } = await supabaseClient.auth.signUp({ email, password, options: { data: { nickname } } });
        if (error) throw error;
        if (data.session) {
            MY_ID = data.user.id;
            MY_NAME = nickname;
            await supabaseClient.from('users').upsert({
                id: data.user.id, name: nickname, avatar_url: '',
                xp: 0, coins: 0, episodes_watched: 0, minutes_watched: 0,
                days_streak: 1, unlocked_achievements: []
            }, { onConflict: 'id' });
            hideAuthScreen();
            await loadProfileData();
            loadHomePage();
            showToast('Добро пожаловать!');
            return;
        }
        PENDING_VERIFY_EMAIL = email;
        document.getElementById('form-register').style.display = 'none';
        document.getElementById('form-verify').style.display = 'block';
        document.getElementById('authError').classList.remove('active');
        showToast('Код отправлен на почту!');
    } catch (e) {
        showAuthError(e.message || 'Ошибка регистрации');
    } finally {
        btn.disabled = false; btn.textContent = 'Создать аккаунт';
    }
}

async function handleVerifyCode() {
    if (!supabaseClient) { showAuthError('Сервис авторизации недоступен'); return; }
    const code = document.getElementById('verify-code').value.trim();
    if (!code || code.length !== 8) { showAuthError('Введите 8-значный код'); return; }
    const btn = document.getElementById('verify-btn');
    btn.disabled = true; btn.textContent = 'Проверка...'; showAuthError('');
    try {
        const { data, error } = await supabaseClient.auth.verifyOtp({ email: PENDING_VERIFY_EMAIL, token: code, type: 'signup' });
        if (error) throw error;
        if (data.session) {
            MY_ID = data.user.id;
            MY_NAME = data.user.user_metadata?.nickname || 'Игрок';
            await supabaseClient.from('users').upsert({
                id: MY_ID, name: MY_NAME, avatar_url: '',
                xp: 0, coins: 0, episodes_watched: 0, minutes_watched: 0,
                days_streak: 1, unlocked_achievements: []
            }, { onConflict: 'id' });
            hideAuthScreen();
            await loadProfileData();
            loadHomePage();
            showToast('Почта подтверждена!');
        }
    } catch {
        showAuthError('Неверный или просроченный код');
    } finally {
        btn.disabled = false; btn.textContent = 'Подтвердить';
    }
}

function hideAuthScreen() { document.getElementById('authScreen')?.classList.remove('active'); }
function showAuthScreen() { document.getElementById('authScreen')?.classList.add('active'); }

async function initAuth() {
    if (!supabaseClient) { showAuthScreen(); return; }
    supabaseClient.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' && session?.user && !MY_ID) {
            MY_ID = session.user.id;
            MY_NAME = session.user.user_metadata?.nickname || 'Игрок';
            hideAuthScreen();
            try { await loadProfileData(); } catch (e) { console.error(e); }
        }
        if (event === 'SIGNED_OUT') {
            MY_ID = null;
            MY_NAME = 'Гость';
            showAuthScreen();
        }
    });
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (session?.user) {
            MY_ID = session.user.id;
            MY_NAME = session.user.user_metadata?.nickname || 'Игрок';
            const { data: dbUser } = await supabaseClient.from('users').select('id').eq('id', MY_ID).single();
            if (!dbUser) {
                await supabaseClient.from('users').upsert({
                    id: MY_ID, name: MY_NAME, avatar_url: '',
                    xp: 0, coins: 0, episodes_watched: 0, minutes_watched: 0,
                    days_streak: 1, unlocked_achievements: []
                }, { onConflict: 'id' });
            }
            hideAuthScreen();
            return;
        }
    } catch (e) { console.error(e); }
    showAuthScreen();
}

async function signOut() {
    try { if (supabaseClient) await supabaseClient.auth.signOut(); } catch {}
    localStorage.removeItem('onika_stats');
    location.reload();
}

// ==========================================
// 2. SKELETONS + RIPPLE
// ==========================================
const Skeletons = {
    cards(count = 6) {
        let h = '';
        for (let i = 0; i < count; i++) h += `<div class="skeleton-card"><div class="skeleton skeleton-poster"></div><div class="skeleton-card-title"></div></div>`;
        return h;
    },
    friends(count = 3) {
        let h = '';
        for (let i = 0; i < count; i++) h += `<div class="skeleton-friend"><div class="skeleton skeleton-circle"></div><div class="skeleton-friend-info"><div class="skeleton skeleton-text"></div><div class="skeleton skeleton-text short"></div></div></div>`;
        return h;
    },
    shopItems(count = 4) {
        let h = '';
        for (let i = 0; i < count; i++) h += `<div class="skeleton-shop-item"><div class="skeleton skeleton-shop-img"></div><div class="skeleton-shop-info"><div class="skeleton skeleton-text"></div><div class="skeleton skeleton-text short"></div></div></div>`;
        return h;
    }
};

document.addEventListener('pointerdown', function (e) {
    const btn = e.target.closest('.ripple-btn, .btn-primary, .filter-btn, .genre-pill, .my-list-tab, .tab-btn');
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    ripple.style.width = ripple.style.height = size + 'px';
    ripple.style.left = (e.clientX - rect.left - size / 2) + 'px';
    ripple.style.top = (e.clientY - rect.top - size / 2) + 'px';
    if (!btn.classList.contains('ripple-btn')) btn.classList.add('ripple-btn');
    btn.appendChild(ripple);
    setTimeout(() => ripple.remove(), 650);
}, { passive: true });

// ==========================================
// 3. API
// ==========================================
const PROXY_URL = 'https://onika-api.relaxdev.ru/?target=';
const ANILIST_URL = 'https://graphql.anilist.co';
const SHIKIMORI_GRAPHQL = 'https://shikimori.io/api/graphql';
const ANILIBRIA_API = 'https://aniliberty.top/api/v1';

const API_AniList = {
    async fetch(query, variables = {}, signal) {
        const res = await fetch(PROXY_URL + encodeURIComponent(ANILIST_URL), {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, variables }), signal
        });
        if (!res.ok) throw new Error('AniList HTTP ' + res.status);
        const d = await res.json();
        if (d.errors) throw new Error('AniList: ' + d.errors[0].message);
        return d.data;
    },
    _mediaFields: `id idMal title{romaji english native} averageScore episodes status format seasonYear coverImage{extraLarge large medium} genres trailer{id}`,
    async getCatalog(page, limit, filters, signal) {
        const perPage = Math.min(limit || 30, 50);
        const vars = { page: page || 1, perPage };
        let args = ['type: ANIME', 'sort: POPULARITY_DESC', 'genre_not_in: ["Hentai", "Ecchi", "Erotica"]'];
        if (filters && filters.search) { vars.search = filters.search; args.push('search: $search'); }
        if (filters && filters.year) { vars.seasonYear = parseInt(filters.year); args.push('seasonYear: $seasonYear'); }
        if (filters && filters.genre) { vars.genre = filters.genre; args.push('genre: $genre'); }
        if (filters && filters.status) {
            const m = { ongoing: 'RELEASING', released: 'FINISHED', anons: 'NOT_YET_RELEASED' };
            vars.status = m[filters.status];
            if (vars.status) args.push('status: $status');
        }
        const sortMap = { popularity: 'POPULARITY_DESC', ranked: 'SCORE_DESC', aired_on: 'START_DATE_DESC', newest: 'START_DATE_DESC', oldest: 'START_DATE_ASC' };
        const sort = sortMap[filters?.sort] || 'POPULARITY_DESC';
        const q = `query($page:Int,$perPage:Int${vars.search ? ', $search:String' : ''}${vars.seasonYear ? ', $seasonYear:Int' : ''}${vars.genre ? ', $genre:String' : ''}${vars.status ? ', $status:MediaStatus' : ''}){Page(page:$page,perPage:$perPage){media(${args.filter(a => !a.startsWith('sort')).join(', ')},sort:${sort}){${this._mediaFields}}}}`;
        const data = await this.fetch(q, vars, signal).catch(e => { if (e.name === 'AbortError') throw e; return null; });
        return data?.Page?.media || [];
    },
    async getDetails(id, signal) {
        const cleanId = String(id).replace('anilist_', '');
        const q = `query($id:Int){Media(id:$id,type:ANIME){${this._mediaFields} description(asHtml:false) nextAiringEpisode{airingAt timeUntilAiring episode} relations{edges{relationType node{id idMal title{romaji english native} coverImage{large} seasonYear format}}}}}`;
        const data = await this.fetch(q, { id: parseInt(cleanId) }, signal).catch(e => { if (e.name === 'AbortError') throw e; return null; });
        return data?.Media || null;
    },
    async getGenresBatch(ids) {
        if (!ids.length) return [];
        const q = `query($ids:[Int]) { Page(page: 1, perPage: 50) { media(id_in: $ids, type: ANIME) { id genres } } }`;
        const data = await this.fetch(q, { ids: ids.map(Number) }).catch(() => null);
        return data?.Page?.media || [];
    },
    async getRandom(limit, signal) {
        const q = `query($page:Int,$perPage:Int){Page(page:$page,perPage:$perPage){media(type:ANIME,sort:POPULARITY_DESC,genre_not_in:["Hentai","Ecchi","Erotica"]){${this._mediaFields}}}}`;
        const data = await this.fetch(q, { page: 1, perPage: Math.min((limit || 5) * 6, 50) }, signal).catch(e => { if (e.name === 'AbortError') throw e; return null; });
        return (data?.Page?.media || []).sort(() => Math.random() - 0.5).slice(0, limit || 5);
    },
    async getSeasonal(limit, signal) {
        const now = new Date();
        const month = now.getMonth();
        let season = 'WINTER';
        if (month >= 3 && month < 6) season = 'SPRING';
        else if (month >= 6 && month < 9) season = 'SUMMER';
        else if (month >= 9) season = 'FALL';
        const q = `query($page:Int,$perPage:Int,$season:MediaSeason,$seasonYear:Int){Page(page:$page,perPage:$perPage){media(type:ANIME,season:$season,seasonYear:$seasonYear,sort:POPULARITY_DESC,genre_not_in:["Hentai","Ecchi","Erotica"]){${this._mediaFields}}}}`;
        const data = await this.fetch(q, { page: 1, perPage: Math.min((limit || 6) * 2, 50), season, seasonYear: now.getFullYear() }, signal).catch(e => { if (e.name === 'AbortError') throw e; return null; });
        return (data?.Page?.media || []).slice(0, limit || 6);
    },
    async getUpcoming(limit, signal) {
        const now = new Date();
        const month = now.getMonth();
        let season = 'WINTER', year = now.getFullYear();
        if (month >= 0 && month < 3) season = 'SPRING';
        else if (month >= 3 && month < 6) season = 'SUMMER';
        else if (month >= 6 && month < 9) season = 'FALL';
        else { season = 'WINTER'; year += 1; }
        const q = `query($page:Int,$perPage:Int,$season:MediaSeason,$seasonYear:Int){Page(page:$page,perPage:$perPage){media(type:ANIME,season:$season,seasonYear:$seasonYear,status:NOT_YET_RELEASED,sort:POPULARITY_DESC,genre_not_in:["Hentai","Ecchi","Erotica"]){${this._mediaFields}}}}`;
        const data = await this.fetch(q, { page: 1, perPage: Math.min((limit || 6) * 2, 50), season, seasonYear: year }, signal).catch(e => { if (e.name === 'AbortError') throw e; return null; });
        return (data?.Page?.media || []).slice(0, limit || 6);
    },
    async getTopRated(limit = 6, signal) {
        const q = `query($page:Int,$perPage:Int){Page(page:$page,perPage:$perPage){media(type:ANIME,sort:SCORE_DESC,genre_not_in:["Hentai","Ecchi","Erotica"]){${this._mediaFields}}}}`;
        const data = await this.fetch(q, { page: 1, perPage: Math.min(limit, 50) }, signal).catch(e => { if (e.name === 'AbortError') throw e; return null; });
        return data?.Page?.media || [];
    }
};

const API_AniLibria = {
    async searchRussian(searchTitle) {
        if (!searchTitle) return null;
        const cleanSearch = searchTitle.replace(/\s*\([^)]*\)/g, '').trim();
        if (!cleanSearch) return null;
        const url = `${ANILIBRIA_API}/anime/releases?f[search]=${encodeURIComponent(cleanSearch)}&limit=1`;
        try {
            const res = await fetch(PROXY_URL + encodeURIComponent(url));
            if (!res.ok) return null;
            const data = await res.json();
            const item = data?.data && data.data[0];
            if (item) return item.name?.main || item.name?.english || null;
        } catch {}
        return null;
    }
};

const API_Shikimori = {
    async fetchGraphQL(query) {
        const res = await fetch(PROXY_URL + encodeURIComponent(SHIKIMORI_GRAPHQL), {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query })
        });
        if (!res.ok) throw new Error('Shikimori HTTP ' + res.status);
        const d = await res.json();
        if (d.errors) throw new Error('Shikimori: ' + d.errors[0].message);
        return d.data;
    },
    async getRussianData(searchTitle) {
        if (!searchTitle) return { russian: null, description: null };
        const clean = searchTitle.replace(/\s*\([^)]*\)/g, '').trim();
        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                const q = `{animes(search:"${clean.replace(/"/g, '')}",limit:1){id name russian description}}`;
                const d = await this.fetchGraphQL(q);
                if (d.animes && d.animes.length) return { russian: d.animes[0].russian || null, description: d.animes[0].description || null };
                break;
            } catch { if (attempt === 1) await new Promise(r => setTimeout(r, 300)); }
        }
        return { russian: null, description: null };
    }
};

async function getCachedAnimeBatch(ids) {
    if (!supabaseClient || !ids.length) return new Map();
    try {
        const { data } = await supabaseClient.from('anime_cache').select('*').in('id', ids.map(String));
        const map = new Map();
        (data || []).forEach(d => map.set(String(d.id), d));
        return map;
    } catch { return new Map(); }
}

async function saveCachedAnimeBatch(animeObjects) {
    if (!supabaseClient || !animeObjects.length) return;
    try {
        const payload = animeObjects.map(a => ({
            id: String(a.rawId ?? a.id).replace('anilist_', ''),
            title_ru: a.title_ru, title_raw: a.title_raw,
            image_url: a.images?.jpg?.image_url || '',
            description: a.description, genres: a.genres,
            score: a.score, year: a.year, episodes: a.episodes,
            status: a.status, kind: a.kind,
            updated_at: new Date().toISOString()
        }));
        await supabaseClient.from('anime_cache').upsert(payload, { onConflict: 'id' });
    } catch (e) { console.warn('Batch cache save failed:', e); }
}

function buildAnimeObjectFromCache(raw, cached) {
    const searchTitle = raw.title?.english || raw.title?.romaji || raw.title?.native || '';
    if (cached && cached.title_ru) {
        return {
            id: 'anilist_' + raw.id, rawId: raw.id, idMal: raw.idMal,
            title_ru: cached.title_ru, title_raw: cached.title_raw || searchTitle, title: cached.title_ru,
            year: cached.year || raw.seasonYear || '--', episodes: cached.episodes || raw.episodes || '?',
            images: { jpg: { image_url: cached.image_url || raw.coverImage?.extraLarge || raw.coverImage?.large || '' } },
            description: cached.description || raw.description || 'Описание отсутствует.',
            genres: cached.genres || raw.genres || [],
            score: cached.score || (raw.averageScore ? (raw.averageScore / 10).toFixed(1) : 0),
            status: cached.status || (raw.status === 'RELEASING' ? 'Онгоинг' : raw.status === 'FINISHED' ? 'Завершено' : 'Анонс'),
            kind: cached.kind || raw.format || 'TV', trailerId: raw.trailer?.id || null,
            relations: raw.relations || null, nextAiringEpisode: raw.nextAiringEpisode || null
        };
    }
    return null;
}

function buildRawAnimeObject(raw, finalRussianTitle, cleanDesc) {
    const searchTitle = raw.title?.english || raw.title?.romaji || raw.title?.native || '';
    return {
        id: 'anilist_' + raw.id, rawId: raw.id, idMal: raw.idMal,
        title_ru: finalRussianTitle, title_raw: searchTitle, title: finalRussianTitle,
        year: raw.seasonYear || '--', episodes: raw.episodes || '?',
        images: { jpg: { image_url: raw.coverImage?.extraLarge || raw.coverImage?.large || '' } },
        description: cleanDesc, genres: raw.genres || [],
        score: raw.averageScore ? (raw.averageScore / 10).toFixed(1) : 0,
        status: raw.status === 'RELEASING' ? 'Онгоинг' : raw.status === 'FINISHED' ? 'Завершено' : 'Анонс',
        kind: raw.format || 'TV', trailerId: raw.trailer?.id || null,
        relations: raw.relations || null, nextAiringEpisode: raw.nextAiringEpisode || null
    };
}

async function processWithLimit(items, limit, asyncProcessor) {
    const results = new Array(items.length);
    let cursor = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (true) {
            const i = cursor++;
            if (i >= items.length) return;
            try { results[i] = await asyncProcessor(items[i], i); } catch { results[i] = null; }
        }
    });
    await Promise.all(workers);
    return results;
}

async function buildAnimeObjectsBatch(rawList) {
    if (!rawList || !rawList.length) return [];
    const ids = rawList.map(r => String(r.id));
    const cachedMap = await getCachedAnimeBatch(ids);
    const results = new Array(rawList.length);
    const toTranslate = [];
    rawList.forEach((raw, i) => {
        const c = cachedMap.get(String(raw.id));
        if (c && c.title_ru) results[i] = buildAnimeObjectFromCache(raw, c);
        else toTranslate.push({ raw, index: i });
    });
    await processWithLimit(toTranslate, 4, async (item) => {
        const { raw, index } = item;
        const searchTitle = raw.title?.english || raw.title?.romaji || raw.title?.native || '';
        let russian = null;
        try { russian = await API_AniLibria.searchRussian(searchTitle); } catch {}
        let shiki = { russian: null, description: null };
        if (!russian) { try { shiki = await API_Shikimori.getRussianData(searchTitle); } catch {} }
        const finalTitle = russian || shiki.russian || searchTitle || 'Без названия';
        let cleanDesc = shiki.description || raw.description || 'Описание отсутствует.';
        cleanDesc = cleanDesc.replace(/\[[^\]]*\]/g, '').replace(/<[^>]*>?/gm, '').trim();
        results[index] = buildRawAnimeObject(raw, finalTitle, cleanDesc);
    });
    const toSave = toTranslate.map(t => results[t.index]).filter(Boolean);
    if (toSave.length) saveCachedAnimeBatch(toSave).catch(() => {});
    return results.filter(Boolean);
}

const API = {
    _cache: new Map(),
    _CACHE_TTL: 30 * 60 * 1000,
    _CACHE_MAX: 200,
    _getCache(key) {
        const item = this._cache.get(key);
        if (item && Date.now() - item.t < this._CACHE_TTL) return item.d;
        if (item) this._cache.delete(key);
        return undefined;
    },
    _setCache(key, data) {
        if (this._cache.size >= this._CACHE_MAX) {
            const first = this._cache.keys().next().value;
            this._cache.delete(first);
        }
        this._cache.set(key, { d: data, t: Date.now() });
    },
    async _cached(key, fn) {
        const cached = this._getCache(key);
        if (cached !== undefined) return cached;
        try { const d = await fn(); if (d) this._setCache(key, d); return d; } catch { return null; }
    },
    getCatalog(page, limit, filters, signal) {
        return this._cached(`c_${page}_${limit}_${JSON.stringify(filters || {})}`, async () => {
            const raw = await API_AniList.getCatalog(page, limit, filters, signal);
            return await buildAnimeObjectsBatch(raw);
        });
    },
    getDetails(id, signal) {
        return this._cached(`d_${id}`, async () => {
            const raw = await API_AniList.getDetails(id, signal);
            if (!raw) return null;
            const batch = await buildAnimeObjectsBatch([raw]);
            return batch[0] || null;
        });
    },
    getRandom(limit, signal) {
        return (async () => {
            const raw = await API_AniList.getRandom(limit, signal);
            return await buildAnimeObjectsBatch(raw);
        })();
    },
    getSeasonal(limit, signal) {
        return this._cached(`s_${limit}`, async () => {
            const raw = await API_AniList.getSeasonal(limit, signal);
            return await buildAnimeObjectsBatch(raw);
        });
    },
    getUpcoming(limit, signal) {
        return this._cached(`u_${limit}`, async () => {
            const raw = await API_AniList.getUpcoming(limit, signal);
            return await buildAnimeObjectsBatch(raw);
        });
    },
    getTopRated(limit, signal) {
        return this._cached(`top_${limit}`, async () => {
            const raw = await API_AniList.getTopRated(limit, signal);
            return await buildAnimeObjectsBatch(raw);
        });
    }
};

// ==========================================
// 4. ИГРА
// ==========================================
let currentAnimeForPlayer = null, selectedVoice = '', selectedPlayer = '';
const VOICES = [{ id: 'anilibria', name: 'AniLibria', icon: '🎙️' }, { id: 'studioband', name: 'StudioBand', icon: '🎙️' }, { id: 'jamclub', name: 'JAM Club', icon: '🎙️' }, { id: 'original', name: 'Оригинал (Субтитры)', icon: '📝' }];
const PLAYERS = [{ id: 'kodik', name: 'Kodik', icon: '▶️' }, { id: 'sibnet', name: 'Sibnet', icon: '🎬' }, { id: 'veoveo', name: 'Veoveo', icon: '🎥' }];

let catalogPage = 1, isCatalogLoading = false, hasMoreCatalog = true, catalogRequestVersion = 0;
let currentFilters = { search: '', genre: '', year: '', status: '', sort: 'popularity' };
let currentMyListFilter = 'all', previousScreen = 'catalog', searchDebounceTimer;
let currentShopTab = 'banners';
let isPreviewMode = false, previewItem = null, savedStats = null;
let currentShopView = 'catalog';

const GENRES = [{ id: '1', name: 'Action', ru: 'Экшен' }, { id: '22', name: 'Romance', ru: 'Романтика' }, { id: '4', name: 'Comedy', ru: 'Комедия' }, { id: '10', name: 'Fantasy', ru: 'Фэнтези' }, { id: '8', name: 'Drama', ru: 'Драма' }, { id: '2', name: 'Adventure', ru: 'Приключения' }, { id: '24', name: 'Sci-Fi', ru: 'Фантастика' }, { id: '36', name: 'Slice of Life', ru: 'Повседневность' }, { id: '41', name: 'Thriller', ru: 'Триллер' }, { id: '14', name: 'Horror', ru: 'Ужасы' }, { id: '7', name: 'Mystery', ru: 'Детектив' }];
const YEARS = [{ id: '2024', name: '2024' }, { id: '2023', name: '2023' }, { id: '2022', name: '2022' }, { id: '2021', name: '2021' }, { id: '2020', name: '2020' }];
const STATUSES = [{ id: 'ongoing', name: 'Онгоинг' }, { id: 'released', name: 'Завершено' }, { id: 'anons', name: 'Анонс' }];
const SORTS = [{ id: 'popularity', name: 'По популярности' }, { id: 'ranked', name: 'По рейтингу' }, { id: 'aired_on', name: 'Новинки' }, { id: 'newest', name: 'Сначала новые' }, { id: 'oldest', name: 'Сначала старые' }];

function switchTab(tabName, element) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const scr = document.getElementById(`screen-${tabName}`);
    if (scr) scr.classList.add('active');
    const nav = document.querySelector('.bottom-nav');
    if (nav) {
        if (tabName === 'shop' || tabName === 'settings' || tabName === 'preview') nav.style.display = 'none';
        else nav.style.display = 'flex';
    }
    if (element) {
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        element.classList.add('active');
    } else if (['home', 'catalog', 'my', 'friends', 'profile'].includes(tabName)) {
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        const map = { home: 0, catalog: 1, my: 2, friends: 3, profile: 4 };
        const items = document.querySelectorAll('.nav-item');
        if (map[tabName] !== undefined && items[map[tabName]]) items[map[tabName]].classList.add('active');
    }
    if (tabName !== 'home') stopSlideShow();
    if (tabName === 'profile') loadProfileData();
    if (tabName === 'catalog' && document.getElementById('catalog-grid').children.length === 0) {
        initCatalogFilters();
        loadCatalog(true);
    }
    if (tabName === 'my') renderMyList();
    if (tabName === 'voice') { document.getElementById('voice-title').textContent = 'Выбор озвучки'; renderVoiceSelection(); }
    if (tabName === 'player') { document.getElementById('player-title').textContent = 'Выбор плеера'; renderPlayerSelection(); }
    if (tabName === 'episodes') { document.getElementById('eps-title').textContent = 'Выбор серии'; renderEpisodesSelection(); }
    if (tabName === 'friends') {
        const friendIdEl = document.getElementById('my-friend-id');
        if (friendIdEl) friendIdEl.textContent = MY_PUBLIC_ID || '...';
        loadFriends();
    }
    if (tabName === 'achievements') renderAchievementsPage();
    if (tabName === 'history') renderWatchHistory();
    if (tabName === 'shop') {
        currentShopView = 'catalog';
        switchShopView('catalog');
        setElText('shop-coins', getStats().coins);
    }
}

function goBackFromDetail() {
    if (previousScreen === 'my') switchTab('my');
    else if (previousScreen === 'home') switchTab('home');
    else if (previousScreen === 'friends') switchTab('friends');
    else switchTab('catalog');
}

function toggleFilters() {
    const w = document.getElementById('filters-wrapper');
    const c = document.getElementById('filter-chevron');
    if (!w) return;
    if (w.classList.contains('filters-collapsed')) {
        w.classList.remove('filters-collapsed');
        if (c) c.style.transform = 'rotate(180deg)';
    } else {
        w.classList.add('filters-collapsed');
        if (c) c.style.transform = 'rotate(0deg)';
    }
}

function resetCatalogFilters() {
    currentFilters = { search: '', genre: '', year: '', status: '', sort: 'popularity' };
    document.getElementById('search-input').value = '';
    const y = document.getElementById('filter-btn-year'); if (y) y.innerHTML = 'Год ⌄';
    const s = document.getElementById('filter-btn-status'); if (s) s.innerHTML = 'Статус ⌄';
    const so = document.getElementById('filter-btn-sort'); if (so) so.innerHTML = 'Сортировка ⌄';
    document.querySelectorAll('#genre-filters .genre-pill').forEach(el => el.classList.remove('active'));
    const all = document.querySelector('#genre-filters .genre-pill');
    if (all) { all.classList.add('active'); all.innerHTML = '<div class="dot"></div>Все'; }
    loadCatalog(true);
}

function openUserFromTop(id) { previousScreen = 'home'; openFriendProfile(id); }
function openUserFromComments(id) { previousScreen = 'detail'; openFriendProfile(id); }

function applyTitleToElement(titleEl, titleData) {
    if (!titleEl) return;
    if (!titleData) { titleEl.style.display = 'none'; return; }
    titleEl.style.display = 'inline-flex';
    titleEl.className = 'user-title-display';
    titleEl.removeAttribute('data-title');
    titleEl.style.color = '';
    titleEl.style.border = '';
    titleEl.style.background = '';
    titleEl.style.textShadow = '';
    titleEl.style.webkitTextFillColor = '';
    if (titleData.is_animated) {
        titleEl.className = 'user-title-display animated-title';
        titleEl.setAttribute('data-title', titleData.animation_key || 'gold');
        titleEl.innerHTML = `<span class="title-text">${escapeHTML(titleData.name)}</span>`;
    } else {
        titleEl.style.color = titleData.color || '#fff';
        titleEl.style.borderColor = titleData.color || '#fff';
        titleEl.textContent = titleData.name;
    }
}

async function syncProfileToDB(forceLocal = false) {
    if (!MY_ID || !supabaseClient) return;
    let stats = getStats();
    try {
        const payload = {
            id: MY_ID, name: MY_NAME, avatar_url: stats.avatar_url || MY_PHOTO_URL || '',
            episodes_watched: stats.episodesWatched, minutes_watched: stats.minutesWatched,
            days_streak: stats.daysStreak, active_banner: stats.active_banner,
            active_title: stats.active_title, active_effect: stats.active_effect,
            active_badge: stats.active_badge, active_frame: stats.active_frame,
            unlocked_achievements: stats.unlockedAchievements || [],
            last_watched: stats.favedAnime.length > 0 ? stats.favedAnime[stats.favedAnime.length - 1].id : null
        };
        if (forceLocal) { payload.coins = stats.coins; payload.xp = stats.xp; }
        else {
            const { data: remote } = await supabaseClient.from('users').select('coins,xp').eq('id', MY_ID).single();
            if (remote) {
                payload.coins = remote.coins || 0;
                payload.xp = remote.xp || 0;
                if ((remote.coins || 0) > (stats.coins || 0)) stats.coins = remote.coins;
                if ((remote.xp || 0) > (stats.xp || 0)) stats.xp = remote.xp;
                saveStats(stats);
            } else { payload.coins = stats.coins; payload.xp = stats.xp; }
        }
        await supabaseClient.from('users').upsert(payload, { onConflict: 'id' });
    } catch (e) { console.warn('Sync error:', e); }
}

function copyMyId() {
    if (MY_PUBLIC_ID == null) { showToast('ID еще не загружен'); return; }
    navigator.clipboard.writeText(MY_PUBLIC_ID.toString()).then(() => showToast('ID скопирован!')).catch(() => showToast('Ошибка копирования'));
}

function shareMyId() {
    if (MY_PUBLIC_ID == null) { showToast('ID еще не загружен'); return; }
    const text = `Добавь меня в друзья на OnikaAnime! Мой ID: ${MY_PUBLIC_ID}`;
    const url = window.location.href;
    if (navigator.share) navigator.share({ title: 'OnikaAnime', text, url }).catch(() => {});
    else navigator.clipboard.writeText(text).then(() => showToast('Текст скопирован!')).catch(() => {});
}

async function loadProfileData() {
    let stats = getStats();
    if (stats.active_banner_url) ACTIVE_BANNER_URL = stats.active_banner_url;
    if (MY_ID && supabaseClient) {
        try {
            const { data: dbUser } = await supabaseClient.from('users').select('*').eq('id', MY_ID).single();
            if (dbUser) {
                MY_PUBLIC_ID = dbUser.public_id;
                stats.coins = Math.max(stats.coins || 0, dbUser.coins || 0);
                stats.xp = Math.max(stats.xp || 0, dbUser.xp || 0);
                setElText('my-tg-id', MY_PUBLIC_ID || '...');
                setElText('tg-name', dbUser.name || MY_NAME);
                const avEl = document.getElementById('tg-avatar');
                if (avEl) {
                    const u = dbUser.avatar_url || MY_PHOTO_URL;
                    avEl.innerHTML = u ? `<img src="${safeUrl(u)}" style="width:100%;height:100%;object-fit:cover;">` : `<span>${escapeHTML((dbUser.name || '?')[0].toUpperCase())}</span>`;
                }
                if (dbUser.active_banner) {
                    stats.active_banner = dbUser.active_banner;
                    const { data: b } = await supabaseClient.from('banners').select('image_url').eq('id', dbUser.active_banner).single();
                    if (b) { ACTIVE_BANNER_URL = safeUrl(b.image_url); stats.active_banner_url = ACTIVE_BANNER_URL; }
                }
                if (dbUser.active_title) {
                    const { data: t } = await supabaseClient.from('titles').select('*').eq('id', dbUser.active_title).single();
                    if (t) { ACTIVE_TITLE_DATA = t; stats.active_title = t.id; }
                } else { ACTIVE_TITLE_DATA = null; stats.active_title = null; }
                if (dbUser.active_effect) {
                    const { data: e } = await supabaseClient.from('effects').select('*').eq('id', dbUser.active_effect).single();
                    if (e) { ACTIVE_EFFECT_CSS = e.css_class; stats.active_effect = e.id; }
                } else { ACTIVE_EFFECT_CSS = ''; stats.active_effect = null; }
                const nameContainer = document.getElementById('tg-name');
                const oldBadge = document.getElementById('user-badge-img');
                if (dbUser.active_badge) {
                    const { data: bd } = await supabaseClient.from('badges').select('image_url').eq('id', dbUser.active_badge).single();
                    const safeBadge = bd ? safeUrl(bd.image_url) : '';
                    if (safeBadge) {
                        ACTIVE_BADGE_URL = safeBadge;
                        stats.active_badge = dbUser.active_badge;
                        if (oldBadge) oldBadge.remove();
                        if (nameContainer) {
                            const newBadge = document.createElement('img');
                            newBadge.id = 'user-badge-img';
                            newBadge.className = 'user-badge-icon';
                            newBadge.src = safeBadge;
                            newBadge.style.cssText = 'width: 24px; height: 24px; object-fit: contain; display: inline-block; margin-left: 8px;';
                            nameContainer.appendChild(newBadge);
                        }
                    }
                } else {
                    ACTIVE_BADGE_URL = '';
                    stats.active_badge = null;
                    if (oldBadge) oldBadge.remove();
                }
                saveStats(stats);
            }
        } catch (e) { console.error(e); }
    }
    const today = new Date().toDateString();
    if (stats.lastVisit !== today) {
        stats.daysStreak += 1;
        stats.lastVisit = today;
        stats.xp += 5;
        stats.coins += 10;
        stats.watchedToday = [];
        saveStats(stats);
        showToast('Ежедневный вход! +5 XP');
    }
    checkAchievements(stats);
    saveStats(stats);
    const lvl = Math.min(Math.floor(stats.xp / 100) + 1, 999);
    const currentLevelXP = stats.xp - ((lvl - 1) * 100);
    setElText('user-level', lvl);
    setElText('user-xp-current', currentLevelXP);
    setElWidth('user-xp-bar', currentLevelXP + '%');
    setElText('stat-episodes', stats.episodesWatched || 0);
    setElText('stat-streak', stats.daysStreak || 1);
    setElText('stat-achievements', (stats.unlockedAchievements || []).length);
    const total = ACHIEVEMENTS.length;
    setElText('ach-points', stats.unlockedAchievements.length * 10);
    setElText('ach-earned', stats.unlockedAchievements.length);
    setElText('ach-total-count', total);
    setElWidth('ach-bar', (stats.unlockedAchievements.length / total) * 100 + '%');
    const next = ACHIEVEMENTS.find(a => !stats.unlockedAchievements.includes(a.id));
    if (next) { setElText('next-ach-name', next.name); setElText('next-ach-reward', next.coins); }
    else { setElText('next-ach-name', 'Все выполнено!'); setElText('next-ach-reward', '0'); }
    const bEl = document.getElementById('profile-banner');
    if (bEl) bEl.style.backgroundImage = ACTIVE_BANNER_URL ? `url('${ACTIVE_BANNER_URL}')` : 'linear-gradient(180deg, #2a2a3e 0%, #14141f 100%)';
    renderEffectParticles(document.getElementById('particle-effect-container'), ACTIVE_EFFECT_CSS);
    const tCont = document.getElementById('user-title-container'), tEl = document.getElementById('user-active-title');
    if (ACTIVE_TITLE_DATA) { tCont.style.display = 'block'; applyTitleToElement(tEl, ACTIVE_TITLE_DATA); }
    else tCont.style.display = 'none';
    const friendIdEl = document.getElementById('my-friend-id');
    if (friendIdEl && MY_PUBLIC_ID) friendIdEl.textContent = MY_PUBLIC_ID;
    await syncProfileToDB();
    loadProfileStats(null, false);
    loadGenreChart(MY_ID, false);
}

async function loadProfileStats(userId = null, isFriend = false) {
    const targetId = userId || MY_ID;
    if (!supabaseClient || !targetId) return;
    const prefix = isFriend ? 'friend-' : '';
    try {
        const { data: lists, error } = await supabaseClient.from('user_lists').select('status').eq('user_id', targetId);
        if (error) throw error;
        const counts = { watching: 0, planned: 0, completed: 0, dropped: 0, favorite: 0 };
        (lists || []).forEach(item => { if (counts[item.status] !== undefined) counts[item.status]++; });
        const el = (id) => document.getElementById(prefix + id);
        if (el('stat-watching')) el('stat-watching').textContent = counts.watching;
        if (el('stat-planned')) el('stat-planned').textContent = counts.planned;
        if (el('stat-completed')) el('stat-completed').textContent = counts.completed;
        if (el('stat-favorite')) el('stat-favorite').textContent = counts.favorite;
        if (el('stat-dropped')) el('stat-dropped').textContent = counts.dropped;
        let minutes = 0;
        if (isFriend) {
            const { data: friendData } = await supabaseClient.from('users').select('minutes_watched').eq('id', targetId).single();
            if (friendData) minutes = friendData.minutes_watched || 0;
        } else minutes = getStats().minutesWatched || 0;
        const totalHours = Math.floor(minutes / 60);
        const days = Math.floor(totalHours / 24);
        const hours = totalHours % 24;
        if (el('stat-total-time')) el('stat-total-time').textContent = `~ ${days} дн. ${hours} ч.`;
        const total = counts.watching + counts.planned + counts.completed + counts.dropped + counts.favorite;
        const donut = el('donut-chart');
        if (!donut) return;
        if (total === 0) { donut.style.background = 'conic-gradient(#2a2a3e 0% 100%)'; return; }
        const pWatching = (counts.watching / total) * 100;
        const pPlanned = (counts.planned / total) * 100;
        const pCompleted = (counts.completed / total) * 100;
        const pDropped = (counts.dropped / total) * 100;
        const pFavorite = (counts.favorite / total) * 100;
        let acc = 0;
        const stops = [];
        if (counts.completed > 0) { stops.push(`#5b5bff ${acc}% ${acc + pCompleted}%`); acc += pCompleted; }
        if (counts.watching > 0) { stops.push(`#6b8e23 ${acc}% ${acc + pWatching}%`); acc += pWatching; }
        if (counts.planned > 0) { stops.push(`#a259ff ${acc}% ${acc + pPlanned}%`); acc += pPlanned; }
        if (counts.favorite > 0) { stops.push(`#ff69b4 ${acc}% ${acc + pFavorite}%`); acc += pFavorite; }
        if (counts.dropped > 0) { stops.push(`#e74c3c ${acc}% ${acc + pDropped}%`); acc += pDropped; }
        donut.style.background = `conic-gradient(${stops.join(', ')})`;
    } catch (e) { console.error('Ошибка загрузки статистики:', e); }
}

async function loadGenreChart(userId, isFriend) {
    const containerId = isFriend ? 'friend-genre-chart-container' : 'genre-chart-container';
    const container = document.getElementById(containerId);
    if (!container || !supabaseClient || !userId) return;
    container.innerHTML = '<div style="color: #888; font-size: 12px; text-align: center; width: 100%;">Загрузка данных...</div>';
    try {
        const { data: lists } = await supabaseClient.from('user_lists').select('anime_id').eq('user_id', userId);
        if (!lists || lists.length === 0) {
            container.innerHTML = '<div style="color: #888; font-size: 12px; text-align: center; width: 100%;">Нет данных для анализа (список пуст).</div>';
            return;
        }
        const animeIds = lists.map(l => String(l.anime_id).replace('anilist_', ''));
        const cacheMap = await getCachedAnimeBatch(animeIds);
        const missingIds = animeIds.filter(id => {
            const cached = cacheMap.get(id);
            return !cached || !cached.genres || cached.genres.length === 0;
        });
        if (missingIds.length > 0) {
            const toFetch = missingIds.slice(0, 50);
            const fetchedGenres = await API_AniList.getGenresBatch(toFetch);
            fetchedGenres.forEach(item => {
                if (item.genres && item.genres.length > 0) {
                    const existing = cacheMap.get(String(item.id)) || {};
                    existing.genres = item.genres;
                    cacheMap.set(String(item.id), existing);
                }
            });
        }
        const genreCounts = {};
        cacheMap.forEach(anime => {
            if (anime.genres && Array.isArray(anime.genres)) {
                anime.genres.forEach(g => { genreCounts[g] = (genreCounts[g] || 0) + 1; });
            }
        });
        const sortedGenres = Object.entries(genreCounts).sort((a, b) => b[1] - a[1]).slice(0, 6);
        if (sortedGenres.length === 0) {
            container.innerHTML = '<div style="color: #888; font-size: 12px; text-align: center; width: 100%;">Жанры не найдены.</div>';
            return;
        }
        const maxCount = sortedGenres[0][1];
        const maxBarHeight = 90;
        container.innerHTML = sortedGenres.map(([genre, count], index) => {
            const heightPx = Math.max(28, (count / maxCount) * maxBarHeight);
            const isTop = index === 0;
            const bgColor = 'linear-gradient(180deg, #8A2BE2 0%, #5b5bff 100%)';
            const glow = 'box-shadow: 0 0 15px rgba(138,43,226,0.6);';
            const ruMap = { 'Slice of Life': 'Повседневность', 'Sci-Fi': 'Фантастика', 'Action': 'Экшен', 'Romance': 'Романтика', 'Comedy': 'Комедия', 'Fantasy': 'Фэнтези', 'Drama': 'Драма', 'Adventure': 'Приключения', 'Mystery': 'Детектив', 'Thriller': 'Триллер', 'Horror': 'Ужасы' };
            const displayGenre = ruMap[genre] || genre;
            return `<div style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%;"><div style="width: 100%; max-width: 24px; height: ${heightPx}px; background: ${bgColor}; border-radius: 6px; ${glow} position: relative; transition: height 0.5s ease-out; display: flex; align-items: center; justify-content: center;"><div style="font-size: 9px; font-weight: bold; color: #fff; position: absolute; top: 3px; left: 50%; transform: translateX(-50%); z-index: 2; text-shadow: 0 1px 2px rgba(0,0,0,0.5);">${count}</div>${isTop ? `<div style="position: absolute; top: -20px; left: 50%; transform: translateX(-50%); white-space: nowrap; background: rgba(91,91,255,0.2); border: 1px solid #5b5bff; color: #fff; font-size: 9px; padding: 2px 6px; border-radius: 8px; z-index: 10;">#1</div>` : ''}</div><div style="font-size: 9px; color: #888; margin-top: 6px; text-align: center; word-break: break-word; line-height: 1.1; height: 22px; display: flex; align-items: center; justify-content: center;">${displayGenre}</div></div>`;
        }).join('');
    } catch (e) {
        console.error('Ошибка графика жанров:', e);
        container.innerHTML = '<div style="color: #ff4444; font-size: 12px; text-align: center; width: 100%;">Ошибка загрузки</div>';
    }
}

async function uploadAvatar(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (!supabaseClient) { showToast('Сервис недоступен'); return; }
    if (!MY_ID) { showToast('Сначала войдите в аккаунт'); return; }
    if (file.size > 5 * 1024 * 1024) { showToast('Файл слишком большой (макс. 5 МБ)'); event.target.value = ''; return; }
    if (!file.type.startsWith('image/')) { showToast('Пожалуйста, выберите изображение'); return; }
    showToast('Обработка фото...');
    try {
        const processedFile = await new Promise((resolve, reject) => {
            const img = new Image();
            const url = URL.createObjectURL(file);
            img.onload = () => {
                URL.revokeObjectURL(url);
                const canvas = document.createElement('canvas');
                const MAX_SIZE = 500;
                let width = img.width;
                let height = img.height;
                if (width > height) { if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; } }
                else { if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; } }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                canvas.toBlob((blob) => {
                    if (!blob) return reject(new Error('Ошибка сжатия'));
                    resolve(new File([blob], 'avatar.jpg', { type: 'image/jpeg' }));
                }, 'image/jpeg', 0.85);
            };
            img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Не удалось прочитать изображение')); };
            img.src = url;
        });
        showToast('Загрузка на сервер...');
        const fileName = `${MY_ID}_${Date.now()}.jpg`;
        const { error: uploadError } = await supabaseClient.storage.from('avatars').upload(fileName, processedFile, { cacheControl: '3600', upsert: true, contentType: 'image/jpeg' });
        if (uploadError) throw new Error(uploadError.message);
        const { data: { publicUrl } } = supabaseClient.storage.from('avatars').getPublicUrl(fileName);
        const { error: dbError } = await supabaseClient.from('users').update({ avatar_url: publicUrl }).eq('id', MY_ID);
        if (dbError) throw dbError;
        let s = getStats(); s.avatar_url = publicUrl; saveStats(s);
        const avatarEl = document.getElementById('tg-avatar');
        if (avatarEl) avatarEl.innerHTML = `<img src="${publicUrl}" style="width:100%; height:100%; object-fit:cover;">`;
        showToast('Аватарка обновлена!');
    } catch (error) {
        console.error('Avatar Upload Error:', error);
        showToast('Ошибка: ' + (error.message || 'неизвестная ошибка'));
    } finally { event.target.value = ''; }
}

function renderEffectParticles(container, effectClass) {
    if (!container) return;
    container.innerHTML = '';
    container.className = 'effect-container';
    if (!effectClass) return;
    container.classList.add(effectClass);
    const count = effectClass === 'effect-matrix' ? 50 : 30;
    const animMap = { 'effect-sparks': 'riseUp', 'effect-sakura': 'fallDown', 'effect-stars': 'twinkle', 'effect-snow': 'snowFall', 'effect-bubbles': 'bubbleUp', 'effect-leaves': 'leafFall', 'effect-matrix': 'matrixFall', 'effect-fire': 'fireRise' };
    const animName = animMap[effectClass] || 'riseUp';
    for (let i = 0; i < count; i++) {
        const span = document.createElement('span');
        const size = effectClass === 'effect-matrix' ? 2 : Math.random() * 4 + 2;
        span.style.left = `${Math.random() * 100}%`;
        span.style.width = `${size}px`;
        span.style.height = effectClass === 'effect-matrix' ? '15px' : `${size}px`;
        span.style.animationName = animName;
        span.style.animationDuration = `${Math.random() * 3 + 2}s`;
        span.style.animationDelay = `${Math.random() * 5}s`;
        container.appendChild(span);
    }
}

// ==========================================
// 6. ПРЕДПРОСМОТР
// ==========================================
function startPreview(type, item) {
    if (isPreviewMode || !item) return;
    isPreviewMode = true;
    previewItem = { type, item };
    savedStats = JSON.parse(JSON.stringify(getStats()));
    savedStats._active_banner_url = ACTIVE_BANNER_URL;
    savedStats._active_title_data = ACTIVE_TITLE_DATA;
    savedStats._active_effect_css = ACTIVE_EFFECT_CSS;
    savedStats._active_badge_url = ACTIVE_BADGE_URL;
    if (type === 'banner') ACTIVE_BANNER_URL = safeUrl(item.image_url);
    else if (type === 'title') ACTIVE_TITLE_DATA = item;
    else if (type === 'effect') ACTIVE_EFFECT_CSS = item.css_class;
    else if (type === 'badge') ACTIVE_BADGE_URL = safeUrl(item.image_url);
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('screen-preview')?.classList.add('active');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    renderPreviewCard();
    const bar = document.getElementById('previewBar');
    const btn = document.getElementById('preview-btn-buy');
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
    if (bannerEl) bannerEl.style.backgroundImage = ACTIVE_BANNER_URL ? `url('${ACTIVE_BANNER_URL}')` : 'linear-gradient(180deg, #2a2a3e 0%, #14141f 100%)';
    const avatarEl = document.getElementById('preview-avatar');
    if (avatarEl) {
        const avUrl = safeUrl(stats.avatar_url || MY_PHOTO_URL);
        if (avUrl) avatarEl.innerHTML = `<img src="${avUrl}" style="width:100%; height:100%; object-fit:cover;">`;
        else avatarEl.innerHTML = `<span>${escapeHTML((MY_NAME || '?')[0].toUpperCase())}</span>`;
    }
    setElText('preview-name', MY_NAME || 'Гость');
    const badgeEl = document.getElementById('preview-badge-img');
    if (badgeEl) {
        if (ACTIVE_BADGE_URL) { badgeEl.src = ACTIVE_BADGE_URL; badgeEl.style.display = 'block'; }
        else badgeEl.style.display = 'none';
    }
    const titleContainer = document.getElementById('preview-title-container');
    const titleEl = document.getElementById('preview-active-title');
    if (titleContainer && titleEl) {
        if (ACTIVE_TITLE_DATA) { titleContainer.style.display = 'block'; applyTitleToElement(titleEl, ACTIVE_TITLE_DATA); }
        else titleContainer.style.display = 'none';
    }
    renderEffectParticles(document.getElementById('preview-particle-container'), ACTIVE_EFFECT_CSS);
}

function cancelPreview() {
    if (!isPreviewMode) return;
    if (savedStats) {
        ACTIVE_BANNER_URL = savedStats._active_banner_url || '';
        ACTIVE_TITLE_DATA = savedStats._active_title_data || null;
        ACTIVE_EFFECT_CSS = savedStats._active_effect_css || '';
        ACTIVE_BADGE_URL = savedStats._active_badge_url || '';
    }
    isPreviewMode = false;
    previewItem = null;
    savedStats = null;
    document.getElementById('previewBar')?.classList.remove('active');
    switchTab('shop');
    switchShopView('catalog');
}

async function executePreview() {
    if (!isPreviewMode || !previewItem) return;
    const { type, item } = previewItem;
    const stats = getStats();
    if (stats.coins < item.price) { showToast('Недостаточно монет!'); return; }
    document.getElementById('previewBar')?.classList.remove('active');
    isPreviewMode = false;
    previewItem = null;
    if (type === 'banner') await buyBanner(item.id, item.price);
    else await buyItem(type, item.id, item.price);
    savedStats = null;
    switchTab('shop');
    switchShopView('catalog');
    await loadProfileData();
}

// ==========================================
// 7. МАГАЗИН
// ==========================================
function switchShopView(view) {
    currentShopView = view;
    document.getElementById('btn-shop-catalog').classList.toggle('active', view === 'catalog');
    document.getElementById('btn-shop-inventory').classList.toggle('active', view === 'inventory');
    renderShopTab(currentShopTab);
    setElText('shop-coins', getStats().coins);
}

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
    if (!supabaseClient) { container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: #888;">Сервис недоступен</div>'; return; }
    try {
        const { data: banners } = await supabaseClient.from('banners').select('*');
        const { data: owned } = await supabaseClient.from('user_banners').select('banner_id').eq('user_id', MY_ID);
        const ownedIds = new Set((owned || []).map(o => o.banner_id));
        if (currentShopTab !== 'banners') return;
        let stats = getStats();
        let itemsToShow = banners || [];
        if (currentShopView === 'inventory') itemsToShow = itemsToShow.filter(b => ownedIds.has(b.id));
        let html = '';
        const rarities = [
            { key: 'common', name: 'Обычные', color: '#ccc', class: 'common' },
            { key: 'rare', name: 'Редкие', color: '#00d2ff', class: 'rare' },
            { key: 'epic', name: 'Эпические', color: '#b44aff', class: 'epic' },
            { key: 'legendary', name: 'Легендарные', color: '#ffd700', class: 'legendary' }
        ];
        rarities.forEach(rarity => {
            const list = itemsToShow.filter(b => (b.rarity || 'common') === rarity.key);
            if (list.length === 0) return;
            html += `<div class="shop-category-header ${rarity.class}"><span style="color: ${rarity.color};">●</span> ${rarity.name}<span class="count">${list.length}</span></div>`;
            list.forEach(b => {
                const isActive = stats.active_banner === b.id;
                const isOwned = ownedIds.has(b.id);
                let btnHtml = isActive
                    ? `<div style="font-size:12px; color:#2ecc71; font-weight:bold; margin-top:5px;">Установлен</div>`
                    : isOwned
                        ? `<div style="font-size:12px; color:#ffd700; font-weight:bold; margin-top:5px;">Надеть</div>`
                        : `<div style="font-size:12px; color:#5b5bff; font-weight:bold; margin-top:5px;">${b.price === 0 ? 'Получить' : b.price + ''}</div>`;
                if (isActive && currentShopView === 'inventory') btnHtml += `<button onclick="event.stopPropagation(); resetBanner();" class="ripple-btn" style="margin-top:5px; background:rgba(255,45,120,0.1); border:1px solid rgba(255,45,120,0.3); color:#ff2d78; padding:4px 8px; border-radius:6px; font-size:11px; width:100%; cursor:pointer;">Снять</button>`;
                const key = cachePreviewItem(b);
                html += `<div class="shop-item" onclick="startPreviewById('banner', '${key}')"><div class="shop-img" style="background-image: url('${safeUrl(b.image_url)}')"></div><div class="shop-info"><div class="shop-name">${escapeHTML(b.name)}</div>${btnHtml}</div></div>`;
            });
        });
        container.innerHTML = html || `<div style="grid-column: 1/-1; text-align: center; color: #888;">${currentShopView === 'inventory' ? 'В инвентаре пусто' : 'Пока нет баннеров'}</div>`;
    } catch (e) {
        console.error(e);
        container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: #ff4444;">Ошибка загрузки</div>';
    }
}

async function renderTitlesInShop(container) {
    if (!supabaseClient) { container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: #888;">Сервис недоступен</div>'; return; }
    try {
        const { data: items } = await supabaseClient.from('titles').select('*');
        const { data: owned } = await supabaseClient.from('user_inventory').select('item_id').eq('user_id', MY_ID).eq('item_type', 'title');
        const ownedIds = new Set((owned || []).map(o => String(o.item_id)));
        if (currentShopTab !== 'titles') return;
        let stats = getStats();
        let itemsToShow = items || [];
        if (currentShopView === 'inventory') itemsToShow = itemsToShow.filter(t => ownedIds.has(String(t.id)));
        let html = '';
        itemsToShow.forEach(t => {
            const isActive = String(stats.active_title) === String(t.id);
            const isOwned = ownedIds.has(String(t.id));
            let btnHtml = isActive
                ? `<div style="font-size:12px; color:#2ecc71; font-weight:bold; margin-top:5px;">Надет</div>`
                : isOwned
                    ? `<div style="font-size:12px; color:#ffd700; font-weight:bold; margin-top:5px;">Надеть</div>`
                    : `<div style="font-size:12px; color:#5b5bff; font-weight:bold; margin-top:5px;">${t.price}</div>`;
            if (isActive && currentShopView === 'inventory') btnHtml += `<button onclick="event.stopPropagation(); resetTitle();" class="ripple-btn" style="margin-top:5px; background:rgba(255,45,120,0.1); border:1px solid rgba(255,45,120,0.3); color:#ff2d78; padding:4px 8px; border-radius:6px; font-size:11px; width:100%; cursor:pointer;">Снять</button>`;
            const titleHtml = t.is_animated
                ? `<div class="user-title-display animated-title" data-title="${escapeHTML(t.animation_key || 'gold')}" style="position:relative; font-size:11px; padding: 3px 10px;"><span class="title-text">${escapeHTML(t.name)}</span></div>`
                : `<div class="user-title-display" style="color:${escapeHTML(t.color)}; border-color:${escapeHTML(t.color)}; font-size:11px; padding: 3px 10px;">${escapeHTML(t.name)}</div>`;
            const key = cachePreviewItem(t);
            html += `<div class="shop-item" onclick="startPreviewById('title', '${key}')"><div class="shop-img" style="background: #111; display:flex; align-items:center; justify-content:center; padding: 10px; box-sizing: border-box; overflow: hidden;">${titleHtml}</div><div class="shop-info"><div class="shop-name">${escapeHTML(t.name)}${t.is_animated ? ' *' : ''}</div>${btnHtml}</div></div>`;
        });
        container.innerHTML = html || `<div style="grid-column: 1/-1; text-align: center; color: #888;">${currentShopView === 'inventory' ? 'В инвентаре пусто' : 'Пока нет титулов'}</div>`;
    } catch (e) {
        console.error(e);
        container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: #ff4444;">Ошибка загрузки</div>';
    }
}

async function renderFramesInShop(container) {
    if (!supabaseClient) { container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: #888;">Сервис недоступен</div>'; return; }
    try {
        const { data: items } = await supabaseClient.from('frames').select('*');
        const { data: owned } = await supabaseClient.from('user_inventory').select('item_id').eq('user_id', MY_ID).eq('item_type', 'frame');
        const ownedIds = new Set((owned || []).map(o => String(o.item_id)));
        if (currentShopTab !== 'frames') return;
        let stats = getStats();
        let itemsToShow = items || [];
        if (currentShopView === 'inventory') itemsToShow = itemsToShow.filter(f => ownedIds.has(String(f.id)));
        let html = '';
        itemsToShow.forEach(f => {
            const isActive = String(stats.active_frame) === String(f.id);
            const isOwned = ownedIds.has(String(f.id));
            let btnHtml = isActive
                ? `<div style="font-size:12px; color:#2ecc71; font-weight:bold; margin-top:5px;">Надета</div>`
                : isOwned
                    ? `<div style="font-size:12px; color:#ffd700; font-weight:bold; margin-top:5px;">Надеть</div>`
                    : `<div style="font-size:12px; color:#5b5bff; font-weight:bold; margin-top:5px;">${f.price}</div>`;
            if (isActive && currentShopView === 'inventory') btnHtml += `<button onclick="event.stopPropagation(); applyFrame(null);" class="ripple-btn" style="margin-top:5px; background:rgba(255,45,120,0.1); border:1px solid rgba(255,45,120,0.3); color:#ff2d78; padding:4px 8px; border-radius:6px; font-size:11px; width:100%; cursor:pointer;">Снять</button>`;
            const key = cachePreviewItem(f);
            html += `<div class="shop-item" onclick="startPreviewById('frame', '${key}')"><div class="shop-img" style="background-image: url('${safeUrl(f.image_url)}')"></div><div class="shop-info"><div class="shop-name">${escapeHTML(f.name)}</div>${btnHtml}</div></div>`;
        });
        container.innerHTML = html || `<div style="grid-column: 1/-1; text-align: center; color: #888;">${currentShopView === 'inventory' ? 'В инвентаре пусто' : 'Пока нет рамок'}</div>`;
    } catch (e) {
        console.error(e);
        container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: #ff4444;">Ошибка загрузки</div>';
    }
}

async function renderEffectsInShop(container) {
    if (!supabaseClient) { container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: #888;">Сервис недоступен</div>'; return; }
    try {
        const { data: items } = await supabaseClient.from('effects').select('*');
        const { data: owned } = await supabaseClient.from('user_inventory').select('item_id').eq('user_id', MY_ID).eq('item_type', 'effect');
        const ownedIds = new Set((owned || []).map(o => String(o.item_id)));
        if (currentShopTab !== 'effects') return;
        let stats = getStats();
        let itemsToShow = items || [];
        if (currentShopView === 'inventory') itemsToShow = itemsToShow.filter(e => ownedIds.has(String(e.id)));
        let html = '';
        itemsToShow.forEach(e => {
            const isActive = String(stats.active_effect) === String(e.id);
            const isOwned = ownedIds.has(String(e.id));
            let btnHtml = isActive
                ? `<div style="font-size:12px; color:#2ecc71; font-weight:bold; margin-top:5px;">Активен</div>`
                : isOwned
                    ? `<div style="font-size:12px; color:#ffd700; font-weight:bold; margin-top:5px;">Надеть</div>`
                    : `<div style="font-size:12px; color:#5b5bff; font-weight:bold; margin-top:5px;">${e.price}</div>`;
            if (isActive && currentShopView === 'inventory') btnHtml += `<button onclick="event.stopPropagation(); resetEffect();" class="ripple-btn" style="margin-top:5px; background:rgba(255,45,120,0.1); border:1px solid rgba(255,45,120,0.3); color:#ff2d78; padding:4px 8px; border-radius:6px; font-size:11px; width:100%; cursor:pointer;">Снять</button>`;
            const key = cachePreviewItem(e);
            html += `<div class="shop-item" onclick="startPreviewById('effect', '${key}')"><div class="shop-img ${e.css_class}" style="background: #111; display:flex; align-items:center; justify-content:center;"><div class="avatar" style="width:40px; height:40px; font-size:12px; background:#333; border:1px solid #555;">AA</div></div><div class="shop-info"><div class="shop-name">${escapeHTML(e.name)}</div>${btnHtml}</div></div>`;
        });
        container.innerHTML = html || `<div style="grid-column: 1/-1; text-align: center; color: #888;">${currentShopView === 'inventory' ? 'В инвентаре пусто' : 'Пока нет эффектов'}</div>`;
    } catch (e) {
        console.error(e);
        container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: #ff4444;">Ошибка загрузки</div>';
    }
}

async function renderBadgesInShop(container) {
    if (!supabaseClient) { container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: #888;">Сервис недоступен</div>'; return; }
    try {
        const { data: items } = await supabaseClient.from('badges').select('*');
        const { data: owned } = await supabaseClient.from('user_inventory').select('item_id').eq('user_id', MY_ID).eq('item_type', 'badge');
        const ownedIds = new Set((owned || []).map(o => String(o.item_id)));
        if (currentShopTab !== 'badges') return;
        let stats = getStats();
        let itemsToShow = items || [];
        if (currentShopView === 'inventory') itemsToShow = itemsToShow.filter(b => ownedIds.has(String(b.id)));
        let html = '';
        const rarities = [
            { key: 'common', name: 'Обычные', color: '#ccc', class: 'common' },
            { key: 'rare', name: 'Редкие', color: '#00d2ff', class: 'rare' },
            { key: 'epic', name: 'Эпические', color: '#b44aff', class: 'epic' },
            { key: 'legendary', name: 'Легендарные', color: '#ffd700', class: 'legendary' }
        ];
        rarities.forEach(rarity => {
            const list = itemsToShow.filter(b => (b.rarity || 'common') === rarity.key);
            if (list.length === 0) return;
            html += `<div class="shop-category-header ${rarity.class}"><span style="color: ${rarity.color};">●</span> ${rarity.name}<span class="count">${list.length}</span></div>`;
            list.forEach(b => {
                const isActive = String(stats.active_badge) === String(b.id);
                const isOwned = ownedIds.has(String(b.id));
                let btnHtml = isActive
                    ? `<div style="font-size:12px; color:#2ecc71; font-weight:bold; margin-top:5px;">Активен</div>`
                    : isOwned
                        ? `<div style="font-size:12px; color:#ffd700; font-weight:bold; margin-top:5px;">Надеть</div>`
                        : `<div style="font-size:12px; color:#5b5bff; font-weight:bold; margin-top:5px;">${b.price}</div>`;
                if (isActive && currentShopView === 'inventory') btnHtml += `<button onclick="event.stopPropagation(); resetBadge();" class="ripple-btn" style="margin-top:5px; background:rgba(255,45,120,0.1); border:1px solid rgba(255,45,120,0.3); color:#ff2d78; padding:4px 8px; border-radius:6px; font-size:11px; width:100%; cursor:pointer;">Снять</button>`;
                const key = cachePreviewItem(b);
                html += `<div class="shop-item" onclick="startPreviewById('badge', '${key}')"><div class="shop-img" style="background: #222; display:flex; align-items:center; justify-content:center;"><img src="${safeUrl(b.image_url)}" style="width:50px; height:50px; object-fit:contain;"></div><div class="shop-info"><div class="shop-name">${escapeHTML(b.name)}</div>${btnHtml}</div></div>`;
            });
        });
        container.innerHTML = html || `<div style="grid-column: 1/-1; text-align: center; color: #888;">${currentShopView === 'inventory' ? 'В инвентаре пусто' : 'Пока нет значков'}</div>`;
    } catch (e) {
        console.error(e);
        container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: #ff4444;">Ошибка загрузки</div>';
    }
}

async function buyItem(type, itemId, price, btnEl = null) {
    const btn = btnEl || (typeof event !== 'undefined' ? event?.target : null);
    if (btn) btn.disabled = true;
    let stats = getStats();
    if (stats.coins < price) { showToast('Недостаточно монет!'); if (btn) btn.disabled = false; return; }
    if (!supabaseClient) { if (btn) btn.disabled = false; return; }
    try {
        const { data: existing } = await supabaseClient.from('user_inventory')
            .select('id').eq('user_id', MY_ID).eq('item_type', type).eq('item_id', itemId).limit(1);
        if (existing && existing.length > 0) {
            if (type === 'title') await applyTitle(itemId);
            else if (type === 'effect') await applyEffect(itemId);
            else if (type === 'badge') await applyBadge(itemId);
            else if (type === 'frame') await applyFrame(itemId);
            if (btn) btn.disabled = false;
            return;
        }
    } catch (e) { console.error(e); }
    stats.coins -= price;
    saveStats(stats);
    try {
        const { error } = await supabaseClient.from('user_inventory').insert({ user_id: MY_ID, item_type: type, item_id: itemId });
        if (error) throw error;
        await syncProfileToDB(true);
        showToast('Покупка успешна!');
        if (type === 'title') await applyTitle(itemId);
        else if (type === 'effect') await applyEffect(itemId);
        else if (type === 'badge') await applyBadge(itemId);
        else if (type === 'frame') await applyFrame(itemId);
        else { await loadProfileData(); renderShopTab(type + 's'); }
        setElText('shop-coins', stats.coins);
    } catch (e) {
        console.error(e);
        stats.coins += price;
        saveStats(stats);
        showToast('Ошибка покупки — монеты возвращены');
        await syncProfileToDB(true);
        setElText('shop-coins', stats.coins);
    } finally {
        if (btn) btn.disabled = false;
    }
}

async function applyTitle(titleId) { if (!supabaseClient) return; let stats = getStats(); try { await supabaseClient.from('users').update({ active_title: titleId }).eq('id', MY_ID); stats.active_title = titleId; saveStats(stats); showToast('Титул надет!'); await loadProfileData(); switchShopView('inventory'); } catch {} }
async function resetTitle() { if (!supabaseClient) return; let stats = getStats(); try { await supabaseClient.from('users').update({ active_title: null }).eq('id', MY_ID); stats.active_title = null; saveStats(stats); ACTIVE_TITLE_DATA = null; showToast('Титул снят'); await loadProfileData(); switchShopView('inventory'); } catch {} }
async function applyEffect(effectId) { if (!supabaseClient) return; let stats = getStats(); try { await supabaseClient.from('users').update({ active_effect: effectId }).eq('id', MY_ID); stats.active_effect = effectId; saveStats(stats); showToast('Эффект надет!'); await loadProfileData(); switchShopView('inventory'); } catch {} }
async function resetEffect() { if (!supabaseClient) return; let stats = getStats(); try { await supabaseClient.from('users').update({ active_effect: null }).eq('id', MY_ID); stats.active_effect = null; saveStats(stats); ACTIVE_EFFECT_CSS = ''; showToast('Эффект снят'); await loadProfileData(); switchShopView('inventory'); } catch {} }
async function applyBadge(badgeId) { if (!supabaseClient) return; let stats = getStats(); try { await supabaseClient.from('users').update({ active_badge: badgeId }).eq('id', MY_ID); stats.active_badge = badgeId; saveStats(stats); showToast('Значок надет!'); await loadProfileData(); switchShopView('inventory'); } catch {} }
async function resetBadge() { if (!supabaseClient) return; let stats = getStats(); try { await supabaseClient.from('users').update({ active_badge: null }).eq('id', MY_ID); stats.active_badge = null; saveStats(stats); ACTIVE_BADGE_URL = ''; showToast('Значок снят'); await loadProfileData(); switchShopView('inventory'); } catch {} }
async function applyFrame(frameId) { if (!supabaseClient) return; let stats = getStats(); try { await supabaseClient.from('users').update({ active_frame: frameId }).eq('id', MY_ID); stats.active_frame = frameId; saveStats(stats); showToast('Рамка обновлена!'); await loadProfileData(); switchShopView('inventory'); } catch {} }

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
            saveStats(stats);
            await syncProfileToDB(true);
            showToast('Баннер надет!');
            await loadProfileData();
            switchShopView('inventory');
            return;
        }
    } catch (e) { console.error(e); }
    stats.coins -= price;
    stats.hasPurchasedBanner = true;
    saveStats(stats);
    try {
        const { error } = await supabaseClient.from('user_banners').insert({ user_id: MY_ID, banner_id: bannerId });
        if (error) throw error;
        stats.active_banner = bannerId;
        const { data: b } = await supabaseClient.from('banners').select('image_url').eq('id', bannerId).single();
        if (b) { stats.active_banner_url = safeUrl(b.image_url); ACTIVE_BANNER_URL = stats.active_banner_url; }
        saveStats(stats);
        checkAchievements(stats);
        await syncProfileToDB(true);
        showToast('Баннер получен!');
        await loadProfileData();
        switchShopView('inventory');
        setElText('shop-coins', stats.coins);
    } catch (e) {
        console.error(e);
        stats.coins += price;
        stats.hasPurchasedBanner = false;
        saveStats(stats);
        showToast('Ошибка — монеты возвращены');
        await syncProfileToDB(true);
        setElText('shop-coins', stats.coins);
    }
}

async function resetBanner() {
    let stats = getStats();
    stats.active_banner = null;
    stats.active_banner_url = '';
    saveStats(stats);
    await syncProfileToDB(true);
    ACTIVE_BANNER_URL = '';
    const bannerEl = document.getElementById('profile-banner');
    if (bannerEl) bannerEl.style.backgroundImage = 'none';
    showToast('Баннер снят');
    await loadProfileData();
    switchShopView('inventory');
}

// ==========================================
// 8. ДРУЗЬЯ
// ==========================================
function switchFriendsTab(tab, element) {
    currentFriendsTab = tab;
    document.querySelectorAll('.my-list-tabs .my-list-tab').forEach(el => el.classList.remove('active'));
    if (element) element.classList.add('active');
    document.getElementById('friends-list-container').style.display = tab === 'friends' ? 'block' : 'none';
    document.getElementById('requests-list-container').style.display = tab === 'requests' ? 'block' : 'none';
    if (tab === 'friends') loadFriends();
    else loadFriendRequests();
}

async function loadFriends() {
    const listContainer = document.getElementById('friends-list-container');
    if (!listContainer || !supabaseClient || !MY_ID) return;
    listContainer.innerHTML = Skeletons.friends(3);
    const friendIdEl = document.getElementById('my-friend-id');
    if (friendIdEl) friendIdEl.textContent = MY_PUBLIC_ID || '...';
    try {
        const { data: accepted } = await supabaseClient.from('friends').select('friend_id').eq('user_id', MY_ID).eq('status', 'accepted');
        if (!accepted || accepted.length === 0) {
            listContainer.innerHTML = `
            <div style="padding: 40px 20px; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                <div style="width: 80px; height: 80px; background: rgba(91,91,255,0.1); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-bottom: 20px;">
                    <svg style="width: 40px; height: 40px; fill: none; stroke: #5b5bff; stroke-width: 1.5;"><use href="#oa-friends"></use></svg>
                </div>
                <h3 style="color: #fff; font-size: 18px; margin-bottom: 8px;">Пока никого нет</h3>
                <p style="color: #888; font-size: 14px; line-height: 1.5; margin-bottom: 20px;">Здесь будут твои друзья. Попроси друга зайти в профиль, скопировать свой ID и отправь его сюда!</p>
                <button onclick="shareMyId()" class="ripple-btn" style="background: linear-gradient(90deg, #5b5bff, #7d7dff); color: #fff; border: none; padding: 14px 24px; border-radius: 14px; font-size: 15px; font-weight: 700; cursor: pointer; box-shadow: 0 8px 25px rgba(91,91,255,0.4); display: flex; align-items: center; gap: 8px;">
                    <svg style="width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2;"><use href="#oa-send"></use></svg> Пригласить друга
                </button>
            </div>`;
            return;
        }
        const accIds = accepted.map(f => f.friend_id);
        const { data: accUsers } = await supabaseClient.from('users').select('*').in('id', accIds);
        if (!accUsers || accUsers.length === 0) {
            listContainer.innerHTML = '<div style="padding: 20px; color: #888; text-align: center;">Ошибка загрузки друзей</div>';
            return;
        }
        let html = '';
        accUsers.forEach(friend => {
            const nameChar = friend.name && friend.name[0] ? escapeHTML(friend.name[0].toUpperCase()) : '?';
            const avatarUrl = friend.avatar_url ? safeUrl(friend.avatar_url) : '';
            html += `<div class="friend-card" data-id="${escapeHTML(String(friend.id))}" onclick="openFriendProfileFromCard(this)"><div class="friend-avatar">${avatarUrl ? `<img src="${avatarUrl}" onerror="this.style.display='none'; this.parentElement.innerHTML='${nameChar}';">` : nameChar}</div><div class="friend-info"><h3>${escapeHTML(friend.name)}</h3><p>ID: ${escapeHTML(friend.public_id || '...')} • Ур. ${Math.floor((friend.xp || 0) / 100) + 1}</p></div><div style="margin-left: auto; color: #5b5bff; font-size: 20px;">›</div></div>`;
        });
        listContainer.innerHTML = html;
    } catch (e) {
        console.error(e);
        listContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: #ff4444;">Ошибка</div>';
    }
}

function openFriendProfileFromCard(el) {
    const id = el.dataset.id;
    if (id) openFriendProfile(id);
}

async function loadFriendRequests() {
    const container = document.getElementById('requests-list-container');
    if (!container || !supabaseClient || !MY_ID) return;
    container.innerHTML = Skeletons.friends(2);
    try {
        const { data: incoming } = await supabaseClient.from('friends').select('user_id').eq('friend_id', MY_ID).eq('status', 'pending');
        const { data: outgoing } = await supabaseClient.from('friends').select('friend_id').eq('user_id', MY_ID).eq('status', 'pending');
        let html = '';
        if (incoming && incoming.length > 0) {
            html += '<h3 style="padding: 0 20px 10px; font-size: 16px; color: #ffd700;">Входящие заявки</h3>';
            const inIds = incoming.map(f => f.user_id);
            const { data: inUsers } = await supabaseClient.from('users').select('*').in('id', inIds);
            if (inUsers && inUsers.length > 0) {
                inUsers.forEach(u => {
                    const nameChar = u.name && u.name[0] ? escapeHTML(u.name[0].toUpperCase()) : '?';
                    const avatarUrl = u.avatar_url ? safeUrl(u.avatar_url) : '';
                    html += `<div class="friend-card" style="background: rgba(255,215,0,0.05); border-color: rgba(255,215,0,0.2);"><div class="friend-avatar">${avatarUrl ? `<img src="${avatarUrl}" onerror="this.style.display='none'; this.parentElement.innerHTML='${nameChar}';">` : nameChar}</div><div class="friend-info"><h3>${escapeHTML(u.name)}</h3><p>ID: ${escapeHTML(u.public_id || '...')}</p></div><div style="display: flex; gap: 8px; margin-left: auto;"><button data-action="accept-friend" data-id="${escapeHTML(String(u.id))}" class="ripple-btn" style="background: #2ecc71; color: #fff; border: none; padding: 8px 12px; border-radius: 10px; font-weight: bold; cursor: pointer; display: flex; align-items: center; justify-content: center;"><svg style="width:16px;height:16px;fill:none;stroke:#fff;stroke-width:2;"><use href="#oa-check"></use></svg></button><button data-action="reject-friend" data-id="${escapeHTML(String(u.id))}" class="ripple-btn" style="background: rgba(255,45,120,0.15); color: #ff2d78; border: 1px solid rgba(255,45,120,0.3); padding: 8px 12px; border-radius: 10px; font-weight: bold; cursor: pointer; display: flex; align-items: center; justify-content: center;"><svg style="width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2;"><use href="#oa-close"></use></svg></button></div></div>`;
                });
            }
        }
        if (outgoing && outgoing.length > 0) {
            html += '<h3 style="padding: 20px 20px 10px; font-size: 16px; color: #00d2ff;">Исходящие заявки</h3>';
            const outIds = outgoing.map(f => f.friend_id);
            const { data: outUsers } = await supabaseClient.from('users').select('*').in('id', outIds);
            if (outUsers && outUsers.length > 0) {
                outUsers.forEach(u => {
                    const nameChar = u.name && u.name[0] ? escapeHTML(u.name[0].toUpperCase()) : '?';
                    const avatarUrl = u.avatar_url ? safeUrl(u.avatar_url) : '';
                    html += `<div class="friend-card" style="opacity: 0.8;"><div class="friend-avatar">${avatarUrl ? `<img src="${avatarUrl}" onerror="this.style.display='none'; this.parentElement.innerHTML='${nameChar}';">` : nameChar}</div><div class="friend-info"><h3>${escapeHTML(u.name)}</h3><p>ID: ${escapeHTML(u.public_id || '...')}</p></div><div style="margin-left: auto; display: flex; align-items: center; gap: 10px;"><span style="font-size: 12px; color: #888;">Ожидает...</span><button data-action="cancel-request" data-id="${escapeHTML(String(u.id))}" class="ripple-btn" style="background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: #ccc; padding: 8px 12px; border-radius: 10px; font-size: 12px; font-weight: 600; cursor: pointer;">Отменить</button></div></div>`;
                });
            }
        }
        if (!html) {
            html = `<div style="padding: 40px 20px; text-align: center;"><div style="width: 60px; height: 60px; background: rgba(91,91,255,0.05); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 15px;"><svg style="width: 30px; height: 30px; fill: none; stroke: #5b5bff; stroke-width: 1.5;"><use href="#oa-message"></use></svg></div><h3 style="color: #fff; font-size: 16px; margin-bottom: 5px;">Заявок нет</h3><p style="color: #888; font-size: 13px;">Входящие и исходящие заявки будут здесь</p></div>`;
        }
        container.innerHTML = html;
    } catch (e) {
        console.error(e);
        container.innerHTML = '<div style="padding: 20px; text-align: center; color: #ff4444;">Ошибка загрузки</div>';
    }
}

document.addEventListener('click', (e) => {
    const acceptBtn = e.target.closest('[data-action="accept-friend"]');
    if (acceptBtn) { e.stopPropagation(); acceptFriend(acceptBtn.dataset.id); return; }
    const rejectBtn = e.target.closest('[data-action="reject-friend"]');
    if (rejectBtn) { e.stopPropagation(); rejectFriend(rejectBtn.dataset.id); return; }
    const cancelBtn = e.target.closest('[data-action="cancel-request"]');
    if (cancelBtn) { e.stopPropagation(); cancelFriendRequest(cancelBtn.dataset.id); return; }
});

async function searchFriend() {
    const searchId = document.getElementById('friend-search-input').value.trim();
    const resultContainer = document.getElementById('search-result-container');
    if (!searchId) return;
    if (!supabaseClient) return;
    if (String(searchId) === String(MY_PUBLIC_ID)) {
        resultContainer.innerHTML = '<div style="color: #ffd700; text-align: center; font-size: 14px; padding: 10px;">Это ваш ID</div>';
        return;
    }
    resultContainer.innerHTML = '<div style="color: #888; text-align: center; font-size: 14px; padding: 10px;">Поиск...</div>';
    try {
        const { data: userData } = await supabaseClient.from('users').select('*').eq('public_id', searchId).single();
        if (!userData) {
            resultContainer.innerHTML = '<div style="color: #ff4444; text-align: center; font-size: 14px; padding: 10px;">Игрок с таким ID не найден</div>';
            return;
        }
        const nameChar = userData.name && userData.name[0] ? escapeHTML(userData.name[0].toUpperCase()) : '?';
        const avatarUrl = userData.avatar_url ? safeUrl(userData.avatar_url) : '';
        resultContainer.innerHTML = `<div class="friend-card" style="margin: 0; background: rgba(91,91,255,0.1); border-color: #5b5bff;"><div class="friend-avatar">${avatarUrl ? `<img src="${avatarUrl}">` : nameChar}</div><div class="friend-info"><h3>${escapeHTML(userData.name)}</h3><p>ID: ${escapeHTML(userData.public_id || '...')}</p></div><button onclick="sendFriendRequest('${escapeHTML(String(userData.id))}')" style="background: #5b5bff; color: #fff; border: none; padding: 8px 15px; border-radius: 10px; font-weight: bold; margin-left: auto; cursor: pointer;">Заявка</button></div>`;
    } catch {
        resultContainer.innerHTML = '<div style="color: #ff4444; text-align: center; font-size: 14px; padding: 10px;">Ошибка поиска</div>';
    }
}

async function sendFriendRequest(friendId) {
    if (!supabaseClient) { showToast('Нет соединения'); return; }
    if (!MY_ID) { showToast('Сначала войдите в аккаунт'); return; }
    if (String(friendId) === String(MY_ID)) { showToast('Нельзя добавить себя'); return; }
    try {
        const { data: existing, error: exErr } = await supabaseClient
            .from('friends').select('id, status')
            .eq('user_id', MY_ID).eq('friend_id', friendId).maybeSingle();
        if (exErr) console.warn('Ошибка проверки заявки:', exErr);
        if (existing) {
            if (existing.status === 'accepted') showToast('Вы уже друзья!');
            else showToast('Заявка уже отправлена');
            return;
        }
        const { data: reverse } = await supabaseClient
            .from('friends').select('id, status')
            .eq('user_id', friendId).eq('friend_id', MY_ID).maybeSingle();
        if (reverse) {
            if (reverse.status === 'accepted') { showToast('Вы уже друзья!'); return; }
            const { error: acceptErr } = await supabaseClient.from('friends')
                .update({ status: 'accepted' }).eq('id', reverse.id);
            if (acceptErr) { console.error(acceptErr); showToast('Ошибка: ' + acceptErr.message); return; }
            await supabaseClient.from('friends').insert({ user_id: MY_ID, friend_id: friendId, status: 'accepted' });
            showToast('Вы теперь друзья!');
            return;
        }
        const { error } = await supabaseClient.from('friends').insert({
            user_id: MY_ID, friend_id: friendId, status: 'pending'
        });
        if (error) {
            console.error('Ошибка отправки заявки:', error);
            if (error.code === '23505') showToast('Заявка уже отправлена');
            else if (error.code === '42501') showToast('Ошибка прав доступа к БД');
            else showToast('Ошибка: ' + (error.message || 'неизвестно'));
            return;
        }
        document.getElementById('search-result-container').innerHTML = '';
        document.getElementById('friend-search-input').value = '';
        showToast('Заявка отправлена!');
        const reqTab = document.querySelector('.my-list-tabs .my-list-tab:nth-child(2)');
        if (reqTab) switchFriendsTab('requests', reqTab);
    } catch (e) {
        console.error('Критическая ошибка:', e);
        showToast('Ошибка соединения');
    }
}

async function acceptFriend(userId) {
    if (!supabaseClient) return;
    try {
        const { error: upErr } = await supabaseClient.from('friends')
            .update({ status: 'accepted' })
            .eq('user_id', userId).eq('friend_id', MY_ID);
        if (upErr) { console.error(upErr); showToast('Ошибка: ' + upErr.message); return; }
        const { error: insErr } = await supabaseClient.from('friends').insert({
            user_id: MY_ID, friend_id: userId, status: 'accepted'
        });
        if (insErr && insErr.code !== '23505') console.error(insErr);
        showToast('Заявка принята!');
        loadFriendRequests();
        loadFriends();
    } catch (e) { console.error(e); showToast('Ошибка'); }
}

async function rejectFriend(userId) {
    if (!supabaseClient) return;
    try {
        await supabaseClient.from('friends').delete().eq('user_id', userId).eq('friend_id', MY_ID);
        showToast('Заявка отклонена');
        loadFriendRequests();
    } catch (e) { console.error(e); }
}

async function cancelFriendRequest(friendId) {
    if (!supabaseClient) return;
    try {
        await supabaseClient.from('friends').delete().eq('user_id', MY_ID).eq('friend_id', friendId).eq('status', 'pending');
        showToast('Заявка отменена');
        loadFriendRequests();
    } catch (e) { console.error(e); showToast('Ошибка'); }
}

async function removeFriend(friendId) {
    if (!supabaseClient) return;
    try {
        const { error } = await supabaseClient.from('friends').delete().or(`and(user_id.eq.${MY_ID},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${MY_ID})`);
        if (error) throw error;
        showToast('Удален из друзей');
        switchTab('friends');
    } catch (e) { console.error(e); showToast('Ошибка удаления'); }
}

async function openFriendProfile(id, name = '') {
    if (!supabaseClient) return;
    if (window._currentFriendLoadingId === id) return;
    window._currentFriendLoadingId = id;
    switchTab('friend-profile');
    const container = document.getElementById('friend-profile-content');
    container.innerHTML = '<div style="text-align: center; padding: 40px; color: #888;">Загрузка...</div>';
    try {
        const { data: friend, error } = await supabaseClient.from('users').select('*').eq('id', id).single();
        if (error || !friend) throw new Error('Не найден');
        let friendshipStatus = 'none';
        if (MY_ID && MY_ID !== id) {
            const { data: outReq } = await supabaseClient.from('friends')
                .select('status').eq('user_id', MY_ID).eq('friend_id', id).limit(1);
            if (outReq && outReq.length > 0) {
                friendshipStatus = outReq[0].status === 'accepted' ? 'accepted' : 'pending_out';
            } else {
                const { data: inReq } = await supabaseClient.from('friends')
                    .select('status').eq('user_id', id).eq('friend_id', MY_ID).limit(1);
                if (inReq && inReq.length > 0) {
                    friendshipStatus = inReq[0].status === 'accepted' ? 'accepted' : 'pending_in';
                }
            }
        }
        const lvl = Math.floor((friend.xp || 0) / 100) + 1;
        const currentLevelXP = (friend.xp || 0) % 100;
        let friendBannerUrl = '';
        if (friend.active_banner) {
            const { data: b } = await supabaseClient.from('banners').select('image_url').eq('id', friend.active_banner).single();
            if (b) friendBannerUrl = safeUrl(b.image_url);
        }
        let friendTitleHtml = '';
        if (friend.active_title) {
            const { data: t } = await supabaseClient.from('titles').select('*').eq('id', friend.active_title).single();
            if (t) {
                if (t.is_animated) friendTitleHtml = `<div class="user-title-display animated-title" data-title="${escapeHTML(t.animation_key || 'gold')}" style="margin-top: 10px;"><span class="title-text">${escapeHTML(t.name)}</span></div>`;
                else friendTitleHtml = `<div class="user-title-display" style="color: ${escapeHTML(t.color)}; border-color: ${escapeHTML(t.color)}; margin-top: 10px;">${escapeHTML(t.name)}</div>`;
            }
        }
        let friendEffectClass = '';
        if (friend.active_effect) {
            const { data: e } = await supabaseClient.from('effects').select('css_class').eq('id', friend.active_effect).single();
            if (e) friendEffectClass = e.css_class;
        }
        let friendBadgeHtml = '';
        if (friend.active_badge) {
            const { data: bd } = await supabaseClient.from('badges').select('image_url').eq('id', friend.active_badge).single();
            const safeBadge = bd ? safeUrl(bd.image_url) : '';
            if (safeBadge) friendBadgeHtml = `<img src="${safeBadge}" class="user-badge-icon" alt="badge">`;
        }
        const avatarUrl = friend.avatar_url ? safeUrl(friend.avatar_url) : '';
        const nameChar = friend.name && friend.name[0] ? escapeHTML(friend.name[0].toUpperCase()) : '?';
        const avatarHtml = avatarUrl ? `<img src="${avatarUrl}" style="width: 100%; height: 100%; object-fit: cover;">` : nameChar;
        container.innerHTML = `
            <div style="padding-bottom: 40px;">
                <div id="friend-profile-banner" style="position: relative; width: 100%; height: 280px; background: ${friendBannerUrl ? `url('${friendBannerUrl}')` : 'linear-gradient(180deg, #2a2a3e 0%, #14141f 100%)'}; background-size: cover; background-position: center; border-bottom-left-radius: 24px; border-bottom-right-radius: 24px;">
                    <div class="effect-container" id="friend-particle-container" style="border-radius: 0 0 24px 24px;"></div>
                    <div style="position: absolute; bottom: -55px; left: 50%; transform: translateX(-50%); z-index: 10;">
                        <div class="avatar-container" id="friend-avatar-wrap" style="position: relative; width: 110px; height: 110px; margin: 0;">
                            <div class="avatar" style="width: 100%; height: 100%; border-radius: 50%; background: #222; border: 4px solid #14141f; display: flex; align-items: center; justify-content: center; font-size: 40px; font-weight: bold; overflow: hidden; position: relative; z-index: 2;">
                                ${avatarHtml}
                            </div>
                        </div>
                    </div>
                </div>
                <div style="padding: 70px 20px 20px 20px; text-align: center; position: relative; z-index: 5;">
                    <h1 style="font-size: 28px; font-weight: 900; color: #fff; margin-bottom: 8px; line-height: 1.1; display: flex; align-items: center; justify-content: center; gap: 8px;">
                        ${escapeHTML(friend.name)}
                        ${friendBadgeHtml}
                    </h1>
                    ${friendTitleHtml ? `<div style="margin-bottom: 15px;">${friendTitleHtml}</div>` : ''}
                    <div class="id-container" style="background: transparent; border: 1px solid rgba(255,255,255,0.15); padding: 10px 20px; border-radius: 16px; display: inline-flex; align-items: center; gap: 10px; margin: 0 auto;">
                        <span style="color: #888; font-size: 13px; font-weight: 500;">ID:</span>
                        <span style="color: #fff; font-weight: 700; font-size: 16px; letter-spacing: 1px;">${escapeHTML(friend.public_id || '...')}</span>
                    </div>
                </div>
                <div style="padding: 0 20px;">
                    <div class="xp-capsule">
                        <div style="position: absolute; left: 0; top: 0; bottom: 0; width: ${currentLevelXP}%; background: linear-gradient(90deg, rgba(123,104,238,0.85), rgba(100,149,237,0.85)); z-index: 1; border-radius: 12px;"></div>
                        <div style="position: relative; z-index: 4; display: flex; justify-content: space-between; align-items: center; width: 100%;">
                            <div style="font-size: 12px; font-weight: 900; color: #fff; text-shadow: 0 1px 3px rgba(0,0,0,0.8);">LVL: ${lvl}</div>
                            <div style="font-size: 11px; font-weight: 700; color: #fff; text-shadow: 0 1px 3px rgba(0,0,0,0.8);">${currentLevelXP} / 100 XP</div>
                        </div>
                    </div>
                </div>
                <div style="padding: 15px 20px;">
                    <div style="display: flex; gap: 10px; justify-content: space-between;">
                        <div class="ripple-btn" style="flex: 1; background: #14141f; border: 1px solid rgba(255,255,255,0.05); border-radius: 16px; padding: 12px 10px; text-align: center; display: flex; flex-direction: column; justify-content: center; align-items: center; opacity: 0.5;">
                            <svg style="width: 24px; height: 24px; fill: none; stroke: #5b5bff; stroke-width: 2; margin-bottom: 4px;"><use href="#oa-clock"></use></svg>
                            <div style="font-size: 10px; color: #888; text-transform: uppercase; font-weight: 600;">История</div>
                        </div>
                        <div style="flex: 1; background: #14141f; border: 1px solid rgba(255,255,255,0.05); border-radius: 16px; padding: 12px 10px; text-align: center;">
                            <div style="font-size: 20px; font-weight: 900; color: #ff4500; margin-bottom: 2px;">${friend.days_streak || 1}</div>
                            <div style="font-size: 10px; color: #888; text-transform: uppercase; font-weight: 600;">Дней</div>
                        </div>
                        <div class="ripple-btn" style="flex: 1; background: #14141f; border: 1px solid rgba(255,255,255,0.05); border-radius: 16px; padding: 12px 10px; text-align: center; display: flex; flex-direction: column; justify-content: center; align-items: center; opacity: 0.5;">
                            <div style="font-size: 20px; font-weight: 900; color: #ffd700; margin-bottom: 2px;">${(friend.unlocked_achievements || []).length}</div>
                            <div style="font-size: 10px; color: #888; text-transform: uppercase; font-weight: 600;">Ачивок</div>
                        </div>
                    </div>
                </div>
                <div style="padding: 15px 20px 0 20px;">
                    <div style="background: rgba(20, 20, 31, 0.6); border-radius: 20px; padding: 20px; border: 1px solid rgba(255,255,255,0.05); overflow: hidden;">
                        <div style="margin-bottom: 20px;">
                            <h3 style="font-size: 18px; color: #fff; margin: 0; display: flex; align-items: center; gap: 8px;">Статистика</h3>
                        </div>
                        <div style="display: flex; align-items: center; justify-content: space-between; gap: 15px;">
                            <div style="flex: 1; display: flex; flex-direction: column; gap: 12px;">
                                <div style="display: flex; align-items: center; gap: 10px; font-size: 15px; font-weight: 500;"><div style="width: 16px; height: 16px; border-radius: 4px; background: #6b8e23; box-shadow: 0 0 8px rgba(107,142,35,0.6);"></div><span style="color: #aaa; flex: 1;">Смотрю</span><span style="color: #fff; font-weight: 700;" id="friend-stat-watching">0</span></div>
                                <div style="display: flex; align-items: center; gap: 10px; font-size: 15px; font-weight: 500;"><div style="width: 16px; height: 16px; border-radius: 4px; background: #a259ff; box-shadow: 0 0 8px rgba(162,89,255,0.6);"></div><span style="color: #aaa; flex: 1;">В планах</span><span style="color: #fff; font-weight: 700;" id="friend-stat-planned">0</span></div>
                                <div style="display: flex; align-items: center; gap: 10px; font-size: 15px; font-weight: 500;"><div style="width: 16px; height: 16px; border-radius: 4px; background: #5b5bff; box-shadow: 0 0 8px rgba(91,91,255,0.6);"></div><span style="color: #aaa; flex: 1;">Просмотрено</span><span style="color: #fff; font-weight: 700;" id="friend-stat-completed">0</span></div>
                                <div style="display: flex; align-items: center; gap: 10px; font-size: 15px; font-weight: 500;"><div style="width: 16px; height: 16px; border-radius: 4px; background: #ff69b4; box-shadow: 0 0 8px rgba(255,105,180,0.6);"></div><span style="color: #aaa; flex: 1;">Любимое</span><span style="color: #fff; font-weight: 700;" id="friend-stat-favorite">0</span></div>
                                <div style="display: flex; align-items: center; gap: 10px; font-size: 15px; font-weight: 500;"><div style="width: 16px; height: 16px; border-radius: 4px; background: #e74c3c; box-shadow: 0 0 8px rgba(231,76,60,0.6);"></div><span style="color: #aaa; flex: 1;">Заброшено</span><span style="color: #fff; font-weight: 700;" id="friend-stat-dropped">0</span></div>
                            </div>
                            <div style="position: relative; width: 120px; height: 120px; flex-shrink: 0; display: flex; justify-content: center; align-items: center;">
                                <div id="friend-donut-chart" style="width: 100%; height: 100%; border-radius: 50%; background: conic-gradient(#2a2a3e 0% 100%); position: relative; display: flex; align-items: center; justify-content: center; filter: drop-shadow(0 0 10px rgba(255,255,255,0.1));">
                                    <div style="width: 70%; height: 70%; background: #14141f; border-radius: 50%; position: absolute; box-shadow: inset 0 0 15px rgba(0,0,0,0.5);"></div>
                                </div>
                            </div>
                        </div>
                        <div style="margin-top: 20px; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 15px; display: flex; flex-direction: column; gap: 10px;">
                            <div style="display: flex; justify-content: space-between; font-size: 15px; color: #ccc;">
                                <span>Время просмотра:</span>
                                <span style="font-weight: 700; color: #fff;" id="friend-stat-total-time">~ 0 дней 0 часов</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; font-size: 15px; color: #ccc;">
                                <span>Всего серий:</span>
                                <span style="font-weight: 700; color: #fff;">${friend.episodes_watched || 0}</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div style="padding: 20px;">
                    <div style="background: rgba(20, 20, 31, 0.6); border-radius: 20px; padding: 20px; border: 1px solid rgba(255,255,255,0.05); overflow: hidden;">
                        <h3 style="font-size: 18px; color: #fff; margin: 0 0 15px 0; display: flex; align-items: center; gap: 8px;">
                            Любимые жанры
                        </h3>
                        <div id="friend-genre-chart-container" style="display: flex; align-items: flex-end; justify-content: space-between; height: 140px; gap: 8px; padding-bottom: 10px; border-bottom: 1px solid rgba(255,255,255,0.1); margin-bottom: 15px;"></div>
                        <div style="font-size: 12px; color: #888; line-height: 1.5;">
                            На основе списка аниме этого пользователя.
                        </div>
                    </div>
                </div>
                <div style="padding: 0 20px 20px 20px;">
                    ${id !== MY_ID && friendshipStatus === 'accepted' ? `<button onclick="removeFriend('${escapeHTML(String(friend.id))}')" class="ripple-btn" style="width: 100%; padding: 14px; border-radius: 14px; border: 1px solid rgba(255,45,120,0.3); background: rgba(255,45,120,0.1); color: #ff2d78; font-weight: bold; font-size: 15px; cursor: pointer;">Удалить из друзей</button>` : ''}
                </div>
            </div>
        `;
        if (id !== MY_ID) {
            const avatarWrap = document.getElementById('friend-avatar-wrap');
            if (avatarWrap) {
                if (friendshipStatus === 'accepted') { /* ничего */ }
                else if (friendshipStatus === 'pending_out') {
                    const btn = document.createElement('div');
                    btn.style.cssText = 'position: absolute; bottom: 0; right: 0; background: #2ecc71; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 3px solid #14141f; z-index: 10; box-shadow: 0 4px 10px rgba(0,0,0,0.5); cursor: default;';
                    btn.innerHTML = '<svg style="width: 16px; height: 16px; fill: none; stroke: #fff; stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round;"><use href="#oa-check"></use></svg>';
                    avatarWrap.appendChild(btn);
                } else if (friendshipStatus === 'pending_in') {
                    const btn = document.createElement('button');
                    btn.className = 'ripple-btn';
                    btn.style.cssText = 'position: absolute; bottom: 0; right: 0; background: #ffd700; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 3px solid #14141f; z-index: 10; box-shadow: 0 4px 10px rgba(0,0,0,0.5); cursor: pointer;';
                    btn.innerHTML = '<svg style="width: 16px; height: 16px; fill: none; stroke: #14141f; stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round;"><use href="#oa-check"></use></svg>';
                    btn.onclick = async (e) => {
                        e.stopPropagation();
                        btn.style.pointerEvents = 'none';
                        btn.style.background = '#2ecc71';
                        btn.innerHTML = '<svg style="width: 16px; height: 16px; fill: none; stroke: #fff; stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round;"><use href="#oa-check"></use></svg>';
                        await acceptFriend(friend.id);
                    };
                    avatarWrap.appendChild(btn);
                } else {
                    const btn = document.createElement('button');
                    btn.className = 'ripple-btn';
                    btn.style.cssText = 'position: absolute; bottom: 0; right: 0; background: #5b5bff; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 3px solid #14141f; z-index: 10; cursor: pointer; box-shadow: 0 4px 10px rgba(0,0,0,0.5);';
                    btn.innerHTML = '<svg style="width: 16px; height: 16px; fill: none; stroke: #fff; stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round;"><use href="#oa-plus"></use></svg>';
                    btn.onclick = async (e) => {
                        e.stopPropagation();
                        btn.style.pointerEvents = 'none';
                        btn.style.background = '#2ecc71';
                        btn.innerHTML = '<svg style="width: 16px; height: 16px; fill: none; stroke: #fff; stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round;"><use href="#oa-check"></use></svg>';
                        await sendFriendRequest(friend.id);
                    };
                    avatarWrap.appendChild(btn);
                }
            }
        }
        setTimeout(() => {
            renderEffectParticles(document.getElementById('friend-particle-container'), friendEffectClass);
            loadProfileStats(id, true);
            loadGenreChart(id, true);
        }, 100);
    } catch (e) {
        console.error(e);
        container.innerHTML = '<div style="text-align: center; padding: 40px; color: #ff4444;">Ошибка загрузки профиля</div>';
    } finally {
        window._currentFriendLoadingId = null;
    }
}
