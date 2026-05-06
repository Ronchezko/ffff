// src/discord/index.js — Discord бот Resistance City v5.0.0
// Обрабатывает слеш-команды, верификацию, логирование, связь с Minecraft ботом

'use strict';

require('dotenv').config();
const { Client, Collection, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, InteractionType, ChannelType, PermissionsBitField } = require('discord.js');
const path = require('path');
const fs = require('fs');
const { logger, createLogger } = require('../shared/logger');
const db = require('../database');
const config = require('../config');
const utils = require('../shared/utils');
const permissions = require('../shared/permissions');

// ==================== ЛОГГЕР ====================
const discordLogger = createLogger('DiscordBot');

// ==================== КЛИЕНТ ====================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildPresences,
    ],
    partials: [
        Partials.Channel,
        Partials.Message,
        Partials.User,
        Partials.GuildMember,
    ],
});

// ==================== КОЛЛЕКЦИИ ====================
client.commands = new Collection();
client.buttons = new Collection();
client.modals = new Collection();
client.cooldowns = new Collection();

// ==================== ПЕРЕМЕННЫЕ ОКРУЖЕНИЯ ====================
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const GUILD_ID = process.env.DISCORD_GUILD_ID;
const VERIFICATION_CHANNEL_ID = process.env.VERIFICATION_CHANNEL_ID;
const VERIFIED_ROLE_ID = process.env.VERIFIED_ROLE_ID;
const COMMANDS_CHANNEL_ID = process.env.COMMANDS_CHANNEL_ID;
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;
const MODERATION_LOG_CHANNEL_ID = process.env.MODERATION_LOG_CHANNEL_ID;
const CLAN_UPDATES_CHANNEL_ID = process.env.CLAN_UPDATES_CHANNEL_ID;

// ==================== ЗАГРУЗКА КОМАНД ====================
function loadCommands() {
    const commandsPath = path.join(__dirname, 'commands');
    
    if (!fs.existsSync(commandsPath)) {
        discordLogger.warn('Папка commands не найдена');
        return;
    }

    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js') && file !== 'commands.js' && file !== 'slash.js');

    for (const file of commandFiles) {
        try {
            const filePath = path.join(commandsPath, file);
            const command = require(filePath);

            if ('data' in command && 'execute' in command) {
                client.commands.set(command.data.name, command);
                discordLogger.debug(`Загружена команда: /${command.data.name}`);
            } else {
                discordLogger.warn(`Команда в ${file} не имеет data или execute`);
            }
        } catch (error) {
            discordLogger.error(`Ошибка загрузки команды ${file}: ${error.message}`);
        }
    }

    // Основной обработчик команд
    const mainCommands = require('./commands/commands');
    if (mainCommands && mainCommands.commands) {
        for (const cmd of mainCommands.commands) {
            if (cmd.data && cmd.execute) {
                client.commands.set(cmd.data.name, cmd);
            }
        }
    }

    discordLogger.success(`Загружено ${client.commands.size} команд`);
}

// ==================== ЗАГРУЗКА КНОПОК ====================
function loadButtons() {
    const buttonsPath = path.join(__dirname, 'buttons');
    
    if (!fs.existsSync(buttonsPath)) return;

    const buttonFiles = fs.readdirSync(buttonsPath).filter(file => file.endsWith('.js'));

    for (const file of buttonFiles) {
        try {
            const button = require(path.join(buttonsPath, file));
            if (button.customId && button.execute) {
                client.buttons.set(button.customId, button);
                discordLogger.debug(`Загружена кнопка: ${button.customId}`);
            }
        } catch (error) {
            discordLogger.error(`Ошибка загрузки кнопки ${file}: ${error.message}`);
        }
    }

    discordLogger.success(`Загружено ${client.buttons.size} кнопок`);
}

