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
let MY_PHOTO_URL = '';
let ACTIVE_BANNER_URL = '';

if (tg) {
    tg.expand();
    tg.setHeaderColor('#0a0a0f');
    tg.setBackgroundColor('#0a0a0f');
    if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
        MY_TG_ID = tg.initDataUnsafe.user.id;
        MY_NAME = tg.initDataUnsafe.user.first_name + (tg.initDataUnsafe.user.last_name ? ' ' + tg.initDataUnsafe.user.last_name : '');
        MY_PHOTO_URL = tg.initDataUnsafe.user.photo_url || '';
    }
}

function escapeHTML(str) {
    if (!str) return '';
    return str.toString().replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag));
}

function safeUrl(url) {
    if (!url) return '';
    if (url.startsWith('/')) return 'https://shikimori.io' + url;
    try {
        const u = new URL(url);
        return (u.protocol === 'http:' || u.protocol === 'https:') ? url : '';
    } catch { return ''; }
}

// ==========================================
// 2. API МОДУЛЬ (Только Shikimori)
// ==========================================
const PROXY_URL = 'https://onika-api.relaxdev.ru/?target=';

const API_Shikimori = {
    BASE_URL: 'https://shikimori.io/api/graphql',
    async fetch(query) {
        const res = await fetch(PROXY_URL + encodeURIComponent(this.BASE_URL), {
            method: 'POST', 
            headers: { 'Content-Type': 'application/json', 'User-Agent': 'OnikaAnime/1.0' }, 
            body: JSON.stringify({ query })
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const d = await res.json();
        if (d.errors) throw new Error(d.errors[0].message);
        return d.data;
    },
    async getCatalog(page, limit, filters) {
        // ИСПРАВЛЕНИЕ: Передаем фильтры прямо в GraphQL запрос
        let searchStr = filters.search ? `,search:"${filters.search}"` : '';
        let genreStr = '';
        if (filters.genre) {
            const genreId = GENRES.find(g => g.name === filters.genre)?.id;
            if (genreId) genreStr = `,genre:${genreId}`;
        }
        let seasonStr = filters.year ? `,season:"${filters.year}"` : '';
        let statusStr = filters.status ? `,status:${filters.status}` : '';
        let orderStr = filters.sort ? `,order:${filters.sort}` : ',order:popularity';
        
        const q = `{animes(page:${page},limit:${limit}${searchStr}${genreStr}${seasonStr}${statusStr}${orderStr}){id name russian score episodes status poster{originalUrl} genres{name}}}`;
        const d = await this.fetch(q);
        return d.animes.map(this.convert);
    },
    async getDetails(id) {
        const cleanId = id.replace('shikimori_', '');
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

const API = {
    _cache: new Map(),
    async _cachedFetch(method, ...args) {
        const key = method + '_' + JSON.stringify(args);
        if (this._cache.has(key) && Date.now() - this._cache.get(key).time < 15*60*1000) return this._cache.get(key).data;
        try {
            const data = await API_Shikimori[method](...args);
            this._cache.set(key, { data, time: Date.now() });
            return data;
        } catch(e) { console.error(e); return []; }
    },
    getCatalog(page, limit, filters) { return this._cachedFetch('getCatalog', page, limit, filters); },
    getDetails(id) { return this._cachedFetch('getDetails', id); },
    getRandom(limit) { return this._cachedFetch('getRandom', limit); }
};

// ==========================================
// 3. ПЕРЕМЕННЫЕ ПЛЕЕРА И КАТАЛОГА
// ==========================================
let currentAnimeForPlayer = null;
let selectedVoice = '';
let selectedPlayer = '';
const VOICES = [{ id: 'anilibria', name: 'AniLibria', icon: '🎙️' }, { id: 'studioband', name: 'StudioBand', icon: '🎙️' }, { id: 'jamclub', name: 'JAM Club', icon: '🎙️' }, { id: 'original', name: 'Оригинал (Субтитры)', icon: '📝' }];
const PLAYERS = [{ id: 'kodik', name: 'Kodik', icon: '▶️' }, { id: 'sibnet', name: 'Sibnet', icon: '🎬' }, { id: 'veoveo', name: 'Veoveo', icon: '🎥' }];

let catalogPage = 1;
let isCatalogLoading = false;
let hasMoreCatalog = true;
let currentFilters = { search: '', genre: '', year: '', status: '', sort: 'popularity' };
let currentMyListFilter = 'all';
let previousScreen = 'catalog'; 
let searchDebounceTimer;

const GENRES = [{ id: '1', name: 'Экшен' }, { id: '22', name: 'Романтика' }, { id: '4', name: 'Комедия' }, { id: '10', name: 'Фэнтези' }, { id: '8', name: 'Драма' }, { id: '2', name: 'Приключения' }, { id: '24', name: 'Фантастика' }];
const YEARS = [{ id: '2024', name: '2024' }, { id: '2023', name: '2023' }, { id: '2022', name: '2022' }, { id: '2021', name: '2021' }, { id: '2020', name: '2020' }];
const STATUSES = [{ id: 'ongoing', name: 'Онгоинг' }, { id: 'released', name: 'Завершено' }, { id: 'anons', name: 'Анонс' }];
const SORTS = [{ id: 'popularity', name: 'По популярности' }, { id: 'ranked', name: 'По рейтингу' }, { id: 'aired_on', name: 'Новинки' }];

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
    if (tabName === 'voice') { document.getElementById('voice-title').textContent = 'Выбор озвучки'; renderVoiceSelection(); }
    if (tabName === 'player') document.getElementById('player-title').textContent = 'Выбор плеера';
    if (tabName === 'episodes') document.getElementById('eps-title').textContent = 'Выбор серии';
    if (tabName === 'friends') loadFriends();
}

function goBackFromDetail() {
    if (previousScreen === 'my') switchTab('my');
    else if (previousScreen === 'home') switchTab('home');
    else switchTab('catalog');
}

// ==========================================
// 5. ПРОФИЛЬ И БАННЕРЫ
// ==========================================
async function syncProfileToDB() {
    if (!MY_TG_ID || !supabaseClient) return;
    let stats = getStats();
    try {
        await supabaseClient.from('users').upsert({
            tg_id: MY_TG_ID, 
            name: MY_NAME, 
            avatar_url: MY_PHOTO_URL,
            xp: stats.xp,
            coins: stats.coins,
            episodes_watched: stats.episodesWatched, 
            minutes_watched: stats.minutesWatched, 
            days_streak: stats.daysStreak,
            active_banner: stats.active_banner,
            last_watched: stats.favedAnime.length > 0 ? stats.favedAnime[stats.favedAnime.length - 1].id : null
        }, { onConflict: 'tg_id' });
    } catch (e) { console.error('Ошибка синхронизации:', e); }
}

function copyMyId() {
    if (!MY_TG_ID) return;
    navigator.clipboard.writeText(MY_TG_ID).then(() => { showToast('📋 ID скопирован!'); }).catch(() => {});
}

async function loadProfileData() {
    let stats = getStats(); 
    
    if (stats.active_banner_url) {
        ACTIVE_BANNER_URL = stats.active_banner_url;
    }
    
    const today = new Date().toDateString(); 
    if (stats.lastVisit !== today) { 
        stats.daysStreak += 1; stats.lastVisit = today; stats.xp += 50; stats.coins += 10; stats.watchedToday = []; saveStats(stats); 
    } 
    checkAchievements(stats); 
    
    if (MY_TG_ID && supabaseClient && !ACTIVE_BANNER_URL && stats.active_banner) {
        try {
            const { data: user } = await supabaseClient.from('users').select('active_banner').eq('tg_id', MY_TG_ID).single();
            if (user && user.active_banner) {
                const { data: banner } = await supabaseClient.from('banners').select('image_url').eq('id', user.active_banner).single();
                if (banner) {
                    ACTIVE_BANNER_URL = safeUrl(banner.image_url);
                    stats.active_banner = user.active_banner;
                    stats.active_banner_url = ACTIVE_BANNER_URL; 
                    saveStats(stats);
                }
            }
        } catch(e) { console.error(e); }
    }

    const avatarEl = document.getElementById('tg-avatar'); 
    if (avatarEl && MY_TG_ID) { 
        if (MY_PHOTO_URL) avatarEl.innerHTML = `<img src="${safeUrl(MY_PHOTO_URL)}" style="width:100%; height:100%; object-fit:cover;">`; 
        else avatarEl.innerHTML = `<span>${escapeHTML(MY_NAME[0].toUpperCase())}</span>`; 
    } 
    
    const bannerEl = document.getElementById('profile-banner');
    if (bannerEl) {
        if (ACTIVE_BANNER_URL) {
            bannerEl.style.backgroundImage = `url('${ACTIVE_BANNER_URL}')`;
        } else {
            bannerEl.style.backgroundImage = 'none';
        }
    }

    setElText('my-tg-id', MY_TG_ID || 'Нет ID');
    setElText('tg-name', MY_NAME);

    const currentLevel = Math.floor(stats.xp / 100) + 1; 
    const xpCurrentLevel = stats.xp % 100; 
    const progressPercent = xpCurrentLevel; 
    let rankTitle = LEVEL_TITLES[Math.min(currentLevel - 1, 99)]; 
    
    setElText('user-level', currentLevel); 
    setElText('user-level-text', currentLevel); 
    setElText('user-rank', rankTitle); 

    setElText('user-xp-current', xpCurrentLevel); 
    setElText('user-xp-next', 100);
    setElWidth('user-xp-bar', progressPercent + '%'); 
    setElText('user-coins', stats.coins || 0);

    setElText('ach-points', stats.unlockedAchievements.length * 10); 
    setElText('ach-earned', stats.unlockedAchievements.length); 
    setElWidth('ach-bar', (stats.unlockedAchievements.length / 50) * 100 + '%'); 
    setElText('modal-level-num', currentLevel); 
    setElText('modal-rank', rankTitle); 
    setElText('modal-xp-cur', xpCurrentLevel); 
    setElText('modal-xp-next', 100); 
    setElWidth('modal-xp-bar', progressPercent + '%'); 
    setElText('modal-ach-earned', stats.unlockedAchievements.length); 
    
    const nextAch = ACHIEVEMENTS.find(a => !stats.unlockedAchievements.includes(a.id)); 
    if (nextAch) {
        setElText('next-ach-name', nextAch.name); 
        setElText('next-ach-reward', nextAch.reward);
    } else {
        setElText('next-ach-name', 'Все выполнено!'); 
        setElText('next-ach-reward', '0');
    }

    syncProfileToDB();
}

// ==========================================
// МАГАЗИН БАННЕРОВ
// ==========================================
async function openShopModal() {
    const container = document.getElementById('shop-items-container');
    const coinsEl = document.getElementById('shop-coins');
    let stats = getStats();
    
    document.getElementById('shopModal').classList.add('active');
    coinsEl.textContent = stats.coins;
    container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: #888;">Загрузка...</div>';

    if (!supabaseClient) return;

    try {
        const { data: banners, error: bErr } = await supabaseClient.from('banners').select('*');
        if (bErr) throw bErr;

        const { data: owned, error: oErr } = await supabaseClient.from('user_banners').select('banner_id').eq('tg_id', MY_TG_ID);
        if (oErr) throw oErr;

        const ownedIds = owned.map(o => o.banner_id);
        const currentActiveId = stats.active_banner;

        let html = '';
        banners.forEach(b => {
            const isOwned = ownedIds.includes(b.id);
            const isActive = currentActiveId === b.id;
            
            let btnHtml = '';
            if (isActive) {
                btnHtml = `<button class="shop-btn owned" disabled>Установлен</button>`;
            } else if (isOwned) {
                btnHtml = `<button class="shop-btn owned" onclick="applyBanner(${b.id}, '${b.image_url}')">Применить</button>`;
            } else {
                const priceText = b.price === 0 ? 'Получить' : `Купить ${b.price} 🪙`;
                btnHtml = `<button class="shop-btn" onclick="buyBanner(${b.id}, ${b.price})">${priceText}</button>`;
            }

            html += `
                <div class="shop-item">
                    <div class="shop-img" style="background-image: url('${safeUrl(b.image_url)}')"></div>
                    <div class="shop-info">
                        <div class="shop-name">${escapeHTML(b.name)}</div>
                        ${btnHtml}
                    </div>
                </div>
            `;
        });
        container.innerHTML = html;

    } catch(e) {
        console.error(e);
        container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: #f44;">Ошибка загрузки магазина</div>';
    }
}

async function buyBanner(bannerId, price) {
    let stats = getStats();
    if (stats.coins < price) {
        showToast('Недостаточно монет!');
        return;
    }

    if (!supabaseClient) return;

    try {
        stats.coins -= price;
        saveStats(stats);

        await supabaseClient.from('user_banners').insert({ tg_id: MY_TG_ID, banner_id: bannerId });
        
        stats.active_banner = bannerId;
        
        const { data: b } = await supabaseClient.from('banners').select('image_url').eq('id', bannerId).single();
        if (b) {
            stats.active_banner_url = safeUrl(b.image_url);
            ACTIVE_BANNER_URL = stats.active_banner_url;
        }
        
        saveStats(stats);
        syncProfileToDB();

        showToast('✅ Баннер получен!');
        openShopModal(); 
        loadProfileData(); 

    } catch(e) {
        console.error(e);
        showToast('Ошибка покупки');
    }
}

async function applyBanner(bannerId, imageUrl) {
    let stats = getStats();
    stats.active_banner = bannerId;
    stats.active_banner_url = safeUrl(imageUrl);
    saveStats(stats);
    syncProfileToDB();
    
    ACTIVE_BANNER_URL = stats.active_banner_url;
    const bannerEl = document.getElementById('profile-banner');
    if (bannerEl) bannerEl.style.backgroundImage = `url('${ACTIVE_BANNER_URL}')`;

    showToast('Баннер применен!');
    openShopModal(); 
}

async function resetBanner() {
    let stats = getStats();
    stats.active_banner = null;
    stats.active_banner_url = '';
    saveStats(stats);
    syncProfileToDB();
    
    ACTIVE_BANNER_URL = '';
    const bannerEl = document.getElementById('profile-banner');
    if (bannerEl) bannerEl.style.backgroundImage = 'none';

    showToast('Баннер снят');
}

// ==========================================
// 6. ДРУЗЬЯ
// ==========================================
async function loadFriends() {
    const listContainer = document.getElementById('friends-list-container');
    if (!listContainer || !supabaseClient || !MY_TG_ID) return;
    listContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: #888;">Загрузка...</div>';

    try {
        const { data: incoming } = await supabaseClient.from('friends').select('user_id').eq('friend_id', MY_TG_ID).eq('status', 'pending');
        const { data: accepted } = await supabaseClient.from('friends').select('friend_id').eq('user_id', MY_TG_ID).eq('status', 'accepted');

        let html = '';

        if (incoming && incoming.length > 0) {
            const inIds = incoming.map(f => f.user_id);
            const { data: inUsers } = await supabaseClient.from('users').select('*').in('tg_id', inIds);
            if (inUsers && inUsers.length > 0) {
                html += '<h3 style="padding: 0 20px 10px; font-size: 16px; color: #ffd700;">🔔 Заявки в друзья</h3>';
                inUsers.forEach(u => {
                    const avatarUrl = u.avatar_url ? safeUrl(u.avatar_url) : '';
                    html += `<div class="friend-card" style="background: rgba(255,215,0,0.05); border-color: rgba(255,215,0,0.2);"><div class="friend-avatar">${avatarUrl ? `<img src="${avatarUrl}" onerror="this.style.display='none'; this.parentElement.innerHTML='${escapeHTML(u.name[0].toUpperCase())}';">` : escapeHTML(u.name[0].toUpperCase())}</div><div class="friend-info"><h3>${escapeHTML(u.name)}</h3><p>ID: ${escapeHTML(u.tg_id)}</p></div><div style="display: flex; gap: 5px; margin-left: auto;"><button onclick="acceptFriend(${u.tg_id})" style="background: #2ecc71; color: #fff; border: none; padding: 6px 10px; border-radius: 8px; font-weight: bold; cursor: pointer;">✓</button><button onclick="rejectFriend(${u.tg_id})" style="background: #e74c3c; color: #fff; border: none; padding: 6px 10px; border-radius: 8px; font-weight: bold; cursor: pointer;">✕</button></div></div>`;
                });
            }
        }

        html += '<h3 style="padding: 10px 20px 10px; font-size: 16px; color: #fff;">Мои друзья</h3>';
        if (!accepted || accepted.length === 0) {
            html += '<div style="padding: 0 20px; color: #888; font-size: 14px;">Пока никого нет</div>';
        } else {
            const accIds = accepted.map(f => f.friend_id);
            const { data: accUsers } = await supabaseClient.from('users').select('*').in('tg_id', accIds);
            if (accUsers && accUsers.length > 0) {
                accUsers.forEach(friend => {
                    const avatarUrl = friend.avatar_url ? safeUrl(friend.avatar_url) : '';
                    html += `<div class="friend-card" onclick="openFriendProfile(${friend.tg_id}, '${escapeHTML(friend.name).replace(/'/g, "\\'")}')"><div class="friend-avatar">${avatarUrl ? `<img src="${avatarUrl}" onerror="this.style.display='none'; this.parentElement.innerHTML='${escapeHTML(friend.name[0].toUpperCase())}';">` : escapeHTML(friend.name[0].toUpperCase())}</div><div class="friend-info"><h3>${escapeHTML(friend.name)}</h3><p>ID: ${escapeHTML(friend.tg_id)} • Ур. ${Math.floor((friend.xp||0) / 100) + 1}</p></div><div style="margin-left: auto; color: #5b5bff; font-size: 20px;">›</div></div>`;
                });
            }
        }
        listContainer.innerHTML = html;
    } catch (e) { listContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: #ff4444;">Ошибка</div>'; }
}

async function searchFriend() {
    const id = document.getElementById('friend-search-input').value.trim();
    const resultContainer = document.getElementById('search-result-container');
    if (!id) return;
    resultContainer.innerHTML = '<div style="color: #888; text-align: center; font-size: 14px;">Поиск...</div>';
    try {
        const { data: userData } = await supabaseClient.from('users').select('*').eq('tg_id', id).single();
        if (!userData) { resultContainer.innerHTML = '<div style="color: #ff4444; text-align: center; font-size: 14px;">Не найден</div>'; return; }
        const avatarUrl = userData.avatar_url ? safeUrl(userData.avatar_url) : '';
        resultContainer.innerHTML = `<div class="friend-card" style="margin: 0; background: rgba(91,91,255,0.1); border-color: #5b5bff;"><div class="friend-avatar">${avatarUrl ? `<img src="${avatarUrl}">` : escapeHTML(userData.name[0].toUpperCase())}</div><div class="friend-info"><h3>${escapeHTML(userData.name)}</h3><p>ID: ${escapeHTML(userData.tg_id)}</p></div><button onclick="sendFriendRequest(${userData.tg_id})" style="background: #5b5bff; color: #fff; border: none; padding: 8px 15px; border-radius: 10px; font-weight: bold; margin-left: auto; cursor: pointer;">Заявка</button></div>`;
    } catch (e) { resultContainer.innerHTML = '<div style="color: #ff4444; text-align: center; font-size: 14px;">Ошибка</div>'; }
}

async function sendFriendRequest(friendId) {
    await supabaseClient.from('friends').insert({ user_id: MY_TG_ID, friend_id: friendId, status: 'pending' });
    document.getElementById('search-result-container').innerHTML = '';
    document.getElementById('friend-search-input').value = '';
    showToast('📩 Заявка отправлена!');
    loadFriends();
}
async function acceptFriend(userId) {
    await supabaseClient.from('friends').update({ status: 'accepted' }).eq('user_id', userId).eq('friend_id', MY_TG_ID);
    await supabaseClient.from('friends').insert({ user_id: MY_TG_ID, friend_id: userId, status: 'accepted' });
    loadFriends();
}
async function rejectFriend(userId) {
    await supabaseClient.from('friends').delete().eq('user_id', userId).eq('friend_id', MY_TG_ID);
    loadFriends();
}
async function removeFriend(friendId) {
    await supabaseClient.from('friends')
        .delete()
        .or(`and(user_id.eq.${MY_TG_ID},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${MY_TG_ID})`);
    switchTab('friends');
}

async function openFriendProfile(id, name) {
    switchTab('friend-profile');
    const container = document.getElementById('friend-profile-content');
    container.innerHTML = '<div style="text-align: center; padding: 40px; color: #888;">Загрузка...</div>';

    try {
        const { data: friend } = await supabaseClient.from('users').select('*').eq('tg_id', id).single();
        if (!friend) throw new Error();

        const lvl = Math.floor((friend.xp || 0) / 100) + 1;
        const rank = LEVEL_TITLES[Math.min(lvl - 1, 99)];
        
        let lastWatchedHtml = '';
        if (friend.last_watched) {
            const animeData = await API.getDetails(friend.last_watched);
            if (animeData) {
                lastWatchedHtml = `
                    <div style="margin-top: 15px; padding: 15px; background: rgba(91,91,255,0.1); border-radius: 12px; border: 1px solid rgba(91,91,255,0.2); cursor: pointer;" onclick="openAnimeDetail('${animeData.id}', 'friends')">
                        <div style="font-size: 12px; color: #888; margin-bottom: 8px;">Последнее аниме:</div>
                        <div style="display: flex; gap: 10px; align-items: center;">
                            <img src="${safeUrl(animeData.images.jpg.image_url)}" style="width: 40px; height: 55px; border-radius: 6px; object-fit: cover;">
                            <div style="font-size: 14px; font-weight: bold; color: #fff; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${escapeHTML(animeData.title)}</div>
                        </div>
                    </div>`;
            }
        }

        const friendAchCount = Math.min(Math.floor(lvl / 2) + 1, 50); 
        const avatarUrl = friend.avatar_url ? safeUrl(friend.avatar_url) : '';
        const avatarHtml = avatarUrl ? `<img src="${avatarUrl}" style="width: 100%; height: 100%; object-fit: cover;">` : escapeHTML(friend.name[0].toUpperCase());

        let friendBanner = '';
        if (friend.active_banner) {
            const { data: b } = await supabaseClient.from('banners').select('image_url').eq('id', friend.active_banner).single();
            if (b) friendBanner = `style="background-image: url('${safeUrl(b.image_url)}');"`;
        }

        container.innerHTML = `
            <div class="user-card" ${friendBanner}>
                <div class="user-card-content">
                    <div class="avatar-container">
                        <div class="avatar" style="background: linear-gradient(135deg, #5b5bff, #b44aff); display: flex; align-items: center; justify-content: center; font-size: 32px; font-weight: bold; color: #fff; overflow: hidden;">${avatarHtml}</div>
                    </div>
                    <div class="user-details">
                        <h2>${escapeHTML(friend.name)}</h2>
                        <div style="background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 6px 15px; display: inline-block; margin: 5px 0 15px;"><span style="color: #ccc; font-size: 12px;">ID:</span> <span style="color: #fff; font-weight: bold;">${escapeHTML(friend.tg_id)}</span></div>
                        <div class="level-row">
                            <div class="level-badge">
                                <!-- ИСПРАВЛЕНИЕ 1: CSS кружок -->
                                <span>${lvl}</span>
                            </div>
                            <div class="level-info">
                                <div class="level-title">УРОВЕНЬ ${lvl} <span class="rank">${rank}</span></div>
                                <div class="xp-bar-container"><div class="xp-bar-fill" style="width: ${(friend.xp || 0) % 100}%;"></div></div>
                                <div class="xp-text">${(friend.xp || 0) % 100} / 100 XP</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="achievements-card" style="margin-top: 15px; cursor: default;">
                <div class="ach-header">
                    <div class="ach-icon-big"><svg><use href="#oa-achievement"></use></svg></div>
                    <div class="ach-info"><h3>ДОСТИЖЕНИЯ</h3><p>${friendAchCount * 10} очков</p></div>
                    <div class="ach-total">${friendAchCount}/50</div>
                </div>
                <div class="ach-progress-wrap"><div class="ach-progress-bar" style="width: ${(friendAchCount / 50) * 100}%;"></div></div>
            </div>
            ${lastWatchedHtml}
            <button onclick="removeFriend(${friend.tg_id})" style="width: 100%; margin-top: 20px; padding: 14px; border-radius: 14px; border: 1px solid rgba(255,45,120,0.3); background: rgba(255,45,120,0.1); color: #ff2d78; font-weight: bold; font-size: 15px; cursor: pointer;">🗑️ Удалить из друзей</button>
        `;
    } catch (e) { container.innerHTML = '<div style="text-align: center; padding: 40px; color: #ff4444;">Ошибка</div>'; }
}

// ==========================================
// 7. ПЛЕЕР
// ==========================================
function startWatching(anime) { 
    currentAnimeForPlayer = anime; 
    switchTab('voice'); 
}
function renderVoiceSelection() { 
    const container = document.getElementById('voice-list'); 
    let html = ''; 
    VOICES.forEach(v => { html += `<div onclick="selectVoice('${v.id}', '${v.name}')" style="background: #14141f; border: 1px solid rgba(255,255,255,0.1); padding: 16px; border-radius: 14px; display: flex; align-items: center; gap: 15px; cursor: pointer; transition: 0.2s;"><div style="font-size: 24px;">${v.icon}</div><div style="font-size: 16px; font-weight: 600; color: #fff;">${v.name}</div></div>`; }); 
    container.innerHTML = html; 
}
function selectVoice(id, name) { selectedVoice = name; switchTab('player'); renderPlayerSelection(); }
function renderPlayerSelection() { 
    const container = document.getElementById('player-list'); 
    let html = ''; 
    PLAYERS.forEach(p => { html += `<div onclick="selectPlayer('${p.id}', '${p.name}')" style="background: #14141f; border: 1px solid rgba(255,255,255,0.1); padding: 16px; border-radius: 14px; display: flex; align-items: center; gap: 15px; cursor: pointer; transition: 0.2s;"><div style="font-size: 24px;">${p.icon}</div><div style="font-size: 16px; font-weight: 600; color: #fff;">${p.name}</div></div>`; }); 
    container.innerHTML = html; 
}
function selectPlayer(id, name) { selectedPlayer = name; switchTab('episodes'); renderEpisodesSelection(); }
function renderEpisodesSelection() { 
    document.getElementById('selected-voice-text').textContent = selectedVoice; 
    document.getElementById('selected-player-text').textContent = selectedPlayer; 
    const container = document.getElementById('episodes-list'); 
    if (!currentAnimeForPlayer) return; 
    let totalEpisodes = currentAnimeForPlayer.episodes || 12; 
    if (totalEpisodes > 50) totalEpisodes = 50; 
    let html = ''; 
    for (let i = 1; i <= totalEpisodes; i++) { html += `<div onclick="playEpisode(${i})" style="background: #1a1a20; border: 1px solid rgba(255,255,255,0.1); padding: 15px; border-radius: 12px; text-align: center; font-size: 16px; font-weight: bold; color: #fff; cursor: pointer; transition: 0.2s;">${i}</div>`; } 
    container.innerHTML = html; 
}
function playEpisode(epNum) { 
    addXP(20); 
    let stats = getStats(); 
    stats.episodesWatched += 1; 
    stats.minutesWatched += 24; 
    saveStats(stats); 
    if (tg) tg.showAlert(`🎬 Просмотр:\n${currentAnimeForPlayer.title}\n${selectedVoice}\n${selectedPlayer}\nСерия: ${epNum}\n\n(+20 XP)`); 
    currentAnimeForPlayer = null;
    switchTab('home');
}

// ==========================================
// 8. КАТАЛОГ И ДЕТАЛИ
// ==========================================
function initCatalogFilters() { 
    const genreContainer = document.getElementById('genre-filters'); 
    if (!genreContainer) return; 
    let html = `<div class="genre-pill active" onclick="setGenreFilter('', this)"><div class="dot"></div>Все</div>`; 
    GENRES.forEach(g => { html += `<div class="genre-pill" onclick="setGenreFilter('${g.name}', this)">${g.name}</div>`; }); 
    genreContainer.innerHTML = html; 
}
function setGenreFilter(genreName, btn) { 
    currentFilters.genre = genreName; 
    document.querySelectorAll('#genre-filters .genre-pill').forEach(el => el.classList.remove('active')); 
    btn.classList.add('active'); 
    if (genreName === '') btn.innerHTML = '<div class="dot"></div>Все'; 
    loadCatalog(true); 
}
function searchAnime() { 
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => { currentFilters.search = document.getElementById('search-input').value.trim(); loadCatalog(true); }, 500);
}
function openFilterModal(type) { 
    const modal = document.getElementById('filterModal'); 
    const title = document.getElementById('filter-modal-title'); 
    const container = document.getElementById('filter-options-container'); 
    let options = []; let currentVal = currentFilters[type]; 
    if (type === 'year') { options = YEARS
