// src/database/index.js
const sqlite = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const logger = require('../shared/logger');

let db = null;

function initialize() {
    try {
        logger.info('📦 Инициализация базы данных...');
        const dbPath = path.join(__dirname, '../../data/resistance.db');
        const dbDir = path.dirname(dbPath);

        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
        }

        db = new sqlite.DatabaseSync(dbPath);
        createTables();
        insertInitialData();
        logger.success('✅ База данных готова');
        return db;
    } catch (error) {
        logger.error('❌ Ошибка инициализации БД:', error);
        throw error;
    }
}

function createTables() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS clan_members (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            minecraft_nick TEXT UNIQUE NOT NULL,
            rank TEXT NOT NULL DEFAULT 'Новичок',
            kills INTEGER DEFAULT 0,
            deaths INTEGER DEFAULT 0,
            joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_seen DATETIME,
            total_hours INTEGER DEFAULT 0,
            invited_by TEXT,
            discord_id TEXT,
            is_online BOOLEAN DEFAULT 0
        )
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS rp_players (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            minecraft_nick TEXT UNIQUE NOT NULL,
            money INTEGER DEFAULT 0,
            profession TEXT,
            organization_rank TEXT,
            structure TEXT,
            unique_points INTEGER DEFAULT 0,
            rp_joined DATETIME DEFAULT CURRENT_TIMESTAMP,
            paydays_attended INTEGER DEFAULT 0,
            properties TEXT DEFAULT '[]',
            education BOOLEAN DEFAULT 0,
            warns INTEGER DEFAULT 0,
            frozen BOOLEAN DEFAULT 0,
            duty_start DATETIME,
            on_duty BOOLEAN DEFAULT 0,
            FOREIGN KEY (minecraft_nick) REFERENCES clan_members(minecraft_nick) ON DELETE CASCADE
        )
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS money_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            player TEXT NOT NULL,
            amount INTEGER,
            new_balance INTEGER,
            reason TEXT,
            issued_by TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS punishments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            player TEXT NOT NULL,
            type TEXT NOT NULL,
            reason TEXT,
            issued_by TEXT,
            duration_minutes INTEGER DEFAULT 0,
            expires_at DATETIME,
            issued_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            active BOOLEAN DEFAULT 1
        )
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS clan_chat_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            player TEXT NOT NULL,
            message TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS staff (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            minecraft_nick TEXT UNIQUE NOT NULL,
            discord_id TEXT,
            staff_rank TEXT NOT NULL,
            kicks_today INTEGER DEFAULT 0,
            mutes_today INTEGER DEFAULT 0,
            blacklists_today INTEGER DEFAULT 0,
            last_reset DATE,
            total_warns INTEGER DEFAULT 0,
            appointed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            appointed_by TEXT,
            FOREIGN KEY (minecraft_nick) REFERENCES clan_members(minecraft_nick) ON DELETE CASCADE
        )
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT,
            description TEXT
        )
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS verification_codes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            discord_id TEXT NOT NULL,
            code TEXT UNIQUE NOT NULL,
            minecraft_nick TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            expires_at DATETIME,
            status TEXT DEFAULT 'pending'
        )
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS properties (
            id INTEGER PRIMARY KEY,
            type TEXT NOT NULL,
            price INTEGER NOT NULL,
            owner TEXT,
            co_owners TEXT DEFAULT '[]',
            purchased_at DATETIME,
            last_tax_paid DATETIME,
            license_type TEXT,
            license_expires DATETIME,
            level INTEGER DEFAULT 4,
            correct_answers INTEGER DEFAULT 0,
            wrong_answers INTEGER DEFAULT 0,
            total_answers INTEGER DEFAULT 0,
            profit_data TEXT DEFAULT '{}',
            last_question_sent DATETIME
        )
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS structure_members (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            minecraft_nick TEXT NOT NULL,
            structure TEXT NOT NULL,
            rank TEXT NOT NULL,
            joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            duty_start DATETIME,
            on_duty BOOLEAN DEFAULT 0,
            warns INTEGER DEFAULT 0,
            FOREIGN KEY (minecraft_nick) REFERENCES rp_players(minecraft_nick) ON DELETE CASCADE
        )
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS org_budgets (
            structure TEXT PRIMARY KEY,
            balance INTEGER DEFAULT 100000,
            last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS taxes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            property_type TEXT,
            rate REAL,
            set_by TEXT,
            set_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS login_attempts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ip TEXT NOT NULL,
            username TEXT,
            attempt_time DATETIME DEFAULT CURRENT_TIMESTAMP,
            success BOOLEAN DEFAULT 0
        )
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS join_leave_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            player TEXT NOT NULL,
            action TEXT NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS message_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            player TEXT NOT NULL,
            message TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS duty_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            player TEXT NOT NULL,
            start_time DATETIME,
            end_time DATETIME,
            minutes INTEGER DEFAULT 0,
            structure TEXT
        )
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS office_questions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL,
            question TEXT NOT NULL,
            answer TEXT NOT NULL,
            options TEXT
        )
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS custom_salaries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            structure TEXT NOT NULL,
            rank TEXT NOT NULL,
            salary INTEGER NOT NULL,
            UNIQUE(structure, rank)
        )
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS office_answers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            player_id INTEGER NOT NULL,
            property_id INTEGER NOT NULL,
            question_id INTEGER NOT NULL,
            answer TEXT,
            correct BOOLEAN DEFAULT 0,
            answered_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    logger.info('📊 Таблицы созданы/проверены');
}

