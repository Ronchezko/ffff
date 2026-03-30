const database = require('../../database');
const logger = require('../../shared/logger');

async function handle(bot, nick, cmd, args, callbacks) {
    const { sendClan, sendPrivate } = callbacks;
    const db = database.getDb();
    const staff = await db.get("SELECT rank_level FROM staff_stats WHERE minecraft_nick = ?", [nick]);
    const level = staff ? staff.rank_level : 0;

    // --- НАСТРОЙКИ СПАМА И РЕКЛАМЫ ---
    if (cmd === '/spam') {
        if (level < 4) return;
        const state = args[0]; // on/off
        if (!state) {
            const current = await db.get("SELECT value FROM settings WHERE key = 'auto_mod'");
            return sendPrivate(nick, `Статус авто-модерации: ${current?.value === 'true' ? 'ВКЛ' : 'ВЫКЛ'}`);
        }
        await db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('auto_mod', ?)", [state === 'on' ? 'true' : 'false']);
        sendPrivate(nick, `✅ Авто-модерация теперь: ${state.toUpperCase()}`);
    }

    if (cmd === '/r') {
        if (level < 3) return;
        const type = args[0]; // clan / chat
        const state = args[1]; // on/off
        await db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [`adv_${type}`, state === 'on' ? 'true' : 'false']);
        sendPrivate(nick, `✅ Реклама ${type} теперь: ${state.toUpperCase()}`);
    }

    // --- СИСТЕМА /ARP ---
    if (cmd === '/arp') {
        if (level < 2) return; // Минимум Модератор для /arp stats
        const sub = args[0]?.toLowerCase();

        switch (sub) {
            case 'balance': {
                if (level < 3) return;
                const type = args[1]; // set/give/reset/del
                const target = args[2];
                const sum = parseFloat(args[3]);
                if (type === 'set') await db.run("UPDATE rp_players SET money = ? WHERE minecraft_nick = ?", [sum, target]);
                if (type === 'give') await db.run("UPDATE rp_players SET money = money + ? WHERE minecraft_nick = ?", [sum, target]);
                sendPrivate(nick, `✅ Баланс ${target} изменен.`);
                break;
            }

            case 'stats': {
                const target = args[1];
                const data = await db.get("SELECT * FROM rp_players WHERE minecraft_nick = ?", [target]);
                if (!data) return sendPrivate(nick, "Игрок не найден в RP базе.");
                sendPrivate(nick, `📊 СТАТИСТИКА ${target}:\nДеньги: ${data.money} | Орг: ${data.structure} | Звание: ${data.job_rank} | Баллы: ${data.rp_points}`);
                break;
            }

            case 'idim': { // /arp idim add Nick ID
                if (level < 3) return;
                const type = args[1]; // add/del
                const target = args[2];
                const id = args[3];
                if (type === 'add') {
                    await db.run("UPDATE property SET owner_nick = ?, is_admin_issued = 1 WHERE id = ?", [target, id]);
                    bot.chat(`/rg addmember TRTR${id} ${target}`);
                } else {
                    await db.run("UPDATE property SET owner_nick = NULL, tax_accumulated = 0 WHERE id = ?", [id]);
                    bot.chat(`/rg removemember TRTR${id} ${target}`);
                }
                sendPrivate(nick, `✅ Имущество #${id} обновлено.`);
                break;
            }

            case 'stopall': {
                if (level < 6) return;
                global.maintenance = !global.maintenance;
                sendClan(global.maintenance ? "🛑 СИСТЕМА ЗАМОРОЖЕНА АДМИНИСТРАТОРОМ." : "✅ СИСТЕМА РАЗМОРОЖЕНА.");
                break;
            }

            case 'reloadbd': {
                if (level < 6) return;
                await db.run("DELETE FROM clan_chat_logs");
                await db.run("DELETE FROM clan_members");
                sendPrivate(nick, "🧨 База данных участников и логов чата очищена.");
                break;
            }

            case 'payday': {
                if (level < 6) return;
                // Импорт и запуск payday
                require('../payday').execute(bot, db);
                break;
            }
        }
    }
}

module.exports = { handle };