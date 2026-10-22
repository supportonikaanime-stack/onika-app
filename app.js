// ==========================================
// СИСТЕМА ВИЗУАЛЬНЫХ ЛОГОВ
// ==========================================
function showLog(msg, isError = false) {
    let logBox = document.getElementById('debug-log-box');
    if (!logBox) {
        logBox = document.createElement('div');
        logBox.id = 'debug-log-box';
        logBox.style.cssText = 'position:fixed;bottom:80px;left:10px;right:10px;max-height:150px;background:rgba(0,0,0,0.95);color:#0f0;font-family:monospace;font-size:10px;padding:10px;border-radius:10px;z-index:99999;overflow-y:auto;border:1px solid #333;box-shadow:0 0 10px rgba(0,0,0,0.5);display:flex;flex-direction:column;';
        
        let header = document.createElement('div');
        header.style.cssText = 'display:flex; justify-content:space-between; margin-bottom:5px; border-bottom:1px solid #333; padding-bottom:5px;';
        header.innerHTML = '<b>ЛОГИ</b> <span style="color:#f44; cursor:pointer; padding:0 5px;" onclick="document.getElementById(\'debug-log-box\').style.display=\'none\'">[X]</span>';
        logBox.appendChild(header);
        
        let content = document.createElement('div');
        content.id = 'debug-log-content';
        logBox.appendChild(content);
        document.body.appendChild(logBox);
    }
    const content = document.getElementById('debug-log-content');
    const p = document.createElement('div');
    p.style.color = isError ? '#f44' : '#0f0';
    p.style.marginBottom = '2px';
    p.textContent = `> ${msg}`;
    content.appendChild(p);
    logBox.scrollTop = logBox.scrollHeight;
}

// ==========================================
// 1. НАСТРОЙКА SUPABASE
// ==========================================
const SUPABASE_URL = 'https://wsaykqhojwfhpqzxptke.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndzYXlrcWhvandmaHBxenhwdGtlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1MzAxMDgsImV4cCI6MjEwODEwNjEwOH0.6eHuhYt2CyVvIurt-TW3MgP4VE0kzv39vqVHwskodLk';

let supabaseClient = null;
try {
    if (window.supabase) {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    }
} catch(e) { console.error('Ошибка Supabase:', e); }

const tg = window.Telegram.WebApp;
let MY_TG_ID = null;
let MY_NAME = 'Гость';

if (tg) {
    tg.expand();
    tg.setHeaderColor('#0a0a0f');
    tg.setBackgroundColor('#0a0a0f');
    if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
        MY_TG_ID = tg.initDataUnsafe.user.id;
        MY_NAME = tg.initDataUnsafe.user.first_name + (tg.initDataUnsafe.user.last_name ? ' ' + tg.initDataUnsafe.user.last_name : '');
    }
}

function escapeHTML(str) {
    if (!str) return '';
    return str.toString().replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag));
}

// ==========================================
// 2. МУЛЬТИ-API МОДУЛЬ
// ==========================================
const WORKER_URL = 'https://onika-app.support-onikaanime.workers.dev/?target=';

// --- API ANILIBRIA ---
const API_AniLibria = {
    BASE_URL: 'https://api.anilibria.app/api/v1',
    async fetch(endpoint) {
        const res = await fetch(WORKER_URL + encodeURIComponent(this.BASE_URL + endpoint));
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
    },
    async getCatalog(page, limit) {
        const data = await this.fetch(`/anime/releases/latest?page=${page}&items_per_page=${limit}`);
        return data.data ? data.data.map(this.convert) : [];
    },
    async searchAnime(q, page, limit) {
        const data = await this.fetch(`/anime/releases/latest?search=${encodeURIComponent(q)}&page=${page}&items_per_page=${limit}`);
        return data.data ? data.data.map(this.convert) : [];
    },
    async getDetails(id) {
        const cleanId = id.replace('anilibria_', '');
        const data = await this.fetch(`/anime/releases/${cleanId}`);
        return data.data ? this.convert(data.data) : null;
    },
    async getRandom(limit) {
        const data = await this.fetch(`/anime/releases/latest?page=${Math.floor(Math.random()*10)+1}&items_per_page=20`);
        return data.data ? data.data.filter(a=>a.poster?.original).sort(()=>Math.random()-0.5).slice(0, limit).map(this.convert) : [];
    },
    convert(a) {
        return {
            id: 'anilibria_' + a.id, rawId: a.id,
            title: a.name?.main || a.name?.english || 'Без названия',
            year: a.year || '--', episodes: a.type?.episodes || '?',
            images: { jpg: { image_url: a.poster?.original || '' } },
            description: a.description || 'Описание отсутствует.',
            genres: (a.genres || []).map(g => g.name),
            score: a.statistics?.rating || 0,
            status: a.status?.code === 1 ? 'Онгоинг' : a.status?.code === 2 ? 'Завершено' : 'Анонс',
            kind: a.type?.full_string || 'TV'
        };
    }
};

