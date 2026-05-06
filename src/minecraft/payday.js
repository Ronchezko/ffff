// src/minecraft/payday.js — Система PayDay Resistance City v5.0.0
// Начисление зарплаты каждый час сотрудникам организаций
// Учёт дежурств, рабочего времени, больничных, тюрьмы, отпусков, налогов

'use strict';

const config = require('../config');
const db = require('../database');
const utils = require('../shared/utils');
const permissions = require('../shared/permissions');
const { logger } = require('../shared/logger');

// ==================== СОСТОЯНИЕ ====================
let botInstance = null;
let isProcessing = false;
let lastPaydayTime = null;
let totalPaydayCount = 0;
let paydayHistory = [];

// ==================== УСТАНОВКА БОТА ====================
function setBot(bot) {
    botInstance = bot;
}

// ==================== ОСНОВНАЯ ФУНКЦИЯ ====================

/**
 * Обработать PayDay для всех сотрудников на дежурстве
 * @param {object} bot - Экземпляр Mineflayer бота
 * @param {boolean} isManual - Ручной запуск администратором
 * @param {boolean} silent - Тихое выполнение (без сообщений в чат)
 */
function processPayday(bot, isManual, silent) {
    if (!bot && botInstance) bot = botInstance;
    if (!bot || !bot.connected) {
        logger.warn('PayDay: бот не подключён, пропускаем');
        return { success: false, reason: 'bot_not_connected' };
    }

    if (isProcessing) {
        logger.warn('PayDay уже обрабатывается, пропускаем');
        return { success: false, reason: 'already_processing' };
    }

    // Проверки только для автоматического PayDay
    if (!isManual) {
        var paydayEnabled = db.settings.getBoolean('payday_enabled');
        if (!paydayEnabled) {
            logger.debug('PayDay отключён в настройках');
            return { success: false, reason: 'disabled' };
        }

        var globalFreeze = db.settings.getBoolean('global_freeze');
        if (globalFreeze) {
            logger.debug('PayDay пропущен: глобальная заморозка');
            return { success: false, reason: 'global_freeze' };
        }

        if (!utils.isWorkTime() && !utils.isBreakTime()) {
            logger.debug('PayDay пропущен: нерабочее время');
            return { success: false, reason: 'not_work_time' };
        }
    }

    isProcessing = true;
    var startTime = Date.now();
    var paydayTimestamp = new Date().toISOString();
    var paydayNumber = totalPaydayCount + 1;

    logger.info('💰 PayDay #' + paydayNumber + ' начат (' + (isManual ? 'ручной' : 'авто') + ')');

    var result = {
        success: false,
        paydayNumber: paydayNumber,
        isManual: !!isManual,
        timestamp: paydayTimestamp,
        employeesPaid: 0,
        employeesSkipped: 0,
        totalPaid: 0,
        totalTax: 0,
        totalBonus: 0,
        paidList: [],
        skippedList: [],
        skippedReasons: {
            jailed: 0,
            sick: 0,
            frozen: 0,
            outOfCity: 0,
            onBreak: 0,
            vacation: 0,
            noEducation: 0,
            noMedBook: 0,
            notEnoughMinutes: 0,
            noSalaryConfig: 0,
            insufficientBudget: 0,
            notOnDuty: 0,
        },
    };

    try {
        // Получение всех на дежурстве
        var activeDuties = db.all(
            'SELECT ad.*, rp.organization, rp.rank, rp.balance, rp.is_in_jail, rp.is_sick, rp.is_frozen, rp.is_in_city, rp.points, rp.warns ' +
            'FROM active_duties ad ' +
            'JOIN rp_members rp ON ad.username_lower = rp.username_lower ' +
            'WHERE rp.is_active = 1'
        );

        if (activeDuties.length === 0) {
            logger.info('PayDay: нет сотрудников на дежурстве');

            if (!silent && bot && bot.connected) {
                setTimeout(function() {
                    bot.chat('/cc &6💰 PayDay #' + paydayNumber + ': нет сотрудников на дежурстве');
                }, 500);
            }

            result.success = true;
            return result;
        }

        logger.info('PayDay: обрабатывается ' + activeDuties.length + ' сотрудников');

        // Получение всех организаций для проверки бюджетов
        var allOrgs = {};
        var orgBudgets = db.orgBudgets.getAll();
        for (var i = 0; i < orgBudgets.length; i++) {
            allOrgs[orgBudgets[i].name] = {
                budget: orgBudgets[i].budget,
                materials: orgBudgets[i].materials,
                bonusPercent: orgBudgets[i].bonus_percent || 0,
                taxRate: orgBudgets[i].tax_rate || 0.01,
                isFrozen: orgBudgets[i].is_frozen || false,
                key: orgBudgets[i].key_name,
            };
        }

        // Обработка каждого сотрудника
        for (var j = 0; j < activeDuties.length; j++) {
            var duty = activeDuties[j];
            var username = duty.username;
            var paydayEmployeeResult = processEmployeePayday(
                bot, username, duty, allOrgs, paydayNumber, isManual, paydayTimestamp
            );

            if (paydayEmployeeResult.paid) {
                result.employeesPaid++;
                result.totalPaid += paydayEmployeeResult.finalSalary;
                result.totalTax += paydayEmployeeResult.taxAmount;
                result.totalBonus += paydayEmployeeResult.bonusAmount;
                result.paidList.push(paydayEmployeeResult);
            } else {
                result.employeesSkipped++;
                result.skippedList.push(paydayEmployeeResult);
                if (paydayEmployeeResult.skipReason) {
                    result.skippedReasons[paydayEmployeeResult.skipReason] =
                        (result.skippedReasons[paydayEmployeeResult.skipReason] || 0) + 1;
                }
            }
        }

        // Обновление totalPaydayCount только если были выплаты
        if (result.employeesPaid > 0) {
            totalPaydayCount = paydayNumber;
        }

        lastPaydayTime = new Date();
        paydayHistory.push({
            number: paydayNumber,
            timestamp: paydayTimestamp,
            employees: result.employeesPaid,
            total: result.totalPaid,
            manual: !!isManual,
        });

        // Ограничение истории (храним последние 100)
        if (paydayHistory.length > 100) {
            paydayHistory = paydayHistory.slice(-100);
        }

        result.success = true;
        result.processingTimeMs = Date.now() - startTime;

        // Отправка результатов в чат
        if (!silent && bot && bot.connected) {
            sendPaydayResults(bot, result);
        }

        logger.success(
            'PayDay #' + paydayNumber + ' завершён: ' +
            result.employeesPaid + ' сотрудников, ' +
            utils.formatMoney(result.totalPaid) + ' (' +
            (Date.now() - startTime) + 'ms)'
        );

    } catch (error) {
        logger.error('Ошибка PayDay: ' + error.message);
        logger.error(error.stack);

        if (!silent && bot && bot.connected) {
            bot.chat('/cc &c⚠ Ошибка PayDay #' + paydayNumber + '! Администрация уведомлена.');
        }

        result.success = false;
        result.error = error.message;
    } finally {
        isProcessing = false;
    }

    return result;
}

