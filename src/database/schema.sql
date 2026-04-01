-- ============================================
-- RESISTANCE CITY PROJECT - ПОЛНАЯ СХЕМА БД
-- Версия: 6.0
-- Совместимость: SQLite
-- ============================================

-- ============================================
-- 1. ОСНОВНЫЕ ТАБЛИЦЫ (УЧАСТНИКИ И РОЛИ)
-- ============================================

-- Участники клана (основная информация)
CREATE TABLE IF NOT EXISTS clan_members (
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
);

-- Ранги клана (система повышений)
CREATE TABLE IF NOT EXISTS clan_ranks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,  -- Форматированный ранг с цветами
    priority INTEGER NOT NULL,   -- 0-100, чем выше, тем больше прав
    min_points INTEGER DEFAULT 0,
    cooldown_days INTEGER DEFAULT 3,
    max_promotions_per_wipe INTEGER DEFAULT 3,
    can_kick INTEGER DEFAULT 0,
    can_mute INTEGER DEFAULT 0,
    can_blacklist INTEGER DEFAULT 0,
    can_promote INTEGER DEFAULT 0,
    can_admin INTEGER DEFAULT 0
);

-- ============================================
-- 2. ROLEPLAY ПРОФИЛИ
-- ============================================

-- RP профили игроков
CREATE TABLE IF NOT EXISTS rp_players (
    minecraft_nick TEXT PRIMARY KEY,
    money REAL DEFAULT 1000.0,
    bank_balance REAL DEFAULT 0.0,
    structure TEXT DEFAULT 'Гражданин',  -- police, army, hospital, academy, government
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
    education_courses TEXT DEFAULT '[]',  -- JSON массив пройденных курсов
    passport_data TEXT                     -- JSON с дополнительной информацией
);

-- Образование (курсы академии)
CREATE TABLE IF NOT EXISTS education_courses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_name TEXT NOT NULL,
    teacher_nick TEXT NOT NULL,
    student_nick TEXT NOT NULL,
    grade INTEGER CHECK(grade >= 2 AND grade <= 5),
    passed INTEGER DEFAULT 0,  -- 0 - не сдан, 1 - сдан
    completed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 3. ИМУЩЕСТВО И НЕДВИЖИМОСТЬ
-- ============================================

-- Основная таблица имущества
CREATE TABLE IF NOT EXISTS property (
    id TEXT PRIMARY KEY,  -- "1", "2", "145" и т.д.
    type TEXT NOT NULL CHECK(type IN ('apartment', 'house', 'business', 'office', 'port')),
    owner_nick TEXT,
    price INTEGER NOT NULL,
    tax_accumulated REAL DEFAULT 0.0,
    last_tax_pay DATETIME DEFAULT CURRENT_TIMESTAMP,
    co_owner1 TEXT,
    co_owner2 TEXT,
    is_admin_issued INTEGER DEFAULT 0,
    issued_by TEXT,
    issued_at DATETIME,
    region_name TEXT,  -- Название региона на сервере (TRTR1, TRTR2...)
    is_available INTEGER DEFAULT 1  -- 1 - свободно, 0 - занято
);

-- История владения имуществом
CREATE TABLE IF NOT EXISTS property_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    property_id TEXT NOT NULL,
    owner_nick TEXT NOT NULL,
    action TEXT CHECK(action IN ('buy', 'sell', 'transfer', 'admin_give', 'admin_take')),
    amount REAL,
    transaction_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    performed_by TEXT  -- Кто совершил действие (админ или система)
);

-- Сожители имущества (для домов и квартир)
CREATE TABLE IF NOT EXISTS property_residents (
    property_id TEXT NOT NULL,
    resident_nick TEXT NOT NULL,
    added_by TEXT NOT NULL,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_active INTEGER DEFAULT 1,
    PRIMARY KEY (property_id, resident_nick),
    FOREIGN KEY (property_id) REFERENCES property(id)
);

