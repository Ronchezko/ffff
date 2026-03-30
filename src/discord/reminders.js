const database = require('../database');
const logger = require('../shared/logger');

let interval = null;

async function checkLicenses(client) {
    const expiring = database.getExpiringLicenses(2); // за 2 дня
    
    for (const lic of expiring) {
        if (!lic.discord_id) continue;
        
        const user = await client.users.fetch(lic.discord_id).catch(() => null);
        if (user) {
            const expireDate = new Date(lic.expires_at).toLocaleDateString('ru-RU');
            user.send(`⚠️ **Напоминание**\nВаша лицензия на **${lic.type}** истекает **${expireDate}**.\nНе забудьте продлить в Discord!`);
        }
    }
}

function startReminders(client) {
    // Проверка каждые 12 часов
    checkLicenses(client);
    interval = setInterval(() => checkLicenses(client), 12 * 3600000);
    logger.info('📅 Система напоминаний о лицензиях запущена');
}

function stopReminders() {
    if (interval) {
        clearInterval(interval);
        interval = null;
    }
}

module.exports = {
    startReminders,
    stopReminders
};