// ==================== ОБРАБОТКА СОТРУДНИКА ====================

function processEmployeePayday(bot, username, duty, allOrgs, paydayNumber, isManual, paydayTimestamp) {
    var employeeResult = {
        username: username,
        organization: duty.organization,
        rank: duty.rank,
        paid: false,
        skipReason: null,
        baseSalary: 0,
        bonusAmount: 0,
        taxAmount: 0,
        finalSalary: 0,
        message: '',
    };

    // Проверка тюрьмы
    if (duty.is_in_jail) {
        employeeResult.skipReason = 'jailed';
        employeeResult.message = 'В тюрьме';
        return employeeResult;
    }

    // Проверка болезни
    if (duty.is_sick) {
        employeeResult.skipReason = 'sick';
        employeeResult.message = 'Болен';
        return employeeResult;
    }

    // Проверка заморозки
    if (duty.is_frozen) {
        employeeResult.skipReason = 'frozen';
        employeeResult.message = 'Профиль заморожен';
        return employeeResult;
    }

    // Проверка нахождения в городе
    if (!duty.is_in_city) {
        employeeResult.skipReason = 'outOfCity';
        employeeResult.message = 'Не в городе';
        return employeeResult;
    }

    // Проверка отпуска
    var vacation = db.vacations.getActive(username);
    if (vacation) {
        employeeResult.skipReason = 'vacation';
        employeeResult.message = 'В отпуске до ' + utils.formatDate(vacation.end_date);
        return employeeResult;
    }

    // Проверка рабочего времени (перерыв)
    if (utils.isBreakTime() && !isManual) {
        employeeResult.skipReason = 'onBreak';
        employeeResult.message = 'Перерыв';
        return employeeResult;
    }

    // Проверка времени отдыха
    if (utils.isRestTime() && !isManual) {
        employeeResult.skipReason = 'onBreak';
        employeeResult.message = 'Время отдыха';
        return employeeResult;
    }

    // Проверка минимального времени на дежурстве
    var minutesOnDuty = duty.minutes_on_duty || 0;
    if (minutesOnDuty < config.payday.minDutyMinutes && !isManual) {
        employeeResult.skipReason = 'notEnoughMinutes';
        employeeResult.message = 'Недостаточно времени (' + minutesOnDuty.toFixed(0) + '/' + config.payday.minDutyMinutes + ' мин)';
        return employeeResult;
    }

    // Проверка организации
    var orgConfig = null;
    var orgKeys = Object.keys(config.organizations);
    for (var i = 0; i < orgKeys.length; i++) {
        if (config.organizations[orgKeys[i]].name === duty.organization) {
            orgConfig = config.organizations[orgKeys[i]];
            break;
        }
    }

    if (!orgConfig || !orgConfig.ranks[duty.rank]) {
        employeeResult.skipReason = 'noSalaryConfig';
        employeeResult.message = 'Не найден ранг/зарплата для ' + (duty.rank || 'неизвестно');
        return employeeResult;
    }

    // Проверка заморозки организации
    var orgData = allOrgs[duty.organization];
    if (orgData && orgData.isFrozen) {
        employeeResult.skipReason = 'frozen';
        employeeResult.message = 'Организация заморожена';
        return employeeResult;
    }

    // Базовая зарплата
    var baseSalary = orgConfig.ranks[duty.rank].salary;
    employeeResult.baseSalary = baseSalary;

    // Расчёт бонуса
    var bonusPercent = orgData ? (orgData.bonusPercent || 0) : 0;
    var bonusAmount = Math.floor(baseSalary * bonusPercent);
    employeeResult.bonusAmount = bonusAmount;

    // Расчёт налога
    var taxRate = db.settings.getNumber('payday_tax_rate') || config.payday.taxRate || 0.01;
    var taxAmount = Math.floor((baseSalary + bonusAmount) * taxRate);
    employeeResult.taxAmount = taxAmount;

    // Итоговая зарплата
    var finalSalary = baseSalary + bonusAmount - taxAmount;
    if (finalSalary < 0) finalSalary = 0;
    employeeResult.finalSalary = finalSalary;

    // Проверка бюджета организации
    if (orgData && orgData.budget < baseSalary && !isManual) {
        employeeResult.skipReason = 'insufficientBudget';
        employeeResult.message = 'Недостаточно бюджета организации (нужно: ' + utils.formatMoney(baseSalary) + ', есть: ' + utils.formatMoney(orgData.budget) + ')';
        return employeeResult;
    }

    // Начисление зарплаты
    var salaryResult = db.rpMembers.updateBalance(username, finalSalary,
        'payday', 'PayDay #' + paydayNumber + ' (' + duty.organization + ', ' + duty.rank + ')', 'SYSTEM');

    if (!salaryResult.success) {
        employeeResult.skipReason = 'error';
        employeeResult.message = 'Ошибка начисления';
        return employeeResult;
    }

    // Списание из бюджета организации
    if (orgData) {
        var orgKey = orgData.key;
        if (orgKey) {
            db.orgBudgets.updateBudget(orgKey, -baseSalary);
        }
    }

    // Увеличение счётчика PayDay
    db.run(
        'UPDATE rp_members SET payday_count = payday_count + 1 WHERE username_lower = ?',
        [username.toLowerCase()]
    );

    // Сброс минут на дежурстве
    db.run(
        'UPDATE active_duties SET minutes_on_duty = 0, last_payday_at = ? WHERE username_lower = ?',
        [paydayTimestamp, username.toLowerCase()]
    );

    employeeResult.paid = true;
    employeeResult.message = 'Выплачено: ' + utils.formatMoney(finalSalary);

    // Уведомление в ЛС
    if (bot && bot.connected && finalSalary > 0) {
        try {
            var personalMsg = '&6💰 PayDay #' + paydayNumber + '! &fВыплачено: &a' + utils.formatMoney(finalSalary);
            if (bonusAmount > 0) {
                personalMsg += ' &f(включая бонус &6' + utils.formatMoney(bonusAmount) + '&f)';
            }
            if (taxAmount > 0) {
                personalMsg += ' &f(налог: &c' + utils.formatMoney(taxAmount) + '&f)';
            }
            bot.chat('/msg ' + username + ' ' + personalMsg);
        } catch (e) {
            logger.error('Ошибка отправки ЛС PayDay для ' + username + ': ' + e.message);
        }
    }

    logger.debug(
        'PayDay: ' + username + ' (' + duty.organization + ', ' + duty.rank + ') — ' +
        utils.formatMoney(finalSalary) +
        ' (базовая: ' + utils.formatMoney(baseSalary) +
        ', бонус: ' + utils.formatMoney(bonusAmount) +
        ', налог: ' + utils.formatMoney(taxAmount) + ')'
    );

    return employeeResult;
}

