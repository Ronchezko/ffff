// src/database/index.js
// Модуль для работы с базой данных Resistance City
// Поддерживает все таблицы из schema.sql

const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');
const fs = require('fs');
const logger = require('../shared/logger');

// Глобальное соединение с БД
let db = null;

// ============================================
// ИНИЦИАЛИЗАЦИЯ БАЗЫ ДАННЫХ
// ============================================

async function initialize() {
    try {
        // Создаём папку data если её нет
        const dataDir = path.join(__dirname, '../../data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
            logger.info('📁 Создана папка data');
        }

        // Открываем соединение с БД
        db = await open({
            filename: path.join(dataDir, 'hohols.db'),
            driver: sqlite3.Database
        });

        // Включаем поддержку внешних ключей
        await db.exec('PRAGMA foreign_keys = ON');
        await db.exec('PRAGMA journal_mode = WAL'); // Улучшает производительность
        
        // Читаем и выполняем schema.sql
        const schemaPath = path.join(__dirname, 'schema.sql');
        if (fs.existsSync(schemaPath)) {
            const schema = fs.readFileSync(schemaPath, 'utf8');
            await db.exec(schema);
            logger.success('✅ Схема базы данных загружена');
        } else {
            logger.warn('⚠️ schema.sql не найден, создаю таблицы программно');
            await createTablesProgrammatically();
        }

        logger.success('💾 База данных hohols.db готова к работе');
        return db;
    } catch (error) {
        logger.error('❌ Ошибка инициализации БД:', error);
        throw error;
    }
}

