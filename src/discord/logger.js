// src/discord/logger.js
// Логирование событий в Discord канал

const { EmbedBuilder } = require('discord.js');

let client = null;
let logsChannelId = null;

function init(discordClient, channelId) {
    client = discordClient;
    logsChannelId = channelId;
}

async function log(message, type = 'info', details = null) {
    if (!client || !logsChannelId) return;
    
    const channel = client.channels.cache.get(logsChannelId);
    if (!channel) return;
    
    const colors = {
        info: 0x3498db,
        warn: 0xf1c40f,
        error: 0xe74c3c,
        success: 0x2ecc71,
        punishment: 0xe74c3c,
        economy: 0x2ecc71,
        join: 0x3498db,
        leave: 0xe74c3c
    };
    
    const embed = new EmbedBuilder()
        .setTitle(getTitleByType(type))
        .setDescription(message)
        .setColor(colors[type] || 0x6343d4)
        .setTimestamp();
    
    if (details) {
        embed.addFields({ name: '📋 Детали', value: details, inline: false });
    }
    
    await channel.send({ embeds: [embed] }).catch(() => {});
}

function getTitleByType(type) {
    const titles = {
        info: 'ℹ️ Информация',
        warn: '⚠️ Предупреждение',
        error: '❌ Ошибка',
        success: '✅ Успех',
        punishment: '🔨 Наказание',
        economy: '💰 Экономика',
        join: '➕ Вход в клан',
        leave: '➖ Выход из клана'
    };
    return titles[type] || '📋 Лог';
}

async function logPunishment(player, type, reason, issuedBy, duration) {
    const embed = new EmbedBuilder()
        .setTitle('🔨 НОВОЕ НАКАЗАНИЕ')
        .setColor(0xe74c3c)
        .addFields(
            { name: '👤 Игрок', value: player, inline: true },
            { name: '⚙️ Тип', value: type, inline: true },
            { name: '👮 Выдал', value: issuedBy, inline: true },
            { name: '📝 Причина', value: reason, inline: true }
        )
        .setTimestamp();
    
    if (duration) {
        embed.addFields({ name: '⏱️ Длительность', value: duration, inline: true });
    }
    
    const channel = client?.channels.cache.get(logsChannelId);
    if (channel) await channel.send({ embeds: [embed] }).catch(() => {});
}

async function logEconomy(player, amount, type, balance) {
    const embed = new EmbedBuilder()
        .setTitle('💰 ЭКОНОМИЧЕСКАЯ ОПЕРАЦИЯ')
        .setColor(0x2ecc71)
        .addFields(
            { name: '👤 Игрок', value: player, inline: true },
            { name: '💰 Сумма', value: `${amount > 0 ? '+' : ''}${amount.toLocaleString()}₽`, inline: true },
            { name: '⚙️ Тип', value: type, inline: true },
            { name: '💳 Баланс', value: `${balance.toLocaleString()}₽`, inline: true }
        )
        .setTimestamp();
    
    const channel = client?.channels.cache.get(logsChannelId);
    if (channel) await channel.send({ embeds: [embed] }).catch(() => {});
}

module.exports = { init, log, logPunishment, logEconomy };