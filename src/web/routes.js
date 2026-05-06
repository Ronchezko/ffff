// src/web/routes.js — Роутер веб-сервера Resistance City v5.0.0
// Все маршруты: главная, профили, топы, API, админ-панель, управление БД

'use strict';

const express = require('express');
const router = express.Router();
const path = require('path');
const { logger, createLogger } = require('../shared/logger');
const config = require('../config');
const db = require('../database');
const utils = require('../shared/utils');
const permissions = require('../shared/permissions');
const auth = require('./auth');

const webLogger = createLogger('WebRoutes');

// ==================== MIDDLEWARE ====================

// Передача общих данных во все шаблоны
router.use((req, res, next) => {
    res.locals.currentYear = new Date().getFullYear();
    res.locals.clanName = config.clan.name;
    res.locals.clanColor = config.clan.fullColor;
    res.locals.path = req.path;
    res.locals.query = req.query;
    res.locals.user = req.session.user || null;
    res.locals.isAuthenticated = !!req.session.user;
    res.locals.isAdmin = req.session.user && req.session.user.role === 'admin';
    next();
});

// ==================== ПУБЛИЧНЫЕ СТРАНИЦЫ ====================

// Главная страница
router.get('/', async (req, res) => {
    try {
        const stats = {
            rpCount: db.rpMembers.count(),
            clanCount: db.members.count(),
            onlineCount: db.rpMembers.countOnline(),
            propertiesOwned: db.properties.getAll().filter(p => p.is_owned).length,
            jailedCount: db.all(
                "SELECT COUNT(*) as count FROM rp_members WHERE is_in_jail = 1 AND is_active = 1"
            )[0]?.count || 0,
            totalMoney: db.all(
                'SELECT SUM(balance) as total FROM rp_members WHERE is_active = 1'
            )[0]?.total || 0,
            totalBankMoney: db.all(
                'SELECT SUM(balance) as total FROM bank_accounts WHERE is_active = 1'
            )[0]?.total || 0,
        };

        const recentJoins = db.all(
            'SELECT * FROM members WHERE is_in_clan = 1 ORDER BY joined_at DESC LIMIT 5'
        );

        const topBalance = db.all(
            'SELECT username, balance FROM rp_members WHERE is_active = 1 ORDER BY balance DESC LIMIT 5'
        );

        const topKills = db.all(
            'SELECT username, kills, deaths FROM members WHERE is_in_clan = 1 ORDER BY kills DESC LIMIT 5'
        );

        const organizations = [];
        for (const [key, org] of Object.entries(config.organizations)) {
            const budget = db.orgBudgets.get(key);
            const employeeCount = db.all(
                'SELECT COUNT(*) as count FROM rp_members WHERE organization = ? AND is_active = 1',
                [org.name]
            )[0]?.count || 0;

            organizations.push({
                key,
                name: org.name,
                budget: budget?.budget || org.budget,
                employees: employeeCount,
                isFrozen: budget?.is_frozen || false,
            });
        }

        res.render('index', {
            title: 'Resistance City — Свободный Город',
            stats,
            recentJoins,
            topBalance,
            topKills,
            organizations,
            page: 'home',
        });
    } catch (error) {
        webLogger.error(`Ошибка главной: ${error.message}`);
        res.status(500).render('message', {
            title: 'Ошибка сервера',
            message: 'Произошла ошибка при загрузке страницы. Попробуйте позже.',
            type: 'error',
        });
    }
});

