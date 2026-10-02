import {
  EmbedBuilder,
  type ChatInputCommandInteraction,
  type Message,
  type GuildMember,
} from "discord.js";

/* ============================================================
 * CONFIGURACIÓN
 * ============================================================ */

const LOTERIA_ROLE_ID = "1543094546483781684";

const LOTERIA_AUTHORIZED_ROLES = [
  "1539368076326473868", // Developer Tiago Jr
  "1522807097920720967", // Manager
];

/* ============================================================
 * ESTADO DE LA LOTERÍA
 * ============================================================ */

let participantes: string[] = [];

/* ============================================================
 * PERMISOS
 * ============================================================ */

function tienePermisoLoteria(
  member: GuildMember | null,
): boolean {
  if (!member) return false;

  return LOTERIA_AUTHORIZED_ROLES.some((roleId) =>
    member.roles.cache.has(roleId),
  );
}

/* ============================================================
 * UTILIDADES
 * ============================================================ */

function mezclar<T>(array: T[]): T[] {
  const resultado = [...array];

  // Fisher-Yates:
  // mezcla cada posición con una posición aleatoria.
  for (
    let i = resultado.length - 1;
    i > 0;
    i--
  ) {
    const j = Math.floor(
      Math.random() * (i + 1),
    );

    [resultado[i], resultado[j]] = [
      resultado[j],
      resultado[i],
    ];
  }

  return resultado;
}

function esperar(
  ms: number,
): Promise<void> {
  return new Promise((resolve) =>
    setTimeout(resolve, ms),
  );
}

/* ============================================================
 * ANOTAR PARTICIPANTES
 * ============================================================ */

async function anotar(
  interactionOrMessage:
    | ChatInputCommandInteraction
    | Message,
): Promise<void> {
  const guild =
    interactionOrMessage.guild;

  if (!guild) {
    const respuesta =
      "❌ Este comando solamente puede utilizarse dentro de un servidor.";

    if (
      interactionOrMessage.isChatInputCommand?.()
    ) {
      await interactionOrMessage.reply({
        content: respuesta,
        ephemeral: true,
      });
    } else {
      await interactionOrMessage.reply(
        respuesta,
      );
    }

    return;
  }

  const member =
    interactionOrMessage.member as
      | GuildMember
      | null;

  if (!tienePermisoLoteria(member)) {
    const respuesta =
      "No tenés un rol autorizado para gestionar la lotería";

    if (
      interactionOrMessage.isChatInputCommand?.()
    ) {
      await interactionOrMessage.reply({
        content: respuesta,
        ephemeral: true,
      });
    } else {
      await interactionOrMessage.reply(
        respuesta,
      );
    }

    return;
  }

  try {
    /*
     * Fetch completo de miembros.
     *
     * Esto hace que no dependamos únicamente de los miembros
     * que Discord tenga actualmente cacheados.
     */
    await guild.members.fetch();

    const miembrosLoteria =
      guild.members.cache.filter(
        (member) =>
          !member.user.bot &&
          member.roles.cache.has(
            LOTERIA_ROLE_ID,
          ),
      );

    participantes =
      Array.from(
        miembrosLoteria.keys(),
      );

    const cantidad =
      participantes.length;

    const embed =
      new EmbedBuilder()
        .setColor("#FFD700")
        .setTitle("🎟️ Participantes de la Lotería")
        .setDescription(
          cantidad > 0
            ? `Se actualizaron correctamente los participantes de la lotería.\n\n**${cantidad} participante${cantidad === 1 ? "" : "s"} encontrado${cantidad === 1 ? "" : "s"}.**`
            : "No hay ningún participante con el rol de la lotería.",
        )
        .setTimestamp();

    if (cantidad > 0) {
      const lista =
        miembrosLoteria
          .map(
            (member) =>
              `• ${member}`,
          )
          .join("\n");

      embed.addFields({
        name: "Participantes registrados",
        value:
          lista.length <= 1024
            ? lista
            : `Hay **${cantidad}** participantes registrados. Usá \`/notas\` para consultar la lista.`,
      });
    }

    if (
      interactionOrMessage.isChatInputCommand?.()
    ) {
      await interactionOrMessage.reply({
        embeds: [embed],
      });
    } else {
      await interactionOrMessage.reply({
        embeds: [embed],
      });
    }
  } catch (error) {
    console.error(
      "❌ Error actualizando participantes de la lotería:",
      error,
    );

    const respuesta =
      "❌ Ocurrió un error al buscar los participantes de la lotería.";

    if (
      interactionOrMessage.isChatInputCommand?.()
    ) {
      if (
        !interactionOrMessage.replied &&
        !interactionOrMessage.deferred
      ) {
        await interactionOrMessage.reply({
          content: respuesta,
          ephemeral: true,
        });
      }
    } else {
      await interactionOrMessage.reply(
        respuesta,
      );
    }
  }
}

