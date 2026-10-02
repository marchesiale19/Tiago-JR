import {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
  type AutocompleteInteraction,
  type GuildMember,
} from "discord.js";
import { logger } from "../lib/logger";

interface Infraction {
  name: string;
  nivel: number;
  tiempo: string;
  descripcion: string;
}

const INFRACTIONS: Infraction[] = [
  // Nivel 1 (1 - 5 minutos)
  {
    name: "MAL USO DE CANALES",
    nivel: 1,
    tiempo: "1-5 MINUTOS",
    descripcion:
      "Usar un canal para una función que no corresponde. Se advierte primero y se sanciona si continúa.",
  },
  {
    name: "MICRÓFONO SATURADO",
    nivel: 1,
    tiempo: "1-5 MINUTOS",
    descripcion:
      "Tener el micrófono saturado o configurado de forma que genere un sonido molesto para los demás. Se advierte primero y se sanciona si continúa.",
  },
  {
    name: "RUIDOS MOLESTOS",
    nivel: 1,
    tiempo: "1-5 MINUTOS",
    descripcion:
      "Generar ruidos molestos en los canales de voz. Se advierte primero y se sanciona si continúa.",
  },
  {
    name: "ENTRAR Y SALIR DE UN CANAL DE VOZ PARA MOLESTAR",
    nivel: 1,
    tiempo: "1-5 MINUTOS",
    descripcion:
      "Entrar y salir repetidamente de un canal de voz con la intención de molestar a los demás.",
  },
  {
    name: "SPAM DE REACCIONES SIN CONFIANZA",
    nivel: 1,
    tiempo: "1-5 MINUTOS",
    descripcion:
      "Enviar muchas reacciones a mensajes ajenos sin tener confianza con la persona, generándole notificaciones innecesarias.",
  },
  {
    name: "PERDER EL CONTADOR APROPÓSITO",
    nivel: 1,
    tiempo: "1-5 MINUTOS",
    descripcion:
      "Perder el contador a propósito en dinámicas o canales de conteo.",
  },

  // Nivel 2 (10 - 30 minutos)
  {
    name: "FLOOD Y SPAM",
    nivel: 2,
    tiempo: "10-30 MINUTOS",
    descripcion:
      "Enviar una gran cantidad de mensajes o repetir contenido de forma excesiva, dificultando la conversación normal.",
  },
  {
    name: "HABLAR DURANTE PARTIDA",
    nivel: 2,
    tiempo: "10-30 MINUTOS",
    descripcion:
      "Hablar durante una partida cuando no corresponde, afectando el desarrollo normal de la misma.",
  },
  {
    name: "NO TENER EL MISMO NOMBRE DE AMONG US",
    nivel: 2,
    tiempo: "10-30 MINUTOS",
    descripcion:
      "Tener un nombre diferente en Among Us y Discord durante una partida.",
  },
  {
    name: "MAL USO DE SUGERENCIA",
    nivel: 2,
    tiempo: "10-30 MINUTOS",
    descripcion:
      "Usar el canal de sugerencias para molestar, llamar la atención o enviar contenido que no corresponde.",
  },
  {
    name: "MAL USO DE TICKET",
    nivel: 2,
    tiempo: "10-30 MINUTOS",
    descripcion:
      "Abrir tickets sin un motivo válido, cerrarlos repetidamente sin resolver nada o utilizarlos de forma indebida.",
  },
  {
    name: "FALTA DE RESPETO ENTRE MIEMBROS",
    nivel: 2,
    tiempo: "10-30 MINUTOS",
    descripcion:
      "Faltarle el respeto a otro miembro mediante insultos, provocaciones o actitudes similares.",
  },
  {
    name: "QUEDARSE AFK EN PARTIDA Y PERJUDICAR A TU EQUIPO",
    nivel: 2,
    tiempo: "10-30 MINUTOS",
    descripcion:
      "Quedarse AFK durante una partida perjudicando intencionalmente al propio equipo.",
  },
  {
    name: "MAL INFORMAR SOBRE UNA REGLA",
    nivel: 2,
    tiempo: "10-30 MINUTOS",
    descripcion:
      "Dar información incorrecta sobre una regla, provocando que otro miembro pueda romperla por esa información.",
  },
  {
    name: "PRENDER CÁMARA EN AMONG US",
    nivel: 2,
    tiempo: "10-30 MINUTOS",
    descripcion:
      "Prender la cámara dentro de una sala de Among Us cuando no está permitido.",
  },
  {
    name: "ENTRAR A UNA SALA Y NO ESTAR EN EL CANAL DE VOZ",
    nivel: 2,
    tiempo: "10-30 MINUTOS",
    descripcion:
      "Entrar a una sala de Among Us sin estar presente en el canal de voz correspondiente.",
  },
  {
    name: "RUIDOS MUY MOLESTOS",
    nivel: 2,
    tiempo: "10-30 MINUTOS",
    descripcion:
      "Generar ruidos excesivamente molestos o hacerlo intencionalmente para perjudicar la convivencia.",
  },
  {
    name: "ENTRAR A UN CANAL DE VOZ PARA MOLESTAR",
    nivel: 2,
    tiempo: "10-30 MINUTOS",
    descripcion:
      "Entrar a un canal de voz con la intención de molestar, provocar o interrumpir a los demás.",
  },
  {
    name: "NO RESPETAR TURNOS PARA HABLAR",
    nivel: 2,
    tiempo: "10-30 MINUTOS",
    descripcion:
      "Interrumpir constantemente o no respetar los turnos establecidos para hablar.",
  },
  {
    name: "PING INNECESARIO DE STAFF",
    nivel: 2,
    tiempo: "10-30 MINUTOS",
    descripcion:
      "Mencionar a miembros del Staff innecesariamente, sin un motivo válido que justifique el ping.",
  },
  {
    name: "ABANDONAR LA PARTIDA APROPÓSITO",
    nivel: 2,
    tiempo: "10-30 MINUTOS",
    descripcion:
      "Abandonar una partida intencionalmente para perjudicar a los demás o alterar su desarrollo.",
  },

  // Nivel 3 (1 - 12 horas)
  {
    name: "EVASIÓN DE SANCIÓN (NIVEL 3)",
    nivel: 3,
    tiempo: "1-12 HORAS",
    descripcion:
      "Intentar evitar una sanción cambiando de nombre, cuenta, identidad u ocultando deliberadamente la sanción.",
  },
  {
    name: "FALTA DE RESPETO AL STAFF",
    nivel: 3,
    tiempo: "1-12 HORAS",
    descripcion:
      "Faltarle el respeto a un miembro del Staff mediante insultos, provocaciones o actitudes similares.",
  },
  {
    name: "MENTIR AL STAFF",
    nivel: 3,
    tiempo: "1-12 HORAS",
    descripcion:
      "Mentir deliberadamente al Staff con la intención de ocultar información o evitar una sanción.",
  },
  {
    name: "PROVOCAR DISCUSIONES",
    nivel: 3,
    tiempo: "1-12 HORAS",
    descripcion:
      "Provocar intencionalmente una discusión o conflicto entre miembros.",
  },
  {
    name: "SUPLANTACIÓN DE IDENTIDAD DEL STAFF",
    nivel: 3,
    tiempo: "1-12 HORAS",
    descripcion:
      "Hacerse pasar por un miembro del Staff o utilizar una identidad que pueda hacer creer a otros que se pertenece al Staff.",
  },
  {
    name: "NOMBRE INAPROPIADO",
    nivel: 3,
    tiempo: "1-12 HORAS",
    descripcion:
      "Utilizar un nombre inapropiado, ofensivo o que incumpla las normas del servidor.",
  },
  {
    name: "CASO OMISO A ÓRDENES DEL STAFF",
    nivel: 3,
    tiempo: "1-12 HORAS",
    descripcion:
      "Ignorar deliberadamente una orden o indicación dada por un miembro del Staff.",
  },
  {
    name: "INTERFERENCIA A LA MODERACIÓN",
    nivel: 3,
    tiempo: "1-12 HORAS",
    descripcion:
      "Interferir deliberadamente con la labor de moderación o dificultar que el Staff pueda atender un caso.",
  },
  {
    name: "ACUMULACIÓN DE SANCIONES DE NIVEL 2",
    nivel: 3,
    tiempo: "1-12 HORAS",
    descripcion:
      "Acumular 4 o más sanciones de Nivel 2.",
  },
  {
    name: "COMANDOS PROHIBIDOS",
    nivel: 3,
    tiempo: "1-12 HORAS",
    descripcion:
      "Utilizar comandos prohibidos, como ?wa, banana, spank o neko.",
  },
  {
    name: "HABLAR DE SANCIONES EN PÚBLICO",
    nivel: 3,
    tiempo: "1-12 HORAS",
    descripcion:
      "Hablar públicamente sobre sanciones o exponer información relacionada con ellas.",
  },
  {
    name: "INSULTOS HACIA FAMILIARES DE UN MIEMBRO",
    nivel: 3,
    tiempo: "1-12 HORAS",
    descripcion:
      "Insultar o faltarle el respeto a los familiares de otro miembro.",
  },
  {
    name: "DESEARLE EL MAL A ALGUIEN",
    nivel: 3,
    tiempo: "1-12 HORAS",
    descripcion:
      "Desearle intencionalmente algún daño o mal a otra persona.",
  },
  {
    name: "INCOMODAR",
    nivel: 3,
    tiempo: "1-12 HORAS",
    descripcion:
      "Realizar acciones, comentarios o preguntas con la intención de incomodar a otra persona.",
  },
  {
    name: "PLAGIAR ARTE O USAR IA RECLAMÁNDOLO COMO TUYO",
    nivel: 3,
    tiempo: "1-12 HORAS",
    descripcion:
      "Plagiar una obra artística o utilizar IA y presentarlo como si fuera creación propia.",
  },
  {
    name: "REPORTES FALSOS O ACUSACIONES FALSAS",
    nivel: 3,
    tiempo: "1-12 HORAS",
    descripcion:
      "Realizar reportes o acusaciones falsas con la intención de perjudicar a otra persona.",
  },
  {
    name: "COMENTARIOS +18",
    nivel: 3,
    tiempo: "1-12 HORAS",
    descripcion:
      "Realizar comentarios o conversaciones de carácter +18 dentro del servidor.",
  },
  {
    name: "ENCUBRIMIENTO DE SANCIÓN (NIVEL 3 PARA ABAJO)",
    nivel: 3,
    tiempo: "1-12 HORAS",
    descripcion:
      "Ocultar o encubrir a una persona que recibió una sanción de Nivel 3 o inferior.",
  },
  {
    name: "INCITAR A MIEMBROS A ROMPER LAS REGLAS",
    nivel: 3,
    tiempo: "1-12 HORAS",
    descripcion:
      "Incitar o animar a otros miembros a romper las reglas del servidor.",
  },
  {
    name: "GEMIDOS",
    nivel: 3,
    tiempo: "1-12 HORAS",
    descripcion:
      "Realizar gemidos intencionalmente en canales de voz.",
  },
  {
    name: "REVISAR UNA GRABACIÓN A MITAD DE PARTIDA",
    nivel: 3,
    tiempo: "1-12 HORAS",
    descripcion:
      "Revisar una grabación, transmisión o clip durante una partida para obtener información o comprobar hechos.",
  },
  {
    name: "REVELAR INFORMACIÓN ESTANDO MUERTO",
    nivel: 3,
    tiempo: "1-12 HORAS",
    descripcion:
      "Revelar información de la partida mientras se está muerto o en estado de fantasma.",
  },
  {
    name: "FINGIR ROL SIENDO TRIPULANTE",
    nivel: 3,
    tiempo: "1-12 HORAS",
    descripcion:
      "Fingir deliberadamente tener un rol que no corresponde mientras se es tripulante.",
  },
  {
    name: "SACAR SIN PRUEBAS",
    nivel: 3,
    tiempo: "1-12 HORAS",
    descripcion:
      "Expulsar o votar a un jugador sin contar con pruebas o fundamentos suficientes.",
  },
  {
    name: "SALIRSE CONSCIENTEMENTE PARA RESETEAR VOTOS",
    nivel: 3,
    tiempo: "1-12 HORAS",
    descripcion:
      "Salir deliberadamente de la partida con la intención de resetear o alterar los votos.",
  },
  {
    name: "PROTEGER QUEDANDO 1 IMPOSTOR",
    nivel: 3,
    tiempo: "1-12 HORAS",
    descripcion:
      "Proteger deliberadamente a un impostor cuando queda solamente un impostor vivo.",
  },
  {
    name: "SABOTEAR ESTANDO MUERTO",
    nivel: 3,
    tiempo: "1-12 HORAS",
    descripcion:
      "Realizar sabotajes estando muerto para afectar el desarrollo de la partida.",
  },
  {
    name: "DELATAR A TU COMPAÑERO IMPOSTOR",
    nivel: 3,
    tiempo: "1-12 HORAS",
    descripcion:
      "Delatar intencionalmente a tu compañero impostor durante una partida.",
  },
  {
    name: "TROLEAR PARTIDAS",
    nivel: 3,
    tiempo: "1-12 HORAS",
    descripcion:
      "Trolear o arruinar intencionalmente el desarrollo normal de una partida.",
  },
  {
    name: "COMPARTIR PANTALLA EN AMONG US",
    nivel: 3,
    tiempo: "1-12 HORAS",
    descripcion:
      "Compartir pantalla o utilizar la pantalla de otra persona para obtener información durante una partida.",
  },
  {
    name: "EXPULSAR DE LA SALA SIN JUSTIFICACIÓN",
    nivel: 3,
    tiempo: "1-12 HORAS",
    descripcion:
      "Expulsar a un usuario de una sala sin contar con una justificación válida.",
  },
  {
    name: "HABLAR DE GORE",
    nivel: 3,
    tiempo: "1-12 HORAS",
    descripcion:
      "Hablar o realizar comentarios sobre contenido gore dentro del servidor.",
  },

  // Nivel 4 (1 - 6 días)
  {
    name: "COMENTARIOS PASIVO AGRESIVOS",
    nivel: 4,
    tiempo: "1-6 DÍAS",
    descripcion:
      "Realizar comentarios pasivo-agresivos con la intención de provocar o incomodar a otra persona.",
  },
  {
    name: "EXCLUSIÓN",
    nivel: 4,
    tiempo: "1-6 DÍAS",
    descripcion:
      "Excluir deliberadamente a una persona de actividades o partidas con la intención de perjudicarla.",
  },
  {
    name: "DISCRIMINACIÓN",
    nivel: 4,
    tiempo: "1-6 DÍAS",
    descripcion:
      "Discriminar o tratar de manera perjudicial a una persona por alguna de sus características personales.",
  },
  {
    name: "RACISMO",
    nivel: 4,
    tiempo: "1-6 DÍAS",
    descripcion:
      "Realizar comentarios, insultos o acciones discriminatorias por raza, color de piel u origen étnico.",
  },
  {
    name: "CLASISMO",
    nivel: 4,
    tiempo: "1-6 DÍAS",
    descripcion:
      "Menospreciar o discriminar a una persona por su situación económica o clase social.",
  },
  {
    name: "DIFAMACIÓN",
    nivel: 4,
    tiempo: "1-6 DÍAS",
    descripcion:
      "Difundir información falsa con la intención de perjudicar la reputación de otra persona.",
  },
  {
    name: "XENOFOBÍA",
    nivel: 4,
    tiempo: "1-6 DÍAS",
    descripcion:
      "Atacar, insultar o menospreciar a una persona por su nacionalidad o país de origen.",
  },
  {
    name: "HOMOFOBÍA",
    nivel: 4,
    tiempo: "1-6 DÍAS",
    descripcion:
      "Atacar, insultar o discriminar a una persona por su orientación sexual.",
  },
  {
    name: "HOSTIGAMIENTO",
    nivel: 4,
    tiempo: "1-6 DÍAS",
    descripcion:
      "Molestar, provocar o incomodar repetidamente a una persona, especialmente después de que haya pedido que se detenga.",
  },
  {
    name: "ACUMULACIÓN DE SANCIONES DE NIVEL 3",
    nivel: 4,
    tiempo: "1-6 DÍAS",
    descripcion:
      "Acumular 4 o más sanciones de Nivel 3.",
  },
  {
    name: "MACHISMO SIN CONFIANZA",
    nivel: 4,
    tiempo: "1-6 DÍAS",
    descripcion:
      "Realizar comentarios o actitudes machistas hacia otra persona sin existir confianza.",
  },
  {
    name: "INSULTOS A MD",
    nivel: 4,
    tiempo: "1-6 DÍAS",
    descripcion:
      "Insultar u ofender a una persona mediante mensajes directos sin existir confianza.",
  },
  {
    name: "FOCUS",
    nivel: 4,
    tiempo: "1-6 DÍAS",
    descripcion:
      "Centrarse intencionalmente en una persona durante una partida con la intención de perjudicarla.",
  },
  {
    name: "FILTRAR CONVERSACIONES SIN PERMISO",
    nivel: 4,
    tiempo: "1-6 DÍAS",
    descripcion:
      "Compartir conversaciones, capturas o información privada sin autorización de las personas involucradas.",
  },
  {
    name: "AMENAZAR A UN USUARIO CON COSAS LEVES",
    nivel: 4,
    tiempo: "1-6 DÍAS",
    descripcion:
      "Realizar amenazas de carácter leve hacia otro usuario, teniendo en cuenta el contexto.",
  },

  // Nivel 5 (1 semana o ban)
  {
    name: "ENCUBRIMIENTO DE SANCIÓN (NIVEL 5)",
    nivel: 5,
    tiempo: "1 SEMANA O BAN",
    descripcion:
      "Ayudar a otra persona a ocultar o evadir una sanción de Nivel 5.",
  },
  {
    name: "SALIR DEL SERVIDOR PARA EVADIR SANCIÓN",
    nivel: 5,
    tiempo: "1 SEMANA O BAN",
    descripcion:
      "Abandonar el servidor intencionalmente para evadir una sanción.",
  },
  {
    name: "DOXXEO",
    nivel: 5,
    tiempo: "1 SEMANA O BAN",
    descripcion:
      "Compartir o difundir información personal o privada de otra persona sin su consentimiento.",
  },
  {
    name: "MULTICUENTA",
    nivel: 5,
    tiempo: "1 SEMANA O BAN",
    descripcion:
      "Utilizar múltiples cuentas dentro del servidor para evadir restricciones, sanciones u obtener ventajas.",
  },
  {
    name: "ACOSO",
    nivel: 5,
    tiempo: "1 SEMANA O BAN",
    descripcion:
      "Acosar o molestar repetidamente a una persona, especialmente después de que haya pedido que se detenga.",
  },
  {
    name: "METAGAMING",
    nivel: 5,
    tiempo: "1 SEMANA O BAN",
    descripcion:
      "Utilizar información obtenida fuera de la partida para conseguir una ventaja dentro de ella.",
  },
  {
    name: "NEGARSE A REVISIÓN",
    nivel: 5,
    tiempo: "1 SEMANA O BAN",
    descripcion:
      "Negarse deliberadamente a colaborar con una revisión solicitada por el Staff.",
  },
  {
    name: "CONTENIDO INAPROPIADO O NSFW",
    nivel: 5,
    tiempo: "1 SEMANA O BAN",
    descripcion:
      "Compartir contenido sexual, explícito o inapropiado dentro del servidor.",
  },
  {
    name: "FOTO INAPROPIADA",
    nivel: 5,
    tiempo: "1 SEMANA O BAN",
    descripcion:
      "Utilizar una foto de perfil inapropiada, sexual o explícita.",
  },
  {
    name: "PEDOFILIA",
    nivel: 5,
    tiempo: "1 SEMANA O BAN",
    descripcion:
      "Cualquier conducta relacionada con la explotación o sexualización de menores. Tolerancia cero.",
  },
  {
    name: "CONTENIDO GORE",
    nivel: 5,
    tiempo: "1 SEMANA O BAN",
    descripcion:
      "Compartir contenido gore o material explícito relacionado con muerte, violencia o lesiones.",
  },
  {
    name: "GRUPO EXTERNO PARA HABLAR MAL DEL STAFF",
    nivel: 5,
    tiempo: "1 SEMANA O BAN",
    descripcion:
      "Crear o utilizar un grupo externo con la finalidad de atacar o difamar al Staff.",
  },
  {
    name: "CATFISHING",
    nivel: 5,
    tiempo: "1 SEMANA O BAN",
    descripcion:
      "Hacerse pasar por otra persona o utilizar una identidad falsa para engañar a otros usuarios.",
  },
  {
    name: "GROOMING",
    nivel: 5,
    tiempo: "1 SEMANA O BAN",
    descripcion:
      "Intentar ganarse la confianza de un menor con fines de explotación o interacción sexual. Tolerancia cero.",
  },
  {
    name: "NAZISMO",
    nivel: 5,
    tiempo: "1 SEMANA O BAN",
    descripcion:
      "Promover, apoyar o difundir ideología o propaganda nazi dentro del servidor.",
  },
  {
    name: "HACKS",
    nivel: 5,
    tiempo: "1 SEMANA O BAN",
    descripcion:
      "Utilizar hacks o herramientas externas para obtener ventajas ilegítimas en Among Us.",
  },
  {
    name: "MOD MENU",
    nivel: 5,
    tiempo: "1 SEMANA O BAN",
    descripcion:
      "Utilizar un menú de mods no permitido para alterar el funcionamiento normal de las partidas.",
  },
  {
    name: "COMPARTIR LINKS EXTERNOS",
    nivel: 5,
    tiempo: "1 SEMANA O BAN",
    descripcion:
      "Compartir enlaces externos que no estén permitidos por las normas del servidor.",
  },
  {
    name: "PROMOCIONAR LINKS DE SERVIDORES",
    nivel: 5,
    tiempo: "1 SEMANA O BAN",
    descripcion:
      "Promocionar o invitar a otros usuarios a servidores externos sin autorización del Staff.",
  },
  {
    name: "ACUMULACIÓN DE SANCIONES",
    nivel: 5,
    tiempo: "1 SEMANA O BAN",
    descripcion:
      "Acumular 20 o más sanciones registradas.",
  },
  {
    name: "AMENAZAS REALES O DE MUERTE",
    nivel: 5,
    tiempo: "1 SEMANA O BAN",
    descripcion:
      "Realizar amenazas reales o amenazas de muerte contra otra persona.",
  },
  {
    name: "INTENTO DE RAID",
    nivel: 5,
    tiempo: "1 SEMANA O BAN",
    descripcion:
      "Intentar organizar o participar en un ataque coordinado contra el servidor.",
  },
  {
    name: "DISTRIBUCIÓN DE MALWARE, VIRUS U OTROS",
    nivel: 5,
    tiempo: "1 SEMANA O BAN",
    descripcion:
      "Distribuir malware, virus u otros archivos o programas destinados a perjudicar dispositivos, cuentas o usuarios.",
  },
  {
    name: "ESTAFAS REALES",
    nivel: 5,
    tiempo: "1 SEMANA O BAN",
    descripcion:
      "Realizar estafas reales con la intención de obtener dinero, cuentas, objetos o beneficios de otra persona.",
  },
  {
    name: "TEAM",
    nivel: 5,
    tiempo: "1 SEMANA O BAN",
    descripcion:
      "Colaborar con otro usuario de manera indebida para obtener una ventaja injusta durante una partida.",
  },
  {
    name: "CROOSTRADE",
    nivel: 5,
    tiempo: "1 SEMANA O BAN",
    descripcion:
      "Realizar o intentar realizar intercambios entre elementos, beneficios o bienes que no estén permitidos por las normas del servidor.",
  },
];

