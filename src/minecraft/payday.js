// src/minecraft/payday.js
const logger = require('../shared/logger');
const utils = require('../shared/utils');
const database = require('../database');

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

let bot = null;
let paydayInterval = null;
let logCallback = null;
let isRunning = false;
let lastPaydayTime = null;

// Структуры и их зарплаты (базовые)
const STRUCTURE_SALARIES = {
    'Полиция': { default: 4500, ranks: {
        'Рядовой': 4500, 'Сержант': 5500, 'Прапорщик': 6200,
        'Лейтенант': 7500, 'Капитан': 9500, 'Подполковник': 11000, 'Полковник': 13000
    }},
    'Армия': { default: 4300, ranks: {
        'Рядовой': 4300, 'Сержант': 5000, 'Старшина': 5200, 'Прапорщик': 5800,
        'Лейтенант': 6500, 'Капитан': 8000, 'Майор': 9000, 'Подполковник': 10500,
        'Полковник': 12000, 'Маршал': 15000
    }},
    'Больница': { default: 4200, ranks: {
        'Санитар(ка)': 4200, 'Сестра-хозяйка': 4500, 'Медсёстры/Брат': 5000,
        'Фельдшер': 5800, 'Лаборант': 5500, 'Акушерка': 6000,
        'Врач': 9000, 'Главный врач': 14000
    }},
    'Академия': { default: 4200, ranks: {
        'Стажёр': 4200, 'Ассистент': 4800, 'Преподаватель': 6000,
        'Зав. кафедрой': 7000, 'Проректор': 9000, 'Директор': 11000
    }},
    'Мэрия': { default: 7500, ranks: {
        'Адвокат': 7500, 'Прокурор': 10500, 'Помощник судьи': 6500,
        'Судья': 12000, 'Министр': 15000, 'Мэр': 17000
    }}
};

/**
 * Получение зарплаты для игрока по структуре и рангу
 */
function getSalaryForStructure(structure, rank) {
    const structureData = STRUCTURE_SALARIES[structure];
    if (!structureData) return 4000;
    
    if (rank && structureData.ranks[rank]) {
        return structureData.ranks[rank];
    }
    return structureData.default;
}

/**
 * Инициализация системы PayDay
 */
async function init(botInstance, db, logFn) {
    bot = botInstance;
    logCallback = logFn || null;
    
    const enabled = db.getSetting('payday_enabled');
    if (enabled !== 'true') {
        logger.info('⏸️ PayDay отключён в настройках');
        if (logCallback) logCallback('⏸️ PayDay отключён', 'info');
        return;
    }
    
    const now = new Date();
    const msToNextHour = (60 - now.getMinutes()) * 60 * 1000 - now.getSeconds() * 1000 - now.getMilliseconds();
    
    setTimeout(() => {
        performPayday();
        paydayInterval = setInterval(performPayday, 60 * 60 * 1000);
    }, msToNextHour);
    
    const lines = [
        `${colors.white}Система PayDay инициализирована!`,
        `${colors.gold}────────────────────`,
        `${colors.white}Статус: ${colors.green}Активен`,
        `${colors.white}Период: ${colors.yellow}Каждый час в 00 минут`,
        `${colors.white}Мин. время дежурства: ${colors.green}${db.getSetting('payday_min_duty') || 15} минут`,
        `${colors.white}Следующий PayDay: ${colors.green}${new Date(Date.now() + msToNextHour).toLocaleTimeString('ru-RU')}`
    ];
    const frame = createFrame(`💰 PAYDAY`, lines);
    
    logger.info('💰 Система PayDay инициализирована');
    if (logCallback) logCallback(frame, 'success');
}

/**
 * Основная функция PayDay
 */