/* ============================================================
 * MOSTRAR PARTICIPANTES
 * ============================================================ */

async function mostrarParticipantes(
  interactionOrMessage:
    | ChatInputCommandInteraction
    | Message,
): Promise<void> {
  if (participantes.length === 0) {
    const embed =
      new EmbedBuilder()
        .setColor("#ED4245")
        .setTitle("🎟️ Lotería")
        .setDescription(
          "No hay participantes anotados actualmente.",
        )
        .setTimestamp();

    if (
      interactionOrMessage.isChatInputCommand?.()
    ) {
      await interactionOrMessage.reply({
        embeds: [embed],
      });
    } else {
      await interactionOrMessage.reply({
        embeds: [embed],
      });
    }

    return;
  }

  const guild =
    interactionOrMessage.guild;

  if (!guild) {
    return;
  }

  const nombres =
    participantes.map(
      (userId, index) => {
        const member =
          guild.members.cache.get(
            userId,
          );

        return `${index + 1}. ${
          member
            ? `${member}`
            : `<@${userId}>`
        }`;
      },
    );

  /*
   * Discord permite hasta 4096 caracteres en la descripción
   * de un Embed. Si hay demasiados participantes, dividimos
   * la información en fields.
   */
  const embed =
    new EmbedBuilder()
      .setColor("#5865F2")
      .setTitle(
        "🎟️ Participantes de la Lotería",
      )
      .setDescription(
        `Actualmente hay **${participantes.length} participante${participantes.length === 1 ? "" : "s"}** anotado${participantes.length === 1 ? "" : "s"}.`,
      )
      .setTimestamp();

  let bloque = "";

  let fieldNumber = 1;

  for (
    const linea of nombres
  ) {
    if (
      (bloque + linea + "\n")
        .length > 1024
    ) {
      embed.addFields({
        name:
          fieldNumber === 1
            ? "Lista de participantes"
            : `Lista de participantes (${fieldNumber})`,
        value:
          bloque ||
          "Sin participantes.",
      });

      fieldNumber++;
      bloque = "";
    }

    bloque += `${linea}\n`;
  }

  if (bloque) {
    embed.addFields({
      name:
        fieldNumber === 1
          ? "Lista de participantes"
          : `Lista de participantes (${fieldNumber})`,
      value: bloque,
    });
  }

  if (
    interactionOrMessage.isChatInputCommand?.()
  ) {
    await interactionOrMessage.reply({
      embeds: [embed],
    });
  } else {
    await interactionOrMessage.reply({
      embeds: [embed],
    });
  }
}

/* ============================================================
 * GIRAR LOTERÍA
 * ============================================================ */