// Профиль игрока
router.get('/profile/:username', async (req, res) => {
    try {
        const username = req.params.username;

        if (!username || !utils.isValidMinecraftUsername(username)) {
            return res.status(400).render('message', {
                title: 'Ошибка',
                message: 'Некорректный никнейм',
                type: 'error',
            });
        }

        const rpMember = db.rpMembers.get(username);
        const clanMember = db.members.get(username);

        if ((!rpMember || rpMember.is_active !== 1) && (!clanMember || clanMember.is_in_clan !== 1)) {
            return res.status(404).render('message', {
                title: 'Игрок не найден',
                message: `Игрок "${username}" не найден в базе данных Resistance.`,
                type: 'warning',
            });
        }

        const bankAccount = db.bank.getAccount(username);
        const properties = db.properties.getOwned(username);
        const education = db.education.get(username);
        const licenses = db.licenses.getActive(username);
        const activePunishments = db.punishments.getActive(username);
        const fines = db.fines.getAll(username);
        const jailRecords = db.all(
            'SELECT * FROM jail_records WHERE username_lower = ? ORDER BY jail_start DESC LIMIT 10',
            [username.toLowerCase()]
        );

        const monthlyBalanceChanges = db.all(
            `SELECT type, SUM(ABS(amount)) as total
             FROM balance_logs
             WHERE username_lower = ? AND created_at > datetime('now', '-30 days')
             GROUP BY type
             ORDER BY total DESC
             LIMIT 10`,
            [username.toLowerCase()]
        );

        res.render('profile', {
            title: `Профиль: ${username}`,
            username,
            rpMember,
            clanMember,
            bankAccount,
            properties,
            education,
            licenses,
            activePunishments,
            fines,
            jailRecords,
            monthlyBalanceChanges,
            page: 'profile',
        });
    } catch (error) {
        webLogger.error(`Ошибка профиля ${req.params.username}: ${error.message}`);
        res.status(500).render('message', {
            title: 'Ошибка',
            message: 'Ошибка загрузки профиля',
            type: 'error',
        });
    }
});

