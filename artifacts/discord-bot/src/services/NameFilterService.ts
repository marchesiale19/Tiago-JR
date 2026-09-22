import { Events, EmbedBuilder, type GuildMember } from "discord.js";
import { logger } from "../lib/logger";

// Canal donde se enviarán las alertas
const MOD_CHANNEL_ID = "1522430713746424001";

/*
 * ============================================================
 * PALABRAS / TÉRMINOS A DETECTAR
 * ============================================================
 *
 * La lista está separada por categorías para que sea fácil
 * agregar/quitar términos posteriormente.
 *
 * IMPORTANTE:
 * No conviene bloquear automáticamente por cualquier término
 * sensible. El bot solamente alerta a moderación.
 */

const BAD_WORDS = [
  // =========================
  // ESPAÑOL - INSULTOS
  // =========================
  "puta",
  "puto",
  "putas",
  "putos",
  "putita",
  "putito",
  "putazo",
  "putaza",
  "pendejo",
  "pendeja",
  "pendejos",
  "pendejas",
  "pelotudo",
  "pelotuda",
  "pelotudos",
  "pelotudas",
  "boludo",
  "boluda",
  "boludos",
  "boludas",
  "boludito",
  "boludita",
  "idiota",
  "idiotas",
  "imbecil",
  "imbeciles",
  "estupido",
  "estupida",
  "estupidos",
  "estupidas",
  "tarado",
  "tarada",
  "tarados",
  "taradas",
  "tonto",
  "tonta",
  "tontos",
  "tontas",
  "gil",
  "gila",
  "giles",
  "pelmazo",
  "pelmaza",
  "zoquete",
  "inutil",
  "inutiles",
  "subnormal",
  "idiotazo",
  "idiotita",
  "imbecilazo",
  "menso",
  "mensa",
  "mensos",
  "mensas",
  "pajero",
  "pajera",
  "pajeros",
  "pajeras",
  "mamerto",
  "mamerta",
  "mamon",
  "mamona",
  "mamones",
  "garca",
  "garcas",
  "garka",
  "garkas",
  "forro",
  "forra",
  "forros",
  "forras",
  "chanta",
  "chantas",
  "vendehumo",
  "payaso",
  "payasa",
  "payasos",
  "payasas",

  // =========================
  // ESPAÑOL - GROSERÍAS
  // =========================
  "mierda",
  "mierdas",
  "mierdoso",
  "mierdosa",
  "mierdero",
  "mierdera",
  "cagada",
  "cagado",
  "cagada",
  "cagon",
  "cagona",
  "cagones",
  "carajo",
  "carajos",
  "verga",
  "vergas",
  "concha",
  "conchudo",
  "conchuda",
  "conchudos",
  "orto",
  "culero",
  "culera",
  "culia",
  "culiao",
  "culiado",
  "culiada",
  "culiados",
  "malparido",
  "malparida",
  "malparidos",
  "malparidas",
  "gonorrea",
  "gonorreas",
  "hdp",
  "hdp",
  "hijodeputa",
  "hijaputa",
  "hijoputa",
  "hp",
  "ctm",
  "ptm",
  "lpm",
  "lmqlp",
  "la concha",
  "chupala",
  "chupala",
  "chupame",
  "chupenla",

  // =========================
  // ESPAÑOL - INSULTOS
  // REGIONALES
  // =========================
  "cabron",
  "cabrona",
  "cabrones",
  "cabrón",
  "maricon",
  "maricona",
  "maricones",
  "zorra",
  "zorras",
  "rata",
  "ratas",
  "raton",
  "ratona",
  "basura",
  "escoria",
  "lacra",
  "lacras",
  "degenerado",
  "degenerada",
  "degenerados",
  "degeneradas",

  // =========================
  // PORTUGUÉS
  // =========================
  "puta",
  "puto",
  "putas",
  "putos",
  "viado",
  "viada",
  "otario",
  "otaria",
  "babaca",
  "babacas",
  "idiota",
  "idiotas",
  "imbecil",
  "imbecis",
  "burro",
  "burra",
  "burros",
  "burras",
  "merda",
  "merdas",
  "caralho",
  "caralhos",
  "porra",
  "porras",
  "cacete",
  "cacetes",
  "desgracado",
  "desgracada",
  "fdp",
  "vsf",
  "vai tomar",
  "filho da puta",

  // =========================
  // INGLÉS - INSULTOS/GROSERÍAS
  // =========================
  "fuck",
  "fucks",
  "fucker",
  "fuckers",
  "fucking",
  "motherfucker",
  "motherfuckers",
  "shit",
  "shits",
  "shitty",
  "bullshit",
  "bitch",
  "bitches",
  "asshole",
  "assholes",
  "dumbass",
  "jackass",
  "dick",
  "dicks",
  "dickhead",
  "dickheads",
  "pussy",
  "pussies",
  "cunt",
  "cunts",
  "bastard",
  "bastards",
  "slut",
  "sluts",
  "whore",
  "whores",
  "jerk",
  "jerks",
  "moron",
  "morons",
  "idiot",
  "idiots",
  "stupid",
  "stupids",
  "loser",
  "losers",
  "douche",
  "douchebag",
  "douchebags",
  "prick",
  "pricks",
  "twat",
  "twats",

  // =========================
  // NSFW / SEXUAL
  // =========================
  "porn",
  "porno",
  "pornografia",
  "pornography",
  "nsfw",
  "hentai",
  "ecchi",
  "onlyfans",
  "nude",
  "nudes",
  "nudity",
  "desnudo",
  "desnuda",
  "sexo",
  "sexual",
  "sex",
  "sexy",
  "fetiche",
  "fetish",

  // =========================
  // SPAM / INVITES / LINKS
  // =========================
  "discord.gg/",
  "discord.com/invite/",
  "discordapp.com/invite/",
  "invite.gg/",
  "t.me/",
  "telegram.me/",
  "bit.ly/",
  "tinyurl.com/",
  "grabify",
  "iplogger",
  "ip-log",
  "webhook",

  // =========================
  // HACKS / CHEATS
  // =========================
  "hacker",
  "hackers",
  "hacking",
  "cheat",
  "cheats",
  "cheater",
  "cheaters",
  "aimbot",
  "wallhack",
  "esp hack",
  "triggerbot",
  "autoclicker",
  "exploit",
  "exploits",
  "ddos",
  "dox",
  "doxx",
  "doxxing",

  // =========================
  // TÉRMINOS DE SCAM
  // =========================
  "free nitro",
  "nitro gratis",
  "nitro free",
  "free robux",
  "robux gratis",
  "free vbucks",
  "vbucks gratis",
  "giftcard",
  "gift card",
  "gratis nitro",
  "steam gift",
  "steam key",

  // =========================
  // EVASIONES CON NÚMEROS
  // =========================
  "p3nd3jo",
  "p3nd3ja",
  "p3lotudo",
  "b0ludo",
  "put4",
  "put0",
  "pvt4",
  "m1erd4",
  "m13rd4",
  "c4r4jo",
  "v3rga",
  "p1ja",
  "c0ncha",
  "c0nchudo",
  "1mbecil",
  "1d10ta",
  "3stup1do",
  "t4r4do",
  "f4ck",
  "f4cker",
  "fucking",
  "sh1t",
  "b1tch",
  "4sshole",
  "d1ck",
  "p0rn",
  "s3x",
  "h3nta1",
  "n4z1",
  "h1tl3r"
];

