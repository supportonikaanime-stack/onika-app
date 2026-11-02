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
    tg.setHeaderColor('#0a0a0f');
    tg.setBackgroundColor('#0a0a0f');

    const user = tg.initDataUnsafe?.user;
    if (user) {
        userId = user.id;
        userName = user.first_name || user.username || 'User';
        document.getElementById('profileName').textContent = userName;
        document.getElementById('profileAvatar').textContent = userName[0].toUpperCase();
        document.getElementById('userAvatar').textContent = userName[0].toUpperCase();
    }
} else {
    // Fallback for development
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
    await loadHomeContent();
    setupEventListeners();
    updateProfileStats();
});

// ==================== USER MANAGEMENT ====================
async function initUser() {
    if (!supabase || !userId) return;

    try {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('telegram_id', userId)
            .single();

        if (error && error.code === 'PGRST116') {
            // Create new user
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
    }
}

function getLocalStats() {
    const stats = localStorage.getItem('onika_stats');
    if (stats) {
        return JSON.parse(stats);
    }
    return {
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

    // Update XP circle
    const xp = currentUser.xp || 0;
    const level = currentUser.level || 1;
    const xpForNextLevel = level * 100;
    const progress = (xp / xpForNextLevel) * 100;

    const circle = document.getElementById('xpCircle');
    const circumference = 2 * Math.PI * 60;
    const offset = circumference - (progress / 100) * circumference;

    circle.style.strokeDasharray = circumference;
    circle.style.strokeDashoffset = offset;
}

async function addXP(amount) {
    if (!currentUser) return;

    currentUser.xp += amount;
    const xpForNextLevel = currentUser.level * 100;

    if (currentUser.xp >= xpForNextLevel) {
        currentUser.level++;
        currentUser.xp -= xpForNextLevel;
        currentUser.coins += 50;
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

// ==================== NAVIGATION ====================
function setupEventListeners() {
    // Bottom navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            const pageId = item.dataset.page;
            navigateTo(pageId);

            // Add ripple effect
            createRipple(e, item);
        });
    });

    // Search
    const searchInput = document.getElementById('searchInput');
    let searchTimeout;
    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            searchAnime(e.target.value);
        }, 500);
    });

    // Filters
    document.querySelectorAll('.filter-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const parent = chip.parentElement;
            parent.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');

            if (parent.id === 'filtersContainer') {
                currentFilter = chip.dataset.filter;
                currentPage = 1;
                loadCatalog();
            } else if (parent.id === 'myListFilters') {
                currentMyListStatus = chip.dataset.status;
                loadMyList();
            }
        });
    });

    // Shop categories
    document.querySelectorAll('.shop-category').forEach(cat => {
        cat.addEventListener('click', () => {
            document.querySelectorAll('.shop-category').forEach(c => c.classList.remove('active'));
            cat.classList.add('active');
            loadShopItems(cat.dataset.category);
        });
    });

    // Infinite scroll for catalog
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
}

function navigateTo(pageId) {
    // Hide all pages
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });

    // Show selected page
    document.getElementById(pageId).classList.add('active');

    // Update navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.page === pageId) {
            item.classList.add('active');
        }
    });

    // Load page content
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

// ==================== RIPPLE EFFECT ====================
function createRipple(event, element) {
    const ripple = document.createElement('span');
    ripple.classList.add('ripple');

    const rect = element.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const x = event.clientX - rect.left - size / 2;
    const y = event.clientY - rect.top - size / 2;

    ripple.style.width = ripple.style.height = size + 'px';
    ripple.style.left = x + 'px';
    ripple.style.top = y + 'px';

    element.appendChild(ripple);

    setTimeout(() => ripple.remove(), 600);
}

