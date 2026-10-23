// ==========================================
// СИСТЕМА ВИЗУАЛЬНЫХ ЛОГОВ
// ==========================================
let clickCount = 0;
document.addEventListener('click', (e) => {
    if (e.clientY < 100) { 
        clickCount++;
        if (clickCount >= 5) {
            clickCount = 0;
            let logBox = document.getElementById('debug-log-box');
            if (logBox) logBox.style.display = logBox.style.display === 'none' ? 'flex' : 'none';
        }
    }
});

function showLog(msg, isError = false) {
    let logBox = document.getElementById('debug-log-box');
    if (!logBox) {
        logBox = document.createElement('div');
        logBox.id = 'debug-log-box';
        logBox.style.cssText = 'position:fixed;bottom:80px;left:10px;right:10px;max-height:150px;background:rgba(0,0,0,0.95);color:#0f0;font-family:monospace;font-size:10px;padding:10px;border-radius:10px;z-index:99999;overflow-y:auto;border:1px solid #333;box-shadow:0 0 10px rgba(0,0,0,0.5);display:none;flex-direction:column;';
        
        let header = document.createElement('div');
        header.style.cssText = 'display:flex; justify-content:space-between; margin-bottom:5px; border-bottom:1px solid #333; padding-bottom:5px;';
        header.innerHTML = '<b>ЛОГИ</b> <span style="color:#f44; cursor:pointer; padding:0 5px;" onclick="this.parentElement.parentElement.style.display=\'none\'">[X]</span>';
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
    console.log(isError ? 'ERROR: ' : 'LOG: ', msg);
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

function safeUrl(url) {
    if (!url) return '';
    if (url.startsWith('/')) {
        if (url.includes('/system/') || url.includes('/assets/')) {
            return 'https://shikimori.io' + url;
        }
        return 'https://anilibria.top' + url;
    }
    try {
        const u = new URL(url);
        return (u.protocol === 'http:' || u.protocol === 'https:') ? url : '';
    } catch { return ''; }
}

// ==========================================
// СЛОВАРИ ЛОКАЛИЗАЦИИ
// ==========================================
const TRANSLATIONS = {
    ru: {
        nav_home: "Главная", nav_catalog: "Каталог", nav_my: "Моё", nav_friends: "Друзья", nav_profile: "Профиль",
        home_popular: "🔥 Популярное сейчас", home_recs: "✨ Рекомендации для вас", home_tg_title: "Наш Telegram-канал", home_tg_sub: "Новости, розыгрыши и анонсы",
        cat_search: "Найти аниме...", cat_random: "Случайное аниме", cat_random_sub: "Доверься судьбе",
        cat_year: "Год", cat_status: "Статус", cat_sort: "Сортировка", cat_load_more: "Загрузить еще", cat_not_found: "Ничего не найдено",
        my_all: "Все", my_watching: "Смотрю", my_planned: "В планах", my_completed: "Просмотрено", my_dropped: "Заброшено", my_favorite: "Любимое", my_empty: "Тут пусто",
        fr_search_placeholder: "Введите Telegram ID друга...", fr_find: "Найти", fr_my_friends: "Мои друзья", fr_no_friends: "Пока никого нет", fr_requests: "🔔 Заявки в друзья", fr_req_btn: "Заявка", fr_remove: "🗑️ Удалить из друзей", fr_last_watch: "Последнее аниме:", fr_id: "ID:",
        prof_level: "УРОВЕНЬ", prof_episodes: "серий", prof_minutes: "просмотра", prof_days: "день подряд", prof_profile_tab: "👤 Профиль", prof_settings_tab: "⚙️ Настройки", prof_ach: "ДОСТИЖЕНИЯ", prof_points: "очков", prof_next: "Дальше:", prof_continue: "Продолжайте смотреть",
        set_lang: "Язык интерфейса и базы", set_lang_desc: "Выбор языка меняет базу данных: Русский использует Shikimori, Английский использует AniList.",
        btn_watch: "▶ Смотреть", btn_read_more: "Читать полностью ▼", btn_read_less: "Свернуть ▲", btn_back: "← Назад",
        status_ongoing: "Онгоинг", status_released: "Завершено", status_anons: "Анонс",
        toast_status_updated: "Статус обновлен!", toast_removed: "Удалено из списка", toast_id_copied: "📋 ID скопирован!", toast_friend_req: "📩 Заявка отправлена!", toast_friend_acc: "🤝 Заявка принята!", toast_friend_rej: "Заявка отклонена", toast_friend_del: "Друг удален", toast_random: "🎲 Ищем случайное аниме...", toast_search_err: "Ошибка поиска",
        modal_add_list: "Добавить в список", modal_watch: "👀 Смотрю", modal_plan: "📅 В планах", modal_comp: "✅ Просмотрено", modal_drop: "🚫 Заброшено", modal_fav: "❤️ Любимое", modal_clear: "🗑️ Пусто (Удалить)",
        modal_filter_any: "Любой", modal_filter_year: "Год выхода", modal_filter_status: "Статус", modal_filter_sort: "Сортировка",
        sort_pop: "По популярности", sort_rank: "По рейтингу", sort_new: "Новинки", filter_anime: "Аниме", filter_manga: "Манга",
        ach_earned: "Получено:", ach_of: "из", level_up: "Новый уровень:", rank: "Звание:", how_farm_xp: "Как фармить XP:", xp_watch: "🎬 Просмотр серии: +20 XP", xp_fav: "❤️ Добавить в избранное: +10 XP", xp_daily: "📅 Ежедневный вход: +50 XP", ep_episode: "эп.", ep_voice: "Озвучка:", ep_player: "Плеер:", voice_title: "Выбор озвучки", player_title: "Выбор плеера", eps_title: "Выбор серии",
        lang_ru: "🇷🇺 Русский (Shikimori)", lang_en: "🇬🇧 English (AniList)",
        api_error: "Ошибка API", loading: "Загрузка...", error_net: "Ошибка сети", error_load: "Ошибка загрузки", error_db: "База данных не подключена", user_not_found: "Пользователь не найден", req_already_sent: "Заявка уже отправлена или вы друзья", this_is_you: "Это ваш ID", enter_id: "Введите ID", modal_desc: "Описание"
    },
    en: {
        nav_home: "Home", nav_catalog: "Catalog", nav_my: "My List", nav_friends: "Friends", nav_profile: "Profile",
        home_popular: "🔥 Popular Now", home_recs: "✨ Recommendations", home_tg_title: "Our Telegram Channel", home_tg_sub: "News, giveaways and announcements",
        cat_search: "Search anime...", cat_random: "Random Anime", cat_random_sub: "Trust the fate",
        cat_year: "Year", cat_status: "Status", cat_sort: "Sort", cat_load_more: "Load More", cat_not_found: "Nothing found",
        my_all: "All", my_watching: "Watching", my_planned: "Planned", my_completed: "Completed", my_dropped: "Dropped", my_favorite: "Favorite", my_empty: "Empty here",
        fr_search_placeholder: "Enter friend's Telegram ID...", fr_find: "Find", fr_my_friends: "My Friends", fr_no_friends: "No one yet", fr_requests: "🔔 Friend Requests", fr_req_btn: "Request", fr_remove: "🗑️ Remove Friend", fr_last_watch: "Last anime:", fr_id: "ID:",
        prof_level: "LEVEL", prof_episodes: "episodes", prof_minutes: "watched", prof_days: "days streak", prof_profile_tab: "👤 Profile", prof_settings_tab: "⚙️ Settings", prof_ach: "ACHIEVEMENTS", prof_points: "points", prof_next: "Next:", prof_continue: "Keep watching",
        set_lang: "Interface & DB Language", set_lang_desc: "Language choice changes the database: Russian uses Shikimori, English uses AniList.",
        btn_watch: "▶ Watch", btn_read_more: "Read more ▼", btn_read_less: "Collapse ▲", btn_back: "← Back",
        status_ongoing: "Ongoing", status_released: "Finished", status_anons: "Announced",
        toast_status_updated: "Status updated!", toast_removed: "Removed from list", toast_id_copied: "📋 ID copied!", toast_friend_req: "📩 Request sent!", toast_friend_acc: "🤝 Request accepted!", toast_friend_rej: "Request rejected", toast_friend_del: "Friend removed", toast_random: "🎲 Finding random anime...", toast_search_err: "Search error",
        modal_add_list: "Add to list", modal_watch: "👀 Watching", modal_plan: "📅 Planned", modal_comp: "✅ Completed", modal_drop: "🚫 Dropped", modal_fav: "❤️ Favorite", modal_clear: "🗑️ Clear (Remove)",
        modal_filter_any: "Any", modal_filter_year: "Release Year", modal_filter_status: "Status", modal_filter_sort: "Sort",
        sort_pop: "By Popularity", sort_rank: "By Rating", sort_new: "New Releases", filter_anime: "Anime", filter_manga: "Manga",
        ach_earned: "Earned:", ach_of: "of", level_up: "New Level:", rank: "Rank:", how_farm_xp: "How to farm XP:", xp_watch: "🎬 Watch episode: +20 XP", xp_fav: "❤️ Add to favorites: +10 XP", xp_daily: "📅 Daily login: +50 XP", ep_episode: "ep.", ep_voice: "Voice:", ep_player: "Player:", voice_title: "Select Voice", player_title: "Select Player", eps_title: "Select Episode",
        lang_ru: "🇷🇺 Русский (Shikimori)", lang_en: "🇬🇧 English (AniList)",
        api_error: "API Error", loading: "Loading...", error_net: "Network Error", error_load: "Load Error", error_db: "Database not connected", user_not_found: "User not found", req_already_sent: "Request already sent or you are friends", this_is_you: "This is your ID", enter_id: "Enter ID", modal_desc: "Description"
    }
};

let currentLang = localStorage.getItem('onika_lang') || 'ru';

function t(key) {
    return TRANSLATIONS[currentLang][key] || key;
}

function translatePage() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        el.textContent = t(key);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        el.placeholder = t(key);
    });
}

