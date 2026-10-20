// Инициализация Telegram
const tg = window.Telegram.WebApp;
if (tg) {
    tg.expand(); // Разворачиваем на весь экран
    tg.setHeaderColor('#0a0a0f'); // Красим шапку в цвет фона
}

// Переключение вкладок в нижнем меню
function switchTab(tabName, element) {
    // Скрываем все экраны
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    
    // Если выбрана Главная
    if (tabName === 'home') {
        document.getElementById('screen-home').classList.add('active');
    }
    // Если выбран Профиль
    if (tabName === 'profile') {
        document.getElementById('screen-profile').classList.add('active');
    }

    // Обновляем цвет иконок в меню
    if (element) {
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        element.classList.add('active');
    }
}

// Функция для кнопки "Смотреть"
function playHero() {
    if (tg) {
        tg.showAlert("Тут будет запускаться видеоплеер!");
    } else {
        alert("Тут будет запускаться видеоплеер!");
    }
}

// ==========================================
// ТЕСТОВАЯ ЗАГРУЗКА ДАННЫХ (Визуал)
// ==========================================
// Здесь мы имитируем загрузку аниме, чтобы вы увидели, как выглядит дизайн.
// Позже мы заменим это на реальные запросы к Shikimori API.

const mockAnime = [
    { id: 1, title: "Киберпанк: Бегущие по краю", img: "https://shikimori.one/system/animes/original/42310.jpg" },
    { id: 2, title: "Атака Титанов", img: "https://shikimori.one/system/animes/original/16498.jpg" },
    { id: 3, title: "Магическая битва", img: "https://shikimori.one/system/animes/original/40748.jpg" },
    { id: 4, title: "Тетрадь смерти", img: "https://shikimori.one/system/animes/original/1535.jpg" },
    { id: 5, title: "Ван-Пис", img: "https://shikimori.one/system/animes/original/21.jpg" }
];

// Загрузка баннера (Hero)
function loadHero() {
    const anime = mockAnime[0];
    document.getElementById('heroBg').style.backgroundImage = `url('${anime.img}')`;
    document.getElementById('heroTitle').textContent = anime.title;
    document.getElementById('heroDesc').textContent = "Действие разворачивается в Найт-Сити. Главный герой — уличный парень Дэвид Мартинес, который выживает в мире, одержимом технологиями и модификациями тела.";
}

// Отрисовка карточек в сетке
function renderCards(containerId, list) {
    const container = document.getElementById(containerId);
    if (!container) return;

    let html = '';
    list.forEach(anime => {
        html += `
            <div class="card" onclick="openAnime(${anime.id})">
                <img class="card-img" src="${anime.img}" loading="lazy">
                <div class="card-title">${anime.title}</div>
            </div>
        `;
    });
    container.innerHTML = html;
}

// Запуск при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    loadHero();
    renderCards('trending-list', mockAnime);
    renderCards('catalog-list', mockAnime);
});
