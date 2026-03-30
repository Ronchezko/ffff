const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');
const logger = require('../shared/logger');

// Глобальная переменная для хранения соединения
let dbInstance = null;

/**
 * ИНИЦИАЛИЗАЦИЯ БАЗЫ ДАННЫХ
 * Создает файл hohols.db и все необходимые таблицы
 */
async function init() {
    try {
        dbInstance = await open({
            filename: path.join(__dirname, '../../hohols.db'),
            driver: sqlite3.Database
        });

        // Включаем поддержку внешних ключей
        await dbInstance.get("PRAGMA foreign_keys = ON");

        // 1. Участники клана
        await dbInstance.exec(`CREATE TABLE IF NOT EXISTS clan_members (
            minecraft_nick TEXT PRIMARY KEY,
            kills INTEGER DEFAULT 0,
            deaths INTEGER DEFAULT 0,
            joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            rank_name TEXT DEFAULT 'Новичок',
            rank_prio INTEGER DEFAULT 0,
            is_discord_linked INTEGER DEFAULT 0,
            last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // 2. RolePlay профили игроков
        await dbInstance.exec(`CREATE TABLE IF NOT EXISTS rp_players (
            minecraft_nick TEXT PRIMARY KEY,
            money REAL DEFAULT 1000.0,
            bank_balance REAL DEFAULT 0.0,
            structure TEXT DEFAULT 'Гражданин',
            job_rank TEXT DEFAULT 'Нет',
            rp_points INTEGER DEFAULT 0,
            rp_joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            on_duty INTEGER DEFAULT 0,
            duty_start_time DATETIME,
            total_duty_time INTEGER DEFAULT 0,
            warnings INTEGER DEFAULT 0,
            has_education INTEGER DEFAULT 0,
            is_frozen INTEGER DEFAULT 0,
            last_pay_time DATETIME
        )`);

        // 3. Имущество (Дома, Квартиры, Бизнесы, Офисы)
        await dbInstance.exec(`CREATE TABLE IF NOT EXISTS property (
            id TEXT PRIMARY KEY,
            type TEXT, 
            owner_nick TEXT,
            price INTEGER,
            tax_accumulated REAL DEFAULT 0.0,
            last_tax_pay DATETIME DEFAULT CURRENT_TIMESTAMP,
            co_owner1 TEXT,
            co_owner2 TEXT,
            office_type TEXT, 
            office_lvl INTEGER DEFAULT 4,
            license_expiry DATETIME,
            is_admin_issued INTEGER DEFAULT 0
        )`);

        // 4. Логи наказаний (Муты, ЧС, выговоры персоналу)
        await dbInstance.exec(`CREATE TABLE IF NOT EXISTS punishments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            player TEXT,
            type TEXT, 
            reason TEXT,
            issued_by TEXT,
            duration_minutes INTEGER,
            issued_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            expires_at DATETIME,
            active INTEGER DEFAULT 1
        )`);

        // 5. Логи чата и денежных переводов
        await dbInstance.exec(`CREATE TABLE IF NOT EXISTS clan_chat_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            player TEXT,
            message TEXT,
            sent_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        await dbInstance.exec(`CREATE TABLE IF NOT EXISTS money_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            player TEXT,
            amount REAL,
            type TEXT, 
            description TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // 6. Персонал и суточные лимиты
        await dbInstance.exec(`CREATE TABLE IF NOT EXISTS staff_stats (
            minecraft_nick TEXT PRIMARY KEY,
            rank_level INTEGER, 
            kicks_today INTEGER DEFAULT 0,
            mutes_today INTEGER DEFAULT 0,
            bl_today INTEGER DEFAULT 0,
            awarns INTEGER DEFAULT 0,
            last_reset_date TEXT
        )`);

        // 7. Глобальные настройки (авто-мод, реклама и т.д.)
        await dbInstance.exec(`CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
        )`);

        // 8. Организации и бюджеты
        await dbInstance.exec(`CREATE TABLE IF NOT EXISTS organizations (
            name TEXT PRIMARY KEY,
            budget REAL DEFAULT 1000000.0,
            tax_rate REAL DEFAULT 0.01,
            is_frozen INTEGER DEFAULT 0,
            leader_nick TEXT
        )`);

        // 9. Верификация Discord
        await dbInstance.exec(`CREATE TABLE IF NOT EXISTS verification_codes (
            code TEXT PRIMARY KEY,
            minecraft_nick TEXT,
            discord_id TEXT,
            expires_at DATETIME,
            is_active INTEGER DEFAULT 1
        )`);

        // Добавляем первого администратора по ТЗ
        await dbInstance.run(`INSERT OR IGNORE INTO staff_stats (minecraft_nick, rank_level) VALUES ('Ronch_', 6)`);
        await dbInstance.run(`INSERT OR IGNORE INTO clan_members (minecraft_nick, rank_name) VALUES ('Ronch_', 'Администратор')`);

        logger.info("✅ База данных hohols.db и все таблицы инициализированы успешно.");
        return dbInstance;
    } catch (err) {
        logger.error("❌ Ошибка инициализации базы данных: " + err.message);
        throw err;
    }
}

/**
 * Получить текущее соединение с БД
 * @returns {import('sqlite').Database}
 */
function getDb() {
    if (!dbInstance) {
        throw new Error("База данных еще не инициализирована! Сначала вызовите init()");
    }
    return dbInstance;
}

/**
 * Вспомогательная функция для получения ранга персонала
 */
async function getStaffRank(nick) {
    const db = getDb();
    const row = await db.get("SELECT rank_level FROM staff_stats WHERE minecraft_nick = ?", [nick]);
    return row ? row.rank_level : 0;
}

module.exports = {
    init,
    getDb,
    getStaffRank
};