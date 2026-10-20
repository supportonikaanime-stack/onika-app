// ============================================
// ONIKAANIME — СЕРВЕР (SHIKIMORI PROXY + REST)
// ============================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const Joi = require('joi');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '20mb' }));
app.use(express.static(__dirname));

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: false
});

pool.connect((err, client, release) => {
    if (err) {
        console.error('❌ Ошибка PostgreSQL:', err.message);
        return;
    }
    console.log('✅ PostgreSQL подключен!');
    release();
});

// ============================================
// ПРОКСИ SHIKIMORI GraphQL
// ============================================
app.post('/api/shikimori', async (req, res) => {
    try {
        const query = req.body.query;
        if (!query) {
            return res.status(400).json({ error: 'Query обязателен' });
        }

        console.log('📡 Shikimori GraphQL:', query.slice(0, 80).replace(/\s+/g, ' '));

        const response = await fetch('https://shikimori.one/api/graphql', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'User-Agent': 'OnikaAnime/1.0 (https://onikaanime.relaxdev.ru)'
            },
            body: JSON.stringify({ query })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ Shikimori GraphQL HTTP', response.status, errorText.slice(0, 200));
            return res.status(response.status).json({
                error: 'Shikimori: ' + response.status
            });
        }

        const data = await response.json();

        if (data.errors) {
            console.error('❌ GraphQL errors:', JSON.stringify(data.errors).slice(0, 200));
        } else {
            console.log('✅ GraphQL OK');
        }

        res.json(data);
    } catch (err) {
        console.error('❌ Shikimori прокси ошибка:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// ПРОКСИ SHIKIMORI REST API
// ============================================
app.get('/api/shikimori-rest/:id', async (req, res) => {
    try {
        const id = req.params.id;
        if (!id || !/^\d+$/.test(id)) {
            return res.status(400).json({ error: 'Неверный ID' });
        }

        console.log('📡 Shikimori REST запрос для ID:', id);

        const response = await fetch(`https://shikimori.one/api/animes/${id}`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'OnikaAnime/1.0 (https://onikaanime.relaxdev.ru)'
            }
        });

        if (!response.ok) {
            console.error('❌ Shikimori REST HTTP', response.status);
            return res.status(response.status).json({ error: 'Shikimori: ' + response.status });
        }

        const data = await response.json();
        console.log('✅ REST OK:', data.russian || data.name);
        res.json(data);
    } catch (err) {
        console.error('❌ Shikimori REST ошибка:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// СОЗДАНИЕ ТАБЛИЦ
// ============================================
async function initDatabase() {
    try {
        console.log('📦 Создание таблиц...');

        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                name TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS profiles (
                user_id INTEGER PRIMARY KEY,
                bio TEXT,
                avatar TEXT,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS favorites (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                anime TEXT NOT NULL,
                added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE(user_id, anime)
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS comments (
                id SERIAL PRIMARY KEY,
                anime TEXT NOT NULL,
                user_name TEXT NOT NULL,
                text TEXT NOT NULL,
                date TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS achievements (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                achievement_id TEXT NOT NULL,
                earned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE(user_id, achievement_id)
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS active_titles (
                user_id INTEGER PRIMARY KEY,
                title_id TEXT,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS continue_watching (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                anime TEXT NOT NULL,
                episode INTEGER DEFAULT 0,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE(user_id, anime)
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS anime_sources (
                id SERIAL PRIMARY KEY,
                anime_title TEXT NOT NULL,
                anime_id TEXT,
                source TEXT NOT NULL,
                url TEXT NOT NULL,
                episode INTEGER DEFAULT 1,
                quality TEXT DEFAULT '720p',
                video_title TEXT,
                added_by TEXT DEFAULT 'admin',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_name ON users(name)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_comments_anime ON comments(anime)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_comments_user_name ON comments(user_name)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON favorites(user_id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_sources_title ON anime_sources(anime_title)`);

        console.log('✅ Все таблицы созданы!');
    } catch (err) {
        console.error('❌ Ошибка таблиц:', err.message);
    }
}

const schemas = {
    register: Joi.object({
        email: Joi.string().email().required(),
        name: Joi.string().min(3).max(30).required(),
        password: Joi.string().min(4).required()
    }),
    login: Joi.object({
        email: Joi.string().email().required(),
        password: Joi.string().required()
    }),
    comment: Joi.object({
        anime: Joi.string().required(),
        user_name: Joi.string().required(),
        text: Joi.string().min(1).max(2000).required()
    }),
    updateName: Joi.object({
        userId: Joi.number().integer().required(),
        newName: Joi.string().min(3).max(30).required()
    })
};

// ============================================
// ИСТОЧНИКИ ВИДЕО
// ============================================
app.get('/api/sources/:animeTitle', async (req, res, next) => {
    try {
        const animeTitle = decodeURIComponent(req.params.animeTitle);
        const result = await pool.query(
            'SELECT * FROM anime_sources WHERE anime_title = $1 ORDER BY source, episode',
            [animeTitle]
        );

        const grouped = {};
        result.rows.forEach(row => {
            if (!grouped[row.source]) grouped[row.source] = [];
            grouped[row.source].push({
                id: row.id,
                url: row.url,
                episode: row.episode,
                quality: row.quality,
                title: row.video_title
            });
        });

        res.json({ success: true, sources: grouped, animeTitle });
    } catch (err) { next(err); }
});

app.post('/api/sources', async (req, res, next) => {
    try {
        const { anime_title, anime_id, source, url, episode, quality, video_title, admin_key } = req.body;

        const ADMIN_KEY = process.env.ADMIN_KEY || 'onika_admin_secret_2026';
        if (admin_key !== ADMIN_KEY) {
            return res.status(403).json({ error: 'Неверный админ-ключ' });
        }

        if (!anime_title || !source || !url) {
            return res.status(400).json({ error: 'Заполните поля' });
        }

        const existing = await pool.query(
            'SELECT id FROM anime_sources WHERE anime_title = $1 AND source = $2 AND url = $3',
            [anime_title, source, url]
        );

        if (existing.rows.length > 0) {
            return res.status(400).json({ error: 'Уже добавлено' });
        }

        const result = await pool.query(
            `INSERT INTO anime_sources (anime_title, anime_id, source, url, episode, quality, video_title, added_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
            [anime_title, anime_id || null, source, url, episode || 1, quality || '720p', video_title || null, 'admin']
        );

        res.json({ success: true, id: result.rows[0].id });
    } catch (err) { next(err); }
});

app.delete('/api/sources/:id', async (req, res, next) => {
    try {
        const id = parseInt(req.params.id);
        const { admin_key } = req.body;
        const ADMIN_KEY = process.env.ADMIN_KEY || 'onika_admin_secret_2026';
        if (admin_key !== ADMIN_KEY) return res.status(403).json({ error: 'Нет доступа' });
        await pool.query('DELETE FROM anime_sources WHERE id = $1', [id]);
        res.json({ success: true });
    } catch (err) { next(err); }
});

app.get('/api/sources-list', async (req, res, next) => {
    try {
        const result = await pool.query(`
            SELECT anime_title, anime_id, 
                   COUNT(*) as total,
                   ARRAY_AGG(DISTINCT source) as sources,
                   MAX(created_at) as last_updated
            FROM anime_sources 
            GROUP BY anime_title, anime_id 
            ORDER BY anime_title
        `);
        res.json({ success: true, list: result.rows });
    } catch (err) { next(err); }
});

// ============================================
// ПОЛЬЗОВАТЕЛИ
// ============================================
app.post('/api/register', async (req, res, next) => {
    try {
        const { error, value } = schemas.register.validate(req.body);
        if (error) return res.status(400).json({ error: error.details[0].message });

        const { email, name, password } = value;
        const existing = await pool.query('SELECT id FROM users WHERE email = $1 OR name = $2', [email, name]);
        if (existing.rows.length > 0) return res.status(400).json({ error: 'Пользователь существует' });

        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await pool.query(
            'INSERT INTO users (email, name, password) VALUES ($1, $2, $3) RETURNING id',
            [email, name, hashedPassword]
        );

        const userId = result.rows[0].id;
        await pool.query('INSERT INTO profiles (user_id, bio, avatar) VALUES ($1, $2, $3)', [userId, '', '']);
        await pool.query('INSERT INTO active_titles (user_id, title_id) VALUES ($1, $2)', [userId, null]);

        res.json({ success: true, user: { id: userId, email, name } });
    } catch (err) { next(err); }
});

app.post('/api/login', async (req, res, next) => {
    try {
        const { error, value } = schemas.login.validate(req.body);
        if (error) return res.status(400).json({ error: error.details[0].message });

        const { email, password } = value;
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

        if (result.rows.length === 0) return res.status(400).json({ error: 'Неверный email или пароль' });

        const user = result.rows[0];
        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.status(400).json({ error: 'Неверный email или пароль' });

        res.json({ success: true, user: { id: user.id, email: user.email, name: user.name } });
    } catch (err) { next(err); }
});

app.get('/api/user/:id', async (req, res, next) => {
    try {
        const userId = parseInt(req.params.id);
        if (isNaN(userId)) return res.status(400).json({ error: 'Неверный ID' });

        const userResult = await pool.query('SELECT id, email, name FROM users WHERE id = $1', [userId]);
        if (userResult.rows.length === 0) return res.status(404).json({ error: 'Не найден' });

        const user = userResult.rows[0];
        const result = { id: user.id, email: user.email, name: user.name, favorites: [], achievements: [], activeTitle: null };

        const favs = await pool.query('SELECT anime FROM favorites WHERE user_id = $1', [userId]);
        result.favorites = favs.rows.map(f => f.anime);

        const ach = await pool.query('SELECT achievement_id FROM achievements WHERE user_id = $1', [userId]);
        result.achievements = ach.rows.map(a => a.achievement_id);

        const title = await pool.query('SELECT title_id FROM active_titles WHERE user_id = $1', [userId]);
        if (title.rows.length > 0) result.activeTitle = title.rows[0].title_id;

        res.json(result);
    } catch (err) { next(err); }
});

app.post('/api/update-name', async (req, res, next) => {
    try {
        const { error, value } = schemas.updateName.validate(req.body);
        if (error) return res.status(400).json({ error: error.details[0].message });

        const { userId, newName } = value;
        const existing = await pool.query('SELECT id FROM users WHERE name = $1 AND id != $2', [newName, userId]);
        if (existing.rows.length > 0) return res.status(400).json({ error: 'Имя занято' });

        const oldUser = await pool.query('SELECT name FROM users WHERE id = $1', [userId]);
        const oldName = oldUser.rows[0]?.name;

        await pool.query('UPDATE users SET name = $1 WHERE id = $2', [newName, userId]);

        if (oldName) {
            await pool.query('UPDATE comments SET user_name = $1 WHERE user_name = $2', [newName, oldName]);
            console.log(`✅ Обновлено имя в комментариях: ${oldName} → ${newName}`);
        }

        res.json({ success: true, name: newName });
    } catch (err) { next(err); }
});

// ============================================
// ИЗБРАННОЕ, ДОСТИЖЕНИЯ
// ============================================
app.post('/api/favorites', async (req, res, next) => {
    try {
        const { userId, favorites } = req.body;
        if (!userId || isNaN(userId)) return res.status(400).json({ error: 'Неверный ID' });

        await pool.query('DELETE FROM favorites WHERE user_id = $1', [userId]);
        if (favorites && favorites.length > 0) {
            for (const anime of favorites) {
                await pool.query('INSERT INTO favorites (user_id, anime) VALUES ($1, $2) ON CONFLICT DO NOTHING', [userId, anime]);
            }
        }
        res.json({ success: true });
    } catch (err) { next(err); }
});

app.post('/api/achievements', async (req, res, next) => {
    try {
        const { userId, achievements } = req.body;
        if (!userId || isNaN(userId)) return res.status(400).json({ error: 'Неверный ID' });

        await pool.query('DELETE FROM achievements WHERE user_id = $1', [userId]);
        if (achievements && achievements.length > 0) {
            for (const achId of achievements) {
                await pool.query('INSERT INTO achievements (user_id, achievement_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [userId, achId]);
            }
        }
        res.json({ success: true });
    } catch (err) { next(err); }
});

app.post('/api/active-title', async (req, res, next) => {
    try {
        const { userId, titleId } = req.body;
        if (!userId || isNaN(userId)) return res.status(400).json({ error: 'Неверный ID' });

        await pool.query(
            `INSERT INTO active_titles (user_id, title_id) VALUES ($1, $2) 
             ON CONFLICT (user_id) DO UPDATE SET title_id = $2`,
            [userId, titleId]
        );
        res.json({ success: true });
    } catch (err) { next(err); }
});

// ============================================
// КОММЕНТАРИИ
// ============================================

app.get('/api/comments/all', async (req, res, next) => {
    try {
        console.log('📤 Запрос: /api/comments/all');
        const result = await pool.query('SELECT * FROM comments ORDER BY created_at DESC');
        console.log(`✅ Возвращено комментариев: ${result.rows.length}`);
        res.json(result.rows || []);
    } catch (err) {
        console.error('❌ Ошибка /api/comments/all:', err.message);
        next(err);
    }
});

app.get('/api/comments/user/:userName', async (req, res, next) => {
    try {
        const userName = decodeURIComponent(req.params.userName);
        const result = await pool.query(
            'SELECT * FROM comments WHERE user_name = $1 ORDER BY created_at DESC',
            [userName]
        );
        res.json(result.rows || []);
    } catch (err) { next(err); }
});

app.post('/api/comments', async (req, res, next) => {
    try {
        const { error, value } = schemas.comment.validate(req.body);
        if (error) return res.status(400).json({ error: error.details[0].message });

        const { anime, user_name, text } = value;
        const date = new Date().toISOString().slice(0, 16).replace('T', ' ');

        console.log(`💬 Новый комментарий от ${user_name} к "${anime}"`);

        const result = await pool.query(
            'INSERT INTO comments (anime, user_name, text, date) VALUES ($1, $2, $3, $4) RETURNING id, anime, user_name, text, date, created_at',
            [anime, user_name, text, date]
        );

        console.log(`✅ Комментарий добавлен, ID: ${result.rows[0].id}`);
        res.json({ success: true, comment: result.rows[0] });
    } catch (err) {
        console.error('❌ Ошибка добавления комментария:', err.message);
        next(err);
    }
});

app.get('/api/comments/:anime', async (req, res, next) => {
    try {
        const anime = decodeURIComponent(req.params.anime);
        const result = await pool.query(
            'SELECT * FROM comments WHERE anime = $1 ORDER BY created_at DESC',
            [anime]
        );
        res.json(result.rows || []);
    } catch (err) { next(err); }
});

app.delete('/api/comments/:id', async (req, res, next) => {
    try {
        const id = parseInt(req.params.id);
        const { user_name } = req.body;

        if (isNaN(id)) return res.status(400).json({ error: 'Неверный ID' });
        if (!user_name) return res.status(400).json({ error: 'Имя обязательно' });

        const comment = await pool.query('SELECT * FROM comments WHERE id = $1', [id]);
        if (comment.rows.length === 0) return res.status(404).json({ error: 'Не найден' });
        if (comment.rows[0].user_name !== user_name) return res.status(403).json({ error: 'Нет доступа' });

        await pool.query('DELETE FROM comments WHERE id = $1', [id]);
        console.log(`🗑 Комментарий #${id} удалён`);
        res.json({ success: true });
    } catch (err) { next(err); }
});

// ============================================
// УДАЛЕНИЕ АККАУНТА
// ============================================
app.post('/api/delete-account', async (req, res, next) => {
    try {
        const { userId } = req.body;
        if (!userId || isNaN(userId)) return res.status(400).json({ error: 'Неверный ID' });
        await pool.query('DELETE FROM users WHERE id = $1', [userId]);
        res.json({ success: true });
    } catch (err) { next(err); }
});

// ============================================
// ОБРАБОТЧИК ОШИБОК + ЗАПУСК
// ============================================
app.use((err, req, res, next) => {
    console.error('❌ Ошибка:', err.message);
    if (err.isJoi) return res.status(400).json({ error: err.details[0].message });
    if (err.code === '23505') return res.status(400).json({ error: 'Уже существует' });
    res.status(500).json({ error: process.env.NODE_ENV === 'production' ? 'Ошибка' : err.message });
});

initDatabase().then(() => {
    app.listen(PORT, () => {
        console.log('🚀 OnikaAnime сервер запущен!');
        console.log(`📡 http://localhost:${PORT}`);
    });
});

module.exports = app;