// ==========================================
// 2. API МОДУЛИ
// ==========================================
const PROXY_URL = 'https://onika-api.relaxdev.ru/?target=';

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
        const q = `query($p:Int,$l:Int){Page(page:$p,perPage:$l){media(type:ANIME,sort:POPULARITY_DESC){id title{english romaji} coverImage{large} averageScore episodes status genres}}}`;
        const d = await this.fetch(q, {p:page, l:limit});
        return d.Page.media.map(this.convert);
    },
    async searchAnime(search, page, limit) {
        const q = `query($p:Int,$l:Int,$s:String){Page(page:$p,perPage:$l){media(type:ANIME,search:$s){id title{english romaji} coverImage{large} averageScore episodes status genres}}}`;
        const d = await this.fetch(q, {p:page, l:limit, s:search});
        return d.Page.media.map(this.convert);
    },
    async getDetails(id) {
        const cleanId = parseInt(id.replace('anilist_', ''));
        const q = `query($id:Int){Media(id:$id,type:ANIME){id title{english romaji} coverImage{extraLarge} description averageScore episodes status genres}}`;
        const d = await this.fetch(q, {id: cleanId});
        return d.Media ? this.convert(d.Media) : null;
    },
    async getRandom(limit) {
        const p = Math.floor(Math.random()*50)+1;
        const q = `query($p:Int){Page(page:$p,perPage:25){media(type:ANIME,sort:SCORE_DESC){id title{english romaji} coverImage{large} averageScore episodes status genres}}}`;
        const d = await this.fetch(q, {p});
        return d.Page.media.filter(a=>a.averageScore>=60).sort(()=>Math.random()-0.5).slice(0,limit).map(this.convert);
    },
    convert(a) {
        return {
            id: 'anilist_' + a.id, rawId: a.id,
            title: a.title.english || a.title.romaji || 'Unknown',
            year: '--',
            episodes: a.episodes || '?',
            images: { jpg: { image_url: a.coverImage.large || a.coverImage.extraLarge || '' } },
            description: a.description ? a.description.replace(/<[^>]*>/g, '') : 'No description.',
            genres: a.genres || [], score: a.averageScore ? a.averageScore/10 : 0,
            status: a.status === 'RELEASING' ? 'Ongoing' : a.status === 'FINISHED' ? 'Finished' : 'Announced',
            kind: 'TV'
        };
    }
};

