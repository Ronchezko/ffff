// src/discord/verification.js
// Система верификации Discord аккаунтов

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const utils = require('../shared/utils');

const VERIFY_CHANNEL_ID = process.env.DISCORD_VERIFY_CHANNEL || '1466550097759174773';
const VERIFY_ROLE_ID = process.env.DISCORD_VERIFY_ROLE || '1466550097218113794';
const DEXLAND_ROLE_ID = '1489557345527660605';

// ============================================
// НАЧАЛО ВЕРИФИКАЦИИ
// ============================================

async function startVerification(interaction, db, client) {
    const embed = new EmbedBuilder()
        .setTitle('🔐 Верификация Minecraft аккаунта')
        .setDescription('Для привязки аккаунта нажмите на кнопку ниже. Вам будет сгенерирован код, который нужно ввести в игре командой `/link [код]`')
        .setColor(0x6343d4)
        .addFields(
            { name: '⏱️ Код действителен', value: '30 минут', inline: true },
            { name: '🎁 Награда', value: 'Роль верифицированного', inline: true }
        )
        .setFooter({ text: 'Resistance City' });
    
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('verify_confirm')
                .setLabel('Получить код')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🔑'),
            new ButtonBuilder()
                .setCustomId('verify_cancel')
                .setLabel('Отмена')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('❌')
        );
    
    await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
}

// ============================================
// ГЕНЕРАЦИЯ КОДА
// ============================================

async function generateCode(interaction, db, client) {
    const discordId = interaction.user.id;
    const discordUsername = interaction.user.username;
    
    // Проверяем, не привязан ли уже аккаунт
    const existing = await db.get('SELECT minecraft_nick FROM linked_accounts WHERE discord_id = ?', [discordId]);
    if (existing) {
        await interaction.reply({
            content: `❌ Ваш Discord уже привязан к аккаунту **${existing.minecraft_nick}**!`,
            ephemeral: true
        });
        return;
    }
    
    // Генерируем код
    const code = utils.generateCode(6);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    
    // Сохраняем в БД
    await db.run(`
        INSERT INTO verification_codes (code, discord_id, discord_username, expires_at, is_active)
        VALUES (?, ?, ?, ?, 1)
    `, [code, discordId, discordUsername, expiresAt.toISOString()]);
    
    // Отправляем вебхук в канал верификации
    const verifyChannel = client.channels.cache.get(VERIFY_CHANNEL_ID);
    if (verifyChannel) {
        const webhookEmbed = new EmbedBuilder()
            .setTitle('🔐 Новая верификация')
            .setDescription(`Игрок **${discordUsername}** (<@${discordId}>) ожидает верификации`)
            .addFields(
                { name: '📝 Код', value: `\`${code}\``, inline: true },
                { name: '⏱️ Действителен до', value: `<t:${Math.floor(expiresAt / 1000)}:R>`, inline: true }
            )
            .setColor(0x3498db)
            .setTimestamp();
        
        await verifyChannel.send({ embeds: [webhookEmbed] });
    }
    
    const embed = new EmbedBuilder()
        .setTitle('✅ Код верификации')
        .setDescription(`Ваш код: **${code}**`)
        .setColor(0x2ecc71)
        .addFields(
            { name: '⏱️ Действителен до', value: `<t:${Math.floor(expiresAt / 1000)}:R>`, inline: true },
            { name: '🎮 Как использовать', value: 'Зайдите на сервер Minecraft и введите `/link ' + code + '`', inline: true }
        )
        .setFooter({ text: 'Никому не сообщайте этот код!' });
    
    await interaction.update({ embeds: [embed], components: [] });
}

// ============================================
// ПРОВЕРКА И ПОДТВЕРЖДЕНИЕ
// ============================================

async function checkAndVerify(minecraftNick, code, db, client) {
    const record = await db.get(`
        SELECT * FROM verification_codes 
        WHERE code = ? AND is_active = 1 AND expires_at > CURRENT_TIMESTAMP
    `, [code]);
    
    if (!record) {
        return { success: false, reason: 'Неверный или просроченный код' };
    }
    
    // Деактивируем код
    await db.run('UPDATE verification_codes SET is_active = 0, verified_at = CURRENT_TIMESTAMP WHERE code = ?', [code]);
    
    // Привязываем аккаунты
    await db.run(`
        INSERT OR REPLACE INTO linked_accounts (minecraft_nick, discord_id, is_verified, linked_at)
        VALUES (?, ?, 1, CURRENT_TIMESTAMP)
    `, [minecraftNick, record.discord_id]);
    
    await db.run(`
        UPDATE clan_members SET is_discord_linked = 1, discord_id = ?, discord_username = ?
        WHERE minecraft_nick = ?
    `, [record.discord_id, record.discord_username, minecraftNick]);
    
    // Выдаём роль в Discord
    const guild = client.guilds.cache.get(process.env.DISCORD_GUILD_ID);
    if (guild && VERIFY_ROLE_ID) {
        const member = await guild.members.fetch(record.discord_id).catch(() => null);
        if (member) {
            await member.roles.add(VERIFY_ROLE_ID);
            await member.roles.remove('1466550097218113793'); // Убираем роль неверифицированного
            await member.roles.add(DEXLAND_ROLE_ID); // Выдаём роль dexland
        }
    }
    
    // Уведомляем в Discord
    const user = await client.users.fetch(record.discord_id);
    if (user) {
        const embed = new EmbedBuilder()
            .setTitle('✅ Верификация успешна!')
            .setDescription(`Ваш Minecraft аккаунт **${minecraftNick}** успешно привязан!`)
            .setColor(0x2ecc71)
            .addFields(
                { name: '🎮 Игрок', value: minecraftNick, inline: true },
                { name: '💬 Discord', value: user.tag, inline: true }
            )
            .setTimestamp();
        
        await user.send({ embeds: [embed] });
    }
    
    // Логируем в канал верификации
    const verifyChannel = client.channels.cache.get(VERIFY_CHANNEL_ID);
    if (verifyChannel) {
        const logEmbed = new EmbedBuilder()
            .setTitle('✅ Успешная верификация')
            .setDescription(`**${minecraftNick}** успешно привязал Discord аккаунт **${record.discord_username}**`)
            .setColor(0x2ecc71)
            .setTimestamp();
        
        await verifyChannel.send({ embeds: [logEmbed] });
    }
    
    return { success: true, discordId: record.discord_id };
}

// ============================================
// ОТПРАВКА ВЕБХУКА В КАНАЛ ВЕРИФИКАЦИИ
// ============================================

async function sendVerificationWebhook(client, minecraftNick, discordUsername) {
    const channel = client.channels.cache.get(VERIFY_CHANNEL_ID);
    if (!channel) return;
    
    const embed = new EmbedBuilder()
        .setTitle('✅ Новый верифицированный игрок')
        .setDescription(`**${minecraftNick}** успешно привязал Discord аккаунт **${discordUsername}**`)
        .setColor(0x2ecc71)
        .setTimestamp();
    
    await channel.send({ embeds: [embed] });
}

module.exports = {
    startVerification,
    generateCode,
    checkAndVerify,
    sendVerificationWebhook
};