// --- API ANILIST ---
const API_AniList = {
    BASE_URL: 'https://graphql.anilist.co',
    async fetch(query, vars) {
        const res = await fetch(this.BASE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ query, variables: vars })
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        if (data.errors) throw new Error(data.errors[0].message);
        return data.data;
    },
    async getCatalog(page, limit) {
        const q = `query($p:Int,$l:Int){Page(page:$p,perPage:$l){media(type:ANIME,sort:POPULARITY_DESC){id title{romaji} coverImage{large} averageScore episodes status genres}}}`;
        const d = await this.fetch(q, {p:page, l:limit});
        return d.Page.media.map(this.convert);
    },
    async searchAnime(search, page, limit) {
        const q = `query($p:Int,$l:Int,$s:String){Page(page:$p,perPage:$l){media(type:ANIME,search:$s){id title{romaji} coverImage{large} averageScore episodes status genres}}}`;
        const d = await this.fetch(q, {p:page, l:limit, s:search});
        return d.Page.media.map(this.convert);
    },
    async getDetails(id) {
        const cleanId = parseInt(id.replace('anilist_', ''));
        const q = `query($id:Int){Media(id:$id,type:ANIME){id title{romaji} coverImage{extraLarge} description averageScore episodes status genres}}`;
        const d = await this.fetch(q, {id: cleanId});
        return d.Media ? this.convert(d.Media) : null;
    },
    async getRandom(limit) {
        const p = Math.floor(Math.random()*50)+1;
        const q = `query($p:Int){Page(page:$p,perPage:25){media(type:ANIME,sort:SCORE_DESC){id title{romaji} coverImage{large} averageScore episodes status genres}}}`;
        const d = await this.fetch(q, {p});
        return d.Page.media.filter(a=>a.averageScore>=60).sort(()=>Math.random()-0.5).slice(0,limit).map(this.convert);
    },
    convert(a) {
        return {
            id: 'anilist_' + a.id, rawId: a.id,
            title: a.title.romaji || 'Без названия', year: '--',
            episodes: a.episodes || '?',
            images: { jpg: { image_url: a.coverImage.large || a.coverImage.extraLarge || '' } },
            description: a.description ? a.description.replace(/<[^>]*>/g, '') : 'Описание отсутствует.',
            genres: a.genres || [], score: a.averageScore ? a.averageScore/10 : 0,
            status: a.status === 'RELEASING' ? 'Онгоинг' : a.status === 'FINISHED' ? 'Завершено' : 'Анонс',
            kind: 'TV'
        };
    }
};

// --- API SHIKIMORI (через прокси) ---
const API_Shikimori = {
    BASE_URL: 'https://shikimori.one/api/graphql',
    async fetch(query) {
        const res = await fetch(WORKER_URL + encodeURIComponent(this.BASE_URL), {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query })
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const d = await res.json();
        if (d.errors) throw new Error(d.errors[0].message);
        return d.data;
    },
    async getCatalog(page, limit) {
        const q = `{animes(page:${page},limit:${limit},order:popularity){id name russian score episodes status poster{originalUrl} genres{name}}}`;
        const d = await this.fetch(q);
        return d.animes.map(this.convert);
    },
    async searchAnime(search, page, limit) {
        const q = `{animes(search:"${search}",page:${page},limit:${limit}){id name russian score episodes status poster{originalUrl} genres{name}}}`;
        const d = await this.fetch(q);
        return d.animes.map(this.convert);
    },
    async getDetails(id) {
        const cleanId = id.replace('shikimori_', '');
        const q = `{anime(id:${cleanId}){id name russian description score episodes status poster{originalUrl} genres{name}}}`;
        const d = await this.fetch(q);
        return d.anime ? this.convert(d.anime) : null;
    },
    async getRandom(limit) {
        const p = Math.floor(Math.random()*50)+1;
        const q = `{animes(page:${p},limit:20,order:ranked){id name russian score episodes status poster{originalUrl} genres{name}}}`;
        const d = await this.fetch(q);
        return d.animes.filter(a=>a.score>=6).sort(()=>Math.random()-0.5).slice(0,limit).map(this.convert);
    },
    convert(a) {
        return {
            id: 'shikimori_' + a.id, rawId: a.id,
            title: a.russian || a.name || 'Без названия',
            year: '--', episodes: a.episodes || '?',
            images: { jpg: { image_url: a.poster?.originalUrl || '' } },
            description: a.description || 'Описание отсутствует.',
            genres: (a.genres || []).map(g=>g.name),
            score: a.score || 0,
            status: a.status === 'ongoing' ? 'Онгоинг' : a.status === 'released' ? 'Завершено' : 'Анонс',
            kind: 'TV'
        };
    }
};

