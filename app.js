// Инициализация Telegram WebApp
const tg = window.Telegram.WebApp;
tg.expand();
tg.enableClosingConfirmation();

// Конфигурация Supabase
const SUPABASE_URL = 'https://jjycrzhwfhoktzchugaw.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpqeWNyemh3Zmhva3R6Y2h1Z2F3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzY5NTU2MzEsImV4cCI6MjA1MjUzMTYzMX0.p37c-_KcdAzwSzYs2Z7CglQY77hm0dMFSM1hLrXlQsM';

// Глобальное состояние
const state = {
    user: null,
    animeList: [],
    filteredAnime: [],
    currentAnime: null,
    currentEpisode: 1,
    shopItems: [],
    friends: [],
    currentCategory: 'frames',
    page: 1,
    loading: false,
    hasMore: true
};

// Система уровней
const XP_PER_LEVEL = 100;
const COINS_PER_EPISODE = 10;

// === ИНИЦИАЛИЗАЦИЯ ===
async function init() {
    const userId = tg.initDataUnsafe?.user?.id || 'demo_user';
    await loadUser(userId);
    setupNavigation();
    setupSearch();
    setupFilters();
    setupShop();
    await loadAnime();
    setupScrollPagination();
}

// === РАБОТА С ПОЛЬЗОВАТЕЛЕМ ===
async function loadUser(userId) {
    try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/users?telegram_id=eq.${userId}`, {
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`
            }
        });

        const users = await response.json();

        if (users && users.length > 0) {
            state.user = users[0];
        } else {
            state.user = await createUser(userId);
        }

        updateProfileUI();
    } catch (error) {
        console.error('Ошибка загрузки пользователя:', error);
        state.user = createDemoUser();
        updateProfileUI();
    }
}

function createDemoUser() {
    return {
        telegram_id: 'demo_user',
        username: 'Аноним',
        xp: 0,
        level: 1,
        coins: 100,
        avatar_url: 'https://via.placeholder.com/80',
        watched_anime: [],
        achievements: [],
        inventory: []
    };
}

async function createUser(userId) {
    const newUser = {
        telegram_id: userId,
        username: tg.initDataUnsafe?.user?.username || 'Аноним',
        xp: 0,
        level: 1,
        coins: 100,
        avatar_url: tg.initDataUnsafe?.user?.photo_url || 'https://via.placeholder.com/80',
        watched_anime: [],
        achievements: [],
        inventory: []
    };

    try {
        await fetch(`${SUPABASE_URL}/rest/v1/users`, {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(newUser)
        });
        return newUser;
    } catch (error) {
        console.error('Ошибка создания пользователя:', error);
        return newUser;
    }
}

function updateProfileUI() {
    const user = state.user;

    document.getElementById('profileName').textContent = user.username;
    document.getElementById('profileAvatar').src = user.avatar_url;
    document.getElementById('userLevel').textContent = user.level;
    document.getElementById('userCoins').textContent = user.coins;
    document.getElementById('totalWatched').textContent = user.watched_anime?.length || 0;
    document.getElementById('achievementsCount').textContent = user.achievements?.length || 0;

    // Прогресс XP
    const currentLevelXP = (user.level - 1) * XP_PER_LEVEL;
    const nextLevelXP = user.level * XP_PER_LEVEL;
    const xpInLevel = user.xp - currentLevelXP;
    const xpNeeded = nextLevelXP - currentLevelXP;
    const progress = (xpInLevel / xpNeeded) * 100;

    document.getElementById('currentXP').textContent = xpInLevel;
    document.getElementById('nextLevelXP').textContent = xpNeeded;

    const xpBar = document.getElementById('xpBar');
    setTimeout(() => {
        xpBar.style.width = `${progress}%`;
    }, 100);

    // Активная рамка
    const activeFrame = user.inventory?.find(item => item.type === 'frame' && item.equipped);
    if (activeFrame) {
        const frameEl = document.getElementById('avatarFrame');
        frameEl.style.border = activeFrame.style;
        frameEl.classList.add('active');
    }

    // Активный бейдж
    const activeBadge = user.inventory?.find(item => item.type === 'badge' && item.equipped);
    if (activeBadge) {
        document.getElementById('profileBadge').textContent = activeBadge.icon;
    }
}

async function addXP(amount) {
    state.user.xp += amount;

    const newLevel = Math.floor(state.user.xp / XP_PER_LEVEL) + 1;
    const leveledUp = newLevel > state.user.level;

    if (leveledUp) {
        state.user.level = newLevel;
        state.user.coins += 50; // Бонус за уровень
        showNotification(`🎉 Поздравляем! Вы достигли ${newLevel} уровня!`);
    }

    await saveUser();
    updateProfileUI();
}