// ==================== ОТПРАВКА РЕЗУЛЬТАТОВ ====================

function sendPaydayResults(bot, data) {
    if (!bot || !bot.connected) return;

    var paidCount = data.employeesPaid;
    var skippedCount = data.employeesSkipped;
    var totalPaid = data.totalPaid;
    var paydayNumber = data.paydayNumber;

    // Основное сообщение
    setTimeout(function() {
        var mainMsg = '&6💰 PAYDAY #' + paydayNumber + '! &7| ';

        if (data.isManual) {
            mainMsg += '&bВнеплановый &7| ';
        }

        mainMsg += 'Сотрудников: &a' + paidCount;

        if (skippedCount > 0) {
            mainMsg += ' &7| Пропущено: &c' + skippedCount;
        }

        mainMsg += ' &7| Выплачено: &a' + utils.formatMoney(totalPaid);

        if (data.totalTax > 0) {
            mainMsg += ' &7| Налог: &c' + utils.formatMoney(data.totalTax);
        }

        bot.chat('/cc ' + mainMsg);
    }, 500);

    // Детализация по организациям (всегда показываем, если есть выплаты)
    if (paidCount > 0) {
        setTimeout(function() {
            var orgSummary = {};

            for (var i = 0; i < data.paidList.length; i++) {
                var emp = data.paidList[i];
                if (!orgSummary[emp.organization]) {
                    orgSummary[emp.organization] = {
                        count: 0,
                        total: 0,
                        members: [],
                    };
                }
                orgSummary[emp.organization].count++;
                orgSummary[emp.organization].total += emp.finalSalary;
                orgSummary[emp.organization].members.push(emp);
            }

            // Если организаций много — показываем сводку
            if (Object.keys(orgSummary).length > 1 || paidCount > 5) {
                var summaryMsg = '&7Выплаты по организациям:';

                var orgNames = Object.keys(orgSummary);
                for (var j = 0; j < orgNames.length; j++) {
                    var orgName = orgNames[j];
                    var stats = orgSummary[orgName];
                    var shortName = getOrgShortName(orgName);
                    summaryMsg += ' &e' + shortName + '&7: &a' + stats.count + ' чел., &6' + utils.formatMoney(stats.total);
                }

                bot.chat('/cc ' + summaryMsg);
            } else if (paidCount <= 5 && paidCount > 0) {
                // Мало сотрудников — показываем поимённо
                var detailMsg = '&7Получили зарплату:';
                for (var k = 0; k < data.paidList.length; k++) {
                    var emp2 = data.paidList[k];
                    var shortName = getOrgShortName(emp2.organization);
                    detailMsg += ' &a' + emp2.username + '&7(' + shortName + '): &6+' + utils.formatMoney(emp2.finalSalary);
                }
                bot.chat('/cc ' + detailMsg);
            }
        }, 1500);
    }

    // Предупреждения о пропущенных (если есть)
    if (skippedCount > 0 && skippedCount <= 5) {
        setTimeout(function() {
            var skipMsg = '&eПропущены:';
            for (var s = 0; s < data.skippedList.length; s++) {
                var skipped = data.skippedList[s];
                skipMsg += ' &7' + skipped.username + ': &c' + (skipped.message || skipped.skipReason);
            }
            bot.chat('/cc ' + skipMsg);
        }, 2500);
    } else if (skippedCount > 5) {
        setTimeout(function() {
            var reasonsMsg = '&eПропущено &c' + skippedCount + ' &eсотрудников. Причины:';
            var reasons = data.skippedReasons;
            var reasonNames = {
                'jailed': 'В тюрьме',
                'sick': 'Больны',
                'frozen': 'Заморожены',
                'outOfCity': 'Не в городе',
                'onBreak': 'Перерыв/отдых',
                'vacation': 'В отпуске',
                'notEnoughMinutes': 'Мало времени',
                'insufficientBudget': 'Бюджет организации',
                'notOnDuty': 'Не на дежурстве',
            };
            for (var reason in reasons) {
                if (reasons.hasOwnProperty(reason) && reasons[reason] > 0) {
                    reasonsMsg += ' &7' + (reasonNames[reason] || reason) + ': &c' + reasons[reason];
                }
            }
            bot.chat('/cc ' + reasonsMsg);
        }, 2500);
    }
}

