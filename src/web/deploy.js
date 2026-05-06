// src/web/deploy.js — Деплой веб-приложения Resistance City v5.0.0
// Инициализация, проверка файлов, создание структуры, запуск

'use strict';

const fs = require('fs');
const path = require('path');
const { logger, createLogger } = require('../shared/logger');
const config = require('../config');

const deployLogger = createLogger('WebDeploy');

// ==================== ПРОВЕРКА И СОЗДАНИЕ СТРУКТУРЫ ====================

const REQUIRED_DIRECTORIES = [
    'public',
    'public/css',
    'public/js',
    'public/img',
    'public/fonts',
    'views',
    'views/admin',
    'views/admin/db',
    'views/partials',
    'middleware',
];

const REQUIRED_FILES = [
    'views/index.ejs',
    'views/message.ejs',
    'views/profile.ejs',
    'views/top.ejs',
    'views/career.ejs',
    'views/admin/login.ejs',
    'views/admin/dashboard.ejs',
    'views/admin/console.ejs',
    'views/admin/players.ejs',
    'views/admin/properties.ejs',
    'views/admin/logs.ejs',
    'views/admin/settings.ejs',
    'views/admin/restart.ejs',
    'views/admin/error.ejs',
    'views/partials/header.ejs',
    'views/partials/footer.ejs',
    'views/partials/sidebar.ejs',
    'public/css/style.css',
    'public/js/theme.js',
    'public/js/admin.js',
];

/**
 * Создать директорию, если не существует
 */
function ensureDirectory(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        deployLogger.info(`Создана директория: ${dirPath}`);
        return true;
    }
    return false;
}

/**
 * Создать файл с содержимым по умолчанию, если не существует
 */
function ensureFile(filePath, defaultContent = '') {
    if (!fs.existsSync(filePath)) {
        const dir = path.dirname(filePath);
        ensureDirectory(dir);
        fs.writeFileSync(filePath, defaultContent, 'utf8');
        deployLogger.info(`Создан файл: ${filePath}`);
        return true;
    }
    return false;
}

/**
 * Проверить и создать всю структуру веб-приложения
 */
function setupWebStructure() {
    deployLogger.info('Проверка структуры веб-приложения...');

    const webDir = __dirname;
    let created = 0;

    // Создание директорий
    for (const dir of REQUIRED_DIRECTORIES) {
        const fullPath = path.join(webDir, dir);
        if (ensureDirectory(fullPath)) created++;
    }

    // Создание файлов с содержимым по умолчанию
    for (const file of REQUIRED_FILES) {
        const fullPath = path.join(webDir, file);
        if (!fs.existsSync(fullPath)) {
            const defaultContent = getDefaultFileContent(file);
            if (ensureFile(fullPath, defaultContent)) created++;
        }
    }

    deployLogger.success(`Структура проверена. Создано/обновлено: ${created}`);

    return { success: true, created };
}

/**
 * Получить содержимое по умолчанию для файла
 */
function getDefaultFileContent(filename) {
    const basename = path.basename(filename, '.ejs');

    switch (basename) {
        case 'style':
            return getDefaultCSS();
        case 'theme':
            return getDefaultThemeJS();
        case 'admin':
            return getDefaultAdminJS();
        default:
            return getDefaultEJS(basename);
    }
}

/**
 * Базовый CSS
 */
