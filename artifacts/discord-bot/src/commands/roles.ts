import {
  SlashCommandBuilder,
  EmbedBuilder,
  type ChatInputCommandInteraction,
  type Message,
  type GuildMember,
  type Role,
} from "discord.js";

import { logger } from "../lib/logger";

/* ========================================================================== */
/*                              CONFIGURACIÓN                                 */
/* ========================================================================== */

// Color naranja que venimos usando en los embeds.
const EMBED_COLOR = 0xffa500;

// Roles autorizados para usar los comandos de dar y quitar roles.
const AUTHORIZED_ROLE_IDS = [
  "1539368076326473868", // Developer Tiago Jr
  "1451383215603585140", // Owner
  "1508266687689003039", // Co-Owner
  "1512634750152478851", // Jefe Staff
  "1485101671875874997", // Administrador Elite
  "1455419124732657801", // Equipo Administrativo
  "1522434536796061816", // Desarrollador
  "1453211902267228160", // Administrador
  "1509760475653472287", // Administrador [PB]
  "1522807097920720967", // Manager
];

/* ========================================================================== */
/*                            DEFINICIÓN DEL COMANDO                          */
/* ========================================================================== */

export const data = {
  // Configuramos /roles con sus dos subcomandos.
  data: new SlashCommandBuilder()
    .setName("roles")
    .setDescription("Administra los roles de los usuarios del servidor")

    // Subcomando para asignarle un rol a un usuario.
    .addSubcommand((sub) =>
      sub
        .setName("dar")
        .setDescription("Asigna un rol a un usuario")
        .addUserOption((option) =>
          option
            .setName("usuario")
            .setDescription("El usuario al que le vas a dar el rol")
            .setRequired(true),
        )
        .addRoleOption((option) =>
          option
            .setName("rol")
            .setDescription("El rol que le vas a asignar")
            .setRequired(true),
        ),
    )

    // Subcomando para sacarle un rol a un usuario.
    .addSubcommand((sub) =>
      sub
        .setName("quitar")
        .setDescription("Le saca un rol a un usuario")
        .addUserOption((option) =>
          option
            .setName("usuario")
            .setDescription("El usuario al que le vas a sacar el rol")
            .setRequired(true),
        )
        .addRoleOption((option) =>
          option
            .setName("rol")
            .setDescription("El rol que le vas a sacar")
            .setRequired(true),
        ),
    ),

  /* ------------------------------------------------------------------------ */
  /*                         EJECUCIÓN CON SLASH COMMAND                      */
  /* ------------------------------------------------------------------------ */

  async execute(interaction: ChatInputCommandInteraction) {
    // Este comando solamente se puede usar dentro de un servidor.
    if (!interaction.inGuild()) {
      await interaction.reply({
        content: "❌ Este comando solamente se puede usar dentro de un servidor.",
        ephemeral: true,
      });
      return;
    }

    const subcommand = interaction.options.getSubcommand();

    // Buscamos al usuario y el rol seleccionados.
    const targetMember = interaction.options.getMember("usuario");
    const role = interaction.options.getRole("rol");

    // Obtenemos al miembro que ejecutó el comando.
    const executor = interaction.member;

    // Validamos los datos antes de continuar.
    if (
      !targetMember ||
      !("roles" in targetMember) ||
      !role ||
      !("roles" in executor)
    ) {
      await interaction.reply({
        content:
          "❌ No pude encontrar al usuario, al rol o los datos necesarios para ejecutar el comando.",
        ephemeral: true,
      });
      return;
    }

    await handleRoleAction(
      interaction,
      executor as GuildMember,
      targetMember as GuildMember,
      role as Role,
      subcommand === "dar",
    );
  },

  /* ------------------------------------------------------------------------ */
  /*                       EJECUCIÓN CON COMANDOS DE PREFIJO                  */
  /* ------------------------------------------------------------------------ */

  async run(message: Message, args: string[], commandName: string) {
    // Este comando solamente se puede usar dentro de un servidor.
    if (!message.guild || !message.member) {
      return;
    }

    // Definimos si vamos a dar o quitar el rol.
    const isGiving = commandName === "darrol";

    // Buscamos las menciones del usuario y del rol.
    const targetMember = message.mentions.members?.first();
    const role = message.mentions.roles.first();

    // Si falta alguna mención, mostramos cómo se usa.
    if (!targetMember || !role) {
      await message.reply(
        [
          "❌ Uso incorrecto del comando.",
          "",
          "Usá alguno de estos formatos:",
          "`-darrol @usuario @rol`",
          "`-quitarrol @usuario @rol`",
        ].join("\n"),
      );
      return;
    }

    await handleRoleAction(
      message,
      message.member,
      targetMember,
      role,
      isGiving,
    );
  },
};

/* ========================================================================== */
/*                          LÓGICA PRINCIPAL DE ROLES                         */
/* ========================================================================== */

