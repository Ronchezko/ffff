// src/web/server.js — Веб-сервер Resistance City v5.0.0
// Express сервер с EJS шаблонами, админ-панелью, API и статикой

'use strict';

require('dotenv').config();
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bodyParser = require('body-parser');
const morgan = require('morgan');
const { logger, createLogger } = require('../shared/logger');
const config = require('../config');
const db = require('../database');

const webLogger = createLogger('WebServer');

// ==================== КОНСТАНТЫ ====================
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const NODE_ENV = process.env.NODE_ENV || 'development';
const SESSION_SECRET = process.env.SESSION_SECRET || 'default_secret_change_me_123456789';
const SESSION_MAX_AGE = parseInt(process.env.SESSION_MAX_AGE) || 86400000;

// ==================== СОЗДАНИЕ ПРИЛОЖЕНИЯ ====================
const app = express();

// ==================== НАСТРОЙКА БЕЗОПАСНОСТИ ====================

// Helmet (защитные заголовки)
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdn.jsdelivr.net"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'"],
        },
    },
    crossOriginEmbedderPolicy: false,
}));

// Rate Limiting
const limiter = rateLimit({
    windowMs: parseInt(process.env.WEB_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 минут
    max: parseInt(process.env.WEB_RATE_LIMIT_MAX) || 100,
    message: 'Слишком много запросов. Попробуйте позже.',
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/api/', limiter);

// Более строгий лимит для логина
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: 'Слишком много попыток входа. Попробуйте через 15 минут.',
});
app.use('/admin/login', loginLimiter);
app.use('/api/login', loginLimiter);

// ==================== НАСТРОЙКА СЕССИЙ ====================
const sessionStore = new SQLiteStore({
    db: 'sessions.db',
    dir: path.join(__dirname, '..', '..', 'data'),
    table: 'sessions',
});

app.use(session({
    store: sessionStore,
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: NODE_ENV === 'production',
        httpOnly: true,
        maxAge: SESSION_MAX_AGE,
        sameSite: 'lax',
    },
}));

// ==================== НАСТРОЙКА ШАБЛОНИЗАТОРА ====================
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ==================== НАСТРОЙКА СТАТИКИ ====================
app.use(express.static(path.join(__dirname, 'public')));
app.use('/css', express.static(path.join(__dirname, 'public', 'css')));
app.use('/js', express.static(path.join(__dirname, 'public', 'js')));
app.use('/img', express.static(path.join(__dirname, 'public', 'img')));
app.use('/fonts', express.static(path.join(__dirname, 'public', 'fonts')));

// ==================== НАСТРОЙКА ПАРСИНГА ====================
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// ==================== ЛОГИРОВАНИЕ ЗАПРОСОВ ====================
if (NODE_ENV === 'development') {
    app.use(morgan('dev'));
} else {
    // Кастомный формат для продакшена
    app.use(morgan(':remote-addr - :method :url :status :response-time ms', {
        stream: {
            write: (message) => webLogger.info(message.trim()),
        },
    }));
}

// ==================== ПЕРЕДАЧА ДАННЫХ В ШАБЛОНЫ ====================
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    res.locals.isAuthenticated = !!req.session.user;
    res.locals.isAdmin = req.session.user?.role === 'admin';
    res.locals.NODE_ENV = NODE_ENV;
    res.locals.currentYear = new Date().getFullYear();
    res.locals.config = {
        clanName: config.clan.name,
        clanColor: config.clan.fullColor,
    };
    next();
});

// ==================== МАРШРУТЫ ====================

// Главная страница
app.get('/', async (req, res) => {
    try {
        const stats = {
            rpCount: db.rpMembers.count(),
            clanCount: db.members.count(),
            onlineCount: db.rpMembers.countOnline(),
            propertiesCount: db.properties.getAll().filter(p => p.is_owned).length,
            organizations: db.orgBudgets.getAll().map(o => ({
                name: o.name,
                budget: o.budget,
                employees: db.all(
                    'SELECT COUNT(*) as count FROM rp_members WHERE organization = ? AND is_active = 1',
                    [o.name]
                )[0]?.count || 0,
            })),
        };

        res.render('index', {
            title: 'Resistance City',
            stats,
            page: 'home',
        });
    } catch (error) {
        webLogger.error(`Ошибка главной страницы: ${error.message}`);
        res.status(500).render('message', {
            title: 'Ошибка',
            message: 'Произошла ошибка при загрузке страницы',
            type: 'error',
        });
    }
});

