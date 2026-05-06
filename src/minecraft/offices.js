// src/minecraft/offices.js — Модуль управления офисами Resistance City v5.0.0
// Покупка, прокачка через вопросы, доход, уровни

'use strict';

const config = require('../config');
const db = require('../database');
const utils = require('../shared/utils');
const permissions = require('../shared/permissions');
const { logger } = require('../shared/logger');

// ==================== СОСТОЯНИЕ ====================
let botInstance = null;
var officeQuestions = {};
var questionsInitialized = false;

// ==================== УСТАНОВКА БОТА ====================
function setBot(bot) {
    botInstance = bot;
}

// ==================== ИНИЦИАЛИЗАЦИЯ ВОПРОСОВ ====================

function initQuestions() {
    if (questionsInitialized) return;

    var officeTypes = config.officeTypes || [];

    for (var i = 0; i < officeTypes.length; i++) {
        var officeType = officeTypes[i];
        officeQuestions[officeType.key] = officeType.questions || [];
    }

    questionsInitialized = true;
    logger.info('Вопросы для офисов загружены: ' + Object.keys(officeQuestions).length + ' типов');
}

// ==================== РЕГИСТРАЦИЯ ОФИСА ====================

function registerOffice(username, propertyId, officeType) {
    try {
        var property = db.properties.get(propertyId);
        if (!property || property.property_type !== 'office') {
            return { success: false, reason: 'not_an_office' };
        }

        if (property.owner_lower !== username.toLowerCase()) {
            return { success: false, reason: 'not_owner' };
        }

        // Проверка типа офиса
        var validTypes = config.officeTypes || [];
        var typeExists = false;
        for (var i = 0; i < validTypes.length; i++) {
            if (validTypes[i].key === officeType) {
                typeExists = true;
                break;
            }
        }

        if (!typeExists) {
            var availableTypes = validTypes.map(function(t) {
                return t.key + ' (' + t.name + ')';
            }).join(', ');
            return {
                success: false,
                reason: 'invalid_type',
                message: 'Неверный тип офиса. Доступные: ' + availableTypes,
            };
        }

        // Проверка лицензии
        var hasLicense = db.licenses.hasActive(username, 'office');
        if (!hasLicense) {
            return { success: false, reason: 'no_license' };
        }

        // Создание записи
        var existing = db.get('SELECT * FROM offices WHERE property_id = ?', [propertyId]);
        if (existing) {
            db.run('UPDATE offices SET office_type = ? WHERE property_id = ?', [officeType, propertyId]);
            logger.info('Тип офиса #' + propertyId + ' изменён на ' + officeType);
            return { success: true, updated: true };
        }

        var licenseExpires = null;
        var activeLicenses = db.licenses.getActive(username);
        for (var j = 0; j < activeLicenses.length; j++) {
            if (activeLicenses[j].license_type === 'office') {
                licenseExpires = activeLicenses[j].expires_at;
                break;
            }
        }

        db.run(
            'INSERT INTO offices (property_id, owner, owner_lower, office_type, level, license_expires) VALUES (?, ?, ?, ?, 4, ?)',
            [propertyId, username, username.toLowerCase(), officeType, licenseExpires]
        );

        logger.info('Офис #' + propertyId + ' зарегистрирован (' + officeType + ') на ' + username);

        return { success: true };
    } catch (error) {
        logger.error('Ошибка регистрации офиса: ' + error.message);
        return { success: false, reason: error.message };
    }
}

// ==================== ПОЛУЧЕНИЕ ИНФОРМАЦИИ ====================

function getOfficeInfo(propertyId) {
    try {
        var office = db.get('SELECT * FROM offices WHERE property_id = ?', [propertyId]);
        if (!office) return null;

        var property = db.properties.get(propertyId);
        var officeTypeConfig = null;

        var validTypes = config.officeTypes || [];
        for (var i = 0; i < validTypes.length; i++) {
            if (validTypes[i].key === office.office_type) {
                officeTypeConfig = validTypes[i];
                break;
            }
        }

        return {
            propertyId: propertyId,
            owner: office.owner,
            officeType: office.office_type,
            officeTypeName: officeTypeConfig ? officeTypeConfig.name : office.office_type,
            officeTypeDescription: officeTypeConfig ? officeTypeConfig.description : '',
            level: office.level || 4,
            questionsAnswered: office.questions_answered || 0,
            correctAnswers: office.correct_answers || 0,
            earningsTotal: office.earnings_total || 0,
            licenseExpires: office.license_expires,
            property: property,
        };
    } catch (error) {
        logger.error('Ошибка получения информации об офисе: ' + error.message);
        return null;
    }
}

