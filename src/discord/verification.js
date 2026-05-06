// src/discord/verification.js — Модуль верификации Discord Resistance City v5.0.0
// Генерация кодов, привязка Minecraft аккаунтов к Discord
// Выдача ролей, управление верификацией

'use strict';

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { logger, createLogger } = require('../shared/logger');
const config = require('../config');
const utils = require('../shared/utils');

const verifyLogger = createLogger('Verification');

// ==================== КОНСТАНТЫ ====================
const VERIFICATION_CHANNEL_ID = process.env.VERIFICATION_CHANNEL_ID || config.clan.discord.verificationChannelId;
const VERIFIED_ROLE_ID = process.env.VERIFIED_ROLE_ID || config.clan.discord.verifiedRoleId;
const CODE_EXPIRY_MINUTES = 30;
const MAX_ATTEMPTS_PER_HOUR = 5;
const CODE_LENGTH = 8;

// ==================== КЭШ ПОПЫТОК ====================
const attemptCache = new Map();

// ==================== ГЕНЕРАЦИЯ КОДА ====================
function generateVerificationCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// ==================== ПРОВЕРКА ЛИМИТА ПОПЫТОК ====================
function checkRateLimit(discordId) {
    const now = Date.now();
    const key = `verify_${discordId}`;

    if (!attemptCache.has(key)) {
        attemptCache.set(key, {
            attempts: [],
            blockedUntil: null,
        });
    }

    const data = attemptCache.get(key);

    // Проверка блокировки
    if (data.blockedUntil && data.blockedUntil > now) {
        const remainingMinutes = Math.ceil((data.blockedUntil - now) / 60000);
        return {
            allowed: false,
            reason: 'rate_limited',
            remainingMinutes,
            message: `Слишком много попыток. Попробуйте через ${remainingMinutes} мин.`,
        };
    }

    // Очистка старых попыток (старше часа)
    data.attempts = data.attempts.filter(t => now - t < 3600000);

    // Проверка лимита
    if (data.attempts.length >= MAX_ATTEMPTS_PER_HOUR) {
        data.blockedUntil = now + 3600000;
        return {
            allowed: false,
            reason: 'rate_limited',
            remainingMinutes: 60,
            message: 'Превышен лимит попыток. Заблокировано на 1 час.',
        };
    }

    // Добавление попытки
    data.attempts.push(now);

    return { allowed: true };
}

// ==================== СОЗДАНИЕ ПАНЕЛИ ВЕРИФИКАЦИИ ====================
async function createVerificationPanel(channel, client) {
    if (!channel) {
        try {
            channel = await client.channels.fetch(VERIFICATION_CHANNEL_ID);
        } catch (error) {
            verifyLogger.error(`Не удалось найти канал верификации: ${error.message}`);
            return null;
        }
    }

    if (!channel) {
        verifyLogger.error('Канал верификации не найден');
        return null;
    }

    const embed = new EmbedBuilder()
        .setColor('#6343d4')
        .setTitle('🔗 Верификация Resistance')
        .setDescription(
            'Добро пожаловать в Свободный Город «Сопротивление»!\n\n' +
            'Чтобы получить доступ к серверу, привяжите ваш Minecraft аккаунт:\n\n' +
            '1️⃣ Нажмите кнопку **«Получить код»**\n' +
            '2️⃣ Бот отправит вам код в ЛС\n' +
            '3️⃣ Введите код в Minecraft: `/link <код>`\n' +
            '4️⃣ Готово! Вы получите роль и доступ к каналам\n\n' +
            '⚠ Код действителен **30 минут**\n' +
            '⚠ Если код не пришёл — откройте ЛС от бота'
        )
        .setFooter({ text: 'Resistance City v5.0.0' })
        .setTimestamp();

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('verify_get_code')
                .setLabel('🔗 Получить код')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('verify_help')
                .setLabel('❓ Помощь')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('verify_status')
                .setLabel('📋 Статус')
                .setStyle(ButtonStyle.Secondary),
        );

    try {
        // Удаляем старые сообщения бота в канале
        const messages = await channel.messages.fetch({ limit: 10 });
        const botMessages = messages.filter(m => m.author.id === client.user.id);
        for (const msg of botMessages.values()) {
            await msg.delete().catch(() => {});
        }

        const message = await channel.send({
            embeds: [embed],
            components: [row],
        });

        verifyLogger.info('Панель верификации создана');
        return message;
    } catch (error) {
        verifyLogger.error(`Ошибка создания панели: ${error.message}`);
        return null;
    }
}

