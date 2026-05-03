const { EmbedBuilder } = require('discord.js');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const PASTEL_BLUE = 0xaeefff;
const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024;
const TEMP_DIR = path.join(__dirname, '../../temp');
const NSFW_CHANNEL_ID = '1371340983752724561';
const TWITTER_COOKIES_FILE = path.join(__dirname, '../../cookies/twitter_cookies.txt');
const SPOTIFY_CLIENT_ID = '69b5e7cef07046a2af0eb0958ed7ca5d';
const SPOTIFY_CLIENT_SECRET = '856bb09d72e04a4f963bb3f347e8d36d';

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

function isSpotify(url) {
  return /^https?:\/\/(open\.)?spotify\.com\/track\//.test(url);
}

function isSoundCloud(url) {
  return /^https?:\/\/(www\.)?soundcloud\.com/.test(url);
}

async function getSpotifyToken() {
  const credentials = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64');
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });
  const data = await res.json();
  return data.access_token || null;
}

async function getSpotifyTrackInfo(url) {
  const match = url.match(/track\/([a-zA-Z0-9]+)/);
  if (!match) return null;
  const trackId = match[1];
  const token = await getSpotifyToken();
  if (!token) return null;
  const res = await fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await res.json();
  if (!data.name) return null;
  const artists = data.artists.map(a => a.name).join(', ');
  return { name: data.name, artist: artists };
}

async function downloadAndSend(messageOrInteraction, url, titleOverride, channel, isNsfwChannel, asMp3 = false) {
  ensureTempDir();
  const timestamp = Date.now();
  const outputPath = path.join(TEMP_DIR, `dl_${timestamp}.${(asMp3 || isSoundCloud(url)) ? 'mp3' : 'mp4'}`);
  const isInteraction = !!messageOrInteraction.deferReply;

  const reply = async opts => {
    if (isInteraction) return messageOrInteraction.editReply(opts);
    return messageOrInteraction.reply(opts);
  };

  try {
    const ytDlpArgs = [
      '--no-playlist'
    ];

    if (asMp3 || isSoundCloud(url)) {
      ytDlpArgs.push('-x', '--audio-format', 'mp3', '--audio-quality', '2');
    } else {
      ytDlpArgs.push('-f', 'mp4/bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best');
    }
    ytDlpArgs.push('--no-part');

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
      files: [{ attachment: outputPath, name: `${safeTitle}.${(asMp3 || isSoundCloud(url)) ? 'mp3' : 'mp4'}` }]
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

  if (isSpotify(url)) {
    const info = await getSpotifyTrackInfo(url);
    if (!info) {
      return message.reply({
        embeds: [errorEmbed('No se pudo obtener la información de esa canción de Spotify.')]
      });
    }
    const searchQuery = `${info.name} ${info.artist}`;
    return message.reply({
      embeds: [new EmbedBuilder()
        .setColor(PASTEL_BLUE)
        .setTitle('✧ spotify')
        .setDescription([
          `**${info.name}** — ${info.artist}`,
          ``,
          `Usa este comando para descargarla:`,
          `\`;yt ${searchQuery}\``,
          `\`\`\`;yt ${searchQuery}\`\`\``
        ].join('\n'))
      ]
    });
  }

  if (!isYouTube(url) && !isTikTok(url) && !isInstagram(url) && !isTwitter(url)) {
    return message.reply({ embeds: [errorEmbed('Solo se aceptan links de YouTube, TikTok, Instagram, Twitter/X o Spotify.')] });
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
