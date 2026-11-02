// ==================== CONFIGURATION ====================
const SUPABASE_URL = 'https://wqxewghwrmmhmcyhvdze.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndxeGV3Z2h3cm1taG1jeWh2ZHplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU2Nzc5MjMsImV4cCI6MjA2MTI1MzkyM30.KsLpR4sH_BZ4ueRDwYPfQU1qe6TBsYcO9CSNV9VaV3I';
const SHIKIMORI_PROXY = 'https://onika-api.relaxdev.ru/?target=';
const SHIKIMORI_GRAPHQL = 'https://shikimori.one/api/graphql';

// ==================== TELEGRAM WEB APP ====================
let tg = window.Telegram?.WebApp;
let userId = null;
let userName = 'User';

if (tg) {
    tg.ready();
    tg.expand();

    const user = tg.initDataUnsafe?.user;
    if (user) {
        userId = user.id;
        userName = user.first_name || user.username || 'User';
        document.getElementById('profileName').textContent = userName;
        document.getElementById('profileAvatar').textContent = userName[0].toUpperCase();
        document.getElementById('userAvatar').textContent = userName[0].toUpperCase();
    }
} else {
    userId = 'dev_' + Math.random().toString(36).substr(2, 9);
    userName = 'DevUser';
}

// ==================== SUPABASE CLIENT ====================
const supabase = window.supabase?.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ==================== STATE ====================
let currentUser = null;
let animeCache = {};
let currentAnimeList = [];
let currentPage = 1;
let isLoading = false;
let currentFilter = 'all';
let currentMyListStatus = 'watching';

// ==================== INIT ====================
document.addEventListener('DOMContentLoaded', async () => {
    await initUser();
    setupEventListeners();
    await loadHomeContent();
});

// ==================== USER MANAGEMENT ====================
async function initUser() {
    if (!supabase || !userId) {
        currentUser = getLocalStats();
        updateProfileUI();
        return;
    }

    try {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('telegram_id', userId)
            .single();

        if (error && error.code === 'PGRST116') {
            const newUser = {
                telegram_id: userId,
                username: userName,
                level: 1,
                xp: 0,
                coins: 100,
                anime_watched: 0,
                episodes_watched: 0,
                created_at: new Date().toISOString()
            };

            const { data: created } = await supabase
                .from('users')
                .insert(newUser)
                .select()
                .single();

            currentUser = created || newUser;
        } else {
            currentUser = data;
        }

        updateProfileUI();
    } catch (err) {
        console.error('User init error:', err);
        currentUser = getLocalStats();
        updateProfileUI();
    }
}

function getLocalStats() {
    const stats = localStorage.getItem('onika_stats');
    if (stats) {
        return JSON.parse(stats);
    }
    return {
        telegram_id: userId,
        username: userName,
        level: 1,
        xp: 0,
        coins: 100,
        anime_watched: 0,
        episodes_watched: 0
    };
}

function saveLocalStats() {
    if (currentUser) {
        localStorage.setItem('onika_stats', JSON.stringify(currentUser));
    }
}

function updateProfileUI() {
    if (!currentUser) return;

    document.getElementById('userLevel').textContent = currentUser.level || 1;
    document.getElementById('animeWatched').textContent = currentUser.anime_watched || 0;
    document.getElementById('episodesWatched').textContent = currentUser.episodes_watched || 0;
    document.getElementById('userCoins').textContent = currentUser.coins || 0;
}

async function addXP(amount) {
    if (!currentUser) return;

    currentUser.xp = (currentUser.xp || 0) + amount;
    const xpForNextLevel = currentUser.level * 100;

    if (currentUser.xp >= xpForNextLevel) {
        currentUser.level++;
        currentUser.xp -= xpForNextLevel;
        currentUser.coins = (currentUser.coins || 0) + 50;
        showNotification(`🎉 Поздравляем! Вы достигли ${currentUser.level} уровня!`);
    }

    updateProfileUI();
    saveLocalStats();

    if (supabase && userId) {
        await supabase
            .from('users')
            .update({
                xp: currentUser.xp,
                level: currentUser.level,
                coins: currentUser.coins
            })
            .eq('telegram_id', userId);
    }
}

