// ============================================
// АВТОРИЗАЦИЯ - СОВРЕМЕННАЯ ВЕРСИЯ (fetch)
// ============================================

function showLoginModal() {
    var modal = document.getElementById('loginModal');
    if (modal) modal.style.display = 'flex';
}

function closeLoginModal() {
    var modal = document.getElementById('loginModal');
    if (modal) modal.style.display = 'none';
}

function switchAuthTab(tab, btn) {
    var tabs = document.querySelectorAll('.modal-tab');
    tabs.forEach(function(t) { t.classList.remove('active'); });
    if (btn) btn.classList.add('active');
    
    var loginForm = document.getElementById('loginForm');
    var registerForm = document.getElementById('registerForm');
    if (loginForm) loginForm.style.display = tab === 'login' ? 'block' : 'none';
    if (registerForm) registerForm.style.display = tab === 'register' ? 'block' : 'none';
}

// ===== ОБЩАЯ ФУНКЦИЯ ДЛЯ API ЗАПРОСА =====
function _apiAuthRequest(url, body) {
    return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    })
    .then(function(response) {
        return response.json().then(function(data) {
            return { ok: response.ok, data: data };
        });
    })
    .catch(function(e) {
        console.error('❌ Ошибка сети:', e);
        return { ok: false, data: { error: 'Ошибка сети. Проверьте подключение.' } };
    });
}

// ============================================
// ✅ ОБРАБОТКА УСПЕШНОГО ВХОДА (НЕ БЛОКИРУЕТ UI)
// ============================================
function _onAuthSuccess(user, message) {
    // 1. Сохраняем пользователя МГНОВЕННО
    DB._data.currentUser = user;
    localStorage.setItem('onika_currentUser', JSON.stringify(user));
    localStorage.removeItem('onika_data');

    // 2. Закрываем модалку СРАЗУ (без ожидания)
    closeLoginModal();

    // 3. Показываем toast СРАЗУ (пользователь видит отклик мгновенно)
    showToast(message, 'success');

    // 4. Обновляем UI в следующем кадре (не блокируем клик)
    requestAnimationFrame(function() {
        if (typeof updateUI === 'function') updateUI();
        if (typeof navigate === 'function') navigate('catalog');
    });

    // 5. Серверную загрузку данных и трекинг делаем ОТЛОЖЕННО
    setTimeout(function() {
        if (typeof DB._loadUserDataFromServer === 'function') {
            DB._loadUserDataFromServer(user.id);
        }
        if (typeof startOnlineTracking === 'function') {
            startOnlineTracking();
        }
    }, 100);
}

// ===== БЛОКИРОВКА КНОПКИ =====
function _setBtnLoading(btn, loading, originalText) {
    if (!btn) return;
    if (loading) {
        btn.dataset.originalText = btn.textContent;
        btn.textContent = '⏳ Загрузка...';
        btn.style.pointerEvents = 'none';
        btn.style.opacity = '0.6';
    } else {
        btn.textContent = originalText || btn.dataset.originalText || 'Готово';
        btn.style.pointerEvents = '';
        btn.style.opacity = '';
    }
}

// ===== ВХОД =====
function login() {
    var emailInput = document.getElementById('loginEmail');
    var passInput = document.getElementById('loginPass');
    var email = emailInput ? emailInput.value.trim() : '';
    var pass = passInput ? passInput.value.trim() : '';
    
    if (!email || !pass) {
        showToast('Заполните все поля!', 'error');
        return;
    }
    
    var btn = document.querySelector('#loginForm .btn-primary');
    _setBtnLoading(btn, true);
    
    _apiAuthRequest('/api/login', { email: email, password: pass })
        .then(function(result) {
            _setBtnLoading(btn, false, '🚀 Войти');
            
            if (result.ok && result.data.success) {
                _onAuthSuccess(result.data.user, 'Добро пожаловать, ' + result.data.user.name + '! 🚀');
            } else {
                showToast(result.data.error || 'Ошибка входа', 'error');
            }
        });
}

// ===== РЕГИСТРАЦИЯ =====
function register() {
    var emailInput = document.getElementById('regEmail');
    var nameInput = document.getElementById('regName');
    var passInput = document.getElementById('regPass');
    var email = emailInput ? emailInput.value.trim() : '';
    var name = nameInput ? nameInput.value.trim() : '';
    var pass = passInput ? passInput.value.trim() : '';
    
    if (!email || !name || !pass) {
        showToast('Заполните все поля!', 'error');
        return;
    }
    if (email.indexOf('@') === -1 || email.indexOf('.') === -1) {
        showToast('Введите корректный email!', 'error');
        return;
    }
    if (name.length < 3) {
        showToast('Имя должно быть минимум 3 символа!', 'error');
        return;
    }
    if (pass.length < 4) {
        showToast('Пароль должен быть минимум 4 символа!', 'error');
        return;
    }
    
    var btn = document.querySelector('#registerForm .btn-primary');
    _setBtnLoading(btn, true);
    
    _apiAuthRequest('/api/register', {
        email: email,
        name: name,
        password: pass
    })
    .then(function(result) {
        _setBtnLoading(btn, false, '🌟 Создать аккаунт');
        
        if (result.ok && result.data.success) {
            _onAuthSuccess(result.data.user, 'Аккаунт создан! Добро пожаловать, ' + result.data.user.name + '! 🌟');
        } else {
            showToast(result.data.error || 'Ошибка регистрации', 'error');
        }
    });
}

// ===== ВЫХОД =====
function logout() {
    if (!DB.get('currentUser')) return;
    showConfirmModal('🚪 Выход', 'Вы уверены?', function() {
        var name = DB.get('currentUser').name;
        DB.set('currentUser', null);
        localStorage.removeItem('onika_currentUser');
        localStorage.removeItem('onika_data');
        updateUI();
        navigate('catalog');
        showToast('👋 До свидания, ' + name + '!', 'info');
        if (typeof stopOnlineTracking === 'function') {
            stopOnlineTracking();
        }
    });
}
