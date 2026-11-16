// ==========================================
// API — запросы к AniList / AniLibria / Shikimori
// Зависит от: config.js (supabaseClient, safeUrl, escapeHTML, PLACEHOLDER_POSTER)
// ==========================================

const PROXY_URL = 'https://onika-api.relaxdev.ru/?target=';
const ANILIST_URL = 'https://graphql.anilist.co';
const SHIKIMORI_GRAPHQL = 'https://shikimori.io/api/graphql';
const ANILIBRIA_API = 'https://aniliberty.top/api/v1';

// ---------- AniList ----------
const API_AniList = {
    async fetch(query, variables = {}, signal) {
        const res = await fetch(PROXY_URL + encodeURIComponent(ANILIST_URL), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, variables }),
            signal
        });
        if (!res.ok) throw new Error('AniList HTTP ' + res.status);
        const d = await res.json();
        if (d.errors) throw new Error('AniList: ' + d.errors[0].message);
        return d.data;
    },
    _mediaFields: `id idMal title{romaji english native} averageScore episodes status format seasonYear coverImage{extraLarge large medium} genres trailer{id}`,

    async getCatalog(page, limit, filters, signal) {
        const perPage = Math.min(limit || 30, 50);
        const vars = { page: page || 1, perPage };
        let args = ['type: ANIME', 'sort: POPULARITY_DESC', 'genre_not_in: ["Hentai", "Ecchi", "Erotica"]'];

        if (filters && filters.search) { vars.search = filters.search; args.push('search: $search'); }
        if (filters && filters.year) { vars.seasonYear = parseInt(filters.year); args.push('seasonYear: $seasonYear'); }
        if (filters && filters.genre) { vars.genre = filters.genre; args.push('genre: $genre'); }
        if (filters && filters.status) {
            const m = { ongoing: 'RELEASING', released: 'FINISHED', anons: 'NOT_YET_RELEASED' };
            vars.status = m[filters.status];
            if (vars.status) args.push('status: $status');
        }

        const sortMap = { popularity: 'POPULARITY_DESC', ranked: 'SCORE_DESC', aired_on: 'START_DATE_DESC', newest: 'START_DATE_DESC', oldest: 'START_DATE_ASC' };
        const sort = sortMap[filters?.sort] || 'POPULARITY_DESC';

        const q = `query($page:Int,$perPage:Int${vars.search ? ', $search:String' : ''}${vars.seasonYear ? ', $seasonYear:Int' : ''}${vars.genre ? ', $genre:String' : ''}${vars.status ? ', $status:MediaStatus' : ''}){Page(page:$page,perPage:$perPage){media(${args.filter(a => !a.startsWith('sort')).join(', ')},sort:${sort}){${this._mediaFields}}}}`;

        const data = await this.fetch(q, vars, signal).catch(e => {
            if (e.name === 'AbortError') throw e;
            return null;
        });
        return data?.Page?.media || [];
    },

    async getDetails(id, signal) {
        const cleanId = String(id).replace('anilist_', '');
        const q = `query($id:Int){Media(id:$id,type:ANIME){${this._mediaFields} description(asHtml:false) nextAiringEpisode{airingAt timeUntilAiring episode} relations{edges{relationType node{id idMal title{romaji english native} coverImage{large} seasonYear format}}}}}`;
        const data = await this.fetch(q, { id: parseInt(cleanId) }, signal).catch(e => {
            if (e.name === 'AbortError') throw e;
            return null;
        });
        return data?.Media || null;
    },

    async getGenresBatch(ids) {
        if (!ids.length) return [];
        const q = `query($ids:[Int]) { Page(page: 1, perPage: 50) { media(id_in: $ids, type: ANIME) { id genres } } }`;
        const data = await this.fetch(q, { ids: ids.map(Number) }).catch(() => null);
        return data?.Page?.media || [];
    },

    async getRandom(limit, signal) {
        const q = `query($page:Int,$perPage:Int){Page(page:$page,perPage:$perPage){media(type:ANIME,sort:POPULARITY_DESC,genre_not_in:["Hentai","Ecchi","Erotica"]){${this._mediaFields}}}}`;
        const data = await this.fetch(q, { page: 1, perPage: Math.min((limit || 5) * 6, 50) }, signal).catch(e => {
            if (e.name === 'AbortError') throw e;
            return null;
        });
        return (data?.Page?.media || []).sort(() => Math.random() - 0.5).slice(0, limit || 5);
    },

    async getSeasonal(limit, signal) {
        const now = new Date();
        const month = now.getMonth();
        let season = 'WINTER';
        if (month >= 3 && month < 6) season = 'SPRING';
        else if (month >= 6 && month < 9) season = 'SUMMER';
        else if (month >= 9) season = 'FALL';
        const q = `query($page:Int,$perPage:Int,$season:MediaSeason,$seasonYear:Int){Page(page:$page,perPage:$perPage){media(type:ANIME,season:$season,seasonYear:$seasonYear,sort:POPULARITY_DESC,genre_not_in:["Hentai","Ecchi","Erotica"]){${this._mediaFields}}}}`;
        const data = await this.fetch(q, { page: 1, perPage: Math.min((limit || 6) * 2, 50), season, seasonYear: now.getFullYear() }, signal).catch(e => {
            if (e.name === 'AbortError') throw e;
            return null;
        });
        return (data?.Page?.media || []).slice(0, limit || 6);
    },

    async getUpcoming(limit, signal) {
        const now = new Date();
        const month = now.getMonth();
        let season = 'WINTER', year = now.getFullYear();
        if (month >= 0 && month < 3) season = 'SPRING';
        else if (month >= 3 && month < 6) season = 'SUMMER';
        else if (month >= 6 && month < 9) season = 'FALL';
        else { season = 'WINTER'; year += 1; }
        const q = `query($page:Int,$perPage:Int,$season:MediaSeason,$seasonYear:Int){Page(page:$page,perPage:$perPage){media(type:ANIME,season:$season,seasonYear:$seasonYear,status:NOT_YET_RELEASED,sort:POPULARITY_DESC,genre_not_in:["Hentai","Ecchi","Erotica"]){${this._mediaFields}}}}`;
        const data = await this.fetch(q, { page: 1, perPage: Math.min((limit || 6) * 2, 50), season, seasonYear: year }, signal).catch(e => {
            if (e.name === 'AbortError') throw e;
            return null;
        });
        return (data?.Page?.media || []).slice(0, limit || 6);
    },

    async getTopRated(limit = 6, signal) {
        const q = `query($page:Int,$perPage:Int){Page(page:$page,perPage:$perPage){media(type:ANIME,sort:SCORE_DESC,genre_not_in:["Hentai","Ecchi","Erotica"]){${this._mediaFields}}}}`;
        const data = await this.fetch(q, { page: 1, perPage: Math.min(limit, 50) }, signal).catch(e => {
            if (e.name === 'AbortError') throw e;
            return null;
        });
        return data?.Page?.media || [];
    }
};