// Профиль игрока
app.get('/profile/:username', async (req, res) => {
    try {
        const username = req.params.username;
        const rpMember = db.rpMembers.get(username);
        const clanMember = db.members.get(username);

        if (!rpMember || !clanMember) {
            return res.status(404).render('message', {
                title: 'Не найдено',
                message: 'Игрок не найден',
                type: 'error',
            });
        }

        const properties = db.properties.getOwned(username);
        const bankAccount = db.bank.getAccount(username);

        res.render('profile', {
            title: `Профиль: ${username}`,
            username,
            rpMember,
            clanMember,
            properties,
            bankAccount,
            page: 'profile',
        });
    } catch (error) {
        webLogger.error(`Ошибка профиля: ${error.message}`);
        res.status(500).render('message', {
            title: 'Ошибка',
            message: 'Ошибка загрузки профиля',
            type: 'error',
        });
    }
});

// Топ игроков
app.get('/top', async (req, res) => {
    try {
        const type = req.query.type || 'balance';
        let title, results;

        switch (type) {
            case 'balance':
                title = 'Топ по балансу';
                results = db.all(
                    'SELECT username, balance FROM rp_members WHERE is_active = 1 ORDER BY balance DESC LIMIT 20'
                );
                break;
            case 'kills':
                title = 'Топ по убийствам';
                results = db.all(
                    'SELECT username, kills, deaths FROM members WHERE is_in_clan = 1 ORDER BY kills DESC LIMIT 20'
                );
                break;
            case 'hours':
                title = 'Топ по часам';
                results = db.all(
                    'SELECT username, total_hours FROM rp_members WHERE is_active = 1 ORDER BY total_hours DESC LIMIT 20'
                );
                break;
            default:
                title = 'Топ по балансу';
                results = db.all(
                    'SELECT username, balance FROM rp_members WHERE is_active = 1 ORDER BY balance DESC LIMIT 20'
                );
        }

        res.render('top', {
            title,
            type,
            results,
            page: 'top',
        });
    } catch (error) {
        webLogger.error(`Ошибка топа: ${error.message}`);
        res.status(500).render('message', {
            title: 'Ошибка',
            message: 'Ошибка загрузки рейтинга',
            type: 'error',
        });
    }
});

// Карьера (информация об организациях)
app.get('/career', async (req, res) => {
    try {
        const organizations = [];
        for (const [key, org] of Object.entries(config.organizations)) {
            const budget = db.orgBudgets.get(key);
            const employees = db.all(
                'SELECT COUNT(*) as count FROM rp_members WHERE organization = ? AND is_active = 1',
                [org.name]
            )[0]?.count || 0;

            organizations.push({
                key,
                name: org.name,
                budget: budget?.budget || org.budget,
                employees,
                ranks: Object.entries(org.ranks).map(([name, info]) => ({
                    name,
                    salary: info.salary,
                    level: info.level,
                    category: info.category,
                })),
            });
        }

        res.render('career', {
            title: 'Карьера в Resistance',
            organizations,
            page: 'career',
        });
    } catch (error) {
        webLogger.error(`Ошибка страницы карьеры: ${error.message}`);
        res.status(500).render('message', {
            title: 'Ошибка',
            message: 'Ошибка загрузки',
            type: 'error',
        });
    }
});

// ==================== АДМИН-ПАНЕЛЬ ====================

// Middleware проверки авторизации для админ-панели
function requireAuth(req, res, next) {
    if (req.session.user && req.session.user.role === 'admin') {
        return next();
    }
    res.redirect('/admin/login');
}

// Страница логина
app.get('/admin/login', (req, res) => {
    if (req.session.user && req.session.user.role === 'admin') {
        return res.redirect('/admin/dashboard');
    }
    res.render('admin/login', {
        title: 'Вход в админ-панель',
        error: null,
        layout: false,
    });
});

