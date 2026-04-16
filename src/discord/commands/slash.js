// src/discord/commands/slash.js
// Регистрация слеш-команд

const { SlashCommandBuilder } = require('discord.js');

const commands = [
    new SlashCommandBuilder()
        .setName('vv')
        .setDescription('🎫 Вызвать сообщение верификации (только для администрации)'),
    new SlashCommandBuilder()
        .setName('stats')
        .setDescription('📊 Статистика клана Resistance'),
    new SlashCommandBuilder()
        .setName('profile')
        .setDescription('👤 Информация о вашем профиле')
        .addUserOption(option => option.setName('user').setDescription('Пользователь').setRequired(false)),
    new SlashCommandBuilder()
        .setName('top')
        .setDescription('🏆 Топ игроков по деньгам и убийствам')
        .addStringOption(option => option.setName('type').setDescription('Тип топа').addChoices(
            { name: '💰 По деньгам', value: 'money' },
            { name: '⚔️ По убийствам', value: 'kills' },
            { name: '⭐ По баллам RP', value: 'points' }
        )),
    new SlashCommandBuilder()
        .setName('help')
        .setDescription('❓ Список всех команд')
];

module.exports = { commands };