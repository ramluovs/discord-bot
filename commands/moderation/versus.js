const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');

const PASTEL_BLUE = 0xaeefff;
const VERSUS_FILE = path.join(__dirname, '../../data/versus.json');
const VERSUS_ROLES = ['1340864854243803248', '1500019909063606342'];
const PAGE_SIZE = 40;
const VERSUS_IMAGE = 'https://cdn.discordapp.com/attachments/1376142899883806791/1389312974833061950/1637321372980.gif?ex=69f64389&is=69f4f209&hm=88e3b11f45786dbbde76245a8c3d2a1534dc58c67b68f299c61f0523498fa56a&';

function loadVersus() {
  try {
    if (!fs.existsSync(VERSUS_FILE)) return [];
    return JSON.parse(fs.readFileSync(VERSUS_FILE, 'utf8'));
  } catch { return []; }
}

function saveVersus(data) {
  try {
    const dir = path.dirname(VERSUS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(VERSUS_FILE, JSON.stringify(data, null, 2));
  } catch (e) { console.error('Failed to save versus:', e); }
}

function hasVersusRole(member) {
  return VERSUS_ROLES.some(roleId => member.roles.cache.has(roleId));
}

function buildVersusEmbed(list, page, totalPages) {
  const start = page * PAGE_SIZE;
  const entries = list.slice(start, start + PAGE_SIZE);

  const description = [
    entries.map((entry, i) => `♡ ${start + i + 1}. <@${entry.userId}> ${entry.description}`).join('\n'),
    '',
    '-# Para agregar alguien usa `versusadd`, para eliminar usa `versusdelete`.',
    `-# Página ${page + 1}/${totalPages}`
  ].join('\n');

  return new EmbedBuilder()
    .setColor(PASTEL_BLUE)
    .setTitle('✧ versus')
    .setDescription(description)
    .setImage(VERSUS_IMAGE);
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
  const list = loadVersus();

  if (!list.length) {
    return message.reply({
      embeds: [new EmbedBuilder().setColor(PASTEL_BLUE).setTitle('✧ versus').setDescription('No hay nadie en la lista todavía.')]
    });
  }

  const totalPages = Math.ceil(list.length / PAGE_SIZE);
  let page = 0;

  const components = totalPages > 1 ? [buildNavButtons(page, totalPages)] : [];
  const botReply = await message.reply({
    embeds: [buildVersusEmbed(list, page, totalPages)],
    components
  });

  if (totalPages <= 1) return;

  const collector = botReply.createMessageComponentCollector({
    filter: i => (i.customId === 'versus_prev' || i.customId === 'versus_next'),
    time: 5 * 60 * 1000
  });

  collector.on('collect', async interaction => {
    if (interaction.customId === 'versus_prev' && page > 0) page--;
    if (interaction.customId === 'versus_next' && page < totalPages - 1) page++;
    await interaction.update({
      embeds: [buildVersusEmbed(list, page, totalPages)],
      components: [buildNavButtons(page, totalPages)]
    });
  });

  collector.on('end', () => {
    botReply.edit({ components: [buildNavButtons(page, totalPages, true)] }).catch(() => {});
  });
}

async function handleVersusAdd(message, args) {
  if (!message.member || !hasVersusRole(message.member)) {
    return message.reply({
      embeds: [new EmbedBuilder().setColor(PASTEL_BLUE).setTitle('error').setDescription('No tienes permiso para usar este comando.')]
    });
  }

  const userId = args[0];
  const description = args.slice(1).join(' ').trim();

  if (!userId || !/^\d+$/.test(userId)) {
    return message.reply({
      embeds: [new EmbedBuilder().setColor(PASTEL_BLUE).setTitle('error').setDescription('Debes proporcionar un ID de usuario válido.\n\nPara obtener un ID: activa el modo desarrollador en Discord (Ajustes → Avanzado → Modo desarrollador), luego haz clic derecho en el usuario y selecciona "Copiar ID".')]
    });
  }

  if (!description) {
    return message.reply({
      embeds: [new EmbedBuilder().setColor(PASTEL_BLUE).setTitle('error').setDescription('Debes agregar una descripción después del ID.\nEjemplo: `versusadd 123456789 guns & flame`')]
    });
  }

  const list = loadVersus();

  if (list.some(e => e.userId === userId)) {
    return message.reply({
      embeds: [new EmbedBuilder().setColor(PASTEL_BLUE).setTitle('error').setDescription('Ese usuario ya está en la lista.')]
    });
  }

  list.push({ userId, description });
  saveVersus(list);

  return message.reply({
    embeds: [new EmbedBuilder().setColor(PASTEL_BLUE).setTitle('✧ versus').setDescription(`<@${userId}> fue agregado a la lista en el lugar #${list.length}.`)]
  });
}

async function handleVersusDelete(message, args) {
  if (!message.member || !hasVersusRole(message.member)) {
    return message.reply({
      embeds: [new EmbedBuilder().setColor(PASTEL_BLUE).setTitle('error').setDescription('No tienes permiso para usar este comando.')]
    });
  }

  const numberArg = parseInt(args[0]);

  if (!args[0] || isNaN(numberArg) || numberArg < 1) {
    return message.reply({
      embeds: [new EmbedBuilder().setColor(PASTEL_BLUE).setTitle('error').setDescription('Debes indicar el número de la persona en la lista.\nEjemplo: `versusdelete 5`')]
    });
  }

  const list = loadVersus();

  if (numberArg > list.length) {
    return message.reply({
      embeds: [new EmbedBuilder().setColor(PASTEL_BLUE).setTitle('error').setDescription(`No existe el número ${numberArg} en la lista. La lista tiene ${list.length} personas.`)]
    });
  }

  const entry = list[numberArg - 1];

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('vdel_yes').setLabel('Sí').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('vdel_no').setLabel('No').setStyle(ButtonStyle.Secondary)
  );

  const confirmMsg = await message.reply({
    embeds: [new EmbedBuilder().setColor(PASTEL_BLUE).setTitle('✧ versus').setDescription(`¿Estás seguro de que quieres eliminar a <@${entry.userId}> (#${numberArg}) de la lista?`)],
    components: [row]
  });

  const filter = i => (i.customId === 'vdel_yes' || i.customId === 'vdel_no') && i.user.id === message.author.id;
  const collector = confirmMsg.createMessageComponentCollector({ filter, max: 1, time: 30 * 1000 });

  collector.on('collect', async interaction => {
    if (interaction.customId === 'vdel_no') {
      return interaction.update({
        embeds: [new EmbedBuilder().setColor(PASTEL_BLUE).setTitle('✧ versus').setDescription('Eliminación cancelada.')],
        components: []
      });
    }

    list.splice(numberArg - 1, 1);
    saveVersus(list);

    return interaction.update({
      embeds: [new EmbedBuilder().setColor(PASTEL_BLUE).setTitle('✧ versus').setDescription(`<@${entry.userId}> fue eliminado de la lista. Los números han sido actualizados.`)],
      components: []
    });
  });

  collector.on('end', collected => {
    if (!collected.size) {
      confirmMsg.edit({ components: [] }).catch(() => {});
    }
  });
}

module.exports = {
  async execute(message, parsedCommand) {
    const { commandName, args } = parsedCommand;
    if (commandName === 'versus') return handleVersus(message);
    if (commandName === 'versusadd') return handleVersusAdd(message, args);
    if (commandName === 'versusdelete') return handleVersusDelete(message, args);
    return false;
  }
};