// Обработка логина
app.post('/admin/login', (req, res) => {
    const { username, password } = req.body;
    const adminUsername = process.env.ADMIN_USERNAME || config.web.adminUsername;
    const adminPassword = process.env.ADMIN_PASSWORD || config.web.adminPassword;

    if (username === adminUsername && password === adminPassword) {
        req.session.user = {
            username: adminUsername,
            role: 'admin',
            loginTime: new Date().toISOString(),
        };

        webLogger.info(`Администратор ${username} вошёл в панель`);

        // Перенаправление на дашборд
        const redirectTo = req.session.returnTo || '/admin/dashboard';
        delete req.session.returnTo;
        return res.redirect(redirectTo);
    }

    webLogger.warn(`Неудачная попытка входа: ${username}`);

    res.render('admin/login', {
        title: 'Вход в админ-панель',
        error: 'Неверный логин или пароль',
        layout: false,
    });
});

// Выход
app.get('/admin/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/admin/login');
});

// Защищённые маршруты админ-панели
app.get('/admin/dashboard', requireAuth, async (req, res) => {
    try {
        const stats = {
            rpCount: db.rpMembers.count(),
            clanCount: db.members.count(),
            onlineCount: db.rpMembers.countOnline(),
            jailedCount: db.all(
                "SELECT COUNT(*) as count FROM rp_members WHERE is_in_jail = 1 AND is_active = 1"
            )[0]?.count || 0,
            sickCount: db.all(
                "SELECT COUNT(*) as count FROM rp_members WHERE is_sick = 1 AND is_active = 1"
            )[0]?.count || 0,
            totalMoney: db.all(
                'SELECT SUM(balance) as total FROM rp_members WHERE is_active = 1'
            )[0]?.total || 0,
            propertiesOwned: db.properties.getAll().filter(p => p.is_owned).length,
            punishmentCount: db.all(
                "SELECT COUNT(*) as count FROM punishment_logs WHERE is_active = 1"
            )[0]?.count || 0,
        };

        res.render('admin/dashboard', {
            title: 'Админ-панель',
            stats,
            page: 'dashboard',
        });
    } catch (error) {
        webLogger.error(`Ошибка дашборда: ${error.message}`);
        res.status(500).render('message', {
            title: 'Ошибка',
            message: 'Ошибка загрузки дашборда',
            type: 'error',
        });
    }
});

// Консоль управления
app.get('/admin/console', requireAuth, (req, res) => {
    res.render('admin/console', {
        title: 'Консоль управления',
        page: 'console',
    });
});

// Управление игроками
app.get('/admin/players', requireAuth, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const search = req.query.search || '';
        const perPage = 20;

        let query, countQuery, params;

        if (search) {
            query = 'SELECT * FROM rp_members WHERE username_lower LIKE ? AND is_active = 1 ORDER BY username LIMIT ? OFFSET ?';
            countQuery = 'SELECT COUNT(*) as count FROM rp_members WHERE username_lower LIKE ? AND is_active = 1';
            params = [`%${search.toLowerCase()}%`];
        } else {
            query = 'SELECT * FROM rp_members WHERE is_active = 1 ORDER BY username LIMIT ? OFFSET ?';
            countQuery = 'SELECT COUNT(*) as count FROM rp_members WHERE is_active = 1';
            params = [];
        }

        const totalCount = db.get(countQuery, params)?.count || 0;
        const totalPages = Math.ceil(totalCount / perPage);
        const currentPage = Math.min(page, Math.max(1, totalPages));

        const players = db.all(
            query,
            search ? [...params, perPage, (currentPage - 1) * perPage] : [perPage, (currentPage - 1) * perPage]
        );

        res.render('admin/players', {
            title: 'Управление игроками',
            players,
            search,
            pagination: {
                page: currentPage,
                totalPages,
                totalCount,
                perPage,
            },
            page: 'players',
        });
    } catch (error) {
        webLogger.error(`Ошибка списка игроков: ${error.message}`);
        res.status(500).render('message', {
            title: 'Ошибка',
            message: 'Ошибка загрузки списка игроков',
            type: 'error',
        });
    }
});

