// src/shared/logger.js
const colors = require('colors');

colors.setTheme({
    info: 'cyan',
    warn: 'yellow',
    error: 'red',
    success: 'green',
    debug: 'gray'
});

function getTimestamp() {
    const now = new Date();
    return `[${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}]`;
}

const ignorePatterns = [
    'Ignoring block entities', 'chunk failed to load', 'JSON', 'skin', 'textures', 'SKIN',
    'DecoderException', 'OverflowPacketException', 'string had more data'
];

function shouldIgnore(msg) {
    if (!msg) return false;
    const msgStr = String(msg);
    return ignorePatterns.some(pattern => msgStr.includes(pattern));
}

const logger = {
    info: (msg) => { if (!shouldIgnore(msg)) console.log(`📘 ${getTimestamp()} [INFO] ${msg}`.info); },
    warn: (msg) => { if (!shouldIgnore(msg)) console.log(`⚠️ ${getTimestamp()} [WARN] ${msg}`.warn); },
    error: (msg, err) => { if (!shouldIgnore(msg)) { console.log(`❌ ${getTimestamp()} [ERROR] ${msg}`.error); if (err && !shouldIgnore(err)) console.log(err); } },
    success: (msg) => { if (!shouldIgnore(msg)) console.log(`✅ ${getTimestamp()} [SUCCESS] ${msg}`.success); },
    debug: (msg) => { if (process.env.DEBUG === 'true' && !shouldIgnore(msg)) console.log(`🐛 ${getTimestamp()} [DEBUG] ${msg}`.debug); }
};

module.exports = logger;