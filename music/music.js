const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');

const PASTEL_BLUE = 0xaeefff;
const MUSIC_STORAGE_CHANNEL_ID = '1500358512780251288';
const MUSIC_COVERS_CHANNEL_ID = '1500367140174430309';
const DEFAULT_COVER = 'https://cdn.discordapp.com/attachments/1340867275351261335/1500357575466684496/IMG_0754.jpg?ex=69f82461&is=69f6d2e1&hm=5bc8260d3d97b16b754990441a63aa90376343b9c982c981ed496f1f0c3727f5&';
const MUSIC_DATA_FILE = path.join(__dirname, '../data/music_data.json');
const PAGE_SIZE = 50;
const ALLOWED_ROLES = ['1340864854243803248', '1500019909063606342'];

function hasRole(message) {
  return message.member?.roles.cache.some(role => ALLOWED_ROLES.includes(role.id)) ?? false;
}

function errorEmbed(description) {
  return new EmbedBuilder().setColor(PASTEL_BLUE).setTitle('error').setDescription(description);
}

function loadMusicData() {
  try {
    if (!fs.existsSync(MUSIC_DATA_FILE)) return { songs: {} };
    return JSON.parse(fs.readFileSync(MUSIC_DATA_FILE, 'utf8'));
  } catch { return { songs: {} }; }
}