function getDefaultCSS() {
    return `
/* Resistance City v5.0.0 — Основные стили */
:root {
    --primary: #6343d4;
    --primary-light: #7b47e2;
    --primary-dark: #4a2fb0;
    --success: #76C519;
    --warning: #FFB800;
    --danger: #CA4E4E;
    --info: #80C4C5;
    --bg-dark: #1a1a2e;
    --bg-darker: #16162a;
    --bg-card: #222244;
    --text-primary: #D4D4D4;
    --text-secondary: #a0a0b0;
    --text-muted: #666680;
    --border: #333355;
}

* { margin: 0; padding: 0; box-sizing: border-box; }

body {
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    background: linear-gradient(135deg, var(--bg-dark) 0%, var(--bg-darker) 100%);
    color: var(--text-primary);
    min-height: 100vh;
    line-height: 1.6;
}

a { color: var(--info); text-decoration: none; }
a:hover { color: var(--primary-light); }

.container { max-width: 1200px; margin: 0 auto; padding: 0 20px; }

.btn {
    display: inline-block;
    padding: 10px 20px;
    border-radius: 8px;
    border: none;
    cursor: pointer;
    font-size: 14px;
    font-weight: 600;
    transition: all 0.3s ease;
}

.btn-primary { background: var(--primary); color: white; }
.btn-primary:hover { background: var(--primary-light); }
.btn-success { background: var(--success); color: #000; }
.btn-warning { background: var(--warning); color: #000; }
.btn-danger { background: var(--danger); color: white; }

.card {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 24px;
    margin-bottom: 20px;
    transition: all 0.3s ease;
}

.card:hover {
    border-color: var(--primary);
    box-shadow: 0 0 20px rgba(99, 67, 212, 0.2);
}

.text-gradient {
    background: linear-gradient(135deg, #6343d4, #aa4eff);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
}

.grid { display: grid; gap: 20px; }
.grid-2 { grid-template-columns: repeat(2, 1fr); }
.grid-3 { grid-template-columns: repeat(3, 1fr); }
.grid-4 { grid-template-columns: repeat(4, 1fr); }

@media (max-width: 768px) {
    .grid-2, .grid-3, .grid-4 { grid-template-columns: 1fr; }
}

.stat-card {
    text-align: center;
    padding: 20px;
}

.stat-value {
    font-size: 2rem;
    font-weight: bold;
    color: var(--primary-light);
}

.stat-label {
    font-size: 0.9rem;
    color: var(--text-secondary);
    margin-top: 4px;
}

table {
    width: 100%;
    border-collapse: collapse;
}

th, td {
    padding: 12px 16px;
    text-align: left;
    border-bottom: 1px solid var(--border);
}

th {
    background: var(--bg-darker);
    color: var(--text-secondary);
    font-weight: 600;
    font-size: 0.85rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

tr:hover td {
    background: rgba(99, 67, 212, 0.05);
}

.badge {
    display: inline-block;
    padding: 4px 10px;
    border-radius: 20px;
    font-size: 0.75rem;
    font-weight: 600;
}

.badge-success { background: var(--success); color: #000; }
.badge-warning { background: var(--warning); color: #000; }
.badge-danger { background: var(--danger); color: white; }
.badge-info { background: var(--info); color: #000; }

.pagination {
    display: flex;
    justify-content: center;
    gap: 8px;
    margin-top: 20px;
}

.pagination a, .pagination span {
    padding: 8px 14px;
    border-radius: 6px;
    background: var(--bg-card);
    border: 1px solid var(--border);
    color: var(--text-primary);
    text-decoration: none;
    transition: all 0.2s ease;
}

.pagination a:hover { background: var(--primary); border-color: var(--primary); }
.pagination .active { background: var(--primary); border-color: var(--primary); }

.fade-in { animation: fadeIn 0.5s ease; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
`;
}

function getDefaultThemeJS() {
    return `
// Resistance City — Theme Toggle
(function() {
    const theme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    
    function toggleTheme() {
        const current = document.documentElement.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('theme', next);
    }
    
    window.toggleTheme = toggleTheme;
})();
`;
}

function getDefaultAdminJS() {
    return `
// Resistance City — Admin Panel JS
document.addEventListener('DOMContentLoaded', function() {
    // Подтверждение действий
    document.querySelectorAll('[data-confirm]').forEach(el => {
        el.addEventListener('click', function(e) {
            if (!confirm(this.dataset.confirm || 'Вы уверены?')) {
                e.preventDefault();
            }
        });
    });
    
    // Автообновление статистики
    if (document.querySelector('.auto-refresh')) {
        setInterval(() => {
            fetch('/api/stats')
                .then(r => r.json())
                .then(data => {
                    if (data.success) {
                        updateStats(data.data);
                    }
                })
                .catch(console.error);
        }, 30000);
    }
});

function updateStats(stats) {
    // Обновление значений на дашборде
    const elements = {
        'stat-rp': stats.rpCount,
        'stat-clan': stats.clanCount,
        'stat-online': stats.onlineCount,
    };
    for (const [id, value] of Object.entries(elements)) {
        const el = document.getElementById(id);
        if (el && value !== undefined) el.textContent = value;
    }
}
`;
}

