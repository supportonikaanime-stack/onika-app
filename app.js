const tg = window.Telegram.WebApp;
if (tg) {
    tg.expand();
    tg.setHeaderColor('#0a0a0f');
    tg.setBackgroundColor('#0a0a0f');
}

// ==========================================
// 50 ДОСТИЖЕНИЙ
// ==========================================
const ACHIEVEMENTS = [
    { id: 1, name: "Первый шаг", desc: "Зарегистрироваться на сайте", icon: "🚀", check: (s) => true },
    { id: 2, name: "Дебютный просмотр", desc: "Посмотреть первый эпизод", icon: "🎬", check: (s) => s.episodesWatched >= 1 },
    { id: 3, name: "Марафонец", desc: "Посмотреть 10 эпизодов за день", icon: "🏃", check: (s) => s.episodesWatched >= 10 },
    { id: 4, name: "Ночной страж", desc: "Посмотреть аниме после 3:00", icon: "🌙", check: () => { let h = new Date().getHours(); return h >= 3 && h < 6; } },
    { id: 5, name: "Субтитр-мастер", desc: "50 тайтлов с субтитрами", icon: "📝", check: () => false },
    { id: 6, name: "Дубляжный фанат", desc: "25 тайтлов в озвучке", icon: "🎙️", check: () => false },
    { id: 7, name: "Первый отзыв", desc: "Написать первую рецензию", icon: "✍️", check: () => false },
    { id: 8, name: "Критик", desc: "Написать 10 рецензий", icon: "📚", check: () => false },
    { id: 9, name: "Мастер слова", desc: "100 лайков на рецензиях", icon: "👏", check: () => false },
    { id: 10, name: "Коллекционер", desc: "50 тайтлов в 'Буду смотреть'", icon: "📁", check: () => false },
    { id: 11, name: "Завершитель", desc: "Досмотреть 100 тайтлов", icon: "✅", check: () => false },
    { id: 12, name: "Бросивший вызов", desc: "Дропнуть 10 тайтлов", icon: "🚫", check: () => false },
    { id: 13, name: "Оценщик", desc: "Поставить 100 оценок", icon: "⭐", check: () => false },
    { id: 14, name: "Перфекционист", desc: "Поставить 50 десяток", icon: "🔟", check: () => false },
    { id: 15, name: "Щедрый критик", desc: "Поставить 50 низких оценок", icon: "📉", check: () => false },
    { id: 16, name: "Сезонный охотник", desc: "5 онгоингов одного сезона", icon: "🏹", check: () => false },
    { id: 17, name: "Онгоинг-воин", desc: "Дождаться финала 10 онгоингов", icon: "🛡️", check: () => false },
    { id: 18, name: "Спойлер-детектор", desc: "Отметить 20 спойлеров", icon: "🕵️", check: () => false },
    { id: 19, name: "Хранитель порядка", desc: "50 репутационных плюсов", icon: "⚖️", check: () => false },
    { id: 20, name: "Душа компании", desc: "Оставить 100 комментариев", icon: "💬", check: () => false },
    { id: 21, name: "Общительный отаку", desc: "100 ответов на комментарии", icon: "🗣️", check: () => false },
    { id: 22, name: "Творец", desc: "Создать первый пост", icon: "🎨", check: () => false },
    { id: 23, name: "Летописец", desc: "Опубликовать 10 постов", icon: "📜", check: () => false },
    { id: 24, name: "Мем-лорд", desc: "Загрузить 10 мемов", icon: "😂", check: () => false },
    { id: 25, name: "Художник", desc: "Загрузить первый фанарт", icon: "🖌️", check: () => false },
    { id: 26, name: "Галерист", desc: "Загрузить 25 фанартов", icon: "🖼️", check: () => false },
    { id: 27, name: "Косплеер", desc: "Загрузить фото косплея", icon: "📸", check: () => false },
    { id: 28, name: "Первый друг", desc: "Добавить первого друга", icon: "🤝", check: () => false },
    { id: 29, name: "Социальная бабочка", desc: "Иметь 50 друзей", icon: "🦋", check: () => false },
    { id: 30, name: "Популярная личность", desc: "100 подписчиков", icon: "🌟", check: () => false },
    { id: 31, name: "Ранняя пташка", desc: "Зайти до 7:00", icon: "🌅", check: () => { let h = new Date().getHours(); return h >= 5 && h < 7; } },
    { id: 32, name: "Полуночник", desc: "Зайти после 2:00", icon: "🌌", check: () => { let h = new Date().getHours(); return h >= 0 && h < 3; } },
    { id: 33, name: "Ежедневный визит", desc: "Заходить 7 дней подряд", icon: "📅", check: (s) => s.daysStreak >= 7 },
    { id: 34, name: "Преданный фанат", desc: "Заходить 30 дней подряд", icon: "🔥", check: (s) => s.daysStreak >= 30 },
    { id: 35, name: "Верность сайту", desc: "Заходить 365 дней подряд", icon: "💎", check: (s) => s.daysStreak >= 365 },
    { id: 36, name: "Первый уровень", desc: "Достичь 10 уровня", icon: "🎖️", check: (s) => Math.floor(s.xp / 100) + 1 >= 10 },
    { id: 37, name: "Опытный пользователь", desc: "Достичь 50 уровня", icon: "🏅", check: (s) => Math.floor(s.xp / 100) + 1 >= 50 },
    { id: 38, name: "Вершина Олимпа", desc: "Достичь 100 уровня", icon: "👑", check: (s) => Math.floor(s.xp / 100) + 1 >= 100 },
    { id: 39, name: "Жанровый гурман", desc: "10 тайтлов в 5 жанрах", icon: "🍽️", check: () => false },
    { id: 40, name: "Всеядный", desc: "Тайтлы во всех жанрах", icon: "🌍", check: () => false },
    { id: 41, name: "Романтик", desc: "30 романтических тайтлов", icon: "💖", check: () => false },
    { id: 42, name: "Экшн-мастер", desc: "30 экшн-тайтлов", icon: "⚔️", check: () => false },
    { id: 43, name: "Комедиант", desc: "30 комедий", icon: "😆", check: () => false },
    { id: 44, name: "Хоррор-смельчак", desc: "15 ужасов", icon: "👻", check: () => false },
    { id: 45, name: "Слёзный ручей", desc: "10 драматических тайтлов", icon: "😭", check: () => false },
    { id: 46, name: "Исэкай-путешественник", desc: "20 исэкаев", icon: "🌀", check: () => false },
    { id: 47, name: "Меха-пилот", desc: "15 меха-тайтлов", icon: "🤖", check: () => false },
    { id: 48, name: "Ретро-фанат", desc: "10 тайтлов старше 2000", icon: "📼", check: () => false },
    { id: 49, name: "Новинкоман", desc: "10 тайтлов года выхода", icon: "🆕", check: () => false },
    { id: 50, name: "Легенда сайта", desc: "Выполнить все достижения", icon: "🏆", check: () => false }
];