function saveMusicData(data) {
  try {
    const dir = path.dirname(MUSIC_DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(MUSIC_DATA_FILE, JSON.stringify(data, null, 2));
  } catch (e) { console.error('Failed to save music data:', e); }
}

async function handleMusicAdd(message, args) {
  if (!hasRole(message)) return;

  let attachment = null;
  let referencedMessageId = null;

  if (message.reference?.messageId) {
    try {
      const referenced = await message.channel.messages.fetch(message.reference.messageId);
      attachment = referenced.attachments.find(a => a.name?.endsWith('.mp3') || a.contentType?.includes('audio'));
      referencedMessageId = referenced.id;
    } catch {}
  }

  if (!attachment) {
    attachment = message.attachments.find(a => a.name?.endsWith('.mp3') || a.contentType?.includes('audio'));
  }

  if (!attachment) {
    return message.reply({
      embeds: [errorEmbed('Adjunta un archivo `.mp3` o responde a un mensaje que tenga uno.\nEjemplo: `;musicadd Nombre de la canción // Artista`')]
    });
  }

  const nameInput = args.join(' ').trim();
  if (!nameInput) {
    return message.reply({
      embeds: [errorEmbed('Debes escribir el nombre de la canción.\nEjemplo: `;musicadd Roi // Videoclub`')]
    });
  }

  const parts = nameInput.split('//');
  const songName = parts[0].trim();
  const author = parts[1] ? parts[1].trim() : 'Author Unknown';

  const storageChannel = await message.client.channels.fetch(MUSIC_STORAGE_CHANNEL_ID);
  if (!storageChannel || !storageChannel.isTextBased()) {
    return message.reply({ embeds: [errorEmbed('No se pudo acceder al canal de almacenamiento.')] });
  }

  const storageMessage = await storageChannel.send({
    content: `**${songName}** — ${author}`,
    files: [{ attachment: attachment.url, name: attachment.name }]
  });

  const audioUrl = storageMessage.attachments.first()?.url;
  if (!audioUrl) {
    return message.reply({ embeds: [errorEmbed('No se pudo obtener la URL del archivo de audio.')] });
  }

  const data = loadMusicData();
  data.songs[storageMessage.id] = {
    messageId: storageMessage.id,
    name: songName,
    author,
    audioUrl,
    coverUrl: DEFAULT_COVER,
    addedAt: Date.now()
  };
  saveMusicData(data);

  return message.reply({
    embeds: [new EmbedBuilder()
      .setColor(PASTEL_BLUE)
      .setTitle('✧ musicadd')
      .setDescription(`**${songName}** de **${author}** fue agregada a la biblioteca.\n-# ID: \`${storageMessage.id}\``)
      .setThumbnail(DEFAULT_COVER)
    ]
  });
}

async function handleMusicDelete(message, args) {
  if (!hasRole(message)) return;

  const messageId = args[0]?.trim();
  if (!messageId || !/^\d+$/.test(messageId)) {
    return message.reply({
      embeds: [errorEmbed('Escribe el ID del mensaje de la canción.\nEjemplo: `;musicdelete 1234567890`')]
    });
  }

  const data = loadMusicData();
  const song = data.songs[messageId];

  if (!song) {
    return message.reply({
      embeds: [errorEmbed('No encontré ninguna canción con ese ID.')]
    });
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('mdel_yes').setLabel('Confirmar').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('mdel_no').setLabel('Cancelar').setStyle(ButtonStyle.Secondary)
  );

  const confirmMsg = await message.reply({
    embeds: [new EmbedBuilder()
      .setColor(PASTEL_BLUE)
      .setTitle('✧ musicdelete')
      .setDescription(`¿Eliminar **${song.name}** de **${song.author}**?`)
    ],
    components: [row]
  });

  const filter = i => (i.customId === 'mdel_yes' || i.customId === 'mdel_no') && i.user.id === message.author.id;
  const collector = confirmMsg.createMessageComponentCollector({ filter, max: 1, time: 30 * 1000 });

  collector.on('collect', async interaction => {
    if (interaction.customId === 'mdel_no') {
      return interaction.update({
        embeds: [new EmbedBuilder().setColor(PASTEL_BLUE).setTitle('✧ musicdelete').setDescription('Eliminación cancelada.')],
        components: []
      });
    }

    try {
      const storageChannel = await message.client.channels.fetch(MUSIC_STORAGE_CHANNEL_ID);
      const storageMsg = await storageChannel.messages.fetch(messageId);
      await storageMsg.delete();
    } catch {}

    delete data.songs[messageId];
    saveMusicData(data);

    return interaction.update({
      embeds: [new EmbedBuilder()
        .setColor(PASTEL_BLUE)
        .setTitle('✧ musicdelete')
        .setDescription(`**${song.name}** fue eliminada de la biblioteca.`)
      ],
      components: []
    });
  });

  collector.on('end', collected => {
    if (!collected.size) confirmMsg.edit({ components: [] }).catch(() => {});
  });
}

async function handleMusicList(message) {
  const data = loadMusicData();
  const songs = Object.values(data.songs);

  if (!songs.length) {
    return message.reply({
      embeds: [new EmbedBuilder().setColor(PASTEL_BLUE).setTitle('✧ musiclist').setDescription('No hay canciones en la biblioteca todavía.')]
    });
  }

  const totalPages = Math.ceil(songs.length / PAGE_SIZE);
  let page = 0;

  function buildEmbed(p) {
    const start = p * PAGE_SIZE;
    const entries = songs.slice(start, start + PAGE_SIZE);
    const description = entries.map((song, i) => [
      `**${start + i + 1}. ${song.name}**`,
      `-# ${song.author} · ID: \`${song.messageId}\``
    ].join('\n')).join('\n');

    return new EmbedBuilder()
      .setColor(PASTEL_BLUE)
      .setTitle(`✧ musiclist · ${songs.length} canciones`)
      .setDescription(description)
      .setFooter({ text: `Página ${p + 1}/${totalPages}` });
  }

  function buildButtons(p, disabled = false) {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ml_prev').setLabel('◀').setStyle(ButtonStyle.Secondary).setDisabled(disabled || p === 0),
      new ButtonBuilder().setCustomId('ml_next').setLabel('▶').setStyle(ButtonStyle.Secondary).setDisabled(disabled || p === totalPages - 1)
    );
  }

  const components = totalPages > 1 ? [buildButtons(page)] : [];
  const botReply = await message.reply({ embeds: [buildEmbed(page)], components });

  if (totalPages <= 1) return;

  const collector = botReply.createMessageComponentCollector({
    filter: i => (i.customId === 'ml_prev' || i.customId === 'ml_next'),
    time: 5 * 60 * 1000
  });

  collector.on('collect', async interaction => {
    if (interaction.customId === 'ml_prev' && page > 0) page--;
    if (interaction.customId === 'ml_next' && page < totalPages - 1) page++;
    await interaction.update({ embeds: [buildEmbed(page)], components: [buildButtons(page)] });
  });

  collector.on('end', () => {
    botReply.edit({ components: [buildButtons(page, true)] }).catch(() => {});
  });
}

