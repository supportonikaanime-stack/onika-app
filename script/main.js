// ============================================
// ОСНОВНОЙ ФАЙЛ ONIKAANIME (TELEGRAM MINI APP)
// ============================================

const allData = {};
let currentAnimeId = null;
let currentPage = 'home';
let previousPage = null;
let page = 1;
let genre = '';
let query = '';
let totalCount = 0;
let allItems = [];
let onlineTimer = null;
let startTime = Date.now();
let isLoading = false;
let isAllLoaded = false;
let searchTimeout = null;

// Coverflow
let coverflowItems = [];
let coverflowIndex = 0;
let _isLoadingRecommendations = false;
let _coverflowAutoTimer = null;
let _coverflowPauseUntil = 0;
const COVERFLOW_LIMIT = 10;
const COVERFLOW_AUTOPLAY_MS = 5000;

const CATALOG_LIMIT = 12;

// ===== ДОСТИЖЕНИЯ =====
const RARITY_ORDER = { legendary: 4, epic: 3, rare: 2, common: 1 };
const RARITY_LABELS = {
    common: '⚪ Обычное', rare: '🔵 Редкое', epic: '🟣 Эпическое', legendary: '🟡 Легендарное'
};

const ACHIEVEMENTS_LIST = [
    { id: 'ep100', name: '🎬 Зритель 1 уровня', desc: 'Посмотреть 100 серий', icon: '🎬', title: 'Зритель', rarity: 'common', target: 100, metric: 'episodes' },
    { id: 'cm100', name: '💬 Комментатор 1 уровня', desc: 'Оставить 100 комментариев', icon: '💬', title: 'Говорун', rarity: 'common', target: 100, metric: 'comments' },
    { id: 'fv100', name: '❤️ Коллекционер 1 уровня', desc: 'Добавить 100 аниме', icon: '❤️', title: 'Коллекционер', rarity: 'common', target: 100, metric: 'favorites' },
    { id: 'ep1000', name: '🏆 Зритель 5 уровня', desc: 'Посмотреть 1000 серий', icon: '🏆', title: 'Легенда', rarity: 'legendary', target: 1000, metric: 'episodes' }
];

function getGenreColor(genre) {
    const colorMap = {
        'Экшен': '#ff2d78', 'Приключения': '#f39c12', 'Комедия': '#f1c40f',
        'Драма': '#8e44ad', 'Фэнтези': '#3498db', 'Романтика': '#e84393',
        'Фантастика': '#00b894', 'Повседневность': '#636e72', 'Триллер': '#c0392b',
        'Ужасы': '#6c5ce7', 'Спорт': '#e67e22', 'Музыка': '#00cec9'
    };
    return colorMap[genre] || '#6c5ce7';
}

// ============================================
// НАВИГАЦИЯ
// ============================================
function navigate(pageName) {
    currentPage = pageName;
    document.body.setAttribute('data-page', pageName);

    const pages = ['home', 'detail', 'favorites', 'achievements', 'mycomments', 'profile', 'settings'];

    pages.forEach(p => {
        const el = document.getElementById(`page-${p}`);
        if (el) el.style.display = p === pageName ? 'block' : 'none';
    });

    if (pageName === 'home') {
        loadHeroAnime();
        loadRails();
        loadCatalog();
        resetCatalogFiltersSilent();
    }
    if (pageName === 'favorites') renderFavorites();
    if (pageName === 'profile') renderProfile();
    if (pageName === 'achievements') renderAchievements();
    if (pageName === 'mycomments') renderMyComments();

    window.scrollTo(0, 0);
}

function goBack() {
    if (previousPage) {
        navigate(previousPage);
        previousPage = null;
    } else {
        navigate('home');
    }
}

// ============================================
// UI
// ============================================
function updateUI() {
    const user = DB.get('currentUser');
    // В новом дизайне мы используем нижнее меню, поэтому обновляем только бейджи в профиле
    if (user) {
        const favs = DB.getUserData(user.name, 'favorites', []);
        const favCount = favs.length;
        // Можно добавить обновление бейджей на иконках меню, если нужно
    }
}

