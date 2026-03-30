// src/minecraft/offices.js
const database = require('../database');
const logger = require('../shared/logger');
const utils = require('../shared/utils');

// Цвета Minecraft для красивого оформления
const colors = {
    black: '&0', dark_blue: '&1', dark_green: '&2', dark_aqua: '&3',
    dark_red: '&4', dark_purple: '&5', gold: '&6', gray: '&7',
    dark_gray: '&8', blue: '&9', green: '&a', aqua: '&b',
    red: '&c', light_purple: '&d', yellow: '&e', white: '&f',
    bold: '&l', reset: '&r'
};

// Функция для красивого форматирования сообщений
function formatMessage(prefix, message, color = colors.white) {
    return `${colors.gold}[${color}${prefix}${colors.gold}]${colors.reset} ${color}${message}${colors.reset}`;
}

// Функция для создания рамки
function createFrame(title, lines) {
    let frame = `${colors.gold}╔══════════════════════════════════╗${colors.reset}\n`;
    frame += `${colors.gold}║ ${colors.light_purple}${colors.bold}${title}${colors.reset}`;
    frame += ' '.repeat(32 - title.length - 2) + `${colors.gold}║${colors.reset}\n`;
    frame += `${colors.gold}╠══════════════════════════════════╣${colors.reset}\n`;
    for (const line of lines) {
        frame += `${colors.gold}║ ${line}`;
        const cleanLine = line.replace(/&[0-9a-fklmnor]/g, '');
        frame += ' '.repeat(32 - cleanLine.length - 2) + `${colors.gold}║${colors.reset}\n`;
    }
    frame += `${colors.gold}╚══════════════════════════════════╝${colors.reset}`;
    return frame;
}

// Типы офисов
const OFFICE_TYPES = {
    crypto: { 
        name: '🏭 Крипто-майнинг', 
        baseIncome: 10000, 
        levelMultiplier: 0.15,
        color: colors.green,
        emoji: '🏭'
    },
    it: { 
        name: '💻 IT-разработка', 
        baseIncome: 8000, 
        levelMultiplier: 0.12,
        color: colors.aqua,
        emoji: '💻'
    },
    marketing: { 
        name: '📢 Маркетинговое агентство', 
        baseIncome: 7000, 
        levelMultiplier: 0.1,
        color: colors.yellow,
        emoji: '📢'
    },
    consulting: { 
        name: '📊 Консалтинг', 
        baseIncome: 9000, 
        levelMultiplier: 0.13,
        color: colors.light_purple,
        emoji: '📊'
    }
};

const START_LEVEL = 4;
const MAX_LEVEL = 10;
const MIN_LEVEL = 1;
const QUESTIONS_NEEDED_FOR_UPGRADE = 5;
const QUESTIONS_NEEDED_FOR_DOWNGRADE = 3;

// Кэш для вопросов
let questionCache = new Map();

/**
 * Инициализация вопросов в БД (если таблица пуста)
 */
