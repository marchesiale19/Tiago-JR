
async function notifyVoiceReward(
  client: Client,
  guildId: string,
  userId: string,
): Promise<void> {
  try {
    const user = await client.users.fetch(userId);

    await user.send({
      content:
        `🎉 **¡Ganaste una recompensa!**\n\n` +
        `¡Recibiste **${REWARD_AMOUNT.toLocaleString("es-AR")} <:MonedaServer:1524674026188967956>** ` +
        `en tu banco del <#1483361912904224799> por completar una hora en canales de voz. ¡Seguí así! 🎧`,
    });

    console.log(
      `[VoiceRewards] Aviso privado enviado a ${userId}.`,
    );
  } catch (error) {
    console.warn(
      `[VoiceRewards] No se pudo enviar el aviso privado a ${userId}:`,
      error,
    );
  }
}
