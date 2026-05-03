const { EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const PASTEL_BLUE = 0xaeefff;
const TRACKING_FILE = path.join(__dirname, '../data/tracking.json');
const TRACK_HISTORY_CHANNEL_ID = '1500617008226762875';
const TRACKING_LIST_CHANNEL_ID = '1500618973451124827';
const SPOTIFY_CLIENT_ID = '69b5e7cef07046a2af0eb0958ed7ca5d';
const SPOTIFY_CLIENT_SECRET = '856bb09d72e04a4f963bb3f347e8d36d';
const YOUTUBE_API_KEY = 'AIzaSyCbctfHiUDT7Fvgta_sFwmz_qYSRRFeQ5c';
const ALLOWED_ROLES = ['1340864854243803248', '1500620580024745994'];

function hasRole(message) {
  return message.member?.roles.cache.some(r => ALLOWED_ROLES.includes(r.id)) ?? false;
}

function errorEmbed(desc) {
  return new EmbedBuilder().setColor(PASTEL_BLUE).setTitle('error').setDescription(desc);
}

function loadTracking() {
  try {
    if (!fs.existsSync(TRACKING_FILE)) return { artists: [] };
    return JSON.parse(fs.readFileSync(TRACKING_FILE, 'utf8'));
  } catch { return { artists: [] }; }
}

function saveTracking(data) {
  try {
    const dir = path.dirname(TRACKING_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(TRACKING_FILE, JSON.stringify(data, null, 2));
  } catch (e) { console.error('Failed to save tracking:', e); }
}

async function getSpotifyToken() {
  const creds = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64');
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Authorization': `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials'
  });
  const data = await res.json();
  return data.access_token || null;
}

async function getSpotifyArtistInfo(artistId) {
  const token = await getSpotifyToken();
  if (!token) return null;
  const res = await fetch(`https://api.spotify.com/v1/artists/${artistId}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await res.json();
  if (!data.name) return null;
  return {
    name: data.name,
    image: data.images?.[0]?.url || null,
    followers: data.followers?.total || 0,
    genres: data.genres?.slice(0, 3).join(', ') || 'Unknown',
    url: `https://open.spotify.com/artist/${artistId}`
  };
}

async function getSpotifyLatestReleases(artistId) {
  const token = await getSpotifyToken();
  if (!token) return [];
  const res = await fetch(
    `https://api.spotify.com/v1/artists/${artistId}/albums?include_groups=album,single,appears_on,compilation&limit=10&market=US`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  );
  const data = await res.json();
  return (data.items || []).map(item => ({
    id: item.id,
    name: item.name,
    type: item.album_type,
    releaseDate: item.release_date,
    image: item.images?.[0]?.url || null,
    url: item.external_urls?.spotify || `https://open.spotify.com/album/${item.id}`,
    totalTracks: item.total_tracks,
    artists: item.artists?.map(a => a.name).join(', ') || 'Unknown'
  }));
}

async function getYouTubeChannelInfo(channelUrl) {
  const handleMatch = channelUrl.match(/@([\w-]+)/);
  const idMatch = channelUrl.match(/channel\/([\w-]+)/);

  let channelId = null;

  if (handleMatch) {
    const searchRes = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent('@' + handleMatch[1])}&type=channel&maxResults=1&key=${YOUTUBE_API_KEY}`
    );
    const searchData = await searchRes.json();
    channelId = searchData.items?.[0]?.snippet?.channelId || null;
  } else if (idMatch) {
    channelId = idMatch[1];
  }

  if (!channelId) return null;

  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&id=${channelId}&key=${YOUTUBE_API_KEY}`
  );
  const data = await res.json();
  const ch = data.items?.[0];
  if (!ch) return null;

  return {
    id: channelId,
    name: ch.snippet.title,
    description: ch.snippet.description?.slice(0, 100) || '',
    image: ch.snippet.thumbnails?.high?.url || ch.snippet.thumbnails?.default?.url || null,
    subscribers: parseInt(ch.statistics?.subscriberCount || 0),
    url: `https://www.youtube.com/channel/${channelId}`,
    uploadsPlaylistId: ch.contentDetails?.relatedPlaylists?.uploads || null
  };
}

async function getYouTubeLatestVideos(uploadsPlaylistId, limit = 10) {
  if (!uploadsPlaylistId) return [];
  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${uploadsPlaylistId}&maxResults=${limit}&key=${YOUTUBE_API_KEY}`
  );
  const data = await res.json();
  return (data.items || []).map(item => ({
    id: item.contentDetails?.videoId || item.snippet?.resourceId?.videoId,
    title: item.snippet?.title,
    description: item.snippet?.description?.slice(0, 150) || '',
    thumbnail: item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.default?.url || null,
    publishedAt: item.snippet?.publishedAt,
    url: `https://www.youtube.com/watch?v=${item.contentDetails?.videoId || item.snippet?.resourceId?.videoId}`,
    channelTitle: item.snippet?.channelTitle
  }));
}

