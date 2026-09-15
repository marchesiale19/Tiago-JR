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
// Nivel 1 (1 minuto)
    { name: "MAL USO DE CANALES", nivel: 1, tiempo: "1 MINUTO", descripcion: "Ocurre cuando un usuario está utilizando un canal erróneamente con la función de otro. Se advierte por si no ha sido consciente y se sanciona si hay reincidencia." },
  { name: "MICRÓFONO SATURADO", nivel: 1, tiempo: "1 MINUTO", descripcion: "Ocurre cuando el usuario tiene un micrófono mal configurado y se escucha a un volumen molesto. Se advierte primero y se aplica sanción si persiste." },
  { name: "RUIDOS MOLESTOS", nivel: 1, tiempo: "1 MINUTO", descripcion: "Ruido de fondo en llamada (música, mascotas, calle) que molesta en la sala. Se advierte para que se silencie y desmutee solo al hablar; si no hace caso, se sanciona." },
  { name: "ENTRAR Y SALIR DE UN CANAL DE VOZ PARA MOLESTAR", nivel: 1, tiempo: "1 MINUTO", descripcion: "Unirse a un voice chat diciendo cosas aleatorias o haciendo ruidos para molestar. Se da una sola advertencia y se sanciona si hay reincidencia." },
  { name: "SPAM DE REACCIONES SIN CONFIANZA", nivel: 1, tiempo: "1 MINUTO", descripcion: "Poner muchos emojis de reacción a un mensaje ajeno reventando el dispositivo a notificaciones sin haber confianza. Se advierte primero y se sanciona si continúa." },
  { name: "PERDER EL CONTADOR APROPÓSITO", nivel: 1, tiempo: "1 MINUTO", descripcion: "Perder el contador a propósito en dinámicas o canales de conteo." },

  // Nivel 2 (10 minutos)
  { name: "FLOOD Y SPAM", nivel: 2, tiempo: "10 MINUTOS", descripcion: "Enviar mensajes demasiado largos o repetir mensajes muchas veces. Se advierte primero y se aplica la sanción si sigue haciéndolo." },
  { name: "HABLAR DURANTE PARTIDA", nivel: 2, tiempo: "10 MINUTOS", descripcion: "Hablar durante las rondas sobre temas ajenos a la partida (excepto dar información importante de muertes o avistamientos). Se advierte y se sanciona si no hace caso." },
  { name: "NO TENER EL MISMO NOMBRE DE AMONG US", nivel: 2, tiempo: "10 MINUTOS", descripcion: "Tener un nombre diferente en Among Us y Discord al pasar lista. Se le pide al dueño que no inicie y saque al usuario; si se repite, se sanciona." },
  { name: "MAL USO DE SUGERENCIA", nivel: 2, tiempo: "10 MINUTOS", descripcion: "Utilizar las sugerencias para llamar la atención, molestar o enviar cosas sin sentido." },
  { name: "MAL USO DE TICKET", nivel: 2, tiempo: "10 MINUTOS", descripcion: "Abrir y cerrar tickets repetidamente sin decir nada, o insistir en un caso ya resuelto." },
  { name: "FALTA DE RESPETO ENTRE MIEMBROS", nivel: 2, tiempo: "10 MINUTOS", descripcion: "Insultarse, provocarse o molestarse entre miembros. Se advierte que paren y se sanciona si alguno continúa." },
  { name: "QUEDARSE AFK EN PARTIDA Y PERJUDICAR A TU EQUIPO", nivel: 2, tiempo: "10 MINUTOS", descripcion: "Quedarse sin hacer nada durante una partida completa repetidamente sin previo aviso, perjudicando al equipo." },
  { name: "MAL INFORMAR SOBRE UNA REGLA", nivel: 2, tiempo: "10 MINUTOS", descripcion: "Dar información falsa sobre una regla. Se corrige al receptor y se sanciona al emisor incorrecto si el otro rompe la regla por su culpa." },
  { name: "PRENDER CÁMARA EN AMONG US", nivel: 2, tiempo: "10 MINUTOS", descripcion: "Prender cámara a propósito dentro del canal de Among Us. Se pide apagarla inmediatamente y se sanciona si vuelve a hacerlo." },
  { name: "ENTRAR A UNA SALA Y NO ESTAR EN EL CANAL DE VOZ", nivel: 2, tiempo: "10 MINUTOS", descripcion: "Entrar a una sala de Among Us sin unirse al canal de voz correspondiente. Se advierte y se sanciona si se repite." },
  { name: "RUIDOS MUY MOLESTOS", nivel: 2, tiempo: "10 MINUTOS", descripcion: "Hacer ruidos molestos intencionalmente para molestar en las salas. Se sanciona si continúa tras la advertencia." },
  { name: "ENTRAR A UN CANAL DE VOZ PARA MOLESTAR", nivel: 2, tiempo: "10 MINUTOS", descripcion: "Entrar a un canal solo para provocar o criticar acciones ajenas. Se advierte y se sanciona si continúa." },
  { name: "NO RESPETAR TURNOS PARA HABLAR", nivel: 2, tiempo: "10 MINUTOS", descripcion: "Interrumpir o hablar encima durante el turno del reportador y el acusado sin información importante. Se sanciona tras advertencia." },
  { name: "PING INNECESARIO DE STAFF", nivel: 2, tiempo: "10 MINUTOS", descripcion: "Mencionar innecesariamente a miembros del Staff sin un motivo real o de urgencia." },
  { name: "ABANDONAR LA PARTIDA APROPÓSITO", nivel: 2, tiempo: "10 MINUTOS", descripcion: "Salirse de la partida a propósito para perjudicar o evitar el desarrollo normal de la misma." },

  // Nivel 3 (1-2 horas / 1 hora - 1 día)
  { name: "EVASIÓN DE SANCIÓN", nivel: 3, tiempo: "1-2 HORAS", descripcion: "Intentar evitar ser reconocido o sancionado cambiando nombre/foto, o salirse del canal de voz al ser movido por el Staff." },
  { name: "FALTA DE RESPETO AL STAFF", nivel: 3, tiempo: "1-2 HORAS", descripcion: "Insultar o faltar el respeto a un miembro del Staff sin confianza. Se advierte y se sanciona si continúa." },
  { name: "MENTIR AL STAFF", nivel: 3, tiempo: "1-2 HORAS", descripcion: "Mentir intencionalmente ante un reporte o situación para evitar una sanción propia o de un amigo." },
  { name: "PROVOCAR DISCUSIONES", nivel: 3, tiempo: "1-2 HORAS", descripcion: "Intentar provocar o iniciar discusiones intencionalmente con otra persona." },
  { name: "SUPLANTACIÓN DE IDENTIDAD DEL STAFF", nivel: 3, tiempo: "1-2 HORAS", descripcion: "Utilizar un rango del Staff al que no se pertenece en el nombre. Se pide cambiarlo y se sanciona si se lo vuelve a colocar." },
  { name: "NOMBRE INAPROPIADO", nivel: 3, tiempo: "1-2 HORAS", descripcion: "Usar nombres con contenido +18 o inadecuado. Se pide cambiarlo y se sanciona si reincide." },
  { name: "CASO OMISO A ÓRDENES DEL STAFF", nivel: 3, tiempo: "1-2 HORAS", descripcion: "Ignorar, negarse a responder o no hacer caso a las indicaciones de un miembro del Staff en un reporte." },
  { name: "INTERFERENCIA A LA MODERACIÓN", nivel: 3, tiempo: "1-2 HORAS", descripcion: "Interferir mientras el Staff atiende un caso (decirle a los involucrados que no hagan caso o entorpecer)." },
  { name: "ACUMULACIÓN DE SANCIONES DE NIVEL 2", nivel: 3, tiempo: "1-2 HORAS", descripcion: "Acumular sanciones de Nivel 2 (4 en adelante)." },
  { name: "COMANDOS PROHIBIDOS", nivel: 3, tiempo: "1-2 HORAS", descripcion: "Usar comandos prohibidos como (?wa, banana, spank)." },
  { name: "HABLAR DE SANCIONES EN PÚBLICO", nivel: 3, tiempo: "1-2 HORAS", descripcion: "Intentar hacer pública una sanción recibida o hablar de ella abiertamente." },
  { name: "INSULTOS HACIA FAMILIARES DE UN MIEMBRO", nivel: 3, tiempo: "1-2 HORAS", descripcion: "Insultar a un familiar de otra persona sin confianza. Se advierte primero y se sanciona si se repite." },
  { name: "DESEARLE EL MAL A ALGUIEN", nivel: 3, tiempo: "1-2 HORAS", descripcion: "Desear algo malo a alguien de forma intencional. Se advierte y se sanciona si repite." },
  { name: "INCOMODAR", nivel: 3, tiempo: "1-2 HORAS", descripcion: "Realizar preguntas o acciones que hacen sentir incómoda a otra persona." },
  { name: "PLAGIAR ARTE O USAR IA RECLAMÁNDOLO COMO TUYO", nivel: 3, tiempo: "1-2 HORAS", descripcion: "Tomar arte de terceros o usar IA afirmando que lo hiciste tú mismo." },
  { name: "REPORTES FALSOS O ACUSACIONES FALSAS", nivel: 3, tiempo: "1-2 HORAS", descripcion: "Reportar a alguien sin pruebas por problemas personales o para perjudicar." },
  { name: "COMENTARIOS +18", nivel: 3, tiempo: "1-2 HORAS", descripcion: "Hablar de temas inapropiados para menores de 18 años. Se advierte y se sanciona si repite." },
  { name: "ENCUBRIMIENTO DE SANCIÓN", nivel: 3, tiempo: "1-2 HORAS", descripcion: "Ocultar, justificar o encubrir a alguien que rompió una regla (Nivel 3 para abajo)." },
  { name: "INCITAR A MIEMBROS A ROMPER LAS REGLAS", nivel: 3, tiempo: "1-2 HORAS", descripcion: "Animar o decir a otra persona que ignore o rompa las reglas del servidor." },
  { name: "GEMIDOS", nivel: 3, tiempo: "1-2 HORAS", descripcion: "Realizar gemidos intencionalmente en canales de voz." },
  { name: "REVISAR UNA GRABACIÓN A MITAD DE PARTIDA", nivel: 3, tiempo: "1-2 HORAS", descripcion: "Revisar un clip o grabación durante una partida para comprobar hechos." },
  { name: "REVELAR INFORMACIÓN ESTANDO MUERTO", nivel: 3, tiempo: "1-2 HORAS", descripcion: "Hablar o filtrar datos de la partida estando en estado de fantasma/muerto." },
  { name: "FINGIR ROL SIENDO TRIPULANTE", nivel: 3, tiempo: "1-2 HORAS", descripcion: "Inventar o fingir roles que no te corresponden siendo tripulante." },
  { name: "SACAR SIN PRUEBAS", nivel: 3, tiempo: "1-2 HORAS", descripcion: "Expulsar o votar sin contar con las pruebas necesarias." },
  { name: "SALIRSE CONSCIENTEMENTE PARA RESETEAR VOTOS", nivel: 3, tiempo: "1-2 HORAS", descripcion: "Desconectarse a propósito de la sala para anular o resetear el conteo de votos." },
  { name: "PROTEGER QUEDANDO 1 IMPOSRTOR", nivel: 3, tiempo: "1-2 HORAS", descripcion: "Cubrir en exceso o proteger de forma indebida cuando queda un solo impostor vivo." },
  { name: "SABOTEAR ESTANDO MUERTO", nivel: 3, tiempo: "1-2 HORAS", descripcion: "Realizar acciones de sabotaje estando muerto arruinando el juego." },
  { name: "DELATAR A TU COMPAÑERO IMPOSTOR", nivel: 3, tiempo: "1-2 HORAS", descripcion: "Vender o delatar directamente a tu compañero impostor rompiendo las dinámicas de equipo." },
  { name: "TROLEAR PARTIDAS", nivel: 3, tiempo: "1-2 HORAS", descripcion: "Arruinar o trolear el transcurso normal de las partidas." },
  { name: "COMPARTIR PANTALLA EN AMONG US", nivel: 3, tiempo: "1-2 HORAS", descripcion: "Transmitir o ver pantallas ajenas durante las partidas de Among Us." },
  { name: "EXPULSAR DE LA SALA SIN JUSTIFICACIÓN", nivel: 3, tiempo: "1-2 HORAS", descripcion: "Echar a usuarios de la sala de juego sin un motivo justificado." },