// ==================== ЗАГРУЗКА МОДАЛОВ ====================
function loadModals() {
    const modalsPath = path.join(__dirname, 'modals');
    
    if (!fs.existsSync(modalsPath)) return;

    const modalFiles = fs.readdirSync(modalsPath).filter(file => file.endsWith('.js'));

    for (const file of modalFiles) {
        try {
            const modal = require(path.join(modalsPath, file));
            if (modal.customId && modal.execute) {
                client.modals.set(modal.customId, modal);
                discordLogger.debug(`Загружен модал: ${modal.customId}`);
            }
        } catch (error) {
            discordLogger.error(`Ошибка загрузки модала ${file}: ${error.message}`);
        }
    }

    discordLogger.success(`Загружено ${client.modals.size} модалов`);
}

// ==================== РЕГИСТРАЦИЯ СЛЕШ-КОМАНД ====================
async function registerSlashCommands() {
    try {
        const { REST, Routes } = require('discord.js');
        const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

        const commands = [];
        for (const cmd of client.commands.values()) {
            if (cmd.data) {
                commands.push(cmd.data.toJSON());
            }
        }

        discordLogger.info(`Регистрация ${commands.length} слеш-команд...`);

        if (GUILD_ID) {
            // Регистрация для конкретного сервера (мгновенно)
            await rest.put(
                Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
                { body: commands }
            );
            discordLogger.success(`Команды зарегистрированы для сервера ${GUILD_ID}`);
        } else {
            // Глобальная регистрация (может занять до часа)
            await rest.put(
                Routes.applicationCommands(CLIENT_ID),
                { body: commands }
            );
            discordLogger.success('Команды зарегистрированы глобально');
        }
    } catch (error) {
        discordLogger.error(`Ошибка регистрации команд: ${error.message}`);
        if (error.stack) discordLogger.error(error.stack);
    }
}

// ==================== ОБРАБОТЧИКИ СОБЫТИЙ ====================

// Готовность бота
client.once('ready', async () => {
    discordLogger.success(`Discord бот ${client.user.tag} запущен!`);
    discordLogger.info(`Серверов: ${client.guilds.cache.size}`);
    discordLogger.info(`Пользователей: ${client.users.cache.size}`);

    // Установка статуса
    updateBotPresence();

    // Регистрация команд
    await registerSlashCommands();

    // Запуск периодических задач
    startPeriodicTasks();

    // Отправка сообщения родительскому процессу
    if (process.send) {
        process.send({
            type: 'ready',
            service: 'discord',
            username: client.user.tag,
        });
    }
});

// Обновление присутствия
function updateBotPresence() {
    const rpCount = db.rpMembers.count();
    const clanCount = db.members.count();

    client.user.setPresence({
        activities: [{
            name: `Resistance | ${rpCount} RP | ${clanCount} клан`,
            type: 3, // Watching
        }],
        status: 'online',
    });

    // Обновление каждые 5 минут
    setTimeout(updateBotPresence, 300000);
}

// Обработка взаимодействий (слеш-команды)
client.on('interactionCreate', async (interaction) => {
    try {
        // Слеш-команды
        if (interaction.isCommand()) {
            await handleSlashCommand(interaction);
            return;
        }

        // Кнопки
        if (interaction.isButton()) {
            await handleButton(interaction);
            return;
        }

        // Модалы
        if (interaction.isModalSubmit()) {
            await handleModal(interaction);
            return;
        }

        // Автозаполнение
        if (interaction.isAutocomplete()) {
            await handleAutocomplete(interaction);
            return;
        }
    } catch (error) {
        discordLogger.error(`Ошибка обработки interaction: ${error.message}`);
        discordLogger.error(error.stack);

        try {
            const errorResponse = {
                content: 'Произошла ошибка при обработке команды.',
                ephemeral: true,
            };

            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(errorResponse);
            } else {
                await interaction.reply(errorResponse);
            }
        } catch (e) {
            discordLogger.error(`Ошибка отправки сообщения об ошибке: ${e.message}`);
        }
    }
});

