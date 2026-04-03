// src/database/index.js
// Модуль для работы с базой данных Resistance City

const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');
const fs = require('fs');
const logger = require('../shared/logger');

let db = null;

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
            filename: path.join(dataDir, 'hohols.db'),
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
            await createTablesProgrammatically();
        }

        // Безопасное добавление колонки source
        try {
            await db.exec(`ALTER TABLE punishments ADD COLUMN source TEXT DEFAULT 'clan'`);
            logger.info('✅ Колонка source добавлена в punishments');
        } catch (err) {
            if (!err.message.includes('duplicate column')) {
                logger.warn(`⚠️ Не удалось добавить source: ${err.message}`);
            }
        }

        logger.success('💾 База данных готова');
        return db;
    } catch (error) {
        logger.error('❌ Ошибка инициализации БД:', error);
        throw error;
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
// УЧАСТНИКИ КЛАНА
// ============================================

async function addClanMember(nick, invitedBy = null) {
    const existing = await get('SELECT minecraft_nick FROM clan_members WHERE minecraft_nick = ?', [nick]);
    if (existing) return false;
    
    await run(
        `INSERT INTO clan_members (minecraft_nick, invited_by, rank_name, rank_priority)
         VALUES (?, ?, 'Новичок', 0)`,
        [nick, invitedBy]
    );
    await run(`INSERT OR IGNORE INTO rp_players (minecraft_nick) VALUES (?)`, [nick]);
    logger.info(`➕ Игрок ${nick} добавлен в клан`);
    return true;
}

async function removeClanMember(nick) {
    await run('DELETE FROM clan_members WHERE minecraft_nick = ?', [nick]);
    logger.info(`➖ Игрок ${nick} удалён из клана`);
    return true;
}

async function getClanMember(nick) {
    return await get('SELECT * FROM clan_members WHERE minecraft_nick = ?', [nick]);
}

async function getAllClanMembers() {
    const db = getDb();
    return await db.all('SELECT minecraft_nick FROM clan_members');
}

async function updateClanMemberRank(nick, rankName, priority) {
    await run('UPDATE clan_members SET rank_name = ?, rank_priority = ? WHERE minecraft_nick = ?', [rankName, priority, nick]);
}

async function updateLastSeen(nick) {
    await run('UPDATE clan_members SET last_seen = CURRENT_TIMESTAMP WHERE minecraft_nick = ?', [nick]);
}

// ============================================
// СТАТИСТИКА
// ============================================

async function addKill(killer, victim) {
    const killerInClan = await get('SELECT minecraft_nick FROM clan_members WHERE minecraft_nick = ?', [killer]);
    const victimInClan = await get('SELECT minecraft_nick FROM clan_members WHERE minecraft_nick = ?', [victim]);
    
    await run(
        `INSERT INTO pvp_stats (killer, victim, killer_was_in_clan, victim_was_in_clan)
         VALUES (?, ?, ?, ?)`,
        [killer, victim, killerInClan ? 1 : 0, victimInClan ? 1 : 0]
    );
    
    if (killerInClan) await run('UPDATE clan_members SET kills = kills + 1 WHERE minecraft_nick = ?', [killer]);
    if (victimInClan) await run('UPDATE clan_members SET deaths = deaths + 1 WHERE minecraft_nick = ?', [victim]);
    
    return { killerInClan: !!killerInClan, victimInClan: !!victimInClan };
}

async function getPlayerStats(nick) {
    return await get(
        `SELECT c.*, r.money, r.structure, r.job_rank, r.rp_points, r.warnings
         FROM clan_members c
         LEFT JOIN rp_players r ON c.minecraft_nick = r.minecraft_nick
         WHERE c.minecraft_nick = ?`,
        [nick]
    );
}

// ============================================
// ROLEPLAY
// ============================================

async function registerRP(nick) {
    const existing = await get('SELECT minecraft_nick FROM rp_players WHERE minecraft_nick = ?', [nick]);
    if (existing) return false;
    
    await run(`INSERT INTO rp_players (minecraft_nick, money, structure, job_rank) VALUES (?, 1000, 'Гражданин', 'Нет')`, [nick]);
    logger.info(`🎭 Игрок ${nick} зарегистрирован в RolePlay`);
    return true;
}

async function getRPProfile(nick) {
    return await get('SELECT * FROM rp_players WHERE minecraft_nick = ?', [nick]);
}

async function updateMoney(nick, amount, type, description, performedBy = 'system') {
    const profile = await get('SELECT money FROM rp_players WHERE minecraft_nick = ?', [nick]);
    if (!profile) return false;
    
    const balanceBefore = profile.money;
    const balanceAfter = balanceBefore + amount;
    if (balanceAfter < 0) return false;
    
    await run('UPDATE rp_players SET money = ? WHERE minecraft_nick = ?', [balanceAfter, nick]);
    await run(
        `INSERT INTO money_logs (player, amount, type, description, balance_before, balance_after, performed_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [nick, amount, type, description, balanceBefore, balanceAfter, performedBy]
    );
    return true;
}

async function getBalance(nick) {
    const profile = await get('SELECT money FROM rp_players WHERE minecraft_nick = ?', [nick]);
    return profile ? profile.money : 0;
}

async function transferMoney(from, to, amount, description) {
    await run('BEGIN TRANSACTION');
    try {
        const fromBalance = await getBalance(from);
        if (fromBalance < amount) { await run('ROLLBACK'); return false; }
        await updateMoney(from, -amount, 'transfer', `Перевод игроку ${to}: ${description}`, from);
        await updateMoney(to, amount, 'transfer', `Получено от ${from}: ${description}`, from);
        await run('COMMIT');
        return true;
    } catch (error) {
        await run('ROLLBACK');
        throw error;
    }
}

// ============================================
// НАКАЗАНИЯ (С ПОДДЕРЖКОЙ source)
// ============================================

async function addPunishment(player, type, reason, issuedBy, durationMinutes = null, source = 'clan') {
    const db = getDb();
    const playerLower = player.toLowerCase();
    
    // ВАЖНО: правильно рассчитываем expires_at
    let expiresAt = null;
    if (durationMinutes && durationMinutes > 0) {
        expiresAt = new Date(Date.now() + durationMinutes * 60000).toISOString();
    }
    
    const result = await db.run(
        `INSERT INTO punishments (player, type, reason, issued_by, duration_minutes, expires_at, active, source)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
        [playerLower, type, reason, issuedBy, durationMinutes, expiresAt, source]
    );
    
    if (type === 'blacklist') {
        await db.run(
            `INSERT OR REPLACE INTO clan_blacklist (minecraft_nick, reason, issued_by, expires_at)
             VALUES (?, ?, ?, ?)`,
            [playerLower, reason, issuedBy, expiresAt]
        );
    }
    
    return result.lastID;
}
async function removePunishment(player, type, liftedBy, liftReason) {
    const db = getDb();
    const playerLower = player.toLowerCase();
    
    await db.run(
        `UPDATE punishments SET active = 0, lifted_by = ?, lifted_at = CURRENT_TIMESTAMP, lift_reason = ?
         WHERE LOWER(player) = LOWER(?) AND type = ? AND active = 1`,
        [liftedBy, liftReason, playerLower, type]
    );
    
    if (type === 'blacklist') {
        await db.run('UPDATE clan_blacklist SET is_active = 0 WHERE LOWER(minecraft_nick) = LOWER(?)', [playerLower]);
    }
    return true;
}

async function isMuted(nick) {
    const db = getDb();
    // Поиск без учёта регистра
    const mute = await db.get(
        `SELECT * FROM punishments WHERE LOWER(player) = LOWER(?) AND type = 'mute' AND active = 1 
         AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)`,
        [nick]
    );
    return mute || null;
}
async function getActivePunishmentsBySource(player, source = null) {
    let sql = `SELECT * FROM punishments WHERE player = ? AND type = 'mute' AND active = 1 
               AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)`;
    const params = [player];
    if (source) {
        sql += ` AND source = ?`;
        params.push(source);
    }
    return await all(sql, params);
}

// ============================================
// ПЕРСОНАЛ
// ============================================

async function getStaffRank(nick) {
    const row = await get('SELECT rank_level, rank_name FROM staff_stats WHERE minecraft_nick = ?', [nick]);
    return row || { rank_level: 0, rank_name: null };
}

// ============================================
// ЛОГИ ЧАТА
// ============================================

async function logClanChat(player, message, isCommand = false) {
    await run(
        `INSERT INTO clan_chat_logs (player, message, is_command, sent_at)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
        [player, message, isCommand ? 1 : 0]
    );
}

async function logPrivateMessage(from, to, message) {
    await run(
        `INSERT INTO private_messages_logs (from_player, to_player, message, sent_at)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
        [from, to, message]
    );
}

// ============================================
// DISCORD ВЕРИФИКАЦИЯ
// ============================================

async function generateVerificationCode(minecraftNick, discordId, discordUsername) {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const expiresAt = new Date(Date.now() + 30 * 60000).toISOString();
    
    await run(
        `INSERT INTO verification_codes (code, minecraft_nick, discord_id, discord_username, expires_at, is_active)
         VALUES (?, ?, ?, ?, ?, 1)`,
        [code, minecraftNick, discordId, discordUsername, expiresAt]
    );
    return code;
}

async function verifyCode(code, minecraftNick) {
    const record = await get(
        `SELECT * FROM verification_codes WHERE code = ? AND minecraft_nick = ? AND is_active = 1 AND expires_at > CURRENT_TIMESTAMP`,
        [code, minecraftNick]
    );
    if (!record) return { success: false, reason: 'Неверный или просроченный код' };
    
    await run('UPDATE verification_codes SET is_active = 0, verified_at = CURRENT_TIMESTAMP WHERE code = ?', [code]);
    await run(`INSERT OR REPLACE INTO linked_accounts (minecraft_nick, discord_id, is_verified) VALUES (?, ?, 1)`, [minecraftNick, record.discord_id]);
    await run(`UPDATE clan_members SET is_discord_linked = 1, discord_id = ?, discord_username = ? WHERE minecraft_nick = ?`, [record.discord_id, record.discord_username, minecraftNick]);
    
    return { success: true, discordId: record.discord_id };
}

async function getDiscordId(minecraftNick) {
    const linked = await get('SELECT discord_id FROM linked_accounts WHERE minecraft_nick = ?', [minecraftNick]);
    return linked ? linked.discord_id : null;
}

// ============================================
// НАСТРОЙКИ
// ============================================

async function getSetting(key) {
    const setting = await get('SELECT value FROM settings WHERE key = ?', [key]);
    return setting ? setting.value : null;
}

async function setSetting(key, value, updatedBy = 'system') {
    await run(`INSERT OR REPLACE INTO settings (key, value, updated_at, updated_by) VALUES (?, ?, CURRENT_TIMESTAMP, ?)`, [key, value, updatedBy]);
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
    
    addClanMember,
    removeClanMember,
    getClanMember,
    getAllClanMembers,
    updateClanMemberRank,
    updateLastSeen,
    
    addKill,
    getPlayerStats,
    
    registerRP,
    getRPProfile,
    updateMoney,
    getBalance,
    transferMoney,
    
    getOrganization: async (name) => get('SELECT * FROM organizations WHERE name = ?', [name]),
    getAllOrganizations: async () => all('SELECT * FROM organizations'),
    getOrgMembers: async (orgName) => all(`SELECT om.*, rp.money FROM org_members om LEFT JOIN rp_players rp ON om.minecraft_nick = rp.minecraft_nick WHERE om.org_name = ?`, [orgName]),
    addOrgMember: async (nick, orgName, rankName) => { await run(`INSERT INTO org_members (minecraft_nick, org_name, rank_name) VALUES (?, ?, ?)`, [nick, orgName, rankName]); await run('UPDATE rp_players SET structure = ? WHERE minecraft_nick = ?', [orgName, nick]); return true; },
    removeOrgMember: async (nick, orgName) => { await run('DELETE FROM org_members WHERE minecraft_nick = ? AND org_name = ?', [nick, orgName]); const other = await get('SELECT * FROM org_members WHERE minecraft_nick = ?', [nick]); if (!other) await run('UPDATE rp_players SET structure = ?, job_rank = ? WHERE minecraft_nick = ?', ['Гражданин', 'Нет', nick]); return true; },
    setDuty: async (nick, orgName, onDuty) => { const now = new Date().toISOString(); if (onDuty) { await run(`UPDATE org_members SET on_duty = 1, duty_start_time = ? WHERE minecraft_nick = ? AND org_name = ?`, [now, nick, orgName]); await run('UPDATE rp_players SET on_duty = 1, duty_start_time = ? WHERE minecraft_nick = ?', [now, nick]); } else { await run(`UPDATE org_members SET on_duty = 0 WHERE minecraft_nick = ? AND org_name = ?`, [nick, orgName]); await run('UPDATE rp_players SET on_duty = 0 WHERE minecraft_nick = ?', [nick]); } return true; },
    
    getStaffRank,
    
    addPunishment,
    removePunishment,
    isMuted,
    getActivePunishmentsBySource,
    
    getProperty: async (id) => get('SELECT * FROM property WHERE id = ?', [id]),
    getAllAvailableProperties: async () => all('SELECT * FROM property WHERE is_available = 1'),
    getPlayerProperties: async (nick) => all('SELECT * FROM property WHERE owner_nick = ?', [nick]),
    buyProperty: async (id, buyer) => { const prop = await get('SELECT * FROM property WHERE id = ?', [id]); if (!prop || !prop.is_available) return { success: false, reason: 'Недоступно' }; const balance = await getBalance(buyer); if (balance < prop.price) return { success: false, reason: 'Недостаточно средств' }; await run('BEGIN TRANSACTION'); try { await updateMoney(buyer, -prop.price, 'property_buy', `Покупка имущества ${id}`, 'system'); await run(`UPDATE property SET owner_nick = ?, is_available = 0, last_tax_pay = CURRENT_TIMESTAMP WHERE id = ?`, [buyer, id]); await run(`INSERT INTO property_history (property_id, owner_nick, action, amount, performed_by) VALUES (?, ?, 'buy', ?, 'system')`, [id, buyer, prop.price]); await run('COMMIT'); return { success: true }; } catch (e) { await run('ROLLBACK'); throw e; } },
    addPropertyResident: async (id, owner, resident) => { const prop = await get('SELECT * FROM property WHERE id = ?', [id]); if (!prop || prop.owner_nick !== owner) return { success: false, reason: 'Не владелец' }; if (prop.type !== 'apartment' && prop.type !== 'house') return { success: false, reason: 'Только квартиры/дома' }; const rp = await getRPProfile(resident); if (!rp) return { success: false, reason: 'Нет RP' }; const clan = await getClanMember(resident); if (!clan) return { success: false, reason: 'Не в клане' }; await run(`INSERT OR REPLACE INTO property_residents (property_id, resident_nick, added_by, is_active) VALUES (?, ?, ?, 1)`, [id, resident, owner]); return { success: true }; },
    
    generateVerificationCode,
    verifyCode,
    getDiscordId,
    
    getSetting,
    setSetting,
    
    logClanChat,
    logPrivateMessage,
    
    createTablesProgrammatically: async () => {}
};