// ============================================
// ОТСЛЕЖИВАНИЕ ВРЕМЕНИ
// ============================================
function startOnlineTracking() {
    const user = DB.get('currentUser');
    if (!user) return;
    startTime = Date.now();
    if (onlineTimer) clearInterval(onlineTimer);
    onlineTimer = setInterval(function() {
        const userNow = DB.get('currentUser');
        if (!userNow) { clearInterval(onlineTimer); return; }
        const totalTime = DB.getUserData(userNow.name, 'onlineTime', 0);
        DB.setUserData(userNow.name, 'onlineTime', totalTime + 30);
        DB.setUserData(userNow.name, 'lastSeen', Date.now());
        DB.save();
    }, 30000);
}

function stopOnlineTracking() {
    if (onlineTimer) { clearInterval(onlineTimer); onlineTimer = null; }
}

// ============================================
// HERO BANNER (ГЛАВНАЯ)
// ============================================
async function loadHeroAnime() {
    const banner = document.getElementById('heroBanner');
    if (!banner) return;

    try {
        const items = await API.getRandom(1);
        if (!items || !items.length) return;
        renderHero(items[0]);
    } catch (e) {
        console.warn('⚠️ Hero не загрузился:', e);
    }
}

function renderHero(anime) {
    if (!anime) return;

    const title = anime.title || 'Без названия';
    const poster = anime.images?.jpg?.image_url || '';
    const year = anime.year || '';
    const episodes = anime.episodes || '?';
    const score = parseFloat(anime.score) || 0;
    const status = anime.status || '';
    const age = anime.age_rating || '0+';
    const desc = (anime.synopsis || anime.description || '').slice(0, 260);
    const id = anime.id || anime.rawId;

    const titleEl = document.getElementById('heroTitle');
    const metaEl = document.getElementById('heroMeta');
    const descEl = document.getElementById('heroDesc');
    const backdrop = document.getElementById('heroBackdrop');
    const watchBtn = document.getElementById('heroWatchBtn');
    const moreBtn = document.getElementById('heroMoreBtn');

    if (titleEl) titleEl.textContent = title;

    if (metaEl) {
        let html = '';
        if (score > 0) html += `<span class="meta-badge star">⭐ ${score.toFixed(1)}</span>`;
        if (year && year !== '--') html += `<span class="meta-badge">📅 ${year}</span>`;
        if (episodes && episodes !== '?') html += `<span class="meta-badge">📺 ${episodes} эп.</span>`;
        if (status) html += `<span class="meta-badge">${status}</span>`;
        if (age) html += `<span class="meta-badge">${age}</span>`;
        metaEl.innerHTML = html;
    }

    if (descEl) descEl.textContent = desc;

    if (backdrop && poster) {
        backdrop.style.backgroundImage = `url('${poster}')`;
    }

    if (watchBtn) {
        watchBtn.onclick = function() { openDetail(id); };
    }
    if (moreBtn) {
        moreBtn.onclick = function() { openDetail(id); };
    }
}

// ============================================
// ЛЕНТЫ (ТРЕНДЫ)
// ============================================
function renderRailSkeleton(containerId, count = 3) {
    const track = document.getElementById(containerId);
    if (!track) return;
    let html = '';
    for (let i = 0; i < count; i++) {
        html += `<div class="skeleton-card" style="width:130px; flex:0 0 130px;"><div class="skeleton-poster"></div></div>`;
    }
    track.innerHTML = html;
}

function renderRail(containerId, items) {
    const track = document.getElementById(containerId);
    if (!track) return;

    if (!items || !items.length) {
        track.innerHTML = `<div style="padding:20px;color:#888;">Не удалось загрузить</div>`;
        return;
    }

    let html = '';
    items.forEach((a, i) => {
        const img = a.images?.jpg?.image_url || '';
        const title = a.title || 'Без названия';
        const id = a.mal_id || a.id;

        const posterHtml = img
            ? `<img src="${img}" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none';this.parentElement.innerHTML='🎬'">`
            : '🎬';

        html += `
            <div class="rail-card" onclick="openDetail('${id}')">
                ${posterHtml}
                <div class="rail-card-body">
                    <div class="rail-card-title">${title}</div>
                </div>
            </div>
        `;
    });
    track.innerHTML = html;
}

async function loadRails() {
    renderRailSkeleton('trendingTrack', 4);

    const [trending] = await Promise.allSettled([
        API.getCatalog(1, 10, 'popularity')
    ]);

    if (trending.status === 'fulfilled' && trending.value?.items) {
        renderRail('trendingTrack', trending.value.items);
        trending.value.items.forEach(item => { allData[item.mal_id] = item; });
    }
}

