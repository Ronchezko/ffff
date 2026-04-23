// src/database/index.js
// Модуль для работы с базой данных Resistance City
// ПОЛНОСТЬЮ ИСПРАВЛЕНАЯ ВЕРСИЯ С РЕГИСТРОНЕЗАВИСИМОСТЬЮ

const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');
const fs = require('fs');
const logger = require('../shared/logger');

let db = null;

// ============================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================


// ============================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================

async function initialize() {
    try {
        const dataDir = path.join(__dirname, '../../data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
            logger.info('📁 Создана папка data');
        }

        db = await open({
            filename: path.join(dataDir, 'hoholss.db'),
            driver: sqlite3.Database
        });

        await db.exec('PRAGMA foreign_keys = ON');
        await db.exec('PRAGMA journal_mode = WAL');
        
        const schemaPath = path.join(__dirname, 'schema.sql');
        if (fs.existsSync(schemaPath)) {
            const schema = fs.readFileSync(schemaPath, 'utf8');
            await db.exec(schema);
            logger.success('✅ Схема базы данных загружена');
        } else {
            logger.warn('⚠️ schema.sql не найден');
        }

        // Безопасное добавление колонок
        await ensureColumns();
        
        logger.success('💾 База данных готова');
        return db;
    } catch (error) {
        logger.error('❌ Ошибка инициализации БД:', error);
        throw error;
    }
}

async function ensureColumns() {
    const columnsToAdd = [
        { table: 'punishments', column: 'source', type: "TEXT DEFAULT 'clan'" },
        { table: 'rp_players', column: 'frozen_reason', type: 'TEXT' },
        { table: 'rp_players', column: 'frozen_by', type: 'TEXT' },
        { table: 'rp_players', column: 'frozen_at', type: 'DATETIME' },
        { table: 'organizations', column: 'frozen_by', type: 'TEXT' }
    ];
    
    for (const col of columnsToAdd) {
        try {
            await db.exec(`ALTER TABLE ${col.table} ADD COLUMN ${col.column} ${col.type}`);
            logger.info(`✅ Колонка ${col.column} добавлена в ${col.table}`);
        } catch (err) {
            if (!err.message.includes('duplicate column')) {
                logger.debug(`Колонка ${col.column} уже существует в ${col.table}`);
            }
        }
    }
}

function getDb() {
    if (!db) throw new Error('База данных не инициализирована');
    return db;
}

// ============================================
// ОСНОВНЫЕ МЕТОДЫ
// ============================================

async function all(sql, params = []) {
    return await db.all(sql, params);
}

async function get(sql, params = []) {
    return await db.get(sql, params);
}

async function run(sql, params = []) {
    return await db.run(sql, params);
}

// ============================================
// УЧАСТНИКИ КЛАНА (регистронезависимые)
// ============================================

async function addClanMember(nick, invitedBy = null) {
    const cleanNick = cleanNick(nick);
    const cleanInvitedBy = invitedBy ? cleanNick(invitedBy) : null;
    
    const existing = await get('SELECT minecraft_nick FROM clan_members WHERE LOWER(minecraft_nick) = LOWER(?)', [cleanNick]);
    if (existing) return false;
    
    await run(
        `INSERT INTO clan_members (minecraft_nick, invited_by, rank_name, rank_priority)
         VALUES (?, ?, 'Новичок', 0)`,
        [cleanNick, cleanInvitedBy]
    );
    await run(`INSERT OR IGNORE INTO rp_players (minecraft_nick) VALUES (?)`, [cleanNick]);
    logger.info(`➕ Игрок ${cleanNick} добавлен в клан`);
    return true;
}

async function removeClanMember(nick) {
    const cleanNick = cleanNick(nick);
    await run('DELETE FROM clan_members WHERE LOWER(minecraft_nick) = LOWER(?)', [cleanNick]);
    logger.info(`➖ Игрок ${cleanNick} удалён из клана`);
    return true;
}

async function getClanMember(nick) {
    const cleanNick = cleanNick(nick);
    return await get('SELECT rowid, * FROM clan_members WHERE LOWER(minecraft_nick) = LOWER(?)', [cleanNick]);
}

