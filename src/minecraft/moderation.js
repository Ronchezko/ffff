const logger = require('../shared/logger');
const utils = require('../shared/utils');
const database = require('../database');

/**
 * КОНФИГУРАЦИЯ ЛОЯЛЬНОСТИ
 */
const CONFIG = {
    MUTE_IMMUNE_RANKS: ['Администратор', 'Куратор', 'Модератор'],
    WARNINGS_BEFORE_MUTE: 2, // Мут на 3-е нарушение (после 2 предупреждений)
    DECAY_TIME: 300000, // Каждые 5 минут "очки нарушения" снижаются (прощение за хорошее поведение)
    BASE_MUTE_TIME: 15, // Базовый мут в минутах
    MAX_MUTE_TIME: 1440, // Максимальный мут (24 часа)
    SIMILARITY_THRESHOLD: 0.8, // Насколько сообщения должны быть похожи (0.8 = 80%), чтобы считаться флудом
};

// Хранилище временных данных в памяти
const playerStats = new Map();

class AdvancedPlayerData {
    constructor(nickname) {
        this.nickname = nickname;
        this.messages = [];
        this.warnings = 0;
        this.violationScore = 0; // Накопительный балл нарушений
        this.lastViolationTime = 0;
        this.historyImpact = 0; // Влияние прошлых мутов на текущий срок
        this.isMuted = false;
        this.muteUntil = 0;
        this.lastActivity = Date.now();
    }

    // Добавляет сообщение и очищает старые
    addMessage(text) {
        const now = Date.now();
        this.messages.push({ text, timestamp: now });
        this.lastActivity = now;
        
        // Очистка старых сообщений (старше 60 сек), чтобы не забивать память
        this.messages = this.messages.filter(m => now - m.timestamp < 60000);
    }

    // Рассчитывает коэффициент повторений (интеллектуальный флуд)
    getFloodScore(newText) {
        if (this.messages.length === 0) return 0;
        let similarities = 0;
        
        this.messages.forEach(m => {
            const similarity = utils.calculateSimilarity(m.text, newText);
            if (similarity > CONFIG.SIMILARITY_THRESHOLD) similarities++;
        });
        
        return similarities;
    }

    // Лояльность: со временем баллы нарушений сгорают
    applyDecay() {
        const now = Date.now();
        const intervals = Math.floor((now - this.lastViolationTime) / CONFIG.DECAY_TIME);
        if (intervals > 0) {
            this.violationScore = Math.max(0, this.violationScore - intervals);
            if (this.violationScore === 0) this.warnings = 0;
        }
    }

    addWarning() {
        this.warnings++;
        this.lastViolationTime = Date.now();
        return this.warnings;
    }
}

/**
 * ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ АНАЛИЗА
 */
const Analysis = {
    // Проверка на капс (если более 70% букв в верхнем регистре и сообщение длиннее 5 символов)
    isCaps(text) {
        if (text.length < 6) return false;
        const letters = text.replace(/[^a-zA-Zа-яА-Я]/g, '');
        if (letters.length === 0) return false;
        const caps = letters.replace(/[^A-ZА-Я]/g, '').length;
        return (caps / letters.length) > 0.7;
    },

    // Оценка тяжести нарушения
    getViolationWeight(type) {
        const weights = {
            'spam': 1.5,
            'flood': 1.0,
            'caps': 0.5,
            'invalid_cmd': 0.3,
            'repeat_cmd': 0.8
        };
        return weights[type] || 1.0;
    }
};

/**
 * ГЛАВНЫЙ КЛАСС МОДЕРАЦИИ
 */
class ModerationSystem {
    constructor(bot, db) {
        this.bot = bot;
        this.db = db;
    }

    async getPlayer(nickname) {
        if (!playerStats.has(nickname)) {
            const data = new AdvancedPlayerData(nickname);
            // Загружаем историю из БД для расчета тяжести
            const historyCount = await this.getMuteHistoryCount(nickname);
            data.historyImpact = historyCount; 
            playerStats.set(nickname, data);
        }
        const data = playerStats.get(nickname);
        data.applyDecay();
        return data;
    }

    async getMuteHistoryCount(nickname) {
        try {
            const row = await this.db.getDb().get(
                'SELECT COUNT(*) as count FROM punishments WHERE player = ? AND type = "mute"', 
                [nickname]
            );
            return row ? row.count : 0;
        } catch (e) { return 0; }
    }