function insertInitialData() {
    const settings = [
        ['auto_moderation_enabled', 'true', 'Автоматическая модерация чата'],
        ['clan_ad_enabled', 'true', 'Реклама клана'],
        ['payday_enabled', 'true', 'Система PayDay'],
        ['proxy_enabled', 'false', 'Использование прокси'],
        ['main_bot_active', 'true', 'Какой бот активен'],
        ['tax_property', '1', 'Налог на имущество (%)'],
        ['tax_business', '2', 'Налог на бизнес (%)'],
        ['tax_office', '1.5', 'Налог на офис (%)'],
        ['license_business_price', '800000', 'Цена бизнес-лицензии'],
        ['license_office_price', '900000', 'Цена офисной лицензии'],
        ['license_duration', '7', 'Срок действия лицензии (дней)'],
        ['mute_duration', '30', 'Длительность мута (мин)'],
        ['kick_warning_threshold', '3', 'Предупреждений до кика'],
        ['blacklist_duration', '360', 'Длительность ЧС (мин)'],
        ['warn_threshold', '3', 'Предупреждений до бана'],
        ['payday_min_duty', '15', 'Минут на дежурстве для PayDay'],
        ['payday_hour', '0', 'Час PayDay (0-23)'],
        ['payday_bonus', '10', 'Бонус PayDay (%)'],
        ['debug_mode', 'false', 'Режим отладки'],
        ['max_players_per_property', '2', 'Макс. жильцов на имущество'],
        ['log_all_admin_actions', 'true', 'Логировать действия администраторов'],
        ['discord_bot_enabled', 'true', 'Включить Discord бота']
    ];

    const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value, description) VALUES (?, ?, ?)');
    for (const [key, value, desc] of settings) {
        insertSetting.run(key, value, desc);
    }

    insertOfficeQuestions();
    
    const insertMember = db.prepare('INSERT OR IGNORE INTO clan_members (minecraft_nick, rank) VALUES (?, ?)');
    insertMember.run('Ronch_', 'Администратор');
    
    const insertStaff = db.prepare('INSERT OR IGNORE INTO staff (minecraft_nick, staff_rank, appointed_by) VALUES (?, ?, ?)');
    insertStaff.run('Ronch_', 'Администратор', 'system');
}

