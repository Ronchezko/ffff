const database = require('../../database');

const STYLE = {
    prefix: "&#6343d4&lResistance &8| ",
    success: "&#FF0202| &#76C519{user}&#D4D4D4, действие выполнено: {msg}",
    error: "&#FF0202| &#76C519{user}&#D4D4D4, ошибка: &c'{msg}'"
};

async function handle(bot, nick, cmd, args, callbacks) {
    const { sendPrivate, sendClan } = callbacks;
    const db = database.getDb();
    const player = await db.get("SELECT * FROM rp_players WHERE minecraft_nick = ?", [nick]);

    // Проверка, является ли игрок лидером или министром
    const isLeader = player && (player.job_rank.toLowerCase().includes('лидер') || player.job_rank.toLowerCase().includes('министр') || player.job_rank === 'Мэр');
    
    if (cmd === '/org' || cmd === '/o') {
        const sub = args[0]?.toLowerCase();
        if (!isLeader && !['members', 'ranks', 'wstatus', 'duty', 'points'].includes(sub)) return;

        switch (sub) {
            case 'invite': {
                const target = args[1];
                if (!target) return sendPrivate(nick, "Укажите ник: /o invite [ник]");
                await db.run("UPDATE rp_players SET structure = ?, job_rank = 'Рядовой/Стажер' WHERE minecraft_nick = ?", [player.structure, target]);
                sendClan(`&#76C519🤝 Лидер ${player.structure} ${nick} принял в ряды игрока ${target}!`);
                break;
            }

            case 'kick': {
                const target = args[1];
                const reason = args.slice(2).join(' ') || 'Расформирование';
                const tData = await db.get("SELECT structure FROM rp_players WHERE minecraft_nick = ?", [target]);
                if (tData?.structure !== player.structure) return sendPrivate(nick, "Игрок не в вашей структуре.");
                
                await db.run("UPDATE rp_players SET structure = 'Гражданин', job_rank = 'Нет' WHERE minecraft_nick = ?", [target]);
                sendClan(`&#FF0202👞 Сотрудник ${target} был уволен из ${player.structure}. Причина: ${reason}`);
                break;
            }

            case 'rank': { // /o rank set Nick Rank
                if (args[1] !== 'set') return;
                const target = args[2];
                const newRank = args.slice(3).join(' ');
                await db.run("UPDATE rp_players SET job_rank = ? WHERE minecraft_nick = ?", [newRank, target]);
                bot.chat(`/c rank ${target} ${newRank}`); // Синхронизация с рангом клана
                sendPrivate(nick, `✅ Игроку ${target} установлено звание: ${newRank}`);
                break;
            }

            case 'paybonus':
            case 'pb': {
                const target = args[1];
                const amount = parseFloat(args[2]);
                if (isNaN(amount) || amount > 50000) return sendPrivate(nick, "Макс. премия 50,000₽.");
                
                const org = await db.get("SELECT budget FROM organizations WHERE name = ?", [player.structure]);
                if (org.budget < amount) return sendPrivate(nick, "Недостаточно бюджета организации.");

                await db.run("UPDATE organizations SET budget = budget - ? WHERE name = ?", [amount, player.structure]);
                await db.run("UPDATE rp_players SET money = money + ? WHERE minecraft_nick = ?", [amount, target]);
                sendClan(`&#e63030💰 Премия! Лидер ${player.structure} выдал ${target} бонус в размере ${amount}₽!`);
                break;
            }

            case 'warn': {
                const target = args[1];
                const reason = args.slice(2).join(' ');
                await db.run("UPDATE rp_players SET warnings = warnings + 1 WHERE minecraft_nick = ?", [target]);
                const tData = await db.get("SELECT warnings FROM rp_players WHERE minecraft_nick = ?", [target]);
                
                if (tData.warnings >= 3) {
                    await db.run("UPDATE rp_players SET structure = 'Гражданин', job_rank = 'Нет', warnings = 0 WHERE minecraft_nick = ?", [target]);
                    sendClan(`&#FF0202❗ Сотрудник ${target} уволен за 3/3 выговора!`);
                } else {
                    sendClan(`&#FFB10C⚠ ${target} получил выговор (${tData.warnings}/3). Причина: ${reason}`);
                }
                break;
            }
        }
    }
}

module.exports = { handle };