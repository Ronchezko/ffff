const database = require('../../database');

const STYLE = {
    prefix: "&#6343d4&lR&#6b44d9&le&#7345de&ls&#7b47e2&li&#8348e7&ls&#8a49ec&lt&#924af1&la&#9a4cf5&ln&#a24dfa&lc&#aa4eff&le &8| ",
    error: "&#FF0202| &#76C519{user}&#D4D4D4, ошибка: &c'{msg}'",
    info: "&#FF0202| &#76C519{user}&#D4D4D4, {msg}"
};

async function handle(bot, nick, cmd, args, callbacks) {
    const { sendPrivate, sendClan } = callbacks;
    const db = database.getDb();
    const player = await db.get("SELECT * FROM rp_players WHERE minecraft_nick = ?", [nick]);

    switch (cmd) {
        case '/pay': {
            if (!player) return sendPrivate(nick, "🌱 Вы не в системе RolePlay. Напишите /rp");
            const target = args[0];
            const amount = parseFloat(args[1]);
            
            // Кулдаун 15 секунд (проверка через память)
            const now = Date.now();
            if (player.last_pay_time && now - player.last_pay_time < 15000) 
                return sendPrivate(nick, STYLE.error.replace('{user}', nick).replace('{msg}', "Подождите 15 секунд."));

            if (!target || isNaN(amount) || amount <= 0 || amount > 50000) 
                return sendPrivate(nick, STYLE.usage.replace('{cmd}', '/pay [ник] [сумма до 50к]'));

            if (player.money < amount) return sendPrivate(nick, "❌ Недостаточно средств.");

            await db.run("UPDATE rp_players SET money = money - ?, last_pay_time = ? WHERE minecraft_nick = ?", [amount, now, nick]);
            await db.run("UPDATE rp_players SET money = money + ? WHERE minecraft_nick = ?", [amount, target]);
            
            sendPrivate(nick, `✅ Вы успешно передали ${amount}₽ игроку ${target}`);
            sendPrivate(target, `💰 Игрок ${nick} перевел вам ${amount}₽`);
            // Лог транзакции
            await db.run("INSERT INTO money_logs (player, amount, type, description) VALUES (?, ?, 'transfer', ?)", [nick, -amount, `Перевод для ${target}`]);
            break;
        }

        case '/balance':
            sendPrivate(nick, `&#76C519💰 Ваш текущий баланс: ${player ? player.money.toLocaleString() : 0}₽`);
            break;

        case '/pass':
            if (!player) return sendPrivate(nick, "У вас нет паспорта. Пройдите регистрацию /rp");
            sendPrivate(nick, `📜 ПАСПОРТ [${nick}]:\n` +
                `Образование: ${player.has_education ? 'Высшее' : 'Нет'}\n` +
                `Структура: ${player.structure}\n` +
                `Звание: ${player.job_rank}`);
            break;

        case '/id': {
            const row = await db.get("SELECT rowid FROM clan_members WHERE minecraft_nick = ?", [nick]);
            sendPrivate(nick, `🆔 Ваш уникальный ID в базе данных: #&e&l${row ? row.rowid : '?'}`);
            break;
        }

        case '/keys': {
            const properties = await db.all("SELECT id, type FROM property WHERE owner_nick = ?", [nick]);
            if (properties.length === 0) return sendPrivate(nick, "🗝️ У вас нет ключей от имущества.");
            const list = properties.map(p => `#${p.id} (${p.type})`).join(', ');
            sendPrivate(nick, `🗝️ Ваши владения: ${list}`);
            break;
        }

        case '/idim': {
            const id = args[0];
            const prop = await db.get("SELECT * FROM property WHERE id = ?", [id]);
            if (!prop) return sendPrivate(nick, "❌ Имущество с таким ID не найдено.");
            const owner = prop.owner_nick ? `Владелец: ${prop.owner_nick}` : "&a&lСвободно";
            sendPrivate(nick, `🏠 Инфо #${id}: Тип: ${prop.type} | Цена: ${prop.price}₽ | ${owner}`);
            break;
        }

        case '/help':
            sendPrivate(nick, STYLE.info.replace('{user}', nick).replace('{msg}', "Полный список команд доступен на нашем форуме в Discord! &c'/discord'"));
            break;
    }
}

module.exports = { handle };