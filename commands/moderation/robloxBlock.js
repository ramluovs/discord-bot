const fs = require('fs');
const path = require('path');

// We use global maps so cooldowns don't reset unless you restart the bot
global.userCooldowns = global.userCooldowns || new Map();
global.targetCooldowns = global.targetCooldowns || new Map();

const ADMIN_ROLE = '1340864854243803248'; // Can block anyone + edit list
const FRIEND_ROLE = '1538673525592690778'; // Can only block from list
const LOG_CHANNEL_ID = '1538680633499451493'; // Your private log channel

// This creates a JSON file in your main bot folder to safely store the IDs
const LIST_PATH = path.join(__dirname, '..', '..', 'allowed_blocks.json');
if (!fs.existsSync(LIST_PATH)) {
    fs.writeFileSync(LIST_PATH, JSON.stringify([]));
}

// Helper function to send logs to your channel
async function sendLog(client, logText) {
    try {
        const channel = client.channels.cache.get(LOG_CHANNEL_ID) || await client.channels.fetch(LOG_CHANNEL_ID);
        if (channel) {
            await channel.send(`🩵 **| Log de Moderación Roblox:**\n🤍 ${logText}`);
        }
    } catch (e) {
        console.error("No se pudo enviar el log de Roblox:", e);
    }
}

// Helper function to convert a username into a Roblox ID
async function getUserIdFromUsername(username) {
    try {
        const res = await fetch('https://users.roblox.com/v1/usernames/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usernames: [username], excludeBannedUsers: false })
        });
        const data = await res.json();
        if (data.data && data.data.length > 0) {
            return data.data[0].id.toString();
        }
    } catch (e) {
        console.error("Roblox Username API Error:", e);
    }
    return null;
}

// Helper function to get Display Names and Usernames from a list of IDs
async function getUsersInfo(userIds) {
    if (!userIds || userIds.length === 0) return [];
    try {
        const res = await fetch('https://users.roblox.com/v1/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userIds: userIds, excludeBannedUsers: false })
        });
        const data = await res.json();
        return data.data || [];
    } catch (e) {
        console.error("Roblox Multi-User Info API Error:", e);
        return [];
    }
}

// Helper function to handle the Roblox API and CSRF tokens
async function robloxAction(userId, action, cookie) {
    const url = `https://accountsettings.roblox.com/v1/users/${userId}/${action}`;
    const headers = { 
        'Cookie': `.ROBLOSECURITY=${cookie}`,
        'Content-Type': 'application/json'
    };
    
    try {
        let res = await fetch(url, { method: 'POST', headers });
        if (res.status === 403) {
            const csrf = res.headers.get('x-csrf-token');
            if (csrf) {
                headers['X-CSRF-TOKEN'] = csrf;
                res = await fetch(url, { method: 'POST', headers });
            }
        }
        return res.ok;
    } catch (e) {
        console.error("Roblox API Error:", e);
        return false;
    }
}

