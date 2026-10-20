const tg = window.Telegram.WebApp;
if (tg) {
    tg.expand();
    tg.setHeaderColor('#0a0a0f');
    tg.setBackgroundColor('#0a0a0f');
}

// ==========================================
// ПРОФИЛЬ: АВАТАРКА И СТАТИСТИКА
// ==========================================
function loadProfileData() {
    const customAvatar = localStorage.getItem('onika_custom_avatar');
    const avatarEl = document.getElementById('tg-avatar');

    if (customAvatar && avatarEl) {
        avatarEl.innerHTML = `<img src="${customAvatar}" style="width: 100%; height: 100%; object-fit: cover;">`;
    } else if (avatarEl) {
        if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
            const user = tg.initDataUnsafe.user;
            if (user.photo_url) {
                avatarEl.innerHTML = `<img src="${user.photo_url}" style="width: 100%; height: 100%; object-fit: cover;">`;
            } else {
                avatarEl.innerHTML = `<span id="avatar-letter">${user.first_name[0].toUpperCase()}</span>`;
            }
        }
    }

    if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
        const user = tg.initDataUnsafe.user;
        const fullName = user.first_name + (user.last_name ? ' ' + user.last_name : '');
        const nameEl = document.getElementById('tg-name');
        if (nameEl) nameEl.textContent = fullName;
    }

    let stats = JSON.parse(localStorage.getItem('onika_stats')) || {
        episodesWatched: 0, minutesWatched: 0, daysStreak: 1, xp: 30, lastVisit: new Date().toDateString()
    };

    const today = new Date().toDateString();
    if (stats.lastVisit !== today) {
        stats.daysStreak += 1;
        stats.lastVisit = today;
        localStorage.setItem('onika_stats', JSON.stringify(stats));
    }

    const currentLevel = Math.floor(stats.xp / 100) + 1;
    const xpForNextLevel = currentLevel * 100;
    const xpCurrentLevel = stats.xp % 100;
    const progressPercent = (xpCurrentLevel / 100) * 100;

    const elLevel = document.getElementById('user-level');
    if (elLevel) elLevel.textContent = currentLevel;
    
    const elLevelText = document.getElementById('user-level-text');
    if (elLevelText) elLevelText.textContent = currentLevel;
    
    const elXpCur = document.getElementById('user-xp-current');
    if (elXpCur) elXpCur.textContent = xpCurrentLevel;
    
    const elXpNext = document.getElementById('user-xp-next');
    if (elXpNext) elXpNext.textContent = xpForNextLevel;
    
    const elXpBar = document.getElementById('user-xp-bar');
    if (elXpBar) elXpBar.style.width = `${progressPercent}%`;

    const elEp = document.getElementById('stat-episodes');
    if (elEp) elEp.textContent = stats.episodesWatched;
    
    const elMin = document.getElementById('stat-minutes');
    if (elMin) elMin.innerHTML = `${stats.minutesWatched} <span style="font-size: 14px; font-weight: normal;">мин</span>`;
    
    const elDays = document.getElementById('stat-days');
    if (elDays) elDays.textContent = stats.daysStreak;
    
    const elAchPoints = document.getElementById('ach-points');
    if (elAchPoints) elAchPoints.textContent = stats.xp;
    
    const earnedAch = Math.floor(stats.xp / 20);
    const elAchEarned = document.getElementById('ach-earned');
    if (elAchEarned) elAchEarned.textContent = earnedAch;
    
    const elAchBar = document.getElementById('ach-bar');
    if (elAchBar) elAchBar.style.width = `${(earnedAch / 108) * 100}%`;
}

function uploadCustomAvatar(input) {
    if (input.files && input.files[0]) {
        const file = input.files[0];
        const reader = new FileReader();
        
        reader.onload = function(e) {
            const img = new Image();
            img.onload = function() {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                const maxSize = 200;
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > maxSize) { height *= maxSize / width; width = maxSize; }
                } else {
                    if (height > maxSize) { width *= maxSize / height; height = maxSize; }
                }

                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(img, 0, 0, width, height);

                const compressedBase64 = canvas.toDataURL('image/jpeg', 0.8);
                localStorage.setItem('onika_custom_avatar', compressedBase64);
                loadProfileData();
                if (tg) tg.HapticFeedback.notificationOccurred('success');
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }
}

function switchProfileTab(tab) {
    const tabs = document.querySelectorAll('.tab-btn');
    const profileContent = document.getElementById('profile-content-tab');
    const settingsContent = document.getElementById('settings-content-tab');

    if (tab === 'profile') {
        tabs[0].classList.add('active');
        tabs[1].classList.remove('active');
        profileContent.style.display = 'block';
        settingsContent.style.display = 'none';
    } else {
        tabs[0].classList.remove('active');
        tabs[1].classList.add('active');
        profileContent.style.display = 'none';
        settingsContent.style.display = 'block';
    }
}

function addXP(amount) {
    let stats = JSON.parse(localStorage.getItem('onika_stats')) || { xp: 0 };
    stats.xp += amount;
    localStorage.setItem('onika_stats', JSON.stringify(stats));
    loadProfileData(); 
}

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

function playAnime(id) { 
    addXP(10);
    if (tg) tg.showAlert(`🎬 Плеер для ID: ${id}\n(+10 XP)`);
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