// ==================== ОБРАБОТКА КНОПОК ВЕРИФИКАЦИИ ====================
async function handleVerificationButton(interaction, client, db) {
    const customId = interaction.customId;
    const discordId = interaction.user.id;

    switch (customId) {

        // ==================== ПОЛУЧИТЬ КОД ====================
        case 'verify_get_code': {
            // Проверка лимита
            const rateCheck = checkRateLimit(discordId);
            if (!rateCheck.allowed) {
                await interaction.reply({
                    content: rateCheck.message,
                    ephemeral: true,
                });
                return;
            }

            // Проверка существующей верификации
            const existingMember = db.get(
                'SELECT * FROM members WHERE discord_id = ? AND discord_verified = 1',
                [discordId]
            );

            if (existingMember) {
                const embed = new EmbedBuilder()
                    .setColor('#76C519')
                    .setTitle('✅ Уже верифицирован')
                    .setDescription(
                        `Ваш Discord привязан к аккаунту: **${existingMember.username}**\n\n` +
                        'Если нужно перепривязать — обратитесь к администратору.'
                    );

                await interaction.reply({ embeds: [embed], ephemeral: true });
                return;
            }

            // Проверка активного кода
            const existingCodes = db.verification.getByDiscordId(discordId);
            const activeCode = existingCodes.find(c => c.is_active === 1 &&
                new Date(c.expires_at) > new Date());

            if (activeCode) {
                const embed = new EmbedBuilder()
                    .setColor('#FFB800')
                    .setTitle('🔗 У вас уже есть активный код')
                    .setDescription(
                        `Ваш код: **\`${activeCode.code}\`**\n\n` +
                        'Отправьте его в Minecraft:\n' +
                        `\`/link ${activeCode.code}\`\n\n` +
                        `Код истекает: **${utils.formatDate(activeCode.expires_at)}**`
                    );

                await interaction.reply({ embeds: [embed], ephemeral: true });
                return;
            }

            // Генерация нового кода
            const code = db.verification.createCode(discordId);

            const embed = new EmbedBuilder()
                .setColor('#6343d4')
                .setTitle('🔗 Код верификации')
                .setDescription(
                    'Чтобы привязать Minecraft аккаунт:\n\n' +
                    `1️⃣ Зайдите на сервер **${config.minecraft.host}**\n` +
                    `2️⃣ Отправьте боту команду:\n` +
                    `**\`/link ${code}\`**\n` +
                    '3️⃣ Готово! Аккаунт привязан.\n\n' +
                    `⏰ Код действителен **${CODE_EXPIRY_MINUTES} минут**\n` +
                    `📋 Ваш код: **\`${code}\`**`
                )
                .setFooter({ text: 'Если не получилось — нажмите кнопку ещё раз' });

            // Отправка в ЛС
            try {
                await interaction.user.send({ embeds: [embed] });

                await interaction.reply({
                    content: '✅ Код отправлен в личные сообщения! Проверьте ЛС.',
                    ephemeral: true,
                });
            } catch (e) {
                // ЛС закрыты — показываем код в ephemeral
                await interaction.reply({
                    embeds: [embed],
                    ephemeral: true,
                });
            }

            verifyLogger.info(`Код верификации создан для ${interaction.user.tag}: ${code}`);
            break;
        }

        // ==================== ПОМОЩЬ ====================
        case 'verify_help': {
            const embed = new EmbedBuilder()
                .setColor('#80C4C5')
                .setTitle('❓ Помощь по верификации')
                .setDescription(
                    '**Как привязать аккаунт:**\n\n' +
                    '1️⃣ Нажмите **«Получить код»**\n' +
                    '2️⃣ Бот отправит код в ЛС\n' +
                    '3️⃣ Зайдите на сервер Minecraft\n' +
                    '4️⃣ Отправьте в чат: `/link ВАШ_КОД`\n' +
                    '5️⃣ Аккаунт привязан!\n\n' +
                    '**Проблемы:**\n' +
                    '• Не приходит код в ЛС? Откройте настройки Discord → Конфиденциальность → Разрешить ЛС\n' +
                    '• Код истёк? Нажмите кнопку ещё раз\n' +
                    '• Ошибка в игре? Проверьте правильность кода\n\n' +
                    '**Вопросы?** Обратитесь к администрации.'
                );

            await interaction.reply({ embeds: [embed], ephemeral: true });
            break;
        }

        // ==================== СТАТУС ====================
        case 'verify_status': {
            const discordId = interaction.user.id;

            const existingMember = db.get(
                'SELECT * FROM members WHERE discord_id = ? AND discord_verified = 1',
                [discordId]
            );

            if (existingMember) {
                const rpMember = db.rpMembers.get(existingMember.username);

                const embed = new EmbedBuilder()
                    .setColor('#76C519')
                    .setTitle('✅ Статус верификации')
                    .setDescription('Ваш аккаунт верифицирован!')
                    .addFields(
                        { name: 'Minecraft', value: existingMember.username, inline: true },
                        { name: 'В клане', value: existingMember.is_in_clan ? 'Да' : 'Нет', inline: true },
                        { name: 'В RP', value: rpMember?.is_active ? 'Да' : 'Нет', inline: true },
                    );

                await interaction.reply({ embeds: [embed], ephemeral: true });
                return;
            }

            // Проверка активного кода
            const existingCodes = db.verification.getByDiscordId(discordId);
            const activeCode = existingCodes.find(c => c.is_active === 1 &&
                new Date(c.expires_at) > new Date());

            if (activeCode) {
                const embed = new EmbedBuilder()
                    .setColor('#FFB800')
                    .setTitle('⏳ Ожидание верификации')
                    .setDescription(
                        'У вас есть активный код верификации.\n\n' +
                        `Код: **\`${activeCode.code}\`**\n` +
                        `Истекает: ${utils.formatDate(activeCode.expires_at)}\n\n` +
                        'Отправьте этот код в Minecraft: `/link <код>`'
                    );

                await interaction.reply({ embeds: [embed], ephemeral: true });
                return;
            }

            const embed = new EmbedBuilder()
                .setColor('#CA4E4E')
                .setTitle('❌ Не верифицирован')
                .setDescription(
                    'Ваш Discord не привязан к Minecraft аккаунту.\n\n' +
                    'Нажмите **«Получить код»** чтобы начать!'
                );

            await interaction.reply({ embeds: [embed], ephemeral: true });
            break;
        }
    }
}

