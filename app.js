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
        let args = [`page:${page}`, `limit:${limit}`];
        
        if (filters.search) args.push(`search:"${filters.search}"`);
        if (filters.genre) {
            const genreId = GENRES.find(g => g.name === filters.genre)?.id;
            if (genreId) args.push(`genre:${genreId}`);
        }
        if (filters.year) args.push(`season:"${filters.year}"`); 
        if (filters.status) args.push(`status:${filters.status}`);
        if (filters.sort) args.push(`order:${filters.sort}`);
        else args.push('order:popularity');

        const q = `{animes(${args.join(',')}){id name russian score episodes status poster{originalUrl} genres{name}}}`;
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
let currentShopTab = 'banners'; // Вкладка магазина по умолчанию

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
        if (tabName === 'home' && navItems[0]) navItems[0].classList.add('active');
        if (tabName === 'catalog' && navItems[1]) navItems[1].classList.add('active');
        if (tabName === 'my' && navItems[2]) navItems[2].classList.add('active');
        if (tabName === 'friends' && navItems[3]) navItems[3].classList.add('active');
        if (tabName === 'profile' && navItems[4]) navItems[4].classList.add('active');
    }

    if (tabName === 'profile') loadProfileData();
    if (tabName === 'catalog') {
        if (document.getElementById('catalog-grid').children.length === 0) {
            initCatalogFilters();
            loadCatalog(true);
        }
    }
    if (tabName === 'my') renderMyList();
    if (tabName === 'voice') { 
        document.getElementById('voice-title').textContent = 'Выбор озвучки'; 
        renderVoiceSelection(); 
    }
    if (tabName === 'player') document.getElementById('player-title').textContent = 'Выбор плеера';
    if (tabName === 'episodes') document.getElementById('eps-title').textContent = 'Выбор серии';
    if (tabName === 'friends') loadFriends();
    if (tabName === 'achievements') renderAchievementsPage(); 
    if (tabName === 'shop') renderShopTab(currentShopTab);
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
    
    // --- СИНХРОНИЗАЦИЯ ИЗ SUPABASE ---
    if (MY_TG_ID && supabaseClient) {
        try {
            const { data: dbUser } = await supabaseClient.from('users').select('*').eq('tg_id', MY_TG_ID).single();
            if (dbUser) {
                stats.coins = Math.max(stats.coins || 0, dbUser.coins || 0);
                stats.xp = Math.max(stats.xp || 0, dbUser.xp || 0);
                
                if (dbUser.active_banner && !stats.active_banner) {
                    stats.active_banner = dbUser.active_banner;
                    const { data: banner } = await supabaseClient.from('banners').select('image_url').eq('id', dbUser.active_banner).single();
                    if (banner) {
                        ACTIVE_BANNER_URL = safeUrl(banner.image_url);
                        stats.active_banner_url = ACTIVE_BANNER_URL;
                    }
                }
                saveStats(stats);
            }
        } catch(e) { 
            console.log('Пользователь еще не создан в БД или ошибка синхронизации', e); 
        }
    }
    
    const today = new Date().toDateString(); 
    // Ежедневный вход
    if (stats.lastVisit !== today) { 
        stats.daysStreak += 1; 
        stats.lastVisit = today; 
        stats.xp += 5; // +5 XP за вход
        stats.coins += 10; 
        stats.watchedToday = []; 
        saveStats(stats); 
        showToast('📅 Ежедневный вход! +5 XP');
    } 
    
    checkAchievements(stats); 
    
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

    const totalAch = ACHIEVEMENTS.length;
    setElText('ach-points', stats.unlockedAchievements.length * 10); 
    setElText('ach-earned', stats.unlockedAchievements.length); 
    setElText('ach-total-count', totalAch);
    setElWidth('ach-bar', (stats.unlockedAchievements.length / totalAch) * 100 + '%'); 
    
    setElText('modal-level-num', currentLevel); 
    setElText('modal-rank', rankTitle); 
    setElText('modal-xp-cur', xpCurrentLevel); 
    setElText('modal-xp-next', 100); 
    setElWidth('modal-xp-bar', progressPercent + '%'); 
    
    const modalLevelNum = document.getElementById('modal-icon-level');
    if (modalLevelNum) {
        modalLevelNum.textContent = currentLevel;
    }

    const nextAch = ACHIEVEMENTS.find(a => !stats.unlockedAchievements.includes(a.id)); 
    if (nextAch) {
        setElText('next-ach-name', nextAch.name); 
        setElText('next-ach-reward', nextAch.coins);
    } else {
        setElText('next-ach-name', 'Все выполнено!'); 
        setElText('next-ach-reward', '0');
    }

    syncProfileToDB();
}

// ==========================================
// МАГАЗИН
// ==========================================
function openShopModal() {
    switchProfileTab('shop');
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
    
    container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: #888; padding: 20px;">Загрузка...</div>';

    if (tabName === 'banners') {
        renderBannersInShop(container);
    } else {
        container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: #888; padding: 40px; font-size: 16px;">🚧 Скоро здесь появятся товары!</div>';
    }
}