async function handleAddMusicImage(message, args) {
  if (!hasRole(message)) return;

  const messageId = args[0]?.trim();
  if (!messageId || !/^\d+$/.test(messageId)) {
    return message.reply({
      embeds: [errorEmbed('Escribe el ID del mensaje de la canción y adjunta una imagen.\nEjemplo: `;addmusicimage 1234567890` con imagen adjunta')]
    });
  }

  const data = loadMusicData();
  const song = data.songs[messageId];

  if (!song) {
    return message.reply({
      embeds: [errorEmbed('No encontré ninguna canción con ese ID.')]
    });
  }

  const attachment = message.attachments.find(a =>
    a.contentType?.startsWith('image/') ||
    /\.(jpg|jpeg|png|gif|webp)$/i.test(a.name || '')
  );

  if (!attachment) {
    return message.reply({
      embeds: [errorEmbed('Adjunta una imagen junto con el comando.')]
    });
  }

  const coversChannel = await message.client.channels.fetch(MUSIC_COVERS_CHANNEL_ID).catch(() => null);
  if (!coversChannel || !coversChannel.isTextBased()) {
    return message.reply({
      embeds: [errorEmbed('No se pudo acceder al canal de imágenes.')]
    });
  }

  const coverMsg = await coversChannel.send({
    content: `cover:${messageId}`,
    files: [{ attachment: attachment.url, name: attachment.name }]
  }).catch(() => null);

  if (!coverMsg) {
    return message.reply({
      embeds: [errorEmbed('No se pudo subir la imagen. Intenta de nuevo.')]
    });
  }

  const permanentCoverUrl = coverMsg.attachments.first()?.url;
  if (!permanentCoverUrl) {
    return message.reply({
      embeds: [errorEmbed('No se pudo obtener la URL de la imagen.')]
    });
  }

  const hasCustomCover = song.coverUrl !== DEFAULT_COVER;
  const confirmText = hasCustomCover
    ? `**${song.name}** ya tiene una imagen. ¿Quieres reemplazarla?`
    : `¿Agregar esta imagen a **${song.name}**?`;

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('mimg_yes').setLabel('Confirmar').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('mimg_no').setLabel('Cancelar').setStyle(ButtonStyle.Secondary)
  );

  const confirmMsg = await message.reply({
    embeds: [new EmbedBuilder()
      .setColor(PASTEL_BLUE)
      .setTitle('✧ addmusicimage')
      .setDescription(confirmText)
      .setThumbnail(permanentCoverUrl)
    ],
    components: [row]
  });

  const filter = i => (i.customId === 'mimg_yes' || i.customId === 'mimg_no') && i.user.id === message.author.id;
  const collector = confirmMsg.createMessageComponentCollector({ filter, max: 1, time: 30 * 1000 });

  collector.on('collect', async interaction => {
    if (interaction.customId === 'mimg_no') {
      await coverMsg.delete().catch(() => {});
      return interaction.update({
        embeds: [new EmbedBuilder().setColor(PASTEL_BLUE).setTitle('✧ addmusicimage').setDescription('Cancelado.')],
        components: []
      });
    }

    data.songs[messageId].coverUrl = permanentCoverUrl;
    saveMusicData(data);

    return interaction.update({
      embeds: [new EmbedBuilder()
        .setColor(PASTEL_BLUE)
        .setTitle('✧ addmusicimage')
        .setDescription(`Imagen actualizada para **${song.name}**.`)
        .setThumbnail(permanentCoverUrl)
      ],
      components: []
    });
  });

  collector.on('end', collected => {
    if (!collected.size) {
      coverMsg.delete().catch(() => {});
      confirmMsg.edit({ components: [] }).catch(() => {});
    }
  });
}

module.exports = {
  async execute(message, parsedCommand) {
    const { commandName, args } = parsedCommand;
    if (commandName === 'musicadd') return handleMusicAdd(message, args);
    if (commandName === 'musicdelete') return handleMusicDelete(message, args);
    if (commandName === 'musiclist') return handleMusicList(message);
    if (commandName === 'addmusicimage') return handleAddMusicImage(message, args);
    return false;
  }
};
