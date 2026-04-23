    // src/minecraft/commands/ministry.js
    // Команды для министров города Resistance (с Discord интеграцией)

    const utils = require('../../shared/utils');
    const cleanNickname = global.cleanNick(nick);

    // ============================================
    // ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
    // ============================================


    async function sendMessage(bot, target, message) {
        bot.chat(`/msg ${target} ${message}`);
        await utils.sleep(400);
    }

    async function sendClanMessage(bot, message) {
        bot.chat(`/cc ${message}`);
        await utils.sleep(300);
    }

    // Отправка сообщения о необходимости использовать Discord
    async function sendDiscordRedirect(bot, sender, commandName) {
        const discordLink = process.env.DISCORD_INVITE_LINK || 'https://discord.gg/resistance';
        await sendMessage(bot, sender, `&e&l|&f Для использования команды &e/${commandName} &fперейдите в Discord сервер Resistance`);
        await sendMessage(bot, sender, `&7&l|&f Ссылка: &e${discordLink}`);
        await sendMessage(bot, sender, `&7&l|&f В Discord доступна полная информация и статистика`);
    }

    // Проверка ролей министров
    async function isEconomyMinister(nick, db) {
        const cleanNickname = cleanNick(nick);
        const profile = await db.getRPProfile(cleanNickname);
        if (!profile || profile.structure !== 'government') return false;
        return profile.job_rank === 'Министр Экономики';
    }

    async function isDefenseMinister(nick, db) {
        const cleanNickname = cleanNick(nick);
        const profile = await db.getRPProfile(cleanNickname);
        if (!profile || profile.structure !== 'government') return false;
        return profile.job_rank === 'Министр Обороны';
    }

    async function isMvdMinister(nick, db) {
        const cleanNickname = cleanNick(nick);
        const profile = await db.getRPProfile(cleanNickname);
        if (!profile || profile.structure !== 'government') return false;
        return profile.job_rank === 'Министр Внутренних дел';
    }

    async function isHealthMinister(nick, db) {
        const cleanNickname = cleanNick(nick);
        const profile = await db.getRPProfile(cleanNickname);
        if (!profile || profile.structure !== 'government') return false;
        return profile.job_rank === 'Министр Здравоохранения';
    }

    async function isEducationMinister(nick, db) {
        const cleanNickname = cleanNick(nick);
        const profile = await db.getRPProfile(cleanNickname);
        if (!profile || profile.structure !== 'government') return false;
        return profile.job_rank === 'Министр Образования';
    }

    async function isMayor(nick, db) {
        const cleanNickname = cleanNick(nick);
        const profile = await db.getRPProfile(cleanNickname);
        if (!profile || profile.structure !== 'government') return false;
        return profile.job_rank === 'Мэр';
    }

    // ============================================
    // МИНИСТР ЭКОНОМИКИ
    // ============================================

    // /org/o tax set [тип] [ставка] - Установить налог
    async function taxSet(bot, sender, args, db, addLog) {
        if (!await isEconomyMinister(sender, db)) {
            await sendMessage(bot, sender, `&4&l|&c Только Министр Экономики может использовать эту команду!`);
            return;
        }
        
        if (args.length < 2) {
            await sendMessage(bot, sender, `&4&l|&c Использование: &e/org/o tax set [тип] [ставка]`);
            await sendMessage(bot, sender, `&7&l|&f Типы: &eproperty, business, office`);
            return;
        }
        
        const type = args[0].toLowerCase();
        const rate = parseFloat(args[1]);
        
        if (isNaN(rate) || rate < 0 || rate > 100) {
            await sendMessage(bot, sender, `&4&l|&c Ставка должна быть от 0 до 100%`);
            return;
        }
        
        const settingKey = `${type}_tax_rate`;
        await db.setSetting(settingKey, (rate / 100).toString(), sender);
        
        await sendMessage(bot, sender, `&a&l|&f Налог на &e${type} &aустановлен на &e${rate}%`);
        await sendClanMessage(bot, `&a💰 Министр экономики ${sender} установил налог на ${type} ${rate}%`);
        
        if (addLog) addLog(`💰 ${sender} установил налог ${type} ${rate}%`, 'info');
    }

    // /org/o tax list - Список налогов (→ Discord)
    async function taxList(bot, sender, args, db) {
        if (!await isEconomyMinister(sender, db)) {
            await sendMessage(bot, sender, `&4&l|&c Только Министр Экономики может использовать эту команду!`);
            return;
        }
        
        // Отправляем в Discord
        await sendDiscordRedirect(bot, sender, 'org/o tax list');
    }

    // /org/o budget - Бюджет города (→ Discord)
    async function budget(bot, sender, args, db) {
        if (!await isEconomyMinister(sender, db)) {
            await sendMessage(bot, sender, `&4&l|&c Только Министр Экономики может использовать эту команду!`);
            return;
        }
        
        // Отправляем в Discord
        await sendDiscordRedirect(bot, sender, 'org/o budget');
    }

    // /org/o bonus [процент] - Установить бонус к зарплатам
    async function bonus(bot, sender, args, db, addLog) {
        if (!await isEconomyMinister(sender, db)) {
            await sendMessage(bot, sender, `&4&l|&c Только Министр Экономики может использовать эту команду!`);
            return;
        }
        
        if (args.length < 1) {
            const currentBonus = await db.getSetting('salary_bonus') || 0;
            await sendMessage(bot, sender, `&a&l|&f Текущий бонус к зарплатам: &e${currentBonus}%`);
            return;
        }
        
        const percent = parseInt(args[0]);
        if (isNaN(percent) || percent < 0 || percent > 100) {
            await sendMessage(bot, sender, `&4&l|&c Процент должен быть от 0 до 100`);
            return;
        }
        
        await db.setSetting('salary_bonus', percent.toString(), sender);
        
        await sendMessage(bot, sender, `&a&l|&f Бонус к зарплатам установлен на &e${percent}%`);
        await sendClanMessage(bot, `&a💰 Министр экономики ${sender} установил бонус к зарплатам ${percent}%`);
        
        if (addLog) addLog(`💰 ${sender} установил бонус зарплат ${percent}%`, 'info');
    }

    // /org/o grant [ник] [сумма] [причина] - Выдать грант
    async function grant(bot, sender, args, db, addLog) {
        if (!await isEconomyMinister(sender, db)) {
            await sendMessage(bot, sender, `&4&l|&c Только Министр Экономики может использовать эту команду!`);
            return;
        }
        
        if (args.length < 3) {
            await sendMessage(bot, sender, `&4&l|&c Использование: &e/org/o grant [ник] [сумма] [причина]`);
            return;
        }
        
        const target = args[0];
        const amount = parseInt(args[1]);
        const reason = args.slice(2).join(' ');
        const cleanTarget = cleanNick(target);
        
        if (isNaN(amount) || amount <= 0) {
            await sendMessage(bot, sender, `&4&l|&c Укажите корректную сумму!`);
            return;
        }
        
        const cityBudget = parseInt(await db.getSetting('city_budget') || 10000000);
        if (cityBudget < amount) {
            await sendMessage(bot, sender, `&4&l|&c Недостаточно средств в бюджете города!`);
            return;
        }
        
        const targetProfile = await db.getRPProfile(cleanTarget);
        if (!targetProfile) {
            await sendMessage(bot, sender, `&4&l|&c Игрок &e${target} &cне зарегистрирован в RolePlay!`);
            return;
        }
        
        await db.setSetting('city_budget', (cityBudget - amount).toString(), sender);
        await db.updateMoney(cleanTarget, amount, 'grant', `Грант от правительства: ${reason}`, sender);
        
        await sendMessage(bot, sender, `&a&l|&f Выдан грант &e${amount.toLocaleString()}₽ &aигроку &e${target}`);
        await sendMessage(bot, target, `&a&l|&f Вы получили грант &e${amount.toLocaleString()}₽ &aот правительства. Причина: &e${reason}`);
        await sendClanMessage(bot, `&a💰 &e${target} &aполучил грант ${amount.toLocaleString()}₽ от правительства`);
        
        if (addLog) addLog(`💰 ${sender} выдал грант ${amount} ${target} (${reason})`, 'info');
    }

    // /org/o id set [id] [цена] - Изменить цену имущества
    async function idSet(bot, sender, args, db, addLog) {
        if (!await isEconomyMinister(sender, db)) {
            await sendMessage(bot, sender, `&4&l|&c Только Министр Экономики может использовать эту команду!`);
            return;
        }
        
        if (args.length < 2) {
            await sendMessage(bot, sender, `&4&l|&c Использование: &e/org/o id set [id] [цена]`);
            return;
        }
        
        const propertyId = args[0];
        const price = parseInt(args[1]);
        
        if (isNaN(price) || price <= 0) {
            await sendMessage(bot, sender, `&4&l|&c Укажите корректную цену!`);
            return;
        }
        
        const property = await db.getProperty(propertyId);
        if (!property) {
            await sendMessage(bot, sender, `&4&l|&c Имущество с ID &e${propertyId} &cне найдено`);
            return;
        }
        
        await db.run(`UPDATE property SET price = ? WHERE id = ?`, [price, propertyId]);
        
        await sendMessage(bot, sender, `&a&l|&f Цена имущества #&e${propertyId} &aизменена на &e${price.toLocaleString()}₽`);
        await sendClanMessage(bot, `&a💰 Министр экономики ${sender} изменил цену имущества #${propertyId}`);
        
        if (addLog) addLog(`💰 ${sender} изменил цену имущества #${propertyId} на ${price}`, 'info');
    }

    // /org/o im [ник] [id] - Забрать имущество
    async function imTake(bot, sender, args, db, addLog) {
        if (!await isEconomyMinister(sender, db)) {
            await sendMessage(bot, sender, `&4&l|&c Только Министр Экономики может использовать эту команду!`);
            return;
        }
        
        if (args.length < 2) {
            await sendMessage(bot, sender, `&4&l|&c Использование: &e/org/o im [ник] [id]`);
            return;
        }
        
        const target = args[0];
        const propertyId = args[1];
        const cleanTarget = cleanNick(target);
        
        const property = await db.getProperty(propertyId);
        if (!property || property.owner_nick !== cleanTarget) {
            await sendMessage(bot, sender, `&4&l|&c Игрок &e${target} &cне владеет имуществом #&e${propertyId}`);
            return;
        }
        
        await db.run(`UPDATE property SET owner_nick = NULL, is_available = 1, co_owner1 = NULL, co_owner2 = NULL WHERE id = ?`, [propertyId]);
        
        const regionName = `TRTR${propertyId}`;
        bot.chat(`/rg removemember ${regionName} ${cleanTarget}`);
        
        await sendMessage(bot, sender, `&a&l|&f Имущество #&e${propertyId} &aизъято у &e${target}`);
        await sendMessage(bot, target, `&c&l|&f У вас изъято имущество #&e${propertyId} &cправительством`);
        await sendClanMessage(bot, `&c🏠 Имущество #${propertyId} изъято у ${target} правительством`);
        
        if (addLog) addLog(`🏠 ${sender} изъял имущество #${propertyId} у ${target}`, 'warn');
    }
    // ============================================
    // МИНИСТР ОБОРОНЫ
    // ============================================

    // /org/o defense - Бюджет обороны (→ Discord)
    async function defenseBudget(bot, sender, args, db) {
        if (!await isDefenseMinister(sender, db)) {
            await sendMessage(bot, sender, `&4&l|&c Только Министр Обороны может использовать эту команду!`);
            return;
        }
        
        // Отправляем в Discord
        await sendDiscordRedirect(bot, sender, 'org/o defense');
    }

    // /org/o armystatus - Статус армии (→ Discord)
    async function armyStatus(bot, sender, args, db) {
        if (!await isDefenseMinister(sender, db)) {
            await sendMessage(bot, sender, `&4&l|&c Только Министр Обороны может использовать эту команду!`);
            return;
        }
        
        // Отправляем в Discord
        await sendDiscordRedirect(bot, sender, 'org/o armystatus');
    }

    // ============================================
    // МИНИСТР МВД
    // ============================================

    // /org/o mvdbudget - Бюджет МВД (→ Discord)
    async function mvdBudget(bot, sender, args, db) {
        if (!await isMvdMinister(sender, db)) {
            await sendMessage(bot, sender, `&4&l|&c Только Министр МВД может использовать эту команду!`);
            return;
        }
        
        // Отправляем в Discord
        await sendDiscordRedirect(bot, sender, 'org/o mvdbudget');
    }

    // /org/o mvdstatus - Статус МВД (→ Discord)
    async function mvdStatus(bot, sender, args, db) {
        if (!await isMvdMinister(sender, db)) {
            await sendMessage(bot, sender, `&4&l|&c Только Министр МВД может использовать эту команду!`);
            return;
        }
        
        // Отправляем в Discord
        await sendDiscordRedirect(bot, sender, 'org/o mvdstatus');
    }

    // /org/o crimelist - Список нарушений (→ Discord)
    async function crimeList(bot, sender, args, db) {
        if (!await isMvdMinister(sender, db)) {
            await sendMessage(bot, sender, `&4&l|&c Только Министр МВД может использовать эту команду!`);
            return;
        }
        
        // Отправляем в Discord
        await sendDiscordRedirect(bot, sender, 'org/o crimelist');
    }

    // ============================================
    // МИНИСТР ЗДРАВООХРАНЕНИЯ
    // ============================================

    // /org/o healthbudget - Бюджет здравоохранения (→ Discord)
    async function healthBudget(bot, sender, args, db) {
        if (!await isHealthMinister(sender, db)) {
            await sendMessage(bot, sender, `&4&l|&c Только Министр Здравоохранения может использовать эту команду!`);
            return;
        }
        
        // Отправляем в Discord
        await sendDiscordRedirect(bot, sender, 'org/o healthbudget');
    }

    // /org/o hospitalstatus - Статус больницы (→ Discord)
    async function hospitalStatus(bot, sender, args, db) {
        if (!await isHealthMinister(sender, db)) {
            await sendMessage(bot, sender, `&4&l|&c Только Министр Здравоохранения может использовать эту команду!`);
            return;
        }
        
        // Отправляем в Discord
        await sendDiscordRedirect(bot, sender, 'org/o hospitalstatus');
    }
    // ============================================
    // МИНИСТР ОБРАЗОВАНИЯ
    // ============================================

    // /org/o edubudget - Бюджет образования (→ Discord)
    async function eduBudget(bot, sender, args, db) {
        if (!await isEducationMinister(sender, db)) {
            await sendMessage(bot, sender, `&4&l|&c Только Министр Образования может использовать эту команду!`);
            return;
        }
        
        // Отправляем в Discord
        await sendDiscordRedirect(bot, sender, 'org/o edubudget');
    }

    // /org/o academystatus - Статус академии (→ Discord)
    async function academyStatus(bot, sender, args, db) {
        if (!await isEducationMinister(sender, db)) {
            await sendMessage(bot, sender, `&4&l|&c Только Министр Образования может использовать эту команду!`);
            return;
        }
        
        // Отправляем в Discord
        await sendDiscordRedirect(bot, sender, 'org/o academystatus');
    }

    // ============================================
    // МЭР ГОРОДА
    // ============================================

    // /org/o mayorkick [ник] [причина] - Изгнать из города
    async function mayorKick(bot, sender, args, db, addLog) {
        if (!await isMayor(sender, db)) {
            await sendMessage(bot, sender, `&4&l|&c Только Мэр может использовать эту команду!`);
            return;
        }
        
        if (args.length < 1) {
            await sendMessage(bot, sender, `&4&l|&c Использование: &e/org/o mayorkick [ник] [причина]`);
            return;
        }
        
        const target = args[0];
        const reason = args.slice(1).join(' ') || 'Не указана';
        const cleanTarget = cleanNick(target);
        
        const targetProfile = await db.getRPProfile(cleanTarget);
        if (!targetProfile) {
            await sendMessage(bot, sender, `&4&l|&c Игрок &e${target} &cне зарегистрирован в RolePlay!`);
            return;
        }
        
        await db.removeClanMember(cleanTarget);
        await db.run(`UPDATE rp_players SET 
            structure = 'Гражданин', 
            job_rank = 'Нет', 
            is_frozen = 1, 
            warnings = 0,
            on_duty = 0
            WHERE LOWER(minecraft_nick) = LOWER(?)`, [cleanTarget]);
        
        await db.run(`DELETE FROM org_members WHERE LOWER(minecraft_nick) = LOWER(?)`, [cleanTarget]);
        
        await sendMessage(bot, sender, `&a&l|&f Игрок &e${target} &aизгнан из города Resistance`);
        await sendMessage(bot, target, `&c&l|&f Вы изгнаны из города Resistance. Причина: &e${reason}`);
        await sendClanMessage(bot, `&c👑 &e${target} &cизгнан из города мэром ${sender}`);
        
        if (addLog) addLog(`👑 ${sender} изгнал ${target} из города (${reason})`, 'warn');
    }

    // /org/o cityinfo - Информация о городе (→ Discord)
    async function cityInfo(bot, sender, args, db) {
        if (!await isMayor(sender, db)) {
            await sendMessage(bot, sender, `&4&l|&c Только Мэр может использовать эту команду!`);
            return;
        }
        
        // Отправляем в Discord
        await sendDiscordRedirect(bot, sender, 'org/o cityinfo');
    }

    // /org/o setbudget [сумма] - Установить бюджет города
    async function setBudget(bot, sender, args, db, addLog) {
        if (!await isMayor(sender, db)) {
            await sendMessage(bot, sender, `&4&l|&c Только Мэр может использовать эту команду!`);
            return;
        }
        
        if (args.length < 1) {
            await sendMessage(bot, sender, `&4&l|&c Использование: &e/org/o setbudget [сумма]`);
            return;
        }
        
        const amount = parseInt(args[0]);
        if (isNaN(amount) || amount < 0) {
            await sendMessage(bot, sender, `&4&l|&c Укажите корректную сумму!`);
            return;
        }
        
        await db.setSetting('city_budget', amount.toString(), sender);
        
        await sendMessage(bot, sender, `&a&l|&f Бюджет города установлен на &e${amount.toLocaleString()}₽`);
        await sendClanMessage(bot, `&a💰 Мэр ${sender} установил бюджет города ${amount.toLocaleString()}₽`);
        
        if (addLog) addLog(`💰 ${sender} установил бюджет города ${amount}`, 'info');
    }

    // ============================================
    // ЭКСПОРТ ВСЕХ КОМАНД
    // ============================================

    module.exports = {
        // Министр экономики
        taxSet,
        taxList,       // → Discord
        budget,        // → Discord
        bonus,
        grant,
        idSet,
        imTake,
        
        // Министр обороны
        defenseBudget, // → Discord
        armyStatus,    // → Discord
        
        // Министр МВД
        mvdBudget,     // → Discord
        mvdStatus,     // → Discord
        crimeList,     // → Discord
        
        // Министр здравоохранения
        healthBudget,  // → Discord
        hospitalStatus,// → Discord
        
        // Министр образования
        eduBudget,     // → Discord
        academyStatus, // → Discord
        
        // Мэр
        mayorKick,
        cityInfo,      // → Discord
        setBudget
    };