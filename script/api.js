// ============================================
// API МОДУЛЬ ONIKAANIME — SHIKIMORI (GraphQL + REST)
// ============================================

const API = {
    SHIKIMORI_PROXY: '/api/shikimori',
    SHIKIMORI_REST: '/api/shikimori-rest',

    _cache: new Map(),
    _cacheTTL: 15 * 60 * 1000,

    // ===== БАЗОВЫЙ GRAPHQL ЗАПРОС =====
    async _graphql(query, useCache = true, cacheKey = null) {
        const key = cacheKey || query;

        if (useCache && this._cache.has(key)) {
            const cached = this._cache.get(key);
            if (Date.now() - cached.time < this._cacheTTL) {
                return cached.data;
            }
            this._cache.delete(key);
        }

        try {
            const response = await fetch(this.SHIKIMORI_PROXY, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query })
            });

            if (!response.ok) {
                throw new Error('Proxy HTTP ' + response.status);
            }

            const data = await response.json();

            if (data.errors) {
                console.error('❌ GraphQL errors:', JSON.stringify(data.errors));
                throw new Error(data.errors[0]?.message || 'GraphQL error');
            }

            if (useCache && data.data) {
                this._cache.set(key, { data: data.data, time: Date.now() });
            }

            return data.data;
        } catch (e) {
            console.error('❌ GraphQL Error:', e.message);
            return null;
        }
    },

    // ===== ХЕЛПЕР: делаем URL постера абсолютным =====
    _fixPosterUrl(raw) {
        if (!raw) return '';
        if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
        if (raw.startsWith('//')) return 'https:' + raw;
        return 'https://shikimori.one' + raw;
    },

    // ============================================
    // 1. КАТАЛОГ
    // ============================================
    async getCatalog(page = 1, limit = 12, order = 'popularity') {
        const query = `{
            animes(page: ${page}, limit: ${limit}, order: ${order}) {
                id
                name
                russian
                english
                kind
                score
                status
                episodes
                episodesAired
                duration
                rating
                year: airedOn { year }
                poster { originalUrl mainUrl }
                genres { id name russian kind }
            }
        }`;

        const data = await this._graphql(query, true, `catalog_${page}_${limit}_${order}`);
        if (!data || !data.animes) return { items: [], totalPages: 1, totalCount: 0 };

        const items = data.animes.map(a => this._convertAnime(a));
        return { items, totalPages: 1, totalCount: items.length };
    },

    // ============================================
    // 2. ПОИСК
    // ============================================
    async searchAnime(query, page = 1, limit = 12) {
        if (!query || query.length < 2) return { items: [], totalPages: 1, totalCount: 0 };

        const gql = `{
            animes(search: ${JSON.stringify(query)}, page: ${page}, limit: ${limit}) {
                id
                name
                russian
                english
                kind
                score
                status
                episodes
                episodesAired
                duration
                rating
                year: airedOn { year }
                poster { originalUrl mainUrl }
                genres { id name russian kind }
            }
        }`;

        const data = await this._graphql(gql, true, `search_${query}_${page}_${limit}`);
        if (!data || !data.animes) return { items: [], totalPages: 1, totalCount: 0 };

        const items = data.animes.map(a => this._convertAnime(a));
        return { items, totalPages: 1, totalCount: items.length };
    },

    // ============================================
    // 3. НОВИНКИ
    // ============================================
    async getLatest(page = 1, limit = 12) {
        const query = `{
            animes(page: ${page}, limit: ${limit}, order: aired_on) {
                id
                name
                russian
                english
                kind
                score
                status
                episodes
                episodesAired
                duration
                rating
                year: airedOn { year }
                poster { originalUrl mainUrl }
                genres { id name russian kind }
            }
        }`;

        const data = await this._graphql(query, true, `latest_${page}_${limit}`);
        if (!data || !data.animes) return { items: [], totalPages: 1, totalCount: 0 };

        const items = data.animes.map(a => this._convertAnime(a));
        return { items, totalPages: 1, totalCount: items.length };
    },

    // ============================================
    // 4. ЖАНР
    // ============================================
    async getByGenre(genreId, page = 1, limit = 12) {
        const query = `{
            animes(
                page: ${page}, 
                limit: ${limit}, 
                order: popularity,
                genre: "${genreId}"
            ) {
                id
                name
                russian
                english
                kind
                score
                status
                episodes
                episodesAired
                duration
                rating
                year: airedOn { year }
                poster { originalUrl mainUrl }
                genres { id name russian kind }
            }
        }`;

        const data = await this._graphql(query, true, `genre_${genreId}_${page}_${limit}`);
        if (!data || !data.animes) return { items: [], totalPages: 1, totalCount: 0 };

        const items = data.animes.map(a => this._convertAnime(a));
        return { items, totalPages: 1, totalCount: items.length };
    },

    // ============================================
    // 5. СЛУЧАЙНОЕ
    // ============================================
    async getRandom(limit = 1) {
        const randomPage = Math.floor(Math.random() * 50) + 1;

        const query = `{
            animes(page: ${randomPage}, limit: 50, order: ranked) {
                id
                name
                russian
                english
                kind
                score
                status
                episodes
                episodesAired
                duration
                rating
                description
                year: airedOn { year }
                poster { originalUrl mainUrl }
                genres { id name russian kind }
            }
        }`;

        const data = await this._graphql(query, false);
        if (!data || !data.animes || !data.animes.length) return [];

        const valid = data.animes
            .filter(a => (a.poster?.originalUrl || a.poster?.mainUrl) && (a.score || 0) >= 6)
            .map(a => this._convertAnime(a));

        if (!valid.length) return [];

        const shuffled = valid.sort(() => Math.random() - 0.5);
        const result = shuffled.slice(0, limit);

        for (const item of result) {
            if (!item.synopsis && item.rawId) {
                try {
                    const desc = await this._getDescription(item.rawId);
                    if (desc) {
                        item.synopsis = desc;
                        item.description = desc;
                    }
                } catch (e) {}
            }
        }

        return result;
    },

    // ===== ВСПОМОГАТЕЛЬНЫЙ: описание через REST =====
    async _getDescription(id) {
        try {
            const response = await fetch(this.SHIKIMORI_REST + '/' + id);
            if (!response.ok) return '';
            const data = await response.json();
            let desc = data.description || '';
            desc = desc.replace(/<[^>]*>/g, '').trim();
            return desc;
        } catch (e) {
            return '';
        }
    },

    // ============================================
    // 6. ДЕТАЛИ — через REST API (с описанием)
    // ============================================
    async getAnimeDetails(id) {
        const cleanId = id.toString().replace('shikimori_', '');
        console.log('🔍 Детали для ID:', cleanId);

        if (!cleanId || !/^\d+$/.test(cleanId)) {
            console.error('❌ Неверный ID:', cleanId);
            return null;
        }

        try {
            const response = await fetch(this.SHIKIMORI_REST + '/' + cleanId);

            if (!response.ok) {
                throw new Error('HTTP ' + response.status);
            }

            const a = await response.json();
            console.log('✅ REST получен:', a.russian || a.name);

            return this._convertRestAnime(a);
        } catch (e) {
            console.warn('⚠️ REST не сработал:', e.message);
        }

        try {
            const query = `{
                anime(id: ${cleanId}) {
                    id
                    name
                    russian
                    english
                    japanese
                    kind
                    rating
                    score
                    status
                    episodes
                    episodesAired
                    duration
                    description
                    url
                    season
                    airedOn { year month day date }
                    poster { originalUrl mainUrl }
                    genres { id name russian kind }
                    studios { id name }
                }
            }`;

            const data = await this._graphql(query, false);

            if (data && data.anime) {
                console.log('✅ GraphQL fallback:', data.anime.russian || data.anime.name);
                return this._convertAnimeDetails(data.anime);
            }
        } catch (e) {
            console.warn('⚠️ GraphQL fallback не сработал');
        }

        const cached = allData[id];
        if (cached) {
            console.log('⚠️ Fallback на каталог');
            return cached;
        }

        console.error('❌ Детали не найдены для:', id);
        return null;
    },

    // ============================================
    // 7. РЕКОМЕНДАЦИИ — СЛУЧАЙНЫЙ МИКС (ТОП + НОВИНКИ)
    // ============================================
    async getRandomRecommendations(limit = 7) {
        console.log('🎲 Загружаем случайные рекомендации (топ + новинки)');

        const randomTopPage = Math.floor(Math.random() * 20) + 1;
        const randomNewPage = Math.floor(Math.random() * 5) + 1;

        const [topData, newData] = await Promise.all([
            this._graphql(`{
                animes(page: ${randomTopPage}, limit: 20, order: ranked) {
                    id name russian english kind score status episodes rating
                    year: airedOn { year }
                    poster { originalUrl mainUrl }
                    genres { id name russian kind }
                }
            }`, false),
            this._graphql(`{
                animes(page: ${randomNewPage}, limit: 20, order: aired_on) {
                    id name russian english kind score status episodes rating
                    year: airedOn { year }
                    poster { originalUrl mainUrl }
                    genres { id name russian kind }
                }
            }`, false)
        ]);

        const combined = [
            ...(topData?.animes || []),
            ...(newData?.animes || [])
        ];

        const unique = [];
        const seen = new Set();
        for (const item of combined) {
            const converted = this._convertAnime(item);
            if (!seen.has(converted.id) && converted.images?.jpg?.image_url && converted.title !== 'Без названия') {
                seen.add(converted.id);
                unique.push(converted);
            }
        }

        const shuffled = unique.sort(() => Math.random() - 0.5);
        const result = shuffled.slice(0, limit);

        console.log(`🎲 Случайные рекомендации: ${result.length} из ${unique.length}`);
        return result;
    },

    // ============================================
    // 8. РЕКОМЕНДАЦИИ ПО ЖАНРАМ (ПЕРСОНАЛЬНЫЕ)
    // ============================================
    async getPersonalRecommendations(userGenres = [], excludeTitles = [], limit = 7) {
        if (!userGenres || userGenres.length === 0) {
            console.log('📌 Нет жанров — используем случайные');
            return this.getRandomRecommendations(limit);
        }

        console.log('✨ Персональные рекомендации по жанрам:', userGenres);

        const randomPage = Math.floor(Math.random() * 8) + 1;
        const primaryGenre = userGenres[0];

        const query = `{
            animes(page: ${randomPage}, limit: 30, order: ranked, genre: "${primaryGenre}") {
                id name russian english kind score status episodes rating
                year: airedOn { year }
                poster { originalUrl mainUrl }
                genres { id name russian kind }
            }
        }`;

        const data = await this._graphql(query, false);

        if (!data || !data.animes) {
            console.log('⚠️ Пустой ответ — fallback на случайные');
            return this.getRandomRecommendations(limit);
        }

        const converted = data.animes
            .map(a => this._convertAnime(a))
            .filter(a => a.images?.jpg?.image_url && !excludeTitles.includes(a.title));

        const shuffled = converted.sort(() => Math.random() - 0.5);
        let result = shuffled.slice(0, limit);

        if (result.length < limit) {
            const extra = await this.getRandomRecommendations(limit - result.length);
            const extraFiltered = extra.filter(a => !result.find(r => r.id === a.id));
            result = [...result, ...extraFiltered];
        }

        console.log(`✨ Персональные рекомендации: ${result.length}`);
        return result;
    },

    // ============================================
    // 9. АВТОДОПОЛНЕНИЕ
    // ============================================
    async searchAutocomplete(query, limit = 8) {
        if (!query || query.length < 2) return [];

        const gql = `{
            animes(search: ${JSON.stringify(query)}, limit: ${limit}) {
                id
                name
                russian
                year: airedOn { year }
                poster { originalUrl mainUrl }
            }
        }`;

        const data = await this._graphql(gql, true, `auto_${query}_${limit}`);
        if (!data || !data.animes) return [];

        return data.animes.map(a => ({
            id: 'shikimori_' + a.id,
            title: a.russian || a.name,
            poster: this._fixPosterUrl(a.poster?.originalUrl || a.poster?.mainUrl || ''),
            year: a.year?.year || ''
        }));
    },

    // ============================================
    // 10. ЖАНРЫ
    // ============================================
    async getGenres() {
        return [
            { id: 1, name: 'Экшен', icon: '⚔️' },
            { id: 2, name: 'Приключения', icon: '🗺️' },
            { id: 4, name: 'Комедия', icon: '😂' },
            { id: 8, name: 'Драма', icon: '🎭' },
            { id: 10, name: 'Фэнтези', icon: '🧙' },
            { id: 22, name: 'Романтика', icon: '💕' },
            { id: 24, name: 'Фантастика', icon: '🚀' },
            { id: 36, name: 'Повседневность', icon: '🏠' },
            { id: 37, name: 'Триллер', icon: '🔪' },
            { id: 14, name: 'Ужасы', icon: '👻' }
        ];
    },

    async getAgeRatings() {
        return [
            { value: 'g', label: 'G — Для всех' },
            { value: 'pg', label: 'PG — Дети' },
            { value: 'pg_13', label: 'PG-13 — 13+' },
            { value: 'r', label: 'R — 17+' },
            { value: 'r_plus', label: 'R+ — 17+' },
            { value: 'rx', label: 'Rx — 18+' }
        ];
    },

    // ============================================
    // 11. СОВМЕСТИМОСТЬ
    // ============================================
    async searchAll(query = '', genre = null, page = 1, filters = {}) {
        if (query && query.length > 1) return await this.searchAnime(query, page, 12);
        if (genre === 'latest') return await this.getLatest(page, 12);
        if (genre) return await this.getByGenre(genre, page, 12);
        return await this.getCatalog(page, 12);
    },

    async _getLatestReleases(limit = 12) { return await this.getLatest(1, limit); },
    async getRandomReleases(limit = 1) { return await this.getRandom(limit); },
    async searchTitles(query, page = 1) { return await this.searchAnime(query, page, 12); },
    async getShikimoriTitle() { return null; },

    // ============================================
    // 12. VEOVEO PLAYER — тестовые URL
    // ⚠️ Замени на реальный URL, найденный через DevTools (F12 → Network)
    // ============================================
    getVeoveoUrl(shikimoriId, episode = 1) {
        // ============================================
        // ОСНОВНОЙ URL (замени на рабочий)
        // ============================================
        const url = `https://veoveo.ru/embed/${shikimoriId}?episode=${episode}`;

        // ============================================
        // АЛЬТЕРНАТИВНЫЕ ВАРИАНТЫ (раскомментируй нужный)
        // ============================================
        // const url = `https://veoveo.com/embed/${shikimoriId}/${episode}`;
        // const url = `https://player.veoveo.ru/?id=${shikimoriId}&ep=${episode}`;
        // const url = `https://veoveo.ru/shikimori/${shikimoriId}/${episode}`;
        // const url = `https://veoveo.ru/?shikimori=${shikimoriId}&episode=${episode}`;

        console.log('🎥 Veoveo URL:', url);
        return url;
    },

    // ============================================
    // 13. КОНВЕРТАЦИЯ
    // ============================================
    _convertAnime(a) {
        let title = a.russian || a.name || 'Без названия';

        let poster = '';
        if (a.poster) {
            const rawPoster = a.poster.originalUrl || a.poster.mainUrl || '';
            poster = this._fixPosterUrl(rawPoster);
        }

        const genres = (a.genres || [])
            .filter(g => g.kind === 'anime' || !g.kind)
            .map(g => g.russian || g.name)
            .filter(Boolean);

        let ageRating = '0+';
        if (a.rating) {
            const ageMap = {
                'g': '0+', 'pg': '6+', 'pg_13': '12+',
                'r': '16+', 'r_plus': '17+', 'rx': '18+'
            };
            ageRating = ageMap[a.rating] || '0+';
        }

        let status = 'Неизвестно';
        if (a.status) {
            const statusMap = {
                'anons': 'Анонс', 'ongoing': 'Онгоинг', 'released': 'Завершено'
            };
            status = statusMap[a.status] || a.status;
        }

        let description = a.description || '';
        description = description.replace(/<[^>]*>/g, '').trim();

        return {
            mal_id: 'shikimori_' + a.id,
            id: 'shikimori_' + a.id,
            rawId: a.id,
            title: title,
            title_russian: a.russian || '',
            title_english: a.english || '',
            year: a.year?.year || '--',
            episodes: a.episodes || a.episodesAired || '?',
            images: { jpg: { image_url: poster } },
            synopsis: description || '',
            description: description,
            genres: genres,
            score: a.score || 0,
            age_rating: ageRating,
            status: status,
            kind: a.kind || '',
            duration: a.duration,
            source: 'Shikimori',
            _raw: a
        };
    },

    _convertAnimeDetails(a) {
        const base = this._convertAnime(a);

        let description = a.description || '';
        description = description.replace(/<[^>]*>/g, '').trim();

        base.synopsis = description || 'Описание отсутствует';
        base.description = description;
        base.title_japanese = a.japanese || '';
        base.studios = (a.studios || []).map(s => s.name);
        base.rating = a.rating || '';
        base.url = a.url || `https://shikimori.one/animes/${a.id}`;
        base.airedOn = a.airedOn || {};
        base.season = a.season || '';

        return base;
    },

    _convertRestAnime(a) {
        let title = a.russian || a.name || 'Без названия';

        let poster = '';
        if (a.image) {
            const rawPoster = a.image.original || a.image.preview || '';
            poster = this._fixPosterUrl(rawPoster);
        }

        const genres = (a.genres || [])
            .map(g => g.russian || g.name)
            .filter(Boolean);

        let ageRating = '0+';
        if (a.rating) {
            const ageMap = {
                'g': '0+', 'pg': '6+', 'pg_13': '12+',
                'r': '16+', 'r_plus': '17+', 'rx': '18+'
            };
            ageRating = ageMap[a.rating] || '0+';
        }

        let status = 'Неизвестно';
        if (a.status) {
            const statusMap = {
                'anons': 'Анонс', 'ongoing': 'Онгоинг', 'released': 'Завершено'
            };
            status = statusMap[a.status] || a.status;
        }

        let year = '--';
        if (a.aired_on) {
            year = a.aired_on.split('-')[0];
        }

        let description = a.description || '';
        description = description.replace(/<[^>]*>/g, '').trim();

        return {
            mal_id: 'shikimori_' + a.id,
            id: 'shikimori_' + a.id,
            rawId: a.id,
            title: title,
            title_russian: a.russian || '',
            title_english: a.english || '',
            title_japanese: a.japanese || '',
            year: year,
            episodes: a.episodes || a.episodes_aired || '?',
            episodes_aired: a.episodes_aired || 0,
            images: { jpg: { image_url: poster } },
            synopsis: description || 'Описание отсутствует',
            description: description,
            genres: genres,
            score: a.score || 0,
            age_rating: ageRating,
            status: status,
            kind: a.kind || '',
            duration: a.duration || 0,
            rating: a.rating || '',
            studios: (a.studios || []).map(s => s.name),
            url: a.url ? 'https://shikimori.one' + a.url : `https://shikimori.one/animes/${a.id}`,
            aired_on: a.aired_on || '',
            released_on: a.released_on || '',
            source: 'Shikimori REST',
            _raw: a
        };
    },

    clearCache() {
        this._cache.clear();
        console.log('🗑️ Кэш очищен');
    }
};

window.API = API;
console.log('✅ API модуль (Shikimori GraphQL + REST) загружен');