// ============================================
// КАТАЛОГ
// ============================================
async function loadCatalog(targetPage = null) {
    if (isLoading) return;
    isLoading = true;
    if (targetPage !== null) page = targetPage;

    const grid = document.getElementById('grid');
    if (!grid) { isLoading = false; return; }

    const searchInput = document.getElementById('catalogSearchInput');
    const searchValue = searchInput ? searchInput.value.trim() : '';

    if (!allItems.length) grid.innerHTML = `<div class="skeleton-card"><div class="skeleton-poster"></div></div><div class="skeleton-card"><div class="skeleton-poster"></div></div>`;

    try {
        let result;
        if (searchValue && searchValue.length > 0) {
            result = await API.searchAnime(searchValue, page, CATALOG_LIMIT);
        } else if (genre === 'latest') {
            result = await API.getLatest(page, CATALOG_LIMIT);
        } else if (genre) {
            result = await API.getByGenre(genre, page, CATALOG_LIMIT);
        } else {
            result = await API.getCatalog(page, CATALOG_LIMIT, 'popularity');
        }

        if (result && result.items && result.items.length > 0) {
            allItems = result.items;
            totalCount = result.totalCount || 0;
            allItems.forEach(item => { allData[item.mal_id] = item; });

            renderCatalog(allItems);
        } else {
            grid.innerHTML = `<div style="text-align:center;padding:40px 20px;color:#888;grid-column:1/-1;"><p>Ничего не найдено</p></div>`;
            allItems = [];
        }
    } catch (error) {
        console.error('❌ Ошибка загрузки:', error);
        if (!allItems.length) {
            grid.innerHTML = `<div style="text-align:center;padding:40px;color:#ff4444;grid-column:1/-1;">⚠️ Ошибка загрузки</div>`;
        }
    } finally { isLoading = false; }
}

function renderCatalog(list) {
    const grid = document.getElementById('grid');
    if (!grid) return;

    if (!list || list.length === 0) {
        grid.innerHTML = `<div style="text-align:center;padding:60px 20px;color:#888;grid-column:1/-1;"><div style="font-size:48px;">🔍</div><p>Ничего не найдено</p></div>`;
        return;
    }

    let html = '';
    for (let index = 0; index < list.length; index++) {
        const a = list[index];
        const img = a.images?.jpg?.image_url || '';
        const title = a.title || 'Без названия';
        const episodes = a.episodes || '?';
        const year = a.year || '';
        const id = a.mal_id || a.id;
        const age = a.age_rating || '0+';

        const imgHtml = img
            ? `<img src="${img}" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none';this.parentElement.innerHTML='🎬';">`
            : '🎬';

        html += `
            <div class="card" onclick="openDetail('${id}')">
                <div class="card-img">${imgHtml}</div>
                ${year && year !== '--' ? `<span class="card-year">${year}</span>` : ''}
                <span class="card-age">${age}</span>
                <div class="card-body">
                    <div class="title">${title}</div>
                    <div class="info">${episodes} эп.</div>
                </div>
            </div>
        `;
    }
    grid.innerHTML = html;
}

function applyCatalogFilters() {
    if (searchTimeout) { clearTimeout(searchTimeout); searchTimeout = null; }
    searchTimeout = setTimeout(() => {
        allItems = [];
        page = 1;
        loadCatalog(1);
    }, 500);
}

function resetCatalogFiltersSilent() {
    const searchInput = document.getElementById('catalogSearchInput');
    if (searchInput) searchInput.value = '';
    if (genre && genre !== 'latest') genre = '';
    allItems = [];
    page = 1;
}

// ============================================
// ДЕТАЛИ АНИМЕ
// ============================================
async function openDetail(id) {
    if (!id) { showToast('Ошибка ID', 'error'); return; }

    previousPage = currentPage;
    navigate('detail');

    const titleEl = document.getElementById('detailTitle');
    if (titleEl) titleEl.textContent = 'Загрузка...';

    try {
        const data = await API.getAnimeDetails(id);
        if (!data) {
            showToast('❌ Аниме не найдено', 'error');
            if (titleEl) titleEl.textContent = 'Ошибка загрузки';
            return;
        }
        allData[id] = data;
        showDetail(data);
    } catch (e) {
        console.error('❌ Ошибка:', e);
        if (allData[id]) showDetail(allData[id]);
        else if (titleEl) titleEl.textContent = 'Ошибка загрузки';
    }
}