async function renderBannersInShop(container) {
    let stats = getStats();
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
        container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: #f44;">Ошибка загрузки баннеров</div>';
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
        stats.hasPurchasedBanner = true; 
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
        checkAchievements(stats);

        showToast('✅ Баннер получен!');
        renderShopTab('banners');
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
    renderShopTab('banners'); 
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
            <div class="user-card-wrapper">
                <div class="user-card-top" ${friendBanner}>
                    <div class="user-card-top-content">
                        <div class="avatar-container">
                            <div class="avatar" style="background: linear-gradient(135deg, #5b5bff, #b44aff); display: flex; align-items: center; justify-content: center; font-size: 32px; font-weight: bold; color: #fff; overflow: hidden;">${avatarHtml}</div>
                        </div>
                        <div class="user-details">
                            <h2>${escapeHTML(friend.name)}</h2>
                            <div class="id-container">
                                <span style="color: #ccc; font-size: 12px;">ID:</span>
                                <span style="color: #fff; font-weight: bold; font-size: 14px;">${escapeHTML(friend.tg_id)}</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="user-card-bottom">
                    <div class="level-row">
                        <div class="level-badge">
                            <img src="level_icon.png" class="level-badge-img" alt="level">
                            <span class="level-number">${lvl}</span>
                        </div>
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
    let stats = getStats(); 
    stats.episodesWatched += 1; 
    stats.minutesWatched += 24; 
    saveStats(stats); 
    if (tg) tg.showAlert(`🎬 Просмотр:\n${currentAnimeForPlayer.title}\n${selectedVoice}\n${selectedPlayer}\nСерия: ${epNum}`); 
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
    if (type === 'year') { options = YEARS; title.textContent = 'Год выхода'; } 
    if (type === 'status') { options = STATUSES; title.textContent = 'Статус'; } 
    if (type === 'sort') { options = SORTS; title.textContent = 'Сортировка'; } 
    let html = `<button class="filter-option-btn ${currentVal === '' ? 'active' : ''}" onclick="applyFilter('${type}', '')">Любой</button>`; 
    options.forEach(opt => { html += `<button class="filter-option-btn ${currentVal === opt.id ? 'active' : ''}" onclick="applyFilter('${type}', '${opt.id}')">${opt.name}</button>`; }); 
    container.innerHTML = html; modal.classList.add('active'); 
}
function applyFilter(type, value) { 
    currentFilters[type] = value; 
    closeModal('filterModal'); 
    const btnIndex = type === 'year' ? 0 : type === 'status' ? 1 : 2; 
    const btns = document.querySelectorAll('#dropdown-filters .filter-btn'); 
    let optName = 'Любой'; 
    if (value) { const list = type === 'year' ? YEARS : type === 'status' ? STATUSES : SORTS; optName = list.find(o => o.id === value)?.name || 'Любой'; } 
    else { optName = type === 'year' ? 'Год' : type === 'status' ? 'Статус' : 'Сортировка'; } 
    btns[btnIndex].innerHTML = `${optName} ⌄`; 
    loadCatalog(true); 
}