-- ============================================
-- 4. БИЗНЕСЫ И ОФИСЫ (СПЕЦИАЛЬНАЯ ЛОГИКА)
-- ============================================

-- Бизнесы (дополнительная информация)
CREATE TABLE IF NOT EXISTS businesses (
    property_id TEXT PRIMARY KEY,
    license_expiry DATETIME,
    daily_income REAL DEFAULT 0,
    total_income REAL DEFAULT 0,
    last_income_calc DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (property_id) REFERENCES property(id)
);

-- Офисы (с системой уровней)
CREATE TABLE IF NOT EXISTS offices (
    property_id TEXT PRIMARY KEY,
    office_type TEXT CHECK(office_type IN ('crypto', 'it', 'marketing', 'finance', 'legal')),
    license_expiry DATETIME,
    level INTEGER DEFAULT 4,
    max_level INTEGER DEFAULT 10,
    daily_questions_asked INTEGER DEFAULT 0,
    correct_answers INTEGER DEFAULT 0,
    current_streak INTEGER DEFAULT 0,
    last_question_date DATE,
    total_income REAL DEFAULT 0,
    FOREIGN KEY (property_id) REFERENCES property(id)
);

-- Вопросы для офисов (прокачка уровней)
CREATE TABLE IF NOT EXISTS office_questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    office_type TEXT NOT NULL,
    level INTEGER NOT NULL,
    question TEXT NOT NULL,
    correct_answer TEXT NOT NULL,
    option_a TEXT,
    option_b TEXT,
    option_c TEXT,
    option_d TEXT
);

-- ============================================
-- 5. ЛИЦЕНЗИИ
-- ============================================

CREATE TABLE IF NOT EXISTS licenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_nick TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('business', 'office')),
    issued_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    is_active INTEGER DEFAULT 1,
    price_paid REAL NOT NULL,
    last_reminded_at DATETIME  -- когда последний раз напоминали о продлении
);

-- ============================================
-- 6. ОРГАНИЗАЦИИ (ГОСУДАРСТВЕННЫЕ СТРУКТУРЫ)
-- ============================================

-- Организации
CREATE TABLE IF NOT EXISTS organizations (
    name TEXT PRIMARY KEY,  -- 'police', 'army', 'hospital', 'academy', 'government'
    display_name TEXT NOT NULL,
    budget REAL DEFAULT 1000000.0,
    tax_rate REAL DEFAULT 0.01,
    leader_nick TEXT,
    is_frozen INTEGER DEFAULT 0,
    frozen_reason TEXT,
    frozen_at DATETIME
);

-- Члены организаций
CREATE TABLE IF NOT EXISTS org_members (
    minecraft_nick TEXT,
    org_name TEXT,
    rank_name TEXT NOT NULL,
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    on_duty INTEGER DEFAULT 0,
    duty_start_time DATETIME,
    total_duty_seconds INTEGER DEFAULT 0,
    warnings INTEGER DEFAULT 0,  -- выговоры в организации
    is_on_vacation INTEGER DEFAULT 0,
    vacation_until DATETIME,
    PRIMARY KEY (minecraft_nick, org_name),
    FOREIGN KEY (org_name) REFERENCES organizations(name)
);

-- Ранги организаций (с зарплатами)
CREATE TABLE IF NOT EXISTS org_ranks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    org_name TEXT NOT NULL,
    rank_name TEXT NOT NULL,
    base_salary REAL NOT NULL,
    priority INTEGER DEFAULT 0,
    is_leader INTEGER DEFAULT 0,
    can_invite INTEGER DEFAULT 0,
    can_kick INTEGER DEFAULT 0,
    can_promote INTEGER DEFAULT 0,
    FOREIGN KEY (org_name) REFERENCES organizations(name),
    UNIQUE(org_name, rank_name)
);

-- ============================================
-- 7. ЭКОНОМИКА И ЛОГИ
-- ============================================

