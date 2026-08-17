const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');

global.userCooldowns = global.userCooldowns || new Map();
global.targetCooldowns = global.targetCooldowns || new Map();

const ADMIN_ROLE = '1340864854243803248';
const FRIEND_ROLE = '1538673525592690778';
const LOG_CHANNEL_ID = '1538680633499451493';

const LIST_PATH = path.join(__dirname, '..', '..', 'allowed_blocks.json');
if (!fs.existsSync(LIST_PATH)) {
    fs.writeFileSync(LIST_PATH, JSON.stringify([]));
}

function createEmbed(title, description) {
    const embed = new EmbedBuilder()
        .setColor('#AEE2FF')
        .setDescription(description);
    if (title) embed.setTitle(title);
    return { embeds: [embed] };
}

async function sendLog(client, title, description) {
    try {
        const channel = client.channels.cache.get(LOG_CHANNEL_ID) || await client.channels.fetch(LOG_CHANNEL_ID);
        if (channel) {
            const nowSeconds = Math.floor(Date.now() / 1000);
            const logEmbed = new EmbedBuilder()
                .setColor('#AEE2FF')
                .setTitle(`Log: ${title}`)
                .setDescription(`${description}\n\n**Hora:** <t:${nowSeconds}:T>`)
                .setTimestamp();
            
            await channel.send({ embeds: [logEmbed] });
        }
    } catch (e) {
        console.error("Error enviando log de Roblox:", e);
    }
}

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

async function robloxAction(userId, action, cookie) {
    const actionSuffix = action === 'block' ? 'block-user' : 'unblock-user';
    const url = `https://apis.roblox.com/user-blocking-api/v1/users/${userId}/${actionSuffix}`;

    // EL TRUCO: Añadimos un tracker ID falso para engañar al sistema de seguridad
    const headers = { 
        'Cookie': `.ROBLOSECURITY=${cookie}; browserTrackerId=77777777777;`,
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Origin': 'https://www.roblox.com',
        'Referer': 'https://www.roblox.com/'
    };

    try {
        console.log(`\n[ROBLOX] Obteniendo Token de Seguridad CSRF...`);
        
        // Hacemos un ping al endpoint de logout (que es seguro) solo para que nos regale el CSRF Token
        let csrfReq = await fetch('https://auth.roblox.com/v2/logout', { method: 'POST', headers });
        let csrf = csrfReq.headers.get('x-csrf-token');
        
        if (csrf) {
            headers['X-CSRF-TOKEN'] = csrf;
            console.log(`[ROBLOX] Token obtenido. Ejecutando '${action}' en: ${url}`);
            
            let res = await fetch(url, { method: 'POST', headers, body: "{}" });
            
            if (res.ok) {
                console.log(`[ROBLOX] ¡El usuario ${userId} fue procesado con éxito!`);
                return true;
            }
    
            const text = await res.text();
            console.log(`[ROBLOX] Error ${res.status}: ${text}`);
        } else {
            console.log(`[ROBLOX] Fallo al obtener el Token CSRF. Verifica la validez de la cookie.`);
        }
        
    } catch (e) {
        console.error(`[ROBLOX] Error en la petición:`, e);
    }
    
    return false;
}

