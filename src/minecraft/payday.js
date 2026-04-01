// src/minecraft/payday.js
// Система ежечасной выплаты зарплат сотрудникам организаций

const utils = require('../shared/utils');

// Конфигурация зарплат по организациям и рангам
const SALARIES = {
    police: {
        'Рядовой': 4500,
        'Сержант': 5500,
        'Прапорщик': 6200,
        'Лейтенант': 7500,
        'Капитан': 9500,
        'Подполковник': 11000,
        'Полковник': 13000
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
        'Маршал': 15000
    },
    hospital: {
        'Санитар(ка)': 4200,
        'Сестра-хозяйка': 4500,
        'Медсёстры/Брат': 5000,
        'Фельдшер': 5800,
        'Лаборант': 5500,
        'Акушерка': 6000,
        'Врач': 9000,
        'Главный врач': 14000
    },
    academy: {
        'Стажёр': 4200,
        'Ассистент': 4800,
        'Преподаватель': 6000,
        'Зав. кафедрой': 7000,
        'Проректор': 9000,
        'Директор': 11000
    },
    government: {
        'Адвокат': 7500,
        'Прокурор': 10500,
        'Помощник судьи': 6500,
        'Судья': 12000,
        'Министр': 15000,
        'Мэр': 17000
    }
};

// Минимальное время на дежурстве для получения зарплаты (в минутах)
const MIN_DUTY_MINUTES = 15;

// Процесс PayDay
async function processPayDay(bot, db, addLog) {
    try {
        addLog('💰 Запуск ежечасного PayDay...', 'info');
        
        // Получаем всех сотрудников, которые были на дежурстве
        const members = await db.get('SELECT * FROM org_members WHERE on_duty = 1');
        
        if (!members || members.length === 0) {
            addLog('💰 Нет сотрудников на дежурстве', 'info');
            return;
        }
        
        let totalPaid = 0;
        let paidCount = 0;
        
        for (const member of members) {
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
            const salary = SALARIES[member.org_name]?.[member.rank_name] || 0;
            
            if (salary === 0) {
                addLog(`⚠️ Не найдена зарплата для ${member.minecraft_nick} (${member.org_name}, ${member.rank_name})`, 'warn');
                continue;
            }
            
            // Проверяем, онлайн ли игрок
            const isOnline = await isPlayerOnline(bot, member.minecraft_nick);
            
            if (isOnline) {
                // Начисляем зарплату
                await db.updateMoney(member.minecraft_nick, salary, 'salary', `Зарплата за час в ${member.org_name}`, 'system');
                totalPaid += salary;
                paidCount++;
                
                // Отправляем уведомление
                bot.chat(`/msg ${member.minecraft_nick} &a💰 Вы получили зарплату ${utils.formatMoney(salary)} за службу в ${getOrgDisplayName(member.org_name)}`);
                
                addLog(`💰 Выплачено ${utils.formatMoney(salary)} игроку ${member.minecraft_nick} (${member.org_name})`, 'success');
            } else {
                addLog(`⚠️ ${member.minecraft_nick} не в сети, зарплата не начислена`, 'warn');
            }
        }
        
        // Отправляем общее уведомление в клановый чат
        if (paidCount > 0) {
            bot.chat(`/cc &a💰 &lPAYDAY &a- Выплачено ${utils.formatMoney(totalPaid)} ${paidCount} сотрудникам!`);
            bot.chat(`/cc &7Спасибо за службу городу Resistance!`);
        }
        
        // Логируем PayDay
        await db.run(`INSERT INTO payday_logs (player_nick, amount, structure, rank, duty_minutes, was_online)
            VALUES ('system', ?, 'system', 'system', ?, ?)`, [totalPaid, paidCount, 1]);
        
        addLog(`💰 PayDay завершён: выплачено ${utils.formatMoney(totalPaid)} (${paidCount} чел)`, 'success');
        
    } catch (error) {
        addLog(`❌ Ошибка PayDay: ${error.message}`, 'error');
    }
}

// Проверка, онлайн ли игрок на сервере
async function isPlayerOnline(bot, playerName) {
    // Используем команду /list для получения списка игроков
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

// Получение отображаемого названия организации
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

// Начисление бонусов за активность
async function processActivityBonus(bot, db, addLog) {
    // Получаем топ игроков по времени на дежурстве
    const topPlayers = await db.all(`
        SELECT minecraft_nick, total_duty_seconds 
        FROM rp_players 
        WHERE total_duty_seconds > 0 
        ORDER BY total_duty_seconds DESC 
        LIMIT 3
    `);
    
    if (topPlayers.length === 0) return;
    
    const bonuses = [50000, 30000, 20000]; // 50к, 30к, 20к
    
    bot.chat(`/cc &a🏆 &lТОП АКТИВНОСТИ ЗА НЕДЕЛЮ:`);
    
    for (let i = 0; i < topPlayers.length; i++) {
        const player = topPlayers[i];
        const bonus = bonuses[i];
        const hours = Math.floor(player.total_duty_seconds / 3600);
        
        await db.updateMoney(player.minecraft_nick, bonus, 'bonus', `Бонус за активность: ${hours} часов на дежурстве`, 'system');
        bot.chat(`/cc &e${i+1}. ${player.minecraft_nick} &7- ${hours} ч &6+${utils.formatMoney(bonus)}`);
        
        // Сбрасываем счётчик
        await db.run('UPDATE rp_players SET total_duty_seconds = 0 WHERE minecraft_nick = ?', [player.minecraft_nick]);
    }
}

// Запланированный PayDay каждый час
function schedulePayDay(bot, db, addLog) {
    // Запускаем первый PayDay через час
    setTimeout(() => {
        processPayDay(bot, db, addLog);
    }, 60 * 60 * 1000);
    
    // Запускаем каждые 24 часа бонусы активности
    setInterval(() => {
        processActivityBonus(bot, db, addLog);
    }, 24 * 60 * 60 * 1000);
}

module.exports = {
    processPayDay,
    processActivityBonus,
    schedulePayDay,
    SALARIES,
    MIN_DUTY_MINUTES
};