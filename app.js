const tg = window.Telegram.WebApp;
if (tg) {
    tg.expand();
    tg.setHeaderColor('#0a0a0f');
    tg.setBackgroundColor('#0a0a0f');
}

// ==========================================
// ⚙️ НАСТРОЙКИ ПРОКСИ (Если не работает, поменяйте на второй)
// ==========================================
// Вариант 1 (основной)
const PROXY_URL = 'https://corsproxy.io/?https://shikimori.one/api/graphql';
// Вариант 2 (запасной, если первый выдаст ошибку)
// const PROXY_URL = 'https://api.allorigins.win/raw?url=https://shikimori.one/api/graphql';

function switchTab(tabName, element) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    if (tabName === 'home') document.getElementById('screen-home').classList.add('active');
    if (tabName === 'profile') document.getElementById('screen-profile').classList.add('active');

    if (element) {
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        element.classList.add('active');
    }
    if (tg) tg.HapticFeedback.selectionChanged();
}

// ==========================================
// ФУНКЦИЯ ЗАПРОСА К SHIKIMORI (ЧЕРЕЗ ПРОКСИ)
// ==========================================
async function fetchShikimori(query) {
    try {
        const response = await fetch(PROXY_URL, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ query })
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        if (data.errors) {
            console.error('GraphQL Ошибка:', data.errors);
            return null;
        }
        return data.data;
    } catch (e) {
        console.error('Ошибка сети (Прокси):', e);
        return null;
    }
}

// ==========================================
// 1) БАННЕР (Реальные данные)
// ==========================================
let heroData = [];
let currentSlide = 0;
let slideInterval;
let touchStartX = 0;

async function loadHeroData() {
    const query = `{
        animes(page: 1, limit: 3, order: ranked) {
            id
            name
            russian
            score
            kind
            airedOn { year }
            poster { originalUrl }
        }
    }`;
    
    const data = await fetchShikimori(query);
    
    // Если прокси не сработал, показываем заглушку
    if (!data || !data.animes) {
        console.warn('API не ответил, показываем тестовые данные');
        heroData = [
            { id: 42310, title: "Киберпанк: Бегущие по краю", img: "https://shikimori.one/system/animes/original/42310.jpg", score: "8.9", type: "ТВ", year: "2022" },
            { id: 16498, title: "Атака Титанов", img: "https://shikimori.one/system/animes/original/16498.jpg", score: "8.6", type: "ТВ", year: "2013" }
        ];
    } else {
        heroData = data.animes.map(a => ({
            id: a.id,
            title: a.russian || a.name,
            img: a.poster?.originalUrl || '',
            score: a.score ? a.score.toFixed(1) : '?',
            type: a.kind || 'ТВ',
            year: a.airedOn?.year || '?'
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
            <div class="hero-slide ${index === 0 ? 'active' : ''}" data-id="${anime.id}">
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
// 2) ПРОДОЛЖИТЬ ПРОСМОТР (Тест)
// ==========================================
function renderContinueWatching() {
    const container = document.getElementById('continue-list');
    if (!container) return;
    const data = [
        { id: 1, title: "Тетрадь смерти", img: "https://shikimori.one/system/animes/original/1535.jpg", ep: 5, total: 37 },
        { id: 2, title: "Ван-Пис", img: "https://shikimori.one/system/animes/original/21.jpg", ep: 150, total: 1000 }
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
// 3) ПОПУЛЯРНОЕ (Реальные данные)
// ==========================================
async function loadPopular() {
    const query = `{
        animes(page: 1, limit: 6, order: popularity) {
            id
            name
            russian
            poster { originalUrl }
        }
    }`;
    
    const data = await fetchShikimori(query);
    const container = document.getElementById('popular-list');
    if (!container) return;

    if (!data || !data.animes) {
        container.innerHTML = '<p style="color:#888; padding:0 20px;">Не удалось загрузить</p>';
        return;
    }

    let html = '';
    data.animes.forEach(anime => {
        html += `
            <div class="card" onclick="openAnime(${anime.id})">
                <img class="card-img" src="${anime.poster?.originalUrl || ''}" loading="lazy">
                <div class="card-title">${anime.russian || anime.name}</div>
            </div>
        `;
    });
    container.innerHTML = html;
}

// ==========================================
// 5) РЕКОМЕНДАЦИИ (Реальные данные)
// ==========================================
async function loadRecommended() {
    const query = `{
        animes(page: 2, limit: 4, order: ranked) {
            id
            name
            russian
            poster { originalUrl }
        }
    }`;
    
    const data = await fetchShikimori(query);
    const container = document.getElementById('recommended-list');
    if (!container) return;

    if (!data || !data.animes) {
        container.innerHTML = '<p style="color:#888;">Не удалось загрузить</p>';
        return;
    }

    let html = '';
    data.animes.forEach(anime => {
        html += `
            <div class="card" onclick="openAnime(${anime.id})">
                <img class="card-img" src="${anime.poster?.originalUrl || ''}" loading="lazy">
                <div class="card-title">${anime.russian || anime.name}</div>
            </div>
        `;
    });
    container.innerHTML = html;
}

function openAnime(id) { if (tg) tg.showAlert(`Открываем аниме ID: ${id}`); }

// Запуск
document.addEventListener('DOMContentLoaded', () => {
    loadHeroData();
    renderContinueWatching();
    loadPopular();
    loadRecommended();
});
