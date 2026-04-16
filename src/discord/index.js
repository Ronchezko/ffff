// src/discord/index.js
// ПОЛНОСТЬЮ ПЕРЕРАБОТАННЫЙ DISCORD БОТ

const { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder, REST, Routes, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');
const logger = require('../shared/logger');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessages
    ],
    partials: [Partials.Channel]
});

// Коллекции для команд и кулдаунов
client.commands = new Collection();
const commandCooldowns = new Collection();
const messageCooldowns = new Collection();

let db = null;
let startTime = Date.now();

// ============================================
// ФУНКЦИЯ ОБНОВЛЕНИЯ СТАТУСА
// ============================================

async function updatePresence() {
    if (!db) return;
    
    try {
        const clanMembers = await db.getAllClanMembers();
        const rpPlayers = await db.all('SELECT COUNT(*) as count FROM rp_players WHERE structure != "Гражданин"');
        
        const totalMembers = clanMembers?.length || 0;
        const onlineRP = rpPlayers?.[0]?.count || 0;
        
        // Время работы бота
        const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
        const hours = Math.floor(uptimeSeconds / 3600);
        const minutes = Math.floor((uptimeSeconds % 3600) / 60);
        
        client.user.setPresence({
            activities: [{
                name: `Minecraft | ${totalMembers} в клане | ${onlineRP} в RP`,
                type: 0, // Playing
                state: `В клане Resistance • ${hours}ч ${minutes}мин`,
                details: `Участников: ${totalMembers} | В RP: ${onlineRP}`,
                timestamps: { start: startTime }
            }],
            status: 'online'
        });
        
        // Обновляем каждые 30 секунд
        setTimeout(updatePresence, 30000);
    } catch (err) {
        logger.error('Ошибка обновления статуса:', err);
        setTimeout(updatePresence, 60000);
    }
}

// ============================================
// РЕГИСТРАЦИЯ СЛЕШ-КОМАНД
// ============================================

async function registerCommands() {
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
    
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    
    try {
        logger.info('🔄 Регистрация слеш-команд...');
        await rest.put(Routes.applicationCommands(process.env.DISCORD_CLIENT_ID), { body: commands });
        logger.success('✅ Слеш-команды зарегистрированы');
    } catch (error) {
        logger.error('❌ Ошибка регистрации команд:', error);
    }
}

// ============================================
// ОБРАБОТЧИК КОМАНД С КУЛДАУНОМ
// ============================================

async function handleCommand(interaction, handler) {
    const userId = interaction.user.id;
    const commandName = interaction.commandName;
    
    // Проверка кулдауна (5 секунд на команду)
    const cooldownKey = `${userId}_${commandName}`;
    const cooldown = commandCooldowns.get(cooldownKey);
    
    if (cooldown && Date.now() < cooldown) {
        const remaining = Math.ceil((cooldown - Date.now()) / 1000);
        return interaction.reply({
            content: `⏳ **Подождите ${remaining} секунд** перед повторным использованием команды!`,
            ephemeral: true
        });
    }
    
    // Устанавливаем кулдаун на 5 секунд
    commandCooldowns.set(cooldownKey, Date.now() + 5000);
    
    // Автоочистка кулдауна
    setTimeout(() => {
        if (commandCooldowns.get(cooldownKey) <= Date.now()) {
            commandCooldowns.delete(cooldownKey);
        }
    }, 6000);
    
    try {
        await handler(interaction);
    } catch (error) {
        logger.error(`Ошибка команды ${commandName}:`, error);
        const errorEmbed = new EmbedBuilder()
            .setColor(process.env.EMBED_COLOR_ERROR || '#e74c3c')
            .setTitle('❌ Ошибка')
            .setDescription('Произошла ошибка при выполнении команды. Попробуйте позже.')
            .setTimestamp();
        
        if (!interaction.replied) {
            await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }
    }
}

// ============================================
// КОМАНДА /vv - СООБЩЕНИЕ ВЕРИФИКАЦИИ
// ============================================

