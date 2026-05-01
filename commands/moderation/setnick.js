const {
  fetchTargetMember,
  hasPermission,
  isValidTarget,
  replyWithError,
  replyWithSuccess
} = require('./utils');

async function execute(message, args) {
  if (!(await hasPermission(message))) return;

  const targetInput = args[0];

  if (!targetInput) {
    return replyWithError(message, 'Debes mencionar a un usuario para cambiarle el apodo.');
  }

  const target = await fetchTargetMember(message, targetInput);

  if (!(await isValidTarget(message, target))) return;

  if (!target.manageable) {
    return replyWithError(message, 'No puedo cambiar el apodo de ese usuario por permisos o jerarquía.');
  }

  const newNickname = args.slice(1).join(' ').trim();

  if (!newNickname) {
    return replyWithError(message, 'Debes indicar el nuevo apodo.');
  }

  if (newNickname.length > 32) {
    return replyWithError(message, 'El nuevo apodo no puede superar los 32 caracteres.');
  }

  try {
    await target.setNickname(newNickname);
    return replyWithSuccess(
      message,
      `Se cambió el apodo de **${target.user.tag}** a **${newNickname}**.`
    );
  } catch (error) {
    console.error('Setnick command failed:', error);
    return replyWithError(message, 'No pude cambiar el apodo de ese usuario.');
  }
}

module.exports = { execute };
