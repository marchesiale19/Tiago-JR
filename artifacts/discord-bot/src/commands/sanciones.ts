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
  descripcion: string;
}

const INFRACTIONS: Infraction[] = [
  // NIVEL 1
  {
    name: "MAL USO DE CANALES",
    nivel: 1,
    tiempo: "1 MINUTO",
    descripcion: "Escribir o utilizar un canal de texto o voz para un propósito diferente al establecido en sus normas.",
  },
  {
    name: "MICROFONO SATURADO",
    nivel: 1,
    tiempo: "1 MINUTO",
    descripcion: "Tener el volumen o ganancia del micrófono demasiado alta, causando ruidos molestos o distorsión para los demás.",
  },
  {
    name: "RUIDOS MOLESTOS",
    nivel: 1,
    tiempo: "1 MINUTO",
    descripcion: "Emitir sonidos innecesarios, golpes o ruidos incomodantes en los canales de voz.",
  },
  {
    name: "PERDER EN EL CONTADOR A PROPÓSITO",
    nivel: 1,
    tiempo: "1 MINUTO",
    descripcion: "Arruinar la dinámica de los contadores en los canales de texto de manera intencional.",
  },
  {
    name: "USO INNECESARIO DE # PARA EL TAMAÑO DEL TEXTO EN EXCESO CON SPAM",
    nivel: 1,
    tiempo: "1 MINUTO",
    descripcion: "Abusar del formato de títulos grandes en los mensajes generando desorden visual y molestia.",
  },
  {
    name: "ENTRAR Y SALIR DEL CANAL DE VOZ PARA MOLESTAR A OTROS USUARIOS",
    nivel: 1,
    tiempo: "1 MINUTO",
    descripcion: "Generar notificaciones molestas o interrumpir a los usuarios conectándose y desconectándose repetidamente.",
  },
  {
    name: "SPAM DE REACCIONES SIN CONFIANZA",
    nivel: 1,
    tiempo: "1 MINUTO",
    descripcion: "Spamear emojis o reacciones en mensajes sin tener la confianza requerida con los usuarios.",
  },

  // NIVEL 2
  {
    name: "SPAM Y FLOOD",
    nivel: 2,
    tiempo: "5 - 10 MINUTOS",
    descripcion: "Enviar mensajes repetitivos, texto gigante sin sentido o saturar el chat de forma excesiva.",
  },
  {
    name: "HABLAR DURANTE PARTIDA",
    nivel: 2,
    tiempo: "5 - 10 MINUTOS",
    descripcion: "Comunicarse en canales de voz generales o privados fuera de los momentos permitidos en las partidas de Among Us.",
  },
  {
    name: "PING INNECESARIO DE STAFF",
    nivel: 2,
    tiempo: "5 - 10 MINUTOS",
    descripcion: "Mencionar a los administradores o moderadores sin una razón de peso o justificación válida.",
  },
  {
    name: "NO TENER EL MISMO NOMBRE DE AMONG US",
    nivel: 2,
    tiempo: "5 - 10 MINUTOS",
    descripcion: "Ingresar a las partidas con un alias diferente al registrado en Discord, dificultando la identificación.",
  },
  {
    name: "MAL USO DE SUGERENCIA",
    nivel: 2,
    tiempo: "5 - 10 MINUTOS",
    descripcion: "Enviar propuestas o sugerencias de broma, vacías o que incumplen el formato del canal correspondiente.",
  },
  {
    name: "FALTA DE RESPETO ENTRE MIEMBROS",
    nivel: 2,
    tiempo: "5 - 10 MINUTOS",
    descripcion: "Dirigirse a otro usuario con groserías leves, tonos despectivos o falta de cordialidad.",
  },
  {
    name: "QUEDARSE AFK EN UNA PARTIDA Y PERJUDICAR A TU EQUIPO",
    nivel: 2,
    tiempo: "5 - 10 MINUTOS",
    descripcion: "Dejar de participar o estar ausente en medio de una partida afectando directamente a los demás jugadores.",
  },
  {
    name: "MAL INFORMAR DE UNA REGLA",
    nivel: 2,
    tiempo: "5 - 10 MINUTOS",
    descripcion: "Dar indicaciones falsas o alteradas sobre la normativa del servidor a otros miembros.",
  },
  {
    name: "ABANDONAR LA PARTIDA A PROPOSITO",
    nivel: 2,
    tiempo: "5 - 10 MINUTOS",
    descripcion: "Salirse de una partida en curso de manera voluntaria rompiendo la experiencia de juego grupal.",
  },
  {
    name: "MAL USO DE TICKETS",
    nivel: 2,
    tiempo: "5 - 10 MINUTOS",
    descripcion: "Abrir canales de soporte por motivos absurdos, bromas o saturar el sistema de atención.",
  },
  {
    name: "PRENDER CAMARA EN AMONG US",
    nivel: 2,
    tiempo: "5 - 10 MINUTOS",
    descripcion: "Encender la webcam en partidas donde está prohibido por las reglas de visibilidad del juego.",
  },
  {
    name: "MAL USO DE PINGS",
    nivel: 2,
    tiempo: "5 - 10 MINUTOS",
    descripcion: "Utilizar menciones a roles o usuarios de manera indebida o inoportuna en los chats.",
  },
  {
    name: "ENTRAR A UNA SALA SIN ESTAR EN EL VC",
    nivel: 2,
    tiempo: "5 - 10 MINUTOS",
    descripcion: "Interactuar en dinámicas de juego o salas de texto específicas sin estar conectado al canal de voz correspondiente.",
  },
  {
    name: "RUIDOS MUY MOLESTOS",
    nivel: 2,
    tiempo: "5 - 10 MINUTOS",
    descripcion: "Reproducir música alta, gritar o generar ruidos estridentes e intolerables en los canales de voz.",
  },
  {
    name: "ENTRAR PARA MOLESTAR A UN CANAL DE VOZ",
    nivel: 2,
    tiempo: "5 - 10 MINUTOS",
    descripcion: "Unirse a una sala exclusivamente para interrumpir, provocar o incomodar a los usuarios presentes.",
  },
  {
    name: "NO RESPETAR EL TURNO DE OTRA PERSONA PARA HABLAR",
    nivel: 2,
    tiempo: "5 - 10 MINUTOS",
    descripcion: "Interrumpir constantemente o no dejar participar a los demás durante las reuniones o debates.",
  },

  // NIVEL 3
  {
    name: "FALTA DE RESPETO AL STAFF",
    nivel: 3,
    tiempo: "1 HORA - 1 DIA",
    descripcion: "Insultar, desafiar o faltarle al respeto a cualquier miembro del equipo de moderación o administración.",
  },
  {
    name: "SACAR SIN PRUEBAS",
    nivel: 3,
    tiempo: "1 HORA - 1 DIA",
    descripcion: "Expulsar o kickear usuarios de los canales de voz sin contar con evidencias o justificación reglamentaria.",
  },
  {
    name: "SALIRSE CONSCIENTEMENTE PARA RESETEAR VOTOS",
    nivel: 3,
    tiempo: "1 HORA - 1 DIA",
    descripcion: "Desconectarse intencionalmente durante las votaciones para evitar ser expulsado o alterar la partida.",
  },
  {
    name: "REVELAR INFORMACION ESTANDO MUERTO",
    nivel: 3,
    tiempo: "1 HORA - 1 DIA",
    descripcion: "Hablar, chatear o dar pistas sobre roles o culpables en Among Us una vez que el jugador ha sido eliminado.",
  },
  {
    name: "MENTIR AL STAFF",
    nivel: 3,
    tiempo: "1 HORA - 1 DIA",
    descripcion: "Proporcionar información falsa u ocultar datos intencionalmente ante una revisión o reporte del staff.",
  },
  {
    name: "PROVOCAR DISCUCIONES",
    nivel: 3,
    tiempo: "1 HORA - 1 DIA",
    descripcion: "Incitar peleas, conflictos o fomentar un ambiente tóxico entre los miembros del servidor.",
  },
  {
    name: "PROTEGER QUEDANDO 1 IMPOSTOR",
    nivel: 3,
    tiempo: "1 HORA - 1 DIA",
    descripcion: "Incumplir las mecánicas de juego protegiendo o haciendo alianza indebida cuando queda un solo impostor.",
  },
  {
    name: "SABOTEAR ESTANDO MUERTO",
    nivel: 3,
    tiempo: "1 HORA - 1 DIA",
    descripcion: "Realizar acciones antirreglamentarias que afecten el transcurso de la partida estando en estado de fantasma.",
  },
  {
    name: "DELATAR A TU COMPAÑERO IMPOSTOR",
    nivel: 3,
    tiempo: "1 HORA - 1 DIA",
    descripcion: "Quemarse o revelar intencionalmente a los aliados impostores rompiendo la jugabilidad limpia.",
  },
  {
    name: "FINGIR ROL SIENDO TRIPULANTE",
    nivel: 3,
    tiempo: "1 HORA - 1 DIA",
    descripcion: "Adoptar comportamientos o mentir sobre mecánicas prohibidas para el rol asignado de tripulante.",
  },
  {
    name: "SUPLANTACION IDENTIDAD DEL STAFF",
    nivel: 3,
    tiempo: "1 HORA - 1 DIA",
    descripcion: "Hacerse pasar por un miembro del equipo de moderación o administración mediante nombres, fotos o actitudes.",
  },
  {
    name: "NOMBRE INAPROPIADO",
    nivel: 3,
    tiempo: "1 HORA - 1 DIA",
    descripcion: "Tener un apodo en Discord o en el juego de carácter ofensivo, sexual, discriminatorio o vulgar.",
  },
  {
    name: "TROLEAR PARTIDAS",
    nivel: 3,
    tiempo: "1 HORA - 1 DIA",
    descripcion: "Arruinar las partidas a propósito mediante acciones absurdas o malintencionadas.",
  },
  {
    name: "CASO OMISO ORDENES DEL STAFF",
    nivel: 3,
    tiempo: "1 HORA - 1 DIA",
    descripcion: "Ignorar de forma directa las indicaciones, advertencias o llamados de atención dados por la moderación.",
  },
  {
    name: "INTERFERENCIA A LA MODERACION",
    nivel: 3,
    tiempo: "1 HORA - 1 DIA",
    descripcion: "Entorpecer el trabajo de los moderadores cuando están atendiendo un reporte o situación en el servidor.",
  },
  {
    name: "ACUMULACION DE VARIAS SANCIONES DE 10 MINUTOS (MAS DE 4)",
    nivel: 3,
    tiempo: "1 HORA - 1 DIA",
    descripcion: "Haber acumulado de manera recurrente más de cuatro sanciones leves de nivel 2.",
  },
  {
    name: "COMANDO INAPROPIADOS (?wa,banana,spank,booba,C NSFW)",
    nivel: 3,
    tiempo: "1 HORA - 1 DIA",
    descripcion: "Usar comandos de bots con contenido sugerente, explícito o inadecuado en canales públicos.",
  },
  {
    name: "EVADIR SANCION",
    nivel: 3,
    tiempo: "1 HORA - 1 DIA",
    descripcion: "Intentar saltarse un castigo o baneo temporal mediante cuentas secundarias o artimañas.",
  },
  {
    name: "HABLAR DE SANCIONES EN PUBLICO",
    nivel: 3,
    tiempo: "1 HORA - 1 DIA",
    descripcion: "Discutir, cuestionar o ventilar castigos aplicados a usuarios en canales de texto o voz abiertos.",
  },
  {
    name: "INSULTOS O ATAQUES A FAMILIARES DE UN USUARIO",
    nivel: 3,
    tiempo: "1 HORA - 1 DIA",
    descripcion: "Mencionar o agredir verbalmente a los familiares de cualquier miembro de la comunidad.",
  },
  {
    name: "DESEAR MAL A BAX",
    nivel: 3,
    tiempo: "1 HORA - 1 DIA",
    descripcion: "Lanzar comentarios malintencionados o desear el mal directamente a Bax.",
  },
  {
    name: "INCOMODAR",
    nivel: 3,
    tiempo: "1 HORA - 1 DIA",
    descripcion: "Realizar acciones persistentes que generen incomodidad, hostigamiento leve o rechazo en otros usuarios.",
  },
  {
    name: "COMPARTIR PANTALLA EN AMONG US",
    nivel: 3,
    tiempo: "1 HORA - 1 DIA",
    descripcion: "Transmitir la pantalla propia mientras se juega Among Us permitiendo hacer trampa o ghosting.",
  },
  {
    name: "PLAGIAR ARTE, COPIAR, ROBAR O HACER VER ARTE CON IA COMO TUYA",
    nivel: 3,
    tiempo: "1 HORA - 1 DIA",
    descripcion: "Atribuirse ilustraciones ajenas o hechas por inteligencia artificial como creaciones propias originales.",
  },
  {
    name: "REPORTES FALSOS O FALSAS ACUSACIONES",
    nivel: 3,
    tiempo: "1 HORA - 1 DIA",
    descripcion: "Acusar falsamente a un usuario de romper reglas con la intención de perjudicarlo.",
  },
  {
    name: "COMENTARIOS +18",
    nivel: 3,
    tiempo: "1 HORA - 1 DIA",
    descripcion: "Emitir comentarios, chistes o insinuaciones de índole sexual explícita en canales no aptos.",
  },
  {
    name: "ENCUBRIMIENTO DE SANCIÓN",
    nivel: 3,
    tiempo: "1 HORA - 1 DIA",
    descripcion: "Ocultar información o proteger a alguien que ha cometido una infracción grave.",
  },
  {
    name: "INCITAR A JUGADORES A ROMPER REGLAS",
    nivel: 3,
    tiempo: "1 HORA - 1 DIA",
    descripcion: "Animar, presionar o convencer a otros miembros para que incumplan las normas del servidor.",
  },
  {
    name: "GEMIDOS",
    nivel: 3,
    tiempo: "1 HORA - 1 DIA",
    descripcion: "Emitir ruidos o gemidos de contenido sexual o incómodo por el canal de voz.",
  },
  {
    name: "REVISAR UNA GRABACIÓN PROPIA DURANTE PARTIDA Y QUE INFLUYA EN EL JUEGO",
    nivel: 3,
    tiempo: "1 HORA - 1 DIA",
    descripcion: "Consultar clips o grabaciones personales en tiempo real para obtener ventaja injusta en una partida activa.",
  },

  // REGLAS DE SALAS (NIVEL 3)
  {
    name: "LEALTAD",
    nivel: 3,
    tiempo: "1 HORA - 1 DIA",
    descripcion: "No traiciones a tus compañeros de equipo a propósito.",
  },
  {
    name: "VOTO LIBRE",
    nivel: 3,
    tiempo: "1 HORA - 1 DIA",
    descripcion: "No presiones ni obligues a otros a votar a alguien.",
  },
  {
    name: "NO ABANDONES",
    nivel: 3,
    tiempo: "1 HORA - 1 DIA",
    descripcion: "Quédate hasta el final de la partida.",
  },
  {
    name: "SINCERIDAD DE ROLES",
    nivel: 3,
    tiempo: "1 HORA - 1 DIA",
    descripcion: "No reveles tu rol ni finjas ser algo fuera de la partida.",
  },
  {
    name: "RESPETA TU TURNO",
    nivel: 3,
    tiempo: "1 HORA - 1 DIA",
    descripcion: "Primero habla el que reporta, después habla el acusado.",
  },
  {
    name: "LEALTAD V2",
    nivel: 3,
    tiempo: "1 HORA - 1 DIA",
    descripcion: "Si eres Fantasma no delates la identidad de tus compañeros que se encuentran aún vivos.",
  },
  {
    name: "LIMITARSE",
    nivel: 3,
    tiempo: "1 HORA - 1 DIA",
    descripcion: "No sabotees estando muerto, el impostor que sigue vivo planifica su plan, estando tú muerto y sin poder comunicarte con él haces un sabotaje, arruina sus planes.",
  },
  {
    name: "COMPRENSIÓN",
    nivel: 3,
    tiempo: "1 HORA - 1 DIA",
    descripcion: "No protejas si queda 1 solo impostor.",
  },
  {
    name: "NO ESTAR JUNTOS",
    nivel: 3,
    tiempo: "1 HORA - 1 DIA",
    descripcion: "No pueden quedarse siempre juntos, el impostor no podrá matar.",
  },
  {
    name: "CAMARABOY",
    nivel: 3,
    tiempo: "1 HORA - 1 DIA",
    descripcion: "Muévete y haz que la partida no se estanque.",
  },
  {
    name: "MISMO NOMBRE DE SALA",
    nivel: 3,
    tiempo: "1 HORA - 1 DIA",
    descripcion: "Mismo nombre de sala que en DC.",
  },

  // NIVEL 4
  {
    name: "COMENTARIOS PASIVO AGRESIVOS",
    nivel: 4,
    tiempo: "1 DIA - 1 SEMANA",
    descripcion: "Lanzar indirectas hostiles, malintencionadas o constantes ataques velados hacia otros usuarios.",
  },
  {
    name: "EXCLUCIÓN",
    nivel: 4,
    tiempo: "1 DIA - 1 SEMANA",
    descripcion: "Hacer vacío, aislar o promover campañas de exclusión en contra de un miembro específico.",
  },
  {
    name: "DISCRIMINACION",
    nivel: 4,
    tiempo: "1 DIA - 1 SEMANA",
    descripcion: "Tratar de forma inferior o despectiva a una persona por sus características personales.",
  },
  {
    name: "ACUMULACION DE SANCIONES NIVEL 3",
    nivel: 4,
    tiempo: "1 DIA - 1 SEMANA",
    descripcion: "Haber acumulado reiteradas infracciones de nivel 3 demostrando conducta reincidente.",
  },
  {
    name: "RACISMO",
    nivel: 4,
    tiempo: "1 DIA - 1 SEMANA",
    descripcion: "Emitir comentarios, insultos o actitudes basadas en prejuicios raciales o de color de piel.",
  },
  {
    name: "CLASISMO",
    nivel: 4,
    tiempo: "1 DIA - 1 SEMANA",
    descripcion: "Despreciar, burlarse o atacar a otros usuarios fundamentándose en su estatus socioeconómico.",
  },
  {
    name: "MACHISMO SIN CONFIANZA",
    nivel: 4,
    tiempo: "1 DIA - 1 SEMANA",
    descripcion: "Hacer comentarios machistas o misóginos sin ningún tipo de confianza previa o contexto de broma aceptada.",
  },
  {
    name: "INSULTOS AL DM",
    nivel: 4,
    tiempo: "1 DIA - 1 SEMANA",
    descripcion: "Hostigar o agredir verbalmente a un miembro del servidor a través de mensajes privados.",
  },
  {
    name: "DIFAMACION",
    nivel: 4,
    tiempo: "1 DIA - 1 SEMANA",
    descripcion: "Inventar y esparcir mentiras graves sobre la reputación de otro usuario o del staff.",
  },
  {
    name: "XENOFOBIA",
    nivel: 4,
    tiempo: "1 DIA - 1 SEMANA",
    descripcion: "Atacar, insultar o mostrar rechazo hacia personas de otras nacionalidades o regiones.",
  },
  {
    name: "FOCUS",
    nivel: 4,
    tiempo: "1 DIA - 1 SEMANA",
    descripcion: "perseguir o arruinar sistemáticamente la experiencia de juego de un usuario específico de forma malintencionada.",
  },
  {
    name: "HOMOFOBIA",
    nivel: 4,
    tiempo: "1 DIA - 1 SEMANA",
    descripcion: "Emitir expresiones de odio, burlas o comentarios despectivos hacia la orientación sexual de alguien.",
  },
  {
    name: "FILTRAR CONVERSACIONES PRIVADAS SIN CONCENTIMIENTO DE LA OTRA PERSONA",
    nivel: 4,
    tiempo: "1 DIA - 1 SEMANA",
    descripcion: "Publicar capturas o divulgar información de chats privados ajenos sin autorización.",
  },
  {
    name: "AMENAZAR A UN USUARIO CON COSAS LEVES DENTRO DEL SERVIDOR",
    nivel: 4,
    tiempo: "1 DIA - 1 SEMANA",
    descripcion: "Intimidar a otro miembro con sanciones, baneos o acciones de poder dentro de la comunidad.",
  },

  // NIVEL 5
  {
    name: "DOXXEO",
    nivel: 5,
    tiempo: "1 SEMANA O BAN",
    descripcion: "Publicar información personal sensitiva o datos privados de un usuario sin su consentimiento.",
  },
  {
    name: "MULTICUENTA",
    nivel: 5,
    tiempo: "1 SEMANA O BAN",
    descripcion: "Utilizar cuentas alternativas para evadir baneos, manipular votaciones o cometer faltas ocultas.",
  },
  {
    name: "ACOSO",
    nivel: 5,
    tiempo: "1 SEMANA O BAN",
    descripcion: "Perseguir, hostigar o incomodar de forma insistente y maliciosa a un miembro de la comunidad.",
  },
  {
    name: "METAGAMING",
    nivel: 5,
    tiempo: "1 SEMANA O BAN",
    descripcion: "Utilizar información obtenida fuera del juego (como streams ajenos o llamadas externas) para ganar ventaja.",
  },
  {
    name: "MOSTRAR COSAS INAPROPIADAS O NSWF",
    nivel: 5,
    tiempo: "1 SEMANA O BAN",
    descripcion: "Difundir contenido explícito, pornográfico o sumamente sensible en los canales del servidor.",
  },
  {
    name: "FOTO INAPROPIADA",
    nivel: 5,
    tiempo: "1 SEMANA O BAN",
    descripcion: "Colocar o enviar imágenes de carácter sexual o prohibido en avatares, perfiles o chats.",
  },
  {
    name: "PEDOFILIA",
    nivel: 5,
    tiempo: "1 SEMANA O BAN",
    descripcion: "Cualquier apología, insinuación, broma o contenido relacionado con abuso infantil (Tolerancia Cero).",
  },
  {
    name: "CONTENIDO GORE",
    nivel: 5,
    tiempo: "1 SEMANA O BAN",
    descripcion: "Compartir imágenes o videos con violencia extrema, sangre explícita o mutilaciones.",
  },
  {
    name: "GRUPO EXTERNO PARA HABLAR MAL DEL STAFF",
    nivel: 5,
    tiempo: "1 SEMANA O BAN",
    descripcion: "Crear o participar en servidores/grupos externos con el único fin de difamar u organizar ataques al staff.",
  },
  {
    name: "CATFISHING",
    nivel: 5,
    tiempo: "1 SEMANA O BAN",
    descripcion: "Hacerse pasar por otra persona utilizando identidades, fotos o datos falsos en internet.",
  },
  {
    name: "GROOMING",
    nivel: 5,
    tiempo: "1 SEMANA O BAN",
    descripcion: "Acciones maliciosas orientadas a establecer contacto inapropiado con menores de edad (Tolerancia Cero).",
  },
  {
    name: "NAZISMO",
    nivel: 5,
    tiempo: "1 SEMANA O BAN",
    descripcion: "Hacer apología, bromas o promover ideologías de odio nazi o fascista.",
  },
  {
    name: "USO DE HACKS",
    nivel: 5,
    tiempo: "1 SEMANA O BAN",
    descripcion: "Emplear programas modificados, scripts o trampas externas para obtener ventajas ilegítimas.",
  },
  {
    name: "COMPARTIR LINKS EXTERNOS",
    nivel: 5,
    tiempo: "1 SEMANA O BAN",
    descripcion: "Enviar enlaces desconocidos o maliciosos que puedan poner en riesgo la seguridad de los usuarios.",
  },
  {
    name: "CONTENIDO NSFW",
    nivel: 5,
    tiempo: "1 SEMANA O BAN",
    descripcion: "Publicar material no apto para menores o contenido subido de tono en zonas no autorizadas.",
  },
  {
    name: "ACUMULACIÓN DE INFRACCIONES (20)",
    nivel: 5,
    tiempo: "1 SEMANA O BAN",
    descripcion: "Haber alcanzado el límite máximo de 20 infracciones registradas en tu historial.",
  },
  {
    name: "PROMOCIONAR LINKS DE OTROS SERVIDORES",
    nivel: 5,
    tiempo: "1 SEMANA O BAN",
    descripcion: "Hacer spam o publicidad no autorizada de invitaciones a otras comunidades de Discord.",
  },
  {
    name: "AMENAZAS REALES O DE MUERTE",
    nivel: 5,
    tiempo: "1 SEMANA O BAN",
    descripcion: "Amenazar con causar daños físicos reales o la muerte a cualquier miembro de la comunidad.",
  },
  {
    name: "DISTRIBUCIÓN DE MALWARE, VIRUS O ARCHIVOS MALICIOSOS",
    nivel: 5,
    tiempo: "1 SEMANA O BAN",
    descripcion: "Compartir programas troyanos, virus o ejecutables dañinos para los equipos ajenos.",
  },
  {
    name: "VENTA DE ROBUX, DIAMANTES, ESTAFAS, ETC...",
    nivel: 5,
    tiempo: "1 SEMANA O BAN",
    descripcion: "Utilizar el servidor para realizar transacciones monetarias fraudulentas, estafas o venta de divisas de juegos.",
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
      { name: "⏳ **Duración:**", value: infraction.tiempo, inline: true },
      { name: "📖 **Descripción:**", value: infraction.descripcion, inline: false },
    )
    .setFooter({ text: "Sistema de Sanciones • TIAGO JR" })
    .setTimestamp();

  await interaction.reply({ embeds: [embed], ephemeral: false });
}