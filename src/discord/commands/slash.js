// src/discord/commands/slash.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const database = require('../../database');
const utils = require('../../shared/utils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('info')
        .setDescription('Информация о проекте'),
    
    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setColor(0x6b46c1)
            .setTitle('🏛️ Resistance City')
            .setDescription('Свободный город с демократическим укладом, развитой экономикой и системой государственных структур.')
            .addFields(
                { name: '📅 Основан', value: '2018 год', inline: true },
                { name: '👥 Участников', value: database.getDb().prepare('SELECT COUNT(*) FROM clan_members').get().count.toString(), inline: true },
                { name: '🎭 RolePlay', value: database.getDb().prepare('SELECT COUNT(*) FROM rp_players').get().count.toString(), inline: true }
            )
            .setFooter({ text: 'Resistance City' });
        
        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
};