// Резервное создание таблиц (если schema.sql отсутствует)
async function createTablesProgrammatically() {
    // Клан и участники
    await db.exec(`CREATE TABLE IF NOT EXISTS clan_members (
        minecraft_nick TEXT PRIMARY KEY,
        kills INTEGER DEFAULT 0,
        deaths INTEGER DEFAULT 0,
        joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        rank_name TEXT DEFAULT 'Новичок',
        rank_priority INTEGER DEFAULT 0,
        is_discord_linked INTEGER DEFAULT 0,
        discord_id TEXT,
        discord_username TEXT,
        last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
        total_hours INTEGER DEFAULT 0,
        invited_by TEXT,
        is_banned INTEGER DEFAULT 0,
        ban_reason TEXT,
        ban_expires DATETIME
    )`);

    await db.exec(`CREATE TABLE IF NOT EXISTS clan_ranks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        priority INTEGER NOT NULL,
        min_points INTEGER DEFAULT 0,
        cooldown_days INTEGER DEFAULT 3,
        max_promotions_per_wipe INTEGER DEFAULT 3,
        can_kick INTEGER DEFAULT 0,
        can_mute INTEGER DEFAULT 0,
        can_blacklist INTEGER DEFAULT 0,
        can_promote INTEGER DEFAULT 0,
        can_admin INTEGER DEFAULT 0
    )`);

    await db.exec(`CREATE TABLE IF NOT EXISTS rp_players (
        minecraft_nick TEXT PRIMARY KEY,
        money REAL DEFAULT 1000.0,
        bank_balance REAL DEFAULT 0.0,
        structure TEXT DEFAULT 'Гражданин',
        job_rank TEXT DEFAULT 'Нет',
        rp_points INTEGER DEFAULT 0,
        rp_joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        on_duty INTEGER DEFAULT 0,
        duty_start_time DATETIME,
        total_duty_seconds INTEGER DEFAULT 0,
        warnings INTEGER DEFAULT 0,
        has_education INTEGER DEFAULT 0,
        is_frozen INTEGER DEFAULT 0,
        last_pay_time DATETIME,
        education_courses TEXT DEFAULT '[]',
        passport_data TEXT
    )`);

    await db.exec(`CREATE TABLE IF NOT EXISTS property (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        owner_nick TEXT,
        price INTEGER NOT NULL,
        tax_accumulated REAL DEFAULT 0.0,
        last_tax_pay DATETIME DEFAULT CURRENT_TIMESTAMP,
        co_owner1 TEXT,
        co_owner2 TEXT,
        is_admin_issued INTEGER DEFAULT 0,
        issued_by TEXT,
        issued_at DATETIME,
        region_name TEXT,
        is_available INTEGER DEFAULT 1
    )`);

    await db.exec(`CREATE TABLE IF NOT EXISTS property_residents (
        property_id TEXT NOT NULL,
        resident_nick TEXT NOT NULL,
        added_by TEXT NOT NULL,
        added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_active INTEGER DEFAULT 1,
        PRIMARY KEY (property_id, resident_nick)
    )`);

    await db.exec(`CREATE TABLE IF NOT EXISTS businesses (
        property_id TEXT PRIMARY KEY,
        license_expiry DATETIME,
        daily_income REAL DEFAULT 0,
        total_income REAL DEFAULT 0,
        last_income_calc DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    await db.exec(`CREATE TABLE IF NOT EXISTS offices (
        property_id TEXT PRIMARY KEY,
        office_type TEXT,
        license_expiry DATETIME,
        level INTEGER DEFAULT 4,
        max_level INTEGER DEFAULT 10,
        daily_questions_asked INTEGER DEFAULT 0,
        correct_answers INTEGER DEFAULT 0,
        current_streak INTEGER DEFAULT 0,
        last_question_date DATE,
        total_income REAL DEFAULT 0
    )`);

    await db.exec(`CREATE TABLE IF NOT EXISTS licenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        owner_nick TEXT NOT NULL,
        type TEXT NOT NULL,
        issued_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME NOT NULL,
        is_active INTEGER DEFAULT 1,
        price_paid REAL NOT NULL,
        last_reminded_at DATETIME
    )`);

    await db.exec(`CREATE TABLE IF NOT EXISTS organizations (
        name TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        budget REAL DEFAULT 1000000.0,
        tax_rate REAL DEFAULT 0.01,
        leader_nick TEXT,
        is_frozen INTEGER DEFAULT 0,
        frozen_reason TEXT,
        frozen_at DATETIME
    )`);

    await db.exec(`CREATE TABLE IF NOT EXISTS org_members (
        minecraft_nick TEXT,
        org_name TEXT,
        rank_name TEXT NOT NULL,
        joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        on_duty INTEGER DEFAULT 0,
        duty_start_time DATETIME,
        total_duty_seconds INTEGER DEFAULT 0,
        warnings INTEGER DEFAULT 0,
        is_on_vacation INTEGER DEFAULT 0,
        vacation_until DATETIME,
        PRIMARY KEY (minecraft_nick, org_name)
    )`);

    await db.exec(`CREATE TABLE IF NOT EXISTS org_ranks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        org_name TEXT NOT NULL,
        rank_name TEXT NOT NULL,
        base_salary REAL NOT NULL,
        priority INTEGER DEFAULT 0,
        is_leader INTEGER DEFAULT 0,
        can_invite INTEGER DEFAULT 0,
        can_kick INTEGER DEFAULT 0,
        can_promote INTEGER DEFAULT 0,
        UNIQUE(org_name, rank_name)
    )`);

    await db.exec(`CREATE TABLE IF NOT EXISTS money_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        player TEXT NOT NULL,
        amount REAL NOT NULL,
        type TEXT NOT NULL,
        description TEXT,
        balance_before REAL,
        balance_after REAL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        performed_by TEXT
    )`);

    await db.exec(`CREATE TABLE IF NOT EXISTS payday_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        player_nick TEXT NOT NULL,
        amount REAL NOT NULL,
        structure TEXT,
        rank TEXT,
        duty_minutes INTEGER DEFAULT 0,
        payday_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        was_online INTEGER DEFAULT 1
    )`);

    await db.exec(`CREATE TABLE IF NOT EXISTS punishments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        player TEXT NOT NULL,
        type TEXT NOT NULL,
        reason TEXT NOT NULL,
        issued_by TEXT NOT NULL,
        duration_minutes INTEGER,
        issued_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME,
        active INTEGER DEFAULT 1,
        lifted_by TEXT,
        lifted_at DATETIME,
        lift_reason TEXT
    )`);

    await db.exec(`CREATE TABLE IF NOT EXISTS clan_blacklist (
        minecraft_nick TEXT PRIMARY KEY,
        reason TEXT,
        issued_by TEXT,
        issued_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME,
        is_active INTEGER DEFAULT 1
    )`);

    await db.exec(`CREATE TABLE IF NOT EXISTS player_warnings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        player_nick TEXT NOT NULL,
        reason TEXT NOT NULL,
        issued_by TEXT NOT NULL,
        issued_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME,
        is_active INTEGER DEFAULT 1
    )`);

    await db.exec(`CREATE TABLE IF NOT EXISTS staff_stats (
        minecraft_nick TEXT PRIMARY KEY,
        rank_level INTEGER DEFAULT 0,
        rank_name TEXT,
        kicks_today INTEGER DEFAULT 0,
        mutes_today INTEGER DEFAULT 0,
        bl_today INTEGER DEFAULT 0,
        awarns INTEGER DEFAULT 0,
        last_reset_date TEXT,
        hired_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        hired_by TEXT,
        is_active INTEGER DEFAULT 1
    )`);

    await db.exec(`CREATE TABLE IF NOT EXISTS staff_limits (
        rank_level INTEGER PRIMARY KEY,
        rank_name TEXT,
        max_kicks_per_day INTEGER,
        max_mutes_per_day INTEGER,
        max_blacklists_per_day INTEGER
    )`);

    await db.exec(`CREATE TABLE IF NOT EXISTS clan_chat_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        player TEXT NOT NULL,
        message TEXT NOT NULL,
        sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_command INTEGER DEFAULT 0
    )`);

    await db.exec(`CREATE TABLE IF NOT EXISTS private_messages_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_player TEXT NOT NULL,
        to_player TEXT NOT NULL,
        message TEXT NOT NULL,
        sent_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    await db.exec(`CREATE TABLE IF NOT EXISTS verification_codes (
        code TEXT PRIMARY KEY,
        minecraft_nick TEXT NOT NULL,
        discord_id TEXT NOT NULL,
        discord_username TEXT,
        expires_at DATETIME NOT NULL,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        verified_at DATETIME
    )`);

    await db.exec(`CREATE TABLE IF NOT EXISTS linked_accounts (
        minecraft_nick TEXT PRIMARY KEY,
        discord_id TEXT NOT NULL UNIQUE,
        linked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_verified INTEGER DEFAULT 1
    )`);

    await db.exec(`CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        description TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_by TEXT
    )`);

    await db.exec(`CREATE TABLE IF NOT EXISTS pvp_stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        killer TEXT NOT NULL,
        victim TEXT NOT NULL,
        killed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        killer_was_in_clan INTEGER DEFAULT 0,
        victim_was_in_clan INTEGER DEFAULT 0
    )`);

    await db.exec(`CREATE TABLE IF NOT EXISTS deepseek_cache (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        prompt TEXT NOT NULL,
        response TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME
    )`);

    logger.info('📋 Таблицы созданы программно');
}