// ==================== ОБНОВЛЕНИЕ МИНУТ ДЕЖУРСТВА ====================

function updateDutyMinutes() {
    try {
        var activeDuties = db.all('SELECT * FROM active_duties');
        var updatedCount = 0;

        for (var i = 0; i < activeDuties.length; i++) {
            var duty = activeDuties[i];

            // Проверка, не в отпуске ли
            var vacation = db.vacations.getActive(duty.username);
            if (vacation) {
                // Снимаем с дежурства
                db.run('DELETE FROM active_duties WHERE username_lower = ?', [duty.username.toLowerCase()]);
                continue;
            }

            // Начисление минуты
            db.run(
                'UPDATE active_duties SET minutes_on_duty = minutes_on_duty + 1 WHERE id = ?',
                [duty.id]
            );
            updatedCount++;
        }

        if (updatedCount > 0 && updatedCount % 10 === 0) {
            logger.debug('Обновлены минуты дежурства для ' + updatedCount + ' сотрудников');
        }
    } catch (error) {
        logger.error('Ошибка обновления минут дежурства: ' + error.message);
    }
}

// ==================== ПРОВЕРКА ИСТЕКАЮЩИХ НАЛОГОВ ====================

function checkPropertyTaxes(bot) {
    if (!bot && botInstance) bot = botInstance;
    if (!bot || !bot.connected) return;

    try {
        var properties = db.properties.getAll();
        var now = new Date();
        var notifiedCount = 0;

        for (var i = 0; i < properties.length; i++) {
            var prop = properties[i];
            if (!prop.is_owned || !prop.owner) continue;
            if (!prop.tax_paid_until) continue;

            var taxDate = new Date(prop.tax_paid_until);
            var daysUntilExpiry = Math.ceil((taxDate - now) / 86400000);

            // Уведомление за 2 дня до истечения
            if (daysUntilExpiry <= 2 && daysUntilExpiry >= 0) {
                try {
                    var propConfig = config.getPropertyInfo(prop.property_id);
                    var weeklyTax = propConfig ? Math.floor(propConfig.price * (config.economy.taxRate || 0.01)) : 0;

                    bot.chat('/msg ' + prop.owner +
                        ' &e⚠ Налог на имущество #' + prop.property_id +
                        ' истекает через ' + daysUntilExpiry + ' дн! &fСумма: &a' + utils.formatMoney(weeklyTax));
                    notifiedCount++;
                } catch (e) {}
            }

            // Уведомление при истечении
            if (daysUntilExpiry < 0 && daysUntilExpiry > -3) {
                try {
                    var propConfig2 = config.getPropertyInfo(prop.property_id);
                    var weeklyTax2 = propConfig2 ? Math.floor(propConfig2.price * (config.economy.taxRate || 0.01)) : 0;

                    bot.chat('/msg ' + prop.owner +
                        ' &c🚫 Налог на имущество #' + prop.property_id +
                        ' ПРОСРОЧЕН! &fОплатите: &a' + utils.formatMoney(weeklyTax2));
                    notifiedCount++;
                } catch (e) {}
            }
        }

        if (notifiedCount > 0) {
            logger.debug('Уведомлений о налогах: ' + notifiedCount);
        }
    } catch (error) {
        logger.error('Ошибка проверки налогов: ' + error.message);
    }
}