// ==========================================
// 100 УРОВНЕЙ (ЗВАНИЙ)
// ==========================================
const LEVEL_TITLES = [
    "Первый эпизод", "Любопытный зритель", "Случайный странник", "Ученик манги", "Читатель субтитров",
    "Собиратель тайтлов", "Ночной марафонец", "Ценитель опенингов", "Знаток сейю", "Ловец спойлеров",
    "Страж таймлайна", "Искатель шедевров", "Коллекционер жанров", "Следопыт сезона", "Архивариус эпизодов",
    "Пилот меха", "Ученик додзё", "Начинающий маг", "Дух сакуры", "Странник измерений",
    "Хранитель клинка", "Проводник сюжета", "Алхимик эмоций", "Писец рецензий", "Охотник за онгоингами",
    "Мастер бинджвотча", "Сэнпай сайта", "Хранитель лора", "Ткач теорий", "Лунный самурай",
    "Небесный курьер", "Хранитель опенингов", "Повелитель плейлистов", "Критик с катаной", "Мудрец субтитров",
    "Дубляжный маг", "Страж спойлеров", "Картограф арок", "Коллекционер аватарок", "Ловец редких тайтлов",
    "Хроникёр сезонов", "Мастер клиффхэнгеров", "Дуэлянт мнений", "Хранитель уютного уголка", "Рыцарь романтики",
    "Тень сёнэна", "Адепт исэкая", "Архимаг тайтлов", "Небесный отаку", "Странник по мирам",
    "Хранитель легенд", "Мастер сюжетных поворотов", "Голос фандома", "Судья сезона", "Хранитель аниме-реликвий",
    "Пилот звёздного поезда", "Лунный библиотекарь", "Самурай субботы", "Повелитель финальных титров", "Искатель скрытых жемчужин",
    "Маг рекомендаций", "Страж уютных вечеров", "Рыцарь онгоинга", "Дух обсуждений", "Хранитель мемов",
    "Мастер аниме-детектива", "Небесный критик", "Повелитель сезонных марафонов", "Хранитель канона", "Ткач фанфиков",
    "Оракул спойлеров", "Лунный сэнпай", "Самурай рейтингов", "Архивариус легенд", "Маг жанров",
    "Страж ночных просмотров", "Повелитель опенингов", "Хранитель тропов", "Рыцарь вечернего просмотра", "Дух фестиваля",
    "Мастер эмоциональных качелей", "Следопыт забытых тайтлов", "Хранитель аниме-хроник", "Небесный администратор", "Самурай финального эпизода",
    "Оракул сезонов", "Повелитель легендарных арок", "Хранитель аниме-вселенной", "Маг идеального топа", "Дух великого марафона",
    "Рыцарь вечного онгоинга", "Архимаг фандома", "Страж золотой коллекции", "Легенда аниме-сайта", "Небесный хранитель тайтлов",
    "Великий отаку-владыка", "Хранитель последнего эпизода", "Мастер пересмотров", "Дух аниме-сообщества", "Верховный хранитель сезонов"
];