async function handleRoleAction(
  context: ChatInputCommandInteraction | Message,
  executor: GuildMember,
  targetMember: GuildMember,
  role: Role,
  isGiving: boolean,
): Promise<void> {
  const guild = context.guild;

  if (!guild) {
    return;
  }

  // Función auxiliar para responder según el tipo de comando.
  const reply = async (content: string, ephemeral = false) => {
    if (context.isChatInputCommand()) {
      if (context.replied || context.deferred) {
        await context.followUp({ content, ephemeral });
      } else {
        await context.reply({ content, ephemeral });
      }
    } else {
      await context.reply({ content });
    }
  };

  /* ------------------------------------------------------------------------ */
  /* 1. VERIFICAR QUE EL EJECUTOR TENGA UNO DE LOS ROLES AUTORIZADOS          */
  /* ------------------------------------------------------------------------ */

  const hasAuthorizedRole = executor.roles.cache.some((memberRole) =>
    AUTHORIZED_ROLE_IDS.includes(memberRole.id),
  );

  if (!hasAuthorizedRole) {
    await reply(
      "❌ No tenés permisos suficientes para usar este comando. Necesitás tener uno de los roles autorizados del equipo.",
      true,
    );
    return;
  }

  /* ------------------------------------------------------------------------ */
  /* 2. VERIFICAR QUE EL BOT PUEDA GESTIONAR EL ROL                           */
  /* ------------------------------------------------------------------------ */

  const botMember = guild.members.me;

  if (!botMember) {
    await reply(
      "❌ No pude verificar mis permisos dentro del servidor. Probá de nuevo en unos segundos.",
      true,
    );
    return;
  }

  // El bot necesita tener el permiso Gestionar roles.
  if (!botMember.permissions.has("ManageRoles")) {
    await reply(
      "❌ No tengo el permiso `Gestionar roles`. Pedile a un administrador que lo habilite.",
      true,
    );
    return;
  }

  // El rol del bot tiene que estar por encima del rol que queremos modificar.
  if (botMember.roles.highest.position <= role.position) {
    await reply(
      "❌ No puedo gestionar ese rol porque está por encima o al mismo nivel que mi rol más alto. Subí mi rol en la jerarquía del servidor.",
      true,
    );
    return;
  }

  /* ------------------------------------------------------------------------ */
  /* 3. VERIFICAR LA JERARQUÍA DEL EJECUTOR                                   */
  /* ------------------------------------------------------------------------ */

  // El propietario del servidor no necesita superar esta comprobación.
  if (
    guild.ownerId !== executor.id &&
    executor.roles.highest.position <= role.position
  ) {
    await reply(
      "❌ No podés dar ni quitar un rol que esté al mismo nivel o por encima de tu rol más alto.",
      true,
    );
    return;
  }

  /* ------------------------------------------------------------------------ */
  /* 4. VERIFICAR QUE EL ROL NO SEA ADMINISTRADO POR UNA INTEGRACIÓN           */
  /* ------------------------------------------------------------------------ */

  if (role.managed) {
    await reply(
      "❌ No podés modificar ese rol manualmente porque está administrado por una integración o por Discord.",
      true,
    );
    return;
  }

  /* ------------------------------------------------------------------------ */
  /* 5. DAR O QUITAR EL ROL                                                   */
  /* ------------------------------------------------------------------------ */

  try {
    // Preparamos el embed de confirmación.
    const embed = new EmbedBuilder()
      .setColor(EMBED_COLOR)
      .setTimestamp()
      .setFooter({
        text: `Acción realizada por ${context.isChatInputCommand()
          ? context.user.tag
          : context.author.tag}`,
      });

    if (isGiving) {
      // No intentamos asignar un rol que el usuario ya tiene.
      if (targetMember.roles.cache.has(role.id)) {
        await reply(
          `⚠️ <@${targetMember.id}> ya tiene el rol **${role.name}**.`,
          true,
        );
        return;
      }

      // Le damos el rol al usuario.
      await targetMember.roles.add(role, "Rol asignado mediante el comando de roles");

      embed
        .setTitle("✅ Rol asignado")
        .setDescription(
          `Se le otorgó el rol **${role.name}** a <@${targetMember.id}>.`,
        );
    } else {
      // No intentamos quitar un rol que el usuario no tiene.
      if (!targetMember.roles.cache.has(role.id)) {
        await reply(
          `⚠️ <@${targetMember.id}> no tiene el rol **${role.name}**.`,
          true,
        );
        return;
      }

      // Le sacamos el rol al usuario.
      await targetMember.roles.remove(
        role,
        "Rol retirado mediante el comando de roles",
      );

      embed
        .setTitle("🗑️ Rol removido")
        .setDescription(
          `Se le retiró el rol **${role.name}** a <@${targetMember.id}>.`,
        );
    }

    // Mostramos la confirmación en el canal donde se ejecutó el comando.
    if (context.isChatInputCommand()) {
      await context.reply({ embeds: [embed] });
    } else {
      await context.reply({ embeds: [embed] });
    }

    // Dejamos registro de la acción en los logs.
    logger.info(
      {
        guildId: guild.id,
        executorId: executor.id,
        targetUserId: targetMember.id,
        roleId: role.id,
        roleName: role.name,
        action: isGiving ? "give" : "remove",
      },
      "Comando de roles ejecutado exitosamente.",
    );
  } catch (err) {
    // Registramos el error para poder revisarlo desde la consola.
    logger.error(
      {
        err,
        guildId: guild.id,
        executorId: executor.id,
        targetUserId: targetMember.id,
        roleId: role.id,
        action: isGiving ? "give" : "remove",
      },
      "Error al ejecutar el comando de roles.",
    );

    await reply(
      "❌ Hubo un error al intentar modificar el rol. Revisá mis permisos y la jerarquía de roles, y probá de nuevo.",
      true,
    );
  }
}
