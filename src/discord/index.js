// src/web/routes.js
// Маршруты для админ-панели

const db = require('../database');

// ============================================
// DASHBOARD
// ============================================

async function dashboard(req, res) {
    const totalPlayers = await db.get('SELECT COUNT(*) as count FROM clan_members');
    const onlinePlayers = 0; // TODO: получить из бота
    const totalProperties = await db.get('SELECT COUNT(*) as count FROM property WHERE is_available = 0');
    const totalMoney = await db.get('SELECT SUM(money) as total FROM rp_players');
    
    res.render('admin/dashboard', {
        title: 'Админ панель',
        user: req.session.user,
        stats: {
            totalPlayers: totalPlayers?.count || 0,
            onlinePlayers,
            totalProperties: totalProperties?.count || 0,
            totalMoney: Math.floor(totalMoney?.total || 0)
        },
        logs: global.botLogs?.slice(0, 20) || []
    });
}

// ============================================
// PLAYERS
// ============================================

async function players(req, res) {
    const page = parseInt(req.query.page) || 1;
    const limit = 20;
    const offset = (page - 1) * limit;
    
    const players = await db.all(`
        SELECT c.minecraft_nick, c.kills, c.deaths, c.rank_name, c.joined_at,
               r.money, r.structure, r.job_rank, r.rp_points
        FROM clan_members c
        LEFT JOIN rp_players r ON c.minecraft_nick = r.minecraft_nick
        ORDER BY c.joined_at DESC
        LIMIT ? OFFSET ?
    `, [limit, offset]);
    
    const total = await db.get('SELECT COUNT(*) as count FROM clan_members');
    const totalPages = Math.ceil((total?.count || 0) / limit);
    
    res.render('admin/players', {
        title: 'Управление игроками',
        user: req.session.user,
        players,
        page,
        totalPages
    });
}

// ============================================
// PROPERTIES
// ============================================

async function properties(req, res) {
    const properties = await db.all(`
        SELECT p.*, 
               CASE WHEN b.property_id IS NOT NULL THEN 'business' 
                    WHEN o.property_id IS NOT NULL THEN 'office'
                    ELSE p.type END as real_type
        FROM property p
        LEFT JOIN businesses b ON p.id = b.property_id
        LEFT JOIN offices o ON p.id = o.property_id
        ORDER BY p.id
    `);
    
    res.render('admin/properties', {
        title: 'Управление имуществом',
        user: req.session.user,
        properties
    });
}

// ============================================
// LOGS
// ============================================

async function logs(req, res) {
    const page = parseInt(req.query.page) || 1;
    const limit = 50;
    const offset = (page - 1) * limit;
    
    const chatLogs = await db.all(`
        SELECT * FROM clan_chat_logs ORDER BY sent_at DESC LIMIT ? OFFSET ?
    `, [limit, offset]);
    
    const total = await db.get('SELECT COUNT(*) as count FROM clan_chat_logs');
    const totalPages = Math.ceil((total?.count || 0) / limit);
    
    res.render('admin/logs', {
        title: 'Логи чата',
        user: req.session.user,
        logs: chatLogs,
        page,
        totalPages
    });
}

// ============================================
// SETTINGS
// ============================================

async function settings(req, res) {
    const settings = await db.all('SELECT * FROM settings');
    const settingsMap = {};
    for (const s of settings) {
        settingsMap[s.key] = s.value;
    }
    
    res.render('admin/settings', {
        title: 'Настройки',
        user: req.session.user,
        settings: settingsMap
    });
}

async function updateSettings(req, res) {
    const { auto_mod_enabled, payday_enabled, property_tax_rate } = req.body;
    
    if (auto_mod_enabled) await db.setSetting('auto_mod_enabled', auto_mod_enabled, req.session.user.username);
    if (payday_enabled) await db.setSetting('payday_enabled', payday_enabled, req.session.user.username);
    if (property_tax_rate) await db.setSetting('property_tax_rate', property_tax_rate, req.session.user.username);
    
    res.redirect('/admin/settings');
}

// ============================================
// RESTART
// ============================================