// ==========================================
// СИСТЕМА СБРОСА СТАРЫХ БАГОВ
// ==========================================
// Если в LocalStorage есть старые данные (с багом), мы их сбрасываем
if (localStorage.getItem('onika_stats_v2') === null) {
    localStorage.removeItem('onika_stats'); // Удаляем старый кэш
    localStorage.setItem('onika_stats_v2', 'clean'); // Ставим метку, что кэш обновлен
}

// ==========================================
// СИСТЕМА УРОВНЕЙ И СТАТИСТИКИ
// ==========================================
function getStats() {
    let stats = JSON.parse(localStorage.getItem('onika_stats'));
    if (!stats) {
        stats = {
            episodesWatched: 0, minutesWatched: 0, daysStreak: 1, xp: 0, lastVisit: new Date().toDateString(), 
            unlockedAchievements: [], 
            favedAnime: [], 
            watchedToday: [] 
        };
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
                showToast(`🏆 Достижение: ${ach.name}!`);
            }
        }
    });
    if (changed) saveStats(stats);
}

function loadProfileData() {
    const customAvatar = localStorage.getItem('onika_custom_avatar');
    const avatarEl = document.getElementById('tg-avatar');
    if (avatarEl) {
        if (customAvatar) avatarEl.innerHTML = `<img src="${customAvatar}">`;
        else if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
            const user = tg.initDataUnsafe.user;
            if (user.photo_url) avatarEl.innerHTML = `<img src="${user.photo_url}">`;
            else avatarEl.innerHTML = `<span>${user.first_name[0].toUpperCase()}</span>`;
        }
    }

    if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
        const user = tg.initDataUnsafe.user;
        const nameEl = document.getElementById('tg-name');
        if (nameEl) nameEl.textContent = user.first_name + (user.last_name ? ' ' + user.last_name : '');
    }

    let stats = getStats();

    const today = new Date().toDateString();
    if (stats.lastVisit !== today) {
        stats.daysStreak += 1;
        stats.lastVisit = today;
        stats.xp += 50;
        stats.watchedToday = [];
        saveStats(stats);
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
    setElHTML('stat-minutes', `${stats.minutesWatched} <span style="font-size: 14px; font-weight: normal;">мин</span>`);
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

// ==========================================
// UI ФУНКЦИИ
// ==========================================
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
                if (width > height) { if (width > maxSize) { height *= maxSize / width; width = maxSize; } }
                else { if (height > maxSize) { width *= maxSize / height; height = maxSize; } }
                canvas.width = width; canvas.height = height;
                ctx.drawImage(img, 0, 0, width, height);
                localStorage.setItem('onika_custom_avatar', canvas.toDataURL('image/jpeg', 0.8));
                loadProfileData();
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
    }
}