function initQuestions() {
    try {
        const db = database.getDb();
        const count = db.prepare('SELECT COUNT(*) as cnt FROM office_questions').get().cnt;
        if (count > 0) {
            logger.info(`📚 В базе уже есть ${count} вопросов для офисов`);
            return;
        }
        
        const questions = [
            // Крипто
            ['crypto', 'Что такое блокчейн?', 'Распределённый реестр', 'Централизованная база', 'Криптовалюта'],
            ['crypto', 'Какой алгоритм использует Bitcoin?', 'SHA-256', 'Scrypt', 'Ethash'],
            ['crypto', 'Что такое халвинг?', 'Уменьшение награды за блок', 'Увеличение сложности', 'Разделение монеты'],
            ['crypto', 'Что такое смарт-контракт?', 'Программа на блокчейне', 'Юридический договор', 'Криптокошелёк'],
            ['crypto', 'Что такое майнинг-пул?', 'Объединение мощностей', 'Одиночная добыча', 'Биржа криптовалют'],
            ['crypto', 'Что означает ASIC?', 'Специализированное устройство', 'Программный код', 'Алгоритм шифрования'],
            
            // IT
            ['it', 'Что такое API?', 'Интерфейс взаимодействия программ', 'Язык программирования', 'База данных'],
            ['it', 'Что означает HTTP?', 'HyperText Transfer Protocol', 'High Tech Protocol', 'Hyper Transfer Tool'],
            ['it', 'Что такое фронтенд?', 'Клиентская часть', 'Серверная часть', 'База данных'],
            ['it', 'Что такое бэкенд?', 'Серверная часть', 'Клиентская часть', 'База данных'],
            ['it', 'Что такое SQL?', 'Язык запросов к БД', 'Стиль кода', 'Сетевой протокол'],
            ['it', 'Что такое Git?', 'Система контроля версий', 'Язык программирования', 'База данных'],
            
            // Маркетинг
            ['marketing', 'Что такое SEO?', 'Оптимизация для поисковиков', 'Социальные сети', 'Email рассылка'],
            ['marketing', 'Что означает CTR?', 'Click-Through Rate', 'Cost per Click', 'Conversion Rate'],
            ['marketing', 'Что такое конверсия?', 'Процент целевых действий', 'Количество посетителей', 'Стоимость рекламы'],
            ['marketing', 'Что такое SMM?', 'Маркетинг в соцсетях', 'Поисковая оптимизация', 'Email маркетинг'],
            ['marketing', 'Что такое таргетинг?', 'Настройка показа рекламы', 'Анализ конкурентов', 'Создание контента'],
            
            // Консалтинг
            ['consulting', 'Что такое SWOT-анализ?', 'Анализ сильных и слабых сторон', 'Финансовый отчёт', 'Маркетинговый план'],
            ['consulting', 'Что означает KPI?', 'Ключевые показатели эффективности', 'Краткосрочный план', 'Контроль качества'],
            ['consulting', 'Что такое бизнес-процесс?', 'Совокупность действий для результата', 'Финансовый отчёт', 'Маркетинговая стратегия'],
            ['consulting', 'Что такое Lean-методология?', 'Бережливое производство', 'Агрессивный маркетинг', 'Жёсткое управление'],
            ['consulting', 'Что такое Agile?', 'Гибкая методология разработки', 'Жёсткое планирование', 'Водопадная модель']
        ];

        const stmt = db.prepare('INSERT INTO office_questions (office_type, question, correct_answer, wrong_answer1, wrong_answer2) VALUES (?, ?, ?, ?, ?)');
        for (const q of questions) {
            stmt.run(q[0], q[1], q[2], q[3], q[4]);
        }
        
        logger.info(`📚 Загружено ${questions.length} вопросов для офисов`);
        
    } catch (error) {
        logger.error('Ошибка инициализации вопросов для офисов:', error);
    }
}

/**
 * Получить случайный вопрос для офиса
 */
function getRandomQuestionForOffice(playerId, propertyId, officeType) {
    try {
        const db = database.getDb();
        
        const answered = db.prepare(`
            SELECT question_id FROM office_answers WHERE player_id = ? AND property_id = ?
        `).all(playerId, propertyId).map(r => r.question_id);
        
        let query = 'SELECT * FROM office_questions WHERE office_type = ?';
        const params = [officeType];
        
        if (answered.length > 0) {
            query += ' AND id NOT IN (' + answered.map(() => '?').join(',') + ')';
            params.push(...answered);
        }
        
        const questions = db.prepare(query).all(...params);
        if (questions.length === 0) return null;
        
        const question = questions[Math.floor(Math.random() * questions.length)];
        
        return {
            id: question.id,
            question: question.question,
            correct_answer: question.correct_answer,
            wrong_answer1: question.wrong_answer1,
            wrong_answer2: question.wrong_answer2,
            options: [question.correct_answer, question.wrong_answer1, question.wrong_answer2]
        };
        
    } catch (error) {
        logger.error('Ошибка получения вопроса:', error);
        return null;
    }
}

