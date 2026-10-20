// ============================================
// ГЛАВНЫЙ ФАЙЛ ONIKAANIME (АДАПТАЦИЯ ПОД TELEGRAM)
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

const CATALOG_LIMIT = 12;

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

    document.querySelectorAll('.sidebar-nav a').forEach(a => {
        a.classList.toggle('active', a.dataset.page === pageName);
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

    closeMenu();
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

function toggleMenu() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (sidebar && overlay) {
        sidebar.classList.toggle('open');
        overlay.classList.toggle('open');
    }
}

function closeMenu() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (sidebar) sidebar.classList.remove('open');
    if (overlay) overlay.classList.remove('open');
}

// ============================================
// UI
// ============================================
function updateUI() {
    const user = DB.get('currentUser');
    const nav = document.getElementById('sidebarNav');
    const footer = document.getElementById('sidebarFooter');
    if (!nav || !footer) return;

    if (user) {
        const favs = DB.getUserData(user.name, 'favorites', []);
        nav.innerHTML = `
            <a data-page="home" onclick="navigate('home')"><span class="icon">🏠</span><span>Главная</span></a>
            <a data-page="favorites" onclick="navigate('favorites')"><span class="icon">❤️</span><span>Избранное</span>${favs.length > 0 ? `<span class="sidebar-badge">${favs.length}</span>` : ''}</a>
            <a data-page="profile" onclick="navigate('profile')"><span class="icon">👤</span><span>Профиль</span></a>
        `;
        footer.innerHTML = `<button class="sidebar-login-btn" onclick="logout()">🚪 Выйти</button>`;
    } else {
        nav.innerHTML = `<a class="active" data-page="home" onclick="navigate('home')"><span class="icon">🏠</span><span>Главная</span></a>`;
        footer.innerHTML = `<button class="sidebar-login-btn" onclick="showLoginModal(); closeMenu();">🚀 Войти в аккаунт</button>`;
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
        DB.save();
    }, 30000);
}

// ============================================
// HERO BANNER
// ============================================
async function loadHeroAnime() {
    try {
        const items = await API.getRandom(1);
        if (items && items.length > 0) {
            renderHero(items[0]);
        }
    } catch (e) {
        console.warn('Ошибка загрузки Hero:', e);
        // Если API падает, показываем первый из трендов
        const trending = await API.getCatalog(1, 1, 'popularity');
        if (trending && trending.items && trending.items.length > 0) {
            renderHero(trending.items[0]);
        }
    }
}

function renderHero(anime) {
    if (!anime) return;
    const titleEl = document.getElementById('heroTitle');
    const metaEl = document.getElementById('heroMeta');
    const descEl = document.getElementById('heroDesc');
    const backdrop = document.getElementById('heroBackdrop');
    const watchBtn = document.getElementById('heroWatchBtn');

    if (titleEl) titleEl.textContent = anime.title || 'Без названия';
    if (descEl) descEl.textContent = (anime.synopsis || '').slice(0, 200) + '...';
    
    if (metaEl) {
        let html = '';
        if (anime.score > 0) html += `<span class="hero-meta-item score">⭐ ${anime.score.toFixed(1)}</span>`;
        if (anime.year) html += `<span class="hero-meta-item">📅 ${anime.year}</span>`;
        if (anime.episodes) html += `<span class="hero-meta-item">📺 ${anime.episodes} эп.</span>`;
        metaEl.innerHTML = html;
    }

    const img = anime.images?.jpg?.image_url;
    if (img && backdrop) backdrop.style.backgroundImage = `url('${img}')`;
    
    if (watchBtn) {
        watchBtn.onclick = () => openDetail(anime.mal_id || anime.id);
    }
}

// ============================================
// ЛЕНТЫ (Тренды, Новинки)
// ============================================
async function loadRails() {
    try {
        const trending = await API.getCatalog(1, 10, 'popularity');
        if (trending && trending.items) {
            renderRail('trendingTrack', trending.items);
            trending.items.forEach(item => { allData[item.mal_id] = item; });
        }

        const latest = await API.getLatest(1, 10);
        if (latest && latest.items) {
            renderRail('newTrack', latest.items);
            latest.items.forEach(item => { allData[item.mal_id] = item; });
        }
    } catch (e) {
        console.error('Ошибка загрузки лент:', e);
    }
}

