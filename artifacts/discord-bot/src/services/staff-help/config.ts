
export const STAFF_HELP_CONFIG = {
  // Servidor y canal
  guildId: "1437644356977823884",
  channelId: "1497646203242807416",

  // Tiempo máximo de inactividad: 5 minutos
timeoutMs: 15 * 60 * 1000,
  
  // Frecuencia de comprobación: 15 segundos
  workerIntervalMs: 15 * 1000,

  // Roles autorizados para solicitar asistencia
  requesterRoleIds: [
    "1509760269071679498", // Trial Helper
    "1528974868329009162", // Helper
  ],

  // Roles autorizados para atender solicitudes
  assigneeRoleIds: [
    "1452784726413672643",  // Moderador
    "1509760381525164123",  // Moderador PB
    "1522808445391212674",  // Support
    "1522807097920720967",  // Manager
  ],
} as const;