// ============================================
// ПОЛУЧЕНИЕ СОЕДИНЕНИЯ
// ============================================

function getDb() {
    if (!db) {
        throw new Error('База данных не инициализирована. Вызовите initialize() сначала');
    }
    return db;
}

// ============================================
// ОСНОВНЫЕ ОПЕРАЦИИ С УЧАСТНИКАМИ КЛАНА
// ============================================

async function addClanMember(nick, invitedBy = null) {
    const db = getDb();
    const existing = await db.get('SELECT minecraft_nick FROM clan_members WHERE minecraft_nick = ?', [nick]);
    if (existing) return false;
    
    await db.run(
        `INSERT INTO clan_members (minecraft_nick, invited_by, rank_name, rank_priority)
         VALUES (?, ?, 'Новичок', 0)`,
        [nick, invitedBy]
    );
    
    // Также создаём RP профиль
    await db.run(
        `INSERT OR IGNORE INTO rp_players (minecraft_nick) VALUES (?)`,
        [nick]
    );
    
    logger.info(`➕ Игрок ${nick} добавлен в клан`);
    return true;
}
// Добавьте этот метод в класс базы данных
async function all(sql, params = []) {
    const db = getDb();
    return await db.all(sql, params);
}
async function removeClanMember(nick) {
    const db = getDb();
    await db.run('DELETE FROM clan_members WHERE minecraft_nick = ?', [nick]);
    logger.info(`➖ Игрок ${nick} удалён из клана`);
    return true;
}