async function addCoins(amount) {
    state.user.coins += amount;
    await saveUser();
    updateProfileUI();
}

async function saveUser() {
    try {
        await fetch(`${SUPABASE_URL}/rest/v1/users?telegram_id=eq.${state.user.telegram_id}`, {
            method: 'PATCH',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(state.user)
        });
    } catch (error) {
        console.error('Ошибка сохранения:', error);
    }
}

// === НАВИГАЦИЯ ===
function setupNavigation() {
    const tabs = document.querySelectorAll('.nav-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetTab = tab.dataset.tab;

            // Переключение активной вкладки
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // Переключение контента
            document.querySelectorAll('.content-section').forEach(section => {
                section.classList.remove('active');
            });
            document.getElementById(`${targetTab}-section`).classList.add('active');
        });
    });
}

// === ЗАГРУЗКА АНИМЕ ===
async function loadAnime(append = false) {
    if (state.loading || (!append && state.animeList.length > 0)) return;

    state.loading = true;
    const grid = document.getElementById('animeGrid');

    if (!append) {
        grid.innerHTML = '<div class="loading">Загрузка аниме</div>';
    }

    try {
        const genre = document.getElementById('genreFilter').value;
        const sort = document.getElementById('sortFilter').value;
        const status = document.getElementById('statusFilter').value;

        let url = `https://shikimori.one/api/animes?page=${state.page}&limit=20&order=${sort}`;
        if (genre) url += `&genre=${genre}`;
        if (status) url += `&status=${status}`;

        const response = await fetch(url);
        const data = await response.json();

        if (append) {
            state.animeList = [...state.animeList, ...data];
        } else {
            state.animeList = data;
        }

        state.filteredAnime = state.animeList;
        state.hasMore = data.length === 20;
        renderAnimeGrid();
    } catch (error) {
        console.error('Ошибка загрузки аниме:', error);
        grid.innerHTML = '<div class="text-center" style="padding: 40px; color: var(--text-secondary);">Ошибка загрузки. Попробуйте позже.</div>';
    } finally {
        state.loading = false;
    }
}

function renderAnimeGrid() {
    const grid = document.getElementById('animeGrid');
    grid.className = 'anime-grid';
    grid.innerHTML = '';

    state.filteredAnime.forEach(anime => {
        const card = createAnimeCard(anime);
        grid.appendChild(card);
    });

    if (state.filteredAnime.length === 0) {
        grid.innerHTML = '<div class="text-center" style="padding: 40px; color: var(--text-secondary);">Аниме не найдено</div>';
    }
}

function createAnimeCard(anime) {
    const card = document.createElement('div');
    card.className = 'anime-card';

    const posterUrl = anime.image?.original 
        ? `https://shikimori.one${anime.image.original}` 
        : 'https://via.placeholder.com/300x450?text=No+Image';

    const score = anime.score || 'N/A';
    const year = anime.aired_on ? new Date(anime.aired_on).getFullYear() : '—';
    const episodes = anime.episodes || '?';

    card.innerHTML = `
        <img class="anime-poster" src="${posterUrl}" alt="${anime.russian || anime.name}" loading="lazy">
        <div class="anime-card-overlay">
            <div class="anime-card-rating">⭐ ${score}</div>
            <div class="anime-card-title">${anime.russian || anime.name}</div>
            <div class="anime-card-info">${year} • ${episodes} эп.</div>
            <button class="watch-btn">Смотреть</button>
        </div>
    `;

    card.addEventListener('click', () => openPlayer(anime));

    return card;
}

// === ПОИСК И ФИЛЬТРЫ ===
function setupSearch() {
    const searchInput = document.getElementById('searchInput');
    let debounceTimer;

    searchInput.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            applyFilters();
        }, 300);
    });
}

function setupFilters() {
    const filters = ['genreFilter', 'sortFilter', 'statusFilter'];
    filters.forEach(filterId => {
        document.getElementById(filterId).addEventListener('change', () => {
            state.page = 1;
            state.animeList = [];
            loadAnime();
        });
    });
}

function applyFilters() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();

    if (!searchTerm) {
        state.filteredAnime = state.animeList;
    } else {
        state.filteredAnime = state.animeList.filter(anime => {
            const russianName = (anime.russian || '').toLowerCase();
            const englishName = (anime.name || '').toLowerCase();
            return russianName.includes(searchTerm) || englishName.includes(searchTerm);
        });
    }

    renderAnimeGrid();
}