const MAX_AUTOCOMPLETE_CHOICES = 25;

const ALLOWED_ROLES = [
  "1451383215603585140", // Owner
  "1508266687689003039", // Co-Owner
  "1512634750152478851", // Jefe Staff
  "1485101671875874997", // Administrador Elite
  "1455419124732657801", // Equipo Administrativo
  "1522434536796061816", // Desarrollador
  "1453211902267228160", // Administrador
  "1509760475653472287", // Administrador [PB]
  "1522807097920720967", // Manager
  "1452784726413672643", // Moderador
  "1509760381525164123", // Moderador [PB]
  "1522808445391212674", // Support
  "1528974868329009162", // Helper
  "1509760269071679498", // Trial Helper
  "1539368076326473868", // Developer Tiago Jr
  "1454679144230289510", // STAFF
];

export const data = new SlashCommandBuilder()
  .setName("sanciones")
  .setDescription("Consulta la información de una sanción.")
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

async function hasPermission(
  interaction: ChatInputCommandInteraction,
): Promise<boolean> {
  if (!interaction.guild || !interaction.user) return false;

  try {
    let member = interaction.member as GuildMember | null;

    if (
      !member ||
      !member.roles ||
      typeof (member.roles as any).cache?.has !== "function"
    ) {
      member = await interaction.guild.members.fetch(interaction.user.id);
    }

    if (!member || !member.roles) return false;

    const memberRoles = (member.roles as any).cache;

    return ALLOWED_ROLES.some((roleId) => memberRoles.has(roleId));
  } catch (err) {
    logger.error({ err }, "Error checking permissions for /sanciones command");
    return false;
  }
}

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const authorized = await hasPermission(interaction);

  if (!authorized) {
    await interaction.reply({
      content: "❌ No tienes el rango suficiente para usar ese comando.",
      flags: MessageFlags.Ephemeral,
    });

    return;
  }

  const selectedInput = interaction.options
    .getString("infraccion", true)
    .trim()
    .toUpperCase();

  const infraction = INFRACTIONS.find(
    (inf) =>
      inf.name.toUpperCase() === selectedInput ||
      inf.name.toUpperCase().includes(selectedInput),
  );

  if (!infraction) {
    await interaction.reply({
      content:
        "⚠️ Infracción no reconocida. Por favor selecciona una opción del menú de autocompletado.",
      flags: MessageFlags.Ephemeral,
    });

    return;
  }

  const embed = new EmbedBuilder()
    .setColor("Red")
    .setTitle("⚖️ Información de la sanción")
    .addFields(
      {
        name: "📌 **Infracción:**",
        value: infraction.name,
        inline: false,
      },
      {
        name: "📊 **Nivel:**",
        value: `Nivel ${infraction.nivel}`,
        inline: true,
      },
      {
        name: "⏳ **Duración:**",
        value: infraction.tiempo,
        inline: true,
      },
      {
        name: "📖 **Descripción:**",
        value: infraction.descripcion,
        inline: false,
      },
    )
    .setFooter({ text: "Sistema de Sanciones • TIAGO JR" })
    .setTimestamp();

  await interaction.reply({
    embeds: [embed],
    flags: MessageFlags.Ephemeral,
  });
}