const API = {
    currentSource: localStorage.getItem('onika_api_source') || 'anilibria',
    _cache: new Map(),
    
    setSource(src) {
        this.currentSource = src;
        this._cache.clear();
        localStorage.setItem('onika_api_source', src);
        showToast('Источник: ' + src);
        if(document.getElementById('screen-home').classList.contains('active')) loadHomePage();
        if(document.getElementById('screen-catalog').classList.contains('active')) loadCatalog(true);
        initApiSettings(); // Обновляем кнопки
    },

    getApi() {
        if (this.currentSource === 'anilist') return API_AniList;
        if (this.currentSource === 'shikimori') return API_Shikimori;
        return API_AniLibria;
    },

    async _cachedFetch(method, ...args) {
        const key = this.currentSource + '_' + method + '_' + JSON.stringify(args);
        if (this._cache.has(key) && Date.now() - this._cache.get(key).time < 15*60*1000) {
            return this._cache.get(key).data;
        }
        try {
            const data = await this.getApi()[method](...args);
            this._cache.set(key, { data, time: Date.now() });
            return data;
        } catch(e) {
            console.error(e);
            showLog('Ошибка API: ' + e.message, true);
            return [];
        }
    },

    getCatalog(page, limit) { return this._cachedFetch('getCatalog', page, limit); },
    searchAnime(q, page, limit) { return this._cachedFetch('searchAnime', q, page, limit); },
    getDetails(id) { return this._cachedFetch('getDetails', id); },
    getRandom(limit) { return this._cachedFetch('getRandom', limit); }
};

// ==========================================
// ДАЛЬШЕ ИДЕТ СТАНДАРТНЫЙ КОД (UI, ПРОФИЛЬ, ПЛЕЕР)
// ==========================================

let currentAnimeForPlayer = null;
let selectedVoice = '';
let selectedPlayer = '';
const VOICES = [{ id: 'anilibria', name: 'AniLibria', icon: '🎙️' }, { id: 'studioband', name: 'StudioBand', icon: '🎙️' }, { id: 'jamclub', name: 'JAM Club', icon: '🎙️' }, { id: 'original', name: 'Оригинал (Субтитры)', icon: '📝' }];
const PLAYERS = [{ id: 'kodik', name: 'Kodik', icon: '▶️' }, { id: 'sibnet', name: 'Sibnet', icon: '🎬' }, { id: 'veoveo', name: 'Veoveo', icon: '🎥' }];
let catalogPage = 1;
let isCatalogLoading = false;
let hasMoreCatalog = true;
let currentFilters = { search: '', genre: '', year: '', status: '', sort: 'POPULARITY_DESC' };
let currentMyListFilter = 'all';
let previousScreen = 'catalog'; 
let searchDebounceTimer;
const GENRES = [{ id: '1', name: 'Экшен' }, { id: '22', name: 'Романтика' }, { id: '4', name: 'Комедия' }, { id: '10', name: 'Фэнтези' }, { id: '8', name: 'Драма' }, { id: '2', name: 'Приключения' }, { id: '24', name: 'Фантастика' }];
const YEARS = [{ id: '2024', name: '2024' }, { id: '2023', name: '2023' }, { id: '2022', name: '2022' }, { id: '2021', name: '2021' }, { id: '2020', name: '2020' }];
const STATUSES = [{ id: 'ongoing', name: 'Онгоинг' }, { id: 'released', name: 'Завершено' }, { id: 'anons', name: 'Анонс' }];
const SORTS = [{ id: 'popularity', name: 'По популярности' }, { id: 'ranked', name: 'По рейтингу' }, { id: 'aired_on', name: 'Новинки' }];