// ==================== ЗАВЕРШЕНИЕ ВЕРИФИКАЦИИ ====================
async function completeVerification(client, db, username, discordId) {
    try {
        // Обновление в БД
        db.members.setDiscordId(username, discordId);

        // Выдача роли на сервере
        if (VERIFIED_ROLE_ID) {
            try {
                const guild = client.guilds.cache.first();
                if (guild) {
                    const member = await guild.members.fetch(discordId);
                    if (member) {
                        const role = guild.roles.cache.get(VERIFIED_ROLE_ID);
                        if (role) {
                            await member.roles.add(role);
                            verifyLogger.info(`Роль верификации выдана ${username} (Discord: ${member.user.tag})`);
                        }
                    }
                }
            } catch (error) {
                verifyLogger.error(`Ошибка выдачи роли: ${error.message}`);
            }
        }

        // Отправка уведомления в канал логов
        const logChannelId = process.env.LOG_CHANNEL_ID || config.clan.discord.logChannelId;
        if (logChannelId) {
            try {
                const logChannel = await client.channels.fetch(logChannelId);
                if (logChannel) {
                    const embed = new EmbedBuilder()
                        .setColor('#76C519')
                        .setTitle('✅ Верификация')
                        .setDescription(`${username} привязал Discord аккаунт`)
                        .setTimestamp();

                    await logChannel.send({ embeds: [embed] });
                }
            } catch (error) {
                verifyLogger.error(`Ошибка отправки лога: ${error.message}`);
            }
        }

        // Уведомление пользователю в ЛС
        try {
            const user = await client.users.fetch(discordId);
            if (user) {
                const embed = new EmbedBuilder()
                    .setColor('#76C519')
                    .setTitle('✅ Верификация успешна!')
                    .setDescription(
                        `Ваш Discord привязан к аккаунту: **${username}**\n\n` +
                        'Добро пожаловать в Resistance!\n' +
                        'Используйте `/help` для списка команд.'
                    );

                await user.send({ embeds: [embed] });
            }
        } catch (error) {
            verifyLogger.error(`Ошибка отправки ЛС: ${error.message}`);
        }

        return true;
    } catch (error) {
        verifyLogger.error(`Ошибка завершения верификации: ${error.message}`);
        return false;
    }
}

