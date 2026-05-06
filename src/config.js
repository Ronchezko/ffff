// src/config.js — Единый конфигурационный файл Resistance City v5.0.0
// Содержит ВСЕ константы, настройки структур, цен, зарплат и имущества
// Все значения могут быть переопределены через переменные окружения (.env)

'use strict';

const path = require('path');

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================

/**
 * Получить число из переменной окружения с fallback
 */
function envNumber(key, defaultValue) {
    const value = process.env[key];
    if (value === undefined || value === null || value === '') return defaultValue;
    const parsed = parseFloat(value);
    return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Получить булево значение из переменной окружения с fallback
 */
function envBoolean(key, defaultValue) {
    const value = process.env[key];
    if (value === undefined || value === null || value === '') return defaultValue;
    return value === 'true' || value === '1' || value === 'yes';
}

/**
 * Получить строку из переменной окружения с fallback
 */
function envString(key, defaultValue) {
    const value = process.env[key];
    return value !== undefined && value !== null && value !== '' ? value : defaultValue;
}

// ==================== ОСНОВНОЙ КОНФИГ ====================
const config = {
    // ==================== ПУТИ ====================
    paths: {
        db: envString('DB_PATH', path.join(__dirname, '..', 'data', 'hohols.db')),
        logs: envString('LOGS_DIR', path.join(__dirname, '..', 'logs')),
        data: envString('DATA_DIR', path.join(__dirname, '..', 'data')),
        backups: envString('BACKUP_DIR', path.join(__dirname, '..', 'data', 'backups')),
    },

    // ==================== ОКРУЖЕНИЕ ====================
    env: envString('NODE_ENV', 'development'),
    timezone: envString('TIMEZONE', 'Europe/Moscow'),
    isDevelopment: process.env.NODE_ENV !== 'production',
    isProduction: process.env.NODE_ENV === 'production',

    // ==================== КЛАН ====================
    clan: {
        name: envString('CLAN_NAME', 'Resistance'),
        tag: envString('CLAN_TAG', 'R'),
        fullColor: '&#6343d4&lR&#6b44d9&le&#7345de&ls&#7b47e2&li&#8348e7&ls&#8a49ec&lt&#924af1&la&#9a4cf5&ln&#a24dfa&lc&#aa4eff&le',
        regionPrefix: envString('CLAN_REGION_PREFIX', 'TRTR'),
        serverCommand: envString('CLAN_SERVER_COMMAND', '/s3'),

        // Ранг по умолчанию для новых участников
        defaultRank: '&8⌜&e&l𐓏&8⌟ﾠ&#0b674d&lн&#0e6f50&lо&#127753&lʙ&#157f56&lᴇ&#198759&lн&#1c8e5b&lь&#1f965e&lᴋ&#239e61&lи&#26a664&lй',

        // Discord каналы
        discord: {
            verificationChannelId: envString('VERIFICATION_CHANNEL_ID', '1466550097759174773'),
            verifiedRoleId: envString('VERIFIED_ROLE_ID', '1466550097218113794'),
            commandsChannelId: envString('COMMANDS_CHANNEL_ID', '1466550098082271235'),
            logChannelId: envString('LOG_CHANNEL_ID', '1474633679442804798'),
            moderationLogChannelId: envString('MODERATION_LOG_CHANNEL_ID', '1474633679442804798'),
            clanUpdatesChannelId: envString('CLAN_UPDATES_CHANNEL_ID', '1466550097759174773'),
            economyLogChannelId: envString('ECONOMY_LOG_CHANNEL_ID', '1474633679442804798'),
            staffLogChannelId: envString('STAFF_LOG_CHANNEL_ID', '1474633679442804798'),
        },
    },

    // ==================== MINECRAFT СЕРВЕР ====================
    minecraft: {
        host: envString('MINECRAFT_HOST', 'ru.dexland.org'),
        port: envNumber('MINECRAFT_PORT', 25565),
        version: envString('MINECRAFT_VERSION', '1.20.4'),
        username: envString('MINECRAFT_USERNAME', 'YT_FLATT807'),
        backupUsername: envString('MINECRAFT_BACKUP_USERNAME', 'xxx_toper_xxx'),
        authType: envString('MINECRAFT_AUTH_TYPE', 'mojang'),

        // Реконнект
        reconnectDelay: envNumber('MINECRAFT_RECONNECT_DELAY', 30000),
        maxReconnectAttempts: envNumber('MINECRAFT_MAX_RECONNECT_ATTEMPTS', 20),
        lobbyReconnectDelay: envNumber('MINECRAFT_LOBBY_RECONNECT_DELAY', 10000),

        // Перезагрузка сервера
        restartTime: envString('MINECRAFT_RESTART_TIME', '03:00'),
        restartReconnectDelay: envNumber('MINECRAFT_RESTART_RECONNECT_DELAY', 300000),

        // Прокси
        proxy: {
            enabled: envBoolean('USE_PROXY', false),
            host: envString('PROXY_HOST', '127.0.0.1'),
            port: envNumber('PROXY_PORT', 1080),
            version: envNumber('PROXY_VERSION', 5),
            username: envString('PROXY_USERNAME', ''),
            password: envString('PROXY_PASSWORD', ''),
        },
    },

    // ==================== DEEPSEEK API ====================
    deepseek: {
        enabled: envBoolean('DEEPSEEK_ENABLED', false),
        apiKey: envString('DEEPSEEK_API_KEY', ''),
        model: envString('DEEPSEEK_MODEL', 'deepseek-chat'),
        maxTokens: envNumber('DEEPSEEK_MAX_TOKENS', 2000),
    },

    // ==================== РАНГИ ПЕРСОНАЛА КЛАНА ====================
    staffRanks: {
        administrator: {
            key: 'administrator',
            name: 'Администратор',
            colorRank: '&8⌜&e⭐&8⌟ﾠ&#790101&lᴀ&#940d0d&lᴅ&#b01919&lᴍ&#cb2424&lɪ&#e63030&lɴ',
            level: 100,
            permissions: 'unlimited',
            dailyLimits: {
                kicks: Infinity,
                mutes: Infinity,
                blacklists: Infinity,
            },
            canManageAdmin: true,
            canStopAll: true,
        },
        curator: {
            key: 'curator',
            name: 'Куратор',
            colorRank: '&8⌜&e✦&8⌟ﾠ&#ff118d&lᴋ&#ff158b&lʏ&#ff1a89&lʀ&#ff1e87&lᴀ&#ff2284&lᴛ&#ff2782&lᴏ&#ff2b80&lʀ',
            level: 90,
            permissions: 'unlimited',
            dailyLimits: {
                kicks: Infinity,
                mutes: Infinity,
                blacklists: Infinity,
            },
            canManageAdmin: false,
            canStopAll: false,
        },
        headModerator: {
            key: 'headModerator',
            name: 'Гл.Модератор',
            colorRank: '&8⌜&e🌟&8⌟ﾠ&#5323ff&lɢ&#5624fd&lʟ&#5a25fa&l.&#5d27f8&lᴍ&#6128f6&lᴏ&#6429f4&lᴅ&#682af1&lᴇ&#6b2bef&lʀ',
            level: 80,
            dailyLimits: {
                kicks: 25,
                mutes: 50,
                blacklists: 70,
            },
            canManageSpamSettings: true,
        },
        seniorModerator: {
            key: 'seniorModerator',
            name: 'Ст.Модератор',
            colorRank: '&8⌜&e🍁&8⌟ﾠ&#ffb10c&ls&#fdb20e&lᴛ&#fab30f&l.&#f8b511&lᴍ&#f6b612&lᴏ&#f4b714&lᴅ&#f1b815&lᴇ&#efb917&lʀ',
            level: 70,
            dailyLimits: {
                kicks: 10,
                mutes: 40,
                blacklists: 40,
            },
            canIssueWarns: true,
        },
        moderator: {
            key: 'moderator',
            name: 'Модератор',
            colorRank: '&8⌜&e&l🛠&8⌟ﾠ&#114fff&lᴍ&#1552fc&lᴏ&#1856f9&lᴅ&#1c59f6&lᴇ&#1f5cf3&lʀ',
            level: 60,
            dailyLimits: {
                kicks: 5,
                mutes: 30,
                blacklists: 30,
            },
        },
        juniorModerator: {
            key: 'juniorModerator',
            name: 'Мл.Модератор',
            colorRank: '&8⌜&e&l🔧&8⌟ﾠ&#59ff6d&lᴍ&#54fd72&lʟ&#4ffa77&l.&#4bf87c&lᴍ&#46f681&lᴏ&#41f486&lᴅ&#3cf18b&lᴇ&#37ef90&lʀ',
            level: 50,
            dailyLimits: {
                kicks: 2,
                mutes: 20,
                blacklists: 20,
            },
        },
    },

    // ==================== ГОСУДАРСТВЕННЫЕ СТРУКТУРЫ ====================
    organizations: {
        police: {
            name: 'Полиция (МВД)',
            key: 'police',
            budget: 5000000,
            initialMaterials: 0,
            ministerTitle: 'Министр Внутренних Дел',
            ranks: {
                'Рядовой': { salary: 4500, level: 1, category: 'junior' },
                'Сержант': { salary: 5500, level: 2, category: 'junior' },
                'Прапорщик': { salary: 6200, level: 3, category: 'junior' },
                'Лейтенант': { salary: 7500, level: 4, category: 'middle' },
                'Капитан': { salary: 9500, level: 5, category: 'middle' },
                'Подполковник': { salary: 11000, level: 6, category: 'senior' },
                'Полковник': { salary: 13000, level: 7, category: 'senior' },
            },
            commands: {
                search: { minRank: 'Рядовой' },
                check: { minRank: 'Рядовой' },
                fine: { minRank: 'Сержант' },
                order: { minRank: 'Лейтенант' },
            },
        },
        army: {
            name: 'Армия',
            key: 'army',
            budget: 8000000,
            initialMaterials: 0,
            ministerTitle: 'Министр Обороны',
            ranks: {
                'Рядовой': { salary: 4300, level: 1, category: 'junior' },
                'Сержант': { salary: 5000, level: 2, category: 'junior' },
                'Старшина': { salary: 5200, level: 3, category: 'junior' },
                'Прапорщик': { salary: 5800, level: 4, category: 'middle' },
                'Лейтенант': { salary: 6500, level: 5, category: 'middle' },
                'Капитан': { salary: 8000, level: 6, category: 'middle' },
                'Майор': { salary: 9000, level: 7, category: 'senior' },
                'Подполковник': { salary: 10500, level: 8, category: 'senior' },
                'Полковник': { salary: 12000, level: 9, category: 'senior' },
                'Маршал': { salary: 15000, level: 10, category: 'command' },
            },
            commands: {
                tr_status: { minRank: 'Рядовой' },
                border: { minRank: 'Рядовой' },
                tr_set: { minRank: 'Капитан' },
            },
        },
        hospital: {
            name: 'Больница',
            key: 'hospital',
            budget: 4000000,
            initialMaterials: 0,
            ministerTitle: 'Министр Здравоохранения',
            ranks: {
                'Санитар(ка)': { salary: 4200, level: 1, category: 'junior' },
                'Сестра-хозяйка': { salary: 4500, level: 2, category: 'junior' },
                'Медсёстры/Брат': { salary: 5000, level: 3, category: 'junior' },
                'Фельдшер': { salary: 5800, level: 4, category: 'middle' },
                'Лаборант': { salary: 5500, level: 5, category: 'middle' },
                'Акушерка': { salary: 6000, level: 6, category: 'middle' },
                'Врач': { salary: 9000, level: 7, category: 'senior' },
                'Главный врач': { salary: 14000, level: 8, category: 'command' },
            },
            commands: {
                redcode_status: { minRank: 'Рядовой' },
                redcode_set: { minRank: 'Врач' },
                heal: { minRank: 'Фельдшер' },
                medical_book: { minRank: 'Врач' },
            },
        },
        academy: {
            name: 'Академия',
            key: 'academy',
            budget: 3000000,
            initialMaterials: 0,
            ministerTitle: 'Министр Образования',
            ranks: {
                'Стажёр': { salary: 4200, level: 1, category: 'junior' },
                'Ассистент': { salary: 4800, level: 2, category: 'junior' },
                'Преподаватель': { salary: 6000, level: 3, category: 'middle' },
                'Зав. кафедрой': { salary: 7000, level: 4, category: 'middle' },
                'Проректор': { salary: 9000, level: 5, category: 'senior' },
                'Директор': { salary: 11000, level: 6, category: 'command' },
            },
            commands: {
                grade: { minRank: 'Преподаватель' },
                educate: { minRank: 'Преподаватель' },
            },
        },
        government: {
            name: 'Мэрия и Суд',
            key: 'government',
            budget: 10000000,
            initialMaterials: 0,
            ministerTitle: null, // Мэр — глава
            ranks: {
                'Адвокат': { salary: 7500, level: 1, category: 'junior' },
                'Прокурор': { salary: 10500, level: 2, category: 'middle' },
                'Помощник судьи': { salary: 6500, level: 3, category: 'middle' },
                'Судья': { salary: 12000, level: 4, category: 'senior' },
                'Министр': { salary: 15000, level: 5, category: 'senior' },
                'Мэр': { salary: 17000, level: 6, category: 'command' },
            },
        },
    },

    // ==================== ЗАРПЛАТЫ (полный справочник) ====================
    salaries: {
        police: {
            'Рядовой': 4500,
            'Сержант': 5500,
            'Прапорщик': 6200,
            'Лейтенант': 7500,
            'Капитан': 9500,
            'Подполковник': 11000,
            'Полковник': 13000,
        },
        army: {
            'Рядовой': 4300,
            'Сержант': 5000,
            'Старшина': 5200,
            'Прапорщик': 5800,
            'Лейтенант': 6500,
            'Капитан': 8000,
            'Майор': 9000,
            'Подполковник': 10500,
            'Полковник': 12000,
            'Маршал': 15000,
        },
        hospital: {
            'Санитар(ка)': 4200,
            'Сестра-хозяйка': 4500,
            'Медсёстры/Брат': 5000,
            'Фельдшер': 5800,
            'Лаборант': 5500,
            'Акушерка': 6000,
            'Врач': 9000,
            'Главный врач': 14000,
        },
        academy: {
            'Стажёр': 4200,
            'Ассистент': 4800,
            'Преподаватель': 6000,
            'Зав. кафедрой': 7000,
            'Проректор': 9000,
            'Директор': 11000,
        },
        government: {
            'Адвокат': 7500,
            'Прокурор': 10500,
            'Помощник судьи': 6500,
            'Судья': 12000,
            'Министр': 15000,
            'Мэр': 17000,
        },
    },

    // ==================== PAYDAY ====================
    payday: {
        enabled: envBoolean('PAYDAY_ENABLED', true),
        minDutyMinutes: envNumber('PAYDAY_MIN_DUTY_MINUTES', 15),
        intervalHours: envNumber('PAYDAY_INTERVAL_HOURS', 1),
        taxRate: envNumber('PAYDAY_TAX_RATE', 0.01),
        workHours: [
            { start: 14, end: 17 },
            { start: 18, end: 23 },
        ],
        breakHours: { start: 17, end: 18 },
        restHours: { start: 23, end: 14 },
    },

    // ==================== ЭКОНОМИКА ====================
    economy: {
        startingBalance: envNumber('STARTING_BALANCE', 1000),
        maxTransferAmount: envNumber('MAX_TRANSFER_AMOUNT', 50000),
        transferCooldownSeconds: envNumber('TRANSFER_COOLDOWN_SECONDS', 15),
        taxRate: envNumber('PAYDAY_TAX_RATE', 0.01),
        maxPropertyTaxRate: 0.05,
    },

    // ==================== БАНК ====================
    bank: {
        depositRate: envNumber('BANK_DEPOSIT_RATE', 0.03),
        creditRate: envNumber('BANK_CREDIT_RATE', 0.07),
        maxCredit: envNumber('BANK_MAX_CREDIT', 500000),
        creditDurationDays: envNumber('BANK_CREDIT_DURATION_DAYS', 30),
    },

    // ==================== ЛИЦЕНЗИИ ====================
    licenses: {
        business: {
            price: envNumber('LICENSE_BUSINESS_PRICE', 800000),
            durationDays: envNumber('LICENSE_BUSINESS_DURATION_DAYS', 7),
            renewWarningDays: 2,
        },
        office: {
            price: envNumber('LICENSE_OFFICE_PRICE', 900000),
            durationDays: envNumber('LICENSE_OFFICE_DURATION_DAYS', 7),
            renewWarningDays: 2,
        },
        medicalBook: {
            price: envNumber('LICENSE_MEDICAL_BOOK_PRICE', 5000),
            validityDays: envNumber('LICENSE_MEDICAL_BOOK_VALIDITY_DAYS', 30),
        },
        educationAdvanced: {
            price: envNumber('LICENSE_EDUCATION_ADVANCED_PRICE', 50000),
        },
    },

    // ==================== АВТО-МОДЕРАЦИЯ ====================
    autoMod: {
        enabled: envBoolean('AUTO_MOD_ENABLED', true),
        maxMessagesPerMinute: envNumber('AUTO_MOD_MAX_MESSAGES_PER_MINUTE', 3),
        warnCountBeforeMute: envNumber('AUTO_MOD_WARN_BEFORE_MUTE', 3),
        muteDurationMinutes: envNumber('AUTO_MOD_MUTE_DURATION_MINUTES', 30),
        blacklistJoinLeaveLimit: envNumber('AUTO_MOD_BLACKLIST_JOIN_LEAVE_LIMIT', 3),
        blacklistResetHours: envNumber('AUTO_MOD_BLACKLIST_RESET_HOURS', 12),
        blacklistDurationHours: envNumber('AUTO_MOD_BLACKLIST_DURATION_HOURS', 6),
    },

    // ==================== ОГРАБЛЕНИЯ ====================
    robbery: {
        maxAmount: envNumber('ROBBERY_MAX_AMOUNT', 50000),
        minPartySize: envNumber('ROBBERY_MIN_PARTY_SIZE', 3),
        cooldownHours: envNumber('ROBBERY_COOLDOWN_HOURS', 6),
        fineResponseTimeoutMs: envNumber('ROBBERY_FINE_RESPONSE_TIMEOUT_MS', 60000),
    },

    // ==================== ЗАБОЛЕВАНИЯ ====================
    virus: {
        defaultChance: envNumber('VIRUS_DEFAULT_CHANCE', 0.05),
        highChance: envNumber('VIRUS_HIGH_CHANCE', 0.40),
        freeTreatmentHours: envNumber('VIRUS_FREE_TREATMENT_HOURS', 48),
        paidTreatmentHours: envNumber('VIRUS_PAID_TREATMENT_HOURS', 1),
        paidTreatmentCost: envNumber('VIRUS_PAID_TREATMENT_COST', 15000),
    },

    // ==================== АРМИЯ: ПОСТАВКИ ====================
    armySupply: {
        minPartySize: envNumber('ARMY_SUPPLY_MIN_PARTY_SIZE', 5),
        minTimeMinutes: {
            5: 10,
            6: 10,
            7: 12,
            8: 12,
            9: 15,
            10: 15,
        },
        defendersRatio: 1,
        wantedDurationMinutes: envNumber('ARMY_SUPPLY_WANTED_DURATION_MINUTES', 60),
        materialValue: envNumber('ARMY_SUPPLY_MATERIAL_VALUE', 15000),
    },

    // ==================== ВЕБ-ПАНЕЛЬ ====================
    web: {
        adminUsername: envString('ADMIN_USERNAME', 'admin1'),
        adminPassword: envString('ADMIN_PASSWORD', '123123'),
        sessionSecret: envString('SESSION_SECRET', 'default_secret_change_me'),
        jwtSecret: envString('JWT_SECRET', 'default_jwt_secret_change_me'),
        sessionMaxAge: envNumber('SESSION_MAX_AGE', 86400000),
        rateLimitWindowMs: envNumber('WEB_RATE_LIMIT_WINDOW_MS', 900000),
        rateLimitMax: envNumber('WEB_RATE_LIMIT_MAX', 100),
        trustProxy: envBoolean('WEB_TRUST_PROXY', false),
    },

    // ==================== ТИПЫ ОФИСОВ ====================
    officeTypes: [
        {
            key: 'crypto_mining',
            name: 'Крипто-майнинг',
            description: 'Майнинг криптовалюты для получения пассивного дохода',
            baseEarnings: 5000,
            questions: [
                { question: 'Какой алгоритм использует Bitcoin?', answer: 'SHA-256', difficulty: 3 },
                { question: 'Что такое хешрейт?', answer: 'Мощность майнинга', difficulty: 2 },
                { question: 'Какой консенсус у Bitcoin?', answer: 'Proof of Work', difficulty: 3 },
                { question: 'Что такое блок в блокчейне?', answer: 'Набор транзакций', difficulty: 1 },
                { question: 'Что такое нода?', answer: 'Узел сети', difficulty: 1 },
                { question: 'Какая награда за блок Bitcoin сейчас?', answer: '3.125 BTC', difficulty: 4 },
                { question: 'Что такое майнинг-пул?', answer: 'Объединение майнеров', difficulty: 2 },
                { question: 'Что такое ASIC?', answer: 'Специализированное оборудование', difficulty: 3 },
                { question: 'Что такое халвинг?', answer: 'Уменьшение награды вдвое', difficulty: 4 },
                { question: 'Какой алгоритм у Ethereum после перехода на PoS?', answer: 'PoS', difficulty: 3 },
            ],
        },
        {
            key: 'it_company',
            name: 'IT-компания',
            description: 'Разработка ПО и веб-сервисов',
            baseEarnings: 4500,
            questions: [
                { question: 'Что такое API?', answer: 'Интерфейс программирования', difficulty: 1 },
                { question: 'Какой язык используется для веб-разработки?', answer: 'JavaScript', difficulty: 1 },
                { question: 'Что такое база данных?', answer: 'Хранилище данных', difficulty: 1 },
                { question: 'Что такое HTTP?', answer: 'Протокол передачи данных', difficulty: 2 },
                { question: 'Что такое Git?', answer: 'Система контроля версий', difficulty: 2 },
                { question: 'Что такое фреймворк?', answer: 'Каркас для разработки', difficulty: 2 },
                { question: 'Что такое Docker?', answer: 'Контейнеризация', difficulty: 3 },
                { question: 'Что такое микросервисы?', answer: 'Архитектура приложения', difficulty: 3 },
                { question: 'Что такое CI/CD?', answer: 'Непрерывная интеграция', difficulty: 4 },
                { question: 'Что такое Kubernetes?', answer: 'Оркестрация контейнеров', difficulty: 4 },
            ],
        },
        {
            key: 'design_studio',
            name: 'Дизайн-студия',
            description: 'Создание дизайна, брендинга и рекламы',
            baseEarnings: 4000,
            questions: [
                { question: 'Что такое RGB?', answer: 'Цветовая модель', difficulty: 1 },
                { question: 'Какой формат для векторной графики?', answer: 'SVG', difficulty: 2 },
                { question: 'Что такое типографика?', answer: 'Искусство шрифта', difficulty: 2 },
                { question: 'Что такое UI/UX?', answer: 'Дизайн интерфейсов', difficulty: 1 },
                { question: 'Какой инструмент для прототипирования?', answer: 'Figma', difficulty: 1 },
                { question: 'Что такое брендбук?', answer: 'Руководство по стилю', difficulty: 3 },
                { question: 'Что такое кернинг?', answer: 'Расстояние между буквами', difficulty: 3 },
                { question: 'Что такое композиция?', answer: 'Расположение элементов', difficulty: 2 },
                { question: 'Что такое CMYK?', answer: 'Цветовая модель для печати', difficulty: 3 },
                { question: 'Что такое мудборд?', answer: 'Доска настроения', difficulty: 2 },
            ],
        },
        {
            key: 'consulting',
            name: 'Консалтинг',
            description: 'Бизнес-консультирование и аналитика',
            baseEarnings: 5500,
            questions: [
                { question: 'Что такое SWOT-анализ?', answer: 'Анализ сильных и слабых сторон', difficulty: 2 },
                { question: 'Что такое ROI?', answer: 'Окупаемость инвестиций', difficulty: 2 },
                { question: 'Что такое KPI?', answer: 'Ключевые показатели', difficulty: 1 },
                { question: 'Что такое стартап?', answer: 'Новый бизнес', difficulty: 1 },
                { question: 'Что такое бизнес-план?', answer: 'План развития', difficulty: 1 },
                { question: 'Что такое аутсорсинг?', answer: 'Передача задач внешним исполнителям', difficulty: 2 },
                { question: 'Что такое PEST-анализ?', answer: 'Анализ внешней среды', difficulty: 3 },
                { question: 'Что такое диверсификация?', answer: 'Расширение ассортимента', difficulty: 3 },
                { question: 'Что такое венчурные инвестиции?', answer: 'Рисковые инвестиции', difficulty: 4 },
                { question: 'Что такое EBITDA?', answer: 'Прибыль до вычетов', difficulty: 4 },
            ],
        },
    ],

    // ==================== ИМУЩЕСТВО (ВСЕ ID) ====================
    propertyPrices: {
        1: { type: 'office', price: 600000 },
        2: { type: 'office', price: 600000 },
        3: { type: 'office', price: 600000 },
        4: { type: 'office', price: 600000 },
        5: { type: 'apartment', price: 600000 },
        6: { type: 'apartment', price: 600000 },
        7: { type: 'apartment', price: 600000 },
        8: { type: 'apartment', price: 600000 },
        9: { type: 'apartment', price: 600000 },
        10: { type: 'apartment', price: 600000 },
        11: { type: 'apartment', price: 600000 },
        12: { type: 'apartment', price: 600000 },
        13: { type: 'apartment', price: 600000 },
        14: { type: 'apartment', price: 600000 },
        15: { type: 'apartment', price: 600000 },
        16: { type: 'business', price: 7500000 },
        17: { type: 'apartment', price: 900000 },
        18: { type: 'apartment', price: 900000 },
        19: { type: 'apartment', price: 900000 },
        20: { type: 'apartment', price: 900000 },
        21: { type: 'apartment', price: 900000 },
        22: { type: 'apartment', price: 900000 },
        23: { type: 'apartment', price: 900000 },
        24: { type: 'apartment', price: 900000 },
        25: { type: 'office', price: 10500000 },
        26: { type: 'business', price: 10500000 },
        27: { type: 'office', price: 5000000 },
        28: { type: 'office', price: 5000000 },
        29: { type: 'office', price: 5000000 },
        30: { type: 'office', price: 5000000 },
        31: { type: 'apartment', price: 1200000 },
        32: { type: 'apartment', price: 800000 },
        33: { type: 'apartment', price: 1200000 },
        34: { type: 'apartment', price: 1200000 },
        35: { type: 'apartment', price: 800000 },
        36: { type: 'apartment', price: 800000 },
        37: { type: 'apartment', price: 800000 },
        38: { type: 'apartment', price: 1200000 },
        39: { type: 'apartment', price: 1200000 },
        40: { type: 'apartment', price: 800000 },
        41: { type: 'apartment', price: 1200000 },
        42: { type: 'apartment', price: 1200000 },
        43: { type: 'apartment', price: 1200000 },
        44: { type: 'apartment', price: 800000 },
        45: { type: 'apartment', price: 800000 },
        46: { type: 'apartment', price: 1200000 },
        47: { type: 'apartment', price: 1200000 },
        48: { type: 'apartment', price: 800000 },
        49: { type: 'apartment', price: 1200000 },
        50: { type: 'apartment', price: 1200000 },
        51: { type: 'apartment', price: 1200000 },
        52: { type: 'apartment', price: 800000 },
        53: { type: 'apartment', price: 800000 },
        54: { type: 'apartment', price: 1200000 },
        55: { type: 'business', price: 7500000 },
        56: { type: 'business', price: 7500000 },
        57: { type: 'apartment', price: 800000 },
        58: { type: 'apartment', price: 800000 },
        59: { type: 'apartment', price: 800000 },
        60: { type: 'apartment', price: 1200000 },
        61: { type: 'apartment', price: 1200000 },
        62: { type: 'apartment', price: 800000 },
        63: { type: 'apartment', price: 800000 },
        65: { type: 'apartment', price: 1200000 },
        66: { type: 'apartment', price: 1200000 },
        68: { type: 'apartment', price: 800000 },
        71: { type: 'apartment', price: 800000 },
        72: { type: 'apartment', price: 800000 },
        73: { type: 'apartment', price: 600000 },
        74: { type: 'apartment', price: 600000 },
        75: { type: 'business', price: 8900000 },
        76: { type: 'business', price: 8900000 },
        77: { type: 'business', price: 8900000 },
        78: { type: 'business', price: 8900000 },
        79: { type: 'business', price: 4500000 },
        80: { type: 'business', price: 4500000 },
        81: { type: 'business', price: 1800000 },
        82: { type: 'business', price: 1800000 },
        84: { type: 'apartment', price: 400000 },
        85: { type: 'apartment', price: 200000 },
        86: { type: 'apartment', price: 400000 },
        87: { type: 'apartment', price: 400000 },
        88: { type: 'apartment', price: 400000 },
        89: { type: 'apartment', price: 200000 },
        90: { type: 'apartment', price: 200000 },
        91: { type: 'apartment', price: 600000 },
        92: { type: 'apartment', price: 600000 },
        93: { type: 'apartment', price: 600000 },
        94: { type: 'apartment', price: 600000 },
        95: { type: 'apartment', price: 600000 },
        96: { type: 'apartment', price: 600000 },
        97: { type: 'apartment', price: 600000 },
        98: { type: 'apartment', price: 600000 },
        99: { type: 'apartment', price: 600000 },
        100: { type: 'apartment', price: 600000 },
        101: { type: 'apartment', price: 600000 },
        '101.2': { type: 'apartment', price: 600000 },
        102: { type: 'business', price: 4500000 },
        103: { type: 'apartment', price: 500000 },
        104: { type: 'apartment', price: 500000 },
        105: { type: 'apartment', price: 500000 },
        106: { type: 'apartment', price: 500000 },
        107: { type: 'apartment', price: 500000 },
        108: { type: 'business', price: 5500000 },
        109: { type: 'apartment', price: 600000 },
        110: { type: 'apartment', price: 600000 },
        111: { type: 'apartment', price: 600000 },
        112: { type: 'apartment', price: 600000 },
        113: { type: 'apartment', price: 600000 },
        114: { type: 'apartment', price: 600000 },
        115: { type: 'apartment', price: 600000 },
        116: { type: 'apartment', price: 600000 },
        117: { type: 'house', price: 4500000 },
        118: { type: 'house', price: 1800000 },
        119: { type: 'house', price: 2300000 },
        120: { type: 'house', price: 5500000 },
        121: { type: 'house', price: 2300000 },
        122: { type: 'house', price: 6500000 },
        123: { type: 'house', price: 6700000 },
        124: { type: 'house', price: 5500000 },
        125: { type: 'house', price: 4500000 },
        126: { type: 'house', price: 6700000 },
        127: { type: 'house', price: 2300000 },
        128: { type: 'business', price: 6500000 },
        129: { type: 'business', price: 5500000 },
        130: { type: 'business', price: 4500000 },
        131: { type: 'business', price: 1900000 },
        132: { type: 'house', price: 6700000 },
        133: { type: 'house', price: 3500000 },
        134: { type: 'house', price: 2000000 },
        135: { type: 'office', price: 11500000 },
        136: { type: 'business', price: 4500000 },
        137: { type: 'apartment', price: 600000 },
        138: { type: 'apartment', price: 600000 },
        139: { type: 'apartment', price: 600000 },
        140: { type: 'apartment', price: 600000 },
        '140.1': { type: 'apartment', price: 600000 },
        141: { type: 'house', price: 3300000 },
        142: { type: 'house', price: 6500000 },
        143: { type: 'house', price: 5500000 },
        144: { type: 'house', price: 4500000 },
        145: { type: 'port', price: 20000000 },
    },

    // ==================== МЕТОДЫ ДЛЯ ПОЛУЧЕНИЯ ДАННЫХ ====================

    /**
     * Получить зарплату для конкретной структуры и ранга
     */
    getSalary(organizationKey, rank) {
        const org = this.organizations[organizationKey];
        if (!org || !org.ranks[rank]) return 0;
        return org.ranks[rank].salary;
    },

    /**
     * Получить информацию о property по ID
     */
    getPropertyInfo(propertyId) {
        return this.propertyPrices[propertyId] || null;
    },

    /**
     * Получить все property определённого типа
     */
    getPropertiesByType(type) {
        return Object.entries(this.propertyPrices)
            .filter(([_, info]) => info.type === type)
            .map(([id, info]) => ({ id, ...info }));
    },

    /**
     * Получить ранг персонала по ключу
     */
    getStaffRank(key) {
        return this.staffRanks[key] || null;
    },

    /**
     * Проверить, достаточно ли прав у ранга персонала для действия
     */
    hasStaffPermission(staffRankKey, action) {
        const rank = this.staffRanks[staffRankKey];
        if (!rank) return false;
        if (rank.permissions === 'unlimited') return true;

        if (action === 'manageAdmin' && !rank.canManageAdmin) return false;
        if (action === 'stopAll' && !rank.canStopAll) return false;
        if (action === 'manageSpamSettings' && !rank.canManageSpamSettings) return false;
        if (action === 'issueWarns' && !rank.canIssueWarns) return false;

        return true;
    },

    /**
     * Получить лимиты персонала на день
     */
    getStaffLimits(staffRankKey) {
        const rank = this.staffRanks[staffRankKey];
        if (!rank) return { kicks: 0, mutes: 0, blacklists: 0 };
        return rank.dailyLimits;
    },
};

module.exports = config;