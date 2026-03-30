const database = require('../../database');

const STAFF_LIMITS = {
    1: { kick: 2, mute: 20, bl: 20 },   // Мл. Модератор
    2: { kick: 5, mute: 30, bl: 30 },   // Модератор
    3: { kick: 10, mute: 40, bl: 40 },  // Ст. Модератор
    4: { kick: 25, mute: 50, bl: 70 },  // Гл. Модератор
    5: { kick: 999, mute: 999, bl: 999 }, // Куратор
    6: { kick: 999, mute: 999, bl: 999 }  // Администратор
};

async function handle(bot, nick, cmd, args, callbacks) {
    const { sendClan, sendPrivate } = callbacks;
    const db = database.getDb();
    
    // Получаем данные модератора
    const staff = await db.get("SELECT * FROM staff_stats WHERE minecraft_nick = ?", [nick]);
    if (!staff || staff.rank_level < 1) return; // Нет доступа

    const level = staff.rank_level;
    const limits = STAFF_LIMITS[level];

    // Хелпер проверки иерархии (Нельзя наказывать тех, кто выше)
    const checkHierarchy = async (target) => {
        const targetStaff = await db.get("SELECT rank_level FROM staff_stats WHERE minecraft_nick = ?", [target]);
        if (targetStaff && targetStaff.rank_level >= level && level < 5) {
            sendPrivate(nick, "&#FF0202| &#C58383Ошибка: Вы не можете наказывать персонал выше или равного вашего ранга.");
            return false;
        }
        return true;
    };

    switch (cmd) {
        case '/mute': {
            const target = args[0];
            const time = parseInt(args[1]);
            const reason = args.slice(2).join(' ');
            if (!target || isNaN(time) || !reason) return sendPrivate(nick, "Использование: /mute [ник] [мин] [причина]");
            
            if (staff.mutes_today >= limits.mute) return sendPrivate(nick, "❌ Лимит мутов на сегодня исчерпан.");
            if (!await checkHierarchy(target)) return;

            const expires = new Date(Date.now() + time * 60000).toISOString().replace('T', ' ').substring(0, 19);
            await db.run("INSERT INTO punishments (player, type, reason, issued_by, duration_minutes, expires_at) VALUES (?, 'mute', ?, ?, ?, ?)", [target, reason, nick, time, expires]);
            await db.run("UPDATE staff_stats SET mutes_today = mutes_today + 1 WHERE minecraft_nick = ?", [nick]);
            
            bot.chat(`/c mute ${target} ${reason}`);
            sendClan(`&#FF0202| &#76C519${nick}&#D4D4D4 замутил &c${target}&#D4D4D4 на &e${time}м&#D4D4D4. Причина: &f${reason}`);
            break;
        }

        case '/kick': {
            const target = args[0];
            const reason = args.slice(1).join(' ') || "Нарушение правил";
            if (staff.kicks_today >= limits.kick) return sendPrivate(nick, "❌ Лимит киков исчерпан.");
            if (!await checkHierarchy(target)) return;

            await db.run("UPDATE staff_stats SET kicks_today = kicks_today + 1 WHERE minecraft_nick = ?", [nick]);
            bot.chat(`/c kick ${target}`);
            sendClan(`&#FF0202| &#76C519${nick}&#D4D4D4 исключил &c${target}&#D4D4D4 из клана. Причина: &f${reason}`);
            break;
        }

        case '/blacklist':
        case '/bl': {
            const sub = args[0]; // add/del
            const target = args[1];
            if (sub === 'add') {
                if (staff.bl_today >= limits.bl) return sendPrivate(nick, "❌ Лимит ЧС исчерпан.");
                const reason = args.slice(2).join(' ') || "ЧС Клана";
                await db.run("INSERT INTO punishments (player, type, reason, issued_by) VALUES (?, 'blacklist', ?, ?)", [target, reason, nick]);
                await db.run("UPDATE staff_stats SET bl_today = bl_today + 1 WHERE minecraft_nick = ?", [nick]);
                sendClan(`&#FF0202| &#76C519${nick}&#D4D4D4 добавил &0${target}&#D4D4D4 в Чёрный Список клана.`);
            } else if (sub === 'del') {
                await db.run("UPDATE punishments SET active = 0 WHERE player = ? AND type = 'blacklist'", [target]);
                sendClan(`&#76C519| &#D4D4D4Модератор ${nick} вынес ${target} из Чёрного Списка.`);
            }
            break;
        }

        case '/admin':
        case '/a': {
            if (level < 5) return; // Только Куратор+
            const sub = args[0]; // add/del
            const target = args[1];
            const roleLvl = parseInt(args[2]); // 1-6
            if (sub === 'add') {
                if (roleLvl === 6 && level < 6) return sendPrivate(nick, "Только Админ может назначать Админов.");
                await db.run("INSERT OR REPLACE INTO staff_stats (minecraft_nick, rank_level) VALUES (?, ?)", [target, roleLvl]);
                sendPrivate(nick, `✅ Игроку ${target} выдана роль персонала уровня ${roleLvl}`);
            }
            break;
        }

        case '/awarn': {
            if (level < 3) return; // От Ст. Модератора
            const target = args[1];
            if (args[0] === 'add') {
                await db.run("UPDATE staff_stats SET awarns = awarns + 1 WHERE minecraft_nick = ?", [target]);
                const data = await db.get("SELECT awarns FROM staff_stats WHERE minecraft_nick = ?", [target]);
                if (data.awarns >= 3) {
                    await db.run("DELETE FROM staff_stats WHERE minecraft_nick = ?", [target]);
                    sendClan(`&#FF0202| ⚠️ Персонал ${target} снят с должности за 3/3 выговоров!`);
                } else {
                    sendClan(`&#FFB10C| ⚠️ ${target} получил выговор персоналу (${data.awarns}/3).`);
                }
            }
            break;
        }
    }
}

module.exports = { handle };