// Топ игроков
router.get('/top', async (req, res) => {
    try {
        const type = req.query.type || 'balance';
        const page = parseInt(req.query.page) || 1;
        const perPage = 20;
        const offset = (page - 1) * perPage;

        let title, results, totalCount;

        switch (type) {
            case 'balance':
                title = 'Топ по балансу';
                results = db.all(
                    'SELECT username, balance FROM rp_members WHERE is_active = 1 ORDER BY balance DESC LIMIT ? OFFSET ?',
                    [perPage, offset]
                );
                totalCount = db.rpMembers.count();
                break;

            case 'kills':
                title = 'Топ по убийствам';
                results = db.all(
                    'SELECT username, kills, deaths FROM members WHERE is_in_clan = 1 ORDER BY kills DESC LIMIT ? OFFSET ?',
                    [perPage, offset]
                );
                totalCount = db.members.count();
                break;

            case 'hours':
                title = 'Топ по часам в RP';
                results = db.all(
                    'SELECT username, total_hours, payday_count FROM rp_members WHERE is_active = 1 ORDER BY total_hours DESC LIMIT ? OFFSET ?',
                    [perPage, offset]
                );
                totalCount = db.rpMembers.count();
                break;

            case 'payday':
                title = 'Топ по количеству PayDay';
                results = db.all(
                    'SELECT username, payday_count, total_hours FROM rp_members WHERE is_active = 1 ORDER BY payday_count DESC LIMIT ? OFFSET ?',
                    [perPage, offset]
                );
                totalCount = db.rpMembers.count();
                break;

            case 'properties':
                title = 'Топ по количеству имущества';
                const allProps = db.properties.getAll();
                const playerPropCount = {};
                for (const p of allProps) {
                    if (p.is_owned && p.owner) {
                        playerPropCount[p.owner] = (playerPropCount[p.owner] || 0) + 1;
                    }
                }
                results = Object.entries(playerPropCount)
                    .sort((a, b) => b[1] - a[1])
                    .slice(offset, offset + perPage)
                    .map(([username, count]) => ({ username, property_count: count }));
                totalCount = Object.keys(playerPropCount).length;
                break;

            default:
                title = 'Топ по балансу';
                results = db.all(
                    'SELECT username, balance FROM rp_members WHERE is_active = 1 ORDER BY balance DESC LIMIT ? OFFSET ?',
                    [perPage, offset]
                );
                totalCount = db.rpMembers.count();
        }

        const totalPages = Math.ceil(totalCount / perPage);

        res.render('top', {
            title,
            type,
            results,
            pagination: { page, totalPages, totalCount, perPage },
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

// Карьера / Организации
router.get('/career', async (req, res) => {
    try {
        const organizations = [];

        for (const [key, org] of Object.entries(config.organizations)) {
            const budget = db.orgBudgets.get(key);
            const members = db.all(
                'SELECT username, rank, points FROM rp_members WHERE organization = ? AND is_active = 1 ORDER BY rank, username',
                [org.name]
            );

            const ranks = Object.entries(org.ranks).map(([name, info]) => {
                const count = members.filter(m => m.rank === name).length;
                return {
                    name,
                    salary: info.salary,
                    level: info.level,
                    category: info.category,
                    count,
                };
            });

            organizations.push({
                key,
                name: org.name,
                budget: budget?.budget || org.budget,
                materials: budget?.materials || 0,
                isFrozen: budget?.is_frozen || false,
                totalMembers: members.length,
                ranks,
            });
        }

        res.render('career', {
            title: 'Карьера в Resistance',
            organizations,
            page: 'career',
        });
    } catch (error) {
        webLogger.error(`Ошибка карьеры: ${error.message}`);
        res.status(500).render('message', {
            title: 'Ошибка',
            message: 'Ошибка загрузки информации о карьере',
            type: 'error',
        });
    }
});

// Рынок недвижимости
router.get('/properties', async (req, res) => {
    try {
        const type = req.query.type || 'all';
        const page = parseInt(req.query.page) || 1;
        const perPage = 30;
        const offset = (page - 1) * perPage;

        const allProperties = db.properties.getAll();
        let propertyList = [];

        for (const prop of allProperties) {
            const propConfig = config.getPropertyInfo(prop.property_id);
            if (!propConfig) continue;

            if (type !== 'all' && propConfig.type !== type) continue;

            propertyList.push({
                id: prop.property_id,
                type: propConfig.type,
                typeName: getTypeName(propConfig.type),
                price: propConfig.price,
                isOwned: prop.is_owned,
                owner: prop.owner,
                coOwner1: prop.co_owner_1,
                coOwner2: prop.co_owner_2,
                regionName: prop.region_name || `${config.clan.regionPrefix}${prop.property_id}`,
            });
        }

        propertyList.sort((a, b) => {
            if (a.isOwned !== b.isOwned) return a.isOwned ? 1 : -1;
            return parseFloat(a.id) - parseFloat(b.id);
        });

        const totalCount = propertyList.length;
        const totalPages = Math.ceil(totalCount / perPage);
        const currentPage = Math.min(page, Math.max(1, totalPages));
        const pageItems = propertyList.slice(offset, offset + perPage);

        res.render('properties', {
            title: 'Рынок недвижимости',
            properties: pageItems,
            type,
            pagination: { page: currentPage, totalPages, totalCount, perPage },
            page: 'properties',
        });
    } catch (error) {
        webLogger.error(`Ошибка недвижимости: ${error.message}`);
        res.status(500).render('message', {
            title: 'Ошибка',
            message: 'Ошибка загрузки рынка недвижимости',
            type: 'error',
        });
    }
});

// ==================== API ====================

// API: Статистика города
router.get('/api/stats', async (req, res) => {
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
            frozenCount: db.all(
                'SELECT COUNT(*) as count FROM rp_members WHERE is_frozen = 1 AND is_active = 1'
            )[0]?.count || 0,
            totalMoney: db.all(
                'SELECT SUM(balance) as total FROM rp_members WHERE is_active = 1'
            )[0]?.total || 0,
            totalBankMoney: db.all(
                'SELECT SUM(balance) as total FROM bank_accounts WHERE is_active = 1'
            )[0]?.total || 0,
            propertiesOwned: db.properties.getAll().filter(p => p.is_owned).length,
            activePunishments: db.all(
                "SELECT COUNT(*) as count FROM punishment_logs WHERE is_active = 1 AND (expires_at IS NULL OR expires_at > datetime('now'))"
            )[0]?.count || 0,
            activeMutes: db.all(
                "SELECT COUNT(*) as count FROM punishment_logs WHERE type IN ('mute', 'pm_mute') AND is_active = 1 AND (expires_at IS NULL OR expires_at > datetime('now'))"
            )[0]?.count || 0,
            activeBlacklists: db.all(
                "SELECT COUNT(*) as count FROM punishment_logs WHERE type = 'blacklist' AND is_active = 1 AND (expires_at IS NULL OR expires_at > datetime('now'))"
            )[0]?.count || 0,
            organizations: db.orgBudgets.getAll().map(o => ({
                name: o.name,
                budget: o.budget,
                materials: o.materials,
                employees: db.all(
                    'SELECT COUNT(*) as count FROM rp_members WHERE organization = ? AND is_active = 1',
                    [o.name]
                )[0]?.count || 0,
            })),
            timestamp: new Date().toISOString(),
        };

        res.json({ success: true, data: stats });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// API: Поиск игрока
router.get('/api/player/:username', async (req, res) => {
    try {
        const username = req.params.username;
        const rpMember = db.rpMembers.get(username);

        if (!rpMember || rpMember.is_active !== 1) {
            return res.status(404).json({ success: false, error: 'Player not found' });
        }

        res.json({
            success: true,
            data: {
                username: rpMember.username,
                id: rpMember.id,
                balance: rpMember.balance,
                organization: rpMember.organization,
                rank: rpMember.rank,
                points: rpMember.points,
                isInCity: rpMember.is_in_city === 1,
                isInJail: rpMember.is_in_jail === 1,
                isSick: rpMember.is_sick === 1,
            },
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// API: Список игроков для поиска
router.get('/api/players', async (req, res) => {
    try {
        const search = req.query.search || '';
        const limit = parseInt(req.query.limit) || 20;

        let players;
        if (search) {
            players = db.all(
                'SELECT username, id, balance, organization, rank FROM rp_members WHERE username_lower LIKE ? AND is_active = 1 ORDER BY username LIMIT ?',
                [`%${search.toLowerCase()}%`, limit]
            );
        } else {
            players = db.all(
                'SELECT username, id, balance, organization, rank FROM rp_members WHERE is_active = 1 ORDER BY username LIMIT ?',
                [limit]
            );
        }

        res.json({ success: true, data: players, count: players.length });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== АДМИН-ПАНЕЛЬ ====================

// Middleware для админ-маршрутов
function requireAdmin(req, res, next) {
    if (!req.session.user || req.session.user.role !== 'admin') {
        req.session.returnTo = req.originalUrl;
        return res.redirect('/admin/login');
    }
    next();
}

// Логин
router.get('/admin/login', (req, res) => {
    if (req.session.user && req.session.user.role === 'admin') {
        return res.redirect('/admin/dashboard');
    }
    res.render('admin/login', {
        title: 'Вход в админ-панель',
        error: req.query.error || null,
        layout: false,
    });
});

router.post('/admin/login', (req, res) => {
    const { username, password } = req.body;
    const adminUser = process.env.ADMIN_USERNAME || config.web.adminUsername;
    const adminPass = process.env.ADMIN_PASSWORD || config.web.adminPassword;

    if (username === adminUser && password === adminPass) {
        req.session.user = {
            username: adminUser,
            role: 'admin',
            ip: req.ip,
            userAgent: req.get('user-agent'),
            loginTime: new Date().toISOString(),
        };
        req.session.save();

        webLogger.info(`Администратор вошёл: ${username} (IP: ${req.ip})`);

        const redirectTo = req.session.returnTo || '/admin/dashboard';
        delete req.session.returnTo;
        return res.redirect(redirectTo);
    }

    webLogger.warn(`Неудачный вход: ${username} (IP: ${req.ip})`);

    res.render('admin/login', {
        title: 'Вход в админ-панель',
        error: 'Неверный логин или пароль',
        layout: false,
    });
});

router.get('/admin/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/admin/login');
});

// Дашборд
router.get('/admin/dashboard', requireAdmin, async (req, res) => {
    try {
        const stats = {
            rpCount: db.rpMembers.count(),
            clanCount: db.members.count(),
            onlineCount: db.rpMembers.countOnline(),
            jailedCount: db.all("SELECT COUNT(*) as count FROM rp_members WHERE is_in_jail = 1 AND is_active = 1")[0]?.count || 0,
            sickCount: db.all("SELECT COUNT(*) as count FROM rp_members WHERE is_sick = 1 AND is_active = 1")[0]?.count || 0,
            frozenCount: db.all('SELECT COUNT(*) as count FROM rp_members WHERE is_frozen = 1 AND is_active = 1')[0]?.count || 0,
            totalMoney: db.all('SELECT SUM(balance) as total FROM rp_members WHERE is_active = 1')[0]?.total || 0,
            totalBankMoney: db.all('SELECT SUM(balance) as total FROM bank_accounts WHERE is_active = 1')[0]?.total || 0,
            propertiesOwned: db.properties.getAll().filter(p => p.is_owned).length,
            activePunishments: db.all("SELECT COUNT(*) as count FROM punishment_logs WHERE is_active = 1 AND (expires_at IS NULL OR expires_at > datetime('now'))")[0]?.count || 0,
            activeMutes: db.all("SELECT COUNT(*) as count FROM punishment_logs WHERE type IN ('mute', 'pm_mute') AND is_active = 1")[0]?.count || 0,
            activeBlacklists: db.all("SELECT COUNT(*) as count FROM punishment_logs WHERE type = 'blacklist' AND is_active = 1")[0]?.count || 0,
        };

        const recentPunishments = db.all("SELECT * FROM punishment_logs ORDER BY issued_at DESC LIMIT 5");
        const recentTransactions = db.all('SELECT * FROM balance_logs WHERE ABS(amount) > 10000 ORDER BY created_at DESC LIMIT 5');

        const recentEvents = [];
        for (const p of recentPunishments || []) {
            recentEvents.push({
                type: 'punishment', icon: '🔨',
                text: `${p.type}: ${p.username} (${p.reason})`,
                time: p.issued_at,
            });
        }
        for (const t of recentTransactions || []) {
            recentEvents.push({
                type: 'transaction', icon: '💰',
                text: `${t.username}: ${t.type} ${utils.formatMoney(t.amount)}`,
                time: t.created_at,
            });
        }
        recentEvents.sort((a, b) => new Date(b.time) - new Date(a.time));

        res.render('admin/dashboard', {
            title: 'Админ-панель',
            stats,
            recentEvents: recentEvents.slice(0, 10),
            page: 'dashboard',
        });
    } catch (error) {
        webLogger.error(`Ошибка дашборда: ${error.message}`);
        res.status(500).render('admin/error', { title: 'Ошибка', error: error.message });
    }
});

// Управление игроками
router.get('/admin/players', requireAdmin, async (req, res) => {
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
            pagination: { page: currentPage, totalPages, totalCount, perPage },
            page: 'players',
        });
    } catch (error) {
        webLogger.error(`Ошибка списка игроков: ${error.message}`);
        res.status(500).render('admin/error', { title: 'Ошибка', error: error.message });
    }
});

// Управление имуществом
router.get('/admin/properties', requireAdmin, async (req, res) => {
    try {
        const properties = db.properties.getAll();
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
        res.status(500).render('admin/error', { title: 'Ошибка', error: error.message });
    }
});

// Просмотр логов
router.get('/admin/logs', requireAdmin, async (req, res) => {
    try {
        const type = req.query.type || 'punishments';
        const page = parseInt(req.query.page) || 1;
        const perPage = 50;

        let logs = [];
        let totalCount = 0;

        switch (type) {
            case 'punishments':
                logs = db.all('SELECT * FROM punishment_logs ORDER BY issued_at DESC LIMIT ? OFFSET ?', [perPage, (page - 1) * perPage]);
                totalCount = db.get('SELECT COUNT(*) as count FROM punishment_logs')?.count || 0;
                break;
            case 'balance':
                logs = db.all('SELECT * FROM balance_logs ORDER BY created_at DESC LIMIT ? OFFSET ?', [perPage, (page - 1) * perPage]);
                totalCount = db.get('SELECT COUNT(*) as count FROM balance_logs')?.count || 0;
                break;
            case 'chat':
                logs = db.all('SELECT * FROM clan_chat_logs ORDER BY created_at DESC LIMIT ? OFFSET ?', [perPage, (page - 1) * perPage]);
                totalCount = db.get('SELECT COUNT(*) as count FROM clan_chat_logs')?.count || 0;
                break;
        }

        const totalPages = Math.ceil(totalCount / perPage);

        res.render('admin/logs', {
            title: 'Просмотр логов',
            logs,
            type,
            pagination: { page, totalPages, totalCount, perPage },
            page: 'logs',
        });
    } catch (error) {
        webLogger.error(`Ошибка логов: ${error.message}`);
        res.status(500).render('admin/error', { title: 'Ошибка', error: error.message });
    }
});

// Настройки
router.get('/admin/settings', requireAdmin, async (req, res) => {
    try {
        const settings = db.settings.getAll();
        res.render('admin/settings', {
            title: 'Настройки',
            settings,
            page: 'settings',
        });
    } catch (error) {
        webLogger.error(`Ошибка настроек: ${error.message}`);
        res.status(500).render('admin/error', { title: 'Ошибка', error: error.message });
    }
});

// Консоль
router.get('/admin/console', requireAdmin, (req, res) => {
    res.render('admin/console', { title: 'Консоль управления', page: 'console' });
});

// Перезапуск
router.get('/admin/restart', requireAdmin, (req, res) => {
    res.render('admin/restart', { title: 'Перезапуск сервисов', page: 'restart' });
});

// База данных — список таблиц
router.get('/admin/db', requireAdmin, async (req, res) => {
    try {
        const tables = db.all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
        const tableList = tables.map(t => {
            const count = db.get(`SELECT COUNT(*) as count FROM "${t.name}"`)?.count || 0;
            return { name: t.name, rowCount: count };
        });

        const totalRows = tableList.reduce((sum, t) => sum + t.rowCount, 0);
        const dbSize = '—';

        res.render('admin/db/index', {
            title: 'База данных',
            tables: tableList,
            tableCount: tableList.length,
            totalRows,
            dbSize,
            page: 'database',
        });
    } catch (error) {
        webLogger.error(`Ошибка БД: ${error.message}`);
        res.status(500).render('admin/error', { title: 'Ошибка', error: error.message });
    }
});

// База данных — просмотр таблицы
router.get('/admin/db/table/:tableName', requireAdmin, async (req, res) => {
    try {
        const tableName = req.params.tableName;
        const page = parseInt(req.query.page) || 1;
        const perPage = 50;
        const offset = (page - 1) * perPage;

        const tableInfo = db.all(`PRAGMA table_info("${tableName}")`);
        const columns = tableInfo.map(c => c.name);

        const totalCount = db.get(`SELECT COUNT(*) as count FROM "${tableName}"`)?.count || 0;
        const totalPages = Math.ceil(totalCount / perPage);

        const rows = db.all(`SELECT * FROM "${tableName}" LIMIT ? OFFSET ?`, [perPage, offset]);

        res.render('admin/db/table', {
            title: `Таблица: ${tableName}`,
            tableName,
            columns,
            rows,
            totalRows: totalCount,
            currentPage: page,
            totalPages,
            page: 'database',
        });
    } catch (error) {
        webLogger.error(`Ошибка просмотра таблицы: ${error.message}`);
        res.status(500).render('admin/error', { title: 'Ошибка', error: error.message });
    }
});

// API: Сохранение настроек
router.post('/api/admin/settings', requireAdmin, (req, res) => {
    try {
        const { key, value } = req.body;
        if (!key) return res.status(400).json({ success: false, error: 'key is required' });
        db.settings.set(key, String(value));
        webLogger.info(`Настройка ${key} изменена на: ${value}`);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// API: Выполнение команды
router.post('/api/admin/command', requireAdmin, (req, res) => {
    try {
        const { command } = req.body;
        if (!command) return res.status(400).json({ success: false, error: 'command is required' });
        if (process.send) {
            process.send({ type: 'minecraft_command', command, from: req.session.user.username });
            res.json({ success: true, message: `Команда отправлена: ${command}` });
        } else {
            res.status(500).json({ success: false, error: 'IPC не доступен' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// API: Перезапуск сервисов
router.post('/api/admin/restart', requireAdmin, (req, res) => {
    try {
        const { service } = req.body;
        if (process.send) {
            process.send({ type: 'restart_service', service: service || 'all', from: req.session.user.username });
            res.json({ success: true, message: `Перезапуск initiated` });
        } else {
            res.status(500).json({ success: false, error: 'IPC не доступен' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== 404 ====================
router.use((req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ success: false, error: 'Not found' });
    }
    res.status(404).render('message', {
        title: '404 — Не найдено',
        message: 'Запрашиваемая страница не существует',
        type: 'error',
    });
});

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================

function getTypeName(type) {
    const names = {
        'apartment': 'Квартира',
        'house': 'Дом',
        'office': 'Офис',
        'business': 'Бизнес',
        'port': 'Порт',
    };
    return names[type] || type;
}

// ==================== ЭКСПОРТ ====================
module.exports = router;