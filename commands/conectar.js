const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const BABY_BLUE = '#89CFF0';
const LOVABLE_URL = 'https://chidoris.lovable.app';
const SPOTIFY_DASHBOARD_URL = 'https://developer.spotify.com/dashboard';

module.exports = {
  name: 'conectar',
  async execute(message, parsedCommand) {
    const userId = message.author.id;

    const connectEmbed = new EmbedBuilder()
      .setColor(BABY_BLUE)
      .setTitle('🔗 Guía de Vinculación de Spotify ♡')
      .setDescription(`¡Hola <@${userId}>! Sigue estos sencillos pasos (solo toma 1 minuto) para vincular tu Spotify y poder usar \`;stream\`, \`;ya\` y los demás comandos. ♡`)
      .addFields(
        {
          name: '1️⃣ Copia la URL de Redirección ♡',
          value: `Ingresa a **[chidoris.lovable.app](${LOVABLE_URL})**, despliega el panel de instrucciones y **copia el Redirect URI** que aparece ahí.`
        },
        {
          name: '2️⃣ Crea tu App en Spotify ♡',
          value: `Ve al **[Spotify Developer Dashboard](${SPOTIFY_DASHBOARD_URL})** e inicia sesión con tu cuenta de Spotify.\n• Haz clic en **Create App**.\n• Ponle cualquier nombre (ej. *Mi Spotify Bot*).\n• En la casilla **Redirect URIs**, pega la URL que copiaste en el paso 1.\n• Guarda los cambios.`
        },
        {
          name: '3️⃣ Obtén tus Claves ♡',
          value: `Dentro de tu nueva App en Spotify, ve a **Settings** y copia tu **Client ID** y tu **Client Secret**.`
        },
        {
          name: '4️⃣ Completa la Vinculación ♡',
          value: `Vuelve a **[chidoris.lovable.app](${LOVABLE_URL})**, coloca tu **ID de Discord** (\`${userId}\`), tu **Client ID** y tu **Client Secret**.\n¡Presiona **Conectar Spotify** y listo! ✨`
        }
      )
      .setFooter({ text: 'Configuración única y 100% personal ♡' });

    // Botones interactivos con enlaces directos
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('Abrir Web de Vinculación ♡')
        .setStyle(ButtonStyle.Link)
        .setURL(LOVABLE_URL),
      new ButtonBuilder()
        .setLabel('Spotify Developer Dashboard ♡')
        .setStyle(ButtonStyle.Link)
        .setURL(SPOTIFY_DASHBOARD_URL)
    );

    return message.reply({ embeds: [connectEmbed], components: [row] });
  }
};
