const tg = window.Telegram.WebApp;
if (tg) {
    tg.expand();
    tg.setHeaderColor('#0a0a0f');
    tg.setBackgroundColor('#0a0a0f');
}

function switchTab(tabName, element) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    if (tabName === 'home') document.getElementById('screen-home').classList.add('active');
    if (tabName === 'profile') document.getElementById('screen-profile').classList.add('active');

    if (element) {
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        element.classList.add('active');
    }
}

// ==========================================
// ЗАПРОСЫ К ANILIST API (БЕЗ БЛОКИРОВОК)
// ==========================================
async function fetchAniList(query, variables = {}) {
    try {
        const response = await fetch('https://graphql.anilist.co', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ query, variables })
        });
        if (!response.ok) throw new Error('Network error');
        const data = await response.json();
        return data.data;
    } catch (e) {
        console.error('Ошибка AniList:', e);
        return null;
    }
}

// ==========================================
// 1) БАННЕР
// ==========================================
let heroData = [];
let currentSlide = 0;
let slideInterval;
let touchStartX = 0;

async function loadHeroData() {
    const query = `
        query {
            Page(page: 1, perPage: 5) {
                media(type: ANIME, sort: TRENDING_DESC) {
                    id
                    title { romaji }
                    averageScore
                    coverImage { extraLarge }
                    format
                    startDate { year }
                }
            }
        }
    `;
    
    const data = await fetchAniList(query);
    
    if (data && data.Page && data.Page.media) {
        heroData = data.Page.media.map(a => ({
            id: a.id,
            title: a.title.romaji,
            img: a.coverImage.extraLarge,
            score: a.averageScore ? (a.averageScore / 10).toFixed(1) : '?',
            type: a.format || 'TV',
            year: a.startDate?.year || '?'
        }));
    } else {
        // Если AniList недоступен (маловероятно), показываем одну картинку
        heroData = [{ id: 1, title: "Ошибка загрузки API", img: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx16498-C6FPmWm59CyP.jpg", score: "8.5", type: "TV", year: "2023" }];
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
            </div>
        `;
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
    slides.forEach(s => { s.classList.remove('active'); const bg = s.querySelector('.hero-bg'); if(bg) bg.style.transition = 'none'; });
    dots.forEach(d => d.classList.remove('active'));
    slides[index].classList.add('active');
    dots[index].classList.add('active');
    const activeBg = slides[index].querySelector('.hero-bg');
    if(activeBg) setTimeout(() => { activeBg.style.transition = 'transform 8s linear'; }, 50);
    currentSlide = index;
}

function nextSlide() { currentSlide = (currentSlide + 1) % heroData.length; goToSlide(currentSlide); }
function startSlideShow() { clearInterval(slideInterval); slideInterval = setInterval(nextSlide, 5000); }
function stopSlideShow() { clearInterval(slideInterval); }

function addSwipeSupport(element) {
    element.addEventListener('touchstart', e => { touchStartX = e.changedTouches[0].screenX; stopSlideShow(); }, { passive: true });
    element.addEventListener('touchend', e => {
        const touchEndX = e.changedTouches[0].screenX;
        const diff = touchStartX - touchEndX;
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

// ==========================================
// 2) ПРОДОЛЖИТЬ ПРОСМОТР
// ==========================================
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
            </div>
        `;
    });
    container.innerHTML = html;
}

// ==========================================
// 3) ПОПУЛЯРНОЕ
// ==========================================
async function loadPopular() {
    const query = `
        query {
            Page(page: 1, perPage: 6) {
                media(type: ANIME, sort: POPULARITY_DESC) {
                    id title { romaji } coverImage { large }
                }
            }
        }
    `;
    
    const data = await fetchAniList(query);
    const container = document.getElementById('popular-list');
    if (!container) return;

    if (!data || !data.Page || !data.Page.media) {
        container.innerHTML = '<p style="color:#888; padding:0 20px;">Не удалось загрузить</p>';
        return;
    }

    let html = '';
    data.Page.media.forEach(anime => {
        html += `
            <div class="card" onclick="openAnime(${anime.id})">
                <img class="card-img" src="${anime.coverImage.large}" loading="lazy">
                <div class="card-title">${anime.title.romaji}</div>
            </div>
        `;
    });
    container.innerHTML = html;
}

// ==========================================
// 5) РЕКОМЕНДАЦИИ
// ==========================================
async function loadRecommended() {
    const query = `
        query {
            Page(page: 1, perPage: 4) {
                media(type: ANIME, sort: SCORE_DESC) {
                    id title { romaji } coverImage { large }
                }
            }
        }
    `;
    
    const data = await fetchAniList(query);
    const container = document.getElementById('recommended-list');
    if (!container) return;

    if (!data || !data.Page || !data.Page.media) {
        container.innerHTML = '<p style="color:#888;">Не удалось загрузить</p>';
        return;
    }

    let html = '';
    data.Page.media.forEach(anime => {
        html += `
            <div class="card" onclick="openAnime(${anime.id})">
                <img class="card-img" src="${anime.coverImage.large}" loading="lazy">
                <div class="card-title">${anime.title.romaji}</div>
            </div>
        `;
    });
    container.innerHTML = html;
}

function openAnime(id) { if (tg) tg.showAlert(`Открываем аниме ID: ${id}`); }

document.addEventListener('DOMContentLoaded', () => {
    loadHeroData();
    renderContinueWatching();
    loadPopular();
    loadRecommended();
});
