import { Message } from 'discord.js';
import { unb } from "./unbelievaboat";

export class BirthdayRewardService {
    private static readonly ID_DEXTER = "1315681246763810929";
    private static readonly ID_ALEZINHO = "1318045186684751922";
    private static readonly CUMPLIANEROS = [
        BirthdayRewardService.ID_DEXTER,
        BirthdayRewardService.ID_ALEZINHO
    ];

    // Control en memoria para saber quiénes ya cobraron su recompensa hoy
    private static usuariosRecompensados = new Set<string>();

    /**
     * Procesa los mensajes para detectar felicitaciones de cumpleaños.
     */
    public static async processMessage(message: Message): Promise<void> {
        if (message.author.bot || !message.guild) return;

        // 1. Validar que la función SOLO sirva hoy (11 de Noviembre de 2026)
        const ahora = new Date();
        const esHoy = ahora.getFullYear() === 2026 && 
                      ahora.getMonth() === 10 && // Los meses en JS van de 0 a 11 (10 = Noviembre)
                      ahora.getDate() === 11;

        if (!esHoy) return;

        const contenido = message.content.toLowerCase();

        // 2. Verificar si el mensaje contiene "feliz cumpleaños"
        if (!contenido.includes("feliz cumpleaños")) return;

        // 3. Verificar si se menciona a Dexter o a Alezinho
        const menciones = message.mentions.users;
        const mencionoADexter = menciones.has(BirthdayRewardService.ID_DEXTER);
        const mencionoAAlezinho = menciones.has(BirthdayRewardService.ID_ALEZINHO);

        if (!mencionoADexter && !mencionoAAlezinho) return;

        // 4. Regla de auto-felicitación: No pasa nada si se felicitan a sí mismos
        const autorId = message.author.id;
        if (
            (autorId === BirthdayRewardService.ID_DEXTER && mencionoADexter) ||
            (autorId === BirthdayRewardService.ID_ALEZINHO && mencionoAAlezinho)
        ) {
            return;
        }

        try {
            // 5. El bot SIEMPRE reacciona con un corazón
            await message.react("❤️");

            // 6. Verificar si el usuario ya recibió los 100k
            if (this.usuariosRecompensados.has(autorId)) {
                // Ya cobró su recompensa previa hoy; solo se queda la reacción ❤️
                return;
            }

            // 7. Acreditar las 100k monedas del casino (Recompensa Única)
await this.otorgarCasino(
    message.guild.id,
    autorId,
    100000
);          
   this.usuariosRecompensados.add(autorId);

        } catch (error) {
            console.error("[BirthdayRewardService] Error procesando felicitación:", error);
        }
    }

   private static async otorgarCasino(
    guildId: string,
    userId: string,
    cantidad: number
): Promise<void> {
    await unb.editUserBalance(
        guildId,
        userId,
        {
            cash: cantidad,
            bank: 0
        },
        "Recompensa de cumpleaños"
    );

    console.log(
        `[Casino] Se acreditaron ${cantidad} monedas a ${userId}`
    );
}
