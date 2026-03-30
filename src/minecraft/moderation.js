const logger = require('../shared/logger');

const CONFIG = {
    MUTE_IMMUNE_RANKS: ['Администратор', 'Куратор', 'Модератор', 'Владелец'],
    WARNINGS_BEFORE_MUTE: 2,
    BASE_MUTE_TIME: 15, // минут
    DECAY_TIME: 300000, // 5 минут (сброс варнов при хорошем поведении)
    SIMILARITY_THRESHOLD: 0.8,
    BOT_REPLY_COOLDOWN: 5000, // Бот не пишет одному игроку чаще чем раз в 5 сек
};

const playerStats = new Map();
const botLastReply = new Map();

const TEMPLATES = {
    warn1: [
        "🌱 @{user}, ведите себя прилично. Предупреждение (1/2)",
        "🍃 @{user}, не нарушайте правила чата. (1/2)",
        "🌿 @{user}, тише... это первое предупреждение. (1/2)"
    ],
    warn2: [
        "⚠️ @{user}, это последнее предупреждение (2/2)!",
        "🛑 @{user}, остановитесь, иначе будет мут! (2/2)",
        "🚫 @{user}, еще одно нарушение и чат закроется. (2/2)"
    ],
    mute: [
        "🔇 Игрок {user} замучен на {time}м. Причина: {reason}",
        "🤐 {user} лишен права голоса на {time}м. [{reason}]",
        "🛑 Режим тишины для {user} ({time}м). Причина: {reason}"
    ]
};

// Генератор уникального текста, чтобы бота не забанили
function generateUniqueText(type, user, extras = {}) {
    const variants = TEMPLATES[type];
    let text = variants[Math.floor(Math.random() * variants.length)]
        .replace("{user}", user)
        .replace("{time}", extras.time || "")
        .replace("{reason}", extras.reason || "");
    
    // Добавляем невидимый шум в конец (разное кол-во пробелов и точек)
    const noise = " ".repeat(Math.floor(Math.random() * 2)) + (Math.random() > 0.5 ? "." : "!");
    return text + noise;
}

/**
 * ПРОВЕРКА НАЛИЧИЯ МУТА В БАЗЕ
 */
async function isPlayerMuted(db, nickname) {
    try {
        const row = await db.getDb().get(
            "SELECT id FROM punishments WHERE player = ? AND type = 'mute' AND active = 1 AND expires_at > datetime('now')",
            [nickname]
        );
        return !!row;
    } catch (e) { return false; }
}

function startModerationScheduler() {
    logger.info("[MOD] Система интеллектуальной модерации запущена.");
    setInterval(() => {
        const now = Date.now();
        for (const [nick, data] of playerStats.entries()) {
            if (now - data.lastViolationTime > CONFIG.DECAY_TIME && data.warnings > 0) {
                data.warnings--;
                data.lastViolationTime = now;
            }
        }
    }, 60000);
}

async function moderateMessage(bot, nickname, message, db, isClanChat, callbacks) {
    const { sendClan, sendPrivate } = callbacks;

    // 1. ПРОВЕРКА МУТА (Если в муте - полный игнор)
    const muted = await isPlayerMuted(db, nickname);
    if (muted) {
        if (!isClanChat) logger.debug(`[MOD] Игнорирую сообщение от мученика: ${nickname}`);
        return { allowed: false };
    }

    // 2. ИММУНИТЕТ
    const staffRank = await db.getStaffRank(nickname);
    if (CONFIG.MUTE_IMMUNE_RANKS.includes(staffRank)) return { allowed: true };

    // 3. ИНИЦИАЛИЗАЦИЯ ДАННЫХ
    if (!playerStats.has(nickname)) {
        playerStats.set(nickname, { 
            warnings: 0, 
            lastViolationTime: Date.now(), 
            lastMsgs: [], 
            lastActionTime: 0 
        });
    }
    const data = playerStats.get(nickname);
    const now = Date.now();

    let reason = null;
    const text = message.toLowerCase().trim();

    // --- АНАЛИЗ НАРУШЕНИЙ ---

    // А) Спам командами или текстом (скорость)
    data.lastMsgs.push(now);
    data.lastMsgs = data.lastMsgs.filter(t => now - t < 5000);
    if (data.lastMsgs.length > 4) reason = "Спам/Флуд";

    // Б) Повторы (включая неизвестные команды типа /fd)
    if (!reason && text.length > 3) {
        if (data.lastText === text) reason = "Повтор сообщения/команды";
    }
    data.lastText = text;

    // В) Капс
    if (!reason && message.length > 8) {
        const caps = message.replace(/[^A-ZА-Я]/g, "").length;
        if (caps / message.length > 0.7) reason = "Капс";
    }

    // --- ОБРАБОТКА НАРУШЕНИЯ ---
    if (reason) {
        const lastBotAction = botLastReply.get(nickname) || 0;
        if (now - lastBotAction < CONFIG.BOT_REPLY_COOLDOWN) return { allowed: false };

        data.warnings++;
        data.lastViolationTime = now;
        botLastReply.set(nickname, now);

        if (data.warnings === 1) {
            sendClan(generateUniqueText('warn1', nickname));
            return { allowed: false };
        } 
        else if (data.warnings === 2) {
            sendClan(generateUniqueText('warn2', nickname));
            return { allowed: false };
        } 
        else {
            // ВЫДАЧА МУТА
            const duration = CONFIG.BASE_MUTE_TIME;
            const expiresAt = new Date(now + duration * 60000).toISOString().replace('T', ' ').substring(0, 19);

            try {
                await db.getDb().run(
                    "INSERT INTO punishments (player, type, reason, duration_minutes, expires_at, active, issued_at) VALUES (?, 'mute', ?, ?, ?, 1, datetime('now'))",
                    [nickname, reason, duration, expiresAt]
                );
                
                bot.chat(`/c mute ${nickname} ${duration}m ${reason}`);
                sendClan(generateUniqueText('mute', nickname, { time: duration, reason: reason }));
                data.warnings = 0; // сброс после наказания
            } catch (err) {
                logger.error("Ошибка записи мута в БД:", err);
            }
            return { allowed: false };
        }
    }

    return { allowed: true };
}

module.exports = { startModerationScheduler, moderateMessage };