async function performPayday() {
    if (isRunning) {
        logger.debug('PayDay уже выполняется, пропускаем');
        return;
    }
    
    isRunning = true;
    lastPaydayTime = new Date();
    
    try {
        const db = database.getDb();
        const enabled = database.getSetting('payday_enabled');
        if (enabled !== 'true') {
            isRunning = false;
            return;
        }
        
        const minDutyMinutes = parseInt(database.getSetting('payday_min_duty') || '15');
        const paydayHour = parseInt(database.getSetting('payday_hour') || '0');
        
        const now = new Date();
        if (now.getMinutes() !== paydayHour) {
            logger.debug(`⏰ Не час PayDay (${paydayHour}:00), пропускаем`);
            isRunning = false;
            return;
        }
        
        // Получаем игроков, которые были на дежурстве в последний час
        const players = db.prepare(`
            SELECT 
                sm.minecraft_nick,
                sm.structure,
                sm.rank,
                COALESCE(SUM(dh.minutes), 0) as total_minutes
            FROM structure_members sm
            LEFT JOIN duty_history dh ON dh.player = sm.minecraft_nick 
                AND dh.end_time > datetime('now', '-1 hour')
            WHERE sm.on_duty = 1
            GROUP BY sm.minecraft_nick
            HAVING total_minutes >= ?
        `).all(minDutyMinutes);
        
        if (players.length === 0) {
            logger.debug('💤 Нет игроков для PayDay');
            isRunning = false;
            return;
        }
        
        let totalPaid = 0;
        let paidCount = 0;
        let missedCount = 0;
        let lowBudgetCount = 0;
        const paidPlayers = [];
        
        for (const player of players) {
            // Проверяем, онлайн ли игрок
            const isOnline = bot && bot.players && bot.players[player.minecraft_nick];
            
            if (isOnline) {
                const salary = getSalaryForStructure(player.structure, player.rank);
                const budget = await database.getOrgBudget(player.structure);
                
                if (budget >= salary) {
                    await database.updatePlayerMoney(player.minecraft_nick, salary, `PayDay (${player.structure})`, 'system');
                    db.prepare('UPDATE org_budgets SET balance = balance - ? WHERE structure = ?').run(salary, player.structure);
                    totalPaid += salary;
                    paidCount++;
                    paidPlayers.push(player.minecraft_nick);
                    
                    // Отправка уведомления игроку
                    setTimeout(() => {
                        if (bot && bot.chat) {
                            const lines = [
                                `${colors.white}Вы получили зарплату за дежурство!`,
                                `${colors.gold}────────────────────`,
                                `${colors.white}Структура: ${colors.green}${player.structure}`,
                                `${colors.white}Зарплата: ${colors.green}${salary.toLocaleString('ru-RU')} ₽`,
                                `${colors.white}Отработано: ${colors.yellow}${player.total_minutes} минут`,
                                `${colors.white}Минимум: ${colors.gray}${minDutyMinutes} минут`
                            ];
                            const frame = createFrame(`💰 PAYDAY`, lines);
                            bot.chat(`/msg ${player.minecraft_nick} ${frame}`);
                        }
                    }, 1000);
                    
                    // Обновление статистики
                    db.prepare('UPDATE rp_players SET paydays_attended = paydays_attended + 1 WHERE minecraft_nick = ?').run(player.minecraft_nick);
                    db.prepare('UPDATE structure_members SET on_duty = 0, duty_start = NULL WHERE minecraft_nick = ?').run(player.minecraft_nick);
                    
                } else {
                    lowBudgetCount++;
                    setTimeout(() => {
                        if (bot && bot.chat) {
                            bot.chat(`/msg ${player.minecraft_nick} ${formatMessage('⚠️', `PayDay не выполнен: недостаточно бюджета в ${player.structure} (${budget.toLocaleString('ru-RU')} ₽)`, colors.yellow)}`);
                        }
                    }, 1000);
                }
            } else {
                missedCount++;
                setTimeout(() => {
                    if (bot && bot.chat) {
                        bot.chat(`/msg ${player.minecraft_nick} ${formatMessage('⚠️', `Вы не получили зарплату, так как были оффлайн в момент PayDay.`, colors.yellow)}`);
                    }
                }, 1000);
            }
        }
        
        // Отправка итогового сообщения в клановый чат
        if (paidCount > 0 && bot && bot.chat) {
            const lines = [
                `${colors.white}PayDay выполнен!`,
                `${colors.gold}────────────────────`,
                `${colors.white}Выплачено сотрудникам: ${colors.green}${paidCount}`,
                `${colors.white}Общая сумма: ${colors.green}${totalPaid.toLocaleString('ru-RU')} ₽`,
                `${colors.white}Средняя зарплата: ${colors.yellow}${Math.floor(totalPaid / paidCount).toLocaleString('ru-RU')} ₽`
            ];
            
            if (missedCount > 0) {
                lines.push(`${colors.gold}────────────────────`);
                lines.push(`${colors.white}Не получили (оффлайн): ${colors.red}${missedCount}`);
            }
            if (lowBudgetCount > 0) {
                lines.push(`${colors.white}Не получили (бюджет): ${colors.red}${lowBudgetCount}`);
            }
            
            const frame = createFrame(`💰 PAYDAY`, lines);
            
            setTimeout(() => {
                bot.chat(`/cc ${frame}`);
            }, 2000);
            
            logger.info(`💰 PayDay выполнен для ${paidCount} игроков, выплачено ${totalPaid}₽`);
            if (logCallback) logCallback(`💰 PayDay: ${paidCount} игроков, ${totalPaid}₽ (пропущено: ${missedCount + lowBudgetCount})`, 'success');
        }
        
        // Обновляем глобальную переменную о последнем PayDay
        if (global) global.lastPayday = lastPaydayTime.toLocaleString('ru-RU');
        
    } catch (error) {
        logger.error('❌ Ошибка при выполнении PayDay:', error);
        if (logCallback) logCallback(`❌ Ошибка PayDay: ${error.message}`, 'error');
    } finally {
        isRunning = false;
    }
}

