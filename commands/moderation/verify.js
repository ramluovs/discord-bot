const { EmbedBuilder } = require('discord.js');
const PASTEL_BLUE = 0xaeefff;
const ACCESS_ROLE_ID = '1340869620894142475';
const MOD_ROLE_ID = '1340864854243803248';

module.exports = {
  async execute(message, args) {
    if (!message.member.roles.cache.has(MOD_ROLE_ID)) {
      return message.reply({
        embeds: [new EmbedBuilder().setColor(PASTEL_BLUE).setTitle('error').setDescription('No tienes permiso para usar este comando.')]
      });
    }

    const target = message.mentions.members.first();
    if (!target) {
      return message.reply({
        embeds: [new EmbedBuilder().setColor(PASTEL_BLUE).setTitle('error').setDescription('Debes etiquetar a un usuario.')]
      });
    }

    if (target.roles.cache.has(ACCESS_ROLE_ID)) {
      await target.roles.remove(ACCESS_ROLE_ID);
      return message.reply({
        embeds: [new EmbedBuilder().setColor(PASTEL_BLUE).setTitle('✧ verify').setDescription(`Se le quitó el rol de acceso a ${target}.`)]
      });
    } else {
      await target.roles.add(ACCESS_ROLE_ID);
      return message.reply({
        embeds: [new EmbedBuilder().setColor(PASTEL_BLUE).setTitle('✧ verify').setDescription(`Se le dio el rol de acceso a ${target}.`)]
      });
    }
  }
};
