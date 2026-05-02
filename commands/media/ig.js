const { EmbedBuilder } = require('discord.js');

const PASTEL_BLUE = 0xaeefff;

function errorEmbed(description) {
  return new EmbedBuilder().setColor(PASTEL_BLUE).setTitle('error').setDescription(description);
}

async function handleIg(message, args) {
  const username = args[0]?.trim().replace('@', '');

  if (!username) {
    return message.reply({
      embeds: [errorEmbed('Escribe un nombre de usuario.\nEjemplo: `;ig angelithighs`')]
    });
  }

  const thinking = await message.reply({
    embeds: [new EmbedBuilder().setColor(PASTEL_BLUE).setDescription('Buscando en Instagram...')]
  });

  try {
    const res = await fetch(`https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'X-IG-App-ID': '936619743392459',
        'Referer': `https://www.instagram.com/${username}/`,
        'X-Requested-With': 'XMLHttpRequest'
      }
    });

    if (res.status === 404) {
      return thinking.edit({
        embeds: [new EmbedBuilder()
          .setColor(PASTEL_BLUE)
          .setTitle('✧ ig')
          .setDescription(`**@${username}** está **disponible**.`)
        ]
      });
    }

    if (!res.ok) {
      return thinking.edit({
        embeds: [errorEmbed('No se pudo verificar ese usuario. Intenta de nuevo más tarde.')]
      });
    }

    const data = await res.json();
    const user = data?.data?.user;

    if (!user) {
      return thinking.edit({
        embeds: [new EmbedBuilder()
          .setColor(PASTEL_BLUE)
          .setTitle('✧ ig')
          .setDescription(`**@${username}** está **disponible**.`)
        ]
      });
    }

    const profileUrl = `https://www.instagram.com/${user.username}/`;
    const isPrivate = user.is_private;
    const fullName = user.full_name || null;
    const bio = user.biography || null;
    const profilePic = user.profile_pic_url_hd || user.profile_pic_url || null;
    const followers = user.edge_followed_by?.count ?? null;
    const following = user.edge_follow?.count ?? null;
    const posts = user.edge_owner_to_timeline_media?.count ?? null;
    const isVerified = user.is_verified;

    if (isPrivate) {
      const embed = new EmbedBuilder()
        .setColor(PASTEL_BLUE)
        .setTitle(`✧ ig · @${user.username}`)
        .setURL(profileUrl)
        .setDescription('**Cuenta privada** 🔒');

      if (profilePic) embed.setThumbnail(profilePic);

      return thinking.edit({ embeds: [embed] });
    }

    const descLines = [];
    if (fullName) descLines.push(`**${fullName}**${isVerified ? ' ✓' : ''}`);
    if (bio) descLines.push(bio);

    const embed = new EmbedBuilder()
      .setColor(PASTEL_BLUE)
      .setTitle(`✧ ig · @${user.username}`)
      .setURL(profileUrl);

    if (descLines.length) embed.setDescription(descLines.join('\n'));
    if (profilePic) embed.setThumbnail(profilePic);

    embed.addFields(
      {
        name: 'Seguidores',
        value: followers !== null ? `**${followers.toLocaleString('es-ES')}**` : 'N/A',
        inline: true
      },
      {
        name: 'Siguiendo',
        value: following !== null ? `**${following.toLocaleString('es-ES')}**` : 'N/A',
        inline: true
      },
      {
        name: 'Publicaciones',
        value: posts !== null ? `**${posts.toLocaleString('es-ES')}**` : 'N/A',
        inline: true
      }
    );

    return thinking.edit({ embeds: [embed] });
  } catch (e) {
    console.error('ig error:', e);
    return thinking.edit({
      embeds: [errorEmbed('Algo salió mal. Intenta de nuevo más tarde.')]
    });
  }
}

module.exports = {
  async execute(message, parsedCommand) {
    return handleIg(message, parsedCommand?.args || []);
  }
};