// ==================== ОЧИСТКА ИСТЕКШИХ КОДОВ ====================
function cleanupExpiredCodes(db) {
    try {
        const result = db.run(
            "UPDATE verification_codes SET is_active = 0 WHERE is_active = 1 AND expires_at < datetime('now')"
        );
        if (result.changes > 0) {
            verifyLogger.debug(`Очищено истекших кодов: ${result.changes}`);
        }
    } catch (error) {
        verifyLogger.error(`Ошибка очистки кодов: ${error.message}`);
    }
}

// ==================== СБРОС ПОПЫТОК ====================
function resetAttempts(discordId) {
    const key = `verify_${discordId}`;
    attemptCache.delete(key);
}

// ==================== СТАТИСТИКА ВЕРИФИКАЦИИ ====================
function getVerificationStats(db) {
    const totalCodes = db.all('SELECT COUNT(*) as count FROM verification_codes')[0]?.count || 0;
    const activeCodes = db.all(
        "SELECT COUNT(*) as count FROM verification_codes WHERE is_active = 1 AND expires_at > datetime('now')"
    )[0]?.count || 0;
    const verifiedMembers = db.all(
        'SELECT COUNT(*) as count FROM members WHERE discord_verified = 1'
    )[0]?.count || 0;

    return {
        totalCodesGenerated: totalCodes,
        activeCodes,
        verifiedMembers,
        pendingVerifications: activeCodes,
    };
}

// ==================== ПЕРИОДИЧЕСКАЯ ОЧИСТКА ====================
let cleanupInterval = null;

function startPeriodicCleanup(db, intervalMs = 300000) {
    if (cleanupInterval) clearInterval(cleanupInterval);

    cleanupInterval = setInterval(() => {
        cleanupExpiredCodes(db);

        // Очистка кэша попыток
        const now = Date.now();
        for (const [key, data] of attemptCache) {
            data.attempts = data.attempts.filter(t => now - t < 3600000);
            if (data.attempts.length === 0 && (!data.blockedUntil || data.blockedUntil < now)) {
                attemptCache.delete(key);
            }
        }
    }, intervalMs);

    verifyLogger.info('Периодическая очистка верификации запущена');
}

function stopPeriodicCleanup() {
    if (cleanupInterval) {
        clearInterval(cleanupInterval);
        cleanupInterval = null;
    }
}

// ==================== ЭКСПОРТ ====================
module.exports = {
    generateVerificationCode,
    createVerificationPanel,
    handleVerificationButton,
    completeVerification,
    cleanupExpiredCodes,
    resetAttempts,
    getVerificationStats,
    startPeriodicCleanup,
    stopPeriodicCleanup,
    checkRateLimit,
    CODE_EXPIRY_MINUTES,
    MAX_ATTEMPTS_PER_HOUR,
};