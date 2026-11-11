import { Client, ForumChannel } from 'discord.js';

export function initForumCleanup(client: Client) {
    const FORUM_CHANNEL_ID = '1548461128831598633'; // Canal de foros indicado
    const INACTIVE_LIMIT_MS = 24 * 60 * 60 * 1000; // 1 día exacto en milisegundos

    // Ejecutar la revisión cada 1 hora
    setInterval(async () => {
        try {
            const channel = await client.channels.fetch(FORUM_CHANNEL_ID);
            
            // Validar que el canal exista y sea estrictamente un Foro
            if (!channel || !(channel instanceof ForumChannel)) return;

            // Obtener los hilos (publicaciones) activos en la caché del canal
            const activeThreads = channel.threads.cache;
            const now = Date.now();

            for (const [_, thread] of activeThreads) {
                // Si la publicación está fijada (pinned), la saltamos para que no se borre
                if (thread.pinned) continue;

                // Tomar la fecha del último mensaje o, si no hay, la fecha de creación del hilo
                const lastActivityTime = thread.lastMessage?.createdTimestamp || thread.createdTimestamp;
                const inactiveTime = now - lastActivityTime;

                // Si supera 1 día completo de inactividad
                if (inactiveTime > INACTIVE_LIMIT_MS) {
                    await thread.delete('Limpieza automática por inactividad de 1 día (Sugerencia de Harumi)');
                }
            }
        } catch (error) {
            console.error('Error al ejecutar la limpieza automática del foro:', error);
        }
    }, 60 * 60 * 1000); // 1 hora en ms
}
