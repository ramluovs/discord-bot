const { EmbedBuilder } = require('discord.js');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const PASTEL_BLUE = 0xaeefff;
const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024;
const YOUTUBE_MAX_SECONDS = 5 * 60;
const TIKTOK_MAX_SECONDS = 3 * 60;
const TEMP_DIR = path.join(__dirname, '../../temp');

function errorEmbed(description) {
  return new EmbedBuilder()
    .setColor(PASTEL_BLUE)
    .setTitle('error')
    .setDescription(description);
}

function infoEmbed(description) {
  return new EmbedBuilder()
    .setColor(PASTEL_BLUE)
    .setTitle('✧ c .mp3')
    .setDescription(description);
}

function ensureTempDir() {
  if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });
}

function cleanupFile(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {}
}

function getFileSizeBytes(filePath) {
  try {
    return fs.statSync(filePath).size;
  } catch { return 0; }
}

function execPromise(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: 120000 }, (error, stdout, stderr) => {
      if (error) reject(new Error(stderr || error.message));
      else resolve(stdout);
    });
  });
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(destPath);
    protocol.get(url, response => {
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', reject);
  });
}

function isYouTubeUrl(url) {
  return /^https?:\/\/(www\.)?(youtube\.com\/watch|youtu\.be\/|youtube\.com\/shorts\/)/.test(url);
}

function isTikTokUrl(url) {
  return /^https?:\/\/(www\.|vm\.)?tiktok\.com\//.test(url);
}

async function getDurationSeconds(filePath) {
  return new Promise((resolve, reject) => {
    execFile('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath
    ], (error, stdout) => {
      if (error) reject(error);
      else resolve(parseFloat(stdout.trim()) || 0);
    });
  });
}

async function convertToMp3(inputPath, outputPath) {
  await execPromise('ffmpeg', [
    '-i', inputPath,
    '-vn',
    '-acodec', 'libmp3lame',
    '-q:a', '2',
    '-y',
    outputPath
  ]);
}

async function handleConvert(message, args) {
  const attachment = message.attachments.first();
  const link = args[0] || null;

  const USAGE = [
    'Uso:',
    '• Adjunta un archivo `.mp4` y usa `;c .mp3`',
    '• O pega un link de YouTube o TikTok: `;c .mp3 https://...`',
    '',
    'No puedes usar un archivo adjunto y un link al mismo tiempo.',
    'YouTube: máximo 5 minutos · TikTok: máximo 3 minutos · MP3 máximo 8MB'
  ].join('\n');

  if (!attachment && !link) {
    return message.reply({ embeds: [errorEmbed(USAGE)] });
  }

  if (attachment && link) {
    return message.reply({ embeds: [errorEmbed(`No puedes adjuntar un archivo y un link al mismo tiempo.\n\n${USAGE}`)] });
  }

  ensureTempDir();
  const timestamp = Date.now();
  let inputPath = null;
  let outputPath = path.join(TEMP_DIR, `output_${timestamp}.mp3`);
  let downloadedInput = null;

  const thinking = await message.reply({ embeds: [infoEmbed('Procesando... esto puede tomar unos segundos.')] });

  try {
    if (attachment) {
      if (!attachment.contentType?.includes('video') && !attachment.name?.endsWith('.mp4')) {
        await thinking.edit({ embeds: [errorEmbed('El archivo adjunto tiene que ser un archivo `.mp4`.')] });
        return;
      }

      inputPath = path.join(TEMP_DIR, `input_${timestamp}.mp4`);
      downloadedInput = inputPath;
      await downloadFile(attachment.url, inputPath);

      const duration = await getDurationSeconds(inputPath).catch(() => null);
      if (duration && duration > YOUTUBE_MAX_SECONDS) {
        await thinking.edit({ embeds: [errorEmbed('El video es demasiado largo. Máximo permitido: 5 minutos.')] });
        return;
      }
    } else if (link) {
      const isYT = isYouTubeUrl(link);
      const isTT = isTikTokUrl(link);

      if (!isYT && !isTT) {
        await thinking.edit({ embeds: [errorEmbed('Solo se aceptan links de YouTube o TikTok.')] });
        return;
      }

      const maxSeconds = isTT ? TIKTOK_MAX_SECONDS : YOUTUBE_MAX_SECONDS;
      const maxLabel = isTT ? '3 minutos' : '5 minutos';

      const ytDlpOutput = path.join(TEMP_DIR, `input_${timestamp}.mp3`);
      inputPath = ytDlpOutput;
      downloadedInput = ytDlpOutput;
      outputPath = ytDlpOutput;

      try {
        await execPromise('yt-dlp', [
          '--no-playlist',
          '--match-filter', `duration <= ${maxSeconds}`,
          '-x',
          '--audio-format', 'mp3',
          '--audio-quality', '2',
          '--no-part',
          '-o', ytDlpOutput,
          link
        ]);
      } catch (err) {
        if (err.message.includes('does not pass filter') || err.message.includes('duration')) {
          await thinking.edit({ embeds: [errorEmbed(`El video es demasiado largo. Máximo permitido: ${maxLabel}.`)] });
          return;
        }
        await thinking.edit({ embeds: [errorEmbed('No se pudo descargar el video. Asegúrate de que el link sea válido y público.')] });
        return;
      }

      outputPath = ytDlpOutput;
    }

    if (inputPath && inputPath !== outputPath && fs.existsSync(inputPath)) {
      await convertToMp3(inputPath, outputPath);
    }

    const fileSize = getFileSizeBytes(outputPath);
    if (fileSize > MAX_FILE_SIZE_BYTES) {
      await thinking.edit({ embeds: [errorEmbed('El archivo MP3 resultante supera los 8MB. Intenta con un video más corto.')] });
      return;
    }

    if (!fs.existsSync(outputPath) || fileSize === 0) {
      await thinking.edit({ embeds: [errorEmbed('No se pudo generar el archivo MP3.')] });
      return;
    }

    await thinking.edit({ embeds: [infoEmbed('¡Listo! Aquí está tu archivo MP3.')] });
    await message.reply({ files: [{ attachment: outputPath, name: `audio_${timestamp}.mp3` }] });
  } catch (error) {
    console.error('Convert error:', error);
    await thinking.edit({ embeds: [errorEmbed('Algo salió mal al convertir el archivo.')] }).catch(() => {});
  } finally {
    cleanupFile(downloadedInput);
    if (outputPath !== downloadedInput) cleanupFile(outputPath);
  }
}

module.exports = {
  async execute(message, parsedCommand) {
    const args = parsedCommand?.args || [];
    if (args[0] !== '.mp3') {
      const { EmbedBuilder } = require('discord.js');
      return message.reply({
        embeds: [new EmbedBuilder().setColor(0xaeefff).setTitle('error').setDescription('Uso: `;c .mp3` con un archivo .mp4 adjunto o un link de YouTube/TikTok.')]
      });
    }
    return handleConvert(message, args.slice(1));
  }
};
