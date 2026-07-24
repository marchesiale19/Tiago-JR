import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type AutocompleteInteraction,
} from "discord.js";

interface Infraction {
  name: string;
  nivel: number;
  tiempo: string;
}

const INFRACTIONS: Infraction[] = [
  // NIVEL 1
  { name: "MAL USO DE CANALES", nivel: 1, tiempo: "1 MINUTO" },
  { name: "MICROFONO SATURADO", nivel: 1, tiempo: "1 MINUTO" },
  { name: "RUIDOS MOLESTOS", nivel: 1, tiempo: "1 MINUTO" },
  { name: "PERDER EN EL CONTADOR A PROPÓSITO", nivel: 1, tiempo: "1 MINUTO" },
  {
    name: "USO INNECESARIO DE # PARA EL TAMAÑO DEL TEXTO EN EXCESO CON SPAM",
    nivel: 1,
    tiempo: "1 MINUTO",
  },
  {
    name: "ENTRAR Y SALIR DEL CANAL DE VOZ PARA MOLESTAR A OTROS USUARIOS",
    nivel: 1,
    tiempo: "1 MINUTO",
  },
  { name: "SPAM DE REACCIONES SIN CONFIANZA", nivel: 1, tiempo: "1 MINUTO" },

  // NIVEL 2
  { name: "SPAM Y FLOOD", nivel: 2, tiempo: "5 - 10 MINUTOS" },
  { name: "HABLAR DURANTE PARTIDA", nivel: 2, tiempo: "5 - 10 MINUTOS" },
  { name: "PING INNECESARIO DE STAFF", nivel: 2, tiempo: "5 - 10 MINUTOS" },
  {
    name: "NO TENER EL MISMO NOMBRE DE AMONG US",
    nivel: 2,
    tiempo: "5 - 10 MINUTOS",
  },
  { name: "MAL USO DE SUGERENCIA", nivel: 2, tiempo: "5 - 10 MINUTOS" },
  {
    name: "FALTA DE RESPETO ENTRE MIEMBROS",
    nivel: 2,
    tiempo: "5 - 10 MINUTOS",
  },
  {
    name: "QUEDARSE AFK EN UNA PARTIDA Y PERJUDICAR A TU EQUIPO",
    nivel: 2,
    tiempo: "5 - 10 MINUTOS",
  },
  { name: "MAL INFORMAR DE UNA REGLA", nivel: 2, tiempo: "5 - 10 MINUTOS" },
  {
    name: "ABANDONAR LA PARTIDA A PROPOSITO",
    nivel: 2,
    tiempo: "5 - 10 MINUTOS",
  },
  { name: "MAL USO DE TICKETS", nivel: 2, tiempo: "5 - 10 MINUTOS" },
  { name: "PRENDER CAMARA EN AMONG US", nivel: 2, tiempo: "5 - 10 MINUTOS" },
  { name: "MAL USO DE PINGS", nivel: 2, tiempo: "5 - 10 MINUTOS" },
  {
    name: "ENTRAR A UNA SALA SIN ESTAR EN EL VC",
    nivel: 2,
    tiempo: "5 - 10 MINUTOS",
  },
  { name: "RUIDOS MUY MOLESTOS", nivel: 2, tiempo: "5 - 10 MINUTOS" },
  {
    name: "ENTRAR PARA MOLESTAR A UN CANAL DE VOZ",
    nivel: 2,
    tiempo: "5 - 10 MINUTOS",
  },
  {
    name: "NO RESPETAR EL TURNO DE OTRA PERSONA PARA HABLAR",
    nivel: 2,
    tiempo: "5 - 10 MINUTOS",
  },

  // NIVEL 3
  { name: "FALTA DE RESPETO AL STAFF", nivel: 3, tiempo: "1 HORA - 1 DIA" },
  { name: "SACAR SIN PRUEBAS", nivel: 3, tiempo: "1 HORA - 1 DIA" },
  {
    name: "SALIRSE CONSCIENTEMENTE PARA RESETEAR VOTOS",
    nivel: 3,
    tiempo: "1 HORA - 1 DIA",
  },
  {
    name: "REVELAR INFORMACION ESTANDO MUERTO",
    nivel: 3,
    tiempo: "1 HORA - 1 DIA",
  },
  { name: "MENTIR AL STAFF", nivel: 3, tiempo: "1 HORA - 1 DIA" },
  { name: "PROVOCAR DISCUCIONES", nivel: 3, tiempo: "1 HORA - 1 DIA" },
  {
    name: "PROTEGER QUEDANDO 1 IMPOSTOR",
    nivel: 3,
    tiempo: "1 HORA - 1 DIA",
  },
  { name: "SABOTEAR ESTANDO MUERTO", nivel: 3, tiempo: "1 HORA - 1 DIA" },
  {
    name: "DELATAR A TU COMPAÑERO IMPOSTOR",
    nivel: 3,
    tiempo: "1 HORA - 1 DIA",
  },
  {
    name: "FINGIR ROL SIENDO TRIPULANTE",
    nivel: 3,
    tiempo: "1 HORA - 1 DIA",
  },
  {
    name: "SUPLANTACION IDENTIDAD DEL STAFF",
    nivel: 3,
    tiempo: "1 HORA - 1 DIA",
  },
  { name: "NOMBRE INAPROPIADO", nivel: 3, tiempo: "1 HORA - 1 DIA" },
  { name: "TROLEAR PARTIDAS", nivel: 3, tiempo: "1 HORA - 1 DIA" },
  {
    name: "CASO OMISO ORDENES DEL STAFF",
    nivel: 3,
    tiempo: "1 HORA - 1 DIA",
  },
  {
    name: "INTERFERENCIA A LA MODERACION",
    nivel: 3,
    tiempo: "1 HORA - 1 DIA",
  },
  {
    name: "ACUMULACION DE VARIAS SANCIONES DE 10 MINUTOS (MAS DE 4)",
    nivel: 3,
    tiempo: "1 HORA - 1 DIA",
  },
  {
    name: "COMANDO INAPROPIADOS (?wa,banana,spank,booba,C NSFW)",
    nivel: 3,
    tiempo: "1 HORA - 1 DIA",
  },
  { name: "EVADIR SANCION", nivel: 3, tiempo: "1 HORA - 1 DIA" },
  {
    name: "HABLAR DE SANCIONES EN PUBLICO",
    nivel: 3,
    tiempo: "1 HORA - 1 DIA",
  },
  {
    name: "INSULTOS O ATAQUES A FAMILIARES DE UN USUARIO",
    nivel: 3,
    tiempo: "1 HORA - 1 DIA",
  },
  { name: "DESEAR MAL A BAX", nivel: 3, tiempo: "1 HORA - 1 DIA" },
  { name: "INCOMODAR", nivel: 3, tiempo: "1 HORA - 1 DIA" },
  {
    name: "COMPARTIR PANTALLA EN AMONG US",
    nivel: 3,
    tiempo: "1 HORA - 1 DIA",
  },
  {
    name: "PLAGIAR ARTE, COPIAR, ROBAR O HACER VER ARTE CON IA COMO TUYA",
    nivel: 3,
    tiempo: "1 HORA - 1 DIA",
  },
  {
    name: "REPORTES FALSOS O FALSAS ACUSACIONES",
    nivel: 3,
    tiempo: "1 HORA - 1 DIA",
  },
  { name: "COMENTARIOS +18", nivel: 3, tiempo: "1 HORA - 1 DIA" },
  { name: "ENCUBRIMIENTO DE SANCIÓN", nivel: 3, tiempo: "1 HORA - 1 DIA" },
  {
    name: "INCITAR A JUGADORES A ROMPER REGLAS",
    nivel: 3,
    tiempo: "1 HORA - 1 DIA",
  },
  { name: "GEMIDOS", nivel: 3, tiempo: "1 HORA - 1 DIA" },
  {
    name: "REVISAR UNA GRABACIÓN PROPIA DURANTE PARTIDA Y QUE INFLUYA EN EL JUEGO",
    nivel: 3,
    tiempo: "1 HORA - 1 DIA",
  },

  // NIVEL 4
  {
    name: "COMENTARIOS PASIVO AGRESIVOS",
    nivel: 4,
    tiempo: "1 DIA - 1 SEMANA",
  },
  { name: "EXCLUCIÓN", nivel: 4, tiempo: "1 DIA - 1 SEMANA" },
  { name: "DISCRIMINACION", nivel: 4, tiempo: "1 DIA - 1 SEMANA" },
  {
    name: "ACUMULACION DE SANCIONES NIVEL 3",
    nivel: 4,
    tiempo: "1 DIA - 1 SEMANA",
  },
  { name: "RACISMO", nivel: 4, tiempo: "1 DIA - 1 SEMANA" },
  { name: "CLASISMO", nivel: 4, tiempo: "1 DIA - 1 SEMANA" },
  { name: "MACHISMO SIN CONFIANZA", nivel: 4, tiempo: "1 DIA - 1 SEMANA" },
  { name: "INSULTOS AL DM", nivel: 4, tiempo: "1 DIA - 1 SEMANA" },
  { name: "DIFAMACION", nivel: 4, tiempo: "1 DIA - 1 SEMANA" },
  { name: "XENOFOBIA", nivel: 4, tiempo: "1 DIA - 1 SEMANA" },
  { name: "FOCUS", nivel: 4, tiempo: "1 DIA - 1 SEMANA" },
  { name: "HOMOFOBIA", nivel: 4, tiempo: "1 DIA - 1 SEMANA" },
  {
    name: "FILTRAR CONVERSACIONES PRIVADAS SIN CONCENTIMIENTO DE LA OTRA PERSONA",
    nivel: 4,
    tiempo: "1 DIA - 1 SEMANA",
  },
  {
    name: "AMENAZAR A UN USUARIO CON COSAS LEVES DENTRO DEL SERVIDOR",
    nivel: 4,
    tiempo: "1 DIA - 1 SEMANA",
  },

  // NIVEL 5
  { name: "DOXXEO", nivel: 5, tiempo: "1 SEMANA O BAN" },
  { name: "MULTICUENTA", nivel: 5, tiempo: "1 SEMANA O BAN" },
  { name: "ACOSO", nivel: 5, tiempo: "1 SEMANA O BAN" },
  { name: "METAGAMING", nivel: 5, tiempo: "1 SEMANA O BAN" },
  {
    name: "MOSTRAR COSAS INAPROPIADAS O NSWF",
    nivel: 5,
    tiempo: "1 SEMANA O BAN",
  },
  { name: "FOTO INAPROPIADA", nivel: 5, tiempo: "1 SEMANA O BAN" },
  { name: "PEDOFILIA", nivel: 5, tiempo: "1 SEMANA O BAN" },
  { name: "CONTENIDO GORE", nivel: 5, tiempo: "1 SEMANA O BAN" },
  {
    name: "GRUPO EXTERNO PARA HABLAR MAL DEL STAFF",
    nivel: 5,
    tiempo: "1 SEMANA O BAN",
  },
  { name: "CATFISHING", nivel: 5, tiempo: "1 SEMANA O BAN" },
  { name: "GROOMING", nivel: 5, tiempo: "1 SEMANA O BAN" },
  { name: "NAZISMO", nivel: 5, tiempo: "1 SEMANA O BAN" },
  { name: "USO DE HACKS", nivel: 5, tiempo: "1 SEMANA O BAN" },
  { name: "COMPARTIR LINKS EXTERNOS", nivel: 5, tiempo: "1 SEMANA O BAN" },
  { name: "CONTENIDO NSFW", nivel: 5, tiempo: "1 SEMANA O BAN" },
  {
    name: "ACUMULACIÓN DE INFRACCIONES (20)",
    nivel: 5,
    tiempo: "1 SEMANA O BAN",
  },
  {
    name: "PROMOCIONAR LINKS DE OTROS SERVIDORES",
    nivel: 5,
    tiempo: "1 SEMANA O BAN",
  },
  {
    name: "AMENAZAS REALES O DE MUERTE",
    nivel: 5,
    tiempo: "1 SEMANA O BAN",
  },
  {
    name: "DISTRIBUCIÓN DE MALWARE, VIRUS O ARCHIVOS MALICIOSOS",
    nivel: 5,
    tiempo: "1 SEMANA O BAN",
  },
  {
    name: "VENTA DE ROBUX, DIAMANTES, ESTAFAS, ETC...",
    nivel: 5,
    tiempo: "1 SEMANA O BAN",
  },
];