/**
 * Расчет дневного дохода офиса
 */
function calculateDailyIncome(officeType, level) {
    const typeData = OFFICE_TYPES[officeType];
    if (!typeData) return 0;
    const multiplier = 1 + typeData.levelMultiplier * (level - 1);
    return Math.floor(typeData.baseIncome * multiplier);
}

/**
 * Получение информации об уровне офиса
 */
function getOfficeLevelInfo(propertyId) {
    try {
        const prop = database.getProperty(propertyId);
        if (!prop || prop.type !== 'office') return null;
        
        const level = prop.level || START_LEVEL;
        const correctAnswers = prop.correct_answers || 0;
        const wrongAnswers = prop.wrong_answers || 0;
        const totalAnswers = prop.total_answers || 0;
        
        let officeType = 'crypto';
        try {
            const profitData = JSON.parse(prop.profit_data || '{}');
            officeType = profitData.office_type || 'crypto';
        } catch (e) {}
        
        const income = calculateDailyIncome(officeType, level);
        const nextIncome = level < MAX_LEVEL ? calculateDailyIncome(officeType, level + 1) : null;
        
        return {
            level,
            correctAnswers,
            wrongAnswers,
            totalAnswers,
            officeType,
            income,
            nextIncome,
            neededCorrectForUpgrade: Math.max(0, QUESTIONS_NEEDED_FOR_UPGRADE - correctAnswers),
            neededWrongForDowngrade: Math.max(0, QUESTIONS_NEEDED_FOR_DOWNGRADE - wrongAnswers),
            isMaxLevel: level >= MAX_LEVEL,
            isMinLevel: level <= MIN_LEVEL
        };
    } catch (error) {
        logger.error('Ошибка получения информации об офисе:', error);
        return null;
    }
}

/**
 * Обновление уровня офиса после ответа
 */
async function updateOfficeLevel(propertyId, isCorrect) {
    try {
        const db = database.getDb();
        const property = database.getProperty(propertyId);
        if (!property) return null;
        
        let level = property.level || START_LEVEL;
        let correctAnswers = property.correct_answers || 0;
        let wrongAnswers = property.wrong_answers || 0;
        let totalAnswers = property.total_answers || 0;
        
        totalAnswers++;
        if (isCorrect) {
            correctAnswers++;
        } else {
            wrongAnswers++;
        }
        
        // Проверка на повышение/понижение уровня
        let levelChanged = false;
        
        if (correctAnswers >= QUESTIONS_NEEDED_FOR_UPGRADE && level < MAX_LEVEL) {
            level++;
            correctAnswers = 0;
            wrongAnswers = 0;
            levelChanged = true;
        } else if (wrongAnswers >= QUESTIONS_NEEDED_FOR_DOWNGRADE && level > MIN_LEVEL) {
            level--;
            correctAnswers = 0;
            wrongAnswers = 0;
            levelChanged = true;
        }
        
        // Обновляем БД
        db.prepare(`
            UPDATE properties 
            SET level = ?, correct_answers = ?, wrong_answers = ?, total_answers = ?
            WHERE id = ?
        `).run(level, correctAnswers, wrongAnswers, totalAnswers, propertyId);
        
        return {
            level,
            correctAnswers,
            wrongAnswers,
            totalAnswers,
            levelChanged,
            nextUpgrade: QUESTIONS_NEEDED_FOR_UPGRADE - correctAnswers,
            nextDowngrade: QUESTIONS_NEEDED_FOR_DOWNGRADE - wrongAnswers,
            isMaxLevel: level >= MAX_LEVEL,
            isMinLevel: level <= MIN_LEVEL
        };
        
    } catch (error) {
        logger.error('Ошибка обновления уровня офиса:', error);
        return null;
    }
}