async function girar(
  interactionOrMessage:
    | ChatInputCommandInteraction
    | Message,
): Promise<void> {
  const guild =
    interactionOrMessage.guild;

  if (!guild) {
    const respuesta =
      "❌ Este comando solamente puede utilizarse dentro de un servidor.";

    if (
      interactionOrMessage.isChatInputCommand?.()
    ) {
      await interactionOrMessage.reply({
        content: respuesta,
        ephemeral: true,
      });
    } else {
      await interactionOrMessage.reply(
        respuesta,
      );
    }

    return;
  }

  const member =
    interactionOrMessage.member as
      | GuildMember
      | null;

  if (!tienePermisoLoteria(member)) {
    const respuesta =
      "No tenés un rol autorizado para gestionar la lotería";

    if (
      interactionOrMessage.isChatInputCommand?.()
    ) {
      await interactionOrMessage.reply({
        content: respuesta,
        ephemeral: true,
      });
    } else {
      await interactionOrMessage.reply(
        respuesta,
      );
    }

    return;
  }

  if (participantes.length === 0) {
    const respuesta =
      "❌ No hay participantes anotados. Primero ejecutá `-anotar` o `/anotar`.";

    if (
      interactionOrMessage.isChatInputCommand?.()
    ) {
      await interactionOrMessage.reply({
        content: respuesta,
        ephemeral: true,
      });
    } else {
      await interactionOrMessage.reply(
        respuesta,
      );
    }

    return;
  }

  /*
   * Copiamos la lista para que el sorteo no modifique
   * accidentalmente la lista original durante el proceso.
   */
  const jugadores =
    mezclar(participantes);

  /*
   * Discord requiere una respuesta inicial dentro de unos
   * segundos. En Slash Commands hacemos deferReply.
   */
  if (
    interactionOrMessage.isChatInputCommand?.()
  ) {
    await interactionOrMessage.deferReply();
  }

  const enviar = async (
    contenido: string,
  ) => {
    if (
      interactionOrMessage.isChatInputCommand?.()
    ) {
      await interactionOrMessage.followUp(
        contenido,
      );
    } else {
      await interactionOrMessage.channel.send(
        contenido,
      );
    }
  };

  /*
   * Anuncio inicial.
   */
  await enviar(
    `🎰 **¡COMIENZA LA LOTERÍA!**\n\nHay **${jugadores.length} participantes**. La ruleta está girando...`,
  );

  await esperar(2500);

  /*
   * Eliminación progresiva.
   *
   * Como la lista ya fue mezclada con Fisher-Yates,
   * cada posición de eliminación está determinada de forma
   * aleatoria antes de comenzar el sorteo.
   */
  while (jugadores.length > 1) {
    const eliminado =
      jugadores.shift();

    if (!eliminado) break;

    const eliminadoMember =
      guild.members.cache.get(
        eliminado,
      );

    const nombreEliminado =
      eliminadoMember
        ? eliminadoMember.displayName
        : `<@${eliminado}>`;

    await enviar(
      `🎰 La ruleta sigue girando...\n\n💥 **${nombreEliminado}** fue eliminado de la lotería.`,
    );

    /*
     * Pausa entre eliminaciones para generar el efecto
     * de tensión.
     */
    const cantidadRestante =
      jugadores.length;

    if (
      cantidadRestante > 1
    ) {
      await esperar(2200);
    }
  }

  const ganador =
    jugadores[0];

  if (!ganador) {
    return;
  }

  const ganadorMember =
    guild.members.cache.get(
      ganador,
    );

  const nombreGanador =
    ganadorMember
      ? ganadorMember.displayName
      : `<@${ganador}>`;

  await esperar(2500);

  const ganadorEmbed =
    new EmbedBuilder()
      .setColor("#FFD700")
      .setTitle(
        "🏆 ¡TENEMOS GANADOR!",
      )
      .setDescription(
        `# 🎉 ${nombreGanador}\n\n**¡Es el gran ganador de la lotería!** 🎟️`,
      )
      .addFields({
        name: "👑 Ganador",
        value: `<@${ganador}>`,
        inline: true,
      })
      .setFooter({
        text: "Lotería • Sorteo finalizado",
      })
      .setTimestamp();

  if (
    interactionOrMessage.isChatInputCommand?.()
  ) {
    await interactionOrMessage.followUp({
      embeds: [ganadorEmbed],
    });
  } else {
    await interactionOrMessage.channel.send({
      embeds: [ganadorEmbed],
    });
  }

  /*
   * Después de terminar el sorteo, dejamos como lista actual
   * únicamente al ganador.
   *
   * Si querés que la lotería se vacíe completamente después
   * del sorteo, esto se puede cambiar posteriormente.
   */
  participantes = [ganador];
}

/* ============================================================
 * DEFINICIÓN DEL SLASH COMMAND
 * ============================================================ */

export const data = {
  name: "loteria",
  description: "Sistema de gestión y sorteo de lotería",
};

/* ============================================================
 * EXECUTE
 * ============================================================ */

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  switch (
    interaction.options.getSubcommand()
  ) {
    case "anotar":
      await anotar(interaction);
      break;

    case "notas":
      await mostrarParticipantes(
        interaction,
      );
      break;

    case "girar":
      await girar(interaction);
      break;

    default:
      await interaction.reply({
        content:
          "❌ Subcomando de lotería no reconocido.",
        ephemeral: true,
      });
  }
}

/* ============================================================
 * PREFIX COMMANDS
 * ============================================================ */

export async function run(
  message: Message,
  args: string[],
): Promise<void> {
  const subcomando =
    args[0]?.toLowerCase();

  switch (subcomando) {
    case "anotar":
      await anotar(message);
      break;

    case "notas":
      await mostrarParticipantes(
        message,
      );
      break;

    case "girar":
      await girar(message);
      break;

    default:
      await message.reply(
        "❌ Uso incorrecto. Usá `-anotar`, `-notas` o `-girar`.",
      );
      break;
  }
}

/* ============================================================
 * EXPORTS OPCIONALES
 * ============================================================ */

/*
 * Permite consultar los participantes desde otro módulo
 * si en el futuro necesitás hacerlo.
 */
export function getParticipantes(): string[] {
  return [...participantes];
}
