const { EmbedBuilder } = require('discord.js');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const PASTEL_BLUE = 0xaeefff;
const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024;
const TEMP_DIR = path.join(__dirname, '../../temp');
const NSFW_CHANNEL_ID = '1371340983752724561';
const TWITTER_COOKIES_FILE = path.join(__dirname, '../../cookies/twitter_cookies.txt');

function errorEmbed(description) {
  return new EmbedBuilder().setColor(PASTEL_BLUE).setTitle('error').setDescription(description);
}

function ensureTempDir() {
  if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });
}

function cleanupFile(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {}
}

function execPromise(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: 120000 }, (error, stdout, stderr) => {
      if (error) reject(new Error(stderr || error.message));
      else resolve(stdout);
    });
  });
}

function isYouTube(url) {
  return /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)/.test(url);
}

function isTikTok(url) {
  return /^https?:\/\/(www\.|vm\.|vt\.)?tiktok\.com/.test(url);
}

function isInstagram(url) {
  return /^https?:\/\/(www\.)?instagram\.com/.test(url);
}

function isTwitter(url) {
  return /^https?:\/\/(www\.)?(twitter\.com|x\.com)/.test(url);
}

async function downloadAndSend(messageOrInteraction, url, titleOverride, channel, isNsfwChannel) {
  ensureTempDir();
  const timestamp = Date.now();
  const outputPath = path.join(TEMP_DIR, `dl_${timestamp}.mp4`);
  const isInteraction = !!messageOrInteraction.deferReply;

  const reply = async opts => {
    if (isInteraction) return messageOrInteraction.editReply(opts);
    return messageOrInteraction.reply(opts);
  };

  try {
    const ytDlpArgs = [
      '--no-playlist',
      '--no-part',
      '-f', 'mp4/bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best'
    ];

    if (isTwitter(url) && fs.existsSync(TWITTER_COOKIES_FILE)) {
      ytDlpArgs.push('--cookies', TWITTER_COOKIES_FILE);
    }

    ytDlpArgs.push('-o', outputPath, url);

    try {
      await execPromise('yt-dlp', ytDlpArgs);
    } catch (err) {
      if (err.message.includes('No video could be found')) {
        await reply({ embeds: [errorEmbed('No se encontró ningún video en ese tweet. Asegúrate de que el tweet contenga un video.')] });
      } else {
        await reply({ embeds: [errorEmbed('No se pudo descargar el video. Asegúrate de que el link sea válido y público.')] });
      }
      return;
    }

    if (!fs.existsSync(outputPath)) {
      await reply({ embeds: [errorEmbed('No se pudo generar el archivo de video.')] });
      return;
    }

    const fileSize = fs.statSync(outputPath).size;
    if (fileSize > MAX_FILE_SIZE_BYTES) {
      await reply({ embeds: [errorEmbed('El video es demasiado grande para enviarse (máximo 8MB). Intenta con un video más corto.')] });
      cleanupFile(outputPath);
      return;
    }

    const title = titleOverride || 'video';
    const safeTitle = title.replace(/[^a-z0-9]/gi, '_').slice(0, 50);

    await reply({
      files: [{ attachment: outputPath, name: `${safeTitle}.mp4` }]
    });
  } catch (e) {
    console.error('dl error:', e);
    await reply({ embeds: [errorEmbed('Algo salió mal al descargar el video.')] }).catch(() => {});
  } finally {
    cleanupFile(outputPath);
  }
}

async function handleDl(message, args) {
  let url = args[0];
  const isNsfwChannel = message.channel.id === NSFW_CHANNEL_ID;

  if (!url && message.reference?.messageId) {
    try {
      const referenced = await message.channel.messages.fetch(message.reference.messageId);
      const embed = referenced.embeds?.[0];
      if (embed?.url) url = embed.url;
    } catch {}
  }

  if (!url) {
    return message.reply({ embeds: [errorEmbed('Proporciona un link o responde a un mensaje con un link.\nEjemplo: `;dl https://youtube.com/...`')] });
  }

  if (!isYouTube(url) && !isTikTok(url) && !isInstagram(url) && !isTwitter(url)) {
    return message.reply({ embeds: [errorEmbed('Solo se aceptan links de YouTube, TikTok, Instagram o Twitter/X.')] });
  }

  const thinking = await message.reply({ embeds: [new EmbedBuilder().setColor(PASTEL_BLUE).setDescription('Descargando video...')] });

  await downloadAndSend(thinking, url, null, message.channel, isNsfwChannel);
}

module.exports = {
  downloadAndSend,
  async execute(message, parsedCommand) {
    return handleDl(message, parsedCommand?.args || []);
  }
};