function showDetail(anime) {
    if (!anime) return;

    currentAnimeId = anime.id || anime.rawId || null;
    const displayTitle = anime.title || anime.title_russian || 'Без названия';

    const titleEl = document.getElementById('detailTitle');
    const metaEl = document.getElementById('detailMeta');
    const descEl = document.getElementById('detailDesc');
    const posterEl = document.getElementById('detailPoster');

    if (titleEl) titleEl.textContent = displayTitle;

    const year = anime.year || '--';
    const episodes = anime.episodes || '?';
    const score = parseFloat(anime.score) || 0;

    if (metaEl) {
        let metaHtml = '';
        if (score > 0) metaHtml += `<span style="background:rgba(255,255,255,0.1); padding:2px 8px; border-radius:4px;">⭐ ${score.toFixed(1)}</span>`;
        if (year && year !== '--') metaHtml += `<span style="background:rgba(255,255,255,0.1); padding:2px 8px; border-radius:4px;">📅 ${year}</span>`;
        if (episodes && episodes !== '?') metaHtml += `<span style="background:rgba(255,255,255,0.1); padding:2px 8px; border-radius:4px;">📺 ${episodes} эп.</span>`;
        metaEl.innerHTML = metaHtml;
    }

    if (descEl) descEl.textContent = anime.synopsis || anime.description || 'Описание отсутствует';

    const img = anime.images?.jpg?.image_url || '';
    if (posterEl) {
        if (img) posterEl.src = img;
        else posterEl.style.display = 'none';
    }
}

// ============================================
// ПЛЕЕР (ВНЕШНИЙ)
// ============================================
function watchOnVeoveo() {
    const anime = allData[currentAnimeId];
    if (!anime) return;
    
    let shikimoriId = anime.rawId || String(anime.id).replace('shikimori_', '');
    const url = `https://veoveo.ru/embed/${shikimoriId}?episode=1`;
    
    // В Telegram Mini App лучше открывать ссылки через API
    if (window.Telegram && window.Telegram.WebApp) {
        window.Telegram.WebApp.openLink(url);
    } else {
        window.open(url, '_blank');
    }
}

// ============================================
// ИЗБРАННОЕ
// ============================================
function toggleFav(name) {
    const user = DB.get('currentUser');
    if (!user) { showToast('Войдите в аккаунт!', 'error'); return; }

    const favs = DB.getUserData(user.name, 'favorites', []);
    const idx = favs.indexOf(name);
    let added = false;
    if (idx > -1) {
        favs.splice(idx, 1);
    } else {
        favs.push(name);
        added = true;
    }
    DB.setUserData(user.name, 'favorites', favs);

    if (added) showToast('Добавлено в избранное ❤️', 'success');
    else showToast('Удалено из избранного', 'info');

    requestAnimationFrame(() => {
        updateUI();
        if (currentPage === 'favorites') renderFavorites();
    });
}

function renderFavorites() {
    const user = DB.get('currentUser');
    const container = document.getElementById('page-favorites');
    if (!container) return;

    if (!user) {
        container.innerHTML = `<div style="padding:40px;text-align:center;"><h3>Войдите в аккаунт</h3></div>`;
        return;
    }

    const favs = DB.getUserData(user.name, 'favorites', []);
    if (favs.length === 0) {
        container.innerHTML = `<div style="padding:40px;text-align:center;"><h3>Пока пусто</h3></div>`;
        return;
    }

    let html = '<div style="padding:20px;"><h1>Избранное</h1><div class="catalog-grid">';
    favs.forEach(name => {
        const item = findAnimeByName(name);
        const img = item?.images?.jpg?.image_url || '';
        const id = item ? (item.mal_id || item.id) : '';
        
        html += `
            <div class="card" onclick="openDetail('${id}')">
                <div class="card-img">${img ? `<img src="${img}">` : '🎬'}</div>
                <div class="card-body">
                    <div class="title">${name}</div>
                </div>
            </div>
        `;
    });
    html += '</div></div>';
    container.innerHTML = html;
}

function findAnimeByName(name) {
    for (const id in allData) {
        const item = allData[id];
        if (item && item.title === name) return item;
    }
    return null;
}