// ---------- AniLibria ----------
const API_AniLibria = {
    async searchRussian(searchTitle) {
        if (!searchTitle) return null;
        const cleanSearch = searchTitle.replace(/\s*\([^)]*\)/g, '').trim();
        if (!cleanSearch) return null;
        const url = `${ANILIBRIA_API}/anime/releases?f[search]=${encodeURIComponent(cleanSearch)}&limit=1`;
        try {
            const res = await fetch(PROXY_URL + encodeURIComponent(url));
            if (!res.ok) return null;
            const data = await res.json();
            const item = data?.data && data.data[0];
            if (item) return item.name?.main || item.name?.english || null;
        } catch {}
        return null;
    }
};

// ---------- Shikimori ----------
const API_Shikimori = {
    async fetchGraphQL(query) {
        const res = await fetch(PROXY_URL + encodeURIComponent(SHIKIMORI_GRAPHQL), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query })
        });
        if (!res.ok) throw new Error('Shikimori HTTP ' + res.status);
        const d = await res.json();
        if (d.errors) throw new Error('Shikimori: ' + d.errors[0].message);
        return d.data;
    },
    async getRussianData(searchTitle) {
        if (!searchTitle) return { russian: null, description: null };
        const clean = searchTitle.replace(/\s*\([^)]*\)/g, '').trim();
        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                const q = `{animes(search:"${clean.replace(/"/g, '')}",limit:1){id name russian description}}`;
                const d = await this.fetchGraphQL(q);
                if (d.animes && d.animes.length) return { russian: d.animes[0].russian || null, description: d.animes[0].description || null };
                break;
            } catch {
                if (attempt === 1) await new Promise(r => setTimeout(r, 300));
            }
        }
        return { russian: null, description: null };
    }
};