-- Логи всех транзакций
CREATE TABLE IF NOT EXISTS money_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player TEXT NOT NULL,
    amount REAL NOT NULL,
    type TEXT NOT NULL,  -- 'salary', 'tax', 'transfer', 'fine', 'property_buy', 'license', 'donation'
    description TEXT,
    balance_before REAL,
    balance_after REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    performed_by TEXT  -- кто совершил операцию (ник или 'system')
);

-- Ежечасный PayDay
CREATE TABLE IF NOT EXISTS payday_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_nick TEXT NOT NULL,
    amount REAL NOT NULL,
    structure TEXT,
    rank TEXT,
    duty_minutes INTEGER DEFAULT 0,
    payday_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    was_online INTEGER DEFAULT 1
);

-- Налоги (история)
CREATE TABLE IF NOT EXISTS tax_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_nick TEXT NOT NULL,
    property_id TEXT,
    amount REAL NOT NULL,
    tax_type TEXT CHECK(tax_type IN ('property', 'income', 'business')),
    paid_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    was_auto INTEGER DEFAULT 0
);

-- ============================================
-- 8. НАКАЗАНИЯ И МОДЕРАЦИЯ
-- ============================================

-- Наказания (муты, чёрные списки, баны)
CREATE TABLE IF NOT EXISTS punishments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('mute', 'blacklist', 'ban', 'kick')),
    reason TEXT NOT NULL,
    issued_by TEXT NOT NULL,
    duration_minutes INTEGER,
    issued_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME,
    active INTEGER DEFAULT 1,
    lifted_by TEXT,
    lifted_at DATETIME,
    lift_reason TEXT
);

-- Чёрный список клана (отдельная таблица для быстрого доступа)
CREATE TABLE IF NOT EXISTS clan_blacklist (
    minecraft_nick TEXT PRIMARY KEY,
    reason TEXT,
    issued_by TEXT,
    issued_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME,
    is_active INTEGER DEFAULT 1
);

-- Предупреждения игроков (3 предупреждения = блок RP)
CREATE TABLE IF NOT EXISTS player_warnings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_nick TEXT NOT NULL,
    reason TEXT NOT NULL,
    issued_by TEXT NOT NULL,
    issued_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME,
    is_active INTEGER DEFAULT 1
);

-- ============================================
-- 9. ПЕРСОНАЛ (МОДЕРАТОРЫ И АДМИНИСТРАТОРЫ)
-- ============================================

-- Статистика персонала
CREATE TABLE IF NOT EXISTS staff_stats (
    minecraft_nick TEXT PRIMARY KEY,
    rank_level INTEGER DEFAULT 0,  -- 1=Мл.мод, 2=Модератор, 3=Ст.мод, 4=Гл.мод, 5=Куратор, 6=Админ
    rank_name TEXT,
    kicks_today INTEGER DEFAULT 0,
    mutes_today INTEGER DEFAULT 0,
    bl_today INTEGER DEFAULT 0,
    awarns INTEGER DEFAULT 0,
    last_reset_date TEXT,  -- YYYY-MM-DD
    hired_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    hired_by TEXT,
    is_active INTEGER DEFAULT 1
);

-- Лимиты персонала (из ТЗ)
CREATE TABLE IF NOT EXISTS staff_limits (
    rank_level INTEGER PRIMARY KEY,
    rank_name TEXT,
    max_kicks_per_day INTEGER,
    max_mutes_per_day INTEGER,
    max_blacklists_per_day INTEGER
);

-- ============================================
-- 10. ЧАТ И КОММУНИКАЦИИ
-- ============================================

-- Логи кланового чата
CREATE TABLE IF NOT EXISTS clan_chat_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player TEXT NOT NULL,
    message TEXT NOT NULL,
    sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_command INTEGER DEFAULT 0
);