    // Расчет времени мута на основе истории
    calculateMuteDuration(data) {
        // База + (количество прошлых мутов * 10 минут)
        let duration = CONFIG.BASE_MUTE_TIME + (data.historyImpact * 10);
        return Math.min(duration, CONFIG.MAX_MUTE_TIME);
    }

    async handleViolation(nickname, type, sendClan) {
        const data = await this.getPlayer(nickname);
        const weight = Analysis.getViolationWeight(type);
        data.violationScore += weight;
        
        const currentWarns = data.addWarning();
        
        // ЛОГИКА 2-Х ПРЕДУПРЕЖДЕНИЙ
        if (currentWarns === 1) {
            sendClan(`🌱 @${nickname}, пожалуйста, соблюдайте правила чата (предупреждение 1/2).`);
            return { action: 'warned' };
        } 
        else if (currentWarns === 2) {
            sendClan(`⚠️ @${nickname}, последнее предупреждение! Далее последует ограничение чата (2/2).`);
            return { action: 'last_warn' };
        } 
        else {
            const duration = this.calculateMuteDuration(data);
            await this.applyMute(nickname, type, duration, sendClan);
            return { action: 'muted' };
        }
    }

    async applyMute(nickname, reason, duration, sendClan) {
        const data = await this.getPlayer(nickname);
        const expiresAt = new Date(Date.now() + duration * 60000).toISOString();
        
        try {
            // Сохранение в БД
            await this.db.getDb().run(`
                INSERT INTO punishments (player, type, reason, duration_minutes, expires_at, active, issued_at)
                VALUES (?, 'mute', ?, ?, ?, 1, datetime('now'))
            `, [nickname, `Авто-модерация: ${reason}`, duration, expiresAt]);

            data.isMuted = true;
            data.muteUntil = Date.now() + (duration * 60000);
            data.warnings = 0; // Сброс после наказания

            this.bot.chat(`/c mute ${nickname} ${duration}m ${reason}`);
            sendClan(`🔇 Игрок ${nickname} ограничен в чате на ${duration} мин. Причина: ${reason}.`);
            
            logger.info(`[MOD] ${nickname} замучен на ${duration}м за ${reason}`);
        } catch (e) {
            logger.error('Ошибка при выдаче мута:', e);
        }
    }

    /**
     * ПРОВЕРКА СООБЩЕНИЯ (Клановый чат и личка)
     */
    async processMessage(nickname, message, isClanChat, callbacks) {
        const { sendClan, sendPrivate, log } = callbacks;

        // 1. Иммунитет
        const staffRank = await this.db.getStaffRank(nickname);
        if (CONFIG.MUTE_IMMUNE_RANKS.includes(staffRank)) return { allowed: true };

        const data = await this.getPlayer(nickname);

        // 2. Проверка текущего мута
        if (data.isMuted) {
            if (Date.now() < data.muteUntil) {
                const remains = Math.ceil((data.muteUntil - Date.now()) / 60000);
                if (isClanChat) sendPrivate(nickname, `Вы в муте еще ${remains} мин.`);
                return { allowed: false };
            } else {
                data.isMuted = false;
            }
        }

        const text = message.trim();
        const isCommand = text.startsWith('/');

        // 3. АНАЛИЗАТОР НАРУШЕНИЙ
        
        // Проверка на флуд сообщениями
        if (!isCommand) {
            const floodCount = data.getFloodScore(text);
            if (floodCount >= 2) {
                return await this.handleViolation(nickname, 'flood', sendClan);
            }

            if (Analysis.isCaps(text)) {
                return await this.handleViolation(nickname, 'caps', sendClan);
            }
            
            // Слишком быстрые сообщения (спам)
            const recentMsgs = data.messages.filter(m => Date.now() - m.timestamp < 5000).length;
            if (recentMsgs > 3) {
                return await this.handleViolation(nickname, 'spam', sendClan);
            }
        }

        // Проверка на спам командами
        if (isCommand) {
            const recentCmds = data.messages.filter(m => m.text.startsWith('/') && Date.now() - m.timestamp < 10000).length;
            if (recentCmds > 4) {
                return await this.handleViolation(nickname, 'repeat_cmd', sendClan);
            }
        }

        // Сохраняем сообщение для истории анализа
        data.addMessage(text);
        return { allowed: true };
    }
}

module.exports = { ModerationSystem };