async function saveToTrackingListChannel(client, data) {
  try {
    const channel = await client.channels.fetch(TRACKING_LIST_CHANNEL_ID);
    if (!channel || !channel.isTextBased()) return;
    const tracking = loadTracking();
    const content = JSON.stringify(tracking.artists);
    const msgs = await channel.messages.fetch({ limit: 10 });
    const existing = msgs.find(m => m.author.id === client.user.id && m.content.startsWith('TRACKING_LIST:'));
    if (existing) {
      await existing.edit(`TRACKING_LIST:${content}`);
    } else {
      await channel.send(`TRACKING_LIST:${content}`);
    }
  } catch (e) { console.error('Failed to save tracking list to channel:', e); }
}

async function postNewRelease(client, type, artistName, release, artistImage) {
  try {
    const channel = await client.channels.fetch(TRACK_HISTORY_CHANNEL_ID);
    if (!channel || !channel.isTextBased()) return;

    if (type === 'spotify') {
      const typeLabel = {
        album: '💿 New Album',
        single: '🎵 New Single',
        compilation: '📀 New Compilation',
        appears_on: '🎤 New Feature'
      }[release.type] || '🎵 New Release';

      const embed = new EmbedBuilder()
        .setColor(PASTEL_BLUE)
        .setTitle(`${typeLabel}: ${release.name}`)
        .setURL(release.url)
        .setDescription([
          `**Artist:** ${artistName}`,
          `**Features:** ${release.artists}`,
          `**Tracks:** ${release.totalTracks}`,
          `**Released:** ${release.releaseDate}`,
          `**Type:** ${release.type}`
        ].join('\n'))
        .setThumbnail(artistImage || null)
        .setTimestamp();

      if (release.image) embed.setImage(release.image);

      const msg = await channel.send({
        content: `NEW_RELEASE:spotify:${JSON.stringify({ artistName, releaseId: release.id, releaseDate: release.releaseDate })}`,
        embeds: [embed]
      });
      return msg;
    }

    if (type === 'youtube') {
      const embed = new EmbedBuilder()
        .setColor(PASTEL_BLUE)
        .setTitle(`▶ New Video: ${release.title}`)
        .setURL(release.url)
        .setDescription([
          `**Channel:** ${artistName}`,
          `**Published:** ${new Date(release.publishedAt).toLocaleDateString('es-ES', { dateStyle: 'long' })}`,
          release.description ? `**Description:** ${release.description}` : null
        ].filter(Boolean).join('\n'))
        .setThumbnail(artistImage || null)
        .setTimestamp();

      if (release.thumbnail) embed.setImage(release.thumbnail);

      const msg = await channel.send({
        content: `NEW_RELEASE:youtube:${JSON.stringify({ artistName, videoId: release.id, publishedAt: release.publishedAt })}`,
        embeds: [embed]
      });
      return msg;
    }
  } catch (e) { console.error('Failed to post new release:', e); }
}

async function checkNewReleases(client) {
  const tracking = loadTracking();
  if (!tracking.artists.length) return;

  const spotifyArtists = tracking.artists.filter(a => a.platform === 'spotify');
  const youtubeArtists = tracking.artists.filter(a => a.platform === 'youtube');

  const totalArtists = tracking.artists.length;
  const CHECK_INTERVAL_MS = 60 * 60 * 1000;
  const delayBetween = totalArtists > 1 ? Math.floor(CHECK_INTERVAL_MS / totalArtists) : 0;

  let delay = 0;

  for (const artist of spotifyArtists) {
    setTimeout(async () => {
      try {
        const releases = await getSpotifyLatestReleases(artist.platformId);
        const knownIds = new Set(artist.knownReleaseIds || []);
        const newReleases = releases.filter(r => !knownIds.has(r.id));

        if (newReleases.length) {
          for (const release of newReleases) {
            await postNewRelease(client, 'spotify', artist.name, release, artist.image);
            knownIds.add(release.id);
          }
          artist.knownReleaseIds = [...knownIds];
          saveTracking(tracking);
          await saveToTrackingListChannel(client, tracking);
        }
      } catch (e) { console.error(`Failed to check Spotify artist ${artist.name}:`, e); }
    }, delay);
    delay += delayBetween;
  }

  for (const artist of youtubeArtists) {
    setTimeout(async () => {
      try {
        const videos = await getYouTubeLatestVideos(artist.uploadsPlaylistId, 5);
        const knownIds = new Set(artist.knownReleaseIds || []);
        const newVideos = videos.filter(v => !knownIds.has(v.id));

        if (newVideos.length) {
          for (const video of newVideos) {
            await postNewRelease(client, 'youtube', artist.name, video, artist.image);
            knownIds.add(video.id);
          }
          artist.knownReleaseIds = [...knownIds];
          saveTracking(tracking);
          await saveToTrackingListChannel(client, tracking);
        }
      } catch (e) { console.error(`Failed to check YouTube artist ${artist.name}:`, e); }
    }, delay);
    delay += delayBetween;
  }
}