// Управление имуществом
app.get('/admin/properties', requireAuth, async (req, res) => {
    try {
        const properties = db.properties.getAll();

        // Обогащение данными из конфига
        const enrichedProperties = properties.map(p => ({
            ...p,
            configInfo: config.getPropertyInfo(p.property_id),
        }));

        res.render('admin/properties', {
            title: 'Управление имуществом',
            properties: enrichedProperties,
            page: 'properties',
        });
    } catch (error) {
        webLogger.error(`Ошибка списка имущества: ${error.message}`);
        res.status(500).render('message', {
            title: 'Ошибка',
            message: 'Ошибка загрузки имущества',
            type: 'error',
        });
    }
});

// Просмотр логов
app.get('/admin/logs', requireAuth, async (req, res) => {
    try {
        const type = req.query.type || 'all';
        const page = parseInt(req.query.page) || 1;
        const perPage = 50;

        let logs = [];
        let totalCount = 0;

        switch (type) {
            case 'punishments':
                logs = db.all(
                    'SELECT * FROM punishment_logs ORDER BY issued_at DESC LIMIT ? OFFSET ?',
                    [perPage, (page - 1) * perPage]
                );
                totalCount = db.get('SELECT COUNT(*) as count FROM punishment_logs')?.count || 0;
                break;
            case 'balance':
                logs = db.all(
                    'SELECT * FROM balance_logs ORDER BY created_at DESC LIMIT ? OFFSET ?',
                    [perPage, (page - 1) * perPage]
                );
                totalCount = db.get('SELECT COUNT(*) as count FROM balance_logs')?.count || 0;
                break;
            case 'chat':
                logs = db.all(
                    'SELECT * FROM clan_chat_logs ORDER BY created_at DESC LIMIT ? OFFSET ?',
                    [perPage, (page - 1) * perPage]
                );
                totalCount = db.get('SELECT COUNT(*) as count FROM clan_chat_logs')?.count || 0;
                break;
            default:
                // Общий лог (последние события)
                break;
        }

        const totalPages = Math.ceil(totalCount / perPage);

        res.render('admin/logs', {
            title: 'Просмотр логов',
            logs,
            type,
            pagination: {
                page,
                totalPages,
                totalCount,
                perPage,
            },
            page: 'logs',
        });
    } catch (error) {
        webLogger.error(`Ошибка логов: ${error.message}`);
        res.status(500).render('message', {
            title: 'Ошибка',
            message: 'Ошибка загрузки логов',
            type: 'error',
        });
    }
});

// Настройки
app.get('/admin/settings', requireAuth, async (req, res) => {
    try {
        const settings = db.settings.getAll();

        res.render('admin/settings', {
            title: 'Настройки',
            settings,
            page: 'settings',
        });
    } catch (error) {
        webLogger.error(`Ошибка настроек: ${error.message}`);
        res.status(500).render('message', {
            title: 'Ошибка',
            message: 'Ошибка загрузки настроек',
            type: 'error',
        });
    }
});