/**
 * Начало дежурства
 */
async function startDuty(nickname, db, sendPrivate) {
    try {
        const rpPlayer = await db.getRPPlayer(nickname);
        if (!rpPlayer || !rpPlayer.structure) {
            if (sendPrivate) sendPrivate(nickname, formatMessage('❌', 'Вы не состоите в организации!', colors.red));
            return false;
        }
        
        // Проверяем, не на дежурстве ли уже
        const current = db.getDb().prepare('SELECT on_duty FROM structure_members WHERE minecraft_nick = ?').get(nickname);
        if (current && current.on_duty) {
            if (sendPrivate) sendPrivate(nickname, formatMessage('⚠️', 'Вы уже на дежурстве!', colors.yellow));
            return false;
        }
        
        db.getDb().prepare(`
            INSERT OR REPLACE INTO structure_members (minecraft_nick, structure, rank, on_duty, duty_start)
            VALUES (?, ?, ?, 1, datetime('now'))
        `).run(nickname, rpPlayer.structure, rpPlayer.organization_rank || 'Стажёр');
        
        const lines = [
            `${colors.white}Вы заступили на дежурство!`,
            `${colors.gold}────────────────────`,
            `${colors.white}Структура: ${colors.green}${rpPlayer.structure}`,
            `${colors.white}Время начала: ${colors.yellow}${new Date().toLocaleTimeString('ru-RU')}`,
            `${colors.white}Для получения зарплаты отстойте &e15 минут&r в час`,
            `${colors.gold}────────────────────`,
            `${colors.white}Для завершения: &e/org duty`
        ];
        const frame = createFrame(`⏰ НАЧАЛО ДЕЖУРСТВА`, lines);
        
        if (sendPrivate) sendPrivate(nickname, frame);
        if (logCallback) logCallback(`⏰ ${nickname} начал дежурство в ${rpPlayer.structure}`, 'info');
        
        return true;
    } catch (error) {
        logger.error('Ошибка startDuty:', error);
        if (sendPrivate) sendPrivate(nickname, formatMessage('❌', 'Ошибка начала дежурства.', colors.red));
        return false;
    }
}

/**
 * Завершение дежурства
 */