function insertOfficeQuestions() {
    const count = db.prepare('SELECT COUNT(*) as cnt FROM office_questions').get().cnt;
    if (count > 0) return;

    const questions = [
        { type: 'crypto', question: 'Что такое хешрейт?', answer: 'Мощность оборудования для майнинга', options: 'Скорость интернета|Мощность оборудования|Количество монет' },
        { type: 'crypto', question: 'Какой алгоритм используется в Bitcoin?', answer: 'SHA-256', options: 'Scrypt|SHA-256|Ethash' },
        { type: 'crypto', question: 'Что такое ASIC-майнер?', answer: 'Специализированное устройство', options: 'Программа для майнинга|Специализированное устройство|Биржа криптовалют' },
        { type: 'crypto', question: 'Что такое блокчейн?', answer: 'Распределённый реестр', options: 'Централизованная база|Криптовалюта|Распределённый реестр' },
        { type: 'crypto', question: 'Что такое халвинг?', answer: 'Уменьшение награды за блок', options: 'Увеличение сложности|Разделение монеты|Уменьшение награды за блок' },
        { type: 'crypto', question: 'Что такое смарт-контракт?', answer: 'Программа на блокчейне', options: 'Юридический договор|Криптокошелёк|Программа на блокчейне' },
        { type: 'it', question: 'Что такое API?', answer: 'Интерфейс для взаимодействия программ', options: 'База данных|Язык программирования|Интерфейс для взаимодействия программ' },
        { type: 'it', question: 'Какой язык используется для бэкенда?', answer: 'JavaScript/Python/Java', options: 'HTML/CSS|SQL|JavaScript/Python/Java' },
        { type: 'it', question: 'Что такое SQL?', answer: 'Язык запросов к БД', options: 'Стиль кода|Сетевой протокол|Язык запросов к БД' },
        { type: 'it', question: 'Что такое Git?', answer: 'Система контроля версий', options: 'Язык программирования|База данных|Система контроля версий' },
        { type: 'marketing', question: 'Что такое SEO?', answer: 'Оптимизация для поисковых систем', options: 'Социальные сети|Реклама|Оптимизация для поисковых систем' },
        { type: 'marketing', question: 'Что такое конверсия?', answer: 'Процент целевых действий', options: 'Количество посетителей|Стоимость рекламы|Процент целевых действий' },
        { type: 'marketing', question: 'Что такое SMM?', answer: 'Маркетинг в соцсетях', options: 'Поисковая оптимизация|Email маркетинг|Маркетинг в соцсетях' },
        { type: 'consulting', question: 'Что такое SWOT-анализ?', answer: 'Анализ сильных и слабых сторон', options: 'Финансовый отчёт|Бизнес-план|Анализ сильных и слабых сторон' },
        { type: 'consulting', question: 'Что такое KPI?', answer: 'Ключевые показатели эффективности', options: 'План развития|Бюджет|Ключевые показатели эффективности' },
        { type: 'consulting', question: 'Что такое бизнес-процесс?', answer: 'Совокупность действий для результата', options: 'Финансовый отчёт|Маркетинговая стратегия|Совокупность действий для результата' }
    ];

    const insert = db.prepare('INSERT INTO office_questions (type, question, answer, options) VALUES (?, ?, ?, ?)');
    for (const q of questions) {
        insert.run(q.type, q.question, q.answer, q.options);
    }
    logger.info(`📚 Добавлено ${questions.length} вопросов для офисов`);
}

// ========== ОСНОВНЫЕ ФУНКЦИИ ==========

function getDb() { return db; }
function close() { if (db) { db.close(); db = null; logger.info('🛑 База данных закрыта'); } }

// ========== НАСТРОЙКИ ==========

function getSetting(key) {
    try { const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key); return row ? row.value : null; }
    catch (error) { return null; }
}

function setSetting(key, value) {
    try { db.prepare('INSERT OR REPLACE INTO settings (key, value, description) VALUES (?, ?, ?)').run(key, value, ''); return true; }
    catch (error) { return false; }
}

// ========== УЧАСТНИКИ ==========

function getPlayerByNickname(nickname) {
    try { return db.prepare('SELECT * FROM clan_members WHERE minecraft_nick = ?').get(nickname); }
    catch (error) { return null; }
}

function getPlayerById(id) {
    try { return db.prepare('SELECT * FROM clan_members WHERE id = ?').get(id); }
    catch (error) { return null; }
}

function getRPPlayer(nickname) {
    try { return db.prepare('SELECT * FROM rp_players WHERE minecraft_nick = ?').get(nickname); }
    catch (error) { return null; }
}

