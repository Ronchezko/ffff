// src/discord/verification.js
const { EmbedBuilder } = require('discord.js');
const logger = require('../shared/logger');

async function startVerification(interaction, db) {
    const discordId = interaction.user.id;
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60000).toISOString();
    
    try {
        const dbInstance = db.getDb();
        
        // Проверяем, не привязан ли уже аккаунт
        const existing = dbInstance.prepare('SELECT * FROM clan_members WHERE discord_id = ?').get(discordId);
        if (existing) {
            const embed = new EmbedBuilder()
                .setColor(0xffaa00)
                .setTitle('⚠️ Уже привязан')
                .setDescription(`Ваш Discord уже привязан к Minecraft аккаунту **${existing.minecraft_nick}**.\nЕсли хотите перепривязать, обратитесь к администратору.`);
            return await interaction.editReply({ embeds: [embed] });
        }
        
        // Деактивируем старые коды
        dbInstance.prepare("UPDATE verification_codes SET status = ? WHERE discord_id = ? AND status = ?").run('expired', discordId, 'pending');
        
        // Создаём новый код
        dbInstance.prepare('INSERT INTO verification_codes (discord_id, code, expires_at, status) VALUES (?, ?, ?, ?)').run(discordId, code, expiresAt, 'pending');
        
        const embed = new EmbedBuilder()
            .setColor(0x6b46c1)
            .setTitle('🔐 Верификация аккаунта')
            .setDescription(`**Ваш код верификации:** \`${code}\`\n\nВведите в игре команду \`/link ${code}\` для привязки аккаунта.\n\nКод действителен **10 минут**.`)
            .setFooter({ text: 'Resistance City' });
        
        await interaction.editReply({ embeds: [embed] });
        
    } catch (error) {
        logger.error('Ошибка верификации:', error);
        await interaction.editReply({ content: '❌ Ошибка создания кода верификации' });
    }
}

async function handleDirectMessage(message, db, client) {
    const content = message.content.trim();
    const discordId = message.author.id;
    
    if (/^\d{6}$/.test(content)) {
        try {
            const dbInstance = db.getDb();
            const code = dbInstance.prepare('SELECT * FROM verification_codes WHERE code = ? AND status = ? AND expires_at > datetime("now")').get(content, 'pending');
            
            if (!code) {
                await message.author.send('❌ Неверный или просроченный код. Используйте `/verify` для получения нового кода.');
                return;
            }
            
            await message.author.send(`✅ Код подтверждён! Теперь введите команду \`/link ${content}\` в игре для завершения привязки.`);
            
        } catch (error) {
            logger.error('Ошибка обработки DM:', error);
            await message.author.send('❌ Ошибка проверки кода');
        }
    }
}

async function completeVerification(minecraftNick, code, db, client) {
    try {
        const dbInstance = db.getDb();
        const verification = dbInstance.prepare('SELECT * FROM verification_codes WHERE code = ? AND status = ? AND expires_at > datetime("now")').get(code, 'pending');
        
        if (!verification) {
            return { success: false, message: 'Неверный или просроченный код' };
        }
        
        // Проверяем, не привязан ли уже этот Minecraft ник
        const existing = dbInstance.prepare('SELECT * FROM clan_members WHERE minecraft_nick = ?').get(minecraftNick);
        if (existing && existing.discord_id && existing.discord_id !== verification.discord_id) {
            return { success: false, message: 'Этот Minecraft аккаунт уже привязан к другому Discord' };
        }
        
        // Обновляем запись
        dbInstance.prepare('UPDATE verification_codes SET minecraft_nick = ?, status = ? WHERE id = ?').run(minecraftNick, 'used', verification.id);
        dbInstance.prepare('UPDATE clan_members SET discord_id = ? WHERE minecraft_nick = ?').run(verification.discord_id, minecraftNick);
        
        // Отправляем приветственное сообщение в ЛС
        if (client) {
            try {
                const user = await client.users.fetch(verification.discord_id);
                const embed = new EmbedBuilder()
                    .setColor(0x00d25b)
                    .setTitle('✅ Успешная верификация')
                    .setDescription(`Привет, **${minecraftNick}**! 🎉\n\nТвой Minecraft аккаунт **${minecraftNick}** успешно привязан к Discord.`)
                    .addFields(
                        { name: '📋 Что теперь?', value: '• Используй команды из Discord\n• Получай уведомления о событиях\n• Участвуй в жизни клана', inline: false },
                        { name: '🎮 Команды', value: '`/profile` - твой профиль\n`/balance` - баланс\n`/pass` - паспорт\n`/pay` - перевод денег\n`/org` - информация об организации\n`/fly` - полёт\n`/10t` - получить 10к\n`/id` - твой ID', inline: false }
                    )
                    .setFooter({ text: 'Resistance City' });
                await user.send({ embeds: [embed] });
                
                // Выдаём роль на сервере
                const guildId = process.env.DISCORD_GUILD_ID;
                if (guildId) {
                    const guild = await client.guilds.fetch(guildId);
                    const member = await guild.members.fetch(verification.discord_id);
                    const roleId = process.env.DISCORD_VERIFY_ROLE;
                    if (roleId) await member.roles.add(roleId);
                    if (member.nickname !== minecraftNick) await member.setNickname(minecraftNick).catch(() => {});
                }
            } catch (e) { logger.error('Ошибка отправки приветствия:', e); }
        }
        
        return { success: true, message: 'Аккаунт успешно привязан!', discordId: verification.discord_id };
        
    } catch (error) {
        logger.error('Ошибка completeVerification:', error);
        return { success: false, message: 'Ошибка привязки аккаунта' };
    }
}

module.exports = {
    startVerification,
    handleDirectMessage,
    completeVerification
};