async function restart(req, res) {
    res.render('admin/restart', {
        title: 'Управление ботами',
        user: req.session.user
    });
}

async function restartBot(req, res) {
    // Логика перезапуска ботов
    res.redirect('/admin/restart');
}

async function restartMinecraft(req, res) {
    if (global.botComponents.minecraft?.stop) {
        await global.botComponents.minecraft.stop();
        // Запуск заново
        const minecraft = require('../minecraft');
        global.botComponents.minecraft = await minecraft.start(db, global.addBotLog);
    }
    res.redirect('/admin/restart');
}

async function restartDiscord(req, res) {
    if (global.botComponents.discord?.stop) {
        await global.botComponents.discord.stop();
        const discord = require('../discord');
        global.botComponents.discord = await discord.start(db);
    }
    res.redirect('/admin/restart');
}

// ============================================
// УПРАВЛЕНИЕ БД
// ============================================

async function dbTables(req, res) {
    const tables = await db.all(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name NOT LIKE 'sqlite_%'
        ORDER BY name
    `);
    
    res.render('admin/db/index', {
        title: 'Управление БД',
        user: req.session.user,
        tables: tables.map(t => t.name)
    });
}

async function dbTable(req, res) {
    const tableName = req.params.table;
    const page = parseInt(req.query.page) || 1;
    const limit = 20;
    const offset = (page - 1) * limit;
    
    // Получаем структуру таблицы
    const columns = await db.all(`PRAGMA table_info(${tableName})`);
    const rows = await db.all(`SELECT * FROM ${tableName} LIMIT ? OFFSET ?`, [limit, offset]);
    const total = await db.get(`SELECT COUNT(*) as count FROM ${tableName}`);
    const totalPages = Math.ceil((total?.count || 0) / limit);
    
    res.render('admin/db/table', {
        title: `Таблица: ${tableName}`,
        user: req.session.user,
        table: tableName,
        columns,
        rows,
        page,
        totalPages
    });
}

async function dbNewForm(req, res) {
    const tableName = req.params.table;
    const columns = await db.all(`PRAGMA table_info(${tableName})`);
    
    res.render('admin/db/new', {
        title: `Добавить запись в ${tableName}`,
        user: req.session.user,
        table: tableName,
        columns
    });
}

async function dbCreate(req, res) {
    const tableName = req.params.table;
    const data = req.body;
    
    const columns = Object.keys(data).filter(k => data[k] !== '');
    const placeholders = columns.map(() => '?').join(',');
    const values = columns.map(k => data[k]);
    
    await db.run(`INSERT INTO ${tableName} (${columns.join(',')}) VALUES (${placeholders})`, values);
    
    res.redirect(`/admin/db/${tableName}`);
}

async function dbEditForm(req, res) {
    const { table, id } = req.params;
    const columns = await db.all(`PRAGMA table_info(${table})`);
    const row = await db.get(`SELECT * FROM ${table} WHERE id = ?`, [id]);
    
    res.render('admin/db/edit', {
        title: `Редактировать ${table}`,
        user: req.session.user,
        table,
        columns,
        row,
        id
    });
}

async function dbUpdate(req, res) {
    const { table, id } = req.params;
    const data = req.body;
    
    const setClause = Object.keys(data).map(k => `${k} = ?`).join(',');
    const values = [...Object.values(data), id];
    
    await db.run(`UPDATE ${table} SET ${setClause} WHERE id = ?`, values);
    
    res.redirect(`/admin/db/${table}`);
}

async function dbDelete(req, res) {
    const { table, id } = req.params;
    await db.run(`DELETE FROM ${table} WHERE id = ?`, [id]);
    res.redirect(`/admin/db/${table}`);
}

// ============================================
// ЭКСПОРТ
// ============================================

module.exports = {
    dashboard,
    players,
    properties,
    logs,
    settings,
    updateSettings,
    restart,
    restartBot,
    restartMinecraft,
    restartDiscord,
    dbTables,
    dbTable,
    dbNewForm,
    dbCreate,
    dbEditForm,
    dbUpdate,
    dbDelete
};