// ---------- Кэш аниме в Supabase ----------
async function getCachedAnimeBatch(ids) {
    if (!supabaseClient || !ids.length) return new Map();
    try {
        const { data } = await supabaseClient.from('anime_cache').select('*').in('id', ids.map(String));
        const map = new Map();
        (data || []).forEach(d => map.set(String(d.id), d));
        return map;
    } catch { return new Map(); }
}

async function saveCachedAnimeBatch(animeObjects) {
    if (!supabaseClient || !animeObjects.length) return;
    try {
        const payload = animeObjects.map(a => ({
            id: String(a.rawId ?? a.id).replace('anilist_', ''),
            title_ru: a.title_ru, title_raw: a.title_raw,
            image_url: a.images?.jpg?.image_url || '',
            description: a.description, genres: a.genres,
            score: a.score, year: a.year, episodes: a.episodes,
            status: a.status, kind: a.kind,
            updated_at: new Date().toISOString()
        }));
        await supabaseClient.from('anime_cache').upsert(payload, { onConflict: 'id' });
    } catch (e) { console.warn('Batch cache save failed:', e); }
}

function buildAnimeObjectFromCache(raw, cached) {
    const searchTitle = raw.title?.english || raw.title?.romaji || raw.title?.native || '';
    if (cached && cached.title_ru) {
        return {
            id: 'anilist_' + raw.id, rawId: raw.id, idMal: raw.idMal,
            title_ru: cached.title_ru, title_raw: cached.title_raw || searchTitle, title: cached.title_ru,
            year: cached.year || raw.seasonYear || '--', episodes: cached.episodes || raw.episodes || '?',
            images: { jpg: { image_url: cached.image_url || raw.coverImage?.extraLarge || raw.coverImage?.large || '' } },
            description: cached.description || raw.description || 'Описание отсутствует.',
            genres: cached.genres || raw.genres || [],
            score: cached.score || (raw.averageScore ? (raw.averageScore / 10).toFixed(1) : 0),
            status: cached.status || (raw.status === 'RELEASING' ? 'Онгоинг' : raw.status === 'FINISHED' ? 'Завершено' : 'Анонс'),
            kind: cached.kind || raw.format || 'TV', trailerId: raw.trailer?.id || null,
            relations: raw.relations || null, nextAiringEpisode: raw.nextAiringEpisode || null
        };
    }
    return null;
}

function buildRawAnimeObject(raw, finalRussianTitle, cleanDesc) {
    const searchTitle = raw.title?.english || raw.title?.romaji || raw.title?.native || '';
    return {
        id: 'anilist_' + raw.id, rawId: raw.id, idMal: raw.idMal,
        title_ru: finalRussianTitle, title_raw: searchTitle, title: finalRussianTitle,
        year: raw.seasonYear || '--', episodes: raw.episodes || '?',
        images: { jpg: { image_url: raw.coverImage?.extraLarge || raw.coverImage?.large || '' } },
        description: cleanDesc, genres: raw.genres || [],
        score: raw.averageScore ? (raw.averageScore / 10).toFixed(1) : 0,
        status: raw.status === 'RELEASING' ? 'Онгоинг' : raw.status === 'FINISHED' ? 'Завершено' : 'Анонс',
        kind: raw.format || 'TV', trailerId: raw.trailer?.id || null,
        relations: raw.relations || null, nextAiringEpisode: raw.nextAiringEpisode || null
    };
}