module.exports = {
    name: 'block',
    aliases: ['bl', 'unblock', 'ubl', 'addbl', 'rbl', 'blocklist', 'abl'],
    async execute(message, args) {
        const prefix = message.content.startsWith('chi ') ? 'chi ' : ';';
        const cmdName = message.content.slice(prefix.length).trim().split(/ +/)[0].toLowerCase();
        const discordId = message.author.id;
        const targetInput = args[0];

        const isAdmin = message.member.roles.cache.has(ADMIN_ROLE);
        const isFriend = message.member.roles.cache.has(FRIEND_ROLE);

        if (!isAdmin && !isFriend) {
            await sendLog(message.client, `🚨 <@${discordId}> intentó usar \`${cmdName}\` pero **NO tiene permisos**.`);
            return message.reply("🤍 ¡Ups! No tienes los permisos para usar este comandito... 🥺🩵");
        }

        const now = Date.now();

        // 1. Check User Cooldown (5 seconds for ANY command)
        if (global.userCooldowns.has(discordId)) {
            const expiration = global.userCooldowns.get(discordId) + 5000;
            if (now < expiration) {
                const timeLeft = ((expiration - now) / 1000).toFixed(1);
                await sendLog(message.client, `⏱️ <@${discordId}> golpeó su cooldown personal de 5s al intentar usar \`${cmdName}\`.`);
                return message.reply(`🩵 ¡Ve más despacio, angelito! Espera \`${timeLeft}\`s antes de enviar otro comandito. 🤍`);
            }
        }
        global.userCooldowns.set(discordId, now);

        // --- MANEJO DEL COMANDO BLOCKLIST / ABL ---
        if (['blocklist', 'abl'].includes(cmdName)) {
            let list = JSON.parse(fs.readFileSync(LIST_PATH));
            
            if (list.length === 0) {
                await sendLog(message.client, `📜 <@${discordId}> revisó la lista, pero está vacía.`);
                return message.reply("🤍 ¡La lista está vacía, angelito! No hay nadie permitido para bloquear por ahora. ☁️✨");
            }

            // Fetch display names and usernames from Roblox
            const usersInfo = await getUsersInfo(list);
            
            let replyText = "🩵 **Lista de Usuarios Permitidos para Bloquear:** 🤍\n\n";
            list.forEach((id, index) => {
                const info = usersInfo.find(u => u.id.toString() === id.toString());
                if (info) {
                    replyText += `${index + 1}. [${info.displayName} (@${info.name})](https://www.roblox.com/users/${id}/profile)\n`;
                } else {
                    replyText += `${index + 1}. [Usuario Oculto (ID: ${id})](https://www.roblox.com/users/${id}/profile)\n`;
                }
            });

            await sendLog(message.client, `📜 <@${discordId}> revisó la lista de bloqueos permitidos.`);
            return message.reply(replyText);
        }

        // --- MANEJO DE COMANDOS QUE REQUIEREN UN USUARIO (BLOCK, UNBLOCK, ADDBL, RBL) ---
        if (!targetInput) {
            await sendLog(message.client, `<@${discordId}> intentó usar el comando \`${cmdName}\` pero no proporcionó ningún usuario.`);
            return message.reply("🤍 ¡Holi! Necesitas darme un ID de Roblox, un nombre de usuario o un enlace de perfil, por fis. 🩵☁️");
        }

        // RESOLVE THE INPUT TO A ROBLOX ID
        let targetId = null;

        const linkMatch = targetInput.match(/(?:roblox\.com\/users\/)(\d+)/i);
        if (linkMatch) {
            targetId = linkMatch[1];
        } else if (/^\d+$/.test(targetInput)) {
            targetId = targetInput;
        } else {
            targetId = await getUserIdFromUsername(targetInput);
            if (!targetId) {
                await sendLog(message.client, `❓ <@${discordId}> buscó el usuario \`${targetInput}\`, pero **no existe** en Roblox.`);
                return message.reply(`🤍 ¡Ayy! No pude encontrar a ningún usuario de Roblox con el nombre \`${targetInput}\` ☁️❄️`);
            }
        }

        // Handle Admin-only list editing (addbl / rbl)
        if (['addbl', 'rbl'].includes(cmdName)) {
            if (!isAdmin) {
                await sendLog(message.client, `⚠️ <@${discordId}> intentó editar la lista usando \`${cmdName}\`, pero no es administrador.`);
                return message.reply("🤍 ¡Ups! Solo los administradores pueden modificar la lista permitida. 🥺🩵");
            }

            let list = JSON.parse(fs.readFileSync(LIST_PATH));
            if (cmdName === 'addbl') {
                if (!list.includes(targetId)) list.push(targetId);
                fs.writeFileSync(LIST_PATH, JSON.stringify(list));
                await sendLog(message.client, `✅ <@${discordId}> **AÑADIÓ** el ID \`${targetId}\` a la lista permitida.`);
                return message.reply(`🤍 ¡Listo! El ID \`${targetId}\` fue añadido a la lista permitida con éxito. 🩵✨`);
            } else {
                list = list.filter(id => id !== targetId);
                fs.writeFileSync(LIST_PATH, JSON.stringify(list));
                await sendLog(message.client, `🗑️ <@${discordId}> **ELIMINÓ** el ID \`${targetId}\` de la lista permitida.`);
                return message.reply(`🤍 ¡Hecho! El ID \`${targetId}\` fue eliminado de la lista. ☁️💨`);
            }
        }

        // Handle block / unblock logic
        const action = ['block', 'bl'].includes(cmdName) ? 'block' : 'unblock';
        const actionEs = action === 'block' ? 'bloquear' : 'desbloquear';
        const actionEsPast = action === 'block' ? 'bloqueado' : 'desbloqueado';

        // Check Target Cooldown (2 minutes)
        const targetKey = `${action}-${targetId}`;
        if (global.targetCooldowns.has(targetKey)) {
            const expiration = global.targetCooldowns.get(targetKey) + 120000;
            if (now < expiration) {
                const timeLeft = Math.ceil((expiration - now) / 1000);
                await sendLog(message.client, `⏱️ <@${discordId}> intentó ${actionEs} al ID \`${targetId}\`, pero está en cooldown de 2 minutos.`);
                return message.reply(`🩵 ¡Espera un poquito! Ese usuario acaba de ser modificado. Intenta de nuevo en \`${timeLeft}\`s. 🤍⏱️`);
            }
        }

        // If they are just a Friend, verify the ID is on the approved list
        if (!isAdmin && isFriend) {
            const list = JSON.parse(fs.readFileSync(LIST_PATH));
            if (!list.includes(targetId)) {
                await sendLog(message.client, `🛑 <@${discordId}> intentó ${actionEs} al ID \`${targetId}\`, pero **NO está en la lista permitida**.`);
                return message.reply("🤍 ¡Uy! Solo puedes modificar a los usuarios que están en nuestra lista aprobada. 🥺🩵");
            }
        }

        // Execute the Roblox API request
        const cookie = process.env.ROBLOX_COOKIE;
        if (!cookie) {
            await sendLog(message.client, `❌ Error del sistema: Faltan las cookies de Roblox para <@${discordId}>.`);
            return message.reply("🤍 ¡Ayy, un error! Falta la cookie de Roblox en mi sistema. 🛠️🩵");
        }

        const success = await robloxAction(targetId, action, cookie);
        
        if (success) {
            global.targetCooldowns.set(targetKey, now); // Start the 2 min cooldown
            await sendLog(message.client, `🎉 <@${discordId}> ha **${actionEsPast.toUpperCase()}** exitosamente al ID \`${targetId}\`.`);
            return message.reply(`🩵 ¡Súper! Se ha **${actionEsPast}** con éxito. 🤍\n🔗 **Perfil:** [Haz clic aquí para ver su Roblox](https://www.roblox.com/users/${targetId}/profile) (ID: \`${targetId}\`) ✨`);
        } else {
            await sendLog(message.client, `❌ <@${discordId}> **FALLÓ** al intentar ${actionEs} al ID \`${targetId}\`. (Posible error de API, cookie expirada o ya estaba ${actionEsPast}).`);
            return message.reply(`🤍 ¡Oh no! Falló al intentar hacer esto. Revisa que no esté ya ${actionEsPast}. 🥺🩵`);
        }
    }
};