function getRPPlayerById(id) {
    try { return db.prepare('SELECT * FROM rp_players WHERE id = ?').get(id); }
    catch (error) { return null; }
}

function addClanMember(nickname, invitedBy = null) {
    try {
        db.prepare(`INSERT INTO clan_members (minecraft_nick, invited_by, joined_at, last_seen) VALUES (?, ?, datetime('now'), datetime('now'))`).run(nickname, invitedBy);
        return true;
    } catch (error) { return false; }
}

function removeClanMember(nickname) {
    try {
        db.prepare('DELETE FROM clan_members WHERE minecraft_nick = ?').run(nickname);
        db.prepare('DELETE FROM rp_players WHERE minecraft_nick = ?').run(nickname);
        return true;
    } catch (error) { return false; }
}

function updatePlayerMoney(nickname, amount, reason, issuedBy = 'system') {
    try {
        const player = getRPPlayer(nickname);
        if (!player) return false;
        const newBalance = player.money + amount;
        if (newBalance < 0) return false;
        db.prepare('UPDATE rp_players SET money = ? WHERE minecraft_nick = ?').run(newBalance, nickname);
        db.prepare('INSERT INTO money_logs (player, amount, new_balance, reason, issued_by, timestamp) VALUES (?, ?, ?, ?, ?, datetime("now"))').run(nickname, amount, newBalance, reason, issuedBy);
        return newBalance;
    } catch (error) { return false; }
}

function updatePlayerMoneyById(playerId, amount, reason, issuedBy = 'system') {
    try {
        const player = getPlayerById(playerId);
        if (!player) return false;
        return updatePlayerMoney(player.minecraft_nick, amount, reason, issuedBy);
    } catch (error) { return false; }
}

// ========== НАКАЗАНИЯ ==========

function addPunishment(data) {
    try {
        const { player, type, reason, issued_by, duration_minutes } = data;
        let expires_at = null;
        if (duration_minutes > 0) expires_at = new Date(Date.now() + duration_minutes * 60000).toISOString();
        db.prepare('INSERT INTO punishments (player, type, reason, issued_by, duration_minutes, expires_at, active, issued_at) VALUES (?, ?, ?, ?, ?, ?, 1, datetime("now"))').run(player, type, reason, issued_by, duration_minutes, expires_at);
        return true;
    } catch (error) { return false; }
}

function getActivePunishments(nickname, type = null) {
    try {
        let query = 'SELECT * FROM punishments WHERE player = ? AND active = 1';
        const params = [nickname];
        if (type) { query += ' AND type = ?'; params.push(type); }
        query += ' ORDER BY issued_at DESC';
        return db.prepare(query).all(...params);
    } catch (error) { return []; }
}

function getActivePunishmentsByType(nickname, type) {
    return getActivePunishments(nickname, type);
}

function deactivatePunishment(id) {
    try { db.prepare('UPDATE punishments SET active = 0 WHERE id = ?').run(id); return true; }
    catch (error) { return false; }
}

function getPlayerWarnings(nickname) {
    try {
        const rp = getRPPlayer(nickname);
        return rp ? rp.warns : 0;
    } catch (error) { return 0; }
}

// ========== ЗАЩИТА ОТ БРУТФОРСА ==========

function isIpBlocked(ip) {
    try {
        const attempts = db.prepare('SELECT COUNT(*) as count FROM login_attempts WHERE ip = ? AND success = 0 AND attempt_time > datetime("now", "-15 minutes")').get(ip);
        return attempts.count >= 5;
    } catch (error) { return false; }
}

function getFailedAttempts(ip) {
    try {
        const result = db.prepare('SELECT COUNT(*) as count FROM login_attempts WHERE ip = ? AND success = 0 AND attempt_time > datetime("now", "-15 minutes")').get(ip);
        return result.count;
    } catch (error) { return 0; }
}

function logLoginAttempt(ip, username, success) {
    try {
        db.prepare('INSERT INTO login_attempts (ip, username, success, attempt_time) VALUES (?, ?, ?, datetime("now"))').run(ip, username || 'unknown', success ? 1 : 0);
        db.exec('DELETE FROM login_attempts WHERE attempt_time < datetime("now", "-1 day")');
    } catch (error) {}
}