function renderRail(containerId, items) {
    const track = document.getElementById(containerId);
    if (!track) return;
    
    let html = '';
    items.forEach(item => {
        const img = item.images?.jpg?.image_url || '';
        const id = item.mal_id || item.id;
        html += `
            <div class="rail-card" onclick="openDetail('${id}')">
                <img src="${img}" loading="lazy" referrerpolicy="no-referrer">
                <div class="rail-card-title">${item.title}</div>
            </div>
        `;
    });
    track.innerHTML = html;
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

    const searchValue = document.getElementById('catalogSearchInput')?.value.trim() || '';
    if (!allItems.length) grid.innerHTML = `<div class="skeleton-card"><div class="skeleton-poster"></div></div><div class="skeleton-card"><div class="skeleton-poster"></div></div>`;

    try {
        let result;
        if (searchValue) result = await API.searchAnime(searchValue, page, CATALOG_LIMIT);
        else if (genre === 'latest') result = await API.getLatest(page, CATALOG_LIMIT);
        else if (genre) result = await API.getByGenre(genre, page, CATALOG_LIMIT);
        else result = await API.getCatalog(page, CATALOG_LIMIT, 'popularity');

        if (result && result.items && result.items.length > 0) {
            allItems = result.items;
            allItems.forEach(item => { allData[item.mal_id] = item; });
            renderCatalog(allItems);
        } else {
            grid.innerHTML = `<div style="text-align:center;padding:40px;color:#888;grid-column:1/-1;">Ничего не найдено</div>`;
        }
    } catch (error) {
        console.error('Ошибка каталога:', error);
        grid.innerHTML = `<div style="text-align:center;padding:40px;color:#ff4444;grid-column:1/-1;">Ошибка загрузки</div>`;
    } finally {
        isLoading = false;
    }
}

function renderCatalog(list) {
    const grid = document.getElementById('grid');
    if (!grid) return;
    
    let html = '';
    list.forEach(a => {
        const img = a.images?.jpg?.image_url || '';
        const id = a.mal_id || a.id;
        html += `
            <div class="card" onclick="openDetail('${id}')">
                <img src="${img}" loading="lazy" referrerpolicy="no-referrer">
                <span class="card-year">${a.year || '--'}</span>
                <span class="card-age">${a.age_rating || '0+'}</span>
                <div class="card-body">
                    <div class="title">${a.title}</div>
                    <div class="info">${a.episodes || '?'} эп.</div>
                </div>
            </div>
        `;
    });
    grid.innerHTML = html;
}

function applyCatalogFilters() {
    if (searchTimeout) clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        allItems = [];
        page = 1;
        loadCatalog(1);
    }, 500);
}

function clearCatalogSearch() {
    document.getElementById('catalogSearchInput').value = '';
    applyCatalogFilters();
}

function resetCatalogFiltersSilent() {
    const searchInput = document.getElementById('catalogSearchInput');
    if (searchInput) searchInput.value = '';
    allItems = [];
    page = 1;
}

// ============================================
// ДЕТАЛИ АНИМЕ
// ============================================
async function openDetail(id) {
    if (!id) return;
    previousPage = currentPage;
    navigate('detail');
    
    const titleEl = document.getElementById('detailTitle');
    if (titleEl) titleEl.textContent = 'Загрузка...';

    try {
        const data = await API.getAnimeDetails(id);
        if (data) {
            allData[id] = data;
            showDetail(data);
        } else {
            titleEl.textContent = 'Ошибка загрузки';
        }
    } catch (e) {
        console.error(e);
        titleEl.textContent = 'Ошибка загрузки';
    }
}

function showDetail(anime) {
    document.getElementById('detailTitle').textContent = anime.title;
    document.getElementById('detailDesc').textContent = anime.synopsis || 'Описание отсутствует';
    
    const metaEl = document.getElementById('detailMeta');
    metaEl.innerHTML = `
        ${anime.score > 0 ? `<span class="hero-meta-item score">⭐ ${anime.score.toFixed(1)}</span>` : ''}
        <span class="hero-meta-item">📅 ${anime.year || '--'}</span>
        <span class="hero-meta-item">📺 ${anime.episodes || '?'} эп.</span>
    `;

    const img = anime.images?.jpg?.image_url;
    if (img) {
        document.getElementById('detailPoster').src = img;
        document.getElementById('detailHeroBg').style.backgroundImage = `url('${img}')`;
    }
    currentAnimeId = anime.mal_id || anime.id;
}

