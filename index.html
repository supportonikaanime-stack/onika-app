const tg = window.Telegram.WebApp;
if (tg) {
    tg.expand();
    tg.setHeaderColor('#0a0a0f');
    tg.setBackgroundColor('#0a0a0f');
}

// ==========================================
// АВТОРИЗАЦИЯ ЧЕРЕЗ TELEGRAM
// ==========================================
function initTelegramAuth() {
    if (!tg || !tg.initDataUnsafe || !tg.initDataUnsafe.user) {
        console.log("Пользователь не авторизован в Telegram");
        return;
    }

    const user = tg.initDataUnsafe.user;
    const fullName = user.first_name + (user.last_name ? ' ' + user.last_name : '');
    const username = user.username ? '@' + user.username : 'Нет юзернейма';

    // Вставляем имя
    const nameEl = document.getElementById('tg-name');
    if (nameEl) nameEl.textContent = fullName;

    // Вставляем юзернейм
    const usernameEl = document.getElementById('tg-username');
    if (usernameEl) usernameEl.textContent = username;

    // Вставляем аватарку (если есть)
    const avatarEl = document.getElementById('tg-avatar');
    if (avatarEl) {
        if (user.photo_url) {
            avatarEl.innerHTML = `<img src="${user.photo_url}" alt="avatar">`;
        } else {
            avatarEl.textContent = user.first_name[0].toUpperCase();
        }
    }
}

function switchTab(tabName, element) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    if (tabName === 'home') document.getElementById('screen-home').classList.add('active');
    if (tabName === 'profile') {
        document.getElementById('screen-profile').classList.add('active');
        initTelegramAuth(); // <-- Запускаем авторизацию при переходе в профиль
    }

    if (element) {
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        element.classList.add('active');
    }
    if (tg) tg.HapticFeedback.selectionChanged();
}

// ==========================================
// API ANILIST
// ==========================================
async function fetchAniList(query, variables = {}) {
    try {
        const response = await fetch('https://graphql.anilist.co', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ query, variables })
        });
        const data = await response.json();
        return data.data;
    } catch (e) { return null; }
}

// БАННЕР
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

    let sliderHTML = '';
    let dotsHTML = '';
    
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
                        <button class="btn-icon-heart" onclick="toggleFavorite(this)">🤍</button>
                    </div>
                </div>
            </div>`;
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
    slides.forEach(s => { s.classList.remove('active'); });
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

function toggleFavorite(btn) {
    if (btn.classList.contains('faved')) { btn.classList.remove('faved'); btn.innerHTML = '🤍'; }
    else { btn.classList.add('faved'); btn.innerHTML = '❤️'; if (tg) tg.HapticFeedback.impactOccurred('medium'); }
}

function playAnime(id) { if (tg) tg.showAlert(`🎬 Плеер для ID: ${id}`); }

// ОСТАЛЬНЫЕ СЕКЦИИ
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
    initTelegramAuth(); // Инициализируем данные при старте
});
