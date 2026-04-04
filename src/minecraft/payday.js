// src/minecraft/payday.js
// Система ежечасной выплаты зарплат сотрудникам организаций

const utils = require('../shared/utils');

// Конфигурация зарплат по организациям и рангам (из config.js)
let SALARIES = {};

// Загрузка зарплат из конфига
function loadSalaries(config) {
    SALARIES = config.salaries || {};
}

// Минимальное время на дежурстве для получения зарплаты (в минутах)
const MIN_DUTY_MINUTES = 15;

// Хранилище последних выплат
const lastPaydayTime = new Map();

// ============================================
// ОСНОВНАЯ ФУНКЦИЯ PAYDAY
// ============================================

async function processPayDay(bot, db, addLog) {
    try {
        // Проверка, не отключена ли система
        const paydayEnabled = await db.getSetting('payday_enabled');
        if (paydayEnabled === 'false') {
            addLog(`💰 PayDay отключён настройками`, 'debug');
            return;
        }
        
        addLog(`💰 Запуск ежечасного PayDay...`, 'info');
        
        // Получаем всех сотрудников, которые были на дежурстве
        const onDutyMembers = await db.all(`
            SELECT om.*, rp.last_pay_time, rp.total_duty_seconds 
            FROM org_members om
            JOIN rp_players rp ON om.minecraft_nick = rp.minecraft_nick
            WHERE om.on_duty = 1
        `);
        
        if (!onDutyMembers || onDutyMembers.length === 0) {
            addLog(`💰 Нет сотрудников на дежурстве`, 'info');
            return;
        }
        
        // Получаем бонус к зарплатам
        const salaryBonus = parseInt(await db.getSetting('salary_bonus') || '0');
        const bonusMultiplier = 1 + (salaryBonus / 100);
        
        let totalPaid = 0;
        let paidCount = 0;
        const payResults = [];
        
        for (const member of onDutyMembers) {
            // Проверяем, сколько времени сотрудник был на дежурстве
            const dutyStart = new Date(member.duty_start_time);
            const now = new Date();
            const dutyMinutes = Math.floor((now - dutyStart) / 60000);
            
            // Если отработано меньше минимального времени — не платим
            if (dutyMinutes < MIN_DUTY_MINUTES) {
                addLog(`⏱️ ${member.minecraft_nick} отработал только ${dutyMinutes} мин (нужно ${MIN_DUTY_MINUTES})`, 'debug');
                continue;
            }
            
            // Получаем зарплату по рангу
            const orgSalaries = SALARIES[member.org_name];
            let salary = orgSalaries?.[member.rank_name] || 0;
            
            if (salary === 0) {
                addLog(`⚠️ Не найдена зарплата для ${member.minecraft_nick} (${member.org_name}, ${member.rank_name})`, 'warn');
                continue;
            }
            
            // Применяем бонус
            salary = Math.floor(salary * bonusMultiplier);
            
            // Проверяем, онлайн ли игрок
            const isOnline = await isPlayerOnline(bot, member.minecraft_nick);
            
            if (isOnline) {
                // Начисляем зарплату
                await db.updateMoney(member.minecraft_nick, salary, 'salary', 
                    `Зарплата за час в ${member.org_name}`, 'system');
                totalPaid += salary;
                paidCount++;
                payResults.push({ nick: member.minecraft_nick, salary, org: member.org_name });
                
                // Отправляем уведомление в ЛС
                bot.chat(`/msg ${member.minecraft_nick} &a💰 Вы получили зарплату ${salary.toLocaleString()}₽ за службу в ${getOrgDisplayName(member.org_name)}`);
                
                addLog(`💰 Выплачено ${salary.toLocaleString()}₽ игроку ${member.minecraft_nick} (${member.org_name})`, 'success');
            } else {
                addLog(`⚠️ ${member.minecraft_nick} не в сети, зарплата не начислена`, 'warn');
            }
        }
        
        // Отправляем общее уведомление в клановый чат
        if (paidCount > 0) {
            const bonusText = salaryBonus > 0 ? ` (+${salaryBonus}% бонус)` : '';
            bot.chat(`/cc &a💰 &lPAYDAY &a- Выплачено ${totalPaid.toLocaleString()}₽ ${paidCount} сотрудникам!${bonusText}`);
            bot.chat(`/cc &7Спасибо за службу городу Resistance!`);
        }
        
        // Логируем PayDay
        await db.run(`INSERT INTO payday_logs (player_nick, amount, structure, rank, duty_minutes, was_online)
            VALUES ('system', ?, 'system', 'system', ?, ?)`, [totalPaid, paidCount, 1]);
        
        addLog(`💰 PayDay завершён: выплачено ${totalPaid.toLocaleString()}₽ (${paidCount} чел)`, 'success');
        
    } catch (error) {
        addLog(`❌ Ошибка PayDay: ${error.message}`, 'error');
    }
}