// API для сохранения настроек
app.post('/api/admin/settings', requireAuth, (req, res) => {
    try {
        const { key, value } = req.body;

        if (!key) {
            return res.status(400).json({ success: false, error: 'key is required' });
        }

        db.settings.set(key, String(value));

        webLogger.info(`Настройка ${key} изменена на: ${value}`);

        res.json({ success: true });
    } catch (error) {
        webLogger.error(`Ошибка сохранения настройки: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

// API для выполнения команд Minecraft
app.post('/api/admin/command', requireAuth, (req, res) => {
    try {
        const { command } = req.body;

        if (!command) {
            return res.status(400).json({ success: false, error: 'command is required' });
        }

        webLogger.info(`Админ-команда от ${req.session.user.username}: ${command}`);

        // Отправка команды Minecraft боту через IPC
        if (process.send) {
            process.send({
                type: 'minecraft_command',
                command: command,
                from: req.session.user.username,
            });

            res.json({ success: true, message: `Команда отправлена: ${command}` });
        } else {
            res.status(500).json({ success: false, error: 'IPC не доступен' });
        }
    } catch (error) {
        webLogger.error(`Ошибка выполнения команды: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

// API для перезапуска ботов
app.post('/api/admin/restart', requireAuth, (req, res) => {
    try {
        const { service } = req.body; // 'discord', 'minecraft', 'all'

        webLogger.warn(`Запрошен перезапуск: ${service} (${req.session.user.username})`);

        if (process.send) {
            process.send({
                type: 'restart_service',
                service: service || 'all',
                from: req.session.user.username,
            });

            res.json({ success: true, message: `Перезапуск ${service || 'всех'} initiated` });
        } else {
            res.status(500).json({ success: false, error: 'IPC не доступен' });
        }
    } catch (error) {
        webLogger.error(`Ошибка перезапуска: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

// API для получения статистики
app.get('/api/stats', async (req, res) => {
    try {
        const stats = {
            rpCount: db.rpMembers.count(),
            clanCount: db.members.count(),
            onlineCount: db.rpMembers.countOnline(),
            totalMoney: db.all(
                'SELECT SUM(balance) as total FROM rp_members WHERE is_active = 1'
            )[0]?.total || 0,
            propertiesOwned: db.properties.getAll().filter(p => p.is_owned).length,
            organizations: db.orgBudgets.getAll().map(o => ({
                name: o.name,
                budget: o.budget,
                materials: o.materials,
            })),
            timestamp: new Date().toISOString(),
        };

        res.json({ success: true, data: stats });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== ОБРАБОТКА 404 ====================
app.use((req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ success: false, error: 'Not found' });
    }

    res.status(404).render('message', {
        title: '404 — Не найдено',
        message: 'Запрашиваемая страница не существует',
        type: 'error',
    });
});

// ==================== ОБРАБОТКА ОШИБОК ====================
app.use((err, req, res, next) => {
    webLogger.error(`Ошибка сервера: ${err.message}`);
    if (err.stack) webLogger.error(err.stack);

    if (req.path.startsWith('/api/')) {
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }

    res.status(500).render('message', {
        title: '500 — Ошибка сервера',
        message: NODE_ENV === 'development' ? err.message : 'Произошла внутренняя ошибка сервера',
        type: 'error',
    });
});

// ==================== ЗАПУСК СЕРВЕРА ====================
function startServer() {
    return new Promise((resolve, reject) => {
        const server = app.listen(PORT, HOST, () => {
            webLogger.success(`╔══════════════════════════════════════════╗`);
            webLogger.success(`║  WEB SERVER — RESISTANCE CITY v5.0.0     ║`);
            webLogger.success(`╠══════════════════════════════════════════╣`);
            webLogger.success(`║  Адрес: http://${HOST}:${PORT}              ║`);
            webLogger.success(`║  Режим: ${NODE_ENV}                    ║`);
            webLogger.success(`╚══════════════════════════════════════════╝`);

            if (process.send) {
                process.send({
                    type: 'ready',
                    service: 'web',
                    host: HOST,
                    port: PORT,
                });
            }

            resolve(server);
        });

        server.on('error', (error) => {
            webLogger.error(`Ошибка запуска веб-сервера: ${error.message}`);
            reject(error);
        });
    });
}

// ==================== IPC ОТ РОДИТЕЛЯ ====================
process.on('message', async (message) => {
    if (!message || !message.type) return;

    switch (message.type) {
        case 'init':
            webLogger.info('Получено init-сообщение от оркестратора');
            break;

        case 'graceful_shutdown':
            webLogger.warn('Запрос на завершение от оркестратора');
            if (process.send) {
                process.send({ type: 'shutdown', reason: 'graceful' });
            }
            setTimeout(() => process.exit(0), 3000);
            break;

        case 'heartbeat':
            if (process.send) {
                process.send({
                    type: 'stats',
                    data: {
                        uptime: process.uptime(),
                        port: PORT,
                        env: NODE_ENV,
                    },
                });
            }
            break;
    }
});

// ==================== ЗАПУСК ====================
startServer().catch(error => {
    webLogger.error(`Критическая ошибка: ${error.message}`);
    process.exit(1);
});

// ==================== ЭКСПОРТ ====================
module.exports = app;
module.exports.startServer = startServer;