async function getAllClanMembers() {
    return await all('SELECT minecraft_nick FROM clan_members');
}

async function updateClanMemberRank(nick, rankName, priority) {
    const cleanNick = cleanNick(nick);
    await run('UPDATE clan_members SET rank_name = ?, rank_priority = ? WHERE LOWER(minecraft_nick) = LOWER(?)', [rankName, priority, cleanNick]);
}

async function updateLastSeen(nick) {
    const cleanNick = cleanNick(nick);
    await run('UPDATE clan_members SET last_seen = CURRENT_TIMESTAMP WHERE LOWER(minecraft_nick) = LOWER(?)', [cleanNick]);
}

// ============================================
// СТАТИСТИКА
// ============================================

async function addKill(killer, victim) {
    const cleanKiller = cleanNick(killer);
    const cleanVictim = cleanNick(victim);
    
    const killerInClan = await get('SELECT minecraft_nick FROM clan_members WHERE LOWER(minecraft_nick) = LOWER(?)', [cleanKiller]);
    const victimInClan = await get('SELECT minecraft_nick FROM clan_members WHERE LOWER(minecraft_nick) = LOWER(?)', [cleanVictim]);
    
    await run(
        `INSERT INTO pvp_stats (killer, victim, killer_was_in_clan, victim_was_in_clan)
         VALUES (?, ?, ?, ?)`,
        [cleanKiller, cleanVictim, killerInClan ? 1 : 0, victimInClan ? 1 : 0]
    );
    
    if (killerInClan) await run('UPDATE clan_members SET kills = kills + 1 WHERE LOWER(minecraft_nick) = LOWER(?)', [cleanKiller]);
    if (victimInClan) await run('UPDATE clan_members SET deaths = deaths + 1 WHERE LOWER(minecraft_nick) = LOWER(?)', [cleanVictim]);
    
    return { killerInClan: !!killerInClan, victimInClan: !!victimInClan };
}

async function getPlayerStats(nick) {
    const cleanNick = cleanNick(nick);
    return await get(
        `SELECT c.*, r.money, r.structure, r.job_rank, r.rp_points, r.warnings, r.is_frozen
         FROM clan_members c
         LEFT JOIN rp_players r ON LOWER(c.minecraft_nick) = LOWER(r.minecraft_nick)
         WHERE LOWER(c.minecraft_nick) = LOWER(?)`,
        [cleanNick]
    );
}

// ============================================
// ROLEPLAY (регистронезависимые)
// ============================================

async function registerRP(nick) {
    const cleanNick = cleanNick(nick);
    
    const existing = await get('SELECT minecraft_nick FROM rp_players WHERE LOWER(minecraft_nick) = LOWER(?)', [cleanNick]);
    if (existing) return false;
    
    await run(`INSERT INTO rp_players (minecraft_nick, money, structure, job_rank) VALUES (?, 1000, 'Гражданин', 'Нет')`, [cleanNick]);
    logger.info(`🎭 Игрок ${cleanNick} зарегистрирован в RolePlay`);
    return true;
}

async function getRPProfile(nick) {
    const cleanNick = cleanNick(nick);
    return await get('SELECT * FROM rp_players WHERE LOWER(minecraft_nick) = LOWER(?)', [cleanNick]);
}

