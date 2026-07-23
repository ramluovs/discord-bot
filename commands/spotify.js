const SpotifyWebApi = require('spotify-web-api-node');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

// Configuración de estilo y API
const BABY_BLUE = '#89CFF0';
const TARGET_CHANNEL_ID = '1528987534506594414';
const LOVABLE_API_URL = 'https://chidoris.lovable.app/api/public/spotify/token';

// Caché de tokens en memoria (userId -> { token, expiresAt })
const tokenCache = new Map();

// Estado del Modo Stream INDEPENDIENTE POR USUARIO (userId -> config)
const activeStreams = new Map();

// Obtener la instancia de Spotify API usando caché para cada usuario
async function getSpotifyApiForUser(discordUserId, forceRefresh = false) {
  const now = Date.now();
  const cached = tokenCache.get(discordUserId);

  if (!forceRefresh && cached && cached.expiresAt > now) {
    const spotifyApi = new SpotifyWebApi();
    spotifyApi.setAccessToken(cached.token);
    return { api: spotifyApi };
  }

  try {
    const response = await fetch(`${LOVABLE_API_URL}?discord_user_id=${discordUserId}`);

    if (response.status === 404) {
      return { error: 'unlinked' };
    }

    if (!response.ok) {
      return { error: 'api_error' };
    }

    const data = await response.json();
    const token = data.access_token || data.accessToken;

    if (!token) {
      return { error: 'no_token' };
    }

    // Guardar en caché por 50 minutos
    const expiresInMs = ((data.expires_in || 3600) - 600) * 1000;
    tokenCache.set(discordUserId, {
      token: token,
      expiresAt: now + expiresInMs
    });

    const spotifyApi = new SpotifyWebApi();
    spotifyApi.setAccessToken(token);
    return { api: spotifyApi };
  } catch (err) {
    console.error('[Spotify Token Fetch Error]:', err.message || err);
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

// Comprobador individual por usuario para el Modo Stream
async function checkAndSkipForUser(client, userId) {
  const userStream = activeStreams.get(userId);
  if (!userStream) return;

  let userRes = await getSpotifyApiForUser(userId);
  if (userRes.error) {
    userStream.consecutiveErrors = (userStream.consecutiveErrors || 0) + 1;
    if (userStream.consecutiveErrors >= 5) {
      console.log(`[Spotify Stream] Deteniendo stream para ${userId} por errores continuos de token.`);
      clearInterval(userStream.intervalId);
      activeStreams.delete(userId);
    }
    return;
  }

  let spotifyApi = userRes.api;

  try {
    let data;
    try {
      data = await spotifyApi.getMyCurrentPlaybackState();
    } catch (apiErr) {
      const msg = apiErr.message || '';
      if (msg.includes('Access token') || apiErr.statusCode === 401) {
        userRes = await getSpotifyApiForUser(userId, true);
        if (userRes.error) return;
        spotifyApi = userRes.api;
        data = await spotifyApi.getMyCurrentPlaybackState();
      } else {
        throw apiErr;
      }
    }

    // Reiniciamos contador de errores si la llamada fue exitosa
    userStream.consecutiveErrors = 0;

    if (!data.body || !data.body.is_playing || !data.body.item) return;

    const oldTrack = data.body.item;
    const progressMs = data.body.progress_ms;
    const durationMs = oldTrack.duration_ms;

    const targetMs = (durationMs * (userStream.percent / 100)) + (userStream.extraSeconds * 1000);

    if (progressMs >= targetMs && userStream.lastSkippedTrackId !== oldTrack.id) {
      userStream.lastSkippedTrackId = oldTrack.id;
      userStream.skippedCount++;

      // Saltar canción
      await spotifyApi.skipToNext();

      await new Promise(resolve => setTimeout(resolve, 800));

      let newTrack = null;
      try {
        const newPlayback = await spotifyApi.getMyCurrentPlaybackState();
        if (newPlayback.body && newPlayback.body.item) {
          newTrack = newPlayback.body.item;
        }
      } catch (e) {
        console.error('Error al obtener la nueva canción:', e.message || JSON.stringify(e));
      }

      // Notificar si las notificaciones están activadas
      if (userStream.notifyOnSkip && client) {
        try {
          const targetChannel = client.channels.cache.get(TARGET_CHANNEL_ID) || await client.channels.fetch(TARGET_CHANNEL_ID);
          if (targetChannel) {
            let descriptionText = `<@${userId}> saltó **${oldTrack.name}** de **${oldTrack.artists[0].name}**`;
            if (newTrack) {
              descriptionText += ` a **${newTrack.name}** de **${newTrack.artists[0].name}**`;
            }

            const skipEmbed = new EmbedBuilder()
              .setColor(BABY_BLUE)
              .setTitle('⚡ Auto-Salto ♡')
              .setDescription(descriptionText)
              .setThumbnail(newTrack?.album?.images[0]?.url || oldTrack.album?.images[0]?.url || null)
              .setFooter({ text: `Saltado al ${userStream.percent}% + ${userStream.extraSeconds}s ♡` });

            targetChannel.send({ embeds: [skipEmbed] });
          }
        } catch (err) {
          console.error('[Spotify] Error enviando mensaje al canal:', err.message || JSON.stringify(err));
        }
      }
    }
  } catch (err) {
    userStream.consecutiveErrors = (userStream.consecutiveErrors || 0) + 1;
    
    // Formatea el error para revelar el texto exacto en lugar de [object Object]
    const rawError = err.body ? JSON.stringify(err.body) : (err.message || JSON.stringify(err));
    console.error(`[Spotify Stream Error - User ${userId}]:`, rawError);

    // Si acumula 5 errores seguidos, detiene el stream del usuario automáticamente
    if (userStream.consecutiveErrors >= 5) {
      console.log(`[Spotify Stream] Deteniendo automáticamente el Modo Stream para <@${userId}> tras 5 errores consecutivos.`);
      clearInterval(userStream.intervalId);
      activeStreams.delete(userId);
    }
  }
}

module.exports = {
  async execute(message, parsedCommand) {
    const { commandName, args, prefix } = parsedCommand;
    const userId = message.author.id;

    // --- COMANDO HELP ---
    if (commandName === 'help') {
      const helpEmbed = new EmbedBuilder()
        .setColor(BABY_BLUE)
        .setTitle('🎵 Comandos de Spotify ♡')
        .setDescription(`¡Puedes usar tanto \`;\` como \`chi \` como prefijo! ♡`)
        .addFields(
          { name: '🟢 Modo Stream ♡', value: `\`${prefix}stream\` - Activa o desactiva tu modo stream personal (**50% + 5s**)\n\`${prefix}stream 60 10\` - Ajusta tu porcentaje y segundos` },
          { name: '▶️ Controles de Reproducción ♡', value: `\`${prefix}play [canción]\` o \`${prefix}sp [canción]\` - Buscar y poner canción\n\`${prefix}pause\` - Pausar música\n\`${prefix}play\` - Reanudar música\n\`${prefix}skip\` - Saltar canción\n\`${prefix}stop\` - Detener música y apagar tu modo stream` }
        )
        .setFooter({ text: 'Spotify Conectado ♡' });

      return message.reply({ embeds: [helpEmbed] });
    }

    // Obtener la instancia de Spotify para este usuario
    const userRes = await getSpotifyApiForUser(userId);

    // Si la cuenta no está vinculada
    if (userRes.error === 'unlinked') {
      const unlinkedEmbed = new EmbedBuilder()
        .setColor(BABY_BLUE)
        .setTitle('🔗 Vincula tu Spotify ♡')
        .setDescription(`¡Hola <@${userId}>! Para usar los comandos de Spotify, primero debes vincular tu cuenta.\n\n👉 **Ingresa aquí:**\nhttps://chidoris.lovable.app`)
        .setFooter({ text: 'Coloca tu ID de Discord y presiona Conectar Spotify ♡' });

      return message.reply({ embeds: [unlinkedEmbed] });
    }

    if (userRes.error) {
      const errorEmbed = new EmbedBuilder()
        .setColor(BABY_BLUE)
        .setTitle('⚠️ Error de Autenticación ♡')
        .setDescription('No se pudo verificar tu cuenta con el servidor. Intenta de nuevo más tarde.');

      return message.reply({ embeds: [errorEmbed] });
    }

    const spotifyApi = userRes.api;

    try {
      // --- COMANDO STREAM ---
      if (commandName === 'stream') {
        const option = args[0]?.toLowerCase();
        const userStream = activeStreams.get(userId);

        // APAGAR STREAM (solo si no se pasan argumentos, o se pide explícitamente off/stop)
        if (userStream && (option === 'off' || option === 'stop' || !args[0])) {
          clearInterval(userStream.intervalId);

          const durationMs = Date.now() - userStream.startTime;
          const formattedTime = formatTime(durationMs);
          const songsCount = userStream.skippedCount;

          activeStreams.delete(userId);

          const offEmbed = new EmbedBuilder()
            .setColor(BABY_BLUE)
            .setTitle('🔴 Modo Stream ♡')
            .setDescription(`chi stream ♡ modo: **APAGADO**\n\n¡Sintonía finalizada para <@${userId}>! ♡\nTransmitiste **${songsCount} ${songsCount === 1 ? 'canción' : 'canciones'}** durante ${formattedTime}.`)
            .setFooter({ text: 'Tus canciones se reproducirán normalmente ♡' });

          return message.reply({ embeds: [offEmbed] });
        }

        // ENCENDER STREAM (o reconfigurar uno que ya estaba activo)
        const percent = args[0] !== undefined && !isNaN(args[0]) ? Number(args[0]) : 50;
        const seconds = args[1] !== undefined && !isNaN(args[1]) ? Number(args[1]) : 5;

        // Si ya había un stream corriendo para este usuario, apagamos su intervalo
        // antes de crear uno nuevo para no duplicar los chequeos de auto-salto.
        if (userStream) {
          clearInterval(userStream.intervalId);
        }

        const intervalId = setInterval(() => checkAndSkipForUser(message.client, userId), 2500);

        const newStreamConfig = {
          percent,
          extraSeconds: seconds,
          lastSkippedTrackId: null,
          startTime: Date.now(),
          skippedCount: 0,
          notifyOnSkip: true,
          consecutiveErrors: 0,
          intervalId
        };

        activeStreams.set(userId, newStreamConfig);

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
          const rawError = e.body ? JSON.stringify(e.body) : (e.message || JSON.stringify(e));
          console.error('Error al obtener canción actual:', rawError);
        }

        const streamEmbed = new EmbedBuilder()
          .setColor(BABY_BLUE)
          .setTitle('chi stream ♡')
          .setDescription(`chi stream ♡ modo: **ENCENDIDO** para <@${userId}>\n\n🎶 **Reproduciendo actualmente:**\n${currentlyPlayingText}\n\n¿Quieres que envíe un mensaje cada vez que se salte una canción? ♡`)
          .addFields(
            { name: 'Porcentaje', value: `**${percent}%**`, inline: true },
            { name: 'Segundos extra', value: `**+${seconds}s**`, inline: true }
          )
          .setThumbnail(thumbnailUrl)
          .setFooter({ text: `Responde en 30s ♡` });

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`stream_notify_yes_${userId}`)
            .setLabel('Sí ♡')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`stream_notify_no_${userId}`)
            .setLabel('No ♡')
            .setStyle(ButtonStyle.Secondary)
        );

        const replyMsg = await message.reply({ embeds: [streamEmbed], components: [row] });

        const filter = i => i.user.id === userId;
        const collector = replyMsg.createMessageComponentCollector({ filter, time: 30000 });

        collector.on('collect', async i => {
          const currentConfig = activeStreams.get(userId);
          if (currentConfig) {
            if (i.customId.startsWith('stream_notify_yes')) {
              currentConfig.notifyOnSkip = true;
            } else if (i.customId.startsWith('stream_notify_no')) {
              currentConfig.notifyOnSkip = false;
            }
          }

          const disabledRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('yes_disabled')
              .setLabel('Sí ♡')
              .setStyle(ButtonStyle.Success)
              .setDisabled(true),
            new ButtonBuilder()
              .setCustomId('no_disabled')
              .setLabel('No ♡')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(true)
          );

          const isNotifOn = currentConfig ? currentConfig.notifyOnSkip : true;
          const updatedEmbed = EmbedBuilder.from(streamEmbed)
            .setFooter({ text: isNotifOn ? 'Notificaciones activadas ♡' : 'Notificaciones desactivadas ♡' });

          await i.update({ embeds: [updatedEmbed], components: [disabledRow] });
          collector.stop();
        });

        collector.on('end', async (collected, reason) => {
          if (reason === 'time' && collected.size === 0) {
            const disabledRow = new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId('yes_disabled')
                .setLabel('Sí ♡')
                .setStyle(ButtonStyle.Success)
                .setDisabled(true),
              new ButtonBuilder()
                .setCustomId('no_disabled')
                .setLabel('No ♡')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true)
            );

            const expiredEmbed = EmbedBuilder.from(streamEmbed)
              .setFooter({ text: 'Tiempo agotado (notificaciones activadas por defecto) ♡' });

            try {
              await replyMsg.edit({ embeds: [expiredEmbed], components: [disabledRow] });
            } catch (err) {
              console.error('Error al actualizar mensaje expirado:', err.message || JSON.stringify(err));
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
          .setDescription('Se ha pausado la reproducción en tu Spotify.');

        return message.reply({ embeds: [pauseEmbed] });
      }

      // --- COMANDO STOP ---
      if (commandName === 'stop') {
        await spotifyApi.pause();

        if (activeStreams.has(userId)) {
          const userStream = activeStreams.get(userId);
          clearInterval(userStream.intervalId);
          activeStreams.delete(userId);
        }

        const stopEmbed = new EmbedBuilder()
          .setColor(BABY_BLUE)
          .setTitle('⏹️ Música Detenida ♡')
          .setDescription('Se pausó tu Spotify y se desactivó tu Modo Stream.');

        return message.reply({ embeds: [stopEmbed] });
      }

      // --- COMANDO SKIP ---
      if (commandName === 'skip') {
        await spotifyApi.skipToNext();
        const skipEmbed = new EmbedBuilder()
          .setColor(BABY_BLUE)
          .setTitle('⏭️ Canción Saltada ♡')
          .setDescription('Se pasó a la siguiente canción en tu Spotify.');

        return message.reply({ embeds: [skipEmbed] });
      }

    } catch (err) {
      const rawError = err.body ? JSON.stringify(err.body) : (err.message || JSON.stringify(err));
      console.error('Error ejecutando comando de Spotify:', rawError);

      const errorEmbed = new EmbedBuilder()
        .setColor(BABY_BLUE)
        .setTitle('⚠️ Error de Spotify ♡')
        .setDescription(err.message || '¡Asegúrate de tener Spotify activo en tu dispositivo y contar con Spotify Premium!');

      return message.reply({ embeds: [errorEmbed] });
    }
  }
};