// ==================== SHIKIMORI API ====================
async function fetchShikimori(query, variables = {}) {
    try {
        const response = await fetch(SHIKIMORI_PROXY + encodeURIComponent(SHIKIMORI_GRAPHQL), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
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
    if (!searchTerm || searchTerm.length < 2) {
        if (document.getElementById('catalogPage').classList.contains('active')) {
            loadCatalog();
        }
        return;
    }

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

    const result = await fetchShikimori(query, { search: searchTerm });
    const animes = result?.data?.animes || [];

    const activeGrid = document.querySelector('.page.active .anime-grid');
    if (activeGrid) {
        renderAnimeGrid(animes, activeGrid);
    }
}

// ==================== RENDERING ====================
function renderAnimeGrid(animes, container, append = false) {
    if (!append) {
        container.innerHTML = '';
    }

    animes.forEach((anime, index) => {
        const card = createAnimeCard(anime);
        card.style.animation = `fadeInUp 0.5s ease ${index * 0.05}s both`;
        container.appendChild(card);
    });
}

function createAnimeCard(anime) {
    const card = document.createElement('div');
    card.className = 'anime-card';
    card.onclick = () => openAnimeModal(anime.id);

    const userAnime = getUserAnimeData(anime.id);
    const progress = userAnime ? Math.round((userAnime.episodes_watched / anime.episodes) * 100) : 0;

    const genres = anime.genres?.slice(0, 2).map(g => {
        const genreClass = g.name.toLowerCase();
        return `<span class="genre-tag ${genreClass}">${g.russian || g.name}</span>`;
    }).join('') || '';

    card.innerHTML = `
        <div class="anime-poster">
            <img src="https://shikimori.one${anime.poster?.mainUrl}" alt="${anime.russian || anime.name}" loading="lazy">
            <div class="anime-badge">⭐ ${anime.score || 'N/A'}</div>
            ${progress > 0 ? `
                <div class="anime-progress">
                    <div class="anime-progress-bar" style="width: ${progress}%"></div>
                </div>
            ` : ''}
        </div>
        <div class="anime-info">
            <div class="anime-title">${anime.russian || anime.name}</div>
            <div class="anime-genres">${genres}</div>
            <div class="anime-meta">
                <span>${anime.kind || 'TV'}</span>
                <div class="anime-rating">⭐ ${anime.score || 'N/A'}</div>
            </div>
        </div>
    `;

    return card;
}

function createSkeletonCards(count) {
    const skeletons = [];
    for (let i = 0; i < count; i++) {
        const skeleton = document.createElement('div');
        skeleton.className = 'skeleton-card';
        skeleton.innerHTML = `
            <div class="skeleton-poster"></div>
            <div class="skeleton-info">
                <div class="skeleton-title"></div>
                <div class="skeleton-line" style="width: 80%; margin-top: 8px;"></div>
                <div class="skeleton-line" style="width: 60%; margin-top: 8px;"></div>
            </div>
        `;
        skeletons.push(skeleton);
    }
    return skeletons;
}

function showSkeletons(container) {
    container.innerHTML = '';
    createSkeletonCards(12).forEach(skeleton => container.appendChild(skeleton));
}

// ==================== CONTENT LOADING ====================
async function loadHomeContent() {
    const trendingGrid = document.getElementById('trendingGrid');
    const recommendationsGrid = document.getElementById('recommendationsGrid');

    showSkeletons(trendingGrid);
    showSkeletons(recommendationsGrid);

    // Load trending
    const trending = await getAnimeList(1, 12, { order: 'POPULARITY' });
    renderAnimeGrid(trending, trendingGrid);

    // Load recommendations
    const recommendations = await getAnimeList(1, 12, { order: 'RANKED' });
    renderAnimeGrid(recommendations, recommendationsGrid);
}

async function loadCatalog(append = false) {
    if (isLoading) return;
    isLoading = true;

    const grid = document.getElementById('catalogGrid');
    const loadingMore = document.getElementById('loadingMore');

    if (!append) {
        showSkeletons(grid);
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
    showSkeletons(grid);

    // Get user's anime list from local storage or Supabase
    const myList = getMyAnimeList();
    const filteredList = myList.filter(item => item.status === currentMyListStatus);

    if (filteredList.length === 0) {
        grid.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 40px;">Список пуст</p>';
        return;
    }

    // Fetch anime details
    const animes = await Promise.all(
        filteredList.map(item => getAnimeDetails(item.anime_id))
    );

    renderAnimeGrid(animes.filter(a => a), grid);
}

async function loadFriends() {
    const grid = document.getElementById('friendsGrid');
    grid.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 40px;">Функция в разработке</p>';
}

async function loadProfile() {
    updateProfileStats();
    loadAchievements();
    loadShopItems('banners');
}

function updateProfileStats() {
    updateProfileUI();
}

function loadAchievements() {
    const grid = document.getElementById('achievementsGrid');

    const achievements = [
        { icon: '🎬', title: 'Первый шаг', desc: 'Просмотри 1 аниме', unlocked: (currentUser?.anime_watched || 0) >= 1 },
        { icon: '📺', title: 'Любитель', desc: 'Просмотри 10 аниме', unlocked: (currentUser?.anime_watched || 0) >= 10 },
        { icon: '🏆', title: 'Эксперт', desc: 'Просмотри 50 аниме', unlocked: (currentUser?.anime_watched || 0) >= 50 },
        { icon: '👑', title: 'Мастер', desc: 'Просмотри 100 аниме', unlocked: (currentUser?.anime_watched || 0) >= 100 },
        { icon: '⚡', title: 'Марафонец', desc: 'Просмотри 50 эпизодов', unlocked: (currentUser?.episodes_watched || 0) >= 50 },
        { icon: '🔥', title: 'Легенда', desc: 'Достигни 10 уровня', unlocked: (currentUser?.level || 0) >= 10 },
        { icon: '💎', title: 'Богач', desc: 'Собери 1000 монет', unlocked: (currentUser?.coins || 0) >= 1000 },
        { icon: '⭐', title: 'Критик', desc: 'Оцени 20 аниме', unlocked: false },
        { icon: '💬', title: 'Комментатор', desc: 'Оставь 10 комментариев', unlocked: false },
        { icon: '👥', title: 'Социальный', desc: 'Добавь 5 друзей', unlocked: false },
        { icon: '🎨', title: 'Модник', desc: 'Купи 5 предметов', unlocked: false },
        { icon: '🌟', title: 'Коллекционер', desc: 'Купи все баннеры', unlocked: false }
    ];

    grid.innerHTML = '';
    achievements.forEach(ach => {
        const card = document.createElement('div');
        card.className = `achievement-card ${ach.unlocked ? '' : 'locked'}`;
        card.innerHTML = `
            <div class="achievement-icon">${ach.icon}</div>
            <div class="achievement-title">${ach.title}</div>
            <div class="achievement-desc">${ach.desc}</div>
        `;
        grid.appendChild(card);
    });
}

function loadShopItems(category) {
    const grid = document.getElementById('shopGrid');

    const items = {
        banners: [
            { name: 'Сакура', price: 100, preview: 'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)' },
            { name: 'Ночь', price: 150, preview: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
            { name: 'Огонь', price: 200, preview: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' },
            { name: 'Океан', price: 250, preview: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' }
        ],
        titles: [
            { name: 'Новичок', price: 50 },
            { name: 'Отаку', price: 100 },
            { name: 'Сенпай', price: 200 },
            { name: 'Легенда', price: 500 }
        ],
        frames: [
            { name: 'Базовая', price: 100 },
            { name: 'Золотая', price: 300 },
            { name: 'Радужная', price: 500 },
            { name: 'Легендарная', price: 1000 }
        ],
        effects: [
            { name: 'Искры', price: 150 },
            { name: 'Аура', price: 200 },
            { name: 'Молнии', price: 300 },
            { name: 'Огонь', price: 400 }
        ],
        badges: [
            { name: '⭐', price: 50 },
            { name: '🔥', price: 100 },
            { name: '👑', price: 150 },
            { name: '💎', price: 200 }
        ]
    };

    const categoryItems = items[category] || [];

    grid.innerHTML = '';
    categoryItems.forEach(item => {
        const card = document.createElement('div');
        card.className = 'shop-item';
        card.onclick = () => buyShopItem(item, category);

        const preview = item.preview || 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';

        card.innerHTML = `
            <div class="shop-item-preview" style="background: ${preview};"></div>
            <div class="shop-item-info">
                <div class="shop-item-name">${item.name}</div>
                <div class="shop-item-price">
                    <span>💰</span>
                    <span>${item.price}</span>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
}

async function buyShopItem(item, category) {
    if (!currentUser || currentUser.coins < item.price) {
        showNotification('❌ Недостаточно монет!');
        return;
    }

    currentUser.coins -= item.price;
    updateProfileUI();
    saveLocalStats();

    if (supabase && userId) {
        await supabase
            .from('users')
            .update({ coins: currentUser.coins })
            .eq('telegram_id', userId);
    }

    showNotification(`✅ Куплено: ${item.name}`);
}

// ==================== ANIME MODAL ====================
async function openAnimeModal(animeId) {
    const modal = document.getElementById('animeModal');
    const content = document.getElementById('animeModalContent');

    modal.classList.add('active');
    content.innerHTML = '<button class="modal-close" onclick="closeModal()">×</button><div class="loading-container"><div class="loading-spinner"></div></div>';

    const anime = await getAnimeDetails(animeId);
    if (!anime) {
        content.innerHTML = '<button class="modal-close" onclick="closeModal()">×</button><p>Ошибка загрузки</p>';
        return;
    }

    const userAnime = getUserAnimeData(animeId);
    const inList = !!userAnime;
    const status = userAnime?.status || 'watching';
    const watchedEpisodes = userAnime?.episodes_watched || 0;

    const genres = anime.genres?.map(g => `<span class="genre-tag">${g.russian || g.name}</span>`).join('') || '';

    content.innerHTML = `
        <button class="modal-close" onclick="closeModal()">×</button>
        <div style="margin-bottom: 20px;">
            <img src="https://shikimori.one${anime.poster?.mainUrl}" style="width: 100%; border-radius: 16px; margin-bottom: 16px;">
            <h2 style="font-family: 'Poppins', sans-serif; font-size: 24px; margin-bottom: 8px;">${anime.russian || anime.name}</h2>
            <div style="display: flex; gap: 8px; margin-bottom: 12px;">${genres}</div>
            <div style="color: var(--text-secondary); margin-bottom: 16px;">
                ${anime.kind || 'TV'} • ${anime.episodes || '?'} эп. • ${anime.airedOn?.year || 'TBA'}
            </div>
            <div style="margin-bottom: 16px;">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                    <span style="color: #ffc107; font-size: 20px;">⭐</span>
                    <span style="font-size: 18px; font-weight: 600;">${anime.score || 'N/A'}</span>
                </div>
            </div>
            <p style="line-height: 1.6; color: var(--text-secondary); margin-bottom: 20px;">
                ${anime.description || 'Описание отсутствует'}
            </p>
            <div style="display: flex; gap: 12px; flex-wrap: wrap;">
                <button class="btn btn-primary" onclick="watchAnime(${animeId})">
                    ${inList && watchedEpisodes > 0 ? '▶️ Продолжить' : '▶️ Смотреть'}
                </button>
                <button class="btn btn-primary" onclick="toggleAnimeList(${animeId}, '${status}')">
                    ${inList ? '✓ В списке' : '+ Добавить'}
                </button>
            </div>
            ${inList ? `
                <div style="margin-top: 16px;">
                    <div style="font-size: 14px; color: var(--text-secondary); margin-bottom: 8px;">
                        Просмотрено: ${watchedEpisodes} / ${anime.episodes || '?'}
                    </div>
                    <select onchange="changeAnimeStatus(${animeId}, this.value)" style="width: 100%; padding: 12px; background: var(--bg-dark); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; color: white;">
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

// Close modal on background click
document.getElementById('animeModal').addEventListener('click', (e) => {
    if (e.target.id === 'animeModal') {
        closeModal();
    }
});

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
    openAnimeModal(animeId); // Refresh modal
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

    // Add to watching list if not in list
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
        saveMyAnimeList(myList);
    }

    // Simulate episode increment
    userAnime.episodes_watched++;

    if (currentUser) {
        currentUser.episodes_watched = (currentUser.episodes_watched || 0) + 1;

        // Check if completed
        if (userAnime.episodes_watched >= anime.episodes) {
            userAnime.status = 'completed';
            currentUser.anime_watched = (currentUser.anime_watched || 0) + 1;
            await addXP(50);
            showNotification('🎉 Аниме завершено! +50 XP');
        } else {
            await addXP(5);
        }

        saveMyAnimeList(myList);
        updateProfileStats();
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

// ==================== UTILS ====================
window.closeModal = closeModal;
window.openAnimeModal = openAnimeModal;
window.toggleAnimeList = toggleAnimeList;
window.changeAnimeStatus = changeAnimeStatus;
window.watchAnime = watchAnime;
window.buyShopItem = buyShopItem;
