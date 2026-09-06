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
  // ── NIVEL 1 (1 minuto) ──────────────────────────────────────────────────
  {
    name: "MAL USO DE CANALES",
    nivel: 1,
    tiempo: "1 MINUTO",
    descripcion: "Ocurre cuando un usuario está utilizando un canal erróneamente con la función de otro. Se advierte por si no ha sido consciente y se sanciona si hay reincidencia.",
  },
  {
    name: "MICRÓFONO SATURADO",
    nivel: 1,
    tiempo: "1 MINUTO",
    descripcion: "Ocurre cuando el usuario tiene un micrófono mal configurado y se escucha a un volumen molesto. Se advierte primero y se aplica sanción si persiste.",
  },
  {
    name: "RUIDOS MOLESTOS",
    nivel: 1,
    tiempo: "1 MINUTO",
    descripcion: "Ruido de fondo en llamada (música, mascotas, calle) que molesta en la sala. Se advierte para que se silencie y desmutee solo al hablar; si no hace caso, se sanciona.",
  },
  {
    name: "ENTRAR Y SALIR DE UN CANAL DE VOZ PARA MOLESTAR",
    nivel: 1,
    tiempo: "1 MINUTO",
    descripcion: "Unirse a un voice chat diciendo cosas aleatorias o haciendo ruidos para molestar. Se da una sola advertencia y se sanciona si hay reincidencia.",
  },
  {
    name: "SPAM DE REACCIONES SIN CONFIANZA",
    nivel: 1,
    tiempo: "1 MINUTO",
    descripcion: "Poner muchos emojis de reacción a un mensaje ajeno reventando el dispositivo a notificaciones sin haber confianza. Se advierte primero y se sanciona si continúa.",
  },

  // ── NIVEL 2 (5 - 10 minutos) ─────────────────────────────────────────────
  {
    name: "FLOOD Y SPAM",
    nivel: 2,
    tiempo: "5 - 10 MINUTOS",
    descripcion: "Enviar mensajes demasiado largos o repetir mensajes muchas veces. Se advierte primero y se aplica la sanción si sigue haciéndolo.",
  },
  {
    name: "HABLAR DURANTE PARTIDA",
    nivel: 2,
    tiempo: "5 - 10 MINUTOS",
    descripcion: "Hablar durante las rondas sobre temas ajenos a la partida (excepto dar información importante de muertes o avistamientos). Se advierte y se sanciona si no hace caso.",
  },
  {
    name: "NO TENER EL MISMO NOMBRE DE AMONG US",
    nivel: 2,
    tiempo: "5 - 10 MINUTOS",
    descripcion: "Tener un nombre diferente en Among Us y Discord al pasar lista. Se le pide al dueño que no inicie y saque al usuario; si se repite, se sanciona.",
  },
  {
    name: "MAL USO DE SUGERENCIA",
    nivel: 2,
    tiempo: "5 - 10 MINUTOS",
    descripcion: "Utilizar las sugerencias para llamar la atención, molestar o enviar cosas sin sentido.",
  },
  {
    name: "MAL USO DE TICKET",
    nivel: 2,
    tiempo: "5 - 10 MINUTOS",
    descripcion: "Abrir y cerrar tickets repetidamente sin decir nada, o insistir en un caso ya resuelto.",
  },
  {
    name: "FALTA DE RESPETO ENTRE MIEMBROS",
    nivel: 2,
    tiempo: "5 - 10 MINUTOS",
    descripcion: "Insultarse, provocarse o molestarse entre miembros. Se advierte que paren y se sanciona si alguno continúa.",
  },
  {
    name: "QUEDARSE AFK EN PARTIDA",
    nivel: 2,
    tiempo: "5 - 10 MINUTOS",
    descripcion: "Quedarse sin hacer nada durante una partida completa repetidamente sin previo aviso, perjudicando al equipo.",
  },
  {
    name: "MAL INFORMAR SOBRE UNA REGLA",
    nivel: 2,
    tiempo: "5 - 10 MINUTOS",
    descripcion: "Dar información falsa sobre una regla. Se corrige al receptor y se sanciona al emisor incorrecto si el otro rompe la regla por su culpa.",
  },
  {
    name: "PRENDER CÁMARA EN AMONG US INTENCIONALMENTE",
    nivel: 2,
    tiempo: "5 - 10 MINUTOS",
    descripcion: "Prender cámara a propósito dentro del canal de Among Us. Se pide apagarla inmediatamente y se sanciona si vuelve a hacerlo.",
  },
  {
    name: "ENTRAR A UNA SALA Y NO ESTAR EN EL CANAL DE VOZ",
    nivel: 2,
    tiempo: "5 - 10 MINUTOS",
    descripcion: "Entrar a una sala de Among Us sin unirse al canal de voz correspondiente. Se advierte y se sanciona si se repite.",
  },
  {
    name: "RUIDOS MUY MOLESTOS",
    nivel: 2,
    tiempo: "5 - 10 MINUTOS",
    descripcion: "Hacer ruidos molestos intencionalmente (maullar, gritar, etc.) para molestar. Se sanciona si continúa tras la advertencia.",
  },
  {
    name: "ENTRAR A UN CANAL DE VOZ PARA MOLESTAR",
    nivel: 2,
    tiempo: "5 - 10 MINUTOS",
    descripcion: "Entrar a un canal solo para provocar o criticar acciones ajenas. Se advierte y se sanciona si continúa.",
  },
  {
    name: "NO RESPETAR TURNOS PARA HABLAR",
    nivel: 2,
    tiempo: "5 - 10 MINUTOS",
    descripcion: "Interrumpir o hablar encima durante el turno del reportador y el acusado sin información importante. Se sanciona tras advertencia.",
  },

  // ── NIVEL 3 (1 hora - 1 día) ─────────────────────────────────────────────
  {
    name: "EVASIÓN DE SANCIÓN",
    nivel: 3,
    tiempo: "1 HORA - 1 DÍA",
    descripcion: "Intentar evitar ser reconocido o sancionado cambiando nombre/foto, o salirse del canal de voz al ser movido por el Staff.",
  },
  {
    name: "LEALTAD - TRAICIÓN DE EQUIPO",
    nivel: 3,
    tiempo: "1 HORA - 1 DÍA",
    descripcion: "No traicionar a compañeros de equipo a propósito (puedes culpar a tu compañero si ya lo descubrieron, pero no venderlo de primeras o mutar en él).",
  },
  {
    name: "CANAL OFICIAL - MD REVELANDO INFO",
    nivel: 3,
    tiempo: "1 HORA - 1 DÍA",
    descripcion: "Prohibido hablar por privado revelando información del juego; usar solo chat o voz oficial.",
  },
  {
    name: "JUEGO INDIVIDUAL - TEAM",
    nivel: 3,
    tiempo: "1 HORA - 1 DÍA",
    descripcion: "No hacer alianzas secretas o Team con otro jugador fuera de las mecánicas permitidas.",
  },
  {
    name: "SILENCIO - HABLAR FUERA DE REUNIONES",
    nivel: 3,
    tiempo: "1 HORA - 1 DÍA",
    descripcion: "No hablar ni escribir durante las rondas, solo en reuniones.",
  },
  {
    name: "VOTO LIBRE",
    nivel: 3,
    tiempo: "1 HORA - 1 DÍA",
    descripcion: "No presionar, obligar ni condicionar a otros a votar a alguien.",
  },
  {
    name: "ABANDONO DE PARTIDA",
    nivel: 3,
    tiempo: "1 HORA - 1 DÍA",
    descripcion: "Salirse por morir o para no perder, no quedarse hasta el final de la partida.",
  },
  {
    name: "SINCERIDAD DE ROLES",
    nivel: 3,
    tiempo: "1 HORA - 1 DÍA",
    descripcion: "No revelar tu rol ni fingir ser algo fuera de la partida o inventar roles siendo tripulante para sacar a alguien.",
  },
  {
    name: "RESPETO EN DISCUSIONES",
    nivel: 3,
    tiempo: "1 HORA - 1 DÍA",
    descripcion: "Prohibido insultar, gritar o ser ofensivo en las discusiones.",
  },
  {
    name: "CERO TRAMPAS",
    nivel: 3,
    tiempo: "1 HORA - 1 DÍA",
    descripcion: "No usar apps externas, MODs, APKs no oficiales o mirar transmisiones para ganar ventaja.",
  },
  {
    name: "RESPETA TU TURNO",
    nivel: 3,
    tiempo: "1 HORA - 1 DÍA",
    descripcion: "Primero habla el que reporta, después el acusado.",
  },
  {
    name: "LEALTAD V2 - FANTASMAS",
    nivel: 3,
    tiempo: "1 HORA - 1 DÍA",
    descripcion: "Siendo fantasma no delates la identidad de tus compañeros vivos (los ángeles no los dejarán actuar).",
  },
  {
    name: "LIMITARSE - SABOTAJE MUERTO",
    nivel: 3,
    tiempo: "1 HORA - 1 DÍA",
    descripcion: "No sabotees estando muerto arruinando la estrategia y planes del impostor que sigue vivo.",
  },
  {
    name: "COMPRENSIÓN - 1 IMPOSTOR VIVO",
    nivel: 3,
    tiempo: "1 HORA - 1 DÍA",
    descripcion: "No protejas ni cubras de más si queda un solo impostor vivo.",
  },
  {
    name: "NO ESTAR JUNTOS",
    nivel: 3,
    tiempo: "1 HORA - 1 DÍA",
    descripcion: "No quedarse siempre juntos impidiendo que el impostor pueda matar.",
  },
  {
    name: "CAMARABOY",
    nivel: 3,
    tiempo: "1 HORA - 1 DÍA",
    descripcion: "Muévete y haz que la partida no se estanque quedándose todos en cámaras.",
  },
  {
    name: "NO FOCUS",
    nivel: 3,
    tiempo: "1 HORA - 1 DÍA",
    descripcion: "No matar a alguien siempre a propósito ni culparlo/sospechar de él sistemáticamente.",
  },
  {
    name: "MISMO NOMBRE DE SALA",
    nivel: 3,
    tiempo: "1 HORA - 1 DÍA",
    descripcion: "Obligatorio tener el mismo nombre de sala/Discord en Among Us (si no, expulsar).",
  },
  {
    name: "FALTA DE RESPETO AL STAFF",
    nivel: 3,
    tiempo: "1 HORA - 1 DÍA",
    descripcion: "Insultar o faltar el respeto a un miembro del Staff sin confianza. Se advierte y se sanciona si continúa.",
  },
  {
    name: "MENTIR AL STAFF",
    nivel: 3,
    tiempo: "1 HORA - 1 DÍA",
    descripcion: "Mentir intencionalmente ante un reporte o situación para evitar una sanción propia o de un amigo.",
  },
  {
    name: "PROVOCAR DISCUSIONES",
    nivel: 3,
    tiempo: "1 HORA - 1 DÍA",
    descripcion: "Intentar provocar o iniciar discusiones intencionalmente con otra persona.",
  },
  {
    name: "SUPLANTACIÓN DE IDENTIDAD DEL STAFF",
    nivel: 3,
    tiempo: "1 HORA - 1 DÍA",
    descripcion: "Utilizar un rango del Staff al que no se pertenece en el nombre. Se pide cambiarlo y se sanciona si se lo vuelve a colocar.",
  },
  {
    name: "NOMBRE INAPROPIADO",
    nivel: 3,
    tiempo: "1 HORA - 1 DÍA",
    descripcion: "Usar nombres con contenido +18 o inadecuado. Se pide cambiarlo y se sanciona si reincide.",
  },
  {
    name: "CASO OMISO A ÓRDENES DEL STAFF",
    nivel: 3,
    tiempo: "1 HORA - 1 DÍA",
    descripcion: "Ignorar, negarse a responder o no hacer caso a las indicaciones de un miembro del Staff en un reporte.",
  },
  {
    name: "INTERFERENCIA A LA MODERACIÓN",
    nivel: 3,
    tiempo: "1 HORA - 1 DÍA",
    descripcion: "Interferir mientras el Staff atiende un caso (decirle a los involucrados que no hagan caso o entorpecer).",
  },
  {
    name: "ACUMULACIÓN DE SANCIONES DE NIVEL 2",
    nivel: 3,
    tiempo: "1 HORA",
    descripcion: "Acumular 4 o más sanciones de Nivel 2 durante la misma semana (el tiempo aumenta a 1 hora).",
  },
  {
    name: "COMANDOS PROHIBIDOS (?WA, BANANA, SPANK)",
    nivel: 3,
    tiempo: "1 HORA - 1 DÍA",
    descripcion: "Usar comandos prohibidos. Si es usuario antiguo/nivel alto se sanciona directo; si es nuevo, se advierte.",
  },
  {
    name: "HABLAR DE SANCIONES EN PÚBLICO",
    nivel: 3,
    tiempo: "1 HORA - 1 DÍA",
    descripcion: "Intentar hacer pública una sanción recibida o hablar de ella abiertamente.",
  },
  {
    name: "INSULTOS HACIA FAMILIARES",
    nivel: 3,
    tiempo: "1 HORA - 1 DÍA",
    descripcion: "Insultar a un familiar de otra persona sin confianza. Se advierte primero y se sanciona si se repite.",
  },
  {
    name: "DESEARLE EL MAL A ALGUIEN",
    nivel: 3,
    tiempo: "1 HORA - 1 DÍA",
    descripcion: "Desear algo malo a alguien de forma intencional (ej. ante una enfermedad). Se advierte y se sanciona si repite.",
  },
  {
    name: "INCOMODAR",
    nivel: 3,
    tiempo: "1 HORA - 1 DÍA",
    descripcion: "Realizar preguntas o acciones que hacen sentir incómoda a otra persona.",
  },
  {
    name: "PLAGIAR ARTE O USAR IA",
    nivel: 3,
    tiempo: "1 HORA - 1 DÍA",
    descripcion: "Tomar arte de terceros (Pinterest, calcado) o usar IA afirmando que lo hiciste tú mismo.",
  },
  {
    name: "REPORTES FALSOS O ACUSACIONES FALSAS",
    nivel: 3,
    tiempo: "1 HORA - 1 DÍA",
    descripcion: "Reportar a alguien sin pruebas por problemas personales o para perjudicar.",
  },
  {
    name: "COMENTARIOS +18",
    nivel: 3,
    tiempo: "1 HORA - 1 DÍA",
    descripcion: "Hablar de temas inapropiados para menores de 18 años. Se advierte y se sanciona si repite.",
  },
  {
    name: "ENCUBRIMIENTO DE SANCIÓN",
    nivel: 3,
    tiempo: "1 HORA - 1 DÍA",
    descripcion: "Ocultar, justificar o encubrir a alguien que rompió una regla (Nivel 3 para abajo).",
  },
  {
    name: "INCITAR A ROMPER REGLAS",
    nivel: 3,
    tiempo: "1 HORA - 1 DÍA",
    descripcion: "Animar o decir a otra persona que ignore o rompa las reglas del servidor.",
  },
  {
    name: "GEMIDOS",
    nivel: 3,
    tiempo: "1 HORA - 1 DÍA",
    descripcion: "Realizar gemidos intencionalmente en canales de voz (Sanción directa).",
  },
  {
    name: "REVISAR GRABACIÓN A MITAD DE PARTIDA",
    nivel: 3,
    tiempo: "1 HORA - 1 DÍA",
    descripcion: "Revisar un clip/grabación durante una partida para comprobar hechos (Sanción directa).",
  },

  // ── NIVEL 4 (1 día - 1 semana) ───────────────────────────────────────────
  {
    name: "COMENTARIOS PASIVO-AGRESIVOS",
    nivel: 4,
    tiempo: "1 DÍA - 1 SEMANA",
    descripcion: "Comentarios con indirectas o doble sentido para provocar o hacer sentir mal a otros.",
  },
  {
    name: "EXCLUSIÓN",
    nivel: 4,
    tiempo: "1 DÍA - 1 SEMANA",
    descripcion: "Sacar a una persona de una partida o actividades del grupo sin motivo aparente, diciendo que se salga.",
  },
  {
    name: "DISCRIMINACIÓN",
    nivel: 4,
    tiempo: "1 DÍA - 1 SEMANA",
    descripcion: "Tratar de manera diferente o perjudicial a alguien por características personales (según gravedad puede ser advertencia).",
  },
  {
    name: "RACISMO",
    nivel: 4,
    tiempo: "1 DÍA - 1 SEMANA",
    descripcion: "Comentarios o insultos que atacan por raza, color de piel u origen étnico (según gravedad puede ser advertencia).",
  },
  {
    name: "CLASISMO",
    nivel: 4,
    tiempo: "1 DÍA - 1 SEMANA",
    descripcion: "Menospreciar, insultar o discriminar por situación económica o clase social.",
  },
  {
    name: "DIFAMACIÓN",
    nivel: 4,
    tiempo: "1 DÍA - 1 SEMANA",
    descripcion: "Compartir información falsa para perjudicar la reputación de alguien.",
  },
  {
    name: "XENOFOBIA",
    nivel: 4,
    tiempo: "1 DÍA - 1 SEMANA",
    descripcion: "Atacar o menospreciar a alguien por ser de otro país o nacionalidad (según gravedad puede ser advertencia).",
  },
  {
    name: "HOMOFOBIA",
    nivel: 4,
    tiempo: "1 DÍA - 1 SEMANA",
    descripcion: "Atacar o discriminar a alguien por su orientación sexual (según gravedad puede ser advertencia).",
  },
  {
    name: "HOSTIGAMIENTO",
    nivel: 4,
    tiempo: "1 DÍA - 1 SEMANA",
    descripcion: "Molestar, provocar o incomodar constantemente a alguien tras pedirle que pare.",
  },
  {
    name: "ACUMULACIÓN DE SANCIONES DE NIVEL 3",
    nivel: 4,
    tiempo: "1 DÍA",
    descripcion: "Acumular 4 o más sanciones de Nivel 3 en la misma semana (el tiempo aumenta a 1 día).",
  },
  {
    name: "MACHISMO SIN CONFIANZA",
    nivel: 4,
    tiempo: "1 DÍA - 1 SEMANA",
    descripcion: "Comentarios machistas o tratos inferiores por género sin confianza previa.",
  },
  {
    name: "INSULTOS A MD",
    nivel: 4,
    tiempo: "1 DÍA - 1 SEMANA",
    descripcion: "Insultar u ofender a otra persona mediante mensajes directos sin existir confianza.",
  },
  {
    name: "FOCUS",
    nivel: 4,
    tiempo: "1 DÍA - 1 SEMANA",
    descripcion: "Concentrarse intencionalmente en una persona durante la partida para perjudicarla reiteradamente sin razón válida.",
  },
  {
    name: "FILTRAR CONVERSACIONES SIN PERMISO",
    nivel: 4,
    tiempo: "1 DÍA - 1 SEMANA",
    descripcion: "Compartir chats privados, capturas o información de conversaciones sin permiso de los participantes.",
  },
  {
    name: "AMENAZAR A UN USUARIO CON COSAS LEVES",
    nivel: 4,
    tiempo: "1 DÍA - 1 SEMANA",
    descripcion: "Realizar amenazas de carácter leve evaluando intención y contexto.",
  },

  // ── NIVEL 5 (1 semana o BAN) ─────────────────────────────────────────────
  {
    name: "ENCUBRIMIENTO DE SANCIÓN (NIVEL 5)",
    nivel: 5,
    tiempo: "1 SEMANA O BAN",
    descripcion: "Ayudar a otra persona a evadir, ocultar o reducir una sanción aplicada por el staff.",
  },
  {
    name: "SALIR DEL SERVIDOR PARA EVADIR SANCIÓN",
    nivel: 5,
    tiempo: "1 SEMANA O BAN",
    descripcion: "Abandonar el servidor con la intención de evitar un castigo.",
  },
  {
    name: "DOXXEO",
    nivel: 5,
    tiempo: "1 SEMANA O BAN",
    descripcion: "Compartir información personal o privada de otra persona sin su consentimiento.",
  },
  {
    name: "MULTICUENTA",
    nivel: 5,
    tiempo: "1 SEMANA O BAN",
    descripcion: "Utilizar una o más cuentas adicionales dentro del servidor de Valle de Mr Bodrio.",
  },
  {
    name: "ACOSO",
    nivel: 5,
    tiempo: "1 SEMANA O BAN",
    descripcion: "Molestar o incomodar a una persona repetidamente tras pedirle que pare.",
  },
  {
    name: "METAGAMING",
    nivel: 5,
    tiempo: "1 SEMANA O BAN",
    descripcion: "Usar información externa para obtener ventaja en la partida.",
  },
  {
    name: "NEGARSE A REVISIÓN",
    nivel: 5,
    tiempo: "1 SEMANA O BAN",
    descripcion: "Negarse a colaborar con una revisión solicitada por el staff.",
  },
  {
    name: "CONTENIDO INAPROPIADO O NSFW",
    nivel: 5,
    tiempo: "1 SEMANA O BAN",
    descripcion: "Enviar contenido sexual, explícito o inapropiado para la comunidad.",
  },
  {
    name: "FOTO INAPROPIADA",
    nivel: 5,
    tiempo: "1 SEMANA O BAN",
    descripcion: "Ponerse una foto de perfil sexual o explícita en Valle de Mr Bodrio.",
  },
  {
    name: "PEDOFILIA",
    nivel: 5,
    tiempo: "1 SEMANA O BAN",
    descripcion: "Conductas inapropiadas con menores de edad (Tolerancia Cero).",
  },
  {
    name: "CONTENIDO GORE",
    nivel: 5,
    tiempo: "1 SEMANA O BAN",
    descripcion: "Compartir contenido explícito de muerte, violencia o lesiones.",
  },
  {
    name: "GRUPO EXTERNO PARA HABLAR MAL DEL STAFF",
    nivel: 5,
    tiempo: "1 SEMANA O BAN",
    descripcion: "Crear un grupo externo para hablar mal o difamar al staff.",
  },
  {
    name: "CATFISHING",
    nivel: 5,
    tiempo: "1 SEMANA O BAN",
    descripcion: "Hacerse pasar por otra persona o usar identidad falsa para engañar.",
  },
  {
    name: "GROOMING",
    nivel: 5,
    tiempo: "1 SEMANA O BAN",
    descripcion: "Intentar ganarse la confianza de un menor con fines de interacción sexual (Tolerancia Cero).",
  },
  {
    name: "NAZISMO",
    nivel: 5,
    tiempo: "1 SEMANA O BAN",
    descripcion: "Promover o apoyar el nazismo dentro del servidor.",
  },
  {
    name: "HACKS",
    nivel: 5,
    tiempo: "1 SEMANA O BAN",
    descripcion: "Usar hacks para obtener ventaja en Among Us.",
  },
  {
    name: "MOD MENU",
    nivel: 5,
    tiempo: "1 SEMANA O BAN",
    descripcion: "Utilizar un menú de mods no permitido para alterar partidas en Valle de Mr Bodrio.",
  },
  {
    name: "COMPARTIR LINKS EXTERNOS",
    nivel: 5,
    tiempo: "1 SEMANA O BAN",
    descripcion: "Compartir enlaces externos no permitidos dentro del servidor.",
  },
  {
    name: "PROMOCIONAR LINKS DE SERVIDORES",
    nivel: 5,
    tiempo: "1 SEMANA O BAN",
    descripcion: "Invitar a servidores externos sin autorización del staff.",
  },
  {
    name: "ACUMULACIÓN DE SANCIONES (20 EN ADELANTE)",
    nivel: 5,
    tiempo: "1 SEMANA O BAN",
    descripcion: "Alcanzar 20 o más sanciones registradas.",
  },
  {
    name: "AMENAZAS REALES O DE MUERTE",
    nivel: 5,
    tiempo: "1 SEMANA O BAN",
    descripcion: "Amenazar de muerte a una persona dentro del servidor.",
  },
  {
    name: "INTENTO DE RAID",
    nivel: 5,
    tiempo: "1 SEMANA O BAN",
    descripcion: "Organizar o participar en un ataque masivo contra el servidor.",
  },
  {
    name: "DISTRIBUCIÓN DE MALWARE Y VIRUS",
    nivel: 5,
    tiempo: "1 SEMANA O BAN",
    descripcion: "Distribuir archivos o programas para dañar dispositivos o cuentas.",
  },
  {
    name: "ESTAFAS REALES",
    nivel: 5,
    tiempo: "1 SEMANA O BAN",
    descripcion: "Engañar a otra persona para obtener dinero, cuentas u objetos mediante estafa real.",
  },
  {
    name: "TEAM",
    nivel: 5,
    tiempo: "1 SEMANA O BAN",
    descripcion: "Colaborar con otro usuario para obtener ventaja injusta en partidas de Among Us.",
  },
];

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

  // Security check: Only users with Role ID 1454679144230289510 have access
  const TARGET_ROLE_ID = "1454679144230289510";
  const member = interaction.member;
  let hasAccess = false;

  if (member && typeof member !== "string" && "roles" in member) {
    const memberRoles = (member.roles as any).cache;
    hasAccess = memberRoles.has(TARGET_ROLE_ID);
  }

  if (!hasAccess) {
    await interaction.reply({
      content: "❌ No tienes el rango suficiente para usar ese comando.",
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