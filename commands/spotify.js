const SpotifyWebApi = require('spotify-web-api-node');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

// Configuración
const BABY_BLUE = '#89CFF0';
const TARGET_CHANNEL_ID = '1528987534506594414';
const LOVABLE_API_URL = 'https://chidoris.lovable.app/api/public/spotify/token';

// Estado del Modo Stream
let streamConfig = {
  enabled: false,
  userId: null,
  percent: 50,
  extraSeconds: 5,
  lastSkippedTrackId: null,
  startTime: null,
  skippedCount: 0,
  notifyOnSkip: true
};

let pollInterval = null;

// Obtener la instancia de Spotify API con el token del usuario desde Lovable
async function getSpotifyApiForUser(discordUserId) {
  try {
    const response = await fetch(`${LOVABLE_API_URL}?discord_user_id=${discordUserId}`);

    if (response.status === 404) {
      return { error: 'unlinked' };
    }

    if (!response.ok) {
      return { error: 'api_error' };
    }

    const data = await response.json();
    const spotifyApi = new SpotifyWebApi();
    spotifyApi.setAccessToken(data.access_token);
    return { api: spotifyApi };
  } catch (err) {
    console.error('[Spotify Token Fetch Error]:', err.message);
    return { error: 'network_error' };
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
  if (!streamConfig.enabled || !streamConfig.userId) return;

  const userRes = await getSpotifyApiForUser(streamConfig.userId);
  if (userRes.error) return;

  const spotifyApi = userRes.api;

  try {
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

      // Esperar un momento breve para obtener la nueva canción
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

      // Solo enviar mensaje si la notificación está activada
      if (streamConfig.notifyOnSkip && client) {
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

    // --- COMANDO HELP (Disponible siempre sin consultar token) ---
    if (commandName === 'help') {
      const helpEmbed = new EmbedBuilder()
        .setColor(BABY_BLUE)
        .setTitle('🎵 Comandos de Spotify ♡')
        .setDescription(`¡Puedes usar tanto \`;\` como \`chi \` como prefijo! ♡`)
        .addFields(
          { name: '🟢 Modo Stream ♡', value: `\`${prefix}stream\` - Activa o desactiva tu modo stream (**50% + 5s**)\n\`${prefix}stream 60 10\` - Ajusta porcentaje y segundos` },
          { name: '▶️ Controles de Reproducción ♡', value: `\`${prefix}play [canción]\` o \`${prefix}sp [canción]\` - Buscar y poner canción\n\`${prefix}pause\` - Pausar música\n\`${prefix}play\` - Reanudar música\n\`${prefix}skip\` - Saltar canción\n\`${prefix}stop\` - Detener música y apagar modo stream` }
        )
        .setFooter({ text: 'Spotify Conectado ♡' });

      return message.reply({ embeds: [helpEmbed] });
    }

    // Obtener la instancia de Spotify para el usuario de Discord
    const userRes = await getSpotifyApiForUser(message.author.id);

    // Si la cuenta no está vinculada en Lovable
    if (userRes.error === 'unlinked') {
      const unlinkedEmbed = new EmbedBuilder()
        .setColor(BABY_BLUE)
        .setTitle('🔗 Vincula tu Spotify ♡')
        .setDescription(`¡Hola <@${message.author.id}>! Para usar los comandos de Spotify, primero debes vincular tu cuenta.\n\n👉 **Ingresa aquí:**\nhttps://chidoris.lovable.app`)
        .setFooter({ text: 'Coloca tu ID de Discord y presiona Conectar Spotify ♡' });

      return message.reply({ embeds: [unlinkedEmbed] });
    }

    // Error de conexión con el servidor
    if (userRes.error) {
      const errorEmbed = new EmbedBuilder()
        .setColor(BABY_BLUE)
        .setTitle('⚠️ Error de Autenticación ♡')
        .setDescription('No se pudo verificar tu cuenta con el servidor. Intenta de nuevo más tarde.');

      return message.reply({ embeds: [errorEmbed] });
    }

    const spotifyApi = userRes.api;

    try {
      // --- COMANDO STREAM (TOGGLE) ---
      if (commandName === 'stream') {
        const option = args[0]?.toLowerCase();

        // APAGAR STREAM
        if (streamConfig.enabled || option === 'off' || option === 'stop') {
          const durationMs = Date.now() - (streamConfig.startTime || Date.now());
          const formattedTime = formatTime(durationMs);
          const songsCount = streamConfig.skippedCount;

          streamConfig.enabled = false;
          streamConfig.userId = null;
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
        streamConfig.userId = message.author.id;
        streamConfig.percent = percent;
        streamConfig.extraSeconds = seconds;
        streamConfig.startTime = Date.now();
        streamConfig.skippedCount = 0;
        streamConfig.notifyOnSkip = true;

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
          .setDescription(`chi stream ♡ modo: **ENCENDIDO**\n\n🎶 **Reproduciendo actualmente:**\n${currentlyPlayingText}\n\n¿Quieres que envíe un mensaje cada vez que se salte una canción? ♡`)
          .addFields(
            { name: 'Porcentaje', value: `**${percent}%**`, inline: true },
            { name: 'Segundos extra', value: `**+${seconds}s**`, inline: true }
          )
          .setThumbnail(thumbnailUrl)
          .setFooter({ text: `Responde en 30s ♡` });

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('stream_notify_yes')
            .setLabel('Sí ♡')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId('stream_notify_no')
            .setLabel('No ♡')
            .setStyle(ButtonStyle.Secondary)
        );

        const replyMsg = await message.reply({ embeds: [streamEmbed], components: [row] });

        const filter = i => i.user.id === message.author.id;
        const collector = replyMsg.createMessageComponentCollector({ filter, time: 30000 });

        collector.on('collect', async i => {
          if (i.customId === 'stream_notify_yes') {
            streamConfig.notifyOnSkip = true;
          } else if (i.customId === 'stream_notify_no') {
            streamConfig.notifyOnSkip = false;
          }

          const disabledRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('stream_notify_yes')
              .setLabel('Sí ♡')
              .setStyle(ButtonStyle.Success)
              .setDisabled(true),
            new ButtonBuilder()
              .setCustomId('stream_notify_no')
              .setLabel('No ♡')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(true)
          );

          const updatedEmbed = EmbedBuilder.from(streamEmbed)
            .setFooter({ text: streamConfig.notifyOnSkip ? 'Notificaciones activadas ♡' : 'Notificaciones desactivadas ♡' });

          await i.update({ embeds: [updatedEmbed], components: [disabledRow] });
          collector.stop();
        });

        collector.on('end', async (collected, reason) => {
          if (reason === 'time' && collected.size === 0) {
            streamConfig.notifyOnSkip = true;

            const disabledRow = new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId('stream_notify_yes')
                .setLabel('Sí ♡')
                .setStyle(ButtonStyle.Success)
                .setDisabled(true),
              new ButtonBuilder()
                .setCustomId('stream_notify_no')
                .setLabel('No ♡')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true)
            );

            const expiredEmbed = EmbedBuilder.from(streamEmbed)
              .setFooter({ text: 'Tiempo agotado (notificaciones activadas por defecto) ♡' });

            try {
              await replyMsg.edit({ embeds: [expiredEmbed], components: [disabledRow] });
            } catch (err) {
              console.error('Error al actualizar mensaje expirado:', err.message);
            }
          }
        });

        return;
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
        streamConfig.userId = null;
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
        .setDescription(err.message || '¡Asegúrate de tener Spotify activo en tu dispositivo!');

      return message.reply({ embeds: [errorEmbed] });
    }
  }
};
