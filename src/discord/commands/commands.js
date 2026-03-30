const { EmbedBuilder } = require('discord.js');
const database = require('../database');
const logger = require('../shared/logger');
const utils = require('../shared/utils');
const permissions = require('../shared/permissions');

// Словарь для хранения последнего использования команд (кулдаун)
const commandCooldowns = new Map();

// Карта соответствия ролей Discord рангам модераторов (заполните позже)
const discordRoles = {
    // 'role_id': уровень модератора (1-6)
};

// Получение уровня модератора по ролям Discord
function getDiscordModLevel(member) {
    let maxLevel = 0;
    for (const [roleId, level] of Object.entries(discordRoles)) {
        if (member.roles.cache.has(roleId) && level > maxLevel) {
            maxLevel = level;
        }
    }
    return maxLevel;
}

// Основной обработчик команд из Discord
async function handleMessage(message) {
    const args = message.content.trim().split(/ +/);
    const command = args.shift().toLowerCase();
    
    // Проверяем, авторизован ли пользователь в Discord (имеет ли привязанный аккаунт)
    const player = database.getPlayerByDiscordId(message.author.id);
    const nickname = player ? player.nickname : null;
    
    // Определяем уровень доступа (если игрока нет, то уровень 0)
    let modLevel = 0;
    if (player) {
        modLevel = database.getStaffLevel(player.clan_rank);
    } else {
        // Если нет привязки, можно использовать роли Discord (опционально)
        modLevel = getDiscordModLevel(message.member);
    }
    
    // Эмуляция выполнения команд (аналогично майнкрафту)
    // Здесь нужно вызвать соответствующую функцию из команд майнкрафта
    // Для этого нам нужен объект bot, которого нет в дискорде, поэтому мы просто логируем и отвечаем
    
    // Создаём эмбед с результатом
    const embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTimestamp()
        .setFooter({ text: `Запросил: ${message.author.tag}` });
    
    // Простейшая обработка
    if (command === 'help') {
        embed.setTitle('📋 Доступные команды');
        embed.setDescription('`/balance`, `/pay`, `/pass`, `/id`, `/org`, `/discord`, `/property`, `/keys`, `/fly`, `/10t`, `/rp`, `/link`\n\nДля модераторов: `/kick`, `/mute`, `/blacklist`, `/awarn`, `/spam`, `/arp`, `/logs`');
    } else if (command === 'balance') {
        if (!player) {
            embed.setColor(0xFF0000);
            embed.setDescription('❌ Ваш Discord не привязан к игроку. Используйте `/link` в игре.');
        } else {
            const rp = database.getRPPlayer(player.id);
            embed.setDescription(`💰 Баланс **${player.nickname}**: **${rp?.money || 0}₽**`);
        }
    } else if (command === 'pay') {
        // Упрощённая версия
        embed.setColor(0xFFA500);
        embed.setDescription('⚠️ Команда `/pay` временно недоступна в Discord. Используйте в игре.');
    } else {
        embed.setColor(0xFF0000);
        embed.setDescription(`❌ Неизвестная команда. Используйте /help.`);
    }
    
    // В реальной реализации нужно вызывать функции из команд майнкрафта, передавая заглушку bot
    // или использовать ту же логику, но без отправки в игровой чат.
    
    return embed;
}

function init(client) {
    logger.info('Discord команды инициализированы');
}

module.exports = {
    handleMessage,
    init
};