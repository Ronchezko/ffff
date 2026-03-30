// src/web/server.js
const express = require('express');
const session = require('express-session');
const path = require('path');
const logger = require('../shared/logger');
const authRoutes = require('./auth');
const ipWhitelist = require('./middleware/ipWhitelist');

global.botComponents = global.botComponents || { minecraft: null };
let server = null;
let app = null;
let activeBot = null;

// Массив для хранения логов администраторов
global.adminLogs = [];
let globalLogs = [];

// Функция для добавления лога
function addAdminLog(username, action, success, req) {
    const ip = req?.headers['x-forwarded-for'] || req?.socket?.remoteAddress || 'unknown';
    global.adminLogs.push({
        timestamp: new Date().toLocaleString('ru-RU'),
        username,
        ip,
        action,
        success
    });
    if (global.adminLogs.length > 100) global.adminLogs.shift();
}

function addWebLog(msg, type = 'info') {
    globalLogs.unshift({ 
        timestamp: new Date().toLocaleTimeString('ru-RU', { hour12: false }), 
        type, 
        message: msg 
    });
    if (globalLogs.length > 500) globalLogs.pop();
}

function setBot(botInstance) {
    activeBot = botInstance;
    logger.info('🤖 Ссылка на бота передана в веб-сервер');
}

