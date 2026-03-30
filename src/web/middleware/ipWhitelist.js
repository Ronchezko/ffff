// src/web/middleware/ipWhitelist.js
const logger = require('../../shared/logger');

module.exports = (req, res, next) => {
    const allowedIPs = process.env.ADMIN_ALLOWED_IPS 
        ? process.env.ADMIN_ALLOWED_IPS.split(',').map(ip => ip.trim()) 
        : [];
    
    const clientIP = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    
    if (allowedIPs.includes(clientIP) || allowedIPs.includes('*')) {
        next();
    } else {
        logger.warn(`Попытка доступа к админке с запрещённого IP: ${clientIP}`);
        // Вместо 403 отдаём страницу логина с блокировкой
        res.status(403).render('admin/login', {
            title: 'Доступ запрещён',
            blocked: true,
            user: null,
            error: null
        });
    }
};