// Nivel 4 (1 - 2 días)
  { name: "COMENTARIOS PASIVO AGRESIVOS", nivel: 4, tiempo: "1-2 DÍAS", descripcion: "Comentarios con indirectas o doble sentido para provocar o hacer sentir mal a otros." },
  { name: "EXCLUSIÓN", nivel: 4, tiempo: "1-2 DÍAS", descripcion: "Sacar a una persona de una partida o actividades del grupo sin motivo aparente." },
  { name: "DISCRIMINACIÓN", nivel: 4, tiempo: "1-2 DÍAS", descripcion: "Tratar de manera diferente o perjudicial a alguien por características personales." },
  { name: "RACISMO", nivel: 4, tiempo: "1-2 DÍAS", descripcion: "Comentarios o insultos que atacan por raza, color de piel u origen étnico." },
  { name: "CLASISMO", nivel: 4, tiempo: "1-2 DÍAS", descripcion: "Menospreciar, insultar o discriminar por situación económica o clase social." },
  { name: "DIFAMACIÓN", nivel: 4, tiempo: "1-2 DÍAS", descripcion: "Compartir información falsa para perjudicar la reputación de alguien." },
  { name: "XENOFOBÍA", nivel: 4, tiempo: "1-2 DÍAS", descripcion: "Atacar o menospreciar a alguien por ser de otro país o nacionalidad." },
  { name: "HOMOFOBÍA", nivel: 4, tiempo: "1-2 DÍAS", descripcion: "Atacar o discriminar a alguien por su orientación sexual." },
  { name: "HOSTIGAMIENTO", nivel: 4, tiempo: "1-2 DÍAS", descripcion: "Molestar, provocar o incomodar constantemente a alguien tras pedirle que pare." },
  { name: "ACUMULACIÓN DE SANCIONES DE NIVEL 3", nivel: 4, tiempo: "1-2 DÍAS", descripcion: "Acumular 4 o más sanciones de Nivel 3 en adelante." },
  { name: "MACHISMO SIN CONFIANZA", nivel: 4, tiempo: "1-2 DÍAS", descripcion: "Comentarios machistas o tratos inferiores por género sin confianza previa." },
  { name: "INSULTOS A MD", nivel: 4, tiempo: "1-2 DÍAS", descripcion: "Insultar u ofender a otra persona mediante mensajes directos sin existir confianza." },
  { name: "FOCUS", nivel: 4, tiempo: "1-2 DÍAS", descripcion: "Concentrarse intencionalmente en una persona durante la partida para perjudicarla reiteradamente." },
  { name: "FILTRAR CONVERSACIONES SIN PERMISO", nivel: 4, tiempo: "1-2 DÍAS", descripcion: "Compartir chats privados, capturas o información de conversaciones sin permiso." },
  { name: "AMENAZAR A UN USUARIO CON COSAS LEVES", nivel: 4, tiempo: "1-2 DÍAS", descripcion: "Realizar amenazas de carácter leve evaluando intención y contexto." },