// === ПАГИНАЦИЯ ===
function setupScrollPagination() {
    const catalogSection = document.getElementById('catalog-section');

    catalogSection.addEventListener('scroll', () => {
        if (state.loading || !state.hasMore) return;

        const scrollTop = catalogSection.scrollTop;
        const scrollHeight = catalogSection.scrollHeight;
        const clientHeight = catalogSection.clientHeight;

        if (scrollTop + clientHeight >= scrollHeight - 200) {
            state.page++;
            loadAnime(true);
        }
    });
}

// === ПЛЕЕР ===
function openPlayer(anime) {
    state.currentAnime = anime;
    state.currentEpisode = 1;

    // Переключаемся на вкладку плеера
    document.querySelector('.nav-tab[data-tab="player"]').click();

    renderPlayer();
}

function renderPlayer() {
    const playerContent = document.getElementById('playerContent');
    const anime = state.currentAnime;

    if (!anime) {
        playerContent.innerHTML = '<div class="text-center" style="padding: 40px; color: var(--text-secondary);">Выберите аниме из каталога</div>';
        return;
    }

    const totalEpisodes = anime.episodes || 12;
    const episodeOptions = Array.from({ length: totalEpisodes }, (_, i) => 
        `<option value="${i + 1}" ${i + 1 === state.currentEpisode ? 'selected' : ''}>Серия ${i + 1}</option>`
    ).join('');

    playerContent.innerHTML = `
        <div class="player-container">
            <div class="video-wrapper">
                <video id="animePlayer" controls autoplay>
                    <source src="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4" type="video/mp4">
                    Ваш браузер не поддерживает видео.
                </video>
            </div>
            <div class="player-info">
                <div class="player-title">${anime.russian || anime.name}</div>
                <div class="episode-selector">
                    <select id="episodeSelect">${episodeOptions}</select>
                    <select id="audioSelect">
                        <option>AniLibria</option>
                        <option>AniDub</option>
                        <option>Субтитры</option>
                    </select>
                </div>
                <div class="episode-controls">
                    <button class="episode-btn" id="prevEpisodeBtn" ${state.currentEpisode === 1 ? 'disabled' : ''}>← Предыдущая</button>
                    <button class="episode-btn" id="nextEpisodeBtn" ${state.currentEpisode === totalEpisodes ? 'disabled' : ''}>Следующая →</button>
                </div>
            </div>
        </div>
    `;

    setupPlayerControls();
}

function setupPlayerControls() {
    const video = document.getElementById('animePlayer');
    const episodeSelect = document.getElementById('episodeSelect');
    const prevBtn = document.getElementById('prevEpisodeBtn');
    const nextBtn = document.getElementById('nextEpisodeBtn');

    // Горячие клавиши
    document.addEventListener('keydown', (e) => {
        if (!video) return;

        switch(e.key) {
            case ' ':
                e.preventDefault();
                video.paused ? video.play() : video.pause();
                break;
            case 'ArrowLeft':
                video.currentTime -= 10;
                break;
            case 'ArrowRight':
                video.currentTime += 10;
                break;
            case 'f':
                if (video.requestFullscreen) video.requestFullscreen();
                break;
        }
    });

    // Смена серии
    episodeSelect.addEventListener('change', (e) => {
        state.currentEpisode = parseInt(e.target.value);
        renderPlayer();
    });

    prevBtn.addEventListener('click', () => {
        if (state.currentEpisode > 1) {
            state.currentEpisode--;
            renderPlayer();
        }
    });

    nextBtn.addEventListener('click', () => {
        if (state.currentEpisode < (state.currentAnime.episodes || 12)) {
            state.currentEpisode++;
            renderPlayer();
        }
    });

    // Завершение серии
    video.addEventListener('ended', async () => {
        await addXP(20);
        await addCoins(COINS_PER_EPISODE);
        showNotification(`+20 XP и +${COINS_PER_EPISODE} монет за просмотр!`);

        // Автопереход на следующую серию
        if (state.currentEpisode < (state.currentAnime.episodes || 12)) {
            setTimeout(() => {
                state.currentEpisode++;
                renderPlayer();
            }, 2000);
        }
    });
}