/**
 * Отправка вопроса игроку (вызывается по расписанию)
 */
async function sendQuestionToPlayer(bot, playerId, propertyId, sendPrivate) {
    try {
        const db = database.getDb();
        const player = db.prepare('SELECT minecraft_nick FROM clan_members WHERE id = ?').get(playerId);
        const prop = database.getProperty(propertyId);
        
        if (!player || !prop || prop.type !== 'office') return;
        
        let officeType = 'crypto';
        try {
            const profitData = JSON.parse(prop.profit_data || '{}');
            officeType = profitData.office_type;
        } catch (e) {
            return;
        }
        
        const questionData = getRandomQuestionForOffice(playerId, propertyId, officeType);
        if (!questionData) return;
        
        const typeData = OFFICE_TYPES[officeType];
        const level = prop.level || START_LEVEL;
        const currentIncome = calculateDailyIncome(officeType, level);
        const nextIncome = level < MAX_LEVEL ? calculateDailyIncome(officeType, level + 1) : null;
        
        const lines = [
            `${colors.white}Вопрос для прокачки вашего офиса!`,
            `${colors.gold}────────────────────`,
            `${colors.white}Офис #${propertyId}: ${typeData.color}${typeData.name}`,
            `${colors.white}Текущий уровень: ${colors.green}${level}/${MAX_LEVEL}`,
            `${colors.white}Доход в день: ${colors.green}${currentIncome.toLocaleString('ru-RU')} ₽`,
            nextIncome ? `${colors.white}Доход на след. уровне: ${colors.yellow}${nextIncome.toLocaleString('ru-RU')} ₽` : '',
            `${colors.gold}────────────────────`,
            `${colors.white}${colors.bold}${questionData.question}`,
            `${colors.gold}────────────────────`,
            `${colors.white}Варианты ответа:`,
            `${colors.green}1. ${questionData.correct_answer}`,
            `${colors.yellow}2. ${questionData.wrong_answer1}`,
            `${colors.red}3. ${questionData.wrong_answer2}`,
            `${colors.gold}────────────────────`,
            `${colors.white}Введите номер ответа: &e/office answer ${propertyId} [номер]`,
            `${colors.red}⚠️ Время на ответ: 24 часа!`
        ];
        
        const frame = createFrame(`❓ ВОПРОС ОФИСА #${propertyId}`, lines.filter(l => l !== ''));
        
        if (sendPrivate) {
            sendPrivate(player.minecraft_nick, frame);
        } else if (bot && bot.chat) {
            bot.chat(`/msg ${player.minecraft_nick} ${frame}`);
        }
        
        // Сохраняем вопрос в кэш
        const cacheKey = `${player.minecraft_nick}_${propertyId}`;
        if (!global.pendingOfficeQuestions) global.pendingOfficeQuestions = new Map();
        global.pendingOfficeQuestions.set(cacheKey, {
            propertyId,
            questionId: questionData.id,
            correctAnswer: questionData.correct_answer,
            expires: Date.now() + 24 * 60 * 60 * 1000 // 24 часа
        });
        
        // Обновляем время отправки вопроса
        db.prepare(`
            UPDATE properties SET last_question_sent = datetime('now') WHERE id = ?
        `).run(propertyId);
        
        logger.info(`📚 Отправлен вопрос для офиса #${propertyId} (${player.minecraft_nick})`);
        
    } catch (error) {
        logger.error('Ошибка отправки вопроса:', error);
    }
}

/**
 * Обработка ответа на вопрос офиса
 */