async function updateMoney(nick, amount, type, description, performedBy = 'system') {
    const cleanNick = cleanNick(nick);
    const profile = await get('SELECT money FROM rp_players WHERE LOWER(minecraft_nick) = LOWER(?)', [cleanNick]);
    if (!profile) return false;
    
    const balanceBefore = profile.money;
    const balanceAfter = balanceBefore + amount;
    if (balanceAfter < 0) return false;
    
    await run('UPDATE rp_players SET money = ? WHERE LOWER(minecraft_nick) = LOWER(?)', [balanceAfter, cleanNick]);
    await run(
        `INSERT INTO money_logs (player, amount, type, description, balance_before, balance_after, performed_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [cleanNick, amount, type, description, balanceBefore, balanceAfter, performedBy ? cleanNick(performedBy) : 'system']
    );
    return true;
}

async function getBalance(nick) {
    const cleanNick = cleanNick(nick);
    const profile = await get('SELECT money FROM rp_players WHERE LOWER(minecraft_nick) = LOWER(?)', [cleanNick]);
    return profile ? profile.money : 0;
}

async function transferMoney(from, to, amount, description) {
    const cleanFrom = cleanNick(from);
    const cleanTo = cleanNick(to);
    
    await run('BEGIN TRANSACTION');
    try {
        const fromBalance = await getBalance(cleanFrom);
        if (fromBalance < amount) { await run('ROLLBACK'); return false; }
        await updateMoney(cleanFrom, -amount, 'transfer', `Перевод игроку ${cleanTo}: ${description}`, cleanFrom);
        await updateMoney(cleanTo, amount, 'transfer', `Получено от ${cleanFrom}: ${description}`, cleanFrom);
        await run('COMMIT');
        return true;
    } catch (error) {
        await run('ROLLBACK');
        throw error;
    }
}

// ============================================
// НАКАЗАНИЯ
// ============================================

async function isRPFrozen(nick) {
    const cleanNick = cleanNick(nick);
    const player = await get(
        `SELECT is_frozen FROM rp_players WHERE LOWER(minecraft_nick) = LOWER(?)`,
        [cleanNick]
    );
    return player ? player.is_frozen === 1 : false;
}

async function addPunishment(player, type, reason, issuedBy, durationMinutes = null, source = 'clan') {
    const cleanPlayer = cleanNick(player);
    const cleanIssuedBy = issuedBy ? cleanNick(issuedBy) : 'system';
    
    let expiresAt = null;
    if (durationMinutes && durationMinutes > 0) {
        expiresAt = new Date(Date.now() + durationMinutes * 60000).toISOString();
    }
    
    const result = await run(
        `INSERT INTO punishments (player, type, reason, issued_by, duration_minutes, expires_at, active, source)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
        [cleanPlayer, type, reason, cleanIssuedBy, durationMinutes, expiresAt, source]
    );
    
    if (type === 'blacklist') {
        await run(
            `INSERT OR REPLACE INTO clan_blacklist (minecraft_nick, reason, issued_by, expires_at)
             VALUES (?, ?, ?, ?)`,
            [cleanPlayer, reason, cleanIssuedBy, expiresAt]
        );
    }
    
    return result.lastID;
}

async function removePunishment(player, type, liftedBy, liftReason) {
    const cleanPlayer = cleanNick(player);
    const cleanLiftedBy = liftedBy ? cleanNick(liftedBy) : 'system';
    
    await run(
        `UPDATE punishments SET active = 0, lifted_by = ?, lifted_at = CURRENT_TIMESTAMP, lift_reason = ?
         WHERE LOWER(player) = LOWER(?) AND type = ? AND active = 1`,
        [cleanLiftedBy, liftReason, cleanPlayer, type]
    );
    
    if (type === 'blacklist') {
        await run('UPDATE clan_blacklist SET is_active = 0 WHERE LOWER(minecraft_nick) = LOWER(?)', [cleanPlayer]);
    }
    return true;
}

// ============================================
// ПЕРСОНАЛ
// ============================================

async function getStaffRank(nick) {
    const cleanNick = cleanNick(nick);
    const row = await get('SELECT rank_level, rank_name, awarns, kicks_today, mutes_today, bl_today FROM staff_stats WHERE LOWER(minecraft_nick) = LOWER(?)', [cleanNick]);
    return row || { rank_level: 0, rank_name: null, awarns: 0, kicks_today: 0, mutes_today: 0, bl_today: 0 };
}

