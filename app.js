// ==========================================
// 1. НАСТРОЙКА SUPABASE (ТОЛЬКО ДЛЯ АВТОРИЗАЦИИ)
// ==========================================
const SUPABASE_URL = 'https://wsaykqhojwfhpqzxptke.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndzYXlrcWhvandmaHBxenhwdGtlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1MzAxMDgsImV4cCI6MjEwODEwNjEwOH0.6eHuhYt2CyVvIurt-TW3MgP4VE0kzv39vqVHwskodLk';

let supabaseClient = null;
try {
    if (window.supabase) supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
} catch(e) { console.error('Ошибка Supabase:', e); }

// Временные данные (не из базы)
let MY_NAME = 'Гость', MY_PHOTO_URL = '';
let ACTIVE_BANNER_URL = '';

// ==========================================
// 2. УПРОЩЕННЫЙ API (ТОЛЬКО SHIKIMORI, БЕЗ БАЗЫ)
// ==========================================
const PROXY_URL = 'https://onika-api.relaxdev.ru/?target=';

const API_Shikimori = {
    BASE_URL: 'https://shikimori.io/api/graphql',
    async fetchGraphQL(query) {
        const res = await fetch(PROXY_URL + encodeURIComponent(this.BASE_URL), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'User-Agent': 'OnikaAnime/1.0' },
            body: JSON.stringify({ query })
        });
        if (!res.ok) throw new Error('Shikimori HTTP ' + res.status);
        const d = await res.json();
        if (d.errors) throw new Error('Shikimori: ' + d.errors[0].message);
        return d.data;
    },
    async getCatalog(page, limit, filters) {
        let args = [`page:${page}`, `limit:${limit}`, `order:popularity`];
        if (filters.search) args.push(`search:"${filters.search.replace(/"/g, '')}"`);
        const q = `{animes(${args.join(',')}){id name russian episodes status poster{originalUrl}}}`;
        const d = await this.fetchGraphQL(q);
        return d.animes.map(this.convert);
    },
    async getDetails(id) {
        const cleanId = String(id).replace('shikimori_', '');
        const q = `{animes(ids:"${cleanId}",limit:1){id name russian description episodes status poster{originalUrl}}}`;
        const d = await this.fetchGraphQL(q);
        return d.animes.length > 0 ? this.convert(d.animes[0]) : null;
    },
    convert(a) {
        return {
            id: 'shikimori_' + a.id, rawId: a.id,
            title: a.russian || a.name || 'Без названия',
            description: a.description || 'Описание отсутствует.',
            episodes: a.episodes || '?',
            status: a.status === 'ongoing' ? 'Онгоинг' : a.status === 'released' ? 'Завершено' : 'Анонс',
            images: { jpg: { image_url: a.poster?.originalUrl || 'https://shikimori.io/assets/globals/missing_original.png' } }, 
            score: 0
        };
    }
};

// ==========================================
// 3. ИНИЦИАЛИЗАЦИЯ ГЛАВНОЙ И КАТАЛОГА (БЕЗ БАЗЫ)
// ==========================================
async function loadCatalog(reset = false) {
    const grid = document.getElementById('catalog-grid');
    if (!grid) return;
    if (reset) grid.innerHTML = '<div class="spinner"></div>';
    
    try {
        const items = await API_Shikimori.getCatalog(1, 30, {});
        grid.innerHTML = '';
        items.forEach(anime => {
            grid.insertAdjacentHTML('beforeend', `<div class="catalog-card fade-in" onclick="alert('ID: ${anime.id}')"><img class="catalog-card-img" src="${anime.images.jpg.image_url}" loading="lazy"><div class="catalog-card-title">${anime.title}</div></div>`);
        });
    } catch (e) {
        grid.innerHTML = `<div style="color: #ff4444; text-align: center; padding: 20px;">Ошибка: ${e.message}</div>`;
    }
}

async function loadHomePage() {
    const heroSlider = document.getElementById('heroSlider');
    const seasonalList = document.getElementById('seasonal-list');
    const popularList = document.getElementById('popular-list');
    
    if (heroSlider) heroSlider.innerHTML = '<div class="spinner"></div>';
    if (seasonalList) seasonalList.innerHTML = '<div class="spinner"></div>';
    if (popularList) popularList.innerHTML = '<div class="spinner"></div>';

    try {
        // Просто грузим популярное
        const items = await API_Shikimori.getCatalog(1, 10, {});
        
        if (heroSlider && items.length > 0) {
            const anime = items[0];
            heroSlider.innerHTML = `
                <div class="hero-slide active">
                    <div class="hero-bg" style="background-image: url('${anime.images.jpg.image_url}')"></div>
                    <div class="hero-gradient"></div>
                    <div class="hero-content">
                        <h1 class="hero-title">${anime.title}</h1>
                        <div class="hero-actions">
                            <button class="btn-primary" onclick="alert('ID: ${anime.id}')">▶ Смотреть</button>
                        </div>
                    </div>
                </div>`;
        }

        if (seasonalList && items.length > 0) {
            seasonalList.innerHTML = items.slice(0, 5).map(anime => `<div class="card"><img class="card-img" src="${anime.images.jpg.image_url}"><div class="card-title">${anime.title}</div></div>`).join('');
        }

        if (popularList && items.length > 0) {
            popularList.innerHTML = items.slice(5, 10).map(anime => `<div class="card"><img class="card-img" src="${anime.images.jpg.image_url}"><div class="card-title">${anime.title}</div></div>`).join('');
        }

    } catch (e) {
        if (heroSlider) heroSlider.innerHTML = `<div style="color: #ff4444; text-align: center; padding: 20px;">Ошибка: ${e.message}</div>`;
    }
}

// ==========================================
// 4. ЗАПУСК ПРИ ЗАГРУЗКЕ
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    loadHomePage();
    loadCatalog(true);
});