// ==================== SKELETON LOADERS ====================
function createSkeletonCard() {
    const card = document.createElement('div');
    card.className = 'skeleton-card';
    card.innerHTML = `
        <div class="skeleton-poster"></div>
        <div class="skeleton-info">
            <div class="skeleton-title"></div>
            <div class="skeleton-line" style="width: 70%; margin-top: 8px;"></div>
        </div>
    `;
    return card;
}

function showSkeletons(container, count = 12) {
    container.innerHTML = '';
    for (let i = 0; i < count; i++) {
        container.appendChild(createSkeletonCard());
    }
}

// ==================== NAVIGATION ====================
function setupEventListeners() {
    // Bottom navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            const pageId = item.dataset.page;
            navigateTo(pageId);
        });
    });

    // Search
    const searchInput = document.getElementById('searchInput');
    let searchTimeout;
    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            const query = e.target.value.trim();
            if (query.length >= 2) {
                searchAnime(query);
            } else if (query.length === 0) {
                const activePage = document.querySelector('.page.active');
                if (activePage.id === 'catalogPage') {
                    loadCatalog();
                } else if (activePage.id === 'homePage') {
                    loadHomeContent();
                }
            }
        }, 500);
    });

    // Catalog filters
    document.querySelectorAll('#catalogFilters .filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#catalogFilters .filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.filter;
            currentPage = 1;
            loadCatalog();
        });
    });

    // My list filters
    document.querySelectorAll('#myListFilters .filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#myListFilters .filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentMyListStatus = btn.dataset.status;
            loadMyList();
        });
    });

    // Infinite scroll
    window.addEventListener('scroll', () => {
        if (document.getElementById('catalogPage').classList.contains('active')) {
            const scrollHeight = document.documentElement.scrollHeight;
            const scrollTop = document.documentElement.scrollTop;
            const clientHeight = document.documentElement.clientHeight;

            if (scrollTop + clientHeight >= scrollHeight - 500 && !isLoading) {
                currentPage++;
                loadCatalog(true);
            }
        }
    });

    // Modal close on background click
    document.getElementById('animeModal').addEventListener('click', (e) => {
        if (e.target.id === 'animeModal') {
            closeModal();
        }
    });
}

function navigateTo(pageId) {
    document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));
    document.getElementById(pageId).classList.add('active');

    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.page === pageId) {
            item.classList.add('active');
        }
    });

    switch(pageId) {
        case 'homePage':
            loadHomeContent();
            break;
        case 'catalogPage':
            if (currentAnimeList.length === 0) {
                loadCatalog();
            }
            break;
        case 'myListPage':
            loadMyList();
            break;
        case 'friendsPage':
            loadFriends();
            break;
        case 'profilePage':
            loadProfile();
            break;
    }

    window.scrollTo(0, 0);
}

// ==================== SHIKIMORI API ====================
async function fetchShikimori(query, variables = {}) {
    try {
        const response = await fetch(SHIKIMORI_PROXY + encodeURIComponent(SHIKIMORI_GRAPHQL), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, variables })
        });

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Shikimori API error:', error);
        return null;
    }
}

async function getAnimeList(page = 1, limit = 20, filters = {}) {
    const query = `
        query($page: Int, $limit: Int, $order: OrderEnum, $kind: AnimeKindEnum, $status: AnimeStatusEnum) {
            animes(page: $page, limit: $limit, order: $order, kind: $kind, status: $status) {
                id
                name
                russian
                score
                url
                kind
                status
                episodes
                episodesAired
                poster { mainUrl }
                genres { id name russian }
            }
        }
    `;

    const variables = {
        page,
        limit,
        order: 'POPULARITY',
        ...filters
    };

    const result = await fetchShikimori(query, variables);
    return result?.data?.animes || [];
}