// Обработка слеш-команд
async function handleSlashCommand(interaction) {
    const command = client.commands.get(interaction.commandName);

    if (!command) {
        await interaction.reply({
            content: 'Команда не найдена.',
            ephemeral: true,
        });
        return;
    }

    // Проверка канала (если нужен определённый)
    if (COMMANDS_CHANNEL_ID && interaction.channelId !== COMMANDS_CHANNEL_ID) {
        // Некоторые команды доступны везде
        const publicCommands = ['verify', 'link', 'help', 'ping'];
        if (!publicCommands.includes(interaction.commandName)) {
            await interaction.reply({
                content: `Пожалуйста, используйте команды в канале <#${COMMANDS_CHANNEL_ID}>`,
                ephemeral: true,
            });
            return;
        }
    }

    // Проверка кулдаунов
    const cooldownKey = `${interaction.user.id}_${interaction.commandName}`;
    const cooldownTime = client.cooldowns.get(cooldownKey);

    if (cooldownTime && Date.now() < cooldownTime) {
        const remaining = Math.ceil((cooldownTime - Date.now()) / 1000);
        await interaction.reply({
            content: `Подождите ${remaining}с перед следующим использованием.`,
            ephemeral: true,
        });
        return;
    }

    // Установка кулдауна (3 секунды по умолчанию)
    const commandCooldown = command.cooldown || 3;
    client.cooldowns.set(cooldownKey, Date.now() + commandCooldown * 1000);
    setTimeout(() => client.cooldowns.delete(cooldownKey), commandCooldown * 1000);

    // Логирование использования
    discordLogger.info(`/${interaction.commandName} от ${interaction.user.tag} (${interaction.user.id})`);

    // Выполнение
    try {
        await command.execute(interaction, client, db, config, utils, permissions);
    } catch (error) {
        discordLogger.error(`Ошибка /${interaction.commandName}: ${error.message}`);
        throw error;
    }
}

// Обработка кнопок
async function handleButton(interaction) {
    const button = client.buttons.get(interaction.customId);

    if (!button) {
        // Проверяем префиксные ID
        for (const [id, btn] of client.buttons) {
            if (interaction.customId.startsWith(id)) {
                await btn.execute(interaction, client, db, config, utils, permissions);
                return;
            }
        }

        await interaction.reply({
            content: 'Кнопка не найдена.',
            ephemeral: true,
        });
        return;
    }

    try {
        await button.execute(interaction, client, db, config, utils, permissions);
    } catch (error) {
        discordLogger.error(`Ошибка кнопки ${interaction.customId}: ${error.message}`);
        await interaction.reply({
            content: 'Ошибка обработки.',
            ephemeral: true,
        });
    }
}

// Обработка модалов
async function handleModal(interaction) {
    const modal = client.modals.get(interaction.customId);

    if (!modal) {
        await interaction.reply({
            content: 'Модальное окно не найдено.',
            ephemeral: true,
        });
        return;
    }

    try {
        await modal.execute(interaction, client, db, config, utils, permissions);
    } catch (error) {
        discordLogger.error(`Ошибка модала ${interaction.customId}: ${error.message}`);
        await interaction.reply({
            content: 'Ошибка обработки.',
            ephemeral: true,
        });
    }
}

// Обработка автозаполнения
async function handleAutocomplete(interaction) {
    const command = client.commands.get(interaction.commandName);

    if (command && command.autocomplete) {
        try {
            await command.autocomplete(interaction, client, db, config, utils, permissions);
        } catch (error) {
            discordLogger.error(`Ошибка автозаполнения: ${error.message}`);
        }
    }
}