// Nivel 5 (1 semana o ban)
  { name: "ENCUBRIMIENTO DE SANCIÓN", nivel: 5, tiempo: "1 SEMANA O BAN", descripcion: "Ayudar a otra persona a evadir, ocultar o reducir una sanción aplicada por el staff (Nivel 5)." },
  { name: "SALIR DEL SERVIDOR PARA EVADIR SANCIÓN", nivel: 5, tiempo: "1 SEMANA O BAN", descripcion: "Abandonar el servidor con la intención de evitar un castigo." },
  { name: "DOXXEO", nivel: 5, tiempo: "1 SEMANA O BAN", descripcion: "Compartir información personal o privada de otra persona sin su consentimiento." },
  { name: "MULTICUENTA", nivel: 5, tiempo: "1 SEMANA O BAN", descripcion: "Utilizar una o más cuentas adicionales dentro del servidor." },
  { name: "ACOSO", nivel: 5, tiempo: "1 SEMANA O BAN", descripcion: "Molestar o incomodar a una persona repetidamente tras pedirle que pare." },
  { name: "METAGAMING", nivel: 5, tiempo: "1 SEMANA O BAN", descripcion: "Usar información externa para obtener ventaja en la partida." },
  { name: "NEGARSE A REVISIÓN", nivel: 5, tiempo: "1 SEMANA O BAN", descripcion: "Negarse a colaborar con una revisión solicitada por el staff." },
  { name: "CONTENIDO INAPROPIADO O NSFW", nivel: 5, tiempo: "1 SEMANA O BAN", descripcion: "Enviar contenido sexual, explícito o inapropiado para la comunidad." },
  { name: "FOTO INAPROPIADA", nivel: 5, tiempo: "1 SEMANA O BAN", descripcion: "Ponerse una foto de perfil sexual o explícita." },
  { name: "PEDOFILIA", nivel: 5, tiempo: "1 SEMANA O BAN", descripcion: "Conductas inapropiadas con menores de edad (Tolerancia Cero)." },
  { name: "CONTENIDO GORE", nivel: 5, tiempo: "1 SEMANA O BAN", descripcion: "Compartir contenido explícito de muerte, violencia o lesiones." },
  { name: "GRUPO EXTERNO PARA HABLAR MAL DEL STAFF", nivel: 5, tiempo: "1 SEMANA O BAN", descripcion: "Crear un grupo externo para hablar mal o difamar al staff." },
  { name: "CATFISHING", nivel: 5, tiempo: "1 SEMANA O BAN", descripcion: "Hacerse pasar por otra persona o usar identidad falsa para engañar." },
  { name: "GROOMING", nivel: 5, tiempo: "1 SEMANA O BAN", descripcion: "Intentar ganarse la confianza de un menor con fines de interacción sexual (Tolerancia Cero)." },
  { name: "NAZISMO", nivel: 5, tiempo: "1 SEMANA O BAN", descripcion: "Promover o apoyar el nazismo dentro del servidor." },
  { name: "HACKS", nivel: 5, tiempo: "1 SEMANA O BAN", descripcion: "Usar hacks para obtener ventaja en Among Us." },
  { name: "MOD MENU", nivel: 5, tiempo: "1 SEMANA O BAN", descripcion: "Utilizar un menú de mods no permitido para alterar partidas." },
  { name: "COMPARTIR LINKS EXTERNOS", nivel: 5, tiempo: "1 SEMANA O BAN", descripcion: "Compartir enlaces externos no permitidos dentro del servidor." },
  { name: "PROMOCIONAR LINKS DE SERVIDORES", nivel: 5, tiempo: "1 SEMANA O BAN", descripcion: "Invitar a servidores externos sin autorización del staff." },
  { name: "ACUMULACIÓN DE SANCIONES", nivel: 5, tiempo: "1 SEMANA O BAN", descripcion: "Alcanzar 20 o más sanciones registradas en total." },
  { name: "AMENAZAS REALES O DE MUERTE", nivel: 5, tiempo: "1 SEMANA O BAN", descripcion: "Amenazar de muerte o realizar amenazas reales a una persona." },
  { name: "INTENTO DE RAID", nivel: 5, tiempo: "1 SEMANA O BAN", descripcion: "Organizar o participar en un ataque masivo contra el servidor." },
  { name: "DISTRIBUCIÓN DE MALWARE, VIRUS U OTROS", nivel: 5, tiempo: "1 SEMANA O BAN", descripcion: "Distribuir archivos o programas para dañar dispositivos o cuentas." },
  { name: "ESTAFAS REALES", nivel: 5, tiempo: "1 SEMANA O BAN", descripcion: "Engañar a otra persona para obtener dinero, cuentas u objetos mediante estafa real." },
  { name: "TEAM", nivel: 5, tiempo: "1 SEMANA O BAN", descripcion: "Colaborar con otro usuario para obtener ventaja injusta en partidas de Among Us." },
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

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const focused = interaction.options.getFocused().toUpperCase().trim();
  const filtered = focused ? INFRACTIONS.filter((inf) => inf.name.includes(focused)) : INFRACTIONS;
  const choices = filtered.slice(0, MAX_AUTOCOMPLETE_CHOICES).map((inf) => ({
    name: inf.name,
    value: inf.name,
  }));
  await interaction.respond(choices);
}

