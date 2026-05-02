const { EmbedBuilder } = require('discord.js');
const PASTEL_BLUE = 0xaeefff;

module.exports = {
  async execute(message) {
    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(PASTEL_BLUE)
          .setTitle('✧ invitación')
          .setDescription('[Haz clic aquí para invitar a alguien al servidor](https://discord.gg/HuRvGPKKtr)')
      ]
    });
  }
};
