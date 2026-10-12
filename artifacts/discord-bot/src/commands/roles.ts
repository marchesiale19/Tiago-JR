import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  type ChatInputCommandInteraction,
  type Message,
  type GuildMember,
  type Role,
} from "discord.js";
import { logger } from "../lib/logger";

const EMBED_COLOR = 0xffa500; // Naranja que venimos usando

export const data = {
  // Configuración de Slash Commands para registrar ambos en Discord
  data: new SlashCommandBuilder()
    .setName("roles")
    .setDescription("Administra los roles de los usuarios del servidor")
    .addSubcommand((sub) =>
      sub
        .setName("dar")
        .setDescription("Asigna un rol a un usuario")
        .addUserOption((option) =>
          option.setName("usuario").setDescription("El usuario").setRequired(true)
        )
        .addRoleOption((option) =>
          option.setName("rol").setDescription("El rol a asignar").setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("quitar")
        .setDescription("Quita un rol a un usuario")
        .addUserOption((option) =>
          option.setName("usuario").setDescription("El usuario").setRequired(true)
        )
        .addRoleOption((option) =>
          option.setName("rol").setDescription("El rol a quitar").setRequired(true)
        )
    ),

  // Función ejecutada por Slash Command (/darrol o /quitarrol simulado con subcomandos o comandos independientes)
  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) {
      return interaction.reply({ content: "❌ Este comando solo se puede usar en un servidor.", ephemeral: true });
    }

    const subcommand = interaction.options.getSubcommand();
    const targetMember = interaction.options.getMember("usuario") as GuildMember;
    const role = interaction.options.getRole("rol") as Role;
    const executor = interaction.member as GuildMember;

    await handleRoleAction(interaction, executor, targetMember, role, subcommand === "dar");
  },

  // Función para manejar también desde prefijos (-darrol y -quitarrol)
  async run(message: Message, args: string[], commandName: string) {
    if (!message.guild || !message.member) return;

    const isDar = commandName === "darrol";
    
    // Extraer menciones del mensaje (-darrol @usuario @rol)
    const targetMember = message.mentions.members?.first();
    const role = message.mentions.roles.first();

    if (!targetMember || !role) {
      await message.reply("❌ Uso incorrecto. Tenés que mencionar al usuario y al rol. Ejemplo: `!-darrol @usuario @rol`");
      return;
    }

    await handleRoleAction(message, message.member, targetMember, role, isDar);
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
  isGiving: boolean
) {
  const guild = context.guild;
  if (!guild) return;

  // 1. Validar permisos del ejecutor (Requiere Gestionar Roles o Administrador)
  if (!executor.permissions.has(PermissionFlagsBits.ManageRoles) && !executor.permissions.has(PermissionFlagsBits.Administrator)) {
    const content = "❌ No tenés permisos suficientes (`Gestionar Roles`) para ejecutar este comando.";
    return context.isChatInputCommand() ? context.reply({ content, ephemeral: true }) : context.reply(content);
  }

  // 2. Validar jerarquía del bot frente al rol
  const botMember = guild.members.me;
  if (!botMember || botMember.roles.highest.position <= role.position) {
    const content = "❌ No puedo gestionar este rol porque está por encima o al mismo nivel que mi rol más alto.";
    return context.isChatInputCommand() ? context.reply({ content, ephemeral: true }) : context.reply(content);
  }

  // 3. Validar jerarquía del ejecutor frente al rol (excepto el Owner)
  if (guild.ownerId !== executor.id && executor.roles.highest.position <= role.position) {
    const content = "❌ No podés asignar o quitar un rol que es igual o superior a tu rol más alto.";
    return context.isChatInputCommand() ? context.reply({ content, ephemeral: true }) : context.reply(content);
  }

  try {
    const embed = new EmbedBuilder().setColor(EMBED_COLOR).setTimestamp();

    if (isGiving) {
      if (targetMember.roles.cache.has(role.id)) {
        const content = `⚠️ El usuario <@${targetMember.id}> ya tiene el rol **${role.name}**.`;
        return context.isChatInputCommand() ? context.reply({ content, ephemeral: true }) : context.reply(content);
      }

      await targetMember.roles.add(role);
      embed.setTitle("✅ Rol Asignado").setDescription(`Se le ha otorgado el rol **${role.name}** a <@${targetMember.id}>.`);
    } else {
      if (!targetMember.roles.cache.has(role.id)) {
        const content = `⚠️ El usuario <@${targetMember.id}> no tiene el rol **${role.name}**.`;
        return context.isChatInputCommand() ? context.reply({ content, ephemeral: true }) : context.reply(content);
      }

      await targetMember.roles.remove(role);
      embed.setTitle("🗑️ Rol Removido").setDescription(`Se le ha retirado el rol **${role.name}** a <@${targetMember.id}>.`);
    }

    if (context.isChatInputCommand()) {
      await context.reply({ embeds: [embed] });
    } else {
      await context.reply({ embeds: [embed] });
    }
  } catch (err) {
    logger.error({ err }, "Error al modificar roles mediante comando");
    const content = "❌ Hubo un error crítico al intentar modificar los roles del usuario.";
    if (context.isChatInputCommand()) {
      if (context.replied || context.deferred) {
        await context.followUp({ content, ephemeral: true });
      } else {
        await context.reply({ content, ephemeral: true });
      }
    } else {
      await context.reply(content);
    }
  }
}