-- Логи личных сообщений
CREATE TABLE IF NOT EXISTS private_messages_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_player TEXT NOT NULL,
    to_player TEXT NOT NULL,
    message TEXT NOT NULL,
    sent_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 11. DISCORD ИНТЕГРАЦИЯ
-- ============================================

-- Коды верификации
CREATE TABLE IF NOT EXISTS verification_codes (
    code TEXT PRIMARY KEY,
    minecraft_nick TEXT NOT NULL,
    discord_id TEXT NOT NULL,
    discord_username TEXT,
    expires_at DATETIME NOT NULL,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    verified_at DATETIME
);

-- Связанные аккаунты
CREATE TABLE IF NOT EXISTS linked_accounts (
    minecraft_nick TEXT PRIMARY KEY,
    discord_id TEXT NOT NULL UNIQUE,
    linked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_verified INTEGER DEFAULT 1
);

-- ============================================
-- 12. НАСТРОЙКИ СИСТЕМЫ
-- ============================================

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_by TEXT
);

-- ============================================
-- 13. СТАТИСТИКА И АНАЛИТИКА
-- ============================================

-- Статистика убийств/смертей
CREATE TABLE IF NOT EXISTS pvp_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    killer TEXT NOT NULL,
    victim TEXT NOT NULL,
    killed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    killer_was_in_clan INTEGER DEFAULT 0,
    victim_was_in_clan INTEGER DEFAULT 0
);

-- Онлайн статистика (для отслеживания PayDay)
CREATE TABLE IF NOT EXISTS online_tracking (
    player_nick TEXT NOT NULL,
    check_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    was_online INTEGER DEFAULT 0,
    PRIMARY KEY (player_nick, check_time)
);

-- ============================================
-- 14. DEEPSEEK / AI ИНТЕГРАЦИЯ (БУДУЩЕЕ)
-- ============================================

-- Кэш ответов DeepSeek
CREATE TABLE IF NOT EXISTS deepseek_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    prompt TEXT NOT NULL,
    response TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME
);

-- ============================================
-- ИНИЦИАЛИЗАЦИЯ НАЧАЛЬНЫХ ДАННЫХ
-- ============================================

-- Вставка рангов клана
INSERT OR IGNORE INTO clan_ranks (name, display_name, priority, min_points, cooldown_days, max_promotions_per_wipe, can_kick, can_mute, can_blacklist, can_promote, can_admin) VALUES
('Новичок', '&8⌜&e&l𐓏&8⌟ﾠ&#0b674d&lн&#0e6f50&lо&#127753&lʙ&#157f56&lᴇ&#198759&lн&#1c8e5b&lь&#1f965e&lᴋ&#239e61&lи&#26a664&lй', 0, 0, 0, 0, 0, 0, 0, 0, 0),
('Участник', '&8⌜&e&l𐓏&8⌟ﾠ&#2b7e3a&lу&#2f853e&lч&#338c42&lа&#379346&lс&#3b9a4a&lт&#3ba14e&lн&#42a852&lи&#46af56&lк', 10, 0, 0, 0, 0, 0, 0, 0, 0),
('Мл.Модератор', '&8⌜&e&l🔧&8⌟ﾠ&#59ff6d&lᴍ&#54fd72&lʟ&#4ffa77&l.&#4bf87c&lᴍ&#46f681&lᴏ&#41f486&lᴅ&#3cf18b&lᴇ&#37ef90&lʀ', 20, 0, 0, 0, 1, 1, 1, 0, 0),
('Модератор', '&8⌜&e&l🛠&8⌟ﾠ&#114fff&lᴍ&#1552fc&lᴏ&#1856f9&lᴅ&#1c59f6&lᴇ&#1f5cf3&lʀ', 30, 0, 0, 0, 1, 1, 1, 1, 0),
('Ст.Модератор', '&8⌜&e🍁&8⌟ﾠ&#ffb10c&ls&#fdb20e&lᴛ&#fab30f&l.&#f8b511&lᴍ&#f6b612&lᴏ&#f4b714&lᴅ&#f1b815&lᴇ&#efb917&lʀ', 40, 0, 0, 0, 1, 1, 1, 1, 0),
('Гл.Модератор', '&8⌜&e🌟&8⌟ﾠ&#5323ff&lɢ&#5624fd&lʟ&#5a25fa&l.&#5d27f8&lᴍ&#6128f6&lᴏ&#6429f4&lᴅ&#682af1&lᴇ&#6b2bef&lʀ', 50, 0, 0, 0, 1, 1, 1, 1, 0),
('Куратор', '&8⌜&e✦&8⌟ﾠ&#ff118d&lᴋ&#ff158b&lʏ&#ff1a89&lʀ&#ff1e87&lᴀ&#ff2284&lᴛ&#ff2782&lᴏ&#ff2b80&lʀ', 60, 0, 0, 0, 1, 1, 1, 1, 1),
('Администратор', '&8⌜&e⭐&8⌟ﾠ&#790101&lᴀ&#940d0d&lᴅ&#b01919&lᴍ&#cb2424&lɪ&#e63030&lɴ', 100, 0, 0, 0, 1, 1, 1, 1, 1);