const API_Shikimori = {
    BASE_URL: 'https://shikimori.io/api/graphql',
    async fetch(query) {
        const res = await fetch(PROXY_URL + encodeURIComponent(this.BASE_URL), {
            method: 'POST', 
            headers: { 
                'Content-Type': 'application/json',
                'User-Agent': 'OnikaAnime/1.0'
            }, 
            body: JSON.stringify({ query })
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
        // ИСПРАВЛЕНИЕ: У Shikimori в GraphQL нет поля anime для одного ID. 
        // Используем поиск по ID в списке animes, чтобы получить детали.
        const q = `{animes(ids:"${cleanId}",limit:1){id name russian description score episodes status poster{originalUrl} genres{name}}}`;
        const d = await this.fetch(q);
        return d.animes && d.animes.length > 0 ? this.convert(d.animes[0]) : null;
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

// Глобальный API
const API = {
    currentLang: currentLang,
    _cache: new Map(),
    
    setLang(lang) {
        this.currentLang = lang;
        currentLang = lang;
        this._cache.clear();
        localStorage.setItem('onika_lang', lang);
        
        if (MY_TG_ID && supabaseClient) {
            supabaseClient.from('users').upsert({ tg_id: MY_TG_ID, lang: lang }, { onConflict: 'tg_id' }).catch(()=>{});
        }

        translatePage();
        showToast(lang === 'ru' ? 'Язык: Русский' : 'Language: English');
        
        if (document.getElementById('tab-btn-settings').classList.contains('active')) {
            initApiSettings();
        }
        
        if(document.getElementById('screen-home').classList.contains('active')) loadHomePage();
        if(document.getElementById('screen-catalog').classList.contains('active')) loadCatalog(true);
    },

    getApi() {
        return this.currentLang === 'en' ? API_AniList : API_Shikimori;
    },

    async _cachedFetch(method, ...args) {
        const key = this.currentLang + '_' + method + '_' + JSON.stringify(args);
        if (this._cache.has(key) && Date.now() - this._cache.get(key).time < 15*60*1000) {
            return this._cache.get(key).data;
        }
        try {
            const data = await this.getApi()[method](...args);
            this._cache.set(key, { data, time: Date.now() });
            return data;
        } catch(e) {
            console.error('API Error:', e);
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
// 3. ПЕРЕМЕННЫЕ ПЛЕЕРА
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
const STATUSES = [{ id: 'ongoing', name: 'status_ongoing' }, { id: 'released', name: 'status_released' }, { id: 'anons', name: 'status_anons' }];
const SORTS = [{ id: 'popularity', name: 'sort_pop' }, { id: 'ranked', name: 'sort_rank' }, { id: 'aired_on', name: 'sort_new' }];

// ==========================================
// 4. НАВИГАЦИЯ
// ==========================================
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
    if (tabName === 'voice') { document.getElementById('voice-title').textContent = t('voice_title'); renderVoiceSelection(); }
    if (tabName === 'player') document.getElementById('player-title').textContent = t('player_title');
    if (tabName === 'episodes') document.getElementById('eps-title').textContent = t('eps_title');
    if (tabName === 'friends') loadFriends();
}

function goBackFromDetail() {
    if (previousScreen === 'my') switchTab('my');
    else if (previousScreen === 'home') switchTab('home');
    else switchTab('catalog');
}

// ==========================================
// 5. ПРОФИЛЬ
// ==========================================
async function syncProfileToDB() {
    if (!MY_TG_ID || !supabaseClient) return;
    let stats = getStats();
    let avatar = localStorage.getItem('onika_custom_avatar');
    try {
        await supabaseClient.from('users').upsert({
            tg_id: MY_TG_ID, 
            name: MY_NAME, 
            avatar_url: avatar,
            xp: stats.xp,
            episodes_watched: stats.episodesWatched, 
            minutes_watched: stats.minutesWatched, 
            days_streak: stats.daysStreak,
            lang: currentLang,
            last_watched: stats.favedAnime.length > 0 ? stats.favedAnime[stats.favedAnime.length - 1].id : null
        }, { onConflict: 'tg_id' });
    } catch (e) { console.error('Ошибка синхронизации:', e); }
}

function copyMyId() {
    if (!MY_TG_ID) return;
    navigator.clipboard.writeText(MY_TG_ID).then(() => { showToast(t('toast_id_copied')); }).catch(() => {});
}

function loadProfileData() {
    const customAvatar = localStorage.getItem('onika_custom_avatar'); 
    const avatarEl = document.getElementById('tg-avatar'); 
    
    if (avatarEl && MY_TG_ID) { 
        if (customAvatar) {
            avatarEl.innerHTML = `<img src="${safeUrl(customAvatar)}" style="width:100%; height:100%; object-fit:cover;">`; 
        } else if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.photo_url) {
            avatarEl.innerHTML = `<img src="${safeUrl(tg.initDataUnsafe.user.photo_url)}" style="width:100%; height:100%; object-fit:cover;">`; 
        } else {
            avatarEl.innerHTML = `<span>${escapeHTML(MY_NAME[0].toUpperCase())}</span>`; 
        }
    } 
    
    setElText('my-tg-id', MY_TG_ID || 'Нет ID');
    setElText('tg-name', MY_NAME);

    let stats = getStats(); 
    const today = new Date().toDateString(); 
    if (stats.lastVisit !== today) { 
        stats.daysStreak += 1; stats.lastVisit = today; stats.xp += 50; stats.watchedToday = []; saveStats(stats); 
    } 
    checkAchievements(stats); 
    const currentLevel = Math.floor(stats.xp / 100) + 1; 
    const xpForNextLevel = currentLevel * 100; 
    const xpCurrentLevel = stats.xp % 100; 
    const progressPercent = (xpCurrentLevel / 100) * 100; 
    let rankTitle = LEVEL_TITLES[Math.min(currentLevel - 1, 99)]; 
    
    setElText('user-level', currentLevel); 
    setElText('user-level-text', currentLevel); 
    setElText('user-rank', rankTitle); 
    setElText('user-xp-current', xpCurrentLevel); 
    setElText('user-xp-next', xpForNextLevel); 
    setElWidth('user-xp-bar', progressPercent + '%'); 
    setElText('stat-episodes', stats.episodesWatched); 
    setElHTML('stat-minutes', `${stats.minutesWatched} <span style="font-size: 14px; font-weight: normal;">${t('prof_minutes')}</span>`); 
    setElText('stat-days', stats.daysStreak); 
    setElText('ach-points', stats.unlockedAchievements.length * 10); 
    setElText('ach-earned', stats.unlockedAchievements.length); 
    setElWidth('ach-bar', (stats.unlockedAchievements.length / 50) * 100 + '%'); 
    setElText('modal-level-num', currentLevel); 
    setElText('modal-rank', rankTitle); 
    setElText('modal-xp-cur', xpCurrentLevel); 
    setElText('modal-xp-next', xpForNextLevel); 
    setElWidth('modal-xp-bar', progressPercent + '%'); 
    setElText('modal-ach-earned', stats.unlockedAchievements.length); 
    
    const nextAch = ACHIEVEMENTS.find(a => !stats.unlockedAchievements.includes(a.id)); 
    if (nextAch) setElText('next-ach-name', nextAch.name); 
    else setElText('next-ach-name', 'Все выполнено!'); 

    syncProfileToDB();
}

// ==========================================
// 6. ДРУЗЬЯ
// ==========================================
async function loadFriends() {
    const listContainer = document.getElementById('friends-list-container');
    if (!listContainer || !supabaseClient || !MY_TG_ID) return;
    
    listContainer.innerHTML = `<div style="padding: 20px; text-align: center; color: #888;">${t('loading')}</div>`;

    try {
        const { data: incoming, error: inErr } = await supabaseClient.from('friends').select('user_id').eq('friend_id', MY_TG_ID).eq('status', 'pending');
        if (inErr) throw inErr;

        const { data: accepted, error: accErr } = await supabaseClient.from('friends').select('friend_id').eq('user_id', MY_TG_ID).eq('status', 'accepted');
        if (accErr) throw accErr;

        let html = '';

        if (incoming && incoming.length > 0) {
            const inIds = incoming.map(f => f.user_id);
            const { data: inUsers } = await supabaseClient.from('users').select('*').in('tg_id', inIds);
            
            if (inUsers && inUsers.length > 0) {
                html += `<h3 style="padding: 0 20px 10px; font-size: 16px; color: #ffd700;">${t('fr_requests')}</h3>`;
                inUsers.forEach(u => {
                    html += `<div class="friend-card" style="background: rgba(255,215,0,0.05); border-color: rgba(255,215,0,0.2);"><div class="friend-avatar">${u.avatar_url ? `<img src="${safeUrl(u.avatar_url)}">` : escapeHTML(u.name[0].toUpperCase())}</div><div class="friend-info"><h3>${escapeHTML(u.name)}</h3><p>${t('fr_id')} ${escapeHTML(u.tg_id)}</p></div><div style="display: flex; gap: 5px; margin-left: auto;"><button onclick="acceptFriend(${u.tg_id})" style="background: #2ecc71; color: #fff; border: none; padding: 6px 10px; border-radius: 8px; font-weight: bold; cursor: pointer;">✓</button><button onclick="rejectFriend(${u.tg_id})" style="background: #e74c3c; color: #fff; border: none; padding: 6px 10px; border-radius: 8px; font-weight: bold; cursor: pointer;">✕</button></div></div>`;
                });
            }
        }

        html += `<h3 style="padding: 10px 20px 10px; font-size: 16px; color: #fff;">${t('fr_my_friends')}</h3>`;
        
        if (!accepted || accepted.length === 0) {
            html += `<div style="padding: 0 20px; color: #888; font-size: 14px;">${t('fr_no_friends')}</div>`;
        } else {
            const accIds = accepted.map(f => f.friend_id);
            const { data: accUsers } = await supabaseClient.from('users').select('*').in('tg_id', accIds);
            
            if (accUsers && accUsers.length > 0) {
                accUsers.forEach(friend => {
                    html += `<div class="friend-card" onclick="openFriendProfile(${friend.tg_id}, '${escapeHTML(friend.name).replace(/'/g, "\\'")}')"><div class="friend-avatar">${friend.avatar_url ? `<img src="${safeUrl(friend.avatar_url)}">` : escapeHTML(friend.name[0].toUpperCase())}</div><div class="friend-info"><h3>${escapeHTML(friend.name)}</h3><p>${t('fr_id')} ${escapeHTML(friend.tg_id)} • Lvl. ${Math.floor(friend.xp / 100) + 1}</p></div><div style="margin-left: auto; color: #5b5bff; font-size: 20px;">›</div></div>`;
                });
            }
        }

        listContainer.innerHTML = html;

    } catch (e) {
        console.error(e);
        listContainer.innerHTML = `<div style="padding: 20px; text-align: center; color: #ff4444;">${t('error_load')}</div>`;
    }
}

async function searchFriend() {
    const input = document.getElementById('friend-search-input');
    const id = input.value.trim();
    const resultContainer = document.getElementById('search-result-container');
    
    if (!id) { resultContainer.innerHTML = `<div style="color: #ff4444; text-align: center; font-size: 14px;">${t('enter_id')}</div>`; return; }
    if (!supabaseClient) { resultContainer.innerHTML = `<div style="color: #ff4444; text-align: center; font-size: 14px;">${t('error_db')}</div>`; return; }
    if (id === MY_TG_ID.toString()) { resultContainer.innerHTML = `<div style="color: #888; text-align: center; font-size: 14px;">${t('this_is_you')}</div>`; return; }

    resultContainer.innerHTML = `<div style="color: #888; text-align: center; font-size: 14px;">${t('loading')}</div>`;
    
    try {
        const { data: userData, error } = await supabaseClient.from('users').select('*').eq('tg_id', id).single();
        if (error || !userData) { resultContainer.innerHTML = `<div style="color: #ff4444; text-align: center; font-size: 14px;">${t('user_not_found')}</div>`; return; }

        const { data: friendCheck } = await supabaseClient.from('friends').select('*').eq('user_id', MY_TG_ID).eq('friend_id', id);
        if (friendCheck && friendCheck.length > 0) { resultContainer.innerHTML = `<div style="color: #888; text-align: center; font-size: 14px;">${t('req_already_sent')}</div>`; return; }

        resultContainer.innerHTML = `<div class="friend-card" style="margin: 0; background: rgba(91,91,255,0.1); border-color: #5b5bff;"><div class="friend-avatar">${userData.avatar_url ? `<img src="${safeUrl(userData.avatar_url)}">` : escapeHTML(userData.name[0].toUpperCase())}</div><div class="friend-info"><h3>${escapeHTML(userData.name)}</h3><p>${t('fr_id')} ${escapeHTML(userData.tg_id)}</p></div><button onclick="sendFriendRequest(${userData.tg_id})" style="background: #5b5bff; color: #fff; border: none; padding: 8px 15px; border-radius: 10px; font-weight: bold; margin-left: auto; cursor: pointer;">${t('fr_req_btn')}</button></div>`;
    } catch (e) { console.error(e); resultContainer.innerHTML = `<div style="color: #ff4444; text-align: center; font-size: 14px;">${t('error_load')}</div>`; }
}

async function sendFriendRequest(friendId) {
    if (!MY_TG_ID || !supabaseClient) return;
    try {
        await supabaseClient.from('friends').insert({ user_id: MY_TG_ID, friend_id: friendId, status: 'pending' });
        document.getElementById('search-result-container').innerHTML = '';
        document.getElementById('friend-search-input').value = '';
        showToast(t('toast_friend_req'));
        loadFriends();
    } catch (e) { console.error(e); }
}

async function acceptFriend(userId) {
    if (!MY_TG_ID || !supabaseClient) return;
    try {
        await supabaseClient.from('friends').update({ status: 'accepted' }).eq('user_id', userId).eq('friend_id', MY_TG_ID);
        showToast(t('toast_friend_acc'));
        loadFriends();
        await supabaseClient.from('friends').insert({ user_id: MY_TG_ID, friend_id: userId, status: 'accepted' });
    } catch (e) { console.error(e); }
}

async function rejectFriend(userId) {
    if (!MY_TG_ID || !supabaseClient) return;
    try {
        await supabaseClient.from('friends').delete().eq('user_id', userId).eq('friend_id', MY_TG_ID);
        showToast(t('toast_friend_rej'));
        loadFriends();
    } catch (e) { console.error(e); }
}

async function removeFriend(friendId) {
    if (!MY_TG_ID || !supabaseClient) return;
    try {
        await supabaseClient.from('friends').delete().eq('user_id', MY_TG_ID).eq('friend_id', friendId);
        await supabaseClient.from('friends').delete().eq('user_id', friendId).eq('friend_id', MY_TG_ID);
        showToast(t('toast_friend_del'));
        switchTab('friends');
    } catch (e) { console.error(e); }
}

async function openFriendProfile(id, name) {
    switchTab('friend-profile');
    const container = document.getElementById('friend-profile-content');
    container.innerHTML = `<div style="text-align: center; padding: 40px; color: #888;">${t('loading')}</div>`;

    try {
        const { data: friend, error } = await supabaseClient.from('users').select('*').eq('tg_id', id).single();
        if (error || !friend) throw new Error('Not found');

        const lvl = Math.floor(friend.xp / 100) + 1;
        const rank = LEVEL_TITLES[Math.min(lvl - 1, 99)];
        
        let lastWatchedHtml = '';
        if (friend.last_watched) {
            lastWatchedHtml = `<div style="margin-top: 15px; padding: 15px; background: rgba(91,91,255,0.1); border-radius: 12px; border: 1px solid rgba(91,91,255,0.2);"><div style="font-size: 12px; color: #888; margin-bottom: 5px;">${t('fr_last_watch')}</div><div style="font-size: 16px; font-weight: bold; color: #fff;">${t('fr_id')} ${escapeHTML(friend.last_watched)}</div></div>`;
        }

        container.innerHTML = `
            <div class="user-card">
                <div class="avatar-container">
                    <div class="avatar" style="background: linear-gradient(135deg, #5b5bff, #b44aff); display: flex; align-items: center; justify-content: center; font-size: 32px; font-weight: bold; color: #fff; overflow: hidden;">
                        ${friend.avatar_url ? `<img src="${safeUrl(friend.avatar_url)}" style="width: 100%; height: 100%; object-fit: cover;">` : escapeHTML(friend.name[0].toUpperCase())}
                    </div>
                </div>
                <div class="user-details">
                    <h2>${escapeHTML(friend.name)}</h2>
                    <div style="background: rgba(91,91,255,0.1); border: 1px solid rgba(91,91,255,0.3); border-radius: 12px; padding: 6px 15px; display: inline-block; margin: 5px 0 15px;"><span style="color: #888; font-size: 12px;">${t('fr_id')}</span> <span style="color: #fff; font-weight: bold;">${escapeHTML(friend.tg_id)}</span></div>
                    <div class="level-row">
                        <div class="level-badge"><span>${lvl}</span></div>
                        <div class="level-info">
                            <div class="level-title">${t('prof_level')} ${lvl} <span class="rank">${rank}</span></div>
                            <div class="xp-bar-container"><div class="xp-bar-fill" style="width: ${friend.xp % 100}%;"></div></div>
                            <div class="xp-text">${friend.xp % 100} / ${lvl * 100} XP</div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="stats-card">
                <div class="stat-item"><div class="stat-value">${friend.episodes_watched || 0}</div><div class="stat-label">${t('prof_episodes')}</div></div>
                <div class="stat-divider"></div>
                <div class="stat-item"><div class="stat-value">${friend.minutes_watched || 0} <span style="font-size: 14px; font-weight: normal;">${t('prof_minutes')}</span></div></div>
                <div class="stat-divider"></div>
                <div class="stat-item"><div class="stat-value">${friend.days_streak || 1}</div><div class="stat-label">${t('prof_days')}</div></div>
            </div>
            ${lastWatchedHtml}
            <button onclick="removeFriend(${friend.tg_id})" style="width: 100%; margin-top: 20px; padding: 14px; border-radius: 14px; border: 1px solid rgba(255,45,120,0.3); background: rgba(255,45,120,0.1); color: #ff2d78; font-weight: bold; font-size: 15px; cursor: pointer;">${t('fr_remove')}</button>
        `;
    } catch (e) { container.innerHTML = `<div style="text-align: center; padding: 40px; color: #ff4444;">${t('error_load')}</div>`; }
}

// ==========================================
// 7. ПЛЕЕР
// ==========================================
function startWatching(anime) { currentAnimeForPlayer = anime; switchTab('voice'); }
function renderVoiceSelection() { 
    const container = document.getElementById('voice-list'); 
    if (!container) return; 
    let html = ''; 
    VOICES.forEach(v => { 
        html += `<div onclick="selectVoice('${v.id}', '${v.name}')" style="background: #14141f; border: 1px solid rgba(255,255,255,0.1); padding: 16px; border-radius: 14px; display: flex; align-items: center; gap: 15px; cursor: pointer; transition: 0.2s;"><div style="font-size: 24px;">${v.icon}</div><div style="font-size: 16px; font-weight: 600; color: #fff;">${v.name}</div></div>`; 
    }); 
    container.innerHTML = html; 
}
function selectVoice(id, name) { selectedVoice = name; switchTab('player'); renderPlayerSelection(); }
function renderPlayerSelection() { 
    const container = document.getElementById('player-list'); 
    if (!container) return; 
    let html = ''; 
    PLAYERS.forEach(p => { 
        html += `<div onclick="selectPlayer('${p.id}', '${p.name}')" style="background: #14141f; border: 1px solid rgba(255,255,255,0.1); padding: 16px; border-radius: 14px; display: flex; align-items: center; gap: 15px; cursor: pointer; transition: 0.2s;"><div style="font-size: 24px;">${p.icon}</div><div style="font-size: 16px; font-weight: 600; color: #fff;">${p.name}</div></div>`; 
    }); 
    container.innerHTML = html; 
}
function selectPlayer(id, name) { selectedPlayer = name; switchTab('episodes'); renderEpisodesSelection(); }
function renderEpisodesSelection() { 
    document.getElementById('selected-voice-text').textContent = selectedVoice; 
    document.getElementById('selected-player-text').textContent = selectedPlayer; 
    const container = document.getElementById('episodes-list'); 
    if (!container || !currentAnimeForPlayer) return; 
    let totalEpisodes = currentAnimeForPlayer.episodes || 12; 
    if (totalEpisodes > 50) totalEpisodes = 50; 
    let html = ''; 
    for (let i = 1; i <= totalEpisodes; i++) { 
        html += `<div onclick="playEpisode(${i})" style="background: #1a1a20; border: 1px solid rgba(255,255,255,0.1); padding: 15px; border-radius: 12px; text-align: center; font-size: 16px; font-weight: bold; color: #fff; cursor: pointer; transition: 0.2s;">${i}</div>`; 
    } 
    container.innerHTML = html; 
}
function playEpisode(epNum) { 
    addXP(20); 
    let stats = getStats(); 
    stats.episodesWatched += 1; 
    stats.minutesWatched += 24; 
    saveStats(stats); 
    if (tg) tg.showAlert(`🎬 ${t('btn_watch')}:\n${currentAnimeForPlayer.title}\n${selectedVoice}\n${selectedPlayer}\n#${epNum}\n\n(+20 XP)`); 
}

// ==========================================
// 8. КАТАЛОГ И ДЕТАЛИ
// ==========================================
function initCatalogFilters() { 
    const genreContainer = document.getElementById('genre-filters'); 
    if (!genreContainer) return; 
    let html = `<div class="genre-pill active" onclick="setGenreFilter('', this)"><div class="dot"></div>${t('modal_filter_any')}</div>`; 
    GENRES.forEach(g => { 
        html += `<div class="genre-pill" onclick="setGenreFilter('${g.name}', this)">${g.name}</div>`; 
    }); 
    genreContainer.innerHTML = html; 
}

function setGenreFilter(genreName, btn) { 
    currentFilters.genre = genreName; 
    document.querySelectorAll('#genre-filters .genre-pill').forEach(el => el.classList.remove('active')); 
    btn.classList.add('active'); 
    if (genreName === '') btn.innerHTML = `<div class="dot"></div>${t('modal_filter_any')}`; 
    loadCatalog(true); 
}

function searchAnime() { 
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
        currentFilters.search = document.getElementById('search-input').value.trim(); 
        loadCatalog(true); 
    }, 500);
}

function openFilterModal(type) { 
    const modal = document.getElementById('filterModal'); 
    const title = document.getElementById('filter-modal-title'); 
    const container = document.getElementById('filter-options-container'); 
    let options = []; 
    let currentVal = currentFilters[type]; 
    if (type === 'year') { options = YEARS; title.textContent = t('modal_filter_year'); } 
    if (type === 'status') { options = STATUSES; title.textContent = t('modal_filter_status'); } 
    if (type === 'sort') { options = SORTS; title.textContent = t('modal_filter_sort'); } 
    let html = `<button class="filter-option-btn ${currentVal === '' ? 'active' : ''}" onclick="applyFilter('${type}', '')">${t('modal_filter_any')}</button>`; 
    options.forEach(opt => { 
        html += `<button class="filter-option-btn ${currentVal === opt.id ? 'active' : ''}" onclick="applyFilter('${type}', '${opt.id}')">${t(opt.name)}</button>`; 
    }); 
    container.innerHTML = html; 
    modal.classList.add('active'); 
}

function applyFilter(type, value) { 
    currentFilters[type] = value; 
    closeModal('filterModal'); 
    const btnIndex = type === 'year' ? 0 : type === 'status' ? 1 : 2; 
    const btns = document.querySelectorAll('#dropdown-filters .filter-btn'); 
    let optName = t('modal_filter_any'); 
    if (value) { 
        const list = type === 'year' ? YEARS : type === 'status' ? STATUSES : SORTS; 
        optName = t(list.find(o => o.id === value)?.name) || t('modal_filter_any'); 
    } else { 
        optName = type === 'year' ? t('cat_year') : type === 'status' ? t('cat_status') : t('cat_sort'); 
    } 
    btns[btnIndex].innerHTML = `${optName} ⌄`; 
    loadCatalog(true); 
}

async function loadCatalog(reset = false) {
    if (isCatalogLoading) return;
    isCatalogLoading = true;
    const grid = document.getElementById('catalog-grid');
    const loadMoreBtn = document.getElementById('load-more-btn');
    
    if (reset) { 
        grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #888;">${t('loading')}</div>`; 
        hasMoreCatalog = true; 
        catalogPage = 1; 
    }

    try {
        let items = [];
        
        if (currentFilters.search) {
            items = await API.searchAnime(currentFilters.search, catalogPage, 50);
        } else {
            items = await API.getCatalog(catalogPage, 50); 
        }

        let filteredItems = items;

        if (currentFilters.genre && currentFilters.genre !== '') {
            filteredItems = filteredItems.filter(a => 
                a.genres && a.genres.some(g => g.toLowerCase().includes(currentFilters.genre.toLowerCase()))
            );
        }

        if (currentFilters.year && currentFilters.year !== '') {
            filteredItems = filteredItems.filter(a => String(a.year) === currentFilters.year);
        }

        if (currentFilters.status && currentFilters.status !== '') {
            let statusRu = currentFilters.status === 'ongoing' ? (currentLang === 'ru' ? 'Онгоинг' : 'Ongoing') : currentFilters.status === 'released' ? (currentLang === 'ru' ? 'Завершено' : 'Finished') : (currentLang === 'ru' ? 'Анонс' : 'Announced');
            filteredItems = filteredItems.filter(a => a.status === statusRu);
        }

        if (currentFilters.sort && currentFilters.sort !== 'popularity') {
             if (currentFilters.sort === 'ranked') {
                 filteredItems.sort((a, b) => b.score - a.score);
             } else if (currentFilters.sort === 'aired_on') {
                 filteredItems.sort((a, b) => String(b.year).localeCompare(String(a.year)));
             }
        }

        const displayItems = filteredItems.slice(0, 12);

        if (reset) grid.innerHTML = '';
        
        if (displayItems.length === 0) { 
            if (reset) grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #888;">${t('cat_not_found')}</div>`; 
            hasMoreCatalog = false; 
            if (loadMoreBtn) loadMoreBtn.style.display = 'none'; 
            return; 
        }
        
        displayItems.forEach(anime => { 
            const title = escapeHTML(anime.title); 
            const img = safeUrl(anime.images.jpg.image_url); 
            const score = anime.score ? Number(anime.score).toFixed(1) : '?'; 
            const cardHtml = `<div class="catalog-card" onclick="openAnimeDetail('${anime.id}', 'catalog')"><img class="catalog-card-img" src="${img}" loading="lazy"><div style="position: absolute; top: 8px; right: 8px; background: rgba(0,0,0,0.7); padding: 2px 6px; border-radius: 6px; font-size: 10px; color: #ffd700; font-weight: bold;">⭐ ${score}</div><div class="catalog-card-title">${title}</div></div>`; 
            grid.insertAdjacentHTML('beforeend', cardHtml);
        });
        
        if (items.length < 50) { 
            hasMoreCatalog = false; 
            if (loadMoreBtn) loadMoreBtn.style.display = 'none'; 
        } else { 
            if (loadMoreBtn) loadMoreBtn.style.display = 'inline-block'; 
        }
    } catch (e) { 
        console.error(e);
        if (reset) grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #ff4444;">${t('error_load')}</div>`; 
    } finally { 
        isCatalogLoading = false; 
    }
}

function loadMoreCatalog() { 
    if (!hasMoreCatalog || isCatalogLoading) return; 
    catalogPage++; 
    loadCatalog(false); 
}

async function openAnimeDetail(id, fromScreen = 'catalog') {
    previousScreen = fromScreen;
    switchTab('detail');
    const container = document.getElementById('detail-content');
    container.innerHTML = `<div style="text-align: center; padding: 40px; color: #888;">${t('loading')}</div>`;
    
    try {
        const anime = await API.getDetails(id);
        if (!anime) throw new Error('Not found');
        
        const title = escapeHTML(anime.title);
        const desc = escapeHTML(anime.description);
        const score = anime.score ? Number(anime.score).toFixed(1) : '?';
        const poster = safeUrl(anime.images.jpg.image_url);
        
        let statusColor = '#2ecc71'; 
        if (anime.status === 'Онгоинг' || anime.status === 'Ongoing') statusColor = '#3498db';
        if (anime.status === 'Анонс' || anime.status === 'Announced') statusColor = '#e74c3c';
        
        const stats = getStats(); 
        const favEntry = (stats.favedAnime || []).find(a => a.id === anime.id); 
        const isFaved = !!favEntry;
        
        window._tempAnimeData = anime; 
        
        container.innerHTML = `
            <div style="position: absolute; top: 0; left: 0; width: 100%; height: 50vh; z-index: -1;"><img src="${poster}" style="width: 100%; height: 100%; object-fit: cover; opacity: 0.4; mask-image: linear-gradient(to bottom, black 50%, transparent 100%); -webkit-mask-image: linear-gradient(to bottom, black 50%, transparent 100%);"></div>
            <div style="padding-top: 30px;"><div style="display: flex; gap: 20px; margin-bottom: 25px; align-items: flex-end;"><img class="detail-poster" src="${poster}" style="width: 140px; border-radius: 16px; box-shadow: 0 10px 30px rgba(0,0,0,0.8); border: 2px solid rgba(255,255,255,0.1);"><div style="flex: 1; padding-bottom: 5px;"><h1 style="font-size: 24px; font-weight: 800; line-height: 1.1; margin-bottom: 12px; color: #fff; text-shadow: 0 2px 10px rgba(0,0,0,0.8);">${title}</h1><div style="display: flex; flex-wrap: wrap; gap: 6px;"><span style="background: #ffd700; color: #000; padding: 4px 10px; border-radius: 8px; font-size: 12px; font-weight: 800;">⭐ ${score}</span><span style="background: rgba(255,255,255,0.15); backdrop-filter: blur(5px); color: #fff; padding: 4px 10px; border-radius: 8px; font-size: 12px; font-weight: 600;">📺 ${anime.episodes || '?'} ${t('ep_episode')}</span><span style="background: ${statusColor}; color: #fff; padding: 4px 10px; border-radius: 8px; font-size: 12px; font-weight: 600;">${anime.status}</span></div></div></div>
                <div style="display: flex; gap: 10px; margin-bottom: 20px;"><button onclick="startWatching(window._tempAnimeData)" style="flex: 1; background: #5b5bff; color: #fff; border: none; padding: 16px; border-radius: 14px; font-size: 16px; font-weight: 700; cursor: pointer; box-shadow: 0 8px 25px rgba(91,91,255,0.4); display: flex; justify-content: center; align-items: center; gap: 8px;">${t('btn_watch')}</button><button onclick="openStatusModal('${anime.id}', '${title.replace(/'/g, "\\'")}')" style="background: ${isFaved ? 'rgba(255,45,120,0.2)' : 'rgba(255,255,255,0.1)'}; color: ${isFaved ? '#ff2d78' : '#fff'}; border: 1px solid ${isFaved ? '#ff2d78' : 'rgba(255,255,255,0.15)'}; width: 56px; border-radius: 14px; font-size: 22px; cursor: pointer; display: flex; justify-content: center; align-items: center;">${isFaved ? '❤️' : '🤍'}</button></div>
                <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 20px;">${(anime.genres || []).map(g => `<span style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.15); color: #ccc; padding: 6px 14px; border-radius: 20px; font-size: 13px; font-weight: 600;">${escapeHTML(g)}</span>`).join('')}</div>
                <div style="margin-bottom: 20px;"><h3 style="font-size: 16px; margin-bottom: 10px; color: #fff;">📖 ${t('modal_desc')}</h3><p id="desc-text" style="color: #aaa; font-size: 14px; line-height: 1.6; display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden;">${desc}</p><button id="desc-btn" onclick="toggleDescription()" style="background: none; border: none; color: #5b5bff; font-weight: 700; font-size: 14px; margin-top: 8px; cursor: pointer; padding: 0;">${t('btn_read_more')}</button></div>
            </div>`;
    } catch (e) { 
        console.error(e);
        container.innerHTML = `<div style="text-align: center; padding: 40px; color: #ff4444;">${t('error_load')}</div>`; 
    }
}

function openQuickStatus(id, title, btnElement) { 
    document.getElementById('status-anime-title').textContent = title; 
    document.getElementById('statusModal').classList.add('active'); 
    window._currentAnimeForStatus = id; 
    window._currentBtnForStatus = btnElement; 
}

function openStatusModal(id, title) { 
    document.getElementById('status-anime-title').textContent = title; 
    document.getElementById('statusModal').classList.add('active'); 
    window._currentAnimeForStatus = id; 
    window._currentBtnForStatus = null; 
}

function setAnimeStatus(status) {
    const id = window._currentAnimeForStatus; 
    if (!id) return;
    let stats = getStats(); 
    stats.favedAnime = stats.favedAnime || []; 
    stats.favedAnime = stats.favedAnime.filter(a => a.id !== id);
    if (status !== '') { 
        stats.favedAnime.push({ id: id, status: status }); 
        addXP(10); 
        showToast(t('toast_status_updated')); 
    } else { 
        showToast(t('toast_removed')); 
    }
    saveStats(stats); 
    closeModal('statusModal');
    
    if (window._currentBtnForStatus) { 
        let icon = '📚'; 
        if (status === 'watching') icon = '👀'; 
        if (status === 'planned') icon = '📅'; 
        if (status === 'completed') icon = '✅'; 
        if (status === 'dropped') icon = '🚫'; 
        if (status === 'favorite') icon = '❤️'; 
        if (status === '') icon = '📚'; 
        window._currentBtnForStatus.innerHTML = icon; 
    }
    const heartBtn = document.querySelector('#detail-content button[onclick^="openStatusModal"]');
    if (heartBtn) { 
        if (status !== '') { 
            heartBtn.style.background = 'rgba(255,45,120,0.2)'; 
            heartBtn.style.borderColor = '#ff2d78'; 
            heartBtn.style.color = '#ff2d78'; 
            heartBtn.innerHTML = '❤️'; 
        } else { 
            heartBtn.style.background = 'rgba(255,255,255,0.1)'; 
            heartBtn.style.borderColor = 'rgba(255,255,255,0.15)'; 
            heartBtn.style.color = '#fff'; 
            heartBtn.innerHTML = '🤍'; 
        } 
    }
}

async function openRandomAnime() { 
    if (tg) tg.HapticFeedback.impactOccurred('medium'); 
    showToast(t('toast_random')); 
    try { 
        const items = await API.getRandom(1);
        if (items && items.length > 0) openAnimeDetail(items[0].id, 'catalog'); 
    } catch (e) { 
        console.error(e);
        showToast(t('toast_search_err')); 
    } 
}

function toggleDescription() { 
    const descEl = document.getElementById('desc-text'); 
    const btnEl = document.getElementById('desc-btn'); 
    if (descEl.style.webkitLineClamp === '4' || descEl.style.webkitLineClamp === '') { 
        descEl.style.webkitLineClamp = 'unset'; 
        btnEl.innerHTML = t('btn_read_less'); 
    } else { 
        descEl.style.webkitLineClamp = '4'; 
        btnEl.innerHTML = t('btn_read_more'); 
    } 
}

// ==========================================
// 9. СПИСОК "МОЁ"
// ==========================================
function filterMyList(type, btn) { 
    currentMyListFilter = type; 
    document.querySelectorAll('.my-list-tab').forEach(el => el.classList.remove('active')); 
    btn.classList.add('active'); 
    renderMyList(); 
}

function renderMyList() {
    const grid = document.getElementById('my-grid'); 
    if (!grid) return;
    let stats = getStats(); 
    let favs = stats.favedAnime || []; 
    let filtered = favs;
    if (currentMyListFilter !== 'all') { filtered = favs.filter(a => a.status === currentMyListFilter); }
    if (filtered.length === 0) { 
        grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #888;">${t('my_empty')}</div>`; 
        return; 
    }
    
    Promise.all(filtered.map(a => API.getDetails(a.id))).then(items => {
        const validItems = items.filter(Boolean);
        grid.innerHTML = '';
        validItems.forEach(anime => {
            const title = escapeHTML(anime.title); 
            const img = safeUrl(anime.images.jpg.image_url); 
            const score = anime.score ? Number(anime.score).toFixed(1) : '?';
            const favEntry = favs.find(a => a.id === anime.id); 
            const currentStatus = favEntry ? favEntry.status : '';
            let statusIcon = '📚'; 
            if (currentStatus === 'watching') statusIcon = '👀'; 
            if (currentStatus === 'planned') statusIcon = '📅'; 
            if (currentStatus === 'completed') statusIcon = '✅'; 
            if (currentStatus === 'dropped') statusIcon = '🚫'; 
            if (currentStatus === 'favorite') statusIcon = '❤️';
            
            const cardHtml = `<div class="catalog-card" style="overflow: visible;"><div onclick="openAnimeDetail('${anime.id}', 'my')" style="width: 100%; height: 100%;"><img class="catalog-card-img" src="${img}" loading="lazy"><div style="position: absolute; top: 8px; right: 8px; background: rgba(0,0,0,0.7); padding: 2px 6px; border-radius: 6px; font-size: 10px; color: #ffd700; font-weight: bold;">⭐ ${score}</div><div class="catalog-card-title">${title}</div></div><button onclick="event.stopPropagation(); openQuickStatus('${anime.id}', '${title.replace(/'/g, "\\'")}', this)" style="position: absolute; top: 8px; left: 8px; background: rgba(0,0,0,0.7); border: none; color: #fff; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; z-index: 10; font-size: 16px; cursor: pointer; backdrop-filter: blur(5px);">${statusIcon}</button></div>`;
            grid.insertAdjacentHTML('beforeend', cardHtml);
        });
    }).catch(e => {
        console.error(e);
        grid.innerHTML = `<div style="text-align:center;color:#f44;grid-column:1/-1;">${t('error_net')}</div>`;
    });
}

// ==========================================
// 10. СИСТЕМА ДОСТИЖЕНИЙ И XP
// ==========================================
const ACHIEVEMENTS = [
    { id: 1, name: "Первый шаг", desc: "Зарегистрироваться на сайте", icon: "🚀", check: (s) => true },
    { id: 2, name: "Дебютный просмотр", desc: "Посмотреть первый эпизод", icon: "🎬", check: (s) => s.episodesWatched >= 1 },
    { id: 3, name: "Марафонец", desc: "Посмотреть 10 эпизодов за день", icon: "🏃", check: (s) => s.episodesWatched >= 10 },
    { id: 4, name: "Ночной страж", desc: "Посмотреть аниме после 3:00", icon: "🌙", check: () => { let h = new Date().getHours(); return h >= 3 && h < 6; } },
    { id: 33, name: "Ежедневный визит", desc: "Заходить 7 дней подряд", icon: "📅", check: (s) => s.daysStreak >= 7 },
    { id: 36, name: "Первый уровень", desc: "Достичь 10 уровня", icon: "🎖️", check: (s) => Math.floor(s.xp / 100) + 1 >= 10 }
];
const LEVEL_TITLES = ["Первый эпизод", "Любопытный зритель", "Случайный странник", "Ученик манги", "Читатель субтитров", "Собиратель тайтлов", "Ночной марафонец", "Ценитель опенингов", "Знаток сейю", "Ловец спойлеров", "Страж таймлайна", "Искатель шедевров", "Коллекционер жанров", "Следопыт сезона", "Архивариус эпизодов", "Пилот меха", "Ученик додзё", "Начинающий маг", "Дух сакуры", "Странник измерений", "Хранитель клинка", "Проводник сюжета", "Алхимик эмоций", "Писец рецензий", "Охотник за онгоингами", "Мастер бинджвотча", "Сэнпай сайта", "Хранитель лора", "Ткач теорий", "Лунный самурай", "Небесный курьер", "Хранитель опенингов", "Повелитель плейлистов", "Критик с катаной", "Мудрец субтитров", "Дубляжный маг", "Страж спойлеров", "Картограф арок", "Коллекционер аватарок", "Ловец редких тайтлов", "Хроникёр сезонов", "Мастер клиффхэнгеров", "Дуэлянт мнений", "Хранитель уютного уголка", "Рыцарь романтики", "Тень сёнэна", "Адепт исэкая", "Архимаг тайтлов", "Небесный отаку", "Странник по мирам", "Хранитель легенд", "Мастер сюжетных поворотов", "Голос фандома", "Судья сезона", "Хранитель аниме-реликвий", "Пилот звёздного поезда", "Лунный библиотекарь", "Самурай субботы", "Повелитель финальных титров", "Искатель скрытых жемчужин", "Маг рекомендаций", "Страж уютных вечеров", "Рыцарь онгоинга", "Дух обсуждений", "Хранитель мемов", "Мастер аниме-детектива", "Небесный критик", "Повелитель сезонных марафонов", "Хранитель канона", "Ткач фанфиков", "Оракул спойлеров", "Лунный сэнпай", "Самурай рейтингов", "Архивариус легенд", "Маг жанров", "Страж ночных просмотров", "Повелитель опенингов", "Хранитель тропов", "Рыцарь вечернего просмотра", "Дух фестиваля", "Мастер эмоциональных качелей", "Следопыт забытых тайтлов", "Хранитель аниме-хроник", "Небесный администратор", "Самурай финального эпизода", "Оракул сезонов", "Повелитель легендарных арок", "Хранитель аниме-вселенной", "Маг идеального топа", "Дух великого марафона", "Рыцарь вечного онгоинга", "Архимаг фандома", "Страж золотой коллекции", "Легенда аниме-сайта", "Небесный хранитель тайтлов", "Великий отаку-владыка", "Хранитель последнего эпизода", "Мастер пересмотров", "Дух аниме-сообщества", "Верховный хранитель сезонов"];

function getStats() { 
    let stats = JSON.parse(localStorage.getItem('onika_stats')); 
    if (!stats) { 
        stats = { episodesWatched: 0, minutesWatched: 0, daysStreak: 1, xp: 0, lastVisit: new Date().toDateString(), unlockedAchievements: [], favedAnime: [], watchedToday: [] }; 
        localStorage.setItem('onika_stats', JSON.stringify(stats)); 
    } 
    if (!stats.unlockedAchievements) stats.unlockedAchievements = []; 
    if (!stats.favedAnime) stats.favedAnime = []; 
    if (!stats.watchedToday) stats.watchedToday = []; 
    return stats; 
}

function saveStats(stats) { 
    localStorage.setItem('onika_stats', JSON.stringify(stats)); 
    loadProfileData(); 
}

function checkAchievements(stats) { 
    let changed = false; 
    ACHIEVEMENTS.forEach(ach => { 
        if (!stats.unlockedAchievements.includes(ach.id)) { 
            if (ach.check(stats)) { 
                stats.unlockedAchievements.push(ach.id); 
                changed = true; 
                showToast(`🏆 ${ach.name}!`); 
            } 
        } 
    }); 
    if (changed) saveStats(stats); 
}

function addXP(amount) { 
    let stats = getStats(); 
    const oldLevel = Math.floor(stats.xp / 100) + 1; 
    stats.xp += amount; 
    saveStats(stats); 
    checkAchievements(stats); 
    const newLevel = Math.floor(stats.xp / 100) + 1; 
    if (newLevel > oldLevel) { 
        showLevelUpPopup(newLevel, LEVEL_TITLES[Math.min(newLevel - 1, 99)]); 
        if (tg) tg.HapticFeedback.notificationOccurred('success'); 
    } else { 
        showToast(`+${amount} XP`); 
    } 
}

function showLevelUpPopup(level, rank) { 
    const popup = document.getElementById('levelUpPopup'); 
    document.getElementById('popup-level').textContent = level; 
    document.getElementById('popup-rank').textContent = rank; 
    popup.classList.add('show'); 
    setTimeout(() => popup.classList.remove('show'), 4000); 
}

function setElText(id, text) { const el = document.getElementById(id); if (el) el.textContent = text; }
function setElHTML(id, html) { const el = document.getElementById(id); if (el) el.innerHTML = html; }
function setElWidth(id, width) { const el = document.getElementById(id); if (el) el.style.width = width; }

function showToast(msg) { 
    const toast = document.createElement('div'); 
    toast.textContent = msg; 
    toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#5b5bff;color:#fff;padding:10px 20px;border-radius:20px;font-weight:bold;z-index:99999;box-shadow:0 4px 15px rgba(0,0,0,0.5);animation:fade 0.3s ease;text-align:center;'; 
    document.body.appendChild(toast); 
    setTimeout(() => toast.remove(), 2500); 
}

function uploadCustomAvatar(input) { 
    if (input.files && input.files[0]) { 
        const reader = new FileReader(); 
        reader.onload = function(e) { 
            const img = new Image(); 
            img.onload = function() { 
                const canvas = document.createElement('canvas'); 
                const ctx = canvas.getContext('2d'); 
                const maxSize = 200; 
                let width = img.width, height = img.height; 
                if (width > height) { 
                    if (width > maxSize) { height *= maxSize / width; width = maxSize; } 
                } else { 
                    if (height > maxSize) { width *= maxSize / height; height = maxSize; } 
                } 
                canvas.width = width; 
                canvas.height = height; 
                ctx.drawImage(img, 0, 0, width, height); 
                try {
                    localStorage.setItem('onika_custom_avatar', canvas.toDataURL('image/jpeg', 0.8)); 
                    loadProfileData(); 
                } catch(err) {
                    showToast('Image too large'); 
                }
            }; 
            img.src = e.target.result; 
        }; 
        reader.readAsDataURL(input.files[0]); 
    } 
}

function switchProfileTab(tab) { 
    const btnProfile = document.getElementById('tab-btn-profile'); 
    const btnSettings = document.getElementById('tab-btn-settings'); 
    const contentProfile = document.getElementById('profile-content-tab'); 
    const contentSettings = document.getElementById('settings-content-tab'); 
    if (tab === 'profile') { 
        if(btnProfile) btnProfile.classList.add('active'); 
        if(btnSettings) btnSettings.classList.remove('active'); 
        if(contentProfile) contentProfile.style.display = 'block'; 
        if(contentSettings) contentSettings.style.display = 'none'; 
    } else { 
        if(btnProfile) btnProfile.classList.remove('active'); 
        if(btnSettings) btnSettings.classList.add('active'); 
        if(contentProfile) contentProfile.style.display = 'none'; 
        if(contentSettings) contentSettings.style.display = 'block'; 
        initApiSettings(); 
    } 
}

function openLevelModal() { document.getElementById('levelModal').classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }

function openAchievementsModal() { 
    const stats = getStats(); 
    const container = document.getElementById('achievements-list-container'); 
    let html = ''; 
    ACHIEVEMENTS.forEach(ach => { 
        const isDone = stats.unlockedAchievements.includes(ach.id); 
        html += `<div class="ach-list-item ${isDone ? 'completed' : ''}"><div class="ach-list-icon">${ach.icon}</div><div class="ach-list-info"><h4>${ach.name}</h4><p>${ach.desc}</p></div>${isDone ? '<div style="color:#ffd700; font-weight:bold;">✓</div>' : ''}</div>`; 
    }); 
    container.innerHTML = html; 
    document.getElementById('achievementsModal').classList.add('active'); 
}

// ==========================================
// 11. НАСТРОЙКИ (Смена языка)
// ==========================================
function initApiSettings() {
    const container = document.getElementById('settings-content-tab');
    if(!container) return;
    
    let html = `<div style="padding: 20px;">`;
    html += `<h3 style="margin-bottom: 15px; color: #fff;">${t('set_lang')}</h3>`;
    html += '<div style="display: flex; flex-direction: column; gap: 10px;">';
    
    const isRu = currentLang === 'ru';
    const isEn = currentLang === 'en';

    html += `
        <button onclick="API.setLang('ru')" style="padding: 15px; border-radius: 12px; border: 1px solid ${isRu ? '#5b5bff' : 'rgba(255,255,255,0.1)'}; background: ${isRu ? 'rgba(91,91,255,0.2)' : '#1a1a20'}; color: #fff; text-align: left; font-size: 15px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; transition: 0.2s;">
            <span>${t('lang_ru')}</span>
            ${isRu ? '<span style="color: #5b5bff; font-weight: bold;">✓</span>' : ''}
        </button>
        <button onclick="API.setLang('en')" style="padding: 15px; border-radius: 12px; border: 1px solid ${isEn ? '#5b5bff' : 'rgba(255,255,255,0.1)'}; background: ${isEn ? 'rgba(91,91,255,0.2)' : '#1a1a20'}; color: #fff; text-align: left; font-size: 15px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; transition: 0.2s;">
            <span>${t('lang_en')}</span>
            ${isEn ? '<span style="color: #5b5bff; font-weight: bold;">✓</span>' : ''}
        </button>
    `;
    
    html += '</div>';
    html += `<p style="color: #888; font-size: 12px; margin-top: 15px; line-height: 1.4;">${t('set_lang_desc')}</p>`;
    html += '</div>';
    
    container.innerHTML = html;
}

// ==========================================
// 12. ГЛАВНАЯ СТРАНИЦА
// ==========================================
let heroData = []; 
let currentSlide = 0; 
let slideInterval;

async function loadHomePage() {
    try {
        showLog('1. Параллельная загрузка данных главной...');
        
        const [heroItems, popularItems, recItems] = await Promise.all([
            API.getRandom(5),
            API.getCatalog(1, 6),
            API.getCatalog(2, 4)
        ]);

        showLog('2. Данные получены. Отрисовка баннера...');
        heroData = heroItems.map(a => ({ 
            id: a.id, title: a.title, img: a.images.jpg.image_url, 
            score: a.score ? Number(a.score).toFixed(1) : '?', type: a.kind || 'TV', year: a.year 
        }));
        initHeroSlider();

        showLog('3. Отрисовка популярного...');
        const popularContainer = document.getElementById('popular-list');
        if (popularContainer && popularItems.length > 0) {
            popularContainer.innerHTML = popularItems.map(anime => `
                <div class="card" onclick="openAnimeDetail('${anime.id}', 'home')">
                    <img class="card-img" src="${safeUrl(anime.images.jpg.image_url)}" loading="lazy">
                    <div class="card-title">${escapeHTML(anime.title)}</div>
                </div>
            `).join('');
        }

        showLog('4. Отрисовка рекомендаций...');
        const recContainer = document.getElementById('recommended-list');
        if (recContainer && recItems.length > 0) {
            recContainer.innerHTML = recItems.map(anime => `
                <div class="card" onclick="openAnimeDetail('${anime.id}', 'home')">
                    <img class="card-img" src="${safeUrl(anime.images.jpg.image_url)}" loading="lazy">
                    <div class="card-title">${escapeHTML(anime.title)}</div>
                </div>
            `).join('');
        }
        
        showLog('5. ✅ Главная загружена!');

    } catch (e) {
        showLog('Ошибка главной: ' + e.message, true);
    }
}

function initHeroSlider() { 
    const slider = document.getElementById('heroSlider'); 
    const dotsContainer = document.getElementById('heroDots'); 
    if (!slider || heroData.length === 0) return; 
    let sliderHTML = '', dotsHTML = ''; 
    const stats = getStats(); 
    const favedList = (stats.favedAnime || []).map(a => a.id); 
    heroData.forEach((anime, index) => { 
        const isFaved = favedList.includes(anime.id); 
        const heartClass = isFaved ? 'faved' : ''; 
        const heartIcon = isFaved ? '❤️' : '🤍'; 
        sliderHTML += `<div class="hero-slide ${index === 0 ? 'active' : ''}"><div class="hero-bg" style="background-image: url('${safeUrl(anime.img)}')"></div><div class="hero-gradient"></div><div class="hero-content"><div class="hero-badges"><span class="badge star">⭐ ${anime.score}</span><span class="badge">${escapeHTML(anime.type)}</span><span class="badge">${escapeHTML(anime.year)}</span></div><h1 class="hero-title">${escapeHTML(anime.title)}</h1><div class="hero-actions"><button class="btn-primary" onclick="openAnimeDetail('${anime.id}', 'home')">${t('btn_watch')}</button><button class="btn-icon-heart ${heartClass}" onclick="openStatusModal('${anime.id}', '${escapeHTML(anime.title).replace(/'/g, "\\'")}')">${heartIcon}</button></div></div></div>`; 
        dotsHTML += `<div class="hero-dot ${index === 0 ? 'active' : ''}" onclick="goToSlide(${index})"></div>`; 
    }); 
    slider.innerHTML = sliderHTML; 
    dotsContainer.innerHTML = dotsHTML; 
    startSlideShow(); 
    addSwipeSupport(slider); 
}

function goToSlide(index) { 
    const slides = document.querySelectorAll('.hero-slide'); 
    const dots = document.querySelectorAll('.hero-dot'); 
    slides.forEach(s => s.classList.remove('active')); 
    dots.forEach(d => d.classList.remove('active')); 
    slides[index].classList.add('active'); 
    dots[index].classList.add('active'); 
    currentSlide = index; 
}
function nextSlide() { currentSlide = (currentSlide + 1) % heroData.length; goToSlide(currentSlide); }
function startSlideShow() { clearInterval(slideInterval); slideInterval = setInterval(nextSlide, 5000); }
function stopSlideShow() { clearInterval(slideInterval); }
function addSwipeSupport(element) { 
    let touchStartX = 0; 
    element.addEventListener('touchstart', e => { touchStartX = e.changedTouches[0].screenX; stopSlideShow(); }, { passive: true }); 
    element.addEventListener('touchend', e => { 
        const diff = touchStartX - e.changedTouches[0].screenX; 
        if (diff > 50) nextSlide(); 
        else if (diff < -50) { currentSlide = (currentSlide - 1 + heroData.length) % heroData.length; goToSlide(currentSlide); } 
        startSlideShow(); 
    }, { passive: true }); 
}

document.addEventListener('DOMContentLoaded', () => { 
    translatePage();
    loadHomePage();
    loadProfileData(); 
});