async function getClanMember(nick) {
    const db = getDb();
    return await db.get('SELECT * FROM clan_members WHERE minecraft_nick = ?', [nick]);
}

async function getAllClanMembers() {
    const db = getDb();
    return await db.all('SELECT * FROM clan_members ORDER BY rank_priority DESC, joined_at ASC');
}

async function updateClanMemberRank(nick, rankName, priority) {
    const db = getDb();
    await db.run(
        'UPDATE clan_members SET rank_name = ?, rank_priority = ? WHERE minecraft_nick = ?',
        [rankName, priority, nick]
    );
}

async function updateLastSeen(nick) {
    const db = getDb();
    await db.run('UPDATE clan_members SET last_seen = CURRENT_TIMESTAMP WHERE minecraft_nick = ?', [nick]);
}

// ============================================
// СТАТИСТИКА УБИЙСТВ/СМЕРТЕЙ
// ============================================

async function addKill(killer, victim) {
    const db = getDb();
    
    // Проверяем, в клане ли убийца
    const killerInClan = await db.get('SELECT minecraft_nick FROM clan_members WHERE minecraft_nick = ?', [killer]);
    const victimInClan = await db.get('SELECT minecraft_nick FROM clan_members WHERE minecraft_nick = ?', [victim]);
    
    // Логируем PVP событие
    await db.run(
        `INSERT INTO pvp_stats (killer, victim, killer_was_in_clan, victim_was_in_clan)
         VALUES (?, ?, ?, ?)`,
        [killer, victim, killerInClan ? 1 : 0, victimInClan ? 1 : 0]
    );
    
    // Обновляем статистику убийцы
    if (killerInClan) {
        await db.run('UPDATE clan_members SET kills = kills + 1 WHERE minecraft_nick = ?', [killer]);
    }
    
    // Обновляем статистику жертвы
    if (victimInClan) {
        await db.run('UPDATE clan_members SET deaths = deaths + 1 WHERE minecraft_nick = ?', [victim]);
    }
    
    return { killerInClan: !!killerInClan, victimInClan: !!victimInClan };
}

async function getPlayerStats(nick) {
    const db = getDb();
    return await db.get(
        `SELECT c.*, r.money, r.structure, r.job_rank, r.rp_points, r.warnings
         FROM clan_members c
         LEFT JOIN rp_players r ON c.minecraft_nick = r.minecraft_nick
         WHERE c.minecraft_nick = ?`,
        [nick]
    );
}

// ============================================
// ROLEPLAY ПРОФИЛИ
// ============================================

async function registerRP(nick) {
    const db = getDb();
    const existing = await db.get('SELECT minecraft_nick FROM rp_players WHERE minecraft_nick = ?', [nick]);
    
    if (existing) {
        return false;
    }
    
    await db.run(
        `INSERT INTO rp_players (minecraft_nick, money, structure, job_rank)
         VALUES (?, 1000, 'Гражданин', 'Нет')`,
        [nick]
    );
    
    logger.info(`🎭 Игрок ${nick} зарегистрирован в RolePlay`);
    return true;
}

async function getRPProfile(nick) {
    const db = getDb();
    return await db.get('SELECT * FROM rp_players WHERE minecraft_nick = ?', [nick]);
}