// Discord autocomplete allows a max of 25 choices per response.
const MAX_AUTOCOMPLETE_CHOICES = 25;

export const data = new SlashCommandBuilder()
  .setName("sanciones")
  .setDescription("Consulta la información de una sanción.")
  .setDefaultMemberPermissions(PermissionFlagsBits.MuteMembers)
  .addStringOption((option) =>
    option
      .setName("infraccion")
      .setDescription("Nombre de la infracción a consultar.")
      .setRequired(true)
      .setAutocomplete(true),
  );

export async function autocomplete(
  interaction: AutocompleteInteraction,
): Promise<void> {
  const focused = interaction.options.getFocused().toUpperCase().trim();

  const filtered = focused
    ? INFRACTIONS.filter((inf) => inf.name.includes(focused))
    : INFRACTIONS;

  const choices = filtered.slice(0, MAX_AUTOCOMPLETE_CHOICES).map((inf) => ({
    name: inf.name,
    value: inf.name,
  }));

  await interaction.respond(choices);
}

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const selectedName = interaction.options.getString("infraccion", true);

  const infraction = INFRACTIONS.find(
    (inf) => inf.name === selectedName,
  );

  if (!infraction) {
    await interaction.reply({
      content:
        "⚠️ Infracción no reconocida. Por favor selecciona una opción del menú de autocompletado.",
      ephemeral: true,
    });
    return;
  }

  // Security check: only Trial Helper, Helper, Moderador [PB], or higher
  const MINIMUM_ROLE = "Trial Helper";
  const member = interaction.member;
  let hasAccess = false;

  if (member && typeof member !== "string" && "roles" in member) {
    const guild = interaction.guild;
    if (guild) {
      await guild.roles.fetch();
      const minRole = guild.roles.cache.find((r) => r.name === MINIMUM_ROLE);
      if (minRole) {
        const memberRoles = (member.roles as any).cache;
        const highestPosition = Math.max(
          ...memberRoles.map((r: any) => r.position),
        );
        hasAccess = highestPosition >= minRole.position;
      }
    }
  }

  if (!hasAccess) {
    await interaction.reply({
      content: "❌ No tienes permiso para usar este comando.",
      ephemeral: true,
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setColor("Red")
    .setTitle("⚖️ Información de la sanción")
    .addFields(
      { name: "📌 **Infracción:**", value: infraction.name, inline: false },
      { name: "📊 **Nivel:**", value: `Nivel ${infraction.nivel}`, inline: true },
      { name: "⏳ **Tiempo:**", value: infraction.tiempo, inline: true },
    )
    .setFooter({ text: "Sistema de Sanciones • TIAGO JR" })
    .setTimestamp();

  await interaction.reply({ embeds: [embed], ephemeral: false });
}
