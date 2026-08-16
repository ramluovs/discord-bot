const {
  Client,
  GatewayIntentBits
} = require('discord.js');

// === IMPORTACIÓN DE COMANDOS ANTERIORES ===
const ask = require('./commands/ask');
const cards = require('./commands/cards');
const lyrics = require('./commands/lyrics');
const convert = require('./commands/media/convert');
const yt = require('./commands/media/yt');
const dl = require('./commands/media/dl');
const ig = require('./commands/media/ig');
const fun = require('./commands/fun');
const music = require('./music/music');
const roblox = require('./commands/roblox');
const versus = require('./commands/moderation/versus');
const robloxBlock = require('./commands/moderation/robloxBlock'); // <-- NEW IMPORT

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
  versusdelete: versus,
  // <-- NEW ROBLOX BLOCK ALIASES START -->
  block: robloxBlock,
  bl: robloxBlock,
  unblock: robloxBlock,
  ubl: robloxBlock,
  addbl: robloxBlock,
  rbl: robloxBlock
  // <-- NEW ROBLOX BLOCK ALIASES END -->
};

// === IMPORTACIÓN DE NUEVOS COMANDOS (SPOTIFY) ===
const spotify = require('./commands/spotify');
const ya = require('./commands/ya');
const conectar = require('./commands/conectar');

// === LISTAS DE COMANDOS ===
const CARD_COMMANDS = ['addcard', 'cards', 'quiz', 'stop', 'deletecard', 'resetcards'];
const LYRICS_COMMANDS = ['lyricaudio'];
const FUN_COMMANDS = ['birthday', 'testbirthday', 'links', 'editlinks', 'banana', 'moneda', 'flip', 'coin', 'tictactoe'];
const MUSIC_COMMANDS = ['musicadd', 'musicdelete', 'musiclist', 'addmusicimage', 'musictrack', 'musicuntrack', 'musictracklist'];
const ROBLOX_COMMANDS = ['user', 'av', 'avatar', 'name', 'names', 'group', 'rs'];
const SPOTIFY_COMMANDS = ['spotify', 'stream', 'play', 'sp', 'pause', 'skip', 'help', 'lyrics', 'letra'];

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
client.once('clientReady', () => {
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

  try {
    // --- COMANDO ASK ---
    if (parsedCommand.prefix === 'chi ' && parsedCommand.commandName === 'ask') {
      return await ask.execute(message);
    }

    // --- NUEVOS COMANDOS DE SPOTIFY ---
    if (parsedCommand.commandName === 'conectar') {
      return await conectar.execute(message, parsedCommand);
    }

    if (parsedCommand.commandName === 'ya') {
      return await ya.execute(message, parsedCommand);
    }

    if (SPOTIFY_COMMANDS.includes(parsedCommand.commandName)) {
      return await spotify.execute(message, parsedCommand);
    }

    // --- COMANDOS ORIGINALES ---
    if (moderationCommands[parsedCommand.commandName]) {
      return await moderationCommands[parsedCommand.commandName].execute(message, parsedCommand);
    }

    if (CARD_COMMANDS.includes(parsedCommand.commandName)) {
      return await cards.execute(message, parsedCommand);
    }

    if (LYRICS_COMMANDS.includes(parsedCommand.commandName)) {
      return await lyrics.execute(message, parsedCommand);
    }

    if (FUN_COMMANDS.includes(parsedCommand.commandName)) {
      return await fun.execute(message, parsedCommand);
    }

    if (parsedCommand.commandName === 'c') {
      return await convert.execute(message, parsedCommand);
    }

    if (parsedCommand.commandName === 'yt') {
      return await yt.execute(message, parsedCommand);
    }

    if (parsedCommand.commandName === 'dl') {
      return await dl.execute(message, parsedCommand);
    }

    if (parsedCommand.commandName === 'ig') {
      return await ig.execute(message, parsedCommand);
    }

    if (MUSIC_COMMANDS.includes(parsedCommand.commandName)) {
      return await music.execute(message, parsedCommand);
    }

    if (ROBLOX_COMMANDS.includes(parsedCommand.commandName)) {
      return await roblox.execute(message, parsedCommand);
    }
  } catch (err) {
    console.error(`[Comando: ${parsedCommand.commandName}] Error inesperado:`, err);
    try {
      await message.reply('⚠️ Ocurrió un error inesperado ejecutando ese comando.');
    } catch (_) {
      // Si ni siquiera se puede responder, solo lo dejamos loggeado arriba.
    }
  }
});

// ===== BUTTON HANDLER =====
client.on('interactionCreate', async interaction => {
  try {
    const handledAIInteraction = await ask.handleInteraction(interaction);
    if (handledAIInteraction) return;

    const handledCards = await cards.handleInteraction(interaction);
    if (handledCards) return;
  } catch (err) {
    console.error('[interactionCreate] Error inesperado:', err);
  }
});

// ===== ESTABILIDAD EN TERMUX =====
// Evita que un error o promesa no manejada tumbe el proceso silenciosamente.
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});

if (!process.env.TOKEN) {
  console.error('❌ Falta la variable de entorno TOKEN. El bot no puede iniciar sesión sin ella.');
  process.exit(1);
}

client.login(process.env.TOKEN).catch(err => {
  console.error('❌ Error al iniciar sesión con Discord:', err.message || err);
  process.exit(1);
});