// ==================== ПРОВЕРКА ВЫЗДОРОВЛЕНИЙ ====================

function checkSicknessRecovery(bot) {
    if (!bot && botInstance) bot = botInstance;

    try {
        var sickMembers = db.all(
            "SELECT * FROM rp_members WHERE is_sick = 1 AND sick_until <= datetime('now') AND is_active = 1"
        );

        for (var i = 0; i < sickMembers.length; i++) {
            var member = sickMembers[i];
            db.rpMembers.healFromSick(member.username, 'natural');

            if (bot && bot.connected) {
                try {
                    bot.chat('/msg ' + member.username + ' &a✅ Вы выздоровели!');
                } catch (e) {}
            }

            logger.info(member.username + ' выздоровел');
        }
    } catch (error) {
        logger.error('Ошибка проверки выздоровлений: ' + error.message);
    }
}

// ==================== ПРОВЕРКА ОСВОБОЖДЕНИЙ ИЗ ТЮРЬМЫ ====================

function checkJailReleases(bot) {
    if (!bot && botInstance) bot = botInstance;

    try {
        var prisoners = db.all(
            "SELECT * FROM jail_records WHERE is_active = 1 AND jail_end <= datetime('now')"
        );

        for (var i = 0; i < prisoners.length; i++) {
            var prisoner = prisoners[i];
            db.rpMembers.releaseFromJail(prisoner.username);

            if (bot && bot.connected) {
                try {
                    bot.chat('/msg ' + prisoner.username + ' &a✅ Вы освобождены из тюрьмы!');
                } catch (e) {}
            }

            logger.info(prisoner.username + ' освобождён из тюрьмы (срок истёк)');
        }

        if (prisoners.length > 0) {
            logger.info('Освобождено из тюрьмы: ' + prisoners.length + ' чел.');
        }
    } catch (error) {
        logger.error('Ошибка проверки тюрьмы: ' + error.message);
    }
}

