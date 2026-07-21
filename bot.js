const {
  Client,
  GatewayIntentBits
} = require('discord.js');
const ask = require('./commands/ask');
const cards = require('./commands/cards');
const convert = require('./commands/media/convert');
const yt = require('./commands/media/yt');
const dl = require('./commands/media/dl');
const ig = require('./commands/media/ig');
const fun = require('./commands/fun');
const music = require('./music/music');
const spotify = require('./commands/spotify');
const roblox = require('./commands/roblox');
const versus = require('./commands/moderation/versus');
const moderationCommands = {
  ban: require('./commands/moderation/ban'),
  unban: require('./commands/moderation/unban'),
  kick: require('./commands/moderation/kick'),
  timeout: require('./commands/moderation/timeout'),
  clear: require('./commands/moderation/clear'),
  setnick: require('./commands/moderation/setnick'),
  verify: require('./commands/moderation/verify'),
  v: require('./commands/moderation/verify'),
  invite: require('./commands/moderation/invite'),
  invitar: require('./commands/moderation/invite'),
  versus,
  versusadd: versus,
  versusdelete: versus
};

const CARD_COMMANDS = ['addcard', 'cards', 'quiz', 'stopcard', 'deletecard', 'resetcards'];
const FUN_COMMANDS = ['birthday', 'testbirthday', 'links', 'editlinks', 'banana', 'moneda', 'flip', 'coin', 'tictactoe'];
const MEDIA_COMMANDS = ['c', 'yt', 'dl'];
const MUSIC_COMMANDS = ['musicadd', 'musicdelete', 'musiclist', 'addmusicimage', 'musictrack', 'musicuntrack', 'musictracklist'];
const SPOTIFY_COMMANDS = ['play', 'pause', 'stop', 'skip', 'stream', 'sp'];
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
  const { scheduleTracking } = require('./music/tracking');
  scheduleTracking(client);
});

// ===== MESSAGE HANDLER =====
client.on('messageCreate', async message => {
  if (message.author.bot) return;

  if (message.channel.id === '1500627966713925832' && !message.author.bot) {
    const { handleAppDownloadRequest } = require('./music/music');
    handleAppDownloadRequest(message);
    return;
  }

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
    return moderationCommands[parsedCommand.commandName].execute(message, parsedCommand);
  }

  if (CARD_COMMANDS.includes(parsedCommand.commandName)) {
    return cards.execute(message, parsedCommand);
  }

  if (FUN_COMMANDS.includes(parsedCommand.commandName)) {
    return fun.execute(message, parsedCommand);
  }

  if (parsedCommand.commandName === 'c') {
    return convert.execute(message, parsedCommand);
  }

  if (parsedCommand.commandName === 'yt') {
    return yt.execute(message, parsedCommand);
  }

  if (parsedCommand.commandName === 'dl') {
    return dl.execute(message, parsedCommand);
  }

  if (parsedCommand.commandName === 'ig') {
    return ig.execute(message, parsedCommand);
  }

  if (MUSIC_COMMANDS.includes(parsedCommand.commandName)) {
    return music.execute(message, parsedCommand);
  }

  if (SPOTIFY_COMMANDS.includes(parsedCommand.commandName)) {
    return spotify.execute(message, parsedCommand);
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