// Обработка личных сообщений
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (message.guild) return; // Только ЛС

    // Логирование
    discordLogger.debug(`ЛС от ${message.author.tag}: ${message.content}`);

    // Обработка команд в ЛС
    if (message.content.startsWith('!') || message.content.startsWith('/')) {
        // Базовая обработка
        const content = message.content.slice(1).trim();
        const args = content.split(/ +/);
        const commandName = args.shift().toLowerCase();

        if (commandName === 'verify' || commandName === 'link') {
            await handleVerificationInDM(message, args);
        } else if (commandName === 'help') {
            await message.author.send({
                embeds: [new EmbedBuilder()
                    .setColor('#6343d4')
                    .setTitle('Помощь Resistance')
                    .setDescription('Используйте слеш-команды на сервере!\n\n`/help` — список команд\n`/verify` — привязать аккаунт')
                ]
            });
        }
    }
});

// Обработка верификации в ЛС
async function handleVerificationInDM(message, args) {
    const discordId = message.author.id;

    // Проверка существующей верификации
    const existingCodes = db.verification.getByDiscordId(discordId);
    const activeCode = existingCodes.find(c => c.is_active === 1);

    if (activeCode) {
        await message.author.send({
            embeds: [new EmbedBuilder()
                .setColor('#FFB800')
                .setTitle('У вас уже есть активный код')
                .setDescription(`Код: \`${activeCode.code}\`\nИстекает: ${utils.formatDate(activeCode.expires_at)}\n\nОтправьте этот код боту в Minecraft: \`/link ${activeCode.code}\``)
            ]
        });
        return;
    }

    // Генерация нового кода
    const code = db.verification.createCode(discordId);

    // Отправка кода
    const embed = new EmbedBuilder()
        .setColor('#6343d4')
        .setTitle('🔗 Верификация Resistance')
        .setDescription('Чтобы привязать Minecraft аккаунт к Discord:')
        .addFields(
            { name: 'Шаг 1', value: 'Зайдите на сервер Minecraft' },
            { name: 'Шаг 2', value: `Отправьте боту команду:\n\`/link ${code}\`` },
            { name: 'Шаг 3', value: 'Готово! Ваш аккаунт привязан.' }
        )
        .setFooter({ text: 'Код действителен 30 минут' })
        .setTimestamp();

    await message.author.send({ embeds: [embed] });

    discordLogger.info(`Код верификации создан для ${message.author.tag}: ${code}`);
}

// Присоединение к серверу
client.on('guildMemberAdd', async (member) => {
    discordLogger.info(`Новый участник: ${member.user.tag}`);

    // Приветственное сообщение в ЛС
    try {
        const welcomeEmbed = new EmbedBuilder()
            .setColor('#6343d4')
            .setTitle('Добро пожаловать в Resistance!')
            .setDescription('Свободный Город «Сопротивление» — Minecraft RolePlay проект')
            .addFields(
                { name: 'Верификация', value: 'Отправьте мне `/verify` в личные сообщения для привязки Minecraft аккаунта' },
                { name: 'Команды', value: 'Используйте `/help` на сервере для списка команд' }
            );

        await member.send({ embeds: [welcomeEmbed] });
    } catch (e) {
        discordLogger.warn(`Не удалось отправить ЛС новому участнику ${member.user.tag}`);
    }
});

// Обработка ошибок
client.on('error', (error) => {
    discordLogger.error(`Ошибка Discord клиента: ${error.message}`);
});

client.on('warn', (warning) => {
    discordLogger.warn(`Discord warning: ${warning}`);
});