// ==================== ПРОВЕРКА ЛИЦЕНЗИЙ ====================

function checkExpiringLicenses(bot) {
    if (!bot && botInstance) bot = botInstance;
    if (!bot || !bot.connected) return;

    try {
        var licenseModule = require('./licenses');
        if (licenseModule && typeof licenseModule.checkExpiringLicenses === 'function') {
            licenseModule.checkExpiringLicenses(bot);
        }
    } catch (error) {
        logger.error('Ошибка проверки лицензий из PayDay: ' + error.message);
    }
}

// ==================== ПЕРИОДИЧЕСКИЕ ЗАДАЧИ ====================

var periodicTasksStarted = false;
var intervals = [];

function startPeriodicTasks(bot) {
    if (periodicTasksStarted) return;
    periodicTasksStarted = true;

    botInstance = bot;
    logger.info('Запуск периодических задач PayDay...');

    // Обновление минут дежурства — каждую минуту
    intervals.push(setInterval(function() {
        updateDutyMinutes();
    }, 60000));

    // PayDay — проверка каждую минуту, запуск в начале часа
    intervals.push(setInterval(function() {
        var now = new Date();
        if (now.getMinutes() === 0) {
            processPayday(bot, false, false);
        }
    }, 60000));

    // Проверка просроченных налогов — раз в 6 часов
    intervals.push(setInterval(function() {
        checkPropertyTaxes(bot);
    }, 21600000));

    // Проверка лицензий — раз в 6 часов
    intervals.push(setInterval(function() {
        checkExpiringLicenses(bot);
    }, 21600000));

    // Проверка выздоровлений — каждые 5 минут
    intervals.push(setInterval(function() {
        checkSicknessRecovery(bot);
    }, 300000));

    // Проверка освобождений из тюрьмы — каждые 5 минут
    intervals.push(setInterval(function() {
        checkJailReleases(bot);
    }, 300000));

    // Сброс дневных лимитов персонала в полночь
    intervals.push(setInterval(function() {
        var now = new Date();
        if (now.getHours() === 0 && now.getMinutes() === 0) {
            db.staff.resetDailyLimits();
            db.cooldowns.clear();
            logger.info('Сброшены дневные лимиты персонала');
        }
    }, 60000));

    // Очистка истёкших наказаний — каждые 5 минут
    intervals.push(setInterval(function() {
        var removed = db.punishments.removeAllExpired();
        if (removed && removed.changes > 0) {
            logger.debug('Очищено истёкших наказаний: ' + removed.changes);
        }
    }, 300000));

    logger.success('Периодические задачи PayDay запущены (' + intervals.length + ' задач)');
}