module.exports = {
    name: 'block',
    aliases: ['bl', 'unblock', 'ubl', 'addbl', 'rbl', 'blocklist', 'abl'],
    async execute(message, parsedCommand) {
        const cmdName = parsedCommand.commandName;
        const targetInput = parsedCommand.args[0];
        const discordId = message.author.id;

        const isAdmin = message.member.roles.cache.has(ADMIN_ROLE);
        const isFriend = message.member.roles.cache.has(FRIEND_ROLE);

        if (!isAdmin && !isFriend) {
            await sendLog(message.client, "Acceso Denegado", `<@${discordId}> intentó usar \`${cmdName}\` sin permisos.`);
            return message.reply(createEmbed("Sin Permisos", "No posees los permisos necesarios para ejecutar este comando. 🩵"));
        }

        const now = Date.now();

        if (global.userCooldowns.has(discordId)) {
            const expiration = global.userCooldowns.get(discordId) + 5000;
            if (now < expiration) {
                const timeLeft = ((expiration - now) / 1000).toFixed(1);
                await sendLog(message.client, "Cooldown Personal", `<@${discordId}> intentó ejecutar \`${cmdName}\` demasiado rápido.`);
                return message.reply(createEmbed("Límite de Tiempo", `Por favor espera \`${timeLeft}\`s antes de enviar otro comando. 🩵`));
            }
        }
        global.userCooldowns.set(discordId, now);

        if (['blocklist', 'abl'].includes(cmdName)) {
            let list = JSON.parse(fs.readFileSync(LIST_PATH));
            
            if (list.length === 0) {
                await sendLog(message.client, "Lectura de Lista", `<@${discordId}> solicitó la lista, pero se encuentra vacía.`);
                return message.reply(createEmbed("Lista Vacía", "La lista de usuarios permitidos para bloquear se encuentra vacía actualmente. 🩵"));
            }

            const usersInfo = await getUsersInfo(list);
            let replyText = "";
            
            list.forEach((id, index) => {
                const info = usersInfo.find(u => u.id.toString() === id.toString());
                if (info) {
                    replyText += `${index + 1}. [${info.displayName} (@${info.name})](https://www.roblox.com/users/${id}/profile)\n`;
                } else {
                    replyText += `${index + 1}. [Usuario Oculto (ID: ${id})](https://www.roblox.com/users/${id}/profile)\n`;
                }
            });

            await sendLog(message.client, "Lectura de Lista", `<@${discordId}> consultó la lista de bloqueos permitidos.`);
            return message.reply(createEmbed("Usuarios Permitidos", `${replyText}\n🩵`));
        }

        if (!targetInput) {
            await sendLog(message.client, "Falta de Datos", `<@${discordId}> intentó usar \`${cmdName}\` sin proporcionar un objetivo.`);
            return message.reply(createEmbed("Faltan Datos", "Se requiere un ID de Roblox, nombre de usuario o enlace de perfil para usar este comando. 🩵"));
        }

        let targetId = null;
        const linkMatch = targetInput.match(/(?:roblox\.com\/users\/)(\d+)/i);
        
        if (linkMatch) {
            targetId = linkMatch[1];
        } else if (/^\d+$/.test(targetInput)) {
            targetId = targetInput;
        } else {
            targetId = await getUserIdFromUsername(targetInput);
            if (!targetId) {
                await sendLog(message.client, "Usuario no Encontrado", `<@${discordId}> buscó \`${targetInput}\`, el cual no existe en Roblox.`);
                return message.reply(createEmbed("Error de Búsqueda", "No se encontró un usuario de Roblox con la información proporcionada. 🩵"));
            }
        }

        if (['addbl', 'rbl'].includes(cmdName)) {
            if (!isAdmin) {
                await sendLog(message.client, "Intento de Modificación", `<@${discordId}> intentó modificar la lista mediante \`${cmdName}\` sin ser administrador.`);
                return message.reply(createEmbed("Acceso Denegado", "Solo los administradores pueden modificar la lista permitida. 🩵"));
            }

            let list = JSON.parse(fs.readFileSync(LIST_PATH));
            
            if (cmdName === 'addbl') {
                if (!list.includes(targetId)) list.push(targetId);
                fs.writeFileSync(LIST_PATH, JSON.stringify(list));
                await sendLog(message.client, "Usuario Añadido", `<@${discordId}> añadió el ID \`${targetId}\` a la lista.`);
                return message.reply(createEmbed("Operación Exitosa", `El ID \`${targetId}\` ha sido añadido a la lista permitida con éxito. 🩵`));
            } else {
                list = list.filter(id => id !== targetId);
                fs.writeFileSync(LIST_PATH, JSON.stringify(list));
                await sendLog(message.client, "Usuario Eliminado", `<@${discordId}> eliminó el ID \`${targetId}\` de la lista.`);
                return message.reply(createEmbed("Operación Exitosa", `El ID \`${targetId}\` ha sido eliminado de la lista. 🩵`));
            }
        }

        const action = ['block', 'bl'].includes(cmdName) ? 'block' : 'unblock';
        const actionEs = action === 'block' ? 'expulsar' : 'desbloquear';

        const targetKey = `${action}-${targetId}`;
        if (global.targetCooldowns.has(targetKey)) {
            const expiration = global.targetCooldowns.get(targetKey) + 30000;
            if (now < expiration) {
                const timeLeft = Math.ceil((expiration - now) / 1000);
                await sendLog(message.client, "Cooldown de Usuario", `<@${discordId}> intentó ${actionEs} al ID \`${targetId}\` repetidamente.`);
                return message.reply(createEmbed("Límite de Tiempo", `Este usuario ha sido modificado recientemente. Por favor espera \`${timeLeft}\`s. 🩵`));
            }
        }

        if (!isAdmin && isFriend) {
            const list = JSON.parse(fs.readFileSync(LIST_PATH));
            if (!list.includes(targetId)) {
                await sendLog(message.client, "Bloqueo Denegado", `<@${discordId}> intentó ${actionEs} al ID \`${targetId}\`, el cual no está en la lista.`);
                return message.reply(createEmbed("Usuario no Permitido", "El usuario especificado no se encuentra en la lista aprobada. 🩵"));
            }
        }

        const cookie = process.env.ROBLOX_COOKIE;
        if (!cookie) {
            await sendLog(message.client, "Error de Sistema", `Falta la cookie de Roblox. Ejecución fallida por <@${discordId}>.`);
            return message.reply(createEmbed("Error de Configuración", "Falta la configuración de la cookie de Roblox en el sistema. 🩵"));
        }

        const success = await robloxAction(targetId, action, cookie);
        
        if (success) {
            global.targetCooldowns.set(targetKey, now);
            
            if (action === 'block') {
                await sendLog(message.client, "Expulsión Exitosa", `<@${discordId}> ha **expulsado** (bloqueado) al ID \`${targetId}\` exitosamente.`);
                await message.reply(createEmbed("Expulsión Completada", `El jugador ha sido **expulsado** del servidor privado exitosamente. 🩵\n\n**Perfil:** [Enlace de Roblox](https://www.roblox.com/users/${targetId}/profile)\n**ID:** \`${targetId}\`\n\n*Nota: El sistema lo desbloqueará en 5 segundos automáticamente.*`));
                
                // Sistema de Auto-Desbloqueo tras 5 segundos
                setTimeout(async () => {
                    const unblocked = await robloxAction(targetId, 'unblock', cookie);
                    if (unblocked) {
                        await sendLog(message.client, "Auto-Desbloqueo", `El sistema ha **desbloqueado** automáticamente al ID \`${targetId}\` para mantener la lista limpia.`);
                    }
                }, 5000);
                
                return;
            } else {
                await sendLog(message.client, "Desbloqueo Exitoso", `<@${discordId}> ha **desbloqueado** al ID \`${targetId}\` exitosamente.`);
                return message.reply(createEmbed("Acción Completada", `El usuario ha sido **desbloqueado** exitosamente. 🩵\n\n**Perfil:** [Enlace de Roblox](https://www.roblox.com/users/${targetId}/profile)\n**ID:** \`${targetId}\``));
            }
            
        } else {
            await sendLog(message.client, "Fallo en Acción", `<@${discordId}> falló al intentar ${actionEs} al ID \`${targetId}\`.`);
            return message.reply(createEmbed("Error", `Hubo un error al procesar la solicitud. Verifica la cookie en Termux. 🩵`));
        }
    }
};