function openLevelModal() { document.getElementById('levelModal').classList.add('active'); }

function openAchievementsModal() {
    const stats = getStats();
    const container = document.getElementById('achievements-list-container');
    let html = '';
    ACHIEVEMENTS.forEach(ach => {
        const isDone = stats.unlockedAchievements.includes(ach.id);
        html += `
            <div class="ach-list-item ${isDone ? 'completed' : ''}">
                <div class="ach-list-icon">${ach.icon}</div>
                <div class="ach-list-info">
                    <h4>${ach.name}</h4>
                    <p>${ach.desc}</p>
                </div>
                ${isDone ? '<div style="color:#ffd700; font-weight:bold;">✓</div>' : ''}
            </div>
        `;
    });
    container.innerHTML = html;
    document.getElementById('achievementsModal').classList.add('active');
}

function closeModal(id) { document.getElementById(id).classList.remove('active'); }

function switchTab(tabName, element) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    if (tabName === 'home') document.getElementById('screen-home').classList.add('active');
    if (tabName === 'profile') {
        document.getElementById('screen-profile').classList.add('active');
        loadProfileData();
    }
    if (element) {
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        element.classList.add('active');
    }
}

// ==========================================
// API ANILIST
// ==========================================
async function fetchAniList(query, variables = {}) {
    try {
        const response = await fetch('https://graphql.anilist.co', {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ query, variables })
        });
        const data = await response.json();
        return data.data;
    } catch (e) { return null; }
}

let heroData = [];
let currentSlide = 0;
let slideInterval;

async function loadHeroData() {
    const query = `{ Page(page: 1, perPage: 5) { media(type: ANIME, sort: TRENDING_DESC) { id title { romaji } averageScore coverImage { extraLarge } format startDate { year } } } }`;
    const data = await fetchAniList(query);
    if (data && data.Page) {
        heroData = data.Page.media.map(a => ({
            id: a.id, title: a.title.romaji, img: a.coverImage.extraLarge,
            score: a.averageScore ? (a.averageScore / 10).toFixed(1) : '?',
            type: a.format || 'TV', year: a.startDate?.year || '?'
        }));
    }
    initHeroSlider();
}

function initHeroSlider() {
    const slider = document.getElementById('heroSlider');
    const dotsContainer = document.getElementById('heroDots');
    if (!slider || heroData.length === 0) return;
    let sliderHTML = '', dotsHTML = '';
    heroData.forEach((anime, index) => {
        sliderHTML += `
            <div class="hero-slide ${index === 0 ? 'active' : ''}">
                <div class="hero-bg" style="background-image: url('${anime.img}')"></div>
                <div class="hero-gradient"></div>
                <div class="hero-content">
                    <div class="hero-badges">
                        <span class="badge star">⭐ ${anime.score}</span>
                        <span class="badge">${anime.type}</span>
                        <span class="badge">${anime.year}</span>
                    </div>
                    <h1 class="hero-title">${anime.title}</h1>
                    <div class="hero-actions">
                        <button class="btn-primary" onclick="playAnime(${anime.id})">▶ Смотреть</button>
                        <!-- Передаем ID аниме в функцию -->
                        <button class="btn-icon-heart" onclick="toggleFavorite(this, ${anime.id})">🤍</button>
                    </div>
                </div>
            </div>`;
        dotsHTML += `<div class="hero-dot ${index === 0 ? 'active' : ''}" onclick="goToSlide(${index})"></div>`;
    });
    slider.innerHTML = sliderHTML; dotsContainer.innerHTML = dotsHTML;
    startSlideShow(); addSwipeSupport(slider);
}

function goToSlide(index) {
    const slides = document.querySelectorAll('.hero-slide'); const dots = document.querySelectorAll('.hero-dot');
    slides.forEach(s => { s.classList.remove('active'); }); dots.forEach(d => d.classList.remove('active'));
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
        if (diff > 50) nextSlide();
        else if (diff < -50) { currentSlide = (currentSlide - 1 + heroData.length) % heroData.length; goToSlide(currentSlide); }
        startSlideShow();
    }, { passive: true });
}