// === МАГАЗИН ===
function setupShop() {
    state.shopItems = [
        // Рамки
        { id: 1, type: 'frame', name: 'Золотая рамка', icon: '🖼️', price: 100, style: '4px solid gold', category: 'frames' },
        { id: 2, type: 'frame', name: 'Радужная рамка', icon: '🌈', price: 150, style: '4px solid linear-gradient(45deg, red, orange, yellow, green, blue, purple)', category: 'frames' },
        { id: 3, type: 'frame', name: 'Огненная рамка', icon: '🔥', price: 200, style: '4px solid #ff4500', category: 'frames' },
        { id: 4, type: 'frame', name: 'Ледяная рамка', icon: '❄️', price: 200, style: '4px solid #00ffff', category: 'frames' },

        // Бейджи
        { id: 5, type: 'badge', name: 'Звезда', icon: '⭐', price: 50, category: 'badges' },
        { id: 6, type: 'badge', name: 'Корона', icon: '👑', price: 100, category: 'badges' },
        { id: 7, type: 'badge', name: 'Огонь', icon: '🔥', price: 80, category: 'badges' },
        { id: 8, type: 'badge', name: 'Алмаз', icon: '💎', price: 150, category: 'badges' }
    ];

    setupShopCategories();
    renderShop();
}

function setupShopCategories() {
    const categoryBtns = document.querySelectorAll('.category-btn');
    categoryBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            categoryBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.currentCategory = btn.dataset.category;
            renderShop();
        });
    });
}

function renderShop() {
    const shopGrid = document.getElementById('shopGrid');
    const items = state.shopItems.filter(item => item.category === state.currentCategory);

    shopGrid.innerHTML = items.map(item => {
        const owned = state.user.inventory?.some(i => i.id === item.id);
        const equipped = state.user.inventory?.some(i => i.id === item.id && i.equipped);

        return `
            <div class="shop-item ${owned ? 'owned' : ''}" data-item-id="${item.id}">
                ${owned ? '<div class="owned-badge">✓ Куплено</div>' : ''}
                <div class="item-preview">
                    ${item.type === 'frame' ? `<div class="item-frame" style="border: ${item.style}"></div>` : ''}
                    <div style="font-size: 40px;">${item.icon}</div>
                </div>
                <div class="item-name">${item.name}</div>
                <div class="item-price">💰 ${item.price}</div>
                ${!owned 
                    ? `<button class="buy-btn" onclick="buyItem(${item.id})" ${state.user.coins < item.price ? 'disabled' : ''}>Купить</button>`
                    : `<button class="buy-btn" onclick="equipItem(${item.id})">${equipped ? 'Снять' : 'Надеть'}</button>`
                }
            </div>
        `;
    }).join('');
}

async function buyItem(itemId) {
    const item = state.shopItems.find(i => i.id === itemId);

    if (state.user.coins < item.price) {
        showNotification('❌ Недостаточно монет!');
        return;
    }

    state.user.coins -= item.price;
    state.user.inventory = state.user.inventory || [];
    state.user.inventory.push({ ...item, equipped: false });

    await saveUser();
    updateProfileUI();
    renderShop();
    showNotification(`✅ Куплено: ${item.name}!`);
}

async function equipItem(itemId) {
    const item = state.user.inventory.find(i => i.id === itemId);

    // Снимаем другие предметы этого типа
    state.user.inventory.forEach(i => {
        if (i.type === item.type) i.equipped = false;
    });

    // Надеваем/снимаем
    item.equipped = !item.equipped;

    await saveUser();
    updateProfileUI();
    renderShop();
}

// === ДРУЗЬЯ ===
async function loadFriends() {
    // Заглушка - можно подключить реальный список друзей
    state.friends = [
        { id: 1, username: 'Naruto_Fan', avatar: 'https://via.placeholder.com/50', level: 5, status: 'Смотрит One Piece' },
        { id: 2, username: 'Anime_Lover', avatar: 'https://via.placeholder.com/50', level: 8, status: 'Онлайн' },
        { id: 3, username: 'Otaku_Pro', avatar: 'https://via.placeholder.com/50', level: 12, status: 'Смотрит Attack on Titan' }
    ];

    renderFriends();
}

function renderFriends() {
    const friendsList = document.getElementById('friendsList');

    if (state.friends.length === 0) {
        friendsList.innerHTML = '<div class="text-center" style="padding: 40px; color: var(--text-secondary);">У вас пока нет друзей</div>';
        return;
    }

    friendsList.innerHTML = state.friends.map(friend => `
        <div class="friend-card">
            <img class="friend-avatar" src="${friend.avatar}" alt="${friend.username}">
            <div class="friend-info">
                <div class="friend-name">${friend.username} • Ур. ${friend.level}</div>
                <div class="friend-status">${friend.status}</div>
            </div>
        </div>
    `).join('');
}

// === УВЕДОМЛЕНИЯ ===
function showNotification(message) {
    tg.showAlert(message);
}

// === ЗАПУСК ===
document.addEventListener('DOMContentLoaded', () => {
    init();
    loadFriends();
});