function resetIpBlock(ip) {
    try { db.prepare('DELETE FROM login_attempts WHERE ip = ? AND success = 0').run(ip); }
    catch (error) {}
}

// ========== ЛОГИ ==========

function logClanChat(player, message) {
    try { db.prepare('INSERT INTO clan_chat_logs (player, message, timestamp) VALUES (?, ?, datetime("now"))').run(player, message); }
    catch (error) {}
}

function logMoney(player, amount, newBalance, reason, issuedBy) {
    try { db.prepare('INSERT INTO money_logs (player, amount, new_balance, reason, issued_by, timestamp) VALUES (?, ?, ?, ?, ?, datetime("now"))').run(player, amount, newBalance, reason, issuedBy); }
    catch (error) {}
}

function getExpiringLicenses(daysBefore = 2) {
    try {
        return db.prepare(`
            SELECT p.*, cm.minecraft_nick as owner_nick, cm.discord_id
            FROM properties p
            JOIN clan_members cm ON cm.minecraft_nick = p.owner
            WHERE p.license_expires IS NOT NULL 
            AND date(p.license_expires) BETWEEN date('now') AND date('now', '+' || ? || ' days')
            AND p.license_expires > datetime('now')
        `).all(daysBefore);
    } catch (error) { return []; }
}

// ========== ПЕРСОНАЛ ==========

function getStaffRank(nickname) {
    try { const staff = db.prepare('SELECT staff_rank FROM staff WHERE minecraft_nick = ?').get(nickname); return staff ? staff.staff_rank : null; }
    catch (error) { return null; }
}

function getStaffByNickname(nickname) {
    try { return db.prepare('SELECT * FROM staff WHERE minecraft_nick = ?').get(nickname); }
    catch (error) { return null; }
}

function getStaffLimits(rank) {
    const limits = {
        'Администратор': { kicks: Infinity, mutes: Infinity, blacklists: Infinity },
        'Куратор': { kicks: Infinity, mutes: Infinity, blacklists: Infinity },
        'Гл.Модератор': { kicks: 25, mutes: 50, blacklists: 70 },
        'Ст.Модератор': { kicks: 10, mutes: 40, blacklists: 40 },
        'Модератор': { kicks: 5, mutes: 30, blacklists: 30 },
        'Мл.Модератор': { kicks: 2, mutes: 20, blacklists: 20 }
    };
    return limits[rank] || { kicks: 0, mutes: 0, blacklists: 0 };
}

function incrementStaffCounter(nickname, action) {
    try { db.prepare(`UPDATE staff SET ${action}_today = ${action}_today + 1 WHERE minecraft_nick = ?`).run(nickname); }
    catch (error) {}
}

function resetStaffDailyCounters() {
    try { db.prepare("UPDATE staff SET kicks_today = 0, mutes_today = 0, blacklists_today = 0, last_reset = date('now')").run(); }
    catch (error) {}
}

function addStaffWarn(nickname, reason, issuedBy) {
    try {
        const staff = db.prepare('SELECT total_warns FROM staff WHERE minecraft_nick = ?').get(nickname);
        const newWarns = (staff?.total_warns || 0) + 1;
        db.prepare('UPDATE staff SET total_warns = ? WHERE minecraft_nick = ?').run(newWarns, nickname);
        if (newWarns >= 3) {
            db.prepare('DELETE FROM staff WHERE minecraft_nick = ?').run(nickname);
            db.prepare('UPDATE clan_members SET rank = "Участник" WHERE minecraft_nick = ?').run(nickname);
        }
        return newWarns;
    } catch (error) { return null; }
}

// ========== СПАМ-ЗАЩИТА ==========

function addJoinLeaveHistory(player, action) {
    try { db.prepare('INSERT INTO join_leave_history (player, action, timestamp) VALUES (?, ?, datetime("now"))').run(player, action); }
    catch (error) {}
}