async function hasPermission(interaction: ChatInputCommandInteraction): Promise<boolean> {
  if (!interaction.guild || !interaction.user) return false;
  try {
    let member = interaction.member as GuildMember | null;
    if (!member || !member.roles || typeof (member.roles as any).cache?.has !== 'function') {
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

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const authorized = await hasPermission(interaction);
  if (!authorized) {
    await interaction.reply({
      content: "❌ No tienes el rango suficiente para usar ese comando.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const selectedInput = interaction.options.getString("infraccion", true).trim().toUpperCase();
  const infraction = INFRACTIONS.find(
    (inf) => inf.name.toUpperCase() === selectedInput || inf.name.toUpperCase().includes(selectedInput)
  );
  if (!infraction) {
    await interaction.reply({
      content: "⚠️ Infracción no reconocida. Por favor selecciona una opción del menú de autocompletado.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const embed = new EmbedBuilder()
    .setColor("Red")
    .setTitle("⚖️ Información de la sanción")
    .addFields(
      { name: "📌 **Infracción:**", value: infraction.name, inline: false },
      { name: "📊 **Nivel:**", value: `Nivel ${infraction.nivel}`, inline: true },
      { name: "⏳ **Duración:**", value: infraction.tiempo, inline: true },
      { name: "📖 **Descripción:**", value: infraction.descripcion, inline: false },
    )
    .setFooter({ text: "Sistema de Sanciones • TIAGO JR" })
    .setTimestamp();
  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}