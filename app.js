// ==========================================
// 1. НАСТРОЙКА
// ==========================================
const PROXY_URL = 'https://onika-api.relaxdev.ru/?target=';
const SHIKIMORI_API = 'https://shikimori.io/api/graphql';
const ANILIST_API = 'https://graphql.anilist.co';

// ==========================================
// 2. SHIKIMORI
// ==========================================
async function fetchShikimori(query) {
    const res = await fetch(PROXY_URL + encodeURIComponent(SHIKIMORI_API), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'OnikaAnime/1.0' },
        body: JSON.stringify({ query })
    });
    if (!res.ok) throw new Error('Shikimori HTTP ' + res.status);
    const d = await res.json();
    if (d.errors) throw new Error(d.errors[0].message);
    return d.data;
}

async function getShikimoriAnime(limit = 10) {
    const q = `{animes(page:1, limit:${limit}, order:popularity){id name russian episodes status poster{originalUrl}}}`;
    const d = await fetchShikimori(q);
    return d.animes.map(a => ({
        id: 'shikimori_' + a.id,
        rawId: a.id,
        title: a.russian || a.name,
        episodes: a.episodes || '?',
        status: a.status === 'ongoing' ? 'Онгоинг' : a.status === 'released' ? 'Завершено' : 'Анонс',
        img: a.poster?.originalUrl || 'https://shikimori.io/assets/globals/missing_original.png',
        score: 0
    }));
}

// ==========================================
// 3. ANILIST (БЕЗОПАСНЫЙ)
// ==========================================
async function fetchAniList(query, variables = {}) {
    try {
        const res = await fetch(PROXY_URL + encodeURIComponent(ANILIST_API), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ query, variables })
        });
        if (!res.ok) throw new Error('AniList HTTP ' + res.status);
        const d = await res.json();
        if (d.errors) throw new Error(d.errors[0].message);
        return d.data;
    } catch (e) {
        console.warn('AniList недоступен:', e.message);
        return null;
    }
}

async function searchAniList(title) {
    const q = `query ($search: String) { Media (search: $search, type: ANIME) { id coverImage { extraLarge } averageScore } }`;
    const d = await fetchAniList(q, { search: title });
    return d ? d.Media : null;
}

// ==========================================
// 4. АГРЕГАТОР
// ==========================================
async function getEnrichedAnime(limit = 10) {
    const shikiItems = await getShikimoriAnime(limit);
    
    // Пытаемся обогатить каждый тайтл из AniList
    const enriched = await Promise.all(shikiItems.map(async (anime) => {
        const anilist = await searchAniList(anime.title);
        if (anilist && anilist.coverImage) {
            return {
                ...anime,
                img: anilist.coverImage.extraLarge,
                score: anilist.averageScore ? (anilist.averageScore / 10).toFixed(1) : 0
            };
        }
        return anime;
    }));
    
    return enriched;
}

// ==========================================
// 5. ОТРИСОВКА
// ==========================================
async function loadCatalogTest() {
    const grid = document.getElementById('catalog-grid');
    if (!grid) return;
    grid.innerHTML = '<div class="spinner"></div>';
    
    try {
        const items = await getEnrichedAnime(20);
        
        if (!items || items.length === 0) {
            grid.innerHTML = '<div style="color: #ff4444; text-align: center; padding: 20px;">Не удалось загрузить аниме</div>';
            return;
        }
        
        grid.innerHTML = '';
        items.forEach(anime => {
            grid.insertAdjacentHTML('beforeend', `
                <div class="catalog-card fade-in">
                    <img class="catalog-card-img" src="${anime.img}" loading="lazy">
                    <div style="position: absolute; top: 8px; right: 8px; background: rgba(0,0,0,0.7); padding: 2px 6px; border-radius: 6px; font-size: 10px; color: #ffd700; font-weight: bold;">⭐ ${anime.score}</div>
                    <div class="catalog-card-title">${anime.title}</div>
                </div>
            `);
        });
    } catch (e) {
        console.error(e);
        grid.innerHTML = `<div style="color: #ff4444; text-align: center; padding: 20px;">Ошибка: ${e.message}</div>`;
    }
}

async function loadHomeTest() {
    const slider = document.getElementById('heroSlider');
    const seasonalList = document.getElementById('seasonal-list');
    const popularList = document.getElementById('popular-list');
    
    if (slider) slider.innerHTML = '<div class="spinner"></div>';
    if (seasonalList) seasonalList.innerHTML = '<div class="spinner"></div>';
    if (popularList) popularList.innerHTML = '<div class="spinner"></div>';
    
    try {
        const items = await getEnrichedAnime(10);
        
        if (!items || items.length === 0) {
            if (slider) slider.innerHTML = '<div style="color: #ff4444; text-align: center; padding: 20px;">Не удалось загрузить</div>';
            return;
        }
        
        // Баннер
        const anime = items[0];
        if (slider) {
            slider.innerHTML = `
                <div class="hero-slide active">
                    <div class="hero-bg" style="background-image: url('${anime.img}')"></div>
                    <div class="hero-gradient"></div>
                    <div class="hero-content">
                        <div class="hero-badges">
                            <span class="badge star">⭐ ${anime.score}</span>
                            <span class="badge">${anime.status}</span>
                        </div>
                        <h1 class="hero-title">${anime.title}</h1>
                        <div class="hero-actions">
                            <button class="btn-primary">▶ Смотреть</button>
                        </div>
                    </div>
                </div>
            `;
        }
        
        // Секции
        const renderCards = (list) => list.map(a => `
            <div class="card">
                <img class="card-img" src="${a.img}" loading="lazy">
                <div class="card-title">${a.title}</div>
            </div>
        `).join('');
        
        if (seasonalList) seasonalList.innerHTML = renderCards(items.slice(0, 5));
        if (popularList) popularList.innerHTML = renderCards(items.slice(5, 10));
        
    } catch (e) {
        console.error(e);
        if (slider) slider.innerHTML = `<div style="color: #ff4444; text-align: center; padding: 20px;">Ошибка: ${e.message}</div>`;
    }
}

// ==========================================
// 6. ЗАПУСК
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    loadHomeTest();
    loadCatalogTest();
});