// ==========================================
// ИСПРАВЛЕННЫЙ БАГ С ЛАЙКОМ
// ==========================================
function toggleFavorite(btn, animeId) {
    let stats = getStats();
    const isFaved = stats.favedAnime.includes(animeId);

    if (isFaved) {
        // Если уже лайкнуто -> убираем лайк (XP не даем)
        btn.classList.remove('faved'); 
        btn.innerHTML = '🤍';
        stats.favedAnime = stats.favedAnime.filter(id => id !== animeId);
        saveStats(stats);
    } else {
        // Если не лайкнуто -> ставим лайк и даем +10 XP
        btn.classList.add('faved'); 
        btn.innerHTML = '❤️';
        stats.favedAnime.push(animeId);
        saveStats(stats);
        addXP(10);
    }
}

// ==========================================
// ИСПРАВЛЕННЫЙ БАГ С ПРОСМОТРОМ
// ==========================================
function playAnime(id) { 
    let stats = getStats();
    const today = new Date().toDateString();

    if (stats.watchedToday.includes(id)) {
        if (tg) tg.showAlert(`🎬 Плеер для ID: ${id}\n(Вы уже получали XP за этот эпизод сегодня)`);
        return;
    }

    addXP(20);
    stats.episodesWatched += 1;
    stats.minutesWatched += 24;
    stats.watchedToday.push(id);
    saveStats(stats);

    if (tg) tg.showAlert(`🎬 Плеер для ID: ${id}\n(+20 XP, +1 серия)`);
}

function renderContinueWatching() {
    const container = document.getElementById('continue-list');
    if (!container) return;
    const data = [
        { id: 1, title: "Тетрадь смерти", img: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx1535-C1j7R4w7G6kF.jpg", ep: 5, total: 37 },
        { id: 2, title: "Ван-Пис", img: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx21-YBz8x3z7R4w7.jpg", ep: 150, total: 1000 }
    ];
    let html = '';
    data.forEach(anime => {
        const percent = Math.round((anime.ep / anime.total) * 100);
        html += `
            <div class="continue-card" onclick="playAnime(${anime.id})">
                <img class="continue-card-img" src="${anime.img}">
                <div class="continue-card-info">
                    <div class="continue-card-title">${anime.title}</div>
                    <div>
                        <div class="continue-card-ep">Серия ${anime.ep} из ${anime.total}</div>
                        <div class="continue-progress-bar"><div class="continue-progress-fill" style="width: ${percent}%"></div></div>
                    </div>
                </div>
            </div>`;
    });
    container.innerHTML = html;
}

async function loadPopular() {
    const query = `{ Page(page: 1, perPage: 6) { media(type: ANIME, sort: POPULARITY_DESC) { id title { romaji } coverImage { large } } } }`;
    const data = await fetchAniList(query);
    const container = document.getElementById('popular-list');
    if (!data || !data.Page) return;
    container.innerHTML = data.Page.media.map(anime => `
        <div class="card" onclick="playAnime(${anime.id})">
            <img class="card-img" src="${anime.coverImage.large}" loading="lazy">
            <div class="card-title">${anime.title.romaji}</div>
        </div>`).join('');
}

async function loadRecommended() {
    const query = `{ Page(page: 1, perPage: 4) { media(type: ANIME, sort: SCORE_DESC) { id title { romaji } coverImage { large } } } }`;
    const data = await fetchAniList(query);
    const container = document.getElementById('recommended-list');
    if (!data || !data.Page) return;
    container.innerHTML = data.Page.media.map(anime => `
        <div class="card" onclick="playAnime(${anime.id})">
            <img class="card-img" src="${anime.coverImage.large}" loading="lazy">
            <div class="card-title">${anime.title.romaji}</div>
        </div>`).join('');
}

document.addEventListener('DOMContentLoaded', () => {
    loadHeroData();
    renderContinueWatching();
    loadPopular();
    loadRecommended();
    loadProfileData();
});