-- Вставка лимитов персонала
INSERT OR IGNORE INTO staff_limits (rank_level, rank_name, max_kicks_per_day, max_mutes_per_day, max_blacklists_per_day) VALUES
(1, 'Мл.Модератор', 2, 20, 20),
(2, 'Модератор', 5, 30, 30),
(3, 'Ст.Модератор', 10, 40, 40),
(4, 'Гл.Модератор', 25, 50, 70),
(5, 'Куратор', 9999, 9999, 9999),
(6, 'Администратор', 9999, 9999, 9999);

-- Вставка организаций
INSERT OR IGNORE INTO organizations (name, display_name, budget, tax_rate) VALUES
('police', 'Полиция', 1000000, 0.01),
('army', 'Армия', 1000000, 0.01),
('hospital', 'Больница', 1000000, 0.01),
('academy', 'Академия', 1000000, 0.01),
('government', 'Мэрия и суд', 2000000, 0.01);

-- Вставка рангов организаций (полиция)
INSERT OR IGNORE INTO org_ranks (org_name, rank_name, base_salary, priority, can_invite, can_kick, can_promote) VALUES
('police', 'Рядовой', 4500, 1, 0, 0, 0),
('police', 'Сержант', 5500, 2, 0, 0, 0),
('police', 'Прапорщик', 6200, 3, 0, 0, 0),
('police', 'Лейтенант', 7500, 4, 1, 0, 0),
('police', 'Капитан', 9500, 5, 1, 1, 0),
('police', 'Подполковник', 11000, 6, 1, 1, 1),
('police', 'Полковник', 13000, 7, 1, 1, 1);

-- Вставка рангов организаций (армия)
INSERT OR IGNORE INTO org_ranks (org_name, rank_name, base_salary, priority, can_invite, can_kick, can_promote) VALUES
('army', 'Рядовой', 4300, 1, 0, 0, 0),
('army', 'Сержант', 5000, 2, 0, 0, 0),
('army', 'Старшина', 5200, 3, 0, 0, 0),
('army', 'Прапорщик', 5800, 4, 0, 0, 0),
('army', 'Лейтенант', 6500, 5, 1, 0, 0),
('army', 'Капитан', 8000, 6, 1, 0, 0),
('army', 'Майор', 9000, 7, 1, 1, 0),
('army', 'Подполковник', 10500, 8, 1, 1, 1),
('army', 'Полковник', 12000, 9, 1, 1, 1),
('army', 'Маршал', 15000, 10, 1, 1, 1);