// ==================== ВОПРОСЫ И ПРОКАЧКА ====================

function getDailyQuestion(officeType) {
    initQuestions();

    var questions = officeQuestions[officeType];
    if (!questions || questions.length === 0) {
        return null;
    }

    // Выбор случайного вопроса с учётом сложности
    var totalWeight = 0;
    for (var i = 0; i < questions.length; i++) {
        totalWeight += questions[i].difficulty || 3;
    }

    var random = Math.floor(Math.random() * totalWeight);
    var cumulative = 0;

    for (var j = 0; j < questions.length; j++) {
        cumulative += questions[j].difficulty || 3;
        if (random < cumulative) {
            return questions[j];
        }
    }

    return questions[0];
}

function answerQuestion(username, propertyId, answer) {
    try {
        var office = db.get('SELECT * FROM offices WHERE property_id = ?', [propertyId]);
        if (!office) {
            return { success: false, reason: 'office_not_found' };
        }

        if (office.owner_lower !== username.toLowerCase()) {
            return { success: false, reason: 'not_owner' };
        }

        if (office.level >= 10) {
            return {
                success: true,
                message: 'Максимальный уровень (10) уже достигнут!',
                level: 10,
                correct: false,
            };
        }

        // Проверка кулдауна (раз в день)
        var lastQuestionTime = office.last_question_at ? new Date(office.last_question_at) : null;
        if (lastQuestionTime) {
            var hoursSinceLastQuestion = (Date.now() - lastQuestionTime.getTime()) / 3600000;
            if (hoursSinceLastQuestion < 20) {
                var remainingHours = Math.ceil(20 - hoursSinceLastQuestion);
                return {
                    success: false,
                    reason: 'cooldown',
                    message: 'Следующий вопрос будет доступен через ' + remainingHours + ' ч',
                    remainingHours: remainingHours,
                };
            }
        }

        // Поиск правильного ответа
        var questions = officeQuestions[office.office_type] || [];
        var correctAnswer = null;
        var questionText = '';

        for (var i = 0; i < questions.length; i++) {
            if (questions[i].answer && answer) {
                var userAnswer = answer.trim().toLowerCase();
                var expectedAnswer = questions[i].answer.trim().toLowerCase();

                // Нечёткое сравнение
                if (userAnswer === expectedAnswer ||
                    userAnswer.includes(expectedAnswer) ||
                    expectedAnswer.includes(userAnswer)) {
                    correctAnswer = questions[i];
                    questionText = questions[i].question;
                    break;
                }
            }
        }

        var isCorrect = !!correctAnswer;

        // Обновление статистики
        db.run(
            'UPDATE offices SET questions_answered = questions_answered + 1, correct_answers = correct_answers + ?, last_question_at = CURRENT_TIMESTAMP WHERE property_id = ?',
            [isCorrect ? 1 : 0, propertyId]
        );

        // Проверка повышения уровня
        var newLevel = office.level;
        var leveledUp = false;

        if (isCorrect) {
            var updatedOffice = db.get('SELECT * FROM offices WHERE property_id = ?', [propertyId]);
            var questionsNeeded = (office.level + 1) * 3;
            var correctNeeded = Math.ceil(questionsNeeded * 0.6);

            if (updatedOffice.correct_answers >= correctNeeded && updatedOffice.questions_answered >= questionsNeeded) {
                newLevel = office.level + 1;
                db.run('UPDATE offices SET level = ? WHERE property_id = ?', [newLevel, propertyId]);
                leveledUp = true;

                logger.info('Офис #' + propertyId + ' повышен до уровня ' + newLevel + ' (' + username + ')');
            }
        } else {
            // Шанс понижения при неверном ответе
            if (office.level > 1 && office.level > 4) {
                var downgradeChance = 0.15;
                if (Math.random() < downgradeChance) {
                    newLevel = office.level - 1;
                    db.run('UPDATE offices SET level = ? WHERE property_id = ?', [newLevel, propertyId]);
                    logger.info('Офис #' + propertyId + ' понижен до уровня ' + newLevel);
                }
            }
        }

        return {
            success: true,
            correct: isCorrect,
            question: questionText,
            answer: correctAnswer ? correctAnswer.answer : '',
            level: newLevel,
            leveledUp: leveledUp,
            message: isCorrect
                ? (leveledUp
                    ? '✅ Правильно! Уровень повышен до ' + newLevel + '! 🎉'
                    : '✅ Правильно! Продолжайте отвечать для повышения уровня.')
                : '❌ Неверно. Попробуйте завтра снова.',
        };
    } catch (error) {
        logger.error('Ошибка ответа на вопрос офиса: ' + error.message);
        return { success: false, reason: error.message };
    }
}

