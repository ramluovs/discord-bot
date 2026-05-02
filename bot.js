const {
  Client,
  GatewayIntentBits
} = require('discord.js');
const ask = require('./commands/ask');
const cards = require('./commands/cards');
const fun = require('./commands/fun');
const roblox = require('./commands/roblox');
const moderationCommands = {
  ban: require('./commands/moderation/ban'),
  unban: require('./commands/moderation/unban'),
  kick: require('./commands/moderation/kick'),
  timeout: require('./commands/moderation/timeout'),
  clear: require('./commands/moderation/clear'),
  setnick: require('./commands/moderation/setnick')
};

const CARD_COMMANDS = ['add', 'cards', 'quiz', 'stop', 'deletecard', 'resetcards'];
const FUN_COMMANDS = ['birthday', 'testbirthday'];
const ROBLOX_COMMANDS = ['user', 'av', 'avatar', 'name', 'names', 'group', 'rs'];

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent
  ]
});

function parsePrefixedCommand(content) {
  const trimmedContent = content.trim();

  if (!trimmedContent) return null;

  const matchedPrefix = trimmedContent.startsWith(';')
    ? ';'
    : trimmedContent.match(/^chi\s+/i)?.[0];

  if (!matchedPrefix) return null;

  const body = trimmedContent.slice(matchedPrefix.length).trim();

  if (!body) return null;

  const parts = body.split(/\s+/);
  return {
    prefix: matchedPrefix === ';' ? ';' : 'chi ',
    commandName: parts[0].toLowerCase(),
    args: parts.slice(1)
  };
}

// ===== READY =====
client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
  fun.scheduleBirthdayCheck(client);
});

// ===== MESSAGE HANDLER =====
client.on('messageCreate', async message => {
  if (message.author.bot) return;

  const isReply = Boolean(message.reference?.messageId);
  const parsedCommand = parsePrefixedCommand(message.content);

  if (!parsedCommand) {
    if (isReply) {
      const handledFollowUp = await ask.handleFollowUp(message);
      if (handledFollowUp) return;
    }

    return;
  }

  if (parsedCommand.prefix === 'chi ' && parsedCommand.commandName === 'ask') {
    return ask.execute(message);
  }

  if (moderationCommands[parsedCommand.commandName]) {
    return moderationCommands[parsedCommand.commandName].execute(message, parsedCommand.args);
  }

  if (CARD_COMMANDS.includes(parsedCommand.commandName)) {
    return cards.execute(message, parsedCommand);
  }

  if (FUN_COMMANDS.includes(parsedCommand.commandName)) {
    return fun.execute(message, parsedCommand);
  }

  if (ROBLOX_COMMANDS.includes(parsedCommand.commandName)) {
    return roblox.execute(message, parsedCommand);
  }
});

// ===== BUTTON HANDLER =====
client.on('interactionCreate', async interaction => {
  const handledAIInteraction = await ask.handleInteraction(interaction);
  if (handledAIInteraction) return;

  const handledCards = await cards.handleInteraction(interaction);
  if (handledCards) return;
});

client.login(process.env.TOKEN);
