const { EmbedBuilder } = require('discord.js');
const PASTEL_BLUE = 0xaeefff;

module.exports = {
  async execute(message) {
    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(PASTEL_BLUE)
          .setTitle('✧ invitación')
          .setDescription('[Link de invitación](https://discord.gg/HuRvGPKKtr)')
      ]
    });
  }
};
