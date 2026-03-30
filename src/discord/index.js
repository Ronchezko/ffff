// src/discord/index.js
const { Client, GatewayIntentBits, EmbedBuilder, REST, Routes, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const logger = require('../shared/logger');
const database = require('../database');
const verification = require('./verification');

let client = null;
let verificationCooldowns = new Map();

async function start(db) {
    client = new Client({ 
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.MessageContent,
            GatewayIntentBits.DirectMessages,
            GatewayIntentBits.GuildMembers
        ] 
    });
    
    client.once('ready', async () => {
        logger.success(`🤖 Discord бот ${client.user.tag} запущен`);
        await registerCommands();
        startReminders();
        startStaffReset();
    });
    
    client.on('interactionCreate', async (interaction) => {
        if (interaction.isCommand()) await handleCommand(interaction);
        else if (interaction.isButton()) await handleButton(interaction);
    });
    
    client.on('messageCreate', async (message) => {
        if (message.author.bot) return;
        if (message.channel.type === 1) await verification.handleDirectMessage(message, db, client);
    });
    
    await client.login(process.env.DISCORD_TOKEN);
    return client;
}

async function registerCommands() {
    const commands = [
        { name: 'balance', description: 'Показать баланс игрока', options: [{ name: 'игрок', description: 'Никнейм игрока', type: 3, required: false }] },
        { name: 'pass', description: 'Показать паспорт игрока', options: [{ name: 'игрок', description: 'Никнейм игрока', type: 3, required: false }] },
        { name: 'verify', description: 'Привязать Minecraft аккаунт' },
        { name: 'stats', description: 'Статистика сервера' },
        { name: 'profile', description: 'Показать ваш профиль' },
        { name: 'top', description: 'Топ игроков', options: [{ name: 'категория', description: 'Категория топа', type: 3, required: false, choices: [{ name: 'Убийства', value: 'kills' }, { name: 'Баланс', value: 'money' }, { name: 'Время', value: 'hours' }] }] },
        { name: 'pay', description: 'Перевести деньги', options: [{ name: 'игрок', description: 'Никнейм получателя', type: 3, required: true }, { name: 'сумма', description: 'Сумма перевода', type: 4, required: true }] },
        { name: 'org', description: 'Информация об организации', options: [{ name: 'название', description: 'Название организации', type: 3, required: false }] },
        { name: 'fly', description: 'Активировать полёт (кд 2 минуты)' },
        { name: '10t', description: 'Получить 10 000 ₽ (кд 5 минут)' },
        { name: 'id', description: 'Показать ваш ID в базе данных' },
        { name: 'staff', description: 'Управление персоналом', options: [{ name: 'действие', description: 'Действие', type: 3, required: true, choices: [{ name: 'Список', value: 'list' }] }] },
        { name: 'punish', description: 'Наложить наказание', options: [
            { name: 'тип', description: 'Тип наказания', type: 3, required: true, choices: [{ name: 'Мут', value: 'mute' }, { name: 'Кик', value: 'kick' }, { name: 'ЧС', value: 'blacklist' }] },
            { name: 'игрок', description: 'Никнейм игрока', type: 3, required: true },
            { name: 'время', description: 'Длительность (30m, 2h, 1d)', type: 3, required: false },
            { name: 'причина', description: 'Причина наказания', type: 3, required: false }
        ] }
    ];

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try { await rest.put(Routes.applicationCommands(process.env.DISCORD_CLIENT_ID), { body: commands }); logger.info('📝 Команды Discord зарегистрированы'); }
    catch (error) { logger.error('Ошибка регистрации команд:', error); }
}

