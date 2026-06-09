const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const PASTEL_BLUE = 0xaeefff;
const VERSUS_ROLES = ['1340864854243803248', '1500019909063606342'];
const PAGE_SIZE = 40;
const VERSUS_URL = 'https://chidoris.lovable.app/api/public/versus';

async function loadVersus() {
  try {
    const res = await fetch(VERSUS_URL);
    if (!res.ok) throw new Error('bad status');

    const data = await res.json();

    return {
      imageUrl: data.imageUrl ?? null,
      entries: Array.isArray(data.entries) ? data.entries : []
    };
  } catch {
    return {
      imageUrl: null,
      entries: []
    };
  }
}

function hasVersusRole(member) {
  return VERSUS_ROLES.some(roleId => member.roles.cache.has(roleId));
}

function buildVersusEmbed(list, page, totalPages, imageUrl) {
  const start = page * PAGE_SIZE;
  const entries = list.slice(start, start + PAGE_SIZE);

  const description = [
    entries.map((entry, i) => `♡ ${start + i + 1}. <@${entry.userId}> ${entry.description}`).join('\n'),
    '',
    '-# Edita esta lista desde la app.',
    `-# Página ${page + 1}/${totalPages}`
  ].join('\n');

  const embed = new EmbedBuilder()
    .setColor(PASTEL_BLUE)
    .setTitle('✧ versus')
    .setDescription(description);

  if (imageUrl) {
    embed.setImage(imageUrl);
  }

  return embed;
}

function buildNavButtons(page, totalPages, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('versus_prev')
      .setLabel('◀')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || page === 0),
    new ButtonBuilder()
      .setCustomId('versus_next')
      .setLabel('▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || page === totalPages - 1)
  );
}

async function handleVersus(message) {
  const { imageUrl, entries } = await loadVersus();

  if (!entries.length) {
    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(PASTEL_BLUE)
          .setTitle('✧ versus')
          .setDescription('No hay nadie en la lista todavía.')
      ]
    });
  }

  const totalPages = Math.ceil(entries.length / PAGE_SIZE);
  let page = 0;

  const components = totalPages > 1 ? [buildNavButtons(page, totalPages)] : [];

  const botReply = await message.reply({
    embeds: [buildVersusEmbed(entries, page, totalPages, imageUrl)],
    components
  });

  if (totalPages <= 1) return;

  const collector = botReply.createMessageComponentCollector({
    filter: i => i.customId === 'versus_prev' || i.customId === 'versus_next',
    time: 5 * 60 * 1000
  });

  collector.on('collect', async interaction => {
    if (interaction.customId === 'versus_prev' && page > 0) page--;
    if (interaction.customId === 'versus_next' && page < totalPages - 1) page++;

    await interaction.update({
      embeds: [buildVersusEmbed(entries, page, totalPages, imageUrl)],
      components: [buildNavButtons(page, totalPages)]
    });
  });

  collector.on('end', () => {
    botReply.edit({
      components: [buildNavButtons(page, totalPages, true)]
    }).catch(() => {});
  });
}

async function handleVersusAdd(message) {
  if (!message.member || !hasVersusRole(message.member)) {
    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(PASTEL_BLUE)
          .setTitle('error')
          .setDescription('No tienes permiso para usar este comando.')
      ]
    });
  }

  return message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(PASTEL_BLUE)
        .setTitle('✧ versus')
        .setDescription('Ahora esta lista se edita desde la app, no desde Discord.')
    ]
  });
}

async function handleVersusDelete(message) {
  if (!message.member || !hasVersusRole(message.member)) {
    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(PASTEL_BLUE)
          .setTitle('error')
          .setDescription('No tienes permiso para usar este comando.')
      ]
    });
  }

  return message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(PASTEL_BLUE)
        .setTitle('✧ versus')
        .setDescription('Ahora esta lista se edita desde la app, no desde Discord.')
    ]
  });
}

module.exports = {
  async execute(message, second) {
    const commandName = Array.isArray(second) ? null : second?.commandName;
    const cmd = commandName || 'versus';

    if (cmd === 'versus') return handleVersus(message);
    if (cmd === 'versusadd') return handleVersusAdd(message);
    if (cmd === 'versusdelete') return handleVersusDelete(message);

    return false;
  }
};