async function handleVV(interaction) {
    // Проверка прав (только администрация)
    const member = interaction.member;
    if (!member.permissions.has('Administrator')) {
        return interaction.reply({
            content: '❌ У вас нет прав для использования этой команды!',
            ephemeral: true
        });
    }
    
    const embed = new EmbedBuilder()
        .setColor(process.env.EMBED_COLOR || '#9b59b6')
        .setTitle('🎫 **ВЕРИФИКАЦИЯ**')
        .setDescription(
            'Добро пожаловать в клан **Resistance**!\n\n' +
            'Чтобы получить доступ к серверу, необходимо верифицировать свой Minecraft аккаунт.\n\n' +
            '### 📝 **Как пройти верификацию?**\n' +
            '1️⃣ Нажмите на кнопку **「 Верификация 」** ниже\n' +
            '2️⃣ Бот выдаст вам уникальный **6-значный код**\n' +
            '3️⃣ Зайдите на Minecraft сервер **ru.dexland.org**\n' +
            '4️⃣ Напишите в чат `/link ` + ваш код\n' +
            '5️⃣ После успешной верификации вы получите доступ к серверу!'
        )
        .setThumbnail('https://i.imgur.com/logo.png')
        .setImage('https://i.imgur.com/banner.png')
        .setFooter({ text: 'Resistance City Project • Верификация', iconURL: client.user.displayAvatarURL() })
        .setTimestamp();
    
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('verify_button')
                .setLabel('🎫 Верификация')
                .setStyle(ButtonStyle.Success)
                .setEmoji('✅')
        );
    
    const channel = await client.channels.fetch(process.env.DISCORD_VERIFICATION_CHANNEL);
    if (channel) {
        await channel.send({ embeds: [embed], components: [row] });
        await interaction.reply({ content: '✅ Сообщение верификации отправлено!', ephemeral: true });
    } else {
        await interaction.reply({ content: '❌ Канал верификации не найден!', ephemeral: true });
    }
}

// ============================================
// КОМАНДА /stats - СТАТИСТИКА КЛАНА
// ============================================

async function handleStats(interaction) {
    const clanMembers = await db.getAllClanMembers();
    const rpPlayers = await db.all('SELECT * FROM rp_players WHERE structure != "Гражданин"');
    const totalMoney = await db.get('SELECT SUM(money) as total FROM rp_players');
    const totalKills = await db.get('SELECT SUM(kills) as total FROM clan_members');
    
    const embed = new EmbedBuilder()
        .setColor(process.env.EMBED_COLOR || '#9b59b6')
        .setTitle('📊 **Статистика клана Resistance**')
        .setThumbnail(interaction.guild.iconURL())
        .addFields(
            { name: '👥 **Всего участников**', value: `\`${clanMembers?.length || 0}\``, inline: true },
            { name: '🎭 **В RolePlay**', value: `\`${rpPlayers?.length || 0}\``, inline: true },
            { name: '💰 **Общий бюджет**', value: `\`${(totalMoney?.total || 0).toLocaleString()}₽\``, inline: true },
            { name: '⚔️ **Всего убийств**', value: `\`${totalKills?.total || 0}\``, inline: true },
            { name: '🏢 **Организаций**', value: `\`5\``, inline: true },
            { name: '📅 **Дата основания**', value: `\`2024\``, inline: true }
        )
        .setFooter({ text: 'Resistance City Project', iconURL: client.user.displayAvatarURL() })
        .setTimestamp();
    
    await interaction.reply({ embeds: [embed] });
}

// ============================================
// КОМАНДА /profile - ПРОФИЛЬ ИГРОКА
// ============================================

