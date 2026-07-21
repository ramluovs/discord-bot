const SpotifyWebApi = require('spotify-web-api-node');
const { EmbedBuilder } = require('discord.js');

// Configuración
const BABY_BLUE = '#89CFF0';
const TARGET_CHANNEL_ID = '1528987534506594414';
const AUTHORIZED_USER_ID = '425825170205179906';

const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  refreshToken: process.env.SPOTIFY_REFRESH_TOKEN
});

// Estado del Modo Stream
let streamConfig = {
  enabled: false,
  percent: 50,
  extraSeconds: 5,
  lastSkippedTrackId: null,
  startTime: null,
  skippedCount: 0
};

let pollInterval = null;

async function ensureToken() {
  try {
    const data = await spotifyApi.refreshAccessToken();
    spotifyApi.setAccessToken(data.body['access_token']);
  } catch (err) {
    console.error('[Spotify] Error actualizando token:', err.message);
  }
}

// Formatear tiempo transcurrido en negrita
function formatTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  let parts = [];
  if (hours > 0) parts.push(`**${hours} ${hours === 1 ? 'hora' : 'horas'}**`);
  if (minutes > 0) parts.push(`**${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}**`);
  if (seconds > 0 || parts.length === 0) parts.push(`**${seconds} ${seconds === 1 ? 'segundo' : 'segundos'}**`);

  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} y ${parts[1]}`;
  return `${parts[0]}, ${parts[1]} y ${parts[2]}`;
}

// Comprobador en segundo plano para el Modo Stream
async function checkAndSkip(client) {
  try {
    await ensureToken();
    const data = await spotifyApi.getMyCurrentPlaybackState();

    if (!data.body || !data.body.is_playing || !data.body.item) return;

    const oldTrack = data.body.item;
    const progressMs = data.body.progress_ms;
    const durationMs = oldTrack.duration_ms;

    const targetMs = (durationMs * (streamConfig.percent / 100)) + (streamConfig.extraSeconds * 1000);

    if (progressMs >= targetMs && streamConfig.lastSkippedTrackId !== oldTrack.id) {
      streamConfig.lastSkippedTrackId = oldTrack.id;
      streamConfig.skippedCount++;

      // Saltar a la siguiente canción
      await spotifyApi.skipToNext();

      // Esperar un momento breve para que Spotify actualice la reproducción
      await new Promise(resolve => setTimeout(resolve, 800));

      let newTrack = null;
      try {
        const newPlayback = await spotifyApi.getMyCurrentPlaybackState();
        if (newPlayback.body && newPlayback.body.item) {
          newTrack = newPlayback.body.item;
        }
      } catch (e) {
        console.error('Error al obtener la nueva canción:', e.message);
      }

      if (client) {
        try {
          const targetChannel = client.channels.cache.get(TARGET_CHANNEL_ID) || await client.channels.fetch(TARGET_CHANNEL_ID);
          if (targetChannel) {
            let descriptionText = `Se saltó **${oldTrack.name}** de **${oldTrack.artists[0].name}**`;
            if (newTrack) {
              descriptionText += ` a **${newTrack.name}** de **${newTrack.artists[0].name}**`;
            }

            const skipEmbed = new EmbedBuilder()
              .setColor(BABY_BLUE)
              .setTitle('⚡ Auto-Salto ♡')
              .setDescription(descriptionText)
              .setThumbnail(newTrack?.album?.images[0]?.url || oldTrack.album?.images[0]?.url || null)
              .setFooter({ text: `Saltado al ${streamConfig.percent}% + ${streamConfig.extraSeconds}s ♡` });

            targetChannel.send({ embeds: [skipEmbed] });
          }
        } catch (err) {
          console.error('[Spotify] Error enviando mensaje al canal:', err.message);
        }
      }
    }
  } catch (err) {
    console.error('[Spotify Stream Error]:', err.message);
  }
}

module.exports = {
  async execute(message, parsedCommand) {
    const { commandName, args, prefix } = parsedCommand;

    // Verificar si es el usuario autorizado
    if (message.author.id !== AUTHORIZED_USER_ID) {
      const unauthorizedEmbed = new EmbedBuilder()
        .setColor(BABY_BLUE)
        .setTitle('🔒 Solo el Dueño ♡')
        .setDescription(`Lo siento, <@${message.author.id}>. Por ahora los comandos de Spotify están reservados únicamente para mi creador/a ♡`)
        .setFooter({ text: 'Próximamente disponible para todos ♡' });

      return message.reply({ embeds: [unauthorizedEmbed] });
    }

    await ensureToken();

    try {
      // --- COMANDO HELP ---
      if (commandName === 'help') {
        const helpEmbed = new EmbedBuilder()
          .setColor(BABY_BLUE)
          .setTitle('🎵 Comandos de Spotify ♡')
          .setDescription(`¡Puedes usar tanto \`;\` como \`chi \` como prefijo! ♡`)
          .addFields(
            { name: '🟢 Modo Stream ♡', value: `\`${prefix}stream\` - Activa o desactiva tu modo stream (**50% + 5s**)\n\`${prefix}stream 60 10\` - Ajusta porcentaje y segundos` },
            { name: '▶️ Controles de Reproducción ♡', value: `\`${prefix}play [canción]\` o \`${prefix}sp [canción]\` - Buscar y poner canción\n\`${prefix}pause\` - Pausar música\n\`${prefix}play\` - Reanudar música\n\`${prefix}skip\` - Saltar canción\n\`${prefix}stop\` - Detener música y apagar modo stream` }
          )
          .setFooter({ text: 'Spotify Premium Conectado ♡' });

        return message.reply({ embeds: [helpEmbed] });
      }

      // --- COMANDO STREAM (TOGGLE) ---
      if (commandName === 'stream') {
        const option = args[0]?.toLowerCase();

        // APAGAR STREAM
        if (streamConfig.enabled || option === 'off' || option === 'stop') {
          const durationMs = Date.now() - (streamConfig.startTime || Date.now());
          const formattedTime = formatTime(durationMs);
          const songsCount = streamConfig.skippedCount;

          streamConfig.enabled = false;
          if (pollInterval) clearInterval(pollInterval);
          pollInterval = null;
          streamConfig.lastSkippedTrackId = null;

          const offEmbed = new EmbedBuilder()
            .setColor(BABY_BLUE)
            .setTitle('🔴 Modo Stream ♡')
            .setDescription(`chi stream ♡ modo: **APAGADO**\n\n¡Sintonía finalizada! ♡\nTransmitiste **${songsCount} ${songsCount === 1 ? 'canción' : 'canciones'}** durante ${formattedTime}.`)
            .setFooter({ text: 'Las canciones se reproducirán normalmente ♡' });

          return message.reply({ embeds: [offEmbed] });
        }

        // ENCENDER STREAM
        const percent = Number(args[0]) || 50;
        const seconds = Number(args[1]) || 5;

        streamConfig.enabled = true;
        streamConfig.percent = percent;
        streamConfig.extraSeconds = seconds;
        streamConfig.startTime = Date.now();
        streamConfig.skippedCount = 0;

        if (!pollInterval) {
          pollInterval = setInterval(() => checkAndSkip(message.client), 2500);
        }

        let currentlyPlayingText = 'Ninguna canción en reproducción';
        let thumbnailUrl = null;

        try {
          const playback = await spotifyApi.getMyCurrentPlaybackState();
          if (playback.body && playback.body.item) {
            const currentTrack = playback.body.item;
            currentlyPlayingText = `**${currentTrack.name}** - **${currentTrack.artists[0].name}**`;
            thumbnailUrl = currentTrack.album.images[0]?.url || null;
          }
        } catch (e) {
          console.error('Error al obtener canción actual:', e.message);
        }

        const streamEmbed = new EmbedBuilder()
          .setColor(BABY_BLUE)
          .setTitle('chi stream ♡')
          .setDescription(`chi stream ♡ modo: **ENCENDIDO**\n\n🎶 **Reproduciendo actualmente:**\n${currentlyPlayingText}`)
          .addFields(
            { name: 'Porcentaje', value: `**${percent}%**`, inline: true },
            { name: 'Segundos extra', value: `**+${seconds}s**`, inline: true }
          )
          .setThumbnail(thumbnailUrl)
          .setFooter({ text: `Usa ${prefix}stream otra vez para desactivar ♡` });

        return message.reply({ embeds: [streamEmbed] });
      }

      // --- COMANDO PLAY ---
      if (commandName === 'play' || commandName === 'sp') {
        const query = args.join(' ');
        if (!query) {
          await spotifyApi.play();
          const resumeEmbed = new EmbedBuilder()
            .setColor(BABY_BLUE)
            .setTitle('▶️ Reproducción Reanudada ♡')
            .setDescription('La música de Spotify ha vuelto a sonar.');

          return message.reply({ embeds: [resumeEmbed] });
        }

        const searchRes = await spotifyApi.searchTracks(query);
        const track = searchRes.body.tracks?.items[0];

        if (!track) {
          const notFoundEmbed = new EmbedBuilder()
            .setColor(BABY_BLUE)
            .setTitle('❌ Canción no encontrada ♡')
            .setDescription(`No se encontró "${query}" en Spotify.`);

          return message.reply({ embeds: [notFoundEmbed] });
        }

        await spotifyApi.play({ uris: [track.uri] });

        const playEmbed = new EmbedBuilder()
          .setColor(BABY_BLUE)
          .setTitle('🎵 Sonando en Spotify ♡')
          .setDescription(`**[${track.name}](${track.external_urls.spotify})**\nDe **${track.artists[0].name}**`)
          .setThumbnail(track.album.images[0]?.url || null)
          .setFooter({ text: `Álbum: ${track.album.name} ♡` });

        return message.reply({ embeds: [playEmbed] });
      }

      // --- COMANDO PAUSE ---
      if (commandName === 'pause') {
        await spotifyApi.pause();
        const pauseEmbed = new EmbedBuilder()
          .setColor(BABY_BLUE)
          .setTitle('⏸️ Música Pausada ♡')
          .setDescription('Se ha pausado la reproducción en Spotify.');

        return message.reply({ embeds: [pauseEmbed] });
      }

      // --- COMANDO STOP ---
      if (commandName === 'stop') {
        await spotifyApi.pause();
        streamConfig.enabled = false;
        if (pollInterval) clearInterval(pollInterval);
        pollInterval = null;

        const stopEmbed = new EmbedBuilder()
          .setColor(BABY_BLUE)
          .setTitle('⏹️ Música Detenida ♡')
          .setDescription('Se pausó Spotify y se desactivó el Modo Stream.');

        return message.reply({ embeds: [stopEmbed] });
      }

      // --- COMANDO SKIP ---
      if (commandName === 'skip') {
        await spotifyApi.skipToNext();
        const skipEmbed = new EmbedBuilder()
          .setColor(BABY_BLUE)
          .setTitle('⏭️ Canción Saltada ♡')
          .setDescription('Se pasó a la siguiente canción en Spotify.');

        return message.reply({ embeds: [skipEmbed] });
      }

    } catch (err) {
      console.error('Error ejecutando comando de Spotify:', err);
      const errorEmbed = new EmbedBuilder()
        .setColor(BABY_BLUE)
        .setTitle('⚠️ Error de Spotify ♡')
        .setDescription(err.message || '¡Asegúrate de que Spotify esté activo en tu dispositivo!');

      return message.reply({ embeds: [errorEmbed] });
    }
  }
};