async function updateMoney(nick, amount, type, description, performedBy = 'system') {
    const db = getDb();
    
    // Получаем текущий баланс
    const profile = await db.get('SELECT money FROM rp_players WHERE minecraft_nick = ?', [nick]);
    if (!profile) return false;
    
    const balanceBefore = profile.money;
    const balanceAfter = balanceBefore + amount;
    
    if (balanceAfter < 0) return false;
    
    // Обновляем баланс
    await db.run('UPDATE rp_players SET money = ? WHERE minecraft_nick = ?', [balanceAfter, nick]);
    
    // Логируем транзакцию
    await db.run(
        `INSERT INTO money_logs (player, amount, type, description, balance_before, balance_after, performed_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [nick, amount, type, description, balanceBefore, balanceAfter, performedBy]
    );
    
    return true;
}

async function getBalance(nick) {
    const db = getDb();
    const profile = await db.get('SELECT money FROM rp_players WHERE minecraft_nick = ?', [nick]);
    return profile ? profile.money : 0;
}

async function transferMoney(from, to, amount, description) {
    const db = getDb();
    
    // Начинаем транзакцию
    await db.run('BEGIN TRANSACTION');
    
    try {
        const fromBalance = await getBalance(from);
        if (fromBalance < amount) {
            await db.run('ROLLBACK');
            return false;
        }
        
        await updateMoney(from, -amount, 'transfer', `Перевод игроку ${to}: ${description}`, from);
        await updateMoney(to, amount, 'transfer', `Получено от ${from}: ${description}`, from);
        
        await db.run('COMMIT');
        return true;
    } catch (error) {
        await db.run('ROLLBACK');
        throw error;
    }
}

// ============================================
// ОРГАНИЗАЦИИ (ГОСУДАРСТВЕННЫЕ СТРУКТУРЫ)
// ============================================

async function getOrganization(orgName) {
    const db = getDb();
    return await db.get('SELECT * FROM organizations WHERE name = ?', [orgName]);
}

async function getAllOrganizations() {
    const db = getDb();
    return await db.all('SELECT * FROM organizations');
}

async function getOrgMembers(orgName) {
    const db = getDb();
    return await db.all(
        `SELECT om.*, rp.money, rp.rp_points
         FROM org_members om
         LEFT JOIN rp_players rp ON om.minecraft_nick = rp.minecraft_nick
         WHERE om.org_name = ? AND om.is_on_vacation = 0
         ORDER BY om.warnings ASC, om.joined_at ASC`,
        [orgName]
    );
}

async function addOrgMember(nick, orgName, rankName) {
    const db = getDb();
    
    // Проверяем, не состоит ли уже в организации
    const existing = await db.get(
        'SELECT * FROM org_members WHERE minecraft_nick = ? AND org_name = ?',
        [nick, orgName]
    );
    
    if (existing) return false;
    
    await db.run(
        `INSERT INTO org_members (minecraft_nick, org_name, rank_name)
         VALUES (?, ?, ?)`,
        [nick, orgName, rankName]
    );
    
    // Обновляем структуру в RP профиле
    await db.run('UPDATE rp_players SET structure = ? WHERE minecraft_nick = ?', [orgName, nick]);
    
    logger.info(`📋 ${nick} вступил в организацию ${orgName} в ранге ${rankName}`);
    return true;
}

async function removeOrgMember(nick, orgName) {
    const db = getDb();
    
    await db.run('DELETE FROM org_members WHERE minecraft_nick = ? AND org_name = ?', [nick, orgName]);
    
    // Проверяем, состоит ли в других организациях
    const otherOrgs = await db.get('SELECT * FROM org_members WHERE minecraft_nick = ?', [nick]);
    if (!otherOrgs) {
        await db.run('UPDATE rp_players SET structure = ?, job_rank = ? WHERE minecraft_nick = ?', 
            ['Гражданин', 'Нет', nick]);
    }
    
    logger.info(`📋 ${nick} покинул организацию ${orgName}`);
    return true;
}

async function setDuty(nick, orgName, onDuty) {
    const db = getDb();
    
    const now = new Date();
    if (onDuty) {
        await db.run(
            `UPDATE org_members SET on_duty = 1, duty_start_time = ?
             WHERE minecraft_nick = ? AND org_name = ?`,
            [now.toISOString(), nick, orgName]
        );
        await db.run('UPDATE rp_players SET on_duty = 1, duty_start_time = ? WHERE minecraft_nick = ?', 
            [now.toISOString(), nick]);
    } else {
        // Вычисляем отработанное время
        const member = await db.get(
            'SELECT duty_start_time FROM org_members WHERE minecraft_nick = ? AND org_name = ?',
            [nick, orgName]
        );
        
        if (member && member.duty_start_time) {
            const startTime = new Date(member.duty_start_time);
            const dutySeconds = Math.floor((now - startTime) / 1000);
            
            await db.run(
                `UPDATE org_members SET on_duty = 0, total_duty_seconds = total_duty_seconds + ?
                 WHERE minecraft_nick = ? AND org_name = ?`,
                [dutySeconds, nick, orgName]
            );
            await db.run(
                `UPDATE rp_players SET on_duty = 0, total_duty_seconds = total_duty_seconds + ?
                 WHERE minecraft_nick = ?`,
                [dutySeconds, nick]
            );
        } else {
            await db.run(
                'UPDATE org_members SET on_duty = 0 WHERE minecraft_nick = ? AND org_name = ?',
                [nick, orgName]
            );
            await db.run('UPDATE rp_players SET on_duty = 0 WHERE minecraft_nick = ?', [nick]);
        }
    }
    
    return true;
}

// ============================================
// ПЕРСОНАЛ И МОДЕРАЦИЯ
// ============================================

async function getStaffRank(nick) {
    const db = getDb();
    const staff = await db.get('SELECT rank_level, rank_name FROM staff_stats WHERE minecraft_nick = ?', [nick]);
    return staff || { rank_level: 0, rank_name: null };
}

async function getStaffLimits(rankLevel) {
    const db = getDb();
    return await db.get('SELECT * FROM staff_limits WHERE rank_level = ?', [rankLevel]);
}

async function checkStaffLimit(nick, actionType) {
    const db = getDb();
    const staff = await db.get('SELECT rank_level, kicks_today, mutes_today, bl_today, last_reset_date FROM staff_stats WHERE minecraft_nick = ?', [nick]);
    
    if (!staff) return { allowed: false, reason: 'Вы не в персонале' };
    
    const limits = await getStaffLimits(staff.rank_level);
    if (!limits) return { allowed: true }; // Нет лимитов для этого ранга
    
    const today = new Date().toISOString().split('T')[0];
    if (staff.last_reset_date !== today) {
        // Сбрасываем счётчики
        await db.run(
            `UPDATE staff_stats SET kicks_today = 0, mutes_today = 0, bl_today = 0, last_reset_date = ?
             WHERE minecraft_nick = ?`,
            [today, nick]
        );
        return { allowed: true };
    }
    
    let allowed = true;
    let current = 0;
    let max = 0;
    
    switch (actionType) {
        case 'kick':
            current = staff.kicks_today;
            max = limits.max_kicks_per_day;
            allowed = current < max;
            break;
        case 'mute':
            current = staff.mutes_today;
            max = limits.max_mutes_per_day;
            allowed = current < max;
            break;
        case 'blacklist':
            current = staff.bl_today;
            max = limits.max_blacklists_per_day;
            allowed = current < max;
            break;
    }
    
    return { allowed, current, max };
}
async function getActivePunishmentsBySource(player, source = null) {
    const db = getDb();
    const now = new Date().toISOString();
    
    let sql = `SELECT * FROM punishments 
               WHERE player = ? AND type = 'mute' AND active = 1 
               AND (expires_at IS NULL OR expires_at > ?)`;
    const params = [player, now];
    
    if (source) {
        sql += ` AND source = ?`;
        params.push(source);
    }
    
    return await db.all(sql, params);
}
async function incrementStaffCounter(nick, actionType) {
    const db = getDb();
    const field = actionType === 'kick' ? 'kicks_today' : (actionType === 'mute' ? 'mutes_today' : 'bl_today');
    await db.run(`UPDATE staff_stats SET ${field} = ${field} + 1 WHERE minecraft_nick = ?`, [nick]);
}

async function addPunishment(player, type, reason, issuedBy, durationMinutes = null, source = 'clan') {
    const db = getDb();
    
    const expiresAt = durationMinutes ? new Date(Date.now() + durationMinutes * 60000).toISOString() : null;
    
    const result = await db.run(
        `INSERT INTO punishments (player, type, reason, issued_by, duration_minutes, expires_at, active, source)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
        [player, type, reason, issuedBy, durationMinutes, expiresAt, source]
    );
    
    // Если это чёрный список, добавляем в отдельную таблицу
    if (type === 'blacklist') {
        await db.run(
            `INSERT OR REPLACE INTO clan_blacklist (minecraft_nick, reason, issued_by, expires_at)
             VALUES (?, ?, ?, ?)`,
            [player, reason, issuedBy, expiresAt]
        );
    }
    
    return result.lastID;
}