async function handleProfile(interaction) {
    const targetUser = interaction.options.getUser('user') || interaction.user;
    
    // Ищем связанный Minecraft аккаунт
    const linked = await db.get('SELECT * FROM linked_accounts WHERE discord_id = ?', [targetUser.id]);
    
    if (!linked) {
        const embed = new EmbedBuilder()
            .setColor(process.env.EMBED_COLOR_ERROR || '#e74c3c')
            .setTitle('❌ **Профиль не найден**')
            .setDescription(`${targetUser.toString()}, ваш Minecraft аккаунт не верифицирован!\n\nИспользуйте команду \`/vv\` в канале верификации.`)
            .setTimestamp();
        
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }
    
    const rpProfile = await db.getRPProfile(linked.minecraft_nick);
    const clanMember = await db.getClanMember(linked.minecraft_nick);
    
    const embed = new EmbedBuilder()
        .setColor(process.env.EMBED_COLOR || '#9b59b6')
        .setTitle(`👤 **Профиль игрока**`)
        .setThumbnail(targetUser.displayAvatarURL())
        .addFields(
            { name: '🎮 **Minecraft ник**', value: `\`${linked.minecraft_nick}\``, inline: true },
            { name: '🏷️ **Ранг в клане**', value: `\`${clanMember?.rank_name || 'Новичок'}\``, inline: true },
            { name: '💰 **Баланс**', value: `\`${rpProfile?.money?.toLocaleString() || 0}₽\``, inline: true },
            { name: '🏢 **Организация**', value: `\`${rpProfile?.structure || 'Гражданин'}\``, inline: true },
            { name: '⭐ **Звание**', value: `\`${rpProfile?.job_rank || 'Нет'}\``, inline: true },
            { name: '⚔️ **Убийств/Смертей**', value: `\`${clanMember?.kills || 0}/${clanMember?.deaths || 0}\``, inline: true },
            { name: '🎯 **Баллы RP**', value: `\`${rpProfile?.rp_points || 0}\``, inline: true },
            { name: '📅 **В клане с**', value: `\`${new Date(clanMember?.joined_at).toLocaleDateString()}\``, inline: true }
        )
        .setFooter({ text: `Запросил: ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL() })
        .setTimestamp();
    
    await interaction.reply({ embeds: [embed] });
}

// ============================================
// КОМАНДА /top - ТОП ИГРОКОВ
// ============================================

async function handleTop(interaction) {
    const type = interaction.options.getString('type') || 'money';
    
    let title = '';
    let fields = [];
    
    if (type === 'money') {
        title = '💰 **Топ по деньгам**';
        const top = await db.all('SELECT minecraft_nick, money FROM rp_players ORDER BY money DESC LIMIT 10');
        fields = top.map((p, i) => ({ name: `${i+1}. ${p.minecraft_nick}`, value: `\`${p.money.toLocaleString()}₽\``, inline: true }));
    } else if (type === 'kills') {
        title = '⚔️ **Топ по убийствам**';
        const top = await db.all('SELECT minecraft_nick, kills FROM clan_members ORDER BY kills DESC LIMIT 10');
        fields = top.map((p, i) => ({ name: `${i+1}. ${p.minecraft_nick}`, value: `\`${p.kills} убийств\``, inline: true }));
    } else {
        title = '⭐ **Топ по баллам RP**';
        const top = await db.all('SELECT minecraft_nick, rp_points FROM rp_players ORDER BY rp_points DESC LIMIT 10');
        fields = top.map((p, i) => ({ name: `${i+1}. ${p.minecraft_nick}`, value: `\`${p.rp_points} баллов\``, inline: true }));
    }
    
    const embed = new EmbedBuilder()
        .setColor(process.env.EMBED_COLOR || '#9b59b6')
        .setTitle(title)
        .addFields(fields)
        .setFooter({ text: 'Resistance City Project', iconURL: client.user.displayAvatarURL() })
        .setTimestamp();
    
    await interaction.reply({ embeds: [embed] });
}

// ============================================
// КОМАНДА /help - СПРАВКА
// ============================================

async function handleHelp(interaction) {
    const embed = new EmbedBuilder()
        .setColor(process.env.EMBED_COLOR || '#9b59b6')
        .setTitle('❓ **Список команд**')
        .setDescription('Все команды доступны в этом Discord сервере.')
        .addFields(
            { name: '📊 **Статистика**', value: '`/stats` - Статистика клана\n`/profile` - Ваш профиль\n`/top` - Топ игроков', inline: false },
            { name: '🎫 **Верификация**', value: '`/vv` - Вызвать сообщение верификации (админ)', inline: false },
            { name: 'ℹ️ **Прочее**', value: '`/help` - Это меню', inline: false }
        )
        .setFooter({ text: 'Resistance City Project', iconURL: client.user.displayAvatarURL() })
        .setTimestamp();
    
    await interaction.reply({ embeds: [embed] });
}

// ============================================
// ОБРАБОТЧИК СООБЩЕНИЙ В КАНАЛЕ КОМАНД
// ============================================

