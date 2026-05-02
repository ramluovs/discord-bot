const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const PASTEL_BLUE = 0xaeefff;
const YOUTUBE_API_KEY = 'AIzaSyCbctfHiUDT7Fvgta_sFwmz_qYSRRFeQ5c';
const MAX_RESULTS = 25;
const NSFW_CHANNEL_ID = '1371340983752724561';

function errorEmbed(description) {
  return new EmbedBuilder().setColor(PASTEL_BLUE).setTitle('error').setDescription(description);
}

function formatDuration(iso) {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 'desconocido';
  const h = parseInt(match[1] || 0);
  const m = parseInt(match[2] || 0);
  const s = parseInt(match[3] || 0);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatViews(views) {
  const n = parseInt(views);
  if (isNaN(n)) return 'N/A';
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toString();
}

function buildEmbed(video, index, total) {
  const url = `https://www.youtube.com/watch?v=${video.id}`;
  return new EmbedBuilder()
    .setColor(PASTEL_BLUE)
    .setTitle(video.title)
    .setURL(url)
    .setThumbnail(video.thumbnail)
    .setDescription([
      `**Canal:** ${video.channel}`,
      `**Duración:** ${video.duration}`,
      `**Vistas:** ${video.views}`,
      '',
      `-# Video ${index + 1} de ${total}`
    ].join('\n'));
}

function buildButtons(index, total, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('yt_prev')
      .setLabel('◀')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || index === 0),
    new ButtonBuilder()
      .setCustomId('yt_next')
      .setLabel('▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || index === total - 1),
    new ButtonBuilder()
      .setCustomId('yt_dl')
      .setLabel('⬇ descargar')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled)
  );
}

async function searchYouTube(query) {
  const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&maxResults=${MAX_RESULTS}&key=${YOUTUBE_API_KEY}&safeSearch=none`;
  const searchRes = await fetch(searchUrl);
  const searchData = await searchRes.json();

  if (!searchData.items || searchData.items.length === 0) return [];

  const ids = searchData.items.map(item => item.id.videoId).join(',');
  const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics,status&id=${ids}&key=${YOUTUBE_API_KEY}`;
  const detailsRes = await fetch(detailsUrl);
  const detailsData = await detailsRes.json();

  return detailsData.items.map(item => ({
    id: item.id,
    title: item.snippet.title,
    channel: item.snippet.channelTitle,
    thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.default?.url,
    duration: formatDuration(item.contentDetails.duration),
    views: formatViews(item.statistics?.viewCount),
    ageRestricted: item.contentDetails.contentRating?.ytRating === 'ytAgeRestricted' || item.status?.madeForKids === false && item.contentDetails?.contentRating?.ytRating === 'ytAgeRestricted'
  }));
}

async function handleYt(message, args) {
  const query = args.join(' ').trim();

  if (!query) {
    return message.reply({ embeds: [errorEmbed('Escribe algo para buscar.\nEjemplo: `;yt blackpink how you like that`')] });
  }

  const thinking = await message.reply({ embeds: [new EmbedBuilder().setColor(PASTEL_BLUE).setDescription('Buscando en YouTube...')] });

  let videos;
  try {
    videos = await searchYouTube(query);
  } catch (e) {
    return thinking.edit({ embeds: [errorEmbed('No se pudo conectar con YouTube.')] });
  }

  if (!videos.length) {
    return thinking.edit({ embeds: [errorEmbed('No se encontraron resultados.')] });
  }

  let index = 0;
  const currentVideo = () => videos[index];

  const isNsfw = () => currentVideo().ageRestricted;
  const isNsfwChannel = message.channel.id === NSFW_CHANNEL_ID;

  if (isNsfw() && !isNsfwChannel) {
    return thinking.edit({ embeds: [errorEmbed('El primer resultado contiene contenido NSFW. Solo se puede ver en el canal NSFW.')] });
  }

  await thinking.edit({
    embeds: [buildEmbed(currentVideo(), index, videos.length)],
    components: [buildButtons(index, videos.length)]
  });

  const expiresAt = Math.floor((Date.now() + 3 * 60 * 1000) / 1000);
  const collector = thinking.createMessageComponentCollector({
    filter: i => ['yt_prev', 'yt_next', 'yt_dl'].includes(i.customId),
    time: 3 * 60 * 1000
  });

  collector.on('collect', async interaction => {
    try {
      if (interaction.customId === 'yt_prev' && index > 0) index--;
      if (interaction.customId === 'yt_next' && index < videos.length - 1) index++;

      if (interaction.customId === 'yt_dl') {
        await interaction.deferReply();
        const video = currentVideo();
        const url = `https://www.youtube.com/watch?v=${video.id}`;
        const dl = require('./dl');
        return dl.downloadAndSend(interaction, url, video.title, message.channel, isNsfwChannel);
      }

      const video = currentVideo();
      const nsfw = video.ageRestricted;

      if (nsfw && !isNsfwChannel) {
        return interaction.update({
          embeds: [errorEmbed('Este video contiene contenido NSFW. Solo se puede ver en el canal NSFW.')],
          components: [buildButtons(index, videos.length)]
        });
      }

      await interaction.update({
        embeds: [buildEmbed(video, index, videos.length)],
        components: [buildButtons(index, videos.length)]
      });
    } catch (e) {
      console.error('yt collector error:', e);
    }
  });

  collector.on('end', () => {
    thinking.edit({ components: [buildButtons(index, videos.length, true)] }).catch(() => {});
  });
}

module.exports = {
  async execute(message, parsedCommand) {
    return handleYt(message, parsedCommand?.args || []);
  }
};