async function setStaffRank(nick, rankLevel, rankName, hiredBy = null) {
    const cleanNick = cleanNick(nick);
    const cleanHiredBy = hiredBy ? cleanNick(hiredBy) : null;
    
    const existing = await get('SELECT * FROM staff_stats WHERE LOWER(minecraft_nick) = LOWER(?)', [cleanNick]);
    
    if (existing) {
        await run(`UPDATE staff_stats SET rank_level = ?, rank_name = ?, updated_at = CURRENT_TIMESTAMP WHERE LOWER(minecraft_nick) = LOWER(?)`, 
            [rankLevel, rankName, cleanNick]);
    } else {
        await run(`INSERT INTO staff_stats (minecraft_nick, rank_level, rank_name, hired_by, hired_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            [cleanNick, rankLevel, rankName, cleanHiredBy]);
    }
    return true;
}

async function checkStaffLimit(nick, action) {
    const staff = await getStaffRank(nick);
    if (staff.rank_level < 1) return { allowed: false, reason: 'Вы не в персонале', current: 0, max: 0 };
    
    const limits = {
        1: { kicks: 2, mutes: 20, blacklists: 20 },
        2: { kicks: 5, mutes: 30, blacklists: 30 },
        3: { kicks: 10, mutes: 40, blacklists: 40 },
        4: { kicks: 25, mutes: 50, blacklists: 70 },
        5: { kicks: 9999, mutes: 9999, blacklists: 9999 },
        6: { kicks: 9999, mutes: 9999, blacklists: 9999 }
    };
    
    const limit = limits[staff.rank_level];
    if (!limit) return { allowed: true, current: 0, max: 0 };
    
    let current = 0;
    if (action === 'kick') current = staff.kicks_today || 0;
    else if (action === 'mute') current = staff.mutes_today || 0;
    else if (action === 'blacklist') current = staff.bl_today || 0;
    
    const max = limit[action === 'blacklist' ? 'blacklists' : action + 's'];
    
    return { allowed: current < max, current, max };
}

async function incrementStaffCounter(nick, action) {
    const cleanNick = cleanNick(nick);
    const field = action === 'kick' ? 'kicks_today' : (action === 'mute' ? 'mutes_today' : 'bl_today');
    await run(`UPDATE staff_stats SET ${field} = ${field} + 1 WHERE LOWER(minecraft_nick) = LOWER(?)`, [cleanNick]);
}

async function isMuted(nick) {
    const cleanNick = cleanNick(nick);
    const mute = await get(
        `SELECT * FROM punishments WHERE LOWER(player) = LOWER(?) AND type = 'mute' AND active = 1 
         AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)`,
        [cleanNick]
    );
    return mute || null;
}

// ============================================
// ОРГАНИЗАЦИИ
// ============================================

async function getOrganization(name) {
    return await get('SELECT * FROM organizations WHERE LOWER(name) = LOWER(?)', [name]);
}

async function getAllOrganizations() {
    return await all('SELECT * FROM organizations');
}

async function getOrgMembers(orgName) {
    const cleanOrg = cleanNick(orgName);
    return await all(`SELECT om.*, rp.money FROM org_members om LEFT JOIN rp_players rp ON LOWER(om.minecraft_nick) = LOWER(rp.minecraft_nick) WHERE LOWER(om.org_name) = LOWER(?)`, [cleanOrg]);
}

async function addOrgMember(nick, orgName, rankName) {
    const cleanNick = cleanNick(nick);
    const cleanOrg = cleanNick(orgName);
    
    const existing = await get('SELECT * FROM org_members WHERE LOWER(minecraft_nick) = LOWER(?) AND LOWER(org_name) = LOWER(?)', [cleanNick, cleanOrg]);
    if (existing) {
        await run('UPDATE org_members SET rank_name = ? WHERE LOWER(minecraft_nick) = LOWER(?) AND LOWER(org_name) = LOWER(?)', [rankName, cleanNick, cleanOrg]);
    } else {
        await run(`INSERT INTO org_members (minecraft_nick, org_name, rank_name) VALUES (?, ?, ?)`, [cleanNick, cleanOrg, rankName]);
    }
    await run('UPDATE rp_players SET structure = ?, job_rank = ? WHERE LOWER(minecraft_nick) = LOWER(?)', [cleanOrg, rankName, cleanNick]);
    return true;
}

async function removeOrgMember(nick, orgName) {
    const cleanNick = cleanNick(nick);
    const cleanOrg = cleanNick(orgName);
    await run('DELETE FROM org_members WHERE LOWER(minecraft_nick) = LOWER(?) AND LOWER(org_name) = LOWER(?)', [cleanNick, cleanOrg]);
    const other = await get('SELECT * FROM org_members WHERE LOWER(minecraft_nick) = LOWER(?)', [cleanNick]);
    if (!other) await run('UPDATE rp_players SET structure = ?, job_rank = ? WHERE LOWER(minecraft_nick) = LOWER(?)', ['Гражданин', 'Нет', cleanNick]);
    return true;
}

async function setDuty(nick, orgName, onDuty) {
    const cleanNick = cleanNick(nick);
    const cleanOrg = orgName ? cleanNick(orgName) : null;
    const now = new Date().toISOString();
    
    if (onDuty) {
        if (cleanOrg) {
            await run(`UPDATE org_members SET on_duty = 1, duty_start_time = ? WHERE LOWER(minecraft_nick) = LOWER(?) AND LOWER(org_name) = LOWER(?)`, [now, cleanNick, cleanOrg]);
        }
        await run('UPDATE rp_players SET on_duty = 1, duty_start_time = ? WHERE LOWER(minecraft_nick) = LOWER(?)', [now, cleanNick]);
    } else {
        if (cleanOrg) {
            await run(`UPDATE org_members SET on_duty = 0 WHERE LOWER(minecraft_nick) = LOWER(?) AND LOWER(org_name) = LOWER(?)`, [cleanNick, cleanOrg]);
        }
        await run('UPDATE rp_players SET on_duty = 0 WHERE LOWER(minecraft_nick) = LOWER(?)', [cleanNick]);
    }
    return true;
}

// ============================================
// ИМУЩЕСТВО
// ============================================

async function getProperty(id) {
    return await get('SELECT * FROM property WHERE id = ?', [id]);
}

async function getAllAvailableProperties() {
    return await all('SELECT * FROM property WHERE is_available = 1');
}

async function getPlayerProperties(nick) {
    const cleanNick = cleanNick(nick);
    return await all('SELECT * FROM property WHERE LOWER(owner_nick) = LOWER(?)', [cleanNick]);
}

async function buyProperty(id, buyer) {
    const cleanBuyer = cleanNick(buyer);
    const prop = await get('SELECT * FROM property WHERE id = ?', [id]);
    if (!prop || !prop.is_available) return { success: false, reason: 'Недоступно' };
    const balance = await getBalance(cleanBuyer);
    if (balance < prop.price) return { success: false, reason: 'Недостаточно средств' };
    
    await run('BEGIN TRANSACTION');
    try {
        await updateMoney(cleanBuyer, -prop.price, 'property_buy', `Покупка имущества ${id}`, 'system');
        await run(`UPDATE property SET owner_nick = ?, is_available = 0, last_tax_pay = CURRENT_TIMESTAMP WHERE id = ?`, [cleanBuyer, id]);
        await run(`INSERT INTO property_history (property_id, owner_nick, action, amount, performed_by) VALUES (?, ?, 'buy', ?, 'system')`, [id, cleanBuyer, prop.price]);
        await run('COMMIT');
        return { success: true };
    } catch (e) {
        await run('ROLLBACK');
        throw e;
    }
}

async function addPropertyResident(id, owner, resident) {
    const cleanOwner = cleanNick(owner);
    const cleanResident = cleanNick(resident);
    const prop = await get('SELECT * FROM property WHERE id = ?', [id]);
    if (!prop || prop.owner_nick !== cleanOwner) return { success: false, reason: 'Не владелец' };
    if (prop.type !== 'apartment' && prop.type !== 'house') return { success: false, reason: 'Только квартиры/дома' };
    const rp = await getRPProfile(cleanResident);
    if (!rp) return { success: false, reason: 'Нет RP' };
    const clan = await getClanMember(cleanResident);
    if (!clan) return { success: false, reason: 'Не в клане' };
    await run(`INSERT OR REPLACE INTO property_residents (property_id, resident_nick, added_by, is_active) VALUES (?, ?, ?, 1)`, [id, cleanResident, cleanOwner]);
    return { success: true };
}

// ============================================
// НАСТРОЙКИ
// ============================================

async function isBlacklisted(nick) {
    const cleanNick = cleanNick(nick);
    const result = await get(
        `SELECT * FROM clan_blacklist 
         WHERE LOWER(minecraft_nick) = LOWER(?) 
         AND is_active = 1 
         AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)`,
        [cleanNick]
    );
    return !!result;
}

async function getSetting(key) {
    const setting = await get('SELECT value FROM settings WHERE key = ?', [key]);
    return setting ? setting.value : null;
}

async function setSetting(key, value, updatedBy = 'system') {
    const cleanUpdatedBy = cleanNick(updatedBy);
    await run(`INSERT OR REPLACE INTO settings (key, value, updated_at, updated_by) VALUES (?, ?, CURRENT_TIMESTAMP, ?)`, [key, value, cleanUpdatedBy]);
}

// ============================================
// DISCORD ВЕРИФИКАЦИЯ
// ============================================

async function generateVerificationCode(minecraftNick, discordId, discordUsername) {
    const cleanNick = cleanNick(minecraftNick);
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const expiresAt = new Date(Date.now() + 30 * 60000).toISOString();
    
    await run(
        `INSERT INTO verification_codes (code, minecraft_nick, discord_id, discord_username, expires_at, is_active)
         VALUES (?, ?, ?, ?, ?, 1)`,
        [code, cleanNick, discordId, discordUsername, expiresAt]
    );
    return code;
}

async function verifyCode(code, minecraftNick) {
    const cleanNick = cleanNick(minecraftNick);
    const record = await get(
        `SELECT * FROM verification_codes WHERE code = ? AND LOWER(minecraft_nick) = LOWER(?) AND is_active = 1 AND expires_at > CURRENT_TIMESTAMP`,
        [code, cleanNick]
    );
    if (!record) return { success: false, reason: 'Неверный или просроченный код' };
    
    await run('UPDATE verification_codes SET is_active = 0, verified_at = CURRENT_TIMESTAMP WHERE code = ?', [code]);
    await run(`INSERT OR REPLACE INTO linked_accounts (minecraft_nick, discord_id, is_verified) VALUES (?, ?, 1)`, [cleanNick, record.discord_id]);
    await run(`UPDATE clan_members SET is_discord_linked = 1, discord_id = ?, discord_username = ? WHERE LOWER(minecraft_nick) = LOWER(?)`, [record.discord_id, record.discord_username, cleanNick]);
    
    return { success: true, discordId: record.discord_id };
}

async function getDiscordId(minecraftNick) {
    const cleanNick = cleanNick(minecraftNick);
    const linked = await get('SELECT discord_id FROM linked_accounts WHERE LOWER(minecraft_nick) = LOWER(?)', [cleanNick]);
    return linked ? linked.discord_id : null;
}

// ============================================
// ЛОГИ
// ============================================

async function logClanChat(player, message, isCommand = false) {
    const cleanPlayer = cleanNick(player);
    await run(
        `INSERT INTO clan_chat_logs (player, message, is_command, sent_at)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
        [cleanPlayer, message, isCommand ? 1 : 0]
    );
}