// ==================== IPC ОТ РОДИТЕЛЬСКОГО ПРОЦЕССА ====================
process.on('message', async (message) => {
    if (!message || !message.type) return;

    switch (message.type) {
        case 'init':
            discordLogger.info('Получено init-сообщение от оркестратора');
            break;

        case 'graceful_shutdown':
            discordLogger.warn('Запрос на завершение от оркестратора');
            await gracefulShutdown(message.restart);
            break;

        case 'heartbeat':
            if (process.send) {
                process.send({
                    type: 'stats',
                    data: {
                        uptime: process.uptime(),
                        guilds: client.guilds.cache.size,
                        users: client.users.cache.size,
                        commands: client.commands.size,
                    },
                });
            }
            break;

        case 'discord_log':
            // Логирование из Minecraft бота
            if (message.channel === 'moderation') {
                await sendModerationLog(message.data);
            } else if (message.channel === 'economy') {
                await sendEconomyLog(message.data);
            } else if (message.channel === 'staff') {
                await sendStaffLog(message.data);
            }
            break;

        case 'send_verification':
            // Отправка верификации конкретному пользователю
            if (message.discordId) {
                try {
                    const user = await client.users.fetch(message.discordId);
                    if (user) {
                        const code = db.verification.createCode(message.discordId, message.username);
                        await user.send({
                            embeds: [new EmbedBuilder()
                                .setColor('#6343d4')
                                .setTitle('Код верификации')
                                .setDescription(`Ваш код: \`${code}\`\nОтправьте в Minecraft: \`/link ${code}\``)
                            ]
                        });
                    }
                } catch (e) {
                    discordLogger.error(`Ошибка отправки верификации: ${e.message}`);
                }
            }
            break;
    }
});

// ==================== ОТПРАВКА ЛОГОВ ====================
async function sendModerationLog(data) {
    if (!LOG_CHANNEL_ID && !MODERATION_LOG_CHANNEL_ID) return;

    const channelId = MODERATION_LOG_CHANNEL_ID || LOG_CHANNEL_ID;

    try {
        const channel = await client.channels.fetch(channelId);
        if (!channel) return;

        const typeColors = {
            'mute': '#FFB800',
            'unmute': '#76C519',
            'kick': '#CA4E4E',
            'blacklist': '#CA4E4E',
            'unblacklist': '#76C519',
            'warn': '#FFB800',
        };

        const color = typeColors[data.type] || '#D4D4D4';

        const embed = new EmbedBuilder()
            .setColor(color)
            .setTitle(`Модерация: ${data.type}`)
            .addFields(
                { name: 'Нарушитель', value: data.target, inline: true },
                { name: 'Модератор', value: data.issuer, inline: true },
                { name: 'Причина', value: data.reason || 'Не указана' }
            )
            .setTimestamp();

        if (data.duration > 0) {
            embed.addFields({
                name: 'Длительность',
                value: utils.formatDuration(data.duration),
                inline: true,
            });
        }

        await channel.send({ embeds: [embed] });
    } catch (e) {
        discordLogger.error(`Ошибка отправки лога модерации: ${e.message}`);
    }
}

async function sendEconomyLog(data) {
    const economyChannelId = process.env.ECONOMY_LOG_CHANNEL_ID || LOG_CHANNEL_ID;
    if (!economyChannelId) return;

    try {
        const channel = await client.channels.fetch(economyChannelId);
        if (!channel) return;

        const embed = new EmbedBuilder()
            .setColor('#76C519')
            .setTitle('💰 Экономическая операция')
            .addFields(
                { name: 'Тип', value: data.type, inline: true },
                { name: 'Сумма', value: utils.formatMoney(data.amount), inline: true }
            )
            .setTimestamp();

        if (data.username) embed.addFields({ name: 'Игрок', value: data.username, inline: true });
        if (data.reason) embed.addFields({ name: 'Причина', value: data.reason });

        await channel.send({ embeds: [embed] });
    } catch (e) {
        discordLogger.error(`Ошибка отправки экономического лога: ${e.message}`);
    }
}

async function sendStaffLog(data) {
    const staffChannelId = process.env.STAFF_LOG_CHANNEL_ID || LOG_CHANNEL_ID;
    if (!staffChannelId) return;

    try {
        const channel = await client.channels.fetch(staffChannelId);
        if (!channel) return;

        const embed = new EmbedBuilder()
            .setColor('#80C4C5')
            .setTitle('Персонал')
            .setDescription(data.message || 'Действие с персоналом')
            .setTimestamp();

        await channel.send({ embeds: [embed] });
    } catch (e) {
        discordLogger.error(`Ошибка отправки лога персонала: ${e.message}`);
    }
}

