// ==========================================
// 1. ТЕСТОВЫЙ ЗАПРОС К SHIKIMORI
// ==========================================
const PROXY_URL = 'https://onika-api.relaxdev.ru/?target=';
const SHIKIMORI_API = 'https://shikimori.io/api/graphql';

async function testFetch() {
    const query = `{animes(page:1, limit:10, order:popularity){id name russian poster{originalUrl}}}`;
    
    try {
        const response = await fetch(PROXY_URL + encodeURIComponent(SHIKIMORI_API), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'User-Agent': 'OnikaAnime/1.0' },
            body: JSON.stringify({ query })
        });
        
        if (!response.ok) throw new Error(`HTTP ошибка: ${response.status}`);
        
        const data = await response.json();
        console.log("Ответ от Shikimori:", data);
        
        if (data.errors) throw new Error(data.errors[0].message);
        
        return data.data.animes;
    } catch (e) {
        console.error("Ошибка запроса:", e);
        alert("Ошибка подключения к Shikimori: " + e.message);
        return [];
    }
}

// ==========================================
// 2. ОТРИСОВКА КАТАЛОГА
// ==========================================
async function loadCatalogTest() {
    const grid = document.getElementById('catalog-grid');
    if (!grid) return;
    grid.innerHTML = '<div class="spinner"></div>';
    
    const items = await testFetch();
    
    if (!items || items.length === 0) {
        grid.innerHTML = '<div style="color: #ff4444; text-align: center; padding: 20px;">Не удалось загрузить аниме</div>';
        return;
    }
    
    grid.innerHTML = '';
    items.forEach(anime => {
        const title = anime.russian || anime.name;
        const img = anime.poster?.originalUrl || 'https://shikimori.io/assets/globals/missing_original.png';
        
        grid.insertAdjacentHTML('beforeend', `
            <div class="catalog-card fade-in">
                <img class="catalog-card-img" src="${img}" loading="lazy">
                <div class="catalog-card-title">${title}</div>
            </div>
        `);
    });
}

// ==========================================
// 3. ОТРИСОВКА ГЛАВНОЙ (БАННЕР)
// ==========================================
async function loadHomeTest() {
    const slider = document.getElementById('heroSlider');
    if (!slider) return;
    slider.innerHTML = '<div class="spinner"></div>';
    
    const items = await testFetch();
    
    if (!items || items.length === 0) {
        slider.innerHTML = '<div style="color: #ff4444; text-align: center; padding: 20px;">Не удалось загрузить баннер</div>';
        return;
    }
    
    const anime = items[0];
    const title = anime.russian || anime.name;
    const img = anime.poster?.originalUrl || 'https://shikimori.io/assets/globals/missing_original.png';
    
    slider.innerHTML = `
        <div class="hero-slide active">
            <div class="hero-bg" style="background-image: url('${img}')"></div>
            <div class="hero-gradient"></div>
            <div class="hero-content">
                <h1 class="hero-title">${title}</h1>
                <div class="hero-actions">
                    <button class="btn-primary">▶ Смотреть</button>
                </div>
            </div>
        </div>
    `;
}

// ==========================================
// 4. ЗАПУСК
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    loadHomeTest();
    loadCatalogTest();
});