function start(database) {
    if (server) {
        logger.warn('⚠️ Веб-сервер уже запущен, повторный запуск игнорируется');
        return server;
    }

    try {
        logger.info('🚀 Запуск веб-сервера...');
        
        app = express();
        const PORT = process.env.WEB_PORT || 3000;
        
        app.set('view engine', 'ejs');
        app.set('views', path.join(__dirname, 'views'));
        app.disable('view cache');
        
        app.use(express.static(path.join(__dirname, 'public')));
        app.use('/images', express.static(path.join(__dirname, 'images')));
        
        app.use(express.json());
        app.use(express.urlencoded({ extended: true }));
        
        app.use(session({
            secret: process.env.SESSION_SECRET || 'resistance-secret-key',
            resave: false,
            saveUninitialized: false,
            cookie: { 
                httpOnly: true,
                secure: false,
                maxAge: 24 * 60 * 60 * 1000,
                sameSite: 'lax'
            },
            name: 'resistance.sid'
        }));
        
        app.use('/auth', authRoutes(database));
        app.use('/admin', ipWhitelist);

        // ========== ПУБЛИЧНЫЕ МАРШРУТЫ ==========

        app.get('/', (req, res) => {
            try {
                const db = database.getDb();
                const totalPlayers = db.prepare('SELECT COUNT(*) as count FROM clan_members').get().count;
                const rpPlayers = db.prepare('SELECT COUNT(*) as count FROM rp_players').get().count;
                const recentPlayers = db.prepare('SELECT minecraft_nick, joined_at FROM clan_members ORDER BY joined_at DESC LIMIT 5').all();
                const topBalance = db.prepare('SELECT rp.minecraft_nick, rp.money FROM rp_players rp ORDER BY rp.money DESC LIMIT 3').all();
                const leaders = db.prepare(`
                    SELECT sm.minecraft_nick, sm.structure, sm.rank
                    FROM structure_members sm
                    WHERE sm.rank LIKE '%Глав%' OR sm.rank LIKE '%Мэр%' OR sm.rank LIKE '%Директор%'
                    LIMIT 4
                `).all();
                
                res.render('index', { 
                    title: 'Resistance City',
                    totalPlayers,
                    rpPlayers,
                    recentPlayers,
                    topBalance,
                    leaders,
                    clanInfo: { name: 'Resistance', description: 'Свободный город с демократическим укладом', founded: '2025' },
                    user: req.session.user || null,
                    currentPage: 'home'
                });
            } catch (error) {
                logger.error('Ошибка главной:', error);
                res.render('index', { 
                    title: 'Resistance City',
                    totalPlayers: 0,
                    rpPlayers: 0,
                    recentPlayers: [],
                    topBalance: [],
                    leaders: [],
                    clanInfo: {},
                    user: null,
                    currentPage: 'home'
                });
            }
        });

        app.get('/career', (req, res) => {
            res.render('career', { 
                title: 'Карьера в Resistance',
                user: req.session.user || null,
                currentPage: 'career'
            });
        });

        app.get('/top', (req, res) => {
            try {
                const db = database.getDb();
                const topKills = db.prepare('SELECT minecraft_nick, kills FROM clan_members ORDER BY kills DESC LIMIT 10').all();
                const topMoney = db.prepare('SELECT rp.minecraft_nick, rp.money FROM rp_players rp ORDER BY rp.money DESC LIMIT 10').all();
                const topHours = db.prepare('SELECT minecraft_nick, total_hours FROM clan_members ORDER BY total_hours DESC LIMIT 10').all();

                res.render('top', { 
                    title: 'Топ игроков',
                    topKills,
                    topMoney,
                    topHours,
                    user: req.session.user || null,
                    currentPage: 'top'
                });
            } catch (error) {
                logger.error('Ошибка топа:', error);
                res.render('top', { 
                    title: 'Топ игроков',
                    topKills: [],
                    topMoney: [],
                    topHours: [],
                    user: null,
                    currentPage: 'top'
                });
            }
        });

        // ========== ПРОФИЛЬ ==========
        app.get('/profile', async (req, res) => {
            if (!req.session.user) {
                return res.redirect('/');
            }
            
            try {
                const discordId = req.session.user.id;
                const username = req.session.user.username;
                const userAvatar = req.session.user.avatar;
                const userGlobalName = req.session.user.global_name || username;
                
                const db = database.getDb();
                
                let member = null;
                try {
                    member = db.prepare('SELECT * FROM clan_members WHERE discord_id = ?').get(discordId);
                } catch (dbError) {
                    logger.error('Ошибка запроса к БД:', dbError);
                }
                
                if (!member) {
                    return res.render('profile', { 
                        title: 'Профиль',
                        error: 'Ваш Discord не привязан к Minecraft аккаунту. Используйте команду /verify в Discord.',
                        user: req.session.user,
                        player: null,
                        rpPlayer: null,
                        userAvatar: `https://cdn.discordapp.com/avatars/${discordId}/${userAvatar}.png`,
                        userGlobalName,
                        currentPage: 'profile'
                    });
                }
                
                const rpPlayer = db.prepare('SELECT * FROM rp_players WHERE minecraft_nick = ?').get(member.minecraft_nick);
                const properties = rpPlayer ? JSON.parse(rpPlayer.properties || '[]') : [];
                const kills = member.kills || 0;
                const deaths = member.deaths || 0;
                const kd = deaths === 0 ? kills : (kills / deaths).toFixed(2);
                
                const propertyList = [];
                for (const propId of properties) {
                    const prop = db.prepare('SELECT * FROM properties WHERE id = ?').get(propId);
                    if (prop) propertyList.push(prop);
                }
                
                let structureInfo = null;
                if (rpPlayer && rpPlayer.structure) {
                    const members = db.prepare('SELECT COUNT(*) as cnt FROM rp_players WHERE structure = ?').get(rpPlayer.structure);
                    const budget = db.prepare('SELECT balance FROM org_budgets WHERE structure = ?').get(rpPlayer.structure);
                    structureInfo = {
                        name: rpPlayer.structure,
                        rank: rpPlayer.organization_rank,
                        members: members?.cnt || 0,
                        budget: budget?.balance || 0
                    };
                }
                
                res.render('profile', {
                    title: `Профиль ${member.minecraft_nick}`,
                    user: req.session.user,
                    player: member,
                    rpPlayer: rpPlayer,
                    propertyList: propertyList,
                    kills, deaths, kd,
                    userAvatar: `https://cdn.discordapp.com/avatars/${discordId}/${userAvatar}.png`,
                    userGlobalName,
                    structureInfo,
                    currentPage: 'profile',
                    error: null
                });
            } catch (error) {
                logger.error('Ошибка профиля:', error);
                res.render('profile', { 
                    title: 'Профиль',
                    error: 'Ошибка загрузки профиля. Попробуйте позже.',
                    user: req.session.user,
                    player: null,
                    rpPlayer: null,
                    currentPage: 'profile'
                });
            }
        });

        // ========== АДМИН-ПАНЕЛЬ ==========

        app.get('/admin/login', (req, res) => {
            const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
            try {
                const db = database.getDb();
                const attempts = db.prepare(`
                    SELECT COUNT(*) as count FROM login_attempts 
                    WHERE ip = ? AND success = 0 AND attempt_time > datetime('now', '-15 minutes')
                `).get(ip);
                const attemptCount = attempts ? attempts.count : 0;
                const blocked = attemptCount >= 5;
                
                res.render('admin/login', { 
                    title: 'Вход в админку', 
                    currentPage: 'admin',
                    blocked: blocked,
                    attemptsLeft: Math.max(0, 5 - attemptCount),
                    error: null,
                    success: null,
                    user: null
                });
            } catch (error) {
                console.error('Ошибка получения попыток:', error);
                res.render('admin/login', { 
                    title: 'Вход в админку', 
                    currentPage: 'admin',
                    blocked: false,
                    attemptsLeft: 5,
                    error: null,
                    success: null,
                    user: null
                });
            }
        });

        app.post('/admin/login', (req, res) => {
            const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
            const { username, password } = req.body;
            
            if (!username || !password) {
                return res.render('admin/login', { 
                    error: 'Введите логин и пароль', 
                    currentPage: 'admin',
                    blocked: false,
                    attemptsLeft: 5,
                    success: null,
                    user: null
                });
            }
            
            try {
                const db = database.getDb();
                
                const attempts = db.prepare(`
                    SELECT COUNT(*) as count FROM login_attempts 
                    WHERE ip = ? AND success = 0 AND attempt_time > datetime('now', '-15 minutes')
                `).get(ip);
                
                const attemptCount = attempts?.count || 0;
                const isBlocked = attemptCount >= 5;
                
                if (isBlocked) {
                    return res.render('admin/login', { 
                        error: '❌ IP заблокирован на 15 минут. Слишком много попыток.', 
                        currentPage: 'admin',
                        blocked: true,
                        attemptsLeft: 0,
                        success: null,
                        user: null
                    });
                }
                
                const isValid = (username === process.env.ADMIN_LOGIN && password === process.env.ADMIN_PASSWORD) ||
                                (username === process.env.ADMIN_LOGIN_2 && password === process.env.ADMIN_PASSWORD_2);
                
                db.prepare(`
                    INSERT INTO login_attempts (ip, username, success, attempt_time) 
                    VALUES (?, ?, ?, datetime('now'))
                `).run(ip, username || 'unknown', isValid ? 1 : 0);
                
                if (isValid) {
                    db.prepare(`DELETE FROM login_attempts WHERE ip = ? AND success = 0`).run(ip);
                    req.session.user = { username, isAdmin: true };
                    req.session.save((err) => {
                        if (err) {
                            return res.render('admin/login', { 
                                error: 'Ошибка сервера при входе', 
                                currentPage: 'admin',
                                blocked: false,
                                attemptsLeft: 5,
                                success: null,
                                user: null
                            });
                        }
                        return res.redirect('/admin/dashboard');
                    });
                    return;
                } else {
                    const newAttempts = db.prepare(`
                        SELECT COUNT(*) as count FROM login_attempts 
                        WHERE ip = ? AND success = 0 AND attempt_time > datetime('now', '-15 minutes')
                    `).get(ip);
                    const remaining = 5 - (newAttempts?.count || 0);
                    return res.render('admin/login', { 
                        error: `❌ Неверные данные. Осталось попыток: ${remaining}`, 
                        currentPage: 'admin',
                        blocked: remaining <= 0,
                        attemptsLeft: remaining,
                        success: null,
                        user: null
                    });
                }
                
            } catch (error) {
                console.error('Ошибка входа:', error);
                return res.render('admin/login', { 
                    error: 'Внутренняя ошибка сервера', 
                    currentPage: 'admin',
                    blocked: false,
                    attemptsLeft: 5,
                    success: null,
                    user: null
                });
            }
        });

        // ========== ДАШБОРД (исправлен) ==========
        app.get('/admin/dashboard', (req, res) => {
            if (!req.session.user?.isAdmin) return res.redirect('/admin/login');
            try {
                const db = database.getDb();
                const stats = {
                    clan_members: db.prepare('SELECT COUNT(*) as count FROM clan_members').get().count,
                    rp_players: db.prepare('SELECT COUNT(*) as count FROM rp_players').get().count,
                    staff: db.prepare('SELECT COUNT(*) as count FROM staff').get().count,
                    properties: db.prepare('SELECT COUNT(*) as count FROM properties WHERE owner IS NOT NULL').get().count,
                    today_joins: db.prepare(`SELECT COUNT(*) as count FROM clan_members WHERE date(joined_at) = date('now')`).get().count,
                    today_messages: db.prepare(`SELECT COUNT(*) as count FROM clan_chat_logs WHERE date(timestamp) = date('now')`).get().count,
                    today_pvp: db.prepare(`SELECT SUM(kills + deaths) as count FROM clan_members WHERE date(last_seen) = date('now')`).get().count || 0,
                    today_transactions: db.prepare(`SELECT COUNT(*) as count FROM money_logs WHERE date(timestamp) = date('now')`).get().count
                };
                
                const success = req.query.success || null;
                const error = req.query.error || null;
                const lastPayday = global.lastPayday || 'Не проводился';
                
                // Получаем последние действия
                const recentActivities = [];
                const recentLogs = db.prepare(`SELECT 'money' as type, timestamp, player, amount as details FROM money_logs ORDER BY timestamp DESC LIMIT 3`).all();
                const recentJoins = db.prepare(`SELECT 'join' as type, joined_at as timestamp, minecraft_nick as player, 'присоединился' as details FROM clan_members ORDER BY joined_at DESC LIMIT 3`).all();
                
                const allActivities = [...recentLogs, ...recentJoins];
                allActivities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                
                for (const act of allActivities.slice(0, 5)) {
                    let badge = 'info';
                    let text = '';
                    let time = new Date(act.timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
                    
                    if (act.type === 'money') {
                        badge = 'success';
                        text = `${act.player} изменил баланс на ${Math.abs(act.details)}₽`;
                    } else if (act.type === 'join') {
                        badge = 'warning';
                        text = `${act.player} ${act.details}`;
                    }
                    
                    recentActivities.push({ time, text, badge });
                }
                
                res.render('admin/dashboard', { 
                    user: req.session.user, 
                    stats, 
                    success,
                    error,
                    lastPayday,
                    recentActivities,
                    currentPage: 'dashboard' 
                });
            } catch (error) {
                logger.error('Ошибка дашборда:', error);
                res.render('admin/dashboard', { 
                    user: req.session.user, 
                    stats: { clan_members: 0, rp_players: 0, staff: 0, properties: 0, today_joins: 0, today_messages: 0, today_pvp: 0, today_transactions: 0 },
                    success: null,
                    error: 'Ошибка загрузки данных',
                    lastPayday: null,
                    recentActivities: [],
                    currentPage: 'dashboard' 
                });
            }
        });

        // ========== КОНСОЛЬ (исправлен) ==========
        // В server.js, замените маршрут /admin/console на этот:

    app.get('/admin/console', (req, res) => {
        if (!req.session.user?.isAdmin) return res.redirect('/admin/login');
        
        const success = req.query.success || null;
        const error = req.query.error || null;
        
        // Получаем логи из глобальных переменных
        const chatLogs = global.botLogs || [];
        const systemLogs = global.systemLogs || [];
        
        res.render('admin/console', { 
            user: req.session.user, 
            chatLogs: chatLogs.slice(-200), // последние 200 сообщений
            systemLogs: systemLogs.slice(-200), // последние 200 системных логов
            success: success,
            error: error,
            currentPage: 'console' 
        });
    });

        app.get('/admin/console/logs', (req, res) => {
            if (!req.session.user?.isAdmin) return res.status(403).json({ error: 'Forbidden' });
            res.json({ logs: globalLogs.slice(0, 200) });
        });

        app.post('/admin/console/clear', (req, res) => {
            if (!req.session.user?.isAdmin) return res.status(403).json({ error: 'Forbidden' });
            globalLogs = [];
            addWebLog(`🧹 Админ ${req.session.user.username} очистил консоль`, 'info');
            res.json({ success: true });
        });

        app.post('/admin/console/send', (req, res) => {
            if (!req.session.user?.isAdmin) return res.status(403).json({ error: 'Forbidden' });
            const { command, target } = req.body;
            if (!command) return res.status(400).json({ error: 'Команда не указана' });

            if (!activeBot && global.botComponents && global.botComponents.minecraft) {
                activeBot = global.botComponents.minecraft;
            }

            if (!activeBot || !activeBot.chat) {
                return res.status(500).json({ error: 'Бот не активен' });
            }

            try {
                let fullCommand = command;
                if (target === 'clan') {
                    fullCommand = `/cc ${command}`;
                } else if (target === 'global') {
                    fullCommand = command;
                } else if (target && target.startsWith('@')) {
                    fullCommand = `/msg ${target.substring(1)} ${command}`;
                }

                activeBot.chat(fullCommand);
                addWebLog(`📤 ${req.session.user.username}: ${fullCommand}`, 'command');
                res.json({ success: true });
            } catch (error) {
                res.status(500).json({ error: 'Ошибка отправки' });
            }
        });

        // ========== НАСТРОЙКИ (исправлен) ==========
        app.get('/admin/settings', (req, res) => {
            if (!req.session.user?.isAdmin) return res.redirect('/admin/login');
            const settings = database.getDb().prepare('SELECT * FROM settings ORDER BY key').all();
            const success = req.query.success || null;
            const error = req.query.error || null;
            const adminLogs = global.adminLogs || [];
            
            res.render('admin/settings', { 
                user: req.session.user, 
                settings,
                success: success,
                error: error,
                adminLogs: adminLogs,
                currentPage: 'settings' 
            });
        });

        app.post('/admin/settings/update', (req, res) => {
            if (!req.session.user?.isAdmin) return res.redirect('/admin/login');
            for (const [key, val] of Object.entries(req.body)) {
                if (key === 'submit') continue;
                database.getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, val);
            }
            addWebLog(`⚙️ Админ ${req.session.user.username} обновил настройки`, 'info');
            res.redirect('/admin/settings?success=updated');
        });

        app.post('/admin/settings/reset', (req, res) => {
            if (!req.session.user?.isAdmin) return res.status(403).json({ error: 'Forbidden' });
            const defaultSettings = [
                ['auto_moderation_enabled', 'true'], ['clan_ad_enabled', 'true'], ['payday_enabled', 'true'],
                ['tax_property', '1'], ['tax_business', '2'], ['tax_office', '1.5'],
                ['license_business_price', '800000'], ['license_office_price', '900000'], ['license_duration', '7'],
                ['mute_duration', '30'], ['kick_warning_threshold', '3'], ['blacklist_duration', '360']
            ];
            for (const [key, val] of defaultSettings) {
                database.getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, val);
            }
            addWebLog(`🔄 Админ ${req.session.user.username} сбросил настройки`, 'info');
            res.json({ success: true });
        });

        // ========== УПРАВЛЕНИЕ БАЗОЙ ДАННЫХ ==========
        app.get('/admin/db', (req, res) => {
            if (!req.session.user?.isAdmin) return res.redirect('/admin/login');
            const tables = database.getDb().prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
            const success = req.query.success || null;
            const error = req.query.error || null;
            res.render('admin/db/index', { 
                user: req.session.user, 
                tables,
                success: success,
                error: error,
                currentPage: 'db' 
            });
        });

        app.get('/admin/db/:table', (req, res) => {
            if (!req.session.user?.isAdmin) return res.redirect('/admin/login');
            const { table } = req.params;
            const db = database.getDb();
            const page = parseInt(req.query.page) || 1;
            const perPage = 50;
            const rows = db.prepare(`SELECT * FROM "${table}" LIMIT ? OFFSET ?`).all(perPage, (page-1)*perPage);
            const total = db.prepare(`SELECT COUNT(*) as c FROM "${table}"`).get().c;
            const columns = db.prepare(`PRAGMA table_info("${table}")`).all();
            const success = req.query.success || null;
            const error = req.query.error || null;
            
            res.render('admin/db/table', { 
                user: req.session.user, 
                table, 
                columns, 
                rows, 
                page, 
                totalPages: Math.ceil(total/perPage),
                success: success,
                error: error,
                currentPage: 'db' 
            });
        });

        app.get('/admin/db/:table/edit/:id', (req, res) => {
            if (!req.session.user?.isAdmin) return res.redirect('/admin/login');
            const { table, id } = req.params;
            const row = database.getDb().prepare(`SELECT * FROM "${table}" WHERE id = ?`).get(id);
            const columns = database.getDb().prepare(`PRAGMA table_info("${table}")`).all();
            const success = req.query.success || null;
            const error = req.query.error || null;
            
            res.render('admin/db/edit', { 
                user: req.session.user, 
                table, 
                row, 
                columns,
                success: success,
                error: error,
                currentPage: 'db' 
            });
        });

        app.post('/admin/db/:table/edit/:id', (req, res) => {
            if (!req.session.user?.isAdmin) return res.redirect('/admin/login');
            const { table, id } = req.params;
            const data = req.body;
            const fields = Object.keys(data).filter(k => k !== 'id');
            const setClause = fields.map(f => `"${f}" = ?`).join(', ');
            const values = [...fields.map(f => data[f]), id];
            database.getDb().prepare(`UPDATE "${table}" SET ${setClause} WHERE id = ?`).run(...values);
            addWebLog(`📝 Админ ${req.session.user.username} обновил ${table} id=${id}`, 'info');
            res.redirect(`/admin/db/${table}?success=updated`);
        });

        app.post('/admin/db/:table/delete/:id', (req, res) => {
            if (!req.session.user?.isAdmin) return res.redirect('/admin/login');
            const { table, id } = req.params;
            database.getDb().prepare(`DELETE FROM "${table}" WHERE id = ?`).run(id);
            addWebLog(`🗑️ Админ ${req.session.user.username} удалил из ${table} id=${id}`, 'warn');
            res.redirect(`/admin/db/${table}?success=deleted`);
        });

        app.get('/admin/db/:table/new', (req, res) => {
            if (!req.session.user?.isAdmin) return res.redirect('/admin/login');
            const { table } = req.params;
            const columns = database.getDb().prepare(`PRAGMA table_info("${table}")`).all();
            const success = req.query.success || null;
            const error = req.query.error || null;
            
            res.render('admin/db/new', { 
                user: req.session.user, 
                table, 
                columns,
                success: success,
                error: error,
                currentPage: 'db' 
            });
        });

        app.post('/admin/db/:table/new', (req, res) => {
            if (!req.session.user?.isAdmin) return res.redirect('/admin/login');
            const { table } = req.params;
            const data = req.body;
            const fields = Object.keys(data);
            const placeholders = fields.map(() => '?').join(',');
            database.getDb().prepare(`INSERT INTO "${table}" (${fields.map(f => `"${f}"`).join(',')}) VALUES (${placeholders})`).run(...fields.map(f => data[f]));
            addWebLog(`➕ Админ ${req.session.user.username} добавил в ${table}`, 'info');
            res.redirect(`/admin/db/${table}?success=created`);
        });

        // ========== ПЕРЕЗАПУСК БОТА ==========
        app.post('/admin/bot/restart', (req, res) => {
            if (!req.session.user?.isAdmin) return res.status(403).json({ error: 'Forbidden' });
            addWebLog(`🔄 Админ ${req.session.user.username} перезапускает бота`, 'warn');
            
            if (activeBot && typeof activeBot.end === 'function') {
                activeBot.end();
            }
            
            // Запускаем перезапуск через 1 секунду
            setTimeout(() => {
                if (global.botComponents && global.botComponents.minecraft) {
                    const minecraft = require('../minecraft');
                    minecraft.start(database, addWebLog).then(newBot => {
                        global.botComponents.minecraft = newBot;
                        activeBot = newBot;
                        addWebLog('✅ Бот успешно перезапущен', 'success');
                    }).catch(err => {
                        addWebLog(`❌ Ошибка перезапуска: ${err.message}`, 'error');
                    });
                }
            }, 1000);
            
            res.json({ success: true, message: 'Бот перезапускается' });
        });

        // ========== ОЧИСТКА КЭША ==========
        app.post('/admin/cache/clear', (req, res) => {
            if (!req.session.user?.isAdmin) return res.status(403).json({ error: 'Forbidden' });
            
            addWebLog(`🧹 Админ ${req.session.user.username} очистил кэш`, 'info');
            
            // Очищаем require-кэш для модулей проекта
            Object.keys(require.cache).forEach(key => {
                if (!key.includes('node_modules')) {
                    delete require.cache[key];
                }
            });
            
            // Очищаем глобальные логи
            if (globalLogs.length > 0) {
                globalLogs = globalLogs.slice(0, 100);
            }
            
            res.json({ success: true, message: 'Кэш очищен' });
        });

        app.get('/admin/logout', (req, res) => {
            req.session.destroy();
            res.redirect('/');
        });

        server = app.listen(PORT, () => {
            logger.success(`✅ Веб-сервер запущен на порту ${PORT}`);
        });
        
        return server;
    } catch (error) {
        logger.error('❌ Ошибка запуска веб-сервера:', error);
        throw error;
    }
}

function stop() {
    if (server) {
        server.close();
        server = null;
        logger.info('🛑 Веб-сервер остановлен');
    }
}

module.exports = { start, stop, setBot };