// ==================== ПЕРИОДИЧЕСКИЕ ЗАДАЧИ ====================
function startPeriodicTasks() {
    // Обновление присутствия каждые 5 минут
    setInterval(updateBotPresence, 300000);

    // Очистка кулдаунов каждые 10 минут
    setInterval(() => {
        const now = Date.now();
        for (const [key, expiry] of client.cooldowns) {
            if (expiry < now) {
                client.cooldowns.delete(key);
            }
        }
    }, 600000);

    // Напоминания о лицензиях (раз в час)
    setInterval(async () => {
        try {
            const expiringLicenses = db.licenses.getExpiringSoon(2);
            for (const license of expiringLicenses) {
                const member = db.members.get(license.username);
                if (member && member.discord_id) {
                    try {
                        const user = await client.users.fetch(member.discord_id);
                        if (user) {
                            await user.send({
                                embeds: [new EmbedBuilder()
                                    .setColor('#FFB800')
                                    .setTitle('⚠ Лицензия истекает')
                                    .setDescription(`Ваша лицензия \`${license.license_type}\` истекает ${utils.formatDate(license.expires_at)}`)
                                ]
                            });
                        }
                    } catch (e) {}
                }
            }
        } catch (e) {
            discordLogger.error(`Ошибка отправки напоминаний: ${e.message}`);
        }
    }, 3600000);

    // Heartbeat родителю
    setInterval(() => {
        if (process.send) {
            process.send({
                type: 'heartbeat',
                timestamp: new Date().toISOString(),
            });
        }
    }, 30000);

    discordLogger.success('Периодические задачи Discord запущены');
}

// ==================== GRACEFUL SHUTDOWN ====================
async function gracefulShutdown(restart = false) {
    discordLogger.warn('Выполнение graceful shutdown...');

    try {
        // Устанавливаем статус
        client.user.setPresence({
            activities: [{ name: 'Отключаюсь...', type: 3 }],
            status: 'dnd',
        });

        // Отправка уведомления в канал логов
        if (LOG_CHANNEL_ID) {
            try {
                const channel = await client.channels.fetch(LOG_CHANNEL_ID);
                if (channel) {
                    await channel.send({
                        embeds: [new EmbedBuilder()
                            .setColor('#CA4E4E')
                            .setTitle('Бот отключается')
                            .setDescription(restart ? 'Плановый перезапуск' : 'Завершение работы')
                            .setTimestamp()
                        ]
                    });
                }
            } catch (e) {}
        }

        // Завершаем клиент
        client.destroy();
    } catch (e) {
        discordLogger.error(`Ошибка при shutdown: ${e.message}`);
    }

    if (process.send) {
        process.send({
            type: restart ? 'restart' : 'shutdown',
            reason: 'graceful',
        });
    }

    setTimeout(() => {
        process.exit(0);
    }, 3000);
}

// ==================== ЗАПУСК ====================
discordLogger.info('╔══════════════════════════════════════════╗');
discordLogger.info('║  DISCORD BOT — RESISTANCE CITY v5.0.0   ║');
discordLogger.info('╚══════════════════════════════════════════╝');

try {
    loadCommands();
    loadButtons();
    loadModals();

    client.login(DISCORD_TOKEN).then(() => {
        discordLogger.info('Подключение к Discord API...');
    }).catch(error => {
        discordLogger.error(`Ошибка входа: ${error.message}`);
        process.exit(1);
    });
} catch (error) {
    discordLogger.error(`Критическая ошибка запуска: ${error.message}`);
    process.exit(1);
}

// ==================== ЭКСПОРТ ====================
module.exports = {
    client,
    sendModerationLog,
    sendEconomyLog,
    sendStaffLog,
    gracefulShutdown,
};