async function handleOfficeAnswer(bot, playerNickname, propertyId, answer, sendPrivate) {
    try {
        const player = await database.getPlayerByNickname(playerNickname);
        if (!player) {
            if (sendPrivate) sendPrivate(playerNickname, formatMessage('❌', 'Игрок не найден.', colors.red));
            return { success: false, message: 'Игрок не найден.' };
        }
        
        const cacheKey = `${playerNickname}_${propertyId}`;
        const pending = global.pendingOfficeQuestions?.get(cacheKey);
        
        if (!pending) {
            if (sendPrivate) {
                sendPrivate(playerNickname, formatMessage('❌', 'Нет активного вопроса для этого офиса. Следующий вопрос придёт через 2 дня.', colors.red));
            }
            return { success: false, message: 'Нет активного вопроса' };
        }
        
        if (Date.now() > pending.expires) {
            global.pendingOfficeQuestions.delete(cacheKey);
            if (sendPrivate) {
                sendPrivate(playerNickname, formatMessage('⏰', 'Время на ответ истекло. Следующий вопрос придёт через 2 дня.', colors.yellow));
            }
            return { success: false, message: 'Время истекло' };
        }
        
        // Проверяем ответ
        let isCorrect = false;
        let selectedOption = null;
        
        const answerNum = parseInt(answer);
        if (!isNaN(answerNum) && answerNum >= 1 && answerNum <= 3) {
            selectedOption = answerNum;
            if (answerNum === 1) {
                isCorrect = true;
            } else if (answerNum === 2) {
                isCorrect = false;
            } else if (answerNum === 3) {
                isCorrect = false;
            }
        } else {
            isCorrect = answer.toLowerCase().trim() === pending.correctAnswer.toLowerCase().trim();
        }
        
        // Обновляем уровень офиса
        const result = await updateOfficeLevel(propertyId, isCorrect);
        if (!result) {
            if (sendPrivate) sendPrivate(playerNickname, formatMessage('❌', 'Ошибка обновления уровня офиса.', colors.red));
            return { success: false, message: 'Ошибка обновления' };
        }
        
        const property = await database.getProperty(propertyId);
        let officeType = 'crypto';
        try {
            const profitData = JSON.parse(property?.profit_data || '{}');
            officeType = profitData.office_type || 'crypto';
        } catch (e) {}
        
        const typeData = OFFICE_TYPES[officeType];
        const income = calculateDailyIncome(officeType, result.level);
        
        if (isCorrect) {
            const lines = [
                `${colors.white}✅ ${colors.green}Правильный ответ!`,
                `${colors.gold}────────────────────`,
                `${colors.white}Офис #${propertyId}: ${typeData.color}${typeData.name}`,
                result.levelChanged ? `${colors.white}Уровень повышен: ${colors.green}${result.level}/${MAX_LEVEL}` : `${colors.white}Уровень: ${colors.green}${result.level}/${MAX_LEVEL}`,
                `${colors.white}Доход в день: ${colors.green}${income.toLocaleString('ru-RU')} ₽`,
                `${colors.gold}────────────────────`,
                `${colors.white}Правильных ответов до след. уровня: ${colors.green}${result.nextUpgrade}`,
                `${colors.white}Неправильных до понижения: ${colors.yellow}${result.nextDowngrade}`
            ];
            
            if (result.isMaxLevel) {
                lines.push(`${colors.gold}────────────────────`);
                lines.push(`${colors.gold}🎉 МАКСИМАЛЬНЫЙ УРОВЕНЬ ДОСТИГНУТ! 🎉`);
            }
            
            const frame = createFrame(`📈 ПОВЫШЕНИЕ УРОВНЯ`, lines);
            if (sendPrivate) sendPrivate(playerNickname, frame);
            
        } else {
            const lines = [
                `${colors.white}❌ ${colors.red}Неправильный ответ!`,
                `${colors.gold}────────────────────`,
                `${colors.white}Офис #${propertyId}: ${typeData.color}${typeData.name}`,
                result.levelChanged ? `${colors.white}Уровень понижен: ${colors.red}${result.level}/${MAX_LEVEL}` : `${colors.white}Уровень: ${colors.red}${result.level}/${MAX_LEVEL}`,
                `${colors.white}Доход в день: ${colors.red}${income.toLocaleString('ru-RU')} ₽`,
                `${colors.gold}────────────────────`,
                `${colors.white}Правильный ответ: ${colors.green}${pending.correctAnswer}`,
                `${colors.white}Правильных ответов до след. уровня: ${colors.green}${result.nextUpgrade}`,
                `${colors.white}Неправильных до понижения: ${colors.red}${result.nextDowngrade}`
            ];
            
            if (result.isMinLevel) {
                lines.push(`${colors.gold}────────────────────`);
                lines.push(`${colors.red}⚠️ МИНИМАЛЬНЫЙ УРОВЕНЬ! Будьте внимательнее!`);
            }
            
            const frame = createFrame(`📉 ПОНИЖЕНИЕ УРОВНЯ`, lines);
            if (sendPrivate) sendPrivate(playerNickname, frame);
        }
        
        // Удаляем вопрос из кэша
        global.pendingOfficeQuestions.delete(cacheKey);
        
        // Начисляем доход
        await database.updatePlayerMoney(playerNickname, income, `Доход от офиса #${propertyId} (уровень ${result.level})`, 'system');
        
        logger.info(`${playerNickname} ${isCorrect ? 'правильно' : 'неправильно'} ответил на вопрос офиса #${propertyId}`);
        
        return {
            success: true,
            correct: isCorrect,
            level: result.level,
            income: income,
            nextUpgrade: result.nextUpgrade,
            nextDowngrade: result.nextDowngrade
        };
        
    } catch (error) {
        logger.error('Ошибка обработки ответа:', error);
        if (sendPrivate) sendPrivate(playerNickname, formatMessage('❌', 'Ошибка обработки ответа.', colors.red));
        return { success: false, message: 'Ошибка обработки' };
    }
}