-- Вставка рангов организаций (больница)
INSERT OR IGNORE INTO org_ranks (org_name, rank_name, base_salary, priority, can_invite, can_kick, can_promote) VALUES
('hospital', 'Санитар(ка)', 4200, 1, 0, 0, 0),
('hospital', 'Сестра-хозяйка', 4500, 2, 0, 0, 0),
('hospital', 'Медсёстры/Брат', 5000, 3, 0, 0, 0),
('hospital', 'Фельдшер', 5800, 4, 0, 0, 0),
('hospital', 'Лаборант', 5500, 5, 0, 0, 0),
('hospital', 'Акушерка', 6000, 6, 0, 0, 0),
('hospital', 'Врач', 9000, 7, 1, 0, 0),
('hospital', 'Главный врач', 14000, 8, 1, 1, 1);

-- Вставка рангов организаций (академия)
INSERT OR IGNORE INTO org_ranks (org_name, rank_name, base_salary, priority, can_invite, can_kick, can_promote) VALUES
('academy', 'Стажёр', 4200, 1, 0, 0, 0),
('academy', 'Ассистент', 4800, 2, 0, 0, 0),
('academy', 'Преподаватель', 6000, 3, 0, 0, 0),
('academy', 'Зав. кафедрой', 7000, 4, 1, 0, 0),
('academy', 'Проректор', 9000, 5, 1, 1, 0),
('academy', 'Директор', 11000, 6, 1, 1, 1);

-- Вставка рангов организаций (правительство)
INSERT OR IGNORE INTO org_ranks (org_name, rank_name, base_salary, priority, can_invite, can_kick, can_promote) VALUES
('government', 'Адвокат', 7500, 1, 0, 0, 0),
('government', 'Прокурор', 10500, 2, 0, 0, 0),
('government', 'Помощник судьи', 6500, 3, 0, 0, 0),
('government', 'Судья', 12000, 4, 0, 0, 0),
('government', 'Министр', 15000, 5, 1, 1, 1),
('government', 'Мэр', 17000, 6, 1, 1, 1);

-- Вставка начальных настроек
INSERT OR IGNORE INTO settings (key, value, description) VALUES
('auto_mod_enabled', 'true', 'Авто-модерация в клановом чате'),
('clan_chat_ad_enabled', 'true', 'Реклама в клановом чате'),
('payday_enabled', 'true', 'Ежечасный PayDay'),
('proxy_enabled', 'false', 'Использовать прокси для бота'),
('deepseek_enabled', 'false', 'Включить DeepSeek API'),
('last_wipe_date', '2026-03-30', 'Дата последнего вайпа'),
('property_tax_rate', '0.01', 'Налог на имущество (1%)');

-- Добавление первого администратора (из ТЗ)
INSERT OR IGNORE INTO clan_members (minecraft_nick, rank_name, rank_priority, invited_by) 
VALUES ('Ronch_', 'Администратор', 100, 'system');

INSERT OR IGNORE INTO staff_stats (minecraft_nick, rank_level, rank_name, hired_by) 
VALUES ('Ronch_', 6, 'Администратор', 'system');

-- Индексы для оптимизации производительности
CREATE INDEX IF NOT EXISTS idx_punishments_player ON punishments(player);
CREATE INDEX IF NOT EXISTS idx_punishments_active ON punishments(active);
CREATE INDEX IF NOT EXISTS idx_property_owner ON property(owner_nick);
CREATE INDEX IF NOT EXISTS idx_org_members_nick ON org_members(minecraft_nick);
CREATE INDEX IF NOT EXISTS idx_org_members_org ON org_members(org_name);
CREATE INDEX IF NOT EXISTS idx_money_logs_player ON money_logs(player);
CREATE INDEX IF NOT EXISTS idx_money_logs_date ON money_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_clan_chat_date ON clan_chat_logs(sent_at);
CREATE INDEX IF NOT EXISTS idx_verification_codes_active ON verification_codes(is_active);
CREATE INDEX IF NOT EXISTS idx_pvp_stats_killer ON pvp_stats(killer);
CREATE INDEX IF NOT EXISTS idx_pvp_stats_victim ON pvp_stats(victim);