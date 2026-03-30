const database = require('../../database');

async function handle(bot, nick, cmd, args, callbacks) {
    const { sendPrivate } = callbacks;
    const db = database.getDb();

    if (cmd === '/im' || cmd === '/biz' || cmd === '/office') {
        const sub = args[0]?.toLowerCase();
        const id = args[1];

        // Проверка владения
        const prop = await db.get("SELECT * FROM property WHERE id = ? AND owner_nick = ?", [id, nick]);
        if (!prop && sub !== 'buy') return sendPrivate(nick, "❌ Это имущество вам не принадлежит.");

        switch (sub) {
            case 'flag': { // /im flag use on
                const flag = args[2]; // use / item-drop
                const state = args[3] === 'on' ? 'allow' : 'deny';
                if (!['use', 'item-drop'].includes(flag)) return sendPrivate(nick, "Флаги: use, item-drop");
                bot.chat(`/rg f TRTR${id} ${flag} ${state}`);
                sendPrivate(nick, `✅ Флаг ${flag} изменен на ${args[3]}`);
                break;
            }

            case 'addm': { // Добавить сожителя
                if (prop.type === 'business' || prop.type === 'office') 
                    return sendPrivate(nick, "❌ Сожителей можно добавлять только в дома и квартиры.");
                const target = args[2];
                // Проверка: в клане ли и в RP ли игрок
                const isRP = await db.get("SELECT minecraft_nick FROM rp_players WHERE minecraft_nick = ?", [target]);
                if (!isRP) return sendPrivate(nick, "❌ Игрок должен быть участником RolePlay.");
                
                await db.run("UPDATE property SET co_owner1 = ? WHERE id = ?", [target, id]);
                bot.chat(`/rg addmember TRTR${id} ${target}`);
                sendPrivate(nick, `✅ ${target} добавлен как сожитель в #${id}`);
                break;
            }

            case 'nalog': {
                if (args[1] === 'info') {
                    sendPrivate(nick, `📊 Налог на #${id}: Накоплено ${prop.tax_accumulated}₽. Лимит 10,000₽.`);
                } else if (args[1] === 'dep') {
                    const sum = parseFloat(args[2]);
                    const player = await db.get("SELECT money FROM rp_players WHERE minecraft_nick = ?", [nick]);
                    if (player.money < sum) return sendPrivate(nick, "Недостаточно денег.");
                    await db.run("UPDATE rp_players SET money = money - ? WHERE minecraft_nick = ?", [sum, nick]);
                    await db.run("UPDATE property SET tax_accumulated = tax_accumulated - ? WHERE id = ?", [sum, id]);
                    sendPrivate(nick, `💳 Налог оплачен на сумму ${sum}₽`);
                }
                break;
            }

            case 'fin': { // Только для бизнеса и офиса
                if (!['business', 'office'].includes(prop.type)) return;
                const period = args[2] || 'all'; // 1h, 1d, 1w
                // Логика подсчета прибыли из money_logs
                sendPrivate(nick, `📈 Финка бизнеса #${id} за ${period}: [Расчет из БД]₽`);
                break;
            }
        }
    }
}

module.exports = { handle };