// ==================== ДОХОД ОФИСА ====================

function getOfficeFinance(username, propertyId, period) {
    try {
        var property = db.properties.get(propertyId);
        if (!property || property.property_type !== 'office') {
            return { success: false, reason: 'not_found' };
        }

        if (property.owner_lower !== username.toLowerCase()) {
            return { success: false, reason: 'not_owner' };
        }

        var office = db.get('SELECT * FROM offices WHERE property_id = ?', [propertyId]);
        if (!office) {
            return {
                success: true,
                message: utils.formatInfo(username, 'Офис #' + propertyId + ': пока нет данных.'),
            };
        }

        // Расчёт дохода на основе уровня и типа
        var officeTypeConfig = null;
        var validTypes = config.officeTypes || [];
        for (var i = 0; i < validTypes.length; i++) {
            if (validTypes[i].key === office.office_type) {
                officeTypeConfig = validTypes[i];
                break;
            }
        }

        var baseEarnings = officeTypeConfig ? (officeTypeConfig.baseEarnings || 5000) : 5000;
        var levelMultiplier = 1 + (office.level - 1) * 0.25;

        var earnings = 0;
        var periodName = '';

        switch (period) {
            case '1h':
                earnings = Math.floor(baseEarnings * levelMultiplier);
                periodName = 'за час';
                break;
            case '1d':
                earnings = Math.floor(baseEarnings * levelMultiplier * 24);
                periodName = 'за день';
                break;
            case '1w':
                earnings = Math.floor(baseEarnings * levelMultiplier * 24 * 7);
                periodName = 'за неделю';
                break;
            case 'all':
                earnings = office.earnings_total || 0;
                periodName = 'за всё время';
                break;
            default:
                return { success: false, reason: 'invalid_period' };
        }

        return {
            success: true,
            message: utils.formatInfo(username,
                '📊 Офис #' + propertyId + ' (' + (officeTypeConfig ? officeTypeConfig.name : office.office_type) + ')\n' +
                'Уровень: ' + office.level + '/10\n' +
                'Доход ' + periodName + ': &a' + utils.formatMoney(earnings)
            ),
            earnings: earnings,
            period: period,
            level: office.level,
        };
    } catch (error) {
        logger.error('Ошибка получения финансов офиса: ' + error.message);
        return { success: false, reason: error.message };
    }
}

// ==================== НАЧИСЛЕНИЕ ДОХОДА ====================

function processOfficeEarnings() {
    try {
        var offices = db.all('SELECT * FROM offices');
        var updatedCount = 0;

        for (var i = 0; i < offices.length; i++) {
            var office = offices[i];

            // Проверка лицензии
            var hasLicense = db.licenses.hasActive(office.owner, 'office');
            if (!hasLicense) continue;

            // Расчёт дохода
            var officeTypeConfig = null;
            var validTypes = config.officeTypes || [];
            for (var j = 0; j < validTypes.length; j++) {
                if (validTypes[j].key === office.office_type) {
                    officeTypeConfig = validTypes[j];
                    break;
                }
            }

            var baseEarnings = officeTypeConfig ? (officeTypeConfig.baseEarnings || 5000) : 5000;
            var levelMultiplier = 1 + (office.level - 1) * 0.25;
            var hourlyIncome = Math.floor(baseEarnings * levelMultiplier);

            db.run(
                'UPDATE offices SET earnings_total = earnings_total + ?, last_earning_update = CURRENT_TIMESTAMP WHERE id = ?',
                [hourlyIncome, office.id]
            );

            updatedCount++;
        }

        if (updatedCount > 0) {
            logger.debug('Начислен доход ' + updatedCount + ' офисам');
        }
    } catch (error) {
        logger.error('Ошибка начисления дохода офисам: ' + error.message);
    }
}

// ==================== ПЕРИОДИЧЕСКИЕ ЗАДАЧИ ====================

function startPeriodicTasks() {
    initQuestions();

    // Начисление дохода каждый час
    setInterval(function() {
        processOfficeEarnings();
    }, 3600000);

    logger.info('Периодические задачи офисов запущены');
}

// ==================== ЭКСПОРТ ====================
module.exports = {
    setBot,
    registerOffice,
    getOfficeInfo,
    getDailyQuestion,
    answerQuestion,
    getOfficeFinance,
    processOfficeEarnings,
    startPeriodicTasks,
    initQuestions,
    officeQuestions,
};