async function handleCommand(interaction) {
    const { commandName, options, user } = interaction;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    
    try {
        // Ищем игрока по discord_id в базе данных
        const db = database.getDb();
        let member = null;
        let rpPlayer = null;
        let staffRank = null;
        
        // Сначала ищем по discord_id
        const memberByDiscord = db.prepare('SELECT * FROM clan_members WHERE discord_id = ?').get(user.id);
        if (memberByDiscord) {
            member = memberByDiscord;
            rpPlayer = db.prepare('SELECT * FROM rp_players WHERE minecraft_nick = ?').get(member.minecraft_nick);
        }
        
        staffRank = await database.getStaffRank(member?.minecraft_nick || user.username);
        
        // ========== BALANCE ==========
        if (commandName === 'balance') {
            const playerName = options.getString('игрок');
            
            if (playerName) {
                // Поиск по указанному нику
                const targetMember = db.prepare('SELECT * FROM clan_members WHERE minecraft_nick = ?').get(playerName);
                if (!targetMember) return await interaction.editReply(`❌ Игрок ${playerName} не найден`);
                const targetRp = db.prepare('SELECT * FROM rp_players WHERE minecraft_nick = ?').get(playerName);
                if (targetRp) {
                    const embed = new EmbedBuilder().setColor(0x6b46c1).setTitle(`💰 Баланс ${playerName}`).setDescription(`${targetRp.money.toLocaleString()} ₽`);
                    await interaction.editReply({ embeds: [embed] });
                } else {
                    await interaction.editReply(`ℹ️ ${playerName} не в RolePlay`);
                }
            } else {
                // Свой баланс
                if (!member) return await interaction.editReply('❌ Ваш Discord не привязан. Используйте /verify');
                if (!rpPlayer) return await interaction.editReply('❌ Вы не в RolePlay. Используйте /rp в игре');
                const embed = new EmbedBuilder().setColor(0x6b46c1).setTitle(`💰 Ваш баланс`).setDescription(`${rpPlayer.money.toLocaleString()} ₽`);
                await interaction.editReply({ embeds: [embed] });
            }
        }
        
        // ========== PASS ==========
        else if (commandName === 'pass') {
            const playerName = options.getString('игрок');
            
            if (playerName) {
                const targetMember = db.prepare('SELECT * FROM clan_members WHERE minecraft_nick = ?').get(playerName);
                if (!targetMember) return await interaction.editReply(`❌ Игрок ${playerName} не найден`);
                const targetRp = db.prepare('SELECT * FROM rp_players WHERE minecraft_nick = ?').get(playerName);
                const embed = new EmbedBuilder().setColor(0x6b46c1).setTitle(`📋 Паспорт: ${playerName}`)
                    .addFields(
                        { name: 'Ранг', value: targetMember.rank, inline: true },
                        { name: 'RolePlay', value: targetRp ? '✅ Активен' : '❌ Не активен', inline: true },
                        { name: 'Убийства/Смерти', value: `${targetMember.kills}/${targetMember.deaths}`, inline: true }
                    );
                if (targetRp) {
                    embed.addFields(
                        { name: 'Баланс', value: `${targetRp.money.toLocaleString()} ₽`, inline: true },
                        { name: 'Структура', value: targetRp.structure || 'Нет', inline: true },
                        { name: 'Баллы', value: targetRp.unique_points?.toString() || '0', inline: true }
                    );
                }
                await interaction.editReply({ embeds: [embed] });
            } else {
                // Свой паспорт
                if (!member) return await interaction.editReply('❌ Ваш Discord не привязан. Используйте /verify');
                const embed = new EmbedBuilder().setColor(0x6b46c1).setTitle(`📋 Ваш паспорт`)
                    .addFields(
                        { name: 'Никнейм', value: member.minecraft_nick, inline: true },
                        { name: 'Ранг', value: member.rank, inline: true },
                        { name: 'Убийства/Смерти', value: `${member.kills}/${member.deaths}`, inline: true }
                    );
                if (rpPlayer) {
                    embed.addFields(
                        { name: 'Баланс', value: `${rpPlayer.money.toLocaleString()} ₽`, inline: true },
                        { name: 'Структура', value: rpPlayer.structure || 'Нет', inline: true },
                        { name: 'Баллы', value: rpPlayer.unique_points?.toString() || '0', inline: true }
                    );
                } else {
                    embed.addFields({ name: 'RolePlay', value: '❌ Не зарегистрирован. Используйте /rp в игре', inline: true });
                }
                await interaction.editReply({ embeds: [embed] });
            }
        }
        
        // ========== PROFILE ==========
        else if (commandName === 'profile') {
            if (!member) {
                const embed = new EmbedBuilder().setColor(0xff4757).setTitle('❌ Профиль не найден')
                    .setDescription(`Ваш Discord **${user.username}** не привязан к Minecraft аккаунту.\nИспользуйте команду \`/verify\` для привязки.`);
                return await interaction.editReply({ embeds: [embed] });
            }
            const embed = new EmbedBuilder().setColor(0x6b46c1).setTitle(`📋 Профиль ${member.minecraft_nick}`)
                .setThumbnail(`https://mc-heads.net/avatar/${member.minecraft_nick}/100`)
                .addFields(
                    { name: 'Ранг в клане', value: member.rank, inline: true },
                    { name: 'ID игрока', value: `#${member.id}`, inline: true },
                    { name: 'В клане с', value: new Date(member.joined_at).toLocaleDateString('ru-RU'), inline: true },
                    { name: 'Статистика', value: `⚔️ ${member.kills} убийств\n💀 ${member.deaths} смертей`, inline: true }
                );
            if (rpPlayer) {
                embed.addFields(
                    { name: '💰 RolePlay', value: `Баланс: ${rpPlayer.money.toLocaleString()} ₽\nСтруктура: ${rpPlayer.structure || 'нет'}\nЗвание: ${rpPlayer.organization_rank || 'нет'}\nБаллы: ${rpPlayer.unique_points || 0}`, inline: true }
                );
            } else {
                embed.addFields({ name: '🎭 RolePlay', value: '❌ Не зарегистрирован. Используйте `/rp` в игре.', inline: true });
            }
            await interaction.editReply({ embeds: [embed] });
        }
        
        // ========== PAY ==========
        else if (commandName === 'pay') {
            const target = options.getString('игрок');
            const amount = options.getInteger('сумма');
            
            if (!member) return await interaction.editReply('❌ Ваш Discord не привязан. Используйте /verify');
            if (!rpPlayer) return await interaction.editReply('❌ Вы не в RolePlay. Используйте /rp в игре');
            
            const receiver = db.prepare('SELECT * FROM rp_players WHERE minecraft_nick = ?').get(target);
            if (!receiver) return await interaction.editReply(`❌ Игрок ${target} не в RolePlay`);
            if (amount <= 0 || amount > 50000) return await interaction.editReply('❌ Сумма от 1 до 50 000 ₽');
            if (rpPlayer.money < amount) return await interaction.editReply(`❌ Недостаточно. Баланс: ${rpPlayer.money.toLocaleString()} ₽`);
            
            await database.updatePlayerMoney(member.minecraft_nick, -amount, `Перевод ${target}`, user.username);
            await database.updatePlayerMoney(target, amount, `Перевод от ${member.minecraft_nick}`, user.username);
            await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x00d25b).setTitle('✅ Перевод').setDescription(`${amount.toLocaleString()} ₽ → ${target}`)] });
        }
        
        // ========== VERIFY ==========
        else if (commandName === 'verify') {
            const existing = member;
            if (existing) {
                const embed = new EmbedBuilder().setColor(0xffaa00).setTitle('⚠️ Уже привязан')
                    .setDescription(`Ваш Discord уже привязан к Minecraft аккаунту **${existing.minecraft_nick}**.\nЕсли хотите перепривязать, обратитесь к администратору.`);
                return await interaction.editReply({ embeds: [embed] });
            }
            
            const cooldown = verificationCooldowns.get(user.id);
            if (cooldown && cooldown > Date.now()) {
                const remaining = Math.ceil((cooldown - Date.now()) / 1000);
                const embed = new EmbedBuilder().setColor(0xffaa00).setTitle('⏳ Подождите')
                    .setDescription(`Вы уже запрашивали код верификации. Попробуйте через ${remaining} секунд.`);
                return await interaction.editReply({ embeds: [embed] });
            }
            
            await verification.startVerification(interaction, database);
            verificationCooldowns.set(user.id, Date.now() + 300000);
            setTimeout(() => verificationCooldowns.delete(user.id), 300000);
        }
        
        // ========== STATS ==========
        else if (commandName === 'stats') {
            const db = database.getDb();
            const clan = db.prepare('SELECT COUNT(*) as c FROM clan_members').get().c;
            const rp = db.prepare('SELECT COUNT(*) as c FROM rp_players').get().c;
            const staff = db.prepare('SELECT COUNT(*) as c FROM staff').get().c;
            const embed = new EmbedBuilder().setColor(0x6b46c1).setTitle('📊 Статистика сервера')
                .addFields(
                    { name: '👥 Участников клана', value: clan.toString(), inline: true },
                    { name: '🎭 RolePlay игроков', value: rp.toString(), inline: true },
                    { name: '🛡️ Персонал', value: staff.toString(), inline: true }
                );
            await interaction.editReply({ embeds: [embed] });
        }
        
        // ========== TOP ==========
        else if (commandName === 'top') {
            const category = options.getString('категория') || 'kills';
            const db = database.getDb();
            let data = [], title = '';
            if (category === 'kills') { data = db.prepare('SELECT minecraft_nick, kills FROM clan_members ORDER BY kills DESC LIMIT 10').all(); title = '⚔️ Топ по убийствам'; }
            else if (category === 'money') { data = db.prepare('SELECT minecraft_nick, money FROM rp_players ORDER BY money DESC LIMIT 10').all(); title = '💰 Топ по балансу'; }
            else { data = db.prepare('SELECT minecraft_nick, total_hours FROM clan_members ORDER BY total_hours DESC LIMIT 10').all(); title = '⏳ Топ по времени'; }
            if (!data.length) return await interaction.editReply('📊 Нет данных');
            let desc = '';
            data.forEach((p, i) => { const val = category === 'money' ? `${p.money.toLocaleString()} ₽` : p[category]; desc += `${i+1}. **${p.minecraft_nick}** — ${val}\n`; });
            await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x6b46c1).setTitle(title).setDescription(desc)] });
        }
        

        
        // ========== ORG ==========
        else if (commandName === 'org') {
            const orgName = options.getString('название') || (rpPlayer?.structure || 'Полиция');
            const orgs = ['Полиция', 'Армия', 'Больница', 'Академия', 'Мэрия'];
            if (!orgs.includes(orgName)) return await interaction.editReply(`❌ Организация не найдена. Доступны: ${orgs.join(', ')}`);
            
            const db = database.getDb();
            const members = db.prepare('SELECT minecraft_nick, organization_rank FROM rp_players WHERE structure = ?').all(orgName);
            const budget = db.prepare('SELECT balance FROM org_budgets WHERE structure = ?').get(orgName);
            const onDuty = db.prepare('SELECT COUNT(*) as cnt FROM structure_members WHERE structure = ? AND on_duty = 1').get(orgName);
            
            const embed = new EmbedBuilder().setColor(0x6b46c1).setTitle(`🏛️ ${orgName}`)
                .addFields(
                    { name: '👥 Сотрудников', value: members.length.toString(), inline: true },
                    { name: '💰 Бюджет', value: `${(budget?.balance || 0).toLocaleString()} ₽`, inline: true },
                    { name: '🕒 На дежурстве', value: (onDuty?.cnt || 0).toString(), inline: true }
                );
            
            if (members.length > 0) {
                let memberList = '';
                members.slice(0, 15).forEach(m => {
                    memberList += `**${m.organization_rank || 'Участник'}** — ${m.minecraft_nick}\n`;
                });
                if (members.length > 15) memberList += `\n... и ещё ${members.length - 15}`;
                embed.addFields({ name: '📋 Сотрудники', value: memberList || 'Нет данных' });
            }
            await interaction.editReply({ embeds: [embed] });
        }
        
        // ========== FLY ==========
        else if (commandName === 'fly') {
            if (!member) return await interaction.editReply('❌ Ваш Discord не привязан. Используйте /verify');
            if (!global.flyCooldown) global.flyCooldown = 0;
            const now = Date.now();
            if (now < global.flyCooldown) {
                const remaining = Math.ceil((global.flyCooldown - now) / 1000);
                return await interaction.editReply(`⏳ Команда /fly доступна раз в 2 минуты. Подождите ${remaining} сек.`);
            }
            global.flyCooldown = now + 120000;
            
            if (global.botComponents?.minecraft?.chat) {
                global.botComponents.minecraft.chat(`/fly ${member.minecraft_nick}`);
                await interaction.editReply(`✅ Полёт активирован для **${member.minecraft_nick}**!`);
            } else {
                await interaction.editReply(`❌ Бот Minecraft не активен. Попробуйте позже.`);
            }
        }
        
        // ========== 10T ==========
        else if (commandName === '10t') {
            if (!member) return await interaction.editReply('❌ Ваш Discord не привязан. Используйте /verify');
            const rp = await database.getRPPlayer(member.minecraft_nick);
            if (!rp) return await interaction.editReply('❌ Вы не в RolePlay. Используйте /rp в игре');
            if (!global.tenTCooldown) global.tenTCooldown = 0;
            const now = Date.now();
            if (now < global.tenTCooldown) {
                const remaining = Math.ceil((global.tenTCooldown - now) / 1000);
                return await interaction.editReply(`⏳ Команда /10t доступна раз в 5 минут. Подождите ${remaining} сек.`);
            }
            global.tenTCooldown = now + 300000;
            
            await database.updatePlayerMoney(member.minecraft_nick, 10000, '/10t', 'discord');
            await interaction.editReply(`✅ Вы получили 10 000 ₽! Новый баланс: ${(rp.money + 10000).toLocaleString()} ₽`);
        }
        
        // ========== ID ==========
        else if (commandName === 'id') {
            if (!member) return await interaction.editReply('❌ Ваш Discord не привязан. Используйте /verify');
            await interaction.editReply(`🆔 Ваш ID в базе данных: **#${member.id}**`);
        }
        
        // ========== STAFF ==========
        else if (commandName === 'staff' && options.getString('действие') === 'list') {
            const staffList = database.getDb().prepare('SELECT minecraft_nick, staff_rank, total_warns FROM staff ORDER BY staff_rank').all();
            if (!staffList.length) return await interaction.editReply('📋 Персонал не назначен');
            let desc = '';
            staffList.forEach(s => desc += `**${s.minecraft_nick}** — ${s.staff_rank}${s.total_warns > 0 ? ` (⚠️ ${s.total_warns}/3)` : ''}\n`);
            await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x6b46c1).setTitle('👑 Персонал Resistance').setDescription(desc)] });
        }
        
        // ========== PUNISH ==========
        else if (commandName === 'punish') {
            const type = options.getString('тип'), target = options.getString('игрок'), duration = options.getString('время') || '30m', reason = options.getString('причина') || 'Не указана';
            if (!staffRank) return await interaction.editReply('❌ У вас нет прав');
            const match = duration.match(/^(\d+)([smhd])$/);
            if (!match) return await interaction.editReply('❌ Формат: 30m, 2h, 1d');
            const mult = { s: 1/60, m: 1, h: 60, d: 1440 };
            const minutes = parseInt(match[1]) * mult[match[2]];
            await database.addPunishment({ player: target, type, reason, issued_by: user.username, duration_minutes: minutes });
            await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xff4757).setTitle(`🔨 ${type === 'mute' ? 'Мут' : type === 'kick' ? 'Кик' : 'ЧС'}`).setDescription(`**Игрок:** ${target}\n**Причина:** ${reason}\n**Длительность:** ${duration}\n**Выдал:** ${user.username}`)] });
        }
        
        else await interaction.editReply('❌ Неизвестная команда');
    } catch (error) { logger.error(`Ошибка ${commandName}:`, error); await interaction.editReply('❌ Произошла ошибка'); }
}

async function handleButton(interaction) { if (interaction.customId === 'verify_confirm') await verification.startVerification(interaction, database); }

function startReminders() {
    setInterval(async () => {
        const expiring = database.getExpiringLicenses();
        for (const prop of expiring) {
            if (!prop.discord_id) continue;
            const user = await client.users.fetch(prop.discord_id).catch(() => null);
            if (!user) continue;
            const days = Math.ceil((new Date(prop.license_expires) - new Date()) / 86400000);
            await user.send(`⚠️ **Внимание!** Ваша лицензия на имущество **ID:${prop.id}** истекает через ${days} ${days === 1 ? 'день' : 'дня'}. Продлите лицензию в игре командой \`/renewlicense ${prop.type}\`.`);
        }
    }, 3600000);
    logger.info('📅 Напоминания о лицензиях запущены');
}

function startStaffReset() { setInterval(() => { database.resetStaffDailyCounters(); logger.info('🔄 Суточные лимиты персонала сброшены'); }, 86400000); }
function stop() { if (client) client.destroy(); }

module.exports = { start, stop }