async function getAnimeDetails(id) {
    if (animeCache[id]) {
        return animeCache[id];
    }

    const query = `
        query($ids: String!) {
            animes(ids: $ids, limit: 1) {
                id
                name
                russian
                description
                descriptionHtml
                score
                url
                kind
                status
                episodes
                episodesAired
                duration
                rating
                airedOn { year }
                releasedOn { year }
                poster { mainUrl }
                genres { id name russian }
                studios { id name }
                videos { url }
            }
        }
    `;

    const result = await fetchShikimori(query, { ids: id.toString() });
    const anime = result?.data?.animes?.[0];

    if (anime) {
        animeCache[id] = anime;
    }

    return anime;
}

async function searchAnime(searchTerm) {
    const query = `
        query($search: String!) {
            animes(search: $search, limit: 30, order: POPULARITY) {
                id
                name
                russian
                score
                url
                kind
                status
                episodes
                episodesAired
                poster { mainUrl }
                genres { id name russian }
            }
        }
    `;

    const activePage = document.querySelector('.page.active');
    const grid = activePage.querySelector('.anime-grid');

    if (!grid) return;

    showSkeletons(grid, 12);

    const result = await fetchShikimori(query, { search: searchTerm });
    const animes = result?.data?.animes || [];

    renderAnimeGrid(animes, grid);
}

// ==================== RENDERING ====================
function renderAnimeGrid(animes, container, append = false) {
    if (!append) {
        container.innerHTML = '';
    }

    if (animes.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 40px; grid-column: 1/-1;">Ничего не найдено</p>';
        return;
    }

    animes.forEach((anime, index) => {
        const card = createAnimeCard(anime);
        card.style.animationDelay = `${index * 0.05}s`;
        container.appendChild(card);
    });
}

function createAnimeCard(anime) {
    const card = document.createElement('div');
    card.className = 'anime-card';
    card.onclick = () => openAnimeModal(anime.id);

    const posterUrl = anime.poster?.mainUrl ? `https://shikimori.one${anime.poster.mainUrl}` : '';
    const title = anime.russian || anime.name;
    const score = anime.score || 'N/A';
    const kind = anime.kind || 'TV';

    card.innerHTML = `
        <div class="anime-poster">
            ${posterUrl ? `<img src="${posterUrl}" alt="${title}" loading="lazy">` : ''}
            <div class="anime-badge">⭐ ${score}</div>
        </div>
        <div class="anime-info">
            <div class="anime-title">${title}</div>
            <div class="anime-meta">
                <span>${kind}</span>
                <span>${anime.episodes || '?'} эп.</span>
            </div>
        </div>
    `;

    return card;
}

// ==================== CONTENT LOADING ====================
async function loadHomeContent() {
    const trendingGrid = document.getElementById('trendingGrid');
    const recommendationsGrid = document.getElementById('recommendationsGrid');

    showSkeletons(trendingGrid, 6);
    showSkeletons(recommendationsGrid, 6);

    const trending = await getAnimeList(1, 12, { order: 'POPULARITY' });
    renderAnimeGrid(trending, trendingGrid);

    const recommendations = await getAnimeList(1, 12, { order: 'RANKED' });
    renderAnimeGrid(recommendations, recommendationsGrid);
}

async function loadCatalog(append = false) {
    if (isLoading) return;
    isLoading = true;

    const grid = document.getElementById('catalogGrid');
    const loadingMore = document.getElementById('loadingMore');

    if (!append) {
        showSkeletons(grid, 20);
        currentAnimeList = [];
        currentPage = 1;
    } else {
        loadingMore.style.display = 'flex';
    }

    const filters = {};

    switch(currentFilter) {
        case 'ongoing':
            filters.status = 'ONGOING';
            break;
        case 'anons':
            filters.status = 'ANONS';
            break;
        case 'movie':
            filters.kind = 'MOVIE';
            break;
        case 'ova':
            filters.kind = 'OVA';
            break;
    }

    const animes = await getAnimeList(currentPage, 20, filters);
    currentAnimeList = append ? [...currentAnimeList, ...animes] : animes;

    renderAnimeGrid(animes, grid, append);

    loadingMore.style.display = 'none';
    isLoading = false;
}