// ============================================
// ПРОФИЛЬ
// ============================================
function renderProfile() {
    const user = DB.get('currentUser');
    if (!user) { navigate('home'); return; }

    const profiles = DB.get('profiles', {});
    const profile = profiles[user.name] || { bio: '', avatar: '' };
    const favs = DB.getUserData(user.name, 'favorites', []);
    const earned = DB.getAchievements(user.name);

    const nameEl = document.getElementById('profileName');
    const emailEl = document.getElementById('profileEmail');
    const levelEl = document.getElementById('profileLevelBadge');
    
    if (nameEl) nameEl.textContent = user.name;
    if (emailEl) emailEl.textContent = user.email;
    
    const xp = calculateXP(user.name);
    const level = Math.floor(xp / 100);
    if (levelEl) levelEl.textContent = 'Lv.' + level;

    const img = document.getElementById('avatarImg');
    const letter = document.getElementById('avatarLetter');
    
    if (profile.avatar && profile.avatar.length > 100) {
        if (img) { img.src = profile.avatar; img.style.display = 'block'; }
        if (letter) letter.style.display = 'none';
    } else {
        if (img) img.style.display = 'none';
        if (letter) { letter.style.display = 'flex'; letter.textContent = user.name[0].toUpperCase(); }
    }
}

function calculateXP(user) {
    const favs = DB.getUserData(user, 'favorites', []);
    const achievements = DB.getAchievements(user);
    const onlineTime = DB.getUserData(user, 'onlineTime', 0);
    return favs.length * 10 + achievements.length * 20 + Math.floor(onlineTime / 60);
}

// ============================================
// ДОСТИЖЕНИЯ (УПРОЩЕННО)
// ============================================
function renderAchievements() {
    const user = DB.get('currentUser');
    const container = document.getElementById('page-achievements');
    if (!container) return;

    if (!user) { container.innerHTML = `<div style="padding:40px;text-align:center;">Войдите в аккаунт</div>`; return; }

    const earned = DB.getAchievements(user.name);
    
    let html = '<div style="padding:20px;"><h1>Достижения</h1><div style="display:grid; grid-template-columns:1fr; gap:10px;">';
    ACHIEVEMENTS_LIST.forEach(ach => {
        const isEarned = earned.includes(ach.id);
        html += `
            <div style="background:#1a1a20; padding:15px; border-radius:12px; opacity:${isEarned ? 1 : 0.5};">
                <div style="font-size:24px;">${ach.icon}</div>
                <div style="font-weight:bold; margin-top:5px;">${ach.name}</div>
                <div style="color:#888; font-size:12px;">${ach.desc}</div>
            </div>
        `;
    });
    html += '</div></div>';
    container.innerHTML = html;
}

// ============================================
// МОИ КОММЕНТАРИИ (УПРОЩЕННО)
// ============================================
function renderMyComments() {
    const container = document.getElementById('page-mycomments');
    if (container) {
        container.innerHTML = `<div style="padding:20px;"><h1>Мои комментарии</h1><p>Раздел в разработке.</p></div>`;
    }
}

// ============================================
// TOAST
// ============================================
function showToast(message, type) {
    const old = document.querySelector('.toast-message');
    if (old) old.remove();
    const colors = { success: '#2ecc71', error: '#e74c3c', warning: '#f39c12', info: 'rgba(20,20,50,0.95)' };
    
    const toast = document.createElement('div');
    toast.className = 'toast-message';
    toast.textContent = message;
    toast.style.cssText = `position: fixed; bottom: 90px; left: 50%; transform: translateX(-50%); background: ${colors[type] || colors.info}; color: #fff; padding: 12px 24px; border-radius: 12px; font-weight: 600; z-index: 99999; max-width: 90%; text-align: center; font-size: 14px; box-shadow: 0 4px 15px rgba(0,0,0,0.5);`;
    
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => { if (toast.parentNode) toast.remove(); }, 300);
    }, 2500);
}

// ============================================
// ЗАПУСК
// ============================================
document.addEventListener('DOMContentLoaded', function() {
    console.log('🌟 OnikaAnime загружается...');
    if (typeof restoreAllData === 'function') restoreAllData();
    updateUI();
    navigate('home');

    const user = DB.get('currentUser');
    if (user) startOnlineTracking();
    console.log('✅ OnikaAnime готов!');
});

// Экспорт функций
window.openDetail = openDetail;
window.navigate = navigate;
window.goBack = goBack;
window.toggleFav = toggleFav;
window.applyCatalogFilters = applyCatalogFilters;
window.watchOnVeoveo = watchOnVeoveo;
window.showToast = showToast;