function switchTab(tabName, element) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const screen = document.getElementById(`screen-${tabName}`);
    if (screen) screen.classList.add('active');
    if (element) {
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        element.classList.add('active');
    } else {
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        const navItems = document.querySelectorAll('.nav-item');
        if (tabName === 'home') navItems[0]?.classList.add('active');
        if (tabName === 'catalog') navItems[1]?.classList.add('active');
        if (tabName === 'my') navItems[2]?.classList.add('active');
        if (tabName === 'friends') navItems[3]?.classList.add('active');
        if (tabName === 'profile') navItems[4]?.classList.add('active');
    }
    if (tabName === 'profile') loadProfileData();
    if (tabName === 'catalog' && document.getElementById('catalog-grid').children.length === 0) {
        initCatalogFilters();
        loadCatalog(true);
    }
    if (tabName === 'my') renderMyList();
    if (tabName === 'voice') renderVoiceSelection();
    if (tabName === 'friends') loadFriends();
}

function goBackFromDetail() {
    if (previousScreen === 'my') switchTab('my');
    else if (previousScreen === 'home') switchTab('home');
    else switchTab('catalog');
}

// ... (ДАЛЕЕ ВСТАВЬ ОСТАЛЬНЫЕ ФУНКЦИИ: syncProfileToDB, copyMyId, loadProfileData, loadFriends, searchFriend, sendFriendRequest, acceptFriend, rejectFriend, removeFriend, openFriendProfile, startWatching, renderVoiceSelection, selectVoice, renderPlayerSelection, selectPlayer, renderEpisodesSelection, playEpisode, initCatalogFilters, setGenreFilter, searchAnime, openFilterModal, applyFilter, loadCatalog, loadMoreCatalog, forceReloadCatalog, openAnimeDetail, openQuickStatus, openStatusModal, setAnimeStatus, openRandomAnime, toggleDescription, filterMyList, renderMyList, ACHIEVEMENTS, LEVEL_TITLES, getStats, saveStats, checkAchievements, addXP, showLevelUpPopup, setElText, setElHTML, setElWidth, showToast, uploadCustomAvatar, switchProfileTab, openLevelModal, closeModal, openAchievementsModal, loadHomePage, initHeroSlider, goToSlide, nextSlide, startSlideShow, stopSlideShow, addSwipeSupport - скопируй их из своего предыдущего файла).

// ВАЖНО: Добавь эту функцию в конец файла, чтобы меню настроек работало
function initApiSettings() {
    const container = document.getElementById('settings-content-tab');
    if(!container) return;
    
    const sources = [
        { id: 'anilibria', name: 'AniLibria (Рус)' },
        { id: 'anilist', name: 'AniList (Eng)' },
        { id: 'shikimori', name: 'Shikimori (Рус)' }
    ];

    let html = '<div style="padding: 20px;">';
    html += '<h3 style="margin-bottom: 15px;">Источник данных</h3>';
    html += '<div style="display: flex; flex-direction: column; gap: 10px;">';
    
    sources.forEach(s => {
        const isActive = API.currentSource === s.id;
        html += `
            <button onclick="API.setSource('${s.id}')" style="padding: 15px; border-radius: 12px; border: 1px solid ${isActive ? '#5b5bff' : 'rgba(255,255,255,0.1)'}; background: ${isActive ? 'rgba(91,91,255,0.2)' : '#14141f'}; color: #fff; text-align: left; font-size: 16px; cursor: pointer; display: flex; justify-content: space-between; align-items: center;">
                <span>${s.name}</span>
                ${isActive ? '<span style="color: #5b5bff;">✓</span>' : ''}
            </button>
        `;
    });
    
    html += '</div>';
    html += '<p style="color: #888; font-size: 12px; margin-top: 15px;">Выбор API влияет на язык названий и доступность каталога.</p>';
    html += '</div>';
    
    container.innerHTML = html;
}

document.addEventListener('DOMContentLoaded', () => { 
    showLog('DOM загружен');
    loadHomePage();
    loadProfileData(); 
});