async function processWithLimit(items, limit, asyncProcessor) {
    const results = new Array(items.length);
    let cursor = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (true) {
            const i = cursor++;
            if (i >= items.length) return;
            try { results[i] = await asyncProcessor(items[i], i); }
            catch { results[i] = null; }
        }
    });
    await Promise.all(workers);
    return results;
}

async function buildAnimeObjectsBatch(rawList) {
    if (!rawList || !rawList.length) return [];
    const ids = rawList.map(r => String(r.id));
    const cachedMap = await getCachedAnimeBatch(ids);

    const results = new Array(rawList.length);
    const toTranslate = [];

    rawList.forEach((raw, i) => {
        const c = cachedMap.get(String(raw.id));
        if (c && c.title_ru) {
            results[i] = buildAnimeObjectFromCache(raw, c);
        } else {
            toTranslate.push({ raw, index: i });
        }
    });

    await processWithLimit(toTranslate, 4, async (item) => {
        const { raw, index } = item;
        const searchTitle = raw.title?.english || raw.title?.romaji || raw.title?.native || '';
        let russian = null;
        try { russian = await API_AniLibria.searchRussian(searchTitle); } catch {}
        let shiki = { russian: null, description: null };
        if (!russian) { try { shiki = await API_Shikimori.getRussianData(searchTitle); } catch {} }
        const finalTitle = russian || shiki.russian || searchTitle || 'Без названия';
        let cleanDesc = shiki.description || raw.description || 'Описание отсутствует.';
        cleanDesc = cleanDesc.replace(/\[[^\]]*\]/g, '').replace(/<[^>]*>?/gm, '').trim();
        results[index] = buildRawAnimeObject(raw, finalTitle, cleanDesc);
    });

    const toSave = toTranslate.map(t => results[t.index]).filter(Boolean);
    if (toSave.length) saveCachedAnimeBatch(toSave).catch(() => {});
    return results.filter(Boolean);
}

// ---------- API-обёртка с кэшем ----------
const API = {
    _cache: new Map(),
    _CACHE_TTL: 30 * 60 * 1000,
    _CACHE_MAX: 200,

    _getCache(key) {
        const item = this._cache.get(key);
        if (item && Date.now() - item.t < this._CACHE_TTL) return item.d;
        if (item) this._cache.delete(key);
        return undefined;
    },
    _setCache(key, data) {
        if (this._cache.size >= this._CACHE_MAX) {
            const first = this._cache.keys().next().value;
            this._cache.delete(first);
        }
        this._cache.set(key, { d: data, t: Date.now() });
    },
    async _cached(key, fn) {
        const cached = this._getCache(key);
        if (cached !== undefined) return cached;
        try {
            const d = await fn();
            if (d) this._setCache(key, d);
            return d;
        } catch { return null; }
    },

    getCatalog(page, limit, filters, signal) {
        return this._cached(`c_${page}_${limit}_${JSON.stringify(filters || {})}`, async () => {
            const raw = await API_AniList.getCatalog(page, limit, filters, signal);
            return await buildAnimeObjectsBatch(raw);
        });
    },
    getDetails(id, signal) {
        return this._cached(`d_${id}`, async () => {
            const raw = await API_AniList.getDetails(id, signal);
            if (!raw) return null;
            const batch = await buildAnimeObjectsBatch([raw]);
            return batch[0] || null;
        });
    },
    getRandom(limit, signal) {
        return (async () => {
            const raw = await API_AniList.getRandom(limit, signal);
            return await buildAnimeObjectsBatch(raw);
        })();
    },
    getSeasonal(limit, signal) {
        return this._cached(`s_${limit}`, async () => {
            const raw = await API_AniList.getSeasonal(limit, signal);
            return await buildAnimeObjectsBatch(raw);
        });
    },
    getUpcoming(limit, signal) {
        return this._cached(`u_${limit}`, async () => {
            const raw = await API_AniList.getUpcoming(limit, signal);
            return await buildAnimeObjectsBatch(raw);
        });
    },
    getTopRated(limit, signal) {
        return this._cached(`top_${limit}`, async () => {
            const raw = await API_AniList.getTopRated(limit, signal);
            return await buildAnimeObjectsBatch(raw);
        });
    }
};