function scheduleTracking(client) {
  const CHECK_INTERVAL_MS = 60 * 60 * 1000;
  setInterval(() => checkNewReleases(client), CHECK_INTERVAL_MS);
  setTimeout(() => checkNewReleases(client), 5000);
}

async function handleMusicTrack(message, args) {
  if (!hasRole(message)) return;

  const url = args[0]?.trim();
  if (!url) {
    return message.reply({
      embeds: [errorEmbed('Proporciona un link de Spotify o YouTube.\nEjemplo: `;musictrack https://open.spotify.com/artist/...`')]
    });
  }

  const spotifyMatch = url.match(/open\.spotify\.com\/artist\/([a-zA-Z0-9]+)/);
  const youtubeMatch = url.match(/youtube\.com\/@[\w-]+/) || url.match(/youtube\.com\/channel\/[\w-]+/);

  const tracking = loadTracking();

  const thinking = await message.reply({
    embeds: [new EmbedBuilder().setColor(PASTEL_BLUE).setDescription('Obteniendo información del artista...')]
  });

  try {
    if (spotifyMatch) {
      const artistId = spotifyMatch[1];

      if (tracking.artists.some(a => a.platform === 'spotify' && a.platformId === artistId)) {
        return thinking.edit({ embeds: [errorEmbed('Ya estás siguiendo a ese artista en Spotify.')] });
      }

      const info = await getSpotifyArtistInfo(artistId);
      if (!info) return thinking.edit({ embeds: [errorEmbed('No se pudo obtener la información del artista.')] });

      const releases = await getSpotifyLatestReleases(artistId);
      const knownIds = releases.map(r => r.id);

      tracking.artists.push({
        id: Date.now().toString(),
        name: info.name,
        platform: 'spotify',
        platformId: artistId,
        image: info.image,
        url: info.url,
        followers: info.followers,
        genres: info.genres,
        knownReleaseIds: knownIds,
        addedAt: Date.now()
      });

      saveTracking(tracking);
      await saveToTrackingListChannel(message.client, tracking);

      return thinking.edit({
        embeds: [new EmbedBuilder()
          .setColor(PASTEL_BLUE)
          .setTitle(`✧ musictrack · ${info.name}`)
          .setURL(info.url)
          .setThumbnail(info.image)
          .setDescription([
            `**Plataforma:** Spotify`,
            `**Géneros:** ${info.genres}`,
            `**Seguidores:** ${info.followers.toLocaleString('es-ES')}`,
            `**Releases conocidos:** ${knownIds.length}`,
            ``,
            `Ahora recibirás notificaciones cuando publique nuevo contenido.`
          ].join('\n'))
        ]
      });
    }

    if (youtubeMatch) {
      const info = await getYouTubeChannelInfo(url);
      if (!info) return thinking.edit({ embeds: [errorEmbed('No se pudo obtener la información del canal.')] });

      if (tracking.artists.some(a => a.platform === 'youtube' && a.platformId === info.id)) {
        return thinking.edit({ embeds: [errorEmbed('Ya estás siguiendo ese canal de YouTube.')] });
      }

      const videos = await getYouTubeLatestVideos(info.uploadsPlaylistId, 10);
      const knownIds = videos.map(v => v.id);

      tracking.artists.push({
        id: Date.now().toString(),
        name: info.name,
        platform: 'youtube',
        platformId: info.id,
        uploadsPlaylistId: info.uploadsPlaylistId,
        image: info.image,
        url: info.url,
        subscribers: info.subscribers,
        knownReleaseIds: knownIds,
        addedAt: Date.now()
      });

      saveTracking(tracking);
      await saveToTrackingListChannel(message.client, tracking);

      return thinking.edit({
        embeds: [new EmbedBuilder()
          .setColor(PASTEL_BLUE)
          .setTitle(`✧ musictrack · ${info.name}`)
          .setURL(info.url)
          .setThumbnail(info.image)
          .setDescription([
            `**Plataforma:** YouTube`,
            `**Suscriptores:** ${info.subscribers.toLocaleString('es-ES')}`,
            `**Videos conocidos:** ${knownIds.length}`,
            ``,
            `Ahora recibirás notificaciones cuando suba nuevos videos.`
          ].join('\n'))
        ]
      });
    }

    return thinking.edit({ embeds: [errorEmbed('Link no reconocido. Usa un link de Spotify o YouTube.')] });

  } catch (e) {
    console.error('musictrack error:', e);
    return thinking.edit({ embeds: [errorEmbed('Algo salió mal. Intenta de nuevo.')] });
  }
}