async function loadCatalog(reset = false) {
    if (isCatalogLoading) return;
    isCatalogLoading = true;
    const grid = document.getElementById('catalog-grid');
    const loadMoreBtn = document.getElementById('load-more-btn');
    if (reset) { grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #888;">Загрузка...</div>'; hasMoreCatalog = true; catalogPage = 1; }
    try {
        const items = await API.getCatalog(catalogPage, 50, currentFilters);
        
        const displayItems = items.slice(0, 12);
        if (reset) grid.innerHTML = '';
        if (displayItems.length === 0) { 
            if (reset) grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #888;">Ничего не найдено</div>'; 
            hasMoreCatalog = false; if (loadMoreBtn) loadMoreBtn.style.display = 'none'; return; 
        }
        displayItems.forEach(anime => { 
            const title = escapeHTML(anime.title); const img = safeUrl(anime.images.jpg.image_url); const score = anime.score ? Number(anime.score).toFixed(1) : '?'; 
            const cardHtml = `<div class="catalog-card" onclick="openAnimeDetail('${anime.id}', 'catalog')"><img class="catalog-card-img" src="${img}" loading="lazy"><div style="position: absolute; top: 8px; right: 8px; background: rgba(0,0,0,0.7); padding: 2px 6px; border-radius: 6px; font-size: 10px; color: #ffd700; font-weight: bold;">⭐ ${score}</div><div class="catalog-card-title">${title}</div></div>`; 
            grid.insertAdjacentHTML('beforeend', cardHtml);
        });
        if (items.length < 50) { hasMoreCatalog = false; if (loadMoreBtn) loadMoreBtn.style.display = 'none'; } 
        else { if (loadMoreBtn) loadMoreBtn.style.display = 'inline-block'; }
    } catch (e) { if (reset) grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #ff4444;">Ошибка</div>'; } 
    finally { isCatalogLoading = false; }
}
function loadMoreCatalog() { if (!hasMoreCatalog || isCatalogLoading) return; catalogPage++; loadCatalog(false); }

async function openAnimeDetail(id, fromScreen = 'catalog') {
    previousScreen = fromScreen; switchTab('detail');
    const container = document.getElementById('detail-content');
    container.innerHTML = '<div style="text-align: center; padding: 40px; color: #888;">Загрузка...</div>';
    try {
        const anime = await API.getDetails(id);
        if (!anime) throw new Error();
        const title = escapeHTML(anime.title); const desc = escapeHTML(anime.description); const score = anime.score ? Number(anime.score).toFixed(1) : '?'; const poster = safeUrl(anime.images.jpg.image_url);
        let statusColor = '#2ecc71'; if (anime.status === 'Онгоинг') statusColor = '#3498db'; if (anime.status === 'Анонс') statusColor = '#e74c3c';
        const stats = getStats(); const favEntry = (stats.favedAnime || []).find(a => a.id === anime.id); const isFaved = !!favEntry;
        window._tempAnimeData = anime; 
        
        const heartSvg = `<svg style="width: 26px; height: 26px;"><use href="#oa-favorite"></use></svg>`;

        container.innerHTML = `
            <div style="position: absolute; top: 0; left: 0; width: 100%; height: 50vh; z-index: -1;"><img src="${poster}" style="width: 100%; height: 100%; object-fit: cover; opacity: 0.4; mask-image: linear-gradient(to bottom, black 50%, transparent 100%); -webkit-mask-image: linear-gradient(to bottom, black 50%, transparent 100%);"></div>
            <div style="padding-top: 30px;"><div style="display: flex; gap: 20px; margin-bottom: 25px; align-items: flex-end;"><img class="detail-poster" src="${poster}" style="width: 140px; border-radius: 16px; box-shadow: 0 10px 30px rgba(0,0,0,0.8); border: 2px solid rgba(255,255,255,0.1);"><div style="flex: 1; padding-bottom: 5px;"><h1 style="font-size: 24px; font-weight: 800; line-height: 1.1; margin-bottom: 12px; color: #fff; text-shadow: 0 2px 10px rgba(0,0,0,0.8);">${title}</h1><div style="display: flex; flex-wrap: wrap; gap: 6px;"><span style="background: #ffd700; color: #000; padding: 4px 10px; border-radius: 8px; font-size: 12px; font-weight: 800;">⭐ ${score}</span><span style="background: rgba(255,255,255,0.15); backdrop-filter: blur(5px); color: #fff; padding: 4px 10px; border-radius: 8px; font-size: 12px; font-weight: 600;">📺 ${anime.episodes || '?'} эп.</span><span style="background: ${statusColor}; color: #fff; padding: 4px 10px; border-radius: 8px; font-size: 12px; font-weight: 600;">${anime.status}</span></div></div></div>
                <div style="display: flex; gap: 10px; margin-bottom: 20px;">
                    <button onclick="startWatching(window._tempAnimeData)" style="flex: 1; background: #5b5bff; color: #fff; border: none; padding: 16px; border-radius: 14px; font-size: 16px; font-weight: 700; cursor: pointer; box-shadow: 0 8px 25px rgba(91,91,255,0.4); display: flex; justify-content: center; align-items: center; gap: 8px;">▶ Смотреть</button>
                    <button onclick="openStatusModal('${anime.id}')" class="btn-icon-heart ${isFaved ? 'faved' : ''}" style="background: ${isFaved ? 'rgba(255,45,120,0.2)' : 'rgba(255,255,255,0.1)'}; color: ${isFaved ? '#ff2d78' : '#fff'}; border: 1px solid ${isFaved ? '#ff2d78' : 'rgba(255,255,255,0.15)'};">
                        ${heartSvg}
                    </button>
                </div>
                <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 20px;">${(anime.genres || []).map(g => `<span style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.15); color: #ccc; padding: 6px 14px; border-radius: 20px; font-size: 13px; font-weight: 600;">${escapeHTML(g)}</span>`).join('')}</div>
                <div style="margin-bottom: 20px;"><h3 style="font-size: 16px; margin-bottom: 10px; color: #fff; display: flex; align-items: center; gap: 8px;"><svg style="width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round;"><use href="#oa-book"></use></svg> Описание</h3><p id="desc-text" style="color: #aaa; font-size: 14px; line-height: 1.6; display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden;">${desc}</p><button id="desc-btn" onclick="toggleDescription()" style="background: none; border: none; color: #5b5bff; font-weight: 700; font-size: 14px; margin-top: 8px; cursor: pointer; padding: 0;">Читать полностью ▼</button></div>
            </div>`;
    } catch (e) { container.innerHTML = '<div style="text-align: center; padding: 40px; color: #ff4444;">Ошибка</div>'; }
}

function openStatusModal(id) { 
    const animeTitle = window._tempAnimeData ? window._tempAnimeData.title : 'Аниме';
    document.getElementById('status-anime-title').textContent = animeTitle; 
    document.getElementById('statusModal').classList.add('active'); 
    window._currentAnimeForStatus = id; 
}

function setAnimeStatus(status) {
    const id = window._currentAnimeForStatus; if (!id) return;
    let stats = getStats(); stats.favedAnime = stats.favedAnime || []; 
    
    let cachedAnime = stats.cachedAnime || {};
    if (status !== '' && window._tempAnimeData) {
        cachedAnime[id] = window._tempAnimeData;
        stats.cachedAnime = cachedAnime;
    }
    
    stats.favedAnime = stats.favedAnime.filter(a => a.id !== id);
    if (status !== '') { stats.favedAnime.push({ id: id, status: status }); showToast('Статус обновлен!'); } 
    else { showToast('Удалено'); }
    saveStats(stats); closeModal('statusModal');
    checkAchievements(stats);
    
    const heartBtn = document.querySelector('#detail-content button[onclick^="openStatusModal"]');
    if (heartBtn) { 
        if (status !== '') { 
            heartBtn.style.background = 'rgba(255,45,120,0.2)'; 
            heartBtn.style.borderColor = '#ff2d78'; 
            heartBtn.style.color = '#ff2d78'; 
            heartBtn.innerHTML = '<svg style="width: 26px; height: 26px;"><use href="#oa-favorite"></use></svg>'; 
        } else { 
            heartBtn.style.background = 'rgba(255,255,255,0.1)'; 
            heartBtn.style.borderColor = 'rgba(255,255,255,0.15)'; 
            heartBtn.style.color = '#fff'; 
            heartBtn.innerHTML = '<svg style="width: 26px; height: 26px;"><use href="#oa-favorite"></use></svg>'; 
        } 
    }
}

function toggleDescription() { 
    const descEl = document.getElementById('desc-text'); const btnEl = document.getElementById('desc-btn'); 
    if (descEl.style.webkitLineClamp === '4' || descEl.style.webkitLineClamp === '') { descEl.style.webkitLineClamp = 'unset'; btnEl.innerHTML = 'Свернуть ▲'; } 
    else { descEl.style.webkitLineClamp = '4'; btnEl.innerHTML = 'Читать полностью ▼'; } 
}
async function openRandomAnime() { 
    if (tg) tg.HapticFeedback.impactOccurred('medium'); 
    showToast('🎲 Ищем...'); 
    try { const items = await API.getRandom(1); if (items && items.length > 0) openAnimeDetail(items[0].id, 'catalog'); } catch (e) {} 
}

// ==========================================
// 9. СПИСОК "МОЁ"
// ==========================================
function filterMyList(type, btn) { currentMyListFilter = type; document.querySelectorAll('.my-list-tab').forEach(el => el.classList.remove('active')); btn.classList.add('active'); renderMyList(); }
function renderMyList() {
    const grid = document.getElementById('my-grid'); if (!grid) return;
    let stats = getStats(); let favs = stats.favedAnime || []; let filtered = favs;
    if (currentMyListFilter !== 'all') filtered = favs.filter(a => a.status === currentMyListFilter);
    if (filtered.length === 0) { grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #888;">Тут пусто</div>'; return; }
    
    const cachedAnime = stats.cachedAnime || {};
    grid.innerHTML = '';
    
    filtered.forEach(favItem => {
        let anime = cachedAnime[favItem.id];
        if (anime) {
            renderMyListCard(anime, grid);
        } else {
            API.getDetails(favItem.id).then(data => {
                if (data) {
                    renderMyListCard(data, grid);
                    let s = getStats();
                    s.cachedAnime = s.cachedAnime || {};
                    s.cachedAnime[favItem.id] = data;
                    saveStats(s);
                }
            }).catch(() => {});
        }
    });
}

function renderMyListCard(anime, grid) {
    const title = escapeHTML(anime.title); const img = safeUrl(anime.images.jpg.image_url); const score = anime.score ? Number(anime.score).toFixed(1) : '?';
    const cardHtml = `<div class="catalog-card" onclick="openAnimeDetail('${anime.id}', 'my')"><img class="catalog-card-img" src="${img}" loading="lazy"><div style="position: absolute; top: 8px; right: 8px; background: rgba(0,0,0,0.7); padding: 2px 6px; border-radius: 6px; font-size: 10px; color: #ffd700; font-weight: bold;">⭐ ${score}</div><div class="catalog-card-title">${title}</div></div>`;
    grid.insertAdjacentHTML('beforeend', cardHtml);
}

// ==========================================
// 10. СИСТЕМА ДОСТИЖЕНИЙ И XP
// ==========================================

const RARITY_STYLES = {
    common: { color: '#ccc', class: 'common', icon: 'ach-icon-crystal' },
    rare: { color: '#00d2ff', class: 'rare', icon: 'ach-icon-crystal' },
    epic: { color: '#b44aff', class: 'epic', icon: 'ach-icon-flower' },
    legendary: { color: '#ffd700', class: 'legendary', icon: 'ach-icon-flower' }
};

const ACHIEVEMENTS = [
    // --- Обычные (Common) ---
    { 
        id: 'c1', 
        name: "Киносеанс", 
        desc: "Посмотреть любое аниме полностью", 
        rarity: 'common', 
        xp: 10, coins: 100, 
        check: (s) => s.episodesWatched >= 1, 
        progress: (s) => Math.min(s.episodesWatched, 1),
        max: 1,
        imgUrl: "cinema.png"
    },
    { 
        id: 'c2', 
        name: "Марафонец", 
        desc: "Провести на сайте более 3 часов", 
        rarity: 'common', 
        xp: 20, coins: 100, 
        check: (s) => s.totalMinutesOnSite >= 180,
        progress: (s) => Math.min(s.totalMinutesOnSite, 180),
        max: 180,
        imgUrl: "marathon.png"
    },
    { 
        id: 'c3', 
        name: "Постоянный гость", 
        desc: "Заходить на сайт 7 дней подряд", 
        rarity: 'common', 
        xp: 30, coins: 200, 
        check: (s) => s.daysStreak >= 7,
        progress: (s) => Math.min(s.daysStreak, 7),
        max: 7,
        imgUrl: "guest.png"
    },
    { 
        id: 'c4', 
        name: "Новичок", 
        desc: "Достичь 10 уровня", 
        rarity: 'common', 
        xp: 50, coins: 500, 
        check: (s) => Math.floor(s.xp / 100) + 1 >= 10,
        progress: (s) => Math.min(Math.floor(s.xp / 100) + 1, 10),
        max: 10,
        imgUrl: "newbie.png"
    },

    // --- Редкие (Rare) ---
    { 
        id: 'r1', 
        name: "Коллекционер", 
        desc: "Посмотреть 10 аниме", 
        rarity: 'rare', 
        xp: 50, coins: 300, 
        check: (s) => s.episodesWatched >= 10,
        progress: (s) => Math.min(s.episodesWatched, 10),
        max: 10,
        imgUrl: "collector.png"
    },
    { 
        id: 'r2', 
        name: "Опытный зритель", 
        desc: "Достичь 20 уровня", 
        rarity: 'rare', 
        xp: 100, coins: 600, 
        check: (s) => Math.floor(s.xp / 100) + 1 >= 20,
        progress: (s) => Math.min(Math.floor(s.xp / 100) + 1, 20),
        max: 20,
        imgUrl: "experienced.png"
    },
    { 
        id: 'r3', 
        name: "Знаток", 
        desc: "Достичь 40 уровня", 
        rarity: 'rare', 
        xp: 100, coins: 750, 
        check: (s) => Math.floor(s.xp / 100) + 1 >= 40,
        progress: (s) => Math.min(Math.floor(s.xp / 100) + 1, 40),
        max: 40,
        imgUrl: "expert.png"
    },
    { 
        id: 'r4', 
        name: "Перфекционист", 
        desc: "Выполнить все Обычные достижения", 
        rarity: 'rare', 
        xp: 110, coins: 800, 
        check: (s) => ACHIEVEMENTS.filter(a => a.rarity === 'common').every(a => s.unlockedAchievements.includes(a.id)),
        progress: (s) => ACHIEVEMENTS.filter(a => a.rarity === 'common').filter(a => s.unlockedAchievements.includes(a.id)).length,
        max: 4
    },

    // --- Эпические (Epic) ---
    { 
        id: 'e1', 
        name: "Заядлый анимешник", 
        desc: "Посмотреть 20 аниме", 
        rarity: 'epic', 
        xp: 200, coins: 600, 
        check: (s) => s.episodesWatched >= 20,
        progress: (s) => Math.min(s.episodesWatched, 20),
        max: 20,
        imgUrl: "hardcore.png"
    },
    { 
        id: 'e2', 
        name: "Верный фанат", 
        desc: "Заходить на сайт 30 дней подряд", 
        rarity: 'epic', 
        xp: 500, coins: 1000, 
        check: (s) => s.daysStreak >= 30,
        progress: (s) => Math.min(s.daysStreak, 30),
        max: 30,
        imgUrl: "fan.png"
    },
    { 
        id: 'e3', 
        name: "Модник", 
        desc: "Приобрести любой аксессуар в магазине", 
        rarity: 'epic', 
        xp: 500, coins: 1000, 
        check: (s) => s.hasPurchasedBanner === true,
        progress: (s) => s.hasPurchasedBanner ? 1 : 0,
        max: 1,
        imgUrl: "fashionista.png"
    },
    { 
        id: 'e4', 
        name: "Фанат", 
        desc: "Добавить в избранное 50 аниме", 
        rarity: 'epic', 
        xp: 500, coins: 1000, 
        check: (s) => s.favedAnime.length >= 50,
        progress: (s) => Math.min(s.favedAnime.length, 50),
        max: 50,
        imgUrl: "fan_fav.png"
    }
];

const LEVEL_TITLES = ["Первый эпизод", "Любопытный зритель", "Случайный странник", "Ученик манги", "Читатель субтитров", "Собиратель тайтлов", "Ночной марафонец", "Ценитель опенингов", "Знаток сейю", "Ловец спойлеров", "Страж таймлайна", "Искатель шедевров", "Коллекционер жанров", "Следопыт сезона", "Архивариус эпизодов", "Пилот меха", "Ученик додзё", "Начинающий маг", "Дух сакуры", "Странник измерений", "Хранитель клинка", "Проводник сюжета", "Алхимик эмоций", "Писец рецензий", "Охотник за онгоингами", "Мастер бинджвотча", "Сэнпай сайта", "Хранитель лора", "Ткач теорий", "Лунный самурай", "Небесный курьер", "Хранитель опенингов", "Повелитель плейлистов", "Критик с катаной", "Мудрец субтитров", "Дубляжный маг", "Страж спойлеров", "Картограф арок", "Коллекционер аватарок", "Ловец редких тайтлов", "Хроникёр сезонов", "Мастер клиффхэнгеров", "Дуэлянт мнений", "Хранитель уютного уголка", "Рыцарь романтики", "Тень сёнэна", "Адепт исэкая", "Архимаг тайтлов", "Небесный отаку", "Странник по мирам", "Хранитель легенд", "Мастер сюжетных поворотов", "Голос фандома", "Судья сезона", "Хранитель аниме-реликвий", "Пилот звёздного поезда", "Лунный библиотекарь", "Самурай субботы", "Повелитель финальных титров", "Искатель скрытых жемчужин", "Маг рекомендаций", "Страж уютных вечеров", "Рыцарь онгоинга", "Дух обсуждений", "Хранитель мемов", "Мастер аниме-детектива", "Небесный критик", "Повелитель сезонных марафонов", "Хранитель канона", "Ткач фанфиков", "Оракул спойлеров", "Лунный сэнпай", "Самурай рейтингов", "Архивариус легенд", "Маг жанров", "Страж ночных просмотров", "Повелитель опенингов", "Хранитель тропов", "Рыцарь вечернего просмотра", "Дух фестиваля", "Мастер эмоциональных качелей", "Следопыт забытых тайтлов", "Хранитель аниме-хроник", "Небесный администратор", "Самурай финального эпизода", "Оракул сезонов", "Повелитель легендарных арок", "Хранитель аниме-вселенной", "Маг идеального топа", "Дух великого марафона", "Рыцарь вечного онгоинга", "Архимаг фандома", "Страж золотой коллекции", "Легенда аниме-сайта", "Небесный хранитель тайтлов", "Великий отаку-владыка", "Хранитель последнего эпизода", "Мастер пересмотров", "Дух аниме-сообщества", "Верховный хранитель сезонов"];

function getStats() { 
    let stats = JSON.parse(localStorage.getItem('onika_stats')); 
    if (!stats) { 
        stats = { 
            episodesWatched: 0, 
            minutesWatched: 0, 
            daysStreak: 1, 
            xp: 0, 
            coins: 0, 
            active_banner: null, 
            active_banner_url: '', 
            lastVisit: new Date().toDateString(), 
            unlockedAchievements: [], 
            favedAnime: [], 
            watchedToday: [], 
            cachedAnime: {}, 
            totalMinutesOnSite: 0,
            hasPurchasedBanner: false
        }; 
        localStorage.setItem('onika_stats', JSON.stringify(stats)); 
    } 
    if (!stats.unlockedAchievements) stats.unlockedAchievements = []; 
    if (!stats.favedAnime) stats.favedAnime = []; 
    if (!stats.watchedToday) stats.watchedToday = []; 
    if (stats.coins === undefined) stats.coins = 0; 
    if (!stats.cachedAnime) stats.cachedAnime = {};
    if (stats.totalMinutesOnSite === undefined) stats.totalMinutesOnSite = 0;
    if (stats.hasPurchasedBanner === undefined) stats.hasPurchasedBanner = false;
    return stats; 
}

function saveStats(stats) { localStorage.setItem('onika_stats', JSON.stringify(stats)); }

function checkAchievements(stats) { 
    let changed = false; 
    ACHIEVEMENTS.forEach(ach => { 
        if (!stats.unlockedAchievements.includes(ach.id)) { 
            if (ach.check(stats)) { 
                stats.unlockedAchievements.push(ach.id); 
                stats.coins += ach.coins; 
                stats.xp += ach.xp; 
                changed = true; 
                showToast(`🏆 ${ach.name}! (+${ach.xp} XP, +${ach.coins} 🪙)`); 
            } 
        } 
    }); 
    if (changed) {
        saveStats(stats); 
        syncProfileToDB(); // Синхронизируем достижения в БД
    }
}

function addXP(amount) { 
    let stats = getStats(); 
    const oldLevel = Math.floor(stats.xp / 100) + 1; 
    stats.xp += amount; 
    const newLevel = Math.floor(stats.xp / 100) + 1; 
    
    if (newLevel > oldLevel) { 
        const rewardCoins = Math.floor(100 + Math.pow(newLevel, 2.5) * 2); 
        stats.coins += rewardCoins;
        showLevelUpPopup(newLevel, LEVEL_TITLES[Math.min(newLevel - 1, 99)], rewardCoins); 
        if (tg) tg.HapticFeedback.notificationOccurred('success'); 
    } else { 
        showToast(`+${amount} XP`); 
    }
    saveStats(stats); 
    checkAchievements(stats); 
}

function addXPForTime(minutes) {
    let stats = getStats();
    stats.totalMinutesOnSite = (stats.totalMinutesOnSite || 0) + minutes;
    
    if (stats.totalMinutesOnSite >= 60) {
        const hours = Math.floor(stats.totalMinutesOnSite / 60);
        stats.totalMinutesOnSite = stats.totalMinutesOnSite % 60; 
        saveStats(stats);
        addXP(hours * 2); 
        showToast(`⏱️ Вы провели на сайте ${hours} ч. (+${hours * 2} XP)`);
    } else {
        saveStats(stats);
    }
}

function showLevelUpPopup(level, rank, coins) { 
    const popup = document.getElementById('levelUpPopup'); 
    document.getElementById('popup-level').textContent = level; 
    document.getElementById('popup-rank').textContent = rank; 
    document.getElementById('popup-coins').textContent = coins;
    popup.classList.add('show'); 
    setTimeout(() => popup.classList.remove('show'), 4000); 
}

function setElText(id, text) { const el = document.getElementById(id); if (el) el.textContent = text; }
function setElWidth(id, width) { const el = document.getElementById(id); if (el) el.style.width = width; }

function showToast(msg) { 
    const toast = document.createElement('div'); toast.textContent = msg; 
    toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#5b5bff;color:#fff;padding:10px 20px;border-radius:20px;font-weight:bold;z-index:99999;box-shadow:0 4px 15px rgba(0,0,0,0.5);animation:fade 0.3s ease;text-align:center;'; 
    document.body.appendChild(toast); setTimeout(() => toast.remove(), 2500); 
}

// ОБНОВЛЕННАЯ ФУНКЦИЯ ПЕРЕКЛЮЧЕНИЯ ТАБОВ В ПРОФИЛЕ
function switchProfileTab(tab) { 
    const btnProfile = document.getElementById('tab-btn-profile'); 
    const btnShop = document.getElementById('tab-btn-shop'); 
    const btnSettings = document.getElementById('tab-btn-settings'); 
    
    const contentProfile = document.getElementById('profile-content-tab'); 
    const contentSettings = document.getElementById('settings-content-tab'); 
    
    btnProfile.classList.remove('active');
    btnShop.classList.remove('active');
    btnSettings.classList.remove('active');
    
    if (tab === 'profile') { 
        btnProfile.classList.add('active'); 
        contentProfile.style.display = 'block'; 
        contentSettings.style.display = 'none'; 
    } else if (tab === 'shop') {
        btnShop.classList.add('active');
        switchTab('shop');
        return;
    } else { 
        btnSettings.classList.add('active'); 
        contentProfile.style.display = 'none'; 
        contentSettings.style.display = 'block'; 
    } 
}

function openLevelModal() { document.getElementById('levelModal').classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }

// ФУНКЦИЯ ДЛЯ ПЕРЕХОДА НА СТРАНИЦУ ДОСТИЖЕНИЙ
function openAchievementsPage() {
    switchTab('achievements');
}

// ФУНКЦИЯ ДЛЯ РЕНДЕРА СТРАНИЦЫ ДОСТИЖЕНИЙ
function renderAchievementsPage() { 
    const stats = getStats(); 
    const container = document.getElementById('achievements-list-container'); 
    let html = ''; 
    
    setElText('page-ach-earned', stats.unlockedAchievements.length);
    setElText('page-ach-total', ACHIEVEMENTS.length);

    const rarities = [
        { key: 'common', name: 'Обычные', color: '#ccc', class: 'common' },
        { key: 'rare', name: 'Редкие', color: '#00d2ff', class: 'rare' },
        { key: 'epic', name: 'Эпические', color: '#b44aff', class: 'epic' },
        { key: 'legendary', name: 'Легендарные', color: '#ffd700', class: 'legendary' }
    ];

    rarities.forEach(rarity => {
        const list = ACHIEVEMENTS.filter(a => a.rarity === rarity.key);
        if (list.length === 0) return;
        const completedCount = list.filter(a => stats.unlockedAchievements.includes(a.id)).length;

        html += `
            <div class="ach-category-header ${rarity.class}">
                <span style="color: ${rarity.color};">●</span> 
                ${rarity.name}
                <span class="count">${completedCount} / ${list.length}</span>
            </div>
        `;

        list.forEach(ach => { 
            const isDone = stats.unlockedAchievements.includes(ach.id); 
            const rarityStyle = RARITY_STYLES[ach.rarity];
            const progressCurrent = ach.progress(stats);
            const progressPercent = (progressCurrent / ach.max) * 100;
            
            const iconHtml = ach.imgUrl 
                ? `<img src="${ach.imgUrl}" alt="${ach.name}">` 
                : `<svg width="100%" height="100%"><use href="#${rarityStyle.icon}"></use></svg>`;

            html += `
                <div class="ach-list-item ${rarityStyle.class} ${isDone ? 'completed' : ''}">
                    <div class="ach-list-icon" style="color: ${rarityStyle.color}">
                        ${iconHtml}
                    </div>
                    <div class="ach-list-info">
                        <h4>${ach.name}</h4>
                        <p>${ach.desc}</p>
                        ${!isDone ? `
                            <div class="ach-progress-mini">
                                <div style="width: ${progressPercent}%; background: ${rarityStyle.color}"></div>
                            </div>
                            <div style="font-size: 10px; color: #888; margin-top: 2px;">${progressCurrent} / ${ach.max}</div>
                        ` : ''}
                    </div>
                    <div class="ach-reward-badge">
                        +${ach.xp} XP, +${ach.coins} <svg style="width:12px;height:12px;fill:none;stroke:currentColor;stroke-width:2;"><use href="#oa-coin"></use></svg>
                    </div>
                    ${isDone ? '<div class="ach-status-icon" style="color: #ffd700;"><svg style="width:20px;height:20px;"><use href="#oa-check"></use></svg></div>' : ''}
                </div>
            `; 
        });
    });
    
    container.innerHTML = html; 
}

// ==========================================
// 12. ГЛАВНАЯ СТРАНИЦА
// ==========================================
let heroData = []; let currentSlide = 0; let slideInterval;

async function loadHomePage() {
    try {
        const [heroItems, popularItems, recItems] = await Promise.all([API.getRandom(5), API.getCatalog(1, 6, { sort: 'popularity' }), API.getCatalog(2, 4, { sort: 'popularity' })]);
        heroData = heroItems.map(a => ({ id: a.id, title: a.title, img: a.images.jpg.image_url, score: a.score ? Number(a.score).toFixed(1) : '?', type: a.kind || 'TV', year: a.year }));
        initHeroSlider();

        const popularContainer = document.getElementById('popular-list');
        if (popularContainer && popularItems.length > 0) {
            popularContainer.innerHTML = popularItems.map(anime => `<div class="card" onclick="openAnimeDetail('${anime.id}', 'home')"><img class="card-img" src="${safeUrl(anime.images.jpg.image_url)}" loading="lazy"><div class="card-title">${escapeHTML(anime.title)}</div></div>`).join('');
        }
        const recContainer = document.getElementById('recommended-list');
        if (recContainer && recItems.length > 0) {
            recContainer.innerHTML = recItems.map(anime => `<div class="card" onclick="openAnimeDetail('${anime.id}', 'home')"><img class="card-img" src="${safeUrl(anime.images.jpg.image_url)}" loading="lazy"><div class="card-title">${escapeHTML(anime.title)}</div></div>`).join('');
        }
    } catch (e) { console.error(e); }
}

function initHeroSlider() { 
    const slider = document.getElementById('heroSlider'); const dotsContainer = document.getElementById('heroDots'); 
    if (!slider || heroData.length === 0) return; let sliderHTML = '', dotsHTML = ''; 
    const stats = getStats(); const favedList = (stats.favedAnime || []).map(a => a.id); 
    heroData.forEach((anime, index) => { 
        const isFaved = favedList.includes(anime.id); const heartClass = isFaved ? 'faved' : ''; const heartIcon = isFaved ? '<svg style="width:24px;height:24px;fill:currentColor;stroke:none;"><use href="#oa-favorite"></use></svg>' : '<svg><use href="#oa-favorite"></use></svg>'; 
        sliderHTML += `<div class="hero-slide ${index === 0 ? 'active' : ''}"><div class="hero-bg" style="background-image: url('${safeUrl(anime.img)}')"></div><div class="hero-gradient"></div><div class="hero-content"><div class="hero-badges"><span class="badge star">⭐ ${anime.score}</span><span class="badge">${escapeHTML(anime.type)}</span><span class="badge">${escapeHTML(anime.year)}</span></div><h1 class="hero-title">${escapeHTML(anime.title)}</h1><div class="hero-actions"><button class="btn-primary" onclick="openAnimeDetail('${anime.id}', 'home')">▶ Смотреть</button><button class="btn-icon-heart ${heartClass}" onclick="openStatusModal('${anime.id}')">${heartIcon}</button></div></div></div>`; 
        dotsHTML += `<div class="hero-dot ${index === 0 ? 'active' : ''}" onclick="goToSlide(${index})"></div>`; 
    }); 
    slider.innerHTML = sliderHTML; dotsContainer.innerHTML = dotsHTML; startSlideShow(); addSwipeSupport(slider); 
}
function goToSlide(index) { 
    const slides = document.querySelectorAll('.hero-slide'); const dots = document.querySelectorAll('.hero-dot'); 
    slides.forEach(s => s.classList.remove('active')); dots.forEach(d => d.classList.remove('active')); 
    slides[index].classList.add('active'); dots[index].classList.add('active'); currentSlide = index; 
}
function nextSlide() { currentSlide = (currentSlide + 1) % heroData.length; goToSlide(currentSlide); }
function startSlideShow() { clearInterval(slideInterval); slideInterval = setInterval(nextSlide, 5000); }
function stopSlideShow() { clearInterval(slideInterval); }
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
// 13. ТАЙМЕР ВРЕМЕНИ НА САЙТЕ
// ==========================================
// Каждую минуту проверяем, что пользователь на сайте
setInterval(() => {
    if (document.visibilityState === 'visible') {
        addXPForTime(1); // Добавляем 1 минуту
    }
}, 60000);

document.addEventListener('DOMContentLoaded', () => { 
    loadHomePage(); loadProfileData(); 
});