async function loadMyList() {
    const grid = document.getElementById('myListGrid');
    showSkeletons(grid, 6);

    const myList = getMyAnimeList();
    const filteredList = myList.filter(item => item.status === currentMyListStatus);

    if (filteredList.length === 0) {
        grid.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 40px; grid-column: 1/-1;">Список пуст</p>';
        return;
    }

    const animes = await Promise.all(
        filteredList.map(item => getAnimeDetails(item.anime_id))
    );

    renderAnimeGrid(animes.filter(a => a), grid);
}

function loadFriends() {
    const grid = document.getElementById('friendsGrid');
    grid.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 40px; grid-column: 1/-1;">Функция в разработке</p>';
}

function loadProfile() {
    updateProfileUI();
    loadAchievements();
}

function loadAchievements() {
    const grid = document.getElementById('achievementsGrid');
    grid.innerHTML = '<p style="color: var(--text-secondary);">Достижения в разработке</p>';
}

// ==================== ANIME MODAL ====================
async function openAnimeModal(animeId) {
    const modal = document.getElementById('animeModal');
    const content = document.getElementById('animeModalContent');

    modal.classList.add('active');
    content.innerHTML = `
        <button class="modal-close" onclick="closeModal()">×</button>
        <div class="loading">
            <div class="spinner"></div>
        </div>
    `;

    const anime = await getAnimeDetails(animeId);
    if (!anime) {
        content.innerHTML = '<button class="modal-close" onclick="closeModal()">×</button><p style="color: var(--text-secondary);">Ошибка загрузки</p>';
        return;
    }

    const userAnime = getUserAnimeData(animeId);
    const inList = !!userAnime;
    const status = userAnime?.status || 'watching';
    const watchedEpisodes = userAnime?.episodes_watched || 0;

    const posterUrl = anime.poster?.mainUrl ? `https://shikimori.one${anime.poster.mainUrl}` : '';
    const genres = anime.genres?.map(g => g.russian || g.name).join(', ') || 'Неизвестно';

    content.innerHTML = `
        <button class="modal-close" onclick="closeModal()">×</button>
        <div>
            ${posterUrl ? `<img src="${posterUrl}" style="width: 100%; border-radius: 10px; margin-bottom: 15px;">` : ''}
            <h2 style="font-size: 22px; margin-bottom: 10px;">${anime.russian || anime.name}</h2>
            <div style="color: var(--text-secondary); margin-bottom: 10px; font-size: 14px;">
                ${anime.kind || 'TV'} • ${anime.episodes || '?'} эп. • ${anime.airedOn?.year || 'TBA'}
            </div>
            <div style="margin-bottom: 10px;">
                <span style="color: #ffc107;">⭐</span>
                <span style="font-weight: 600;">${anime.score || 'N/A'}</span>
            </div>
            <div style="color: var(--text-secondary); margin-bottom: 10px; font-size: 13px;">
                <strong>Жанры:</strong> ${genres}
            </div>
            <p style="line-height: 1.5; color: var(--text-secondary); margin-bottom: 20px; font-size: 14px;">
                ${anime.description || 'Описание отсутствует'}
            </p>
            <div style="display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 15px;">
                <button class="btn btn-primary" onclick="watchAnime(${animeId})">
                    ${inList && watchedEpisodes > 0 ? '▶️ Продолжить' : '▶️ Смотреть'}
                </button>
                <button class="btn btn-primary" onclick="toggleAnimeList(${animeId}, '${status}')">
                    ${inList ? '✓ В списке' : '+ Добавить'}
                </button>
            </div>
            ${inList ? `
                <div style="margin-top: 15px;">
                    <div style="font-size: 13px; color: var(--text-secondary); margin-bottom: 8px;">
                        Просмотрено: ${watchedEpisodes} / ${anime.episodes || '?'}
                    </div>
                    <select onchange="changeAnimeStatus(${animeId}, this.value)" 
                        style="width: 100%; padding: 10px; background: var(--bg-primary); 
                        border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; 
                        color: white; font-size: 14px;">
                        <option value="watching" ${status === 'watching' ? 'selected' : ''}>Смотрю</option>
                        <option value="completed" ${status === 'completed' ? 'selected' : ''}>Просмотрено</option>
                        <option value="planned" ${status === 'planned' ? 'selected' : ''}>В планах</option>
                        <option value="on_hold" ${status === 'on_hold' ? 'selected' : ''}>Отложено</option>
                        <option value="dropped" ${status === 'dropped' ? 'selected' : ''}>Брошено</option>
                    </select>
                </div>
            ` : ''}
        </div>
    `;
}