async function handleMusicUntrack(message, args) {
  if (!hasRole(message)) return;

  const num = parseInt(args[0]);
  if (!args[0] || isNaN(num) || num < 1) {
    return message.reply({
      embeds: [errorEmbed('Indica el número del artista a dejar de seguir.\nEjemplo: `;musicuntrack 3`')]
    });
  }

  const tracking = loadTracking();

  if (num > tracking.artists.length) {
    return message.reply({
      embeds: [errorEmbed(`No existe el número ${num}. Hay ${tracking.artists.length} artistas en seguimiento.`)]
    });
  }

  const artist = tracking.artists[num - 1];

  const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('untrack_yes').setLabel('Confirmar').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('untrack_no').setLabel('Cancelar').setStyle(ButtonStyle.Secondary)
  );

  const confirmMsg = await message.reply({
    embeds: [new EmbedBuilder()
      .setColor(PASTEL_BLUE)
      .setTitle('✧ musicuntrack')
      .setDescription(`¿Dejar de seguir a **${artist.name}** (${artist.platform})?`)
      .setThumbnail(artist.image || null)
    ],
    components: [row]
  });

  const filter = i => (i.customId === 'untrack_yes' || i.customId === 'untrack_no') && i.user.id === message.author.id;
  const collector = confirmMsg.createMessageComponentCollector({ filter, max: 1, time: 30000 });

  collector.on('collect', async interaction => {
    if (interaction.customId === 'untrack_no') {
      return interaction.update({
        embeds: [new EmbedBuilder().setColor(PASTEL_BLUE).setTitle('✧ musicuntrack').setDescription('Cancelado.')],
        components: []
      });
    }

    tracking.artists.splice(num - 1, 1);
    saveTracking(tracking);
    await saveToTrackingListChannel(message.client, tracking);

    return interaction.update({
      embeds: [new EmbedBuilder()
        .setColor(PASTEL_BLUE)
        .setTitle('✧ musicuntrack')
        .setDescription(`**${artist.name}** eliminado del seguimiento.`)
      ],
      components: []
    });
  });

  collector.on('end', collected => {
    if (!collected.size) confirmMsg.edit({ components: [] }).catch(() => {});
  });
}

async function handleMusicTrackList(message) {
  const tracking = loadTracking();

  if (!tracking.artists.length) {
    return message.reply({
      embeds: [new EmbedBuilder()
        .setColor(PASTEL_BLUE)
        .setTitle('✧ musictracklist')
        .setDescription('No hay artistas en seguimiento.')
      ]
    });
  }

  const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
  const PAGE_SIZE = 10;
  let page = 0;
  const totalPages = Math.ceil(tracking.artists.length / PAGE_SIZE);

  function buildEmbed(p) {
    const start = p * PAGE_SIZE;
    const entries = tracking.artists.slice(start, start + PAGE_SIZE);
    const desc = entries.map((a, i) => [
      `**${start + i + 1}.** [${a.name}](${a.url})`,
      `-# ${a.platform === 'spotify' ? '🎵 Spotify' : '▶ YouTube'} · ${a.knownReleaseIds?.length || 0} releases conocidos`
    ].join('\n')).join('\n');

    return new EmbedBuilder()
      .setColor(PASTEL_BLUE)
      .setTitle(`✧ musictracklist · ${tracking.artists.length} artistas`)
      .setDescription(desc)
      .setFooter({ text: `Página ${p + 1}/${totalPages}` });
  }

  function buildButtons(p, disabled = false) {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('tl_prev').setLabel('◀').setStyle(ButtonStyle.Secondary).setDisabled(disabled || p === 0),
      new ButtonBuilder().setCustomId('tl_next').setLabel('▶').setStyle(ButtonStyle.Secondary).setDisabled(disabled || p === totalPages - 1)
    );
  }

  const components = totalPages > 1 ? [buildButtons(page)] : [];
  const botReply = await message.reply({ embeds: [buildEmbed(page)], components });

  if (totalPages <= 1) return;

  const collector = botReply.createMessageComponentCollector({
    filter: i => (i.customId === 'tl_prev' || i.customId === 'tl_next'),
    time: 5 * 60 * 1000
  });

  collector.on('collect', async interaction => {
    if (interaction.customId === 'tl_prev' && page > 0) page--;
    if (interaction.customId === 'tl_next' && page < totalPages - 1) page++;
    await interaction.update({ embeds: [buildEmbed(page)], components: [buildButtons(page)] });
  });

  collector.on('end', () => {
    botReply.edit({ components: [buildButtons(page, true)] }).catch(() => {});
  });
}

module.exports = {
  scheduleTracking,
  handleMusicTrack,
  handleMusicUntrack,
  handleMusicTrackList
};