// ============================================
// ПРОВЕРКА ОНЛАЙН ИГРОКА
// ============================================

async function isPlayerOnline(bot, playerName) {
    return new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(false), 3000);
        
        const handler = (message) => {
            const msg = message.toString();
            if (msg.includes('Игроков онлайн') || msg.includes('players online')) {
                clearTimeout(timeout);
                bot.removeListener('message', handler);
                const isOnline = msg.toLowerCase().includes(playerName.toLowerCase());
                resolve(isOnline);
            }
        };
        
        bot.once('message', handler);
        bot.chat('/list');
    });
}

// ============================================
// ПОЛУЧЕНИЕ ОТОБРАЖАЕМОГО НАЗВАНИЯ ОРГАНИЗАЦИИ
// ============================================

function getOrgDisplayName(orgName) {
    const names = {
        'police': 'Полиции',
        'army': 'Армии',
        'hospital': 'Больницы',
        'academy': 'Академии',
        'government': 'Правительства'
    };
    return names[orgName] || orgName;
}

// ============================================
// БОНУСЫ ЗА АКТИВНОСТЬ (РАЗ В НЕДЕЛЮ)
// ============================================

async function processActivityBonus(bot, db, addLog) {
    try {
        // Проверяем, не было ли бонуса на этой неделе
        const lastBonusWeek = await db.getSetting('last_activity_bonus_week');
        const currentWeek = getWeekNumber();
        
        if (lastBonusWeek === currentWeek) {
            return;
        }
        
        // Получаем топ игроков по времени на дежурстве
        const topPlayers = await db.all(`
            SELECT minecraft_nick, total_duty_seconds 
            FROM rp_players 
            WHERE total_duty_seconds > 0 
            ORDER BY total_duty_seconds DESC 
            LIMIT 3
        `);
        
        if (!topPlayers || topPlayers.length === 0) return;
        
        const bonuses = [50000, 30000, 20000]; // 50к, 30к, 20к
        
        bot.chat(`/cc &a🏆 &lТОП АКТИВНОСТИ ЗА НЕДЕЛЮ:`);
        
        for (let i = 0; i < topPlayers.length; i++) {
            const player = topPlayers[i];
            const bonus = bonuses[i];
            const hours = Math.floor(player.total_duty_seconds / 3600);
            
            await db.updateMoney(player.minecraft_nick, bonus, 'bonus', 
                `Бонус за активность: ${hours} часов на дежурстве`, 'system');
            bot.chat(`/cc &e${i+1}. ${player.minecraft_nick} &7- ${hours} ч &6+${bonus.toLocaleString()}₽`);
            
            // Сбрасываем счётчик
            await db.run('UPDATE rp_players SET total_duty_seconds = 0 WHERE minecraft_nick = ?', [player.minecraft_nick]);
        }
        
        await db.setSetting('last_activity_bonus_week', currentWeek);
        addLog(`🏆 Выданы бонусы активности за неделю`, 'info');
        
    } catch (error) {
        addLog(`❌ Ошибка бонусов активности: ${error.message}`, 'error');
    }
}

// ============================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================

function getWeekNumber() {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1);
    const days = Math.floor((now - start) / (24 * 60 * 60 * 1000));
    return Math.ceil(days / 7).toString();
}

// ============================================
// ЗАПЛАНИРОВАННЫЙ PAYDAY
// ============================================

let paydayInterval = null;
let bonusInterval = null;

function schedulePayDay(bot, db, addLog) {
    // Запускаем PayDay каждый час
    if (paydayInterval) clearInterval(paydayInterval);
    
    paydayInterval = setInterval(async () => {
        await processPayDay(bot, db, addLog);
    }, 60 * 60 * 1000);
    
    // Запускаем бонусы активности каждые 24 часа
    if (bonusInterval) clearInterval(bonusInterval);
    
    bonusInterval = setInterval(async () => {
        await processActivityBonus(bot, db, addLog);
    }, 24 * 60 * 60 * 1000);
    
    addLog('💰 Система PayDay запущена (каждый час)', 'success');
}

function stopPayDay() {
    if (paydayInterval) clearInterval(paydayInterval);
    if (bonusInterval) clearInterval(bonusInterval);
    paydayInterval = null;
    bonusInterval = null;
}

// ============================================
// ЭКСПОРТ
// ============================================

module.exports = {
    processPayDay,
    processActivityBonus,
    schedulePayDay,
    stopPayDay,
    loadSalaries,
    MIN_DUTY_MINUTES
};