function closeModal() {
    document.getElementById('animeModal').classList.remove('active');
}

// ==================== USER ANIME DATA ====================
function getUserAnimeData(animeId) {
    const myList = getMyAnimeList();
    return myList.find(item => item.anime_id === animeId);
}

function getMyAnimeList() {
    const list = localStorage.getItem('my_anime_list');
    return list ? JSON.parse(list) : [];
}

function saveMyAnimeList(list) {
    localStorage.setItem('my_anime_list', JSON.stringify(list));
}

function toggleAnimeList(animeId, currentStatus) {
    const myList = getMyAnimeList();
    const existingIndex = myList.findIndex(item => item.anime_id === animeId);

    if (existingIndex >= 0) {
        myList.splice(existingIndex, 1);
        showNotification('❌ Удалено из списка');
    } else {
        myList.push({
            anime_id: animeId,
            status: 'planned',
            episodes_watched: 0,
            rating: 0,
            added_at: new Date().toISOString()
        });
        showNotification('✅ Добавлено в список');
    }

    saveMyAnimeList(myList);
    openAnimeModal(animeId);
}

function changeAnimeStatus(animeId, newStatus) {
    const myList = getMyAnimeList();
    const anime = myList.find(item => item.anime_id === animeId);

    if (anime) {
        anime.status = newStatus;
        saveMyAnimeList(myList);
        showNotification('✅ Статус изменен');
    }
}

async function watchAnime(animeId) {
    const anime = await getAnimeDetails(animeId);
    if (!anime) return;

    const myList = getMyAnimeList();
    let userAnime = myList.find(item => item.anime_id === animeId);

    if (!userAnime) {
        userAnime = {
            anime_id: animeId,
            status: 'watching',
            episodes_watched: 0,
            rating: 0,
            added_at: new Date().toISOString()
        };
        myList.push(userAnime);
    }

    userAnime.episodes_watched++;

    if (currentUser) {
        currentUser.episodes_watched = (currentUser.episodes_watched || 0) + 1;

        if (userAnime.episodes_watched >= anime.episodes) {
            userAnime.status = 'completed';
            currentUser.anime_watched = (currentUser.anime_watched || 0) + 1;
            await addXP(50);
            showNotification('🎉 Аниме завершено! +50 XP');
        } else {
            await addXP(5);
        }

        saveMyAnimeList(myList);
        updateProfileUI();
    }

    closeModal();
    showNotification(`✅ Эпизод ${userAnime.episodes_watched} просмотрен`);
}

// ==================== NOTIFICATIONS ====================
function showNotification(message) {
    if (tg && tg.showAlert) {
        tg.showAlert(message);
    } else {
        alert(message);
    }
}

// ==================== GLOBAL FUNCTIONS ====================
window.closeModal = closeModal;
window.openAnimeModal = openAnimeModal;
window.toggleAnimeList = toggleAnimeList;
window.changeAnimeStatus = changeAnimeStatus;
window.watchAnime = watchAnime;