async function removePunishment(player, type, liftedBy, liftReason) {
    const db = getDb();
    
    await db.run(
        `UPDATE punishments SET active = 0, lifted_by = ?, lifted_at = CURRENT_TIMESTAMP, lift_reason = ?
         WHERE player = ? AND type = ? AND active = 1`,
        [liftedBy, liftReason, player, type]
    );
    
    if (type === 'blacklist') {
        await db.run('UPDATE clan_blacklist SET is_active = 0 WHERE minecraft_nick = ?', [player]);
    }
    
    return true;
}

async function isBlacklisted(nick) {
    const db = getDb();
    const blacklist = await db.get(
        `SELECT * FROM clan_blacklist WHERE minecraft_nick = ? AND is_active = 1 AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)`,
        [nick]
    );
    return !!blacklist;
}

async function isMuted(nick) {
    const db = getDb();
    const mute = await db.get(
        `SELECT * FROM punishments WHERE player = ? AND type = 'mute' AND active = 1 AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)`,
        [nick]
    );
    return mute ? mute : null;
}

// ============================================
// ИМУЩЕСТВО
// ============================================

async function getProperty(propertyId) {
    const db = getDb();
    return await db.get('SELECT * FROM property WHERE id = ?', [propertyId]);
}

async function getAllAvailableProperties() {
    const db = getDb();
    return await db.all('SELECT * FROM property WHERE is_available = 1 ORDER BY price ASC');
}