function getDefaultEJS(name) {
    const defaults = {
        'index': '<%- include("partials/header") %>\n<div class="container">\n  <h1 class="text-gradient">Resistance City</h1>\n  <p>Добро пожаловать в Свободный Город!</p>\n</div>\n<%- include("partials/footer") %>',
        'message': '<%- include("partials/header") %>\n<div class="container">\n  <div class="card">\n    <h2><%= title %></h2>\n    <p><%= message %></p>\n  </div>\n</div>\n<%- include("partials/footer") %>',
        'profile': '<%- include("partials/header") %>\n<div class="container">\n  <h1>Профиль: <%= username %></h1>\n</div>\n<%- include("partials/footer") %>',
        'top': '<%- include("partials/header") %>\n<div class="container">\n  <h1><%= title %></h1>\n</div>\n<%- include("partials/footer") %>',
        'career': '<%- include("partials/header") %>\n<div class="container">\n  <h1>Карьера в Resistance</h1>\n</div>\n<%- include("partials/footer") %>',
        'login': '<!DOCTYPE html>\n<html>\n<head>\n  <title><%= title %></title>\n  <link rel="stylesheet" href="/css/style.css">\n</head>\n<body>\n  <div class="login-container">\n    <h1 class="text-gradient">Resistance Admin</h1>\n    <form method="POST" action="/admin/login">\n      <input type="text" name="username" placeholder="Логин" required>\n      <input type="password" name="password" placeholder="Пароль" required>\n      <button type="submit" class="btn btn-primary">Войти</button>\n    </form>\n  </div>\n</body>\n</html>',
        'dashboard': '<%- include("../partials/header") %>\n<div class="container">\n  <h1>Админ-панель</h1>\n</div>\n<%- include("../partials/footer") %>',
        'header': '<nav class="navbar">\n  <a href="/" class="logo">Resistance</a>\n  <div class="nav-links">\n    <a href="/">Главная</a>\n    <a href="/top">Топ</a>\n    <a href="/career">Карьера</a>\n    <a href="/properties">Недвижимость</a>\n  </div>\n</nav>',
        'footer': '<footer>\n  <p>&copy; <%= currentYear %> Resistance City. Все права защищены.</p>\n</footer>',
        'sidebar': '<aside class="sidebar">\n  <a href="/admin/dashboard">Дашборд</a>\n  <a href="/admin/players">Игроки</a>\n  <a href="/admin/properties">Имущество</a>\n  <a href="/admin/logs">Логи</a>\n  <a href="/admin/settings">Настройки</a>\n  <a href="/admin/console">Консоль</a>\n  <a href="/admin/logout">Выход</a>\n</aside>',
        'error': '<%- include("../partials/header") %>\n<div class="container">\n  <div class="card">\n    <h2 class="text-danger">Ошибка</h2>\n    <p><%= error %></p>\n    <a href="/admin/dashboard" class="btn btn-primary">На дашборд</a>\n  </div>\n</div>\n<%- include("../partials/footer") %>',
    };

    return defaults[name] || '<div>Шаблон <%= title %></div>';
}

// ==================== ПРОВЕРКА ЗАВИСИМОСТЕЙ ====================

function checkDependencies() {
    deployLogger.info('Проверка зависимостей...');

    const required = ['express', 'ejs', 'express-session', 'body-parser', 'helmet'];
    const missing = [];

    for (const dep of required) {
        try {
            require.resolve(dep);
        } catch (e) {
            missing.push(dep);
        }
    }

    if (missing.length > 0) {
        deployLogger.error(`Отсутствуют зависимости: ${missing.join(', ')}`);
        deployLogger.info('Установите их командой: npm install ' + missing.join(' '));
        return { success: false, missing };
    }

    deployLogger.success('Все зависимости установлены');
    return { success: true };
}

// ==================== ГЛАВНАЯ ФУНКЦИЯ ДЕПЛОЯ ====================

async function deploy() {
    deployLogger.info('╔══════════════════════════════════════════╗');
    deployLogger.info('║  ДЕПЛОЙ WEB-ПРИЛОЖЕНИЯ                   ║');
    deployLogger.info('╚══════════════════════════════════════════╝');

    // Проверка зависимостей
    const depsCheck = checkDependencies();
    if (!depsCheck.success) {
        deployLogger.error('Деплой прерван: отсутствуют зависимости');
        return depsCheck;
    }

    // Создание структуры
    const structResult = setupWebStructure();

    // Проверка переменных окружения
    if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === 'default_secret_change_me') {
        deployLogger.warn('⚠ SESSION_SECRET не изменён! Рекомендуется задать уникальное значение в .env');
    }

    deployLogger.success('✅ Деплой веб-приложения завершён!');

    return {
        success: true,
        dependencies: depsCheck,
        structure: structResult,
    };
}

// ==================== ЭКСПОРТ ====================
module.exports = {
    deploy,
    setupWebStructure,
    checkDependencies,
    ensureDirectory,
    ensureFile,
    REQUIRED_DIRECTORIES,
    REQUIRED_FILES,
};