/**
 * Получение статистики офиса
 */
async function getOfficeStats(propertyId) {
    const info = getOfficeLevelInfo(propertyId);
    if (!info) return null;
    
    const property = await database.getProperty(propertyId);
    const typeData = OFFICE_TYPES[info.officeType];
    
    return {
        ...info,
        typeName: typeData?.name || 'Неизвестный',
        typeEmoji: typeData?.emoji || '🏢',
        typeColor: typeData?.color || colors.white,
        price: property?.price || 0,
        purchasedAt: property?.purchased_at,
        licenseExpires: property?.license_expires
    };
}

/**
 * Запуск периодической отправки вопросов
 */
function startOfficeScheduler(bot, sendPrivate) {
    // Проверка каждые 6 часов на наличие офисов, которым нужно отправить вопросы
    setInterval(async () => {
        try {
            const db = database.getDb();
            const offices = db.prepare(`
                SELECT p.id, p.owner, p.profit_data
                FROM properties p
                WHERE p.type = 'office' 
                AND p.owner IS NOT NULL
                AND (p.last_question_sent IS NULL OR p.last_question_sent < datetime('now', '-2 days'))
            `).all();
            
            for (const office of offices) {
                const player = await database.getPlayerByNickname(office.owner);
                if (player) {
                    await sendQuestionToPlayer(bot, player.id, office.id, sendPrivate);
                }
            }
        } catch (error) {
            logger.error('Ошибка в планировщике вопросов:', error);
        }
    }, 6 * 60 * 60 * 1000);
    
    logger.info('📅 Система периодических вопросов для офисов запущена');
}

module.exports = {
    OFFICE_TYPES,
    START_LEVEL,
    MAX_LEVEL,
    MIN_LEVEL,
    initQuestions,
    getRandomQuestionForOffice,
    handleOfficeAnswer,
    calculateDailyIncome,
    sendQuestionToPlayer,
    updateOfficeLevel,
    getOfficeLevelInfo,
    getOfficeStats,
    startOfficeScheduler
};