async function endDuty(nickname, db, sendPrivate) {
    try {
        const member = db.getDb().prepare('SELECT duty_start, structure FROM structure_members WHERE minecraft_nick = ?').get(nickname);
        if (!member || !member.duty_start) {
            if (sendPrivate) sendPrivate(nickname, formatMessage('⚠️', 'Вы не на дежурстве!', colors.yellow));
            return 0;
        }
        
        const start = new Date(member.duty_start);
        const end = new Date();
        const minutes = Math.floor((end - start) / 60000);
        
        db.getDb().prepare(`
            INSERT INTO duty_history (player, start_time, end_time, minutes, structure)
            VALUES (?, ?, ?, ?, ?)
        `).run(nickname, member.duty_start, end.toISOString(), minutes, member.structure);
        
        db.getDb().prepare('UPDATE structure_members SET on_duty = 0, duty_start = NULL WHERE minecraft_nick = ?').run(nickname);
        
        const lines = [
            `${colors.white}Дежурство завершено!`,
            `${colors.gold}────────────────────`,
            `${colors.white}Структура: ${colors.green}${member.structure}`,
            `${colors.white}Время дежурства: ${colors.yellow}${utils.formatTime(minutes)}`,
            `${colors.white}Зарплата будет начислена в следующий PayDay`,
            `${colors.gold}────────────────────`,
            `${colors.white}Требуется минимум: ${colors.green}15 минут в час`
        ];
        const frame = createFrame(`⏰ ЗАВЕРШЕНИЕ ДЕЖУРСТВА`, lines);
        
        if (sendPrivate) sendPrivate(nickname, frame);
        if (logCallback) logCallback(`⏰ ${nickname} завершил дежурство (${minutes} мин)`, 'info');
        
        return minutes;
    } catch (error) {
        logger.error('Ошибка endDuty:', error);
        if (sendPrivate) sendPrivate(nickname, formatMessage('❌', 'Ошибка завершения дежурства.', colors.red));
        return 0;
    }
}

/**
 * Получение статистики дежурств за сегодня
 */
async function getDutyStats(nickname, db) {
    try {
        const result = db.getDb().prepare(`
            SELECT SUM(minutes) as total FROM duty_history 
            WHERE player = ? AND date(start_time) = date('now')
        `).get(nickname);
        return result?.total || 0;
    } catch (error) {
        return 0;
    }
}

/**
 * Получение детальной статистики дежурств
 */
async function getDetailedDutyStats(nickname, db, period = 'today') {
    try {
        let dateCondition = "date(start_time) = date('now')";
        if (period === 'week') {
            dateCondition = "start_time > datetime('now', '-7 days')";
        } else if (period === 'month') {
            dateCondition = "start_time > datetime('now', '-30 days')";
        }
        
        const result = db.getDb().prepare(`
            SELECT 
                SUM(minutes) as total_minutes,
                COUNT(*) as shifts_count,
                AVG(minutes) as avg_minutes,
                MAX(minutes) as max_minutes
            FROM duty_history 
            WHERE player = ? AND ${dateCondition}
        `).get(nickname);
        
        return {
            totalMinutes: result?.total_minutes || 0,
            shiftsCount: result?.shifts_count || 0,
            avgMinutes: Math.floor(result?.avg_minutes || 0),
            maxMinutes: result?.max_minutes || 0
        };
    } catch (error) {
        return { totalMinutes: 0, shiftsCount: 0, avgMinutes: 0, maxMinutes: 0 };
    }
}

/**
 * Получение статуса дежурства (на дежурстве или нет)
 */
async function isOnDuty(nickname, db) {
    try {
        const member = db.getDb().prepare('SELECT on_duty FROM structure_members WHERE minecraft_nick = ?').get(nickname);
        return member ? member.on_duty === 1 : false;
    } catch (error) {
        return false;
    }
}

/**
 * Получение времени текущего дежурства
 */
async function getCurrentDutyTime(nickname, db) {
    try {
        const member = db.getDb().prepare('SELECT duty_start FROM structure_members WHERE minecraft_nick = ? AND on_duty = 1').get(nickname);
        if (!member || !member.duty_start) return 0;
        
        const start = new Date(member.duty_start);
        const now = new Date();
        return Math.floor((now - start) / 60000);
    } catch (error) {
        return 0;
    }
}

/**
 * Остановка системы PayDay
 */
function stop() {
    if (paydayInterval) {
        clearInterval(paydayInterval);
        paydayInterval = null;
        logger.info('⏸️ Система PayDay остановлена');
        if (logCallback) logCallback('⏸️ PayDay остановлен', 'info');
    }
}

module.exports = {
    init,
    stop,
    startDuty,
    endDuty,
    getDutyStats,
    getDetailedDutyStats,
    isOnDuty,
    getCurrentDutyTime,
    performPayday,
    getSalaryForStructure,
    STRUCTURE_SALARIES
};