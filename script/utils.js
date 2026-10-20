// ============================================
// УТИЛИТЫ ONIKAANIME
// ============================================

// Получение русского названия
function getRussianTitle(anime) {
    if (!anime) return 'Без названия';
    
    if (anime.russian) return anime.russian;
    if (anime.title_russian) return anime.title_russian;
    if (anime.title_ru) return anime.title_ru;
    if (anime.russian_name) return anime.russian_name;
    
    if (anime.title && typeof anime.title === 'string' && /[а-яА-Я]/.test(anime.title)) {
        return anime.title;
    }
    
    if (anime.title && typeof anime.title === 'object') {
        if (anime.title.russian) return anime.title.russian;
        if (anime.title.english) return anime.title.english;
        if (anime.title.romaji) return anime.title.romaji;
    }
    
    if (anime.synonyms && anime.synonyms.length > 0) {
        for (let i = 0; i < anime.synonyms.length; i++) {
            if (/[а-яА-Я]/.test(anime.synonyms[i])) {
                return anime.synonyms[i];
            }
        }
    }
    
    return anime.name || anime.title || 'Без названия';
}

// Получение русского описания
function getRussianDescription(anime) {
    if (!anime) return 'Описание отсутствует';
    
    if (anime.description_russian) return anime.description_russian;
    if (anime.description_ru) return anime.description_ru;
    if (anime.russian_description) return anime.russian_description;
    return anime.synopsis || anime.description || 'Описание отсутствует';
}

// Форматирование числа (K, M)
function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
}

// Форматирование времени
function formatTime(seconds) {
    if (seconds < 60) return Math.floor(seconds) + 'с';
    if (seconds < 3600) return Math.floor(seconds / 60) + 'м';
    if (seconds < 86400) return Math.floor(seconds / 3600) + 'ч';
    return Math.floor(seconds / 86400) + 'д';
}

function formatFullTime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const parts = [];
    if (days > 0) parts.push(days + 'д');
    if (hours > 0) parts.push(hours + 'ч');
    if (minutes > 0) parts.push(minutes + 'м');
    return parts.join(' ') || '0м';
}

// Безопасный парсинг JSON
function safeJSONParse(str, fallback = null) {
    try {
        return JSON.parse(str);
    } catch {
        return fallback;
    }
}

// Создание HTML элемента с безопасным текстом
function createSafeElement(tag, text, className = '') {
    const el = document.createElement(tag);
    el.textContent = text;
    if (className) el.className = className;
    return el;
}

// Дебаунс для поиска
function debounce(fn, delay = 300) {
    let timer = null;
    return function(...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

// Глобальные утилиты
window.getRussianTitle = getRussianTitle;
window.getRussianDescription = getRussianDescription;
window.formatNumber = formatNumber;
window.formatTime = formatTime;
window.formatFullTime = formatFullTime;
window.safeJSONParse = safeJSONParse;
window.createSafeElement = createSafeElement;
window.debounce = debounce;

console.log('✅ Утилиты загружены');