function toggleDescription() {
    document.getElementById('detailDesc').classList.toggle('expanded');
}

// ============================================
// ПЛЕЕР
// ============================================
function watchOnVeoveo() {
    const anime = allData[currentAnimeId];
    if (!anime) return;
    
    let shikimoriId = anime.rawId || String(anime.id).replace('shikimori_', '');
    const url = `https://veoveo.ru/embed/${shikimoriId}?episode=1`;
    
    if (window.Telegram && window.Telegram.WebApp) {
        window.Telegram.WebApp.openLink(url); // Открываем во встроенном браузере ТГ
    } else {
        window.open(url, '_blank');
    }
}

// ============================================
// ИЗБРАННОЕ
// ============================================
function toggleFav() {
    const user = DB.get('currentUser');
    if (!user) { showToast('Войдите в аккаунт!', 'error'); return; }
    
    const title = document.getElementById('detailTitle').textContent;
    const favs = DB.getUserData(user.name, 'favorites', []);
    const idx = favs.indexOf(title);
    
    if (idx > -1) {
        favs.splice(idx, 1);
        showToast('Удалено из избранного', 'info');
    } else {
        favs.push(title);
        showToast('Добавлено в избранное ❤️', 'success');
    }
    DB.setUserData(user.name, 'favorites', favs);
    updateUI();
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

    let html = '<div style="padding:20px;"><h1>Избранное</h1><div class="grid">';
    favs.forEach(name => {
        const item = findAnimeByName(name);
        if (item) {
            const img = item.images?.jpg?.image_url || '';
            html += `
                <div class="card" onclick="openDetail('${item.mal_id || item.id}')">
                    <img src="${img}">
                    <div class="card-body"><div class="title">${name}</div></div>
                </div>
            `;
        }
    });
    html += '</div></div>';
    container.innerHTML = html;
}

function findAnimeByName(name) {
    for (const id in allData) {
        if (allData[id] && allData[id].title === name) return allData[id];
    }
    return null;
}

// ============================================
// ПРОФИЛЬ
// ============================================
function renderProfile() {
    const user = DB.get('currentUser');
    if (!user) {
        document.getElementById('page-profile').innerHTML = `<div style="padding:40px;text-align:center;"><h3>Войдите в аккаунт</h3><button class="hero-btn-primary" onclick="showLoginModal()" style="margin-top:20px;">Войти</button></div>`;
        return;
    }

    document.getElementById('profileName').textContent = user.name;
    document.getElementById('profileEmail').textContent = user.email;
    document.getElementById('profileLevelBadge').textContent = 'Lv.1'; // Заглушка уровня

    const img = document.getElementById('avatarImg');
    const letter = document.getElementById('avatarLetter');
    
    if (img && letter) {
        img.style.display = 'none';
        letter.style.display = 'flex';
        letter.textContent = user.name[0].toUpperCase();
    }
}

// ============================================
// TOAST
// ============================================
function showToast(message, type) {
    const old = document.querySelector('.toast-message');
    if (old) old.remove();
    const colors = { success: '#2ecc71', error: '#e74c3c', info: '#6c5ce7' };
    
    const toast = document.createElement('div');
    toast.className = 'toast-message';
    toast.textContent = message;
    toast.style.cssText = `position: fixed; bottom: 90px; left: 50%; transform: translateX(-50%); background: ${colors[type] || colors.info}; color: #fff; padding: 12px 24px; border-radius: 12px; font-weight: 600; z-index: 99999; text-align: center; font-size: 14px;`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
}

// ============================================
// ЗАПУСК
// ============================================
document.addEventListener('DOMContentLoaded', function() {
    if (typeof restoreAllData === 'function') restoreAllData();
    updateUI();
    navigate('home');

    const user = DB.get('currentUser');
    if (user) startOnlineTracking();
});

window.openDetail = openDetail;
window.navigate = navigate;
window.goBack = goBack;
window.toggleMenu = toggleMenu;
window.closeMenu = closeMenu;
window.toggleFav = toggleFav;
window.applyCatalogFilters = applyCatalogFilters;
window.clearCatalogSearch = clearCatalogSearch;
window.watchOnVeoveo = watchOnVeoveo;
window.showToast = showToast;
window.toggleDescription = toggleDescription;