async function logPrivateMessage(from, to, message) {
    const cleanFrom = cleanNick(from);
    const cleanTo = cleanNick(to);
    await run(
        `INSERT INTO private_messages_logs (from_player, to_player, message, sent_at)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
        [cleanFrom, cleanTo, message]
    );
}

// ============================================
// ЭКСПОРТ
// ============================================

module.exports = {
    initialize,
    getDb,
    all,
    get,
    run,
    
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
    
    // RolePlay
    registerRP,
    getRPProfile,
    updateMoney,
    getBalance,
    transferMoney,
    isRPFrozen,
    
    // Организации
    getOrganization,
    getAllOrganizations,
    getOrgMembers,
    addOrgMember,
    removeOrgMember,
    setDuty,
    
    // Персонал
    getStaffRank,
    setStaffRank,
    checkStaffLimit,
    incrementStaffCounter,
    
    // Наказания
    addPunishment,
    removePunishment,
    isMuted,
    
    // Имущество
    getProperty,
    getAllAvailableProperties,
    getPlayerProperties,
    buyProperty,
    addPropertyResident,
    
    // Настройки
    getSetting,
    setSetting,
    isBlacklisted,
    
    // Discord
    generateVerificationCode,
    verifyCode,
    getDiscordId,
    
    // Логи
    logClanChat,
    logPrivateMessage
};