const fs = require('fs');
const path = require('path');

// We use global maps so cooldowns don't reset unless you restart the bot
global.userCooldowns = global.userCooldowns || new Map();
global.targetCooldowns = global.targetCooldowns || new Map();

const ADMIN_ROLE = '1340864854243803248'; // Can block anyone + edit list
const FRIEND_ROLE = '1538673525592690778'; // Can only block from list

// This creates a JSON file in your main bot folder to safely store the IDs
const LIST_PATH = path.join(__dirname, '..', '..', 'allowed_blocks.json');
if (!fs.existsSync(LIST_PATH)) {
    fs.writeFileSync(LIST_PATH, JSON.stringify([]));
}

// Helper function to handle the Roblox API and CSRF tokens
async function robloxAction(userId, action, cookie) {
    const url = `https://accountsettings.roblox.com/v1/users/${userId}/${action}`;
    const headers = { 'Cookie': `.ROBLOSECURITY=${cookie}` };
    
    try {
        let res = await fetch(url, { method: 'POST', headers });
        // Roblox requires an X-CSRF-TOKEN. If we get a 403, we extract the token and try again.
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
    aliases: ['bl', 'unblock', 'ubl', 'addbl', 'rbl'], // Tells your command handler to route all these here
    async execute(message, args) {
        // Strip the prefix ('chi ' or ';') to find out which alias they actually typed
        const prefix = message.content.startsWith('chi ') ? 'chi ' : ';';
        const cmdName = message.content.slice(prefix.length).trim().split(/ +/)[0].toLowerCase();

        const discordId = message.author.id;
        const targetId = args[0];

        if (!targetId || isNaN(targetId)) {
            return message.reply("Please provide a valid Roblox User ID (numbers only).");
        }

        const isAdmin = message.member.roles.cache.has(ADMIN_ROLE);
        const isFriend = message.member.roles.cache.has(FRIEND_ROLE);

        if (!isAdmin && !isFriend) {
            return message.reply("You don't have permission to use this command.");
        }

        const now = Date.now();

        // 1. Check User Cooldown (5 seconds between ANY command)
        if (global.userCooldowns.has(discordId)) {
            const expiration = global.userCooldowns.get(discordId) + 5000;
            if (now < expiration) {
                return message.reply(`Slow down! Wait ${((expiration - now) / 1000).toFixed(1)}s before sending another command.`);
            }
        }
        global.userCooldowns.set(discordId, now);

        // 2. Handle Admin-only list editing (addbl / rbl)
        if (['addbl', 'rbl'].includes(cmdName)) {
            if (!isAdmin) return message.reply("Only admins can modify the allowed block list.");

            let list = JSON.parse(fs.readFileSync(LIST_PATH));
            if (cmdName === 'addbl') {
                if (!list.includes(targetId)) list.push(targetId);
                fs.writeFileSync(LIST_PATH, JSON.stringify(list));
                return message.reply(`Added \`${targetId}\` to the allowed block list.`);
            } else {
                list = list.filter(id => id !== targetId);
                fs.writeFileSync(LIST_PATH, JSON.stringify(list));
                return message.reply(`Removed \`${targetId}\` from the allowed block list.`);
            }
        }

        // 3. Handle block / unblock logic
        const action = ['block', 'bl'].includes(cmdName) ? 'block' : 'unblock';

        // Check Target Cooldown (2 minutes for the specific Roblox ID being blocked/unblocked)
        const targetKey = `${action}-${targetId}`;
        if (global.targetCooldowns.has(targetKey)) {
            const expiration = global.targetCooldowns.get(targetKey) + 120000; // 2 minutes
            if (now < expiration) {
                return message.reply(`Cooldown! That user was just ${action}ed. Wait ${Math.ceil((expiration - now) / 1000)}s.`);
            }
        }

        // If they are just a Friend, verify the target is actually on the approved list
        if (!isAdmin && isFriend) {
            const list = JSON.parse(fs.readFileSync(LIST_PATH));
            if (!list.includes(targetId)) {
                return message.reply("You can only block/unblock users that are on the approved list.");
            }
        }

        // 4. Execute the Roblox API request
        const cookie = process.env.ROBLOX_COOKIE;
        if (!cookie) return message.reply("Bot configuration error: Missing Roblox Cookie.");

        const success = await robloxAction(targetId, action, cookie);
        
        if (success) {
            global.targetCooldowns.set(targetKey, now); // Start the 2 min cooldown
            return message.reply(`Successfully **${action}ed** Roblox User ID: \`${targetId}\``);
        } else {
            return message.reply(`Failed to ${action} user. Make sure the ID is correct and your cookie hasn't expired.`);
        }
    }
};