async function getPlayerProperties(nick) {
    const db = getDb();
    return await db.all('SELECT * FROM property WHERE owner_nick = ?', [nick]);
}

async function buyProperty(propertyId, buyerNick) {
    const db = getDb();
    
    const property = await getProperty(propertyId);
    if (!property) return { success: false, reason: 'Имущество не найдено' };
    if (!property.is_available) return { success: false, reason: 'Имущество уже занято' };
    
    const balance = await getBalance(buyerNick);
    if (balance < property.price) return { success: false, reason: 'Недостаточно денег' };
    
    // Начинаем транзакцию
    await db.run('BEGIN TRANSACTION');
    
    try {
        // Снимаем деньги
        await updateMoney(buyerNick, -property.price, 'property_buy', `Покупка имущества ${propertyId}`, 'system');
        
        // Обновляем имущество
        await db.run(
            `UPDATE property SET owner_nick = ?, is_available = 0, last_tax_pay = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [buyerNick, propertyId]
        );
        
        // Логируем историю
        await db.run(
            `INSERT INTO property_history (property_id, owner_nick, action, amount, performed_by)
             VALUES (?, ?, 'buy', ?, 'system')`,
            [propertyId, buyerNick, property.price]
        );
        
        await db.run('COMMIT');
        return { success: true };
    } catch (error) {
        await db.run('ROLLBACK');
        throw error;
    }
}

async function addPropertyResident(propertyId, ownerNick, residentNick) {
    const db = getDb();
    
    const property = await getProperty(propertyId);
    if (!property || property.owner_nick !== ownerNick) {
        return { success: false, reason: 'Вы не владелец этого имущества' };
    }
    
    if (property.type !== 'apartment' && property.type !== 'house') {
        return { success: false, reason: 'Сожителей можно добавлять только в квартиры и дома' };
    }
    
    // Проверяем, что резидент в RP и в клане
    const resident = await getRPProfile(residentNick);
    if (!resident) return { success: false, reason: 'Игрок не зарегистрирован в RolePlay' };
    
    const clanMember = await getClanMember(residentNick);
    if (!clanMember) return { success: false, reason: 'Игрок не состоит в клане' };
    
    await db.run(
        `INSERT OR REPLACE INTO property_residents (property_id, resident_nick, added_by, is_active)
         VALUES (?, ?, ?, 1)`,
        [propertyId, residentNick, ownerNick]
    );
    
    return { success: true };
}

// ============================================
// DISCORD ВЕРИФИКАЦИЯ
// ============================================

async function generateVerificationCode(minecraftNick, discordId, discordUsername) {
    const db = getDb();
    
    // Генерируем случайный код
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const expiresAt = new Date(Date.now() + 30 * 60000).toISOString(); // 30 минут
    
    await db.run(
        `INSERT INTO verification_codes (code, minecraft_nick, discord_id, discord_username, expires_at, is_active)
         VALUES (?, ?, ?, ?, ?, 1)`,
        [code, minecraftNick, discordId, discordUsername, expiresAt]
    );
    
    return code;
}

async function verifyCode(code, minecraftNick) {
    const db = getDb();
    
    const record = await db.get(
        `SELECT * FROM verification_codes WHERE code = ? AND minecraft_nick = ? AND is_active = 1 AND expires_at > CURRENT_TIMESTAMP`,
        [code, minecraftNick]
    );
    
    if (!record) return { success: false, reason: 'Неверный или просроченный код' };
    
    // Деактивируем код
    await db.run('UPDATE verification_codes SET is_active = 0, verified_at = CURRENT_TIMESTAMP WHERE code = ?', [code]);
    
    // Привязываем аккаунты
    await db.run(
        `INSERT OR REPLACE INTO linked_accounts (minecraft_nick, discord_id, is_verified)
         VALUES (?, ?, 1)`,
        [minecraftNick, record.discord_id]
    );
    
    await db.run(
        `UPDATE clan_members SET is_discord_linked = 1, discord_id = ?, discord_username = ?
         WHERE minecraft_nick = ?`,
        [record.discord_id, record.discord_username, minecraftNick]
    );
    
    return { success: true, discordId: record.discord_id };
}

async function getDiscordId(minecraftNick) {
    const db = getDb();
    const linked = await db.get('SELECT discord_id FROM linked_accounts WHERE minecraft_nick = ?', [minecraftNick]);
    return linked ? linked.discord_id : null;
}

// ============================================
// НАСТРОЙКИ
// ============================================

async function getSetting(key) {
    const db = getDb();
    const setting = await db.get('SELECT value FROM settings WHERE key = ?', [key]);
    return setting ? setting.value : null;
}

async function setSetting(key, value, updatedBy = 'system') {
    const db = getDb();
    await db.run(
        `INSERT OR REPLACE INTO settings (key, value, updated_at, updated_by)
         VALUES (?, ?, CURRENT_TIMESTAMP, ?)`,
        [key, value, updatedBy]
    );
}

// ============================================
// ЧАТ И ЛОГИ
// ============================================

async function logClanChat(player, message, isCommand = false) {
    const db = getDb();
    await db.run(
        `INSERT INTO clan_chat_logs (player, message, is_command, sent_at)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
        [player, message, isCommand ? 1 : 0]
    );
}

async function logPrivateMessage(from, to, message) {
    const db = getDb();
    await db.run(
        `INSERT INTO private_messages_logs (from_player, to_player, message, sent_at)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
        [from, to, message]
    );
}

async function getChatLogs(limit = 100) {
    const db = getDb();
    return await db.all(
        `SELECT * FROM clan_chat_logs ORDER BY sent_at DESC LIMIT ?`,
        [limit]
    );
}

// ============================================
// ЭКСПОРТ МОДУЛЯ
// ============================================

module.exports = {
    // Инициализация
    initialize,
    getDb,
    
    // Участники клана
    addClanMember,
    removeClanMember,
    getClanMember,
    getAllClanMembers,
    updateClanMemberRank,
    updateLastSeen,
    
    // Статистика
    addKill,
    getPlayerStats,
    
    // RP профили
    registerRP,
    getRPProfile,
    updateMoney,
    getBalance,
    transferMoney,
    
    // Организации
    getOrganization,
    getAllOrganizations,
    getOrgMembers,
    addOrgMember,
    removeOrgMember,
    setDuty,
    
    // Персонал
    getStaffRank,
    getStaffLimits,
    checkStaffLimit,
    incrementStaffCounter,
    addPunishment,
    removePunishment,
    isBlacklisted,
    isMuted,
    getActivePunishmentsBySource,
    
    // Имущество
    getProperty,
    getAllAvailableProperties,
    getPlayerProperties,
    buyProperty,
    addPropertyResident,
    
    // Discord верификация
    generateVerificationCode,
    verifyCode,
    getDiscordId,
    
    // Настройки
    getSetting,
    setSetting,
    
    // Логи
    logClanChat,
    logPrivateMessage,
    getChatLogs,
    all
};