function stopPeriodicTasks() {
    for (var i = 0; i < intervals.length; i++) {
        clearInterval(intervals[i]);
    }
    intervals = [];
    periodicTasksStarted = false;
    logger.info('Периодические задачи PayDay остановлены');
}

// ==================== СТАТИСТИКА ====================

function getPaydayStats() {
    var allPaydays = db.all(
        "SELECT COUNT(*) as count, SUM(amount) as total FROM balance_logs WHERE type = 'payday'"
    );

    var lastPaydays = db.all(
        "SELECT * FROM balance_logs WHERE type = 'payday' ORDER BY created_at DESC LIMIT 10"
    );

    return {
        totalPaydays: totalPaydayCount,
        lastPaydayTime: lastPaydayTime ? lastPaydayTime.toISOString() : null,
        totalPaidAllTime: allPaydays[0] ? (allPaydays[0].total || 0) : 0,
        totalTransactions: allPaydays[0] ? (allPaydays[0].count || 0) : 0,
        lastPaydays: lastPaydays,
        history: paydayHistory.slice(-10),
        isProcessing: isProcessing,
    };
}

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================

function getOrgShortName(fullName) {
    var shortNames = {
        'Полиция (МВД)': 'МВД',
        'Армия': 'Армия',
        'Больница': 'Медицина',
        'Академия': 'Академия',
        'Мэрия и Суд': 'Мэрия',
    };
    return shortNames[fullName] || fullName.substring(0, 10);
}

// ==================== ЭКСПОРТ ====================
module.exports = {
    setBot,
    processPayday,
    updateDutyMinutes,
    checkPropertyTaxes,
    checkSicknessRecovery,
    checkJailReleases,
    checkExpiringLicenses,
    startPeriodicTasks,
    stopPeriodicTasks,
    getPaydayStats,
    getLastPaydayTime: function() { return lastPaydayTime; },
    getTotalPaydayCount: function() { return totalPaydayCount; },
    isProcessing: function() { return isProcessing; },
};