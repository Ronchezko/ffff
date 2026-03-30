// src/web/auth.js
const express = require('express');
const fetch = require('node-fetch');
const logger = require('../shared/logger');
const router = express.Router();

module.exports = (database) => {
    // Начало авторизации
    router.get('/discord', (req, res) => {
        const redirectUri = process.env.DISCORD_REDIRECT_URI || 'http://localhost:3000/auth/discord/callback';
        const discordAuthUrl = `https://discord.com/api/oauth2/authorize?client_id=${process.env.DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=identify%20email`;
        res.redirect(discordAuthUrl);
    });

    // Callback после подтверждения
    router.get('/discord/callback', async (req, res) => {
        const { code } = req.query;
        if (!code) {
            logger.error('❌ Нет кода авторизации');
            return res.status(400).send('No code provided');
        }

        try {
            // Обмениваем код на токен
            const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    client_id: process.env.DISCORD_CLIENT_ID,
                    client_secret: process.env.DISCORD_CLIENT_SECRET,
                    grant_type: 'authorization_code',
                    code,
                    redirect_uri: process.env.DISCORD_REDIRECT_URI || 'http://localhost:3000/auth/discord/callback',
                }),
            });

            if (!tokenResponse.ok) {
                const errorText = await tokenResponse.text();
                logger.error('❌ Ошибка получения токена:', errorText);
                return res.status(500).send('Ошибка получения токена');
            }

            const tokenData = await tokenResponse.json();
            const accessToken = tokenData.access_token;

            if (!accessToken) {
                logger.error('❌ Нет access_token в ответе');
                return res.status(500).send('Ошибка получения токена доступа');
            }

            // Получаем данные пользователя
            const userResponse = await fetch('https://discord.com/api/users/@me', {
                headers: { Authorization: `Bearer ${accessToken}` },
            });

            if (!userResponse.ok) {
                logger.error('❌ Ошибка получения данных пользователя:', userResponse.status);
                return res.status(500).send('Ошибка получения данных пользователя');
            }

            const userData = await userResponse.json();
            
            if (!userData || !userData.id) {
                logger.error('❌ Некорректные данные пользователя:', userData);
                return res.status(500).send('Некорректные данные пользователя');
            }

            // Сохраняем пользователя в сессии
            req.session.user = {
                id: userData.id,
                username: userData.username,
                global_name: userData.global_name || userData.username,
                avatar: userData.avatar,
                discriminator: userData.discriminator,
            };

            logger.info(`✅ Пользователь ${userData.username} (${userData.id}) вошёл через Discord`);

            // Проверяем, привязан ли аккаунт к Minecraft
            try {
                const db = database.getDb();
                if (!db) {
                    logger.error('❌ База данных не инициализирована');
                } else {
                    const stmt = db.prepare('SELECT minecraft_nick, discord_id FROM clan_members WHERE discord_id = ?');
                    const member = stmt.get(userData.id);
                    
                    if (member && member.minecraft_nick) {
                        logger.info(`✅ Аккаунт привязан к Minecraft: ${member.minecraft_nick}`);
                    } else {
                        logger.info(`⚠️ Discord аккаунт ${userData.username} не привязан к Minecraft`);
                    }
                }
            } catch (dbError) {
                logger.error('❌ Ошибка при проверке привязки в БД:', dbError);
            }

            // Перенаправляем в профиль
            res.redirect('/profile');
            
        } catch (error) {
            logger.error('❌ Ошибка OAuth2:', error);
            console.error('Детали ошибки:', error);
            res.status(500).send('Ошибка авторизации: ' + error.message);
        }
    });

    // Выход
    router.get('/logout', (req, res) => {
        const username = req.session.user?.username || 'unknown';
        logger.info(`👋 Пользователь ${username} вышел из системы`);
        req.session.destroy();
        res.redirect('/');
    });

    return router;
};