const SpotifyWebApi = require('spotify-web-api-node');
const { EmbedBuilder } = require('discord.js');

// Configuración de estilo
const BABY_BLUE = '#89CFF0';
const LOVABLE_API_URL = 'https://chidoris.lovable.app/api/public/spotify/token';

// Obtener Spotify API para el usuario desde Lovable
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
    const token = data.access_token || data.accessToken;

    if (!token) {
      return { error: 'no_token' };
    }

    const spotifyApi = new SpotifyWebApi();
    spotifyApi.setAccessToken(token);
    return { api: spotifyApi };
  } catch (err) {
    console.error('[Ya Command Token Fetch Error]:', err.message);
    return { error: 'network_error' };
  }
}

// Formatear milisegundos a mm:ss
function formatMs(ms) {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec < 10 ? '0' : ''}${sec}`;
}

module.exports = {
  name: 'ya',
  async execute(message, parsedCommand) {
    // Obtener la sesión de Spotify del usuario que ejecutó el comando
    const userRes = await getSpotifyApiForUser(message.author.id);

    // Si no ha vinculado su cuenta
    if (userRes.error === 'unlinked') {
      const unlinkedEmbed = new EmbedBuilder()
        .setColor(BABY_BLUE)
        .setTitle('🔗 Vincula tu Spotify ♡')
        .setDescription(`¡Hola <@${message.author.id}>! Para verificar si tu canción ya cuenta como stream, primero debes vincular tu cuenta.\n\n👉 **Ingresa aquí:**\nhttps://chidoris.lovable.app`)
        .setFooter({ text: 'Coloca tu ID de Discord y presiona Conectar Spotify ♡' });

      return message.reply({ embeds: [unlinkedEmbed] });
    }

    if (userRes.error) {
      const errorEmbed = new EmbedBuilder()
        .setColor(BABY_BLUE)
        .setTitle('⚠️ Error de Autenticación ♡')
        .setDescription('No se pudo verificar tu cuenta de Spotify en este momento. Intenta de nuevo.');

      return message.reply({ embeds: [errorEmbed] });
    }

    const spotifyApi = userRes.api;

    try {
      const playback = await spotifyApi.getMyCurrentPlaybackState();

      // Si no hay música sonando
      if (!playback.body || !playback.body.is_playing || !playback.body.item) {
        const noMusicEmbed = new EmbedBuilder()
          .setColor(BABY_BLUE)
          .setTitle('🎧 Nada en Reproducción ♡')
          .setDescription('No estás escuchando ninguna canción en Spotify en este momento.')
          .setFooter({ text: 'Pon una canción en Spotify y vuelve a intentar ♡' });

        return message.reply({ embeds: [noMusicEmbed] });
      }

      const track = playback.body.item;
      const progressMs = playback.body.progress_ms;
      const durationMs = track.duration_ms;

      // Regla: 50% de la canción + 3 segundos (3000 ms)
      const targetMs = (durationMs * 0.50) + 3000;
      const isStreamValid = progressMs >= targetMs;

      if (isStreamValid) {
        // YA CUENTA COMO STREAM
        const yaEmbed = new EmbedBuilder()
          .setColor(BABY_BLUE)
          .setTitle('✨ ¡Ya cuenta como stream! ♡')
          .setDescription(`**[${track.name}](${track.external_urls.spotify})**\nDe **${track.artists[0].name}**`)
          .setThumbnail(track.album.images[0]?.url || null)
          .addFields(
            { name: 'Progreso actual', value: `\`${formatMs(progressMs)}\` / \`${formatMs(durationMs)}\``, inline: true },
            { name: 'Meta (50% + 3s)', value: `\`${formatMs(targetMs)}\``, inline: true },
            { name: 'Estado', value: '✅ **Stream Válido**', inline: true }
          )
          .setFooter({ text: '¡Ya puedes saltarla o dejarla terminar! ♡' });

        return message.reply({ embeds: [yaEmbed] });
      } else {
        // AÚN NO CUENTA
        const remainingMs = targetMs - progressMs;
        const remainingSec = Math.ceil(remainingMs / 1000);

        const waitEmbed = new EmbedBuilder()
          .setColor(BABY_BLUE)
          .setTitle('⏳ Todavía no cuenta ♡')
          .setDescription(`**[${track.name}](${track.external_urls.spotify})**\nDe **${track.artists[0].name}**\n\nFaltan **${remainingSec} segundo${remainingSec === 1 ? '' : 's'}** (\`${formatMs(remainingMs)}\`) para alcanzar la meta.`)
          .setThumbnail(track.album.images[0]?.url || null)
          .addFields(
            { name: 'Progreso actual', value: `\`${formatMs(progressMs)}\` / \`${formatMs(durationMs)}\``, inline: true },
            { name: 'Meta (50% + 3s)', value: `\`${formatMs(targetMs)}\``, inline: true },
            { name: 'Estado', value: '❌ **En progreso...**', inline: true }
          )
          .setFooter({ text: `Espera ${remainingSec}s más y vuelve a usar ;ya ♡` });

        return message.reply({ embeds: [waitEmbed] });
      }
    } catch (err) {
      console.error('[Ya Command Error]:', err.message);
      const errorEmbed = new EmbedBuilder()
        .setColor(BABY_BLUE)
        .setTitle('⚠️ Error ♡')
        .setDescription('Ocurrió un problema al consultar tu reproducción en Spotify.');

      return message.reply({ embeds: [errorEmbed] });
    }
  }
};