async function handleCommandChannelMessage(message) {
    if (message.author.bot) return;
    if (message.channel.id !== process.env.DISCORD_COMMANDS_CHANNEL) return;
    
    // Проверка кулдауна для сообщений
    const cooldownKey = `msg_${message.author.id}`;
    const cooldown = messageCooldowns.get(cooldownKey);
    
    if (cooldown && Date.now() < cooldown) {
        // Удаляем сообщение и отправляем предупреждение
        await message.delete();
        const warning = await message.channel.send({
            content: `⏳ ${message.author.toString()}, **не спамьте!** Подождите 3 секунды.`,
            allowedMentions: { users: [message.author.id] }
        });
        setTimeout(() => warning.delete(), 3000);
        return;
    }
    
    // Устанавливаем кулдаун на 3 секунды
    messageCooldowns.set(cooldownKey, Date.now() + 3000);
    setTimeout(() => messageCooldowns.delete(cooldownKey), 3500);
    
    // Проверяем, является ли сообщение командой (начинается с /)
    if (!message.content.startsWith('/')) {
        await message.delete();
        const embed = new EmbedBuilder()
            .setColor(process.env.EMBED_COLOR_ERROR || '#e74c3c')
            .setTitle('❌ **Это чат для команд!**')
            .setDescription(`${message.author.toString()}, этот канал предназначен только для **команд Minecraft**.\n\nИспользуйте команды, начинающиеся с \`/\`\nНапример: \`/help\`, \`/stats\`, \`/profile\``)
            .setFooter({ text: 'Ваше сообщение было удалено' })
            .setTimestamp();
        
        const reply = await message.channel.send({ embeds: [embed], allowedMentions: { users: [message.author.id] } });
        setTimeout(() => reply.delete(), 5000);
        return;
    }
    
    // Логируем команду в канал модерации
    const modChannel = await client.channels.fetch(process.env.DISCORD_MODERATION_CHANNEL);
    if (modChannel) {
        const logEmbed = new EmbedBuilder()
            .setColor(process.env.EMBED_COLOR || '#9b59b6')
            .setTitle('📝 **Команда из Discord**')
            .addFields(
                { name: '👤 **Игрок**', value: message.author.toString(), inline: true },
                { name: '💬 **Команда**', value: `\`${message.content}\``, inline: true },
                { name: '⏰ **Время**', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
            )
            .setTimestamp();
        
        modChannel.send({ embeds: [logEmbed] });
    }
}

// ============================================
// ОБРАБОТЧИК КНОПОК
// ============================================

async function handleButtonInteraction(interaction) {
    if (!interaction.isButton()) return;
    
    if (interaction.customId === 'verify_button') {
        // Генерация кода верификации
        const code = Math.random().toString(36).substring(2, 8).toUpperCase();
        const expiresAt = new Date(Date.now() + 30 * 60000);
        
        // Сохраняем код в БД
        await db.generateVerificationCode('pending', interaction.user.id, interaction.user.username);
        
        // Обновляем код с правильным ником (временно)
        await db.run('UPDATE verification_codes SET minecraft_nick = ? WHERE discord_id = ? AND is_active = 1', ['pending', interaction.user.id]);
        await db.run('UPDATE verification_codes SET code = ?, expires_at = ? WHERE discord_id = ? AND is_active = 1', [code, expiresAt.toISOString(), interaction.user.id]);
        
        const embed = new EmbedBuilder()
            .setColor(process.env.EMBED_COLOR_SUCCESS || '#2ecc71')
            .setTitle('🎫 **Ваш код верификации**')
            .setDescription(
                `**Код:** \`${code}\`\n\n` +
                `**Как использовать:**\n` +
                `1️⃣ Зайдите на Minecraft сервер \`ru.dexland.org\`\n` +
                `2️⃣ Напишите в чат: \`/link ${code}\`\n` +
                `3️⃣ После успешной верификации вы получите доступ к серверу!`
            )
            .setFooter({ text: 'Код действителен 30 минут', iconURL: client.user.displayAvatarURL() })
            .setTimestamp();
        
        await interaction.reply({ embeds: [embed], ephemeral: true });
        
        // Логируем в канал модерации
        const modChannel = await client.channels.fetch(process.env.DISCORD_MODERATION_CHANNEL);
        if (modChannel) {
            const logEmbed = new EmbedBuilder()
                .setColor(process.env.EMBED_COLOR || '#9b59b6')
                .setTitle('🎫 **Новая верификация**')
                .addFields(
                    { name: '👤 **Пользователь**', value: interaction.user.toString(), inline: true },
                    { name: '🔑 **Код**', value: `\`${code}\``, inline: true },
                    { name: '⏰ **Истекает**', value: `<t:${Math.floor(expiresAt.getTime() / 1000)}:R>`, inline: true }
                )
                .setTimestamp();
            
            modChannel.send({ embeds: [logEmbed] });
        }
    }
}

// ============================================
// ЗАПУСК БОТА
// ============================================

async function start(database) {
    db = database;
    startTime = Date.now();
    
    await registerCommands();
    
    client.on('ready', async () => {
        logger.success(`✅ Discord бот запущен как ${client.user.tag}`);
        await updatePresence();
    });
    
    client.on('interactionCreate', async (interaction) => {
        if (interaction.isButton()) {
            await handleButtonInteraction(interaction);
            return;
        }
        
        if (!interaction.isCommand()) return;
        
        switch (interaction.commandName) {
            case 'vv':
                await handleCommand(interaction, handleVV);
                break;
            case 'stats':
                await handleCommand(interaction, handleStats);
                break;
            case 'profile':
                await handleCommand(interaction, handleProfile);
                break;
            case 'top':
                await handleCommand(interaction, handleTop);
                break;
            case 'help':
                await handleCommand(interaction, handleHelp);
                break;
            default:
                await interaction.reply({ content: '❌ Неизвестная команда!', ephemeral: true });
        }
    });
    
    client.on('messageCreate', handleCommandChannelMessage);
    
    await client.login(process.env.DISCORD_TOKEN);
    
    return { client, stop: async () => client.destroy() };
}

module.exports = { start };