function checkJoinLeaveSpam(player) {
    try {
        const last12h = db.prepare('SELECT COUNT(*) as cnt FROM join_leave_history WHERE player = ? AND timestamp > datetime("now", "-12 hours")').get(player);
        return last12h.cnt >= 3;
    } catch (error) { return false; }
}

function logMessageHistory(player, message) {
    try { db.prepare('INSERT INTO message_history (player, message, timestamp) VALUES (?, ?, datetime("now"))').run(player, message); }
    catch (error) {}
}

function getRecentMessages(player, minutes = 1) {
    try {
        const result = db.prepare('SELECT COUNT(*) as cnt FROM message_history WHERE player = ? AND timestamp > datetime("now", ?)').get(player, `-${minutes} minutes`);
        return result.cnt;
    } catch (error) { return 0; }
}

// ========== ИМУЩЕСТВО ==========

function getProperty(propertyId) {
    try {
        const id = typeof propertyId === 'number' ? propertyId : parseFloat(propertyId);
        if (isNaN(id)) return null;
        return db.prepare('SELECT * FROM properties WHERE id = ?').get(id);
    } catch (error) { return null; }
}

function getPropertyById(id) {
    return getProperty(id);
}

function getPlayerProperties(nickname) {
    try {
        const rp = getRPPlayer(nickname);
        if (!rp) return [];
        return JSON.parse(rp.properties || '[]');
    } catch (error) { return []; }
}

function buyProperty(propertyId, buyer, regionName) {
    try {
        const property = getProperty(propertyId);
        if (!property || property.owner) return false;
        db.prepare('UPDATE properties SET owner = ?, purchased_at = datetime("now"), last_tax_paid = datetime("now") WHERE id = ?').run(buyer, propertyId);
        
        const rp = getRPPlayer(buyer);
        if (rp) {
            const props = JSON.parse(rp.properties || '[]');
            props.push(propertyId);
            db.prepare('UPDATE rp_players SET properties = ? WHERE minecraft_nick = ?').run(JSON.stringify(props), buyer);
        }
        return true;
    } catch (error) { return false; }
}

function addCoOwner(propertyId, owner, newCoOwner) {
    try {
        const property = getProperty(propertyId);
        if (!property || property.owner !== owner) return false;
        let coOwners = JSON.parse(property.co_owners || '[]');
        if (coOwners.includes(newCoOwner)) return false;
        if (coOwners.length >= 2) return false;
        coOwners.push(newCoOwner);
        db.prepare('UPDATE properties SET co_owners = ? WHERE id = ?').run(JSON.stringify(coOwners), propertyId);
        return true;
    } catch (error) { return false; }
}

function removeCoOwner(propertyId, owner, coOwner) {
    try {
        const property = getProperty(propertyId);
        if (!property || property.owner !== owner) return false;
        let coOwners = JSON.parse(property.co_owners || '[]');
        if (!coOwners.includes(coOwner)) return false;
        coOwners = coOwners.filter(n => n !== coOwner);
        db.prepare('UPDATE properties SET co_owners = ? WHERE id = ?').run(JSON.stringify(coOwners), propertyId);
        return true;
    } catch (error) { return false; }
}

// ========== ОФИСЫ ==========

function getRandomOfficeQuestion(type) {
    try {
        const questions = db.prepare('SELECT * FROM office_questions WHERE type = ? ORDER BY RANDOM() LIMIT 1').all(type);
        if (questions.length === 0) return null;
        const q = questions[0];
        return { 
            id: q.id,
            question: q.question, 
            answer: q.answer, 
            options: q.options ? q.options.split('|') : [] 
        };
    } catch (error) { return null; }
}

function updateOfficeLevel(propertyId, isCorrect) {
    try {
        const property = getProperty(propertyId);
        if (!property) return null;
        
        let level = property.level || 4;
        let correctAnswers = (property.correct_answers || 0) + (isCorrect ? 1 : 0);
        let wrongAnswers = (property.wrong_answers || 0) + (isCorrect ? 0 : 1);
        let totalAnswers = (property.total_answers || 0) + 1;
        
        const neededForUpgrade = 5;
        const neededForDowngrade = 3;
        let levelChanged = false;
        
        if (isCorrect && correctAnswers >= neededForUpgrade && level < 10) {
            level++;
            correctAnswers = 0;
            wrongAnswers = 0;
            levelChanged = true;
        } else if (!isCorrect && wrongAnswers >= neededForDowngrade && level > 1) {
            level--;
            correctAnswers = 0;
            wrongAnswers = 0;
            levelChanged = true;
        }
        
        db.prepare('UPDATE properties SET level = ?, correct_answers = ?, wrong_answers = ?, total_answers = ? WHERE id = ?').run(level, correctAnswers, wrongAnswers, totalAnswers, propertyId);
        
        return {
            level,
            levelChanged,
            nextUpgrade: neededForUpgrade - correctAnswers,
            nextDowngrade: neededForDowngrade - wrongAnswers,
            correctAnswers,
            wrongAnswers,
            totalAnswers
        };
    } catch (error) { return null; }
}

function getOfficeLicense(owner) {
    try { return db.prepare('SELECT * FROM properties WHERE owner = ? AND type = "office" AND license_expires > datetime("now")').get(owner); }
    catch (error) { return null; }
}

function getBusinessLicense(owner) {
    try { return db.prepare('SELECT * FROM properties WHERE owner = ? AND type = "business" AND license_expires > datetime("now")').get(owner); }
    catch (error) { return null; }
}

function hasActiveLicense(owner, type) {
    const license = type === 'business' ? getBusinessLicense(owner) : getOfficeLicense(owner);
    return !!license;
}

function getPlayerLicenses(owner) {
    try {
        return db.prepare(`
            SELECT * FROM properties 
            WHERE owner = ? AND license_type IS NOT NULL AND license_expires > datetime('now')
        `).all(owner);
    } catch (error) { return []; }
}

// ========== СТРУКТУРЫ ==========

function startDuty(nickname, structure) {
    try {
        db.prepare('UPDATE structure_members SET on_duty = 1, duty_start = datetime("now") WHERE minecraft_nick = ? AND structure = ?').run(nickname, structure);
        return true;
    } catch (error) { return false; }
}

function endDuty(nickname) {
    try {
        const member = db.prepare('SELECT duty_start, structure FROM structure_members WHERE minecraft_nick = ?').get(nickname);
        if (!member || !member.duty_start) return 0;
        const start = new Date(member.duty_start);
        const minutes = Math.floor((Date.now() - start) / 60000);
        db.prepare('INSERT INTO duty_history (player, start_time, end_time, minutes, structure) VALUES (?, ?, datetime("now"), ?, ?)').run(nickname, member.duty_start, minutes, member.structure);
        db.prepare('UPDATE structure_members SET on_duty = 0, duty_start = NULL WHERE minecraft_nick = ?').run(nickname);
        return minutes;
    } catch (error) { return 0; }
}

function getDutyStats(nickname) {
    try {
        const result = db.prepare('SELECT SUM(minutes) as total FROM duty_history WHERE player = ? AND date(start_time) = date("now")').get(nickname);
        return result?.total || 0;
    } catch (error) { return 0; }
}

function getDutyHistory(nickname, days = 7) {
    try {
        return db.prepare(`
            SELECT * FROM duty_history 
            WHERE player = ? AND start_time > datetime('now', '-' || ? || ' days')
            ORDER BY start_time DESC
        `).all(nickname, days);
    } catch (error) { return []; }
}

function getStructureMembers(structure) {
    try {
        return db.prepare(`
            SELECT sm.*, rp.money, rp.unique_points
            FROM structure_members sm
            JOIN rp_players rp ON rp.minecraft_nick = sm.minecraft_nick
            WHERE sm.structure = ?
        `).all(structure);
    } catch (error) { return []; }
}

// ========== БЮДЖЕТЫ ==========

function initOrgBudget(structure) {
    try { db.prepare('INSERT OR IGNORE INTO org_budgets (structure, balance) VALUES (?, ?)').run(structure, 100000); }
    catch (error) {}
}

function getOrgBudget(structure) {
    try { const budget = db.prepare('SELECT balance FROM org_budgets WHERE structure = ?').get(structure); return budget ? budget.balance : 0; }
    catch (error) { return 0; }
}

function updateOrgBudget(structure, amount, operation = 'add') {
    try {
        const current = getOrgBudget(structure);
        const newBalance = operation === 'add' ? current + amount : current - amount;
        if (newBalance < 0) return false;
        db.prepare('UPDATE org_budgets SET balance = ?, last_updated = datetime("now") WHERE structure = ?').run(newBalance, structure);
        return true;
    } catch (error) { return false; }
}

// ========== ВЕРИФИКАЦИЯ ==========

function generateVerificationCode(discordId) {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 30 * 60000).toISOString();
    try {
        db.prepare("UPDATE verification_codes SET status = 'expired' WHERE discord_id = ? AND status = 'pending'").run(discordId);
        db.prepare('INSERT INTO verification_codes (discord_id, code, expires_at, status, created_at) VALUES (?, ?, ?, ?, datetime("now"))').run(discordId, code, expiresAt, 'pending');
        return code;
    } catch (error) { return null; }
}

function verifyCode(code, minecraftNick) {
    try {
        const record = db.prepare('SELECT * FROM verification_codes WHERE code = ? AND status = ? AND expires_at > datetime("now")').get(code, 'pending');
        if (!record) return { success: false, message: 'Неверный или просроченный код' };
        db.prepare('UPDATE verification_codes SET minecraft_nick = ?, status = ? WHERE id = ?').run(minecraftNick, 'used', record.id);
        db.prepare('UPDATE clan_members SET discord_id = ? WHERE minecraft_nick = ?').run(record.discord_id, minecraftNick);
        return { success: true, discordId: record.discord_id };
    } catch (error) {
        logger.error('Ошибка verifyCode:', error);
        return { success: false, message: 'Ошибка верификации' };
    }
}

// ========== КАСТОМНЫЕ ЗАРПЛАТЫ ==========

function getCustomSalary(structure, rank) {
    try {
        const salary = db.prepare('SELECT salary FROM custom_salaries WHERE structure = ? AND rank = ?').get(structure, rank);
        return salary ? salary.salary : null;
    } catch (error) { return null; }
}

function setCustomSalary(structure, rank, salary) {
    try {
        db.prepare('INSERT OR REPLACE INTO custom_salaries (structure, rank, salary) VALUES (?, ?, ?)').run(structure, rank, salary);
        return true;
    } catch (error) { return false; }
}

// ========== ЭКСПОРТ ==========

module.exports = {
    initialize, getDb, close,
    
    // Настройки
    getSetting, setSetting,
    
    // Участники
    getPlayerByNickname, getPlayerById, getRPPlayer, getRPPlayerById,
    addClanMember, removeClanMember, updatePlayerMoney, updatePlayerMoneyById,
    
    // Наказания
    addPunishment, getActivePunishments, getActivePunishmentsByType,
    deactivatePunishment, getPlayerWarnings,
    
    // Защита
    isIpBlocked, getFailedAttempts, logLoginAttempt, resetIpBlock,
    
    // Логи
    logClanChat, logMoney, getExpiringLicenses,
    
    // Персонал
    getStaffRank, getStaffByNickname, getStaffLimits,
    incrementStaffCounter, resetStaffDailyCounters, addStaffWarn,
    
    // Спам-защита
    addJoinLeaveHistory, checkJoinLeaveSpam, logMessageHistory, getRecentMessages,
    
    // Имущество
    getProperty, getPropertyById, getPlayerProperties,
    buyProperty, addCoOwner, removeCoOwner,
    
    // Офисы
    getRandomOfficeQuestion, updateOfficeLevel,
    getOfficeLicense, getBusinessLicense, hasActiveLicense, getPlayerLicenses,
    
    // Дежурства
    startDuty, endDuty, getDutyStats, getDutyHistory,
    
    // Структуры
    getStructureMembers,
    
    // Бюджеты
    initOrgBudget, getOrgBudget, updateOrgBudget,
    
    // Верификация
    generateVerificationCode, verifyCode,
    
    // Кастомные зарплаты
    getCustomSalary, setCustomSalary
};