/*
 * ============================================================
 * NORMALIZACIÓN
 * ============================================================
 *
 * Convierte:
 *
 * Pútø → puto
 * P3nd3j0 → pendejo
 * P.U.T.A → puta
 * p-u-t-a → puta
 * P U T A → puta
 * PÜTÄ → puta
 *
 * También elimina caracteres usados para intentar esquivar
 * filtros.
 */

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/0/g, "o")
    .replace(/1/g, "i")
    .replace(/2/g, "z")
    .replace(/3/g, "e")
    .replace(/4/g, "a")
    .replace(/5/g, "s")
    .replace(/6/g, "g")
    .replace(/7/g, "t")
    .replace(/8/g, "b")
    .replace(/9/g, "g")
    .replace(/@/g, "a")
    .replace(/\$/g, "s")
    .replace(/[^a-z0-9]/g, "");
}

/*
 * Hace una segunda versión conservando espacios.
 *
 * Esto permite detectar frases como:
 *
 * "hijo de puta"
 * "vai tomar no..."
 *
 * sin destruir completamente el texto.
 */

function normalizeForPhraseDetection(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/0/g, "o")
    .replace(/1/g, "i")
    .replace(/2/g, "z")
    .replace(/3/g, "e")
    .replace(/4/g, "a")
    .replace(/5/g, "s")
    .replace(/6/g, "g")
    .replace(/7/g, "t")
    .replace(/8/g, "b")
    .replace(/9/g, "g")
    .replace(/@/g, "a")
    .replace(/\$/g, "s")
    .replace(/[._\-+*=~|/\\]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/*
 * ============================================================
 * DETECCIÓN
 * ============================================================
 */

function findBadWord(text: string): string | null {
  const normalized = normalizeText(text);
  const phraseNormalized = normalizeForPhraseDetection(text);

  // Primero buscamos frases exactas / términos largos.
  const phraseMatch = BAD_WORDS.find((word) => {
    const normalizedWord = normalizeForPhraseDetection(word);

    if (normalizedWord.includes(" ")) {
      return phraseNormalized.includes(normalizedWord);
    }

    return false;
  });

  if (phraseMatch) {
    return phraseMatch;
  }

  // Después buscamos términos individuales.
  const wordMatch = BAD_WORDS.find((word) => {
    const normalizedWord = normalizeText(word);

    // Evita palabras demasiado pequeñas porque generan
    // cantidades absurdas de falsos positivos.
    if (normalizedWord.length < 3) {
      return false;
    }

    return normalized.includes(normalizedWord);
  });

  return wordMatch ?? null;
}

/*
 * ============================================================
 * CONFIGURACIÓN DEL FILTRO
 * ============================================================
 */

export function setupNameFilter(client: any) {
  client.on(Events.GuildMemberAdd, async (member: GuildMember) => {
    try {
      const username = member.user.username;
      const displayName = member.displayName;

      const matchedUsername = findBadWord(username);
      const matchedDisplayName = findBadWord(displayName);

      const matchedWord =
        matchedUsername ??
        matchedDisplayName;

      if (!matchedWord) {
        return;
      }

      const modChannel = member.guild.channels.cache.get(MOD_CHANNEL_ID);

      if (!modChannel || !modChannel.isTextBased()) {
        logger.warn(
          `No se encontró el canal de moderación ${MOD_CHANNEL_ID}`
        );

        return;
      }

      const detectedIn = matchedUsername
        ? "Nombre de usuario"
        : "Nombre mostrado";

      const alertEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle("⚠️ Nombre potencialmente inapropiado detectado")
        .setDescription(
          [
            "Un usuario acaba de entrar al servidor y su nombre coincide con un término del filtro.",
            "",
            `👤 **Usuario:** ${member.user}`,
            `🏷️ **Username:** \`${username}\``,
            `📝 **Display name:** \`${displayName}\``,
            `🆔 **ID:** \`${member.id}\``,
            `📍 **Detectado en:** ${detectedIn}`,
            `🔍 **Coincidencia:** \`${matchedWord}\``,
          ].join("\n")
        )
        .setFooter({
          text: "Revisión automática • Se requiere revisión de moderación",
        })
        .setTimestamp();

      await modChannel.send({
        embeds: [alertEmbed],
      });

      logger.info(
        {
          guildId: member.guild.id,
          userId: member.id,
          username,
          displayName,
          matchedWord,
        },
        "Nombre potencialmente inapropiado detectado"
      );
    } catch (err) {
      logger.error(
        { err },
        "Error al ejecutar el filtro de nombres para nuevos miembros"
      );
    }
  });
}