
import { Message } from 'discord.js';
import { unb } from "../lib/unbelievaboat";

export class BirthdayRewardService {
    private static readonly ID_DEXTER = "1315681246763810929";
    private static readonly ID_ALEZINHO = "1318045186684751922";

    // Usuarios que ya cobraron durante esta ejecución
    private static usuariosRecompensados = new Set<string>();

    public static async processMessage(message: Message): Promise<void> {
        if (message.author.bot || !message.guild) return;

        // Solo funciona el 11 de noviembre de 2026
        const ahora = new Date();
        const esHoy =
            ahora.getFullYear() === 2026 &&
            ahora.getMonth() === 10 &&
            ahora.getDate() === 11;

        if (!esHoy) return;

        const contenido = message.content.toLowerCase();

        if (!contenido.includes("feliz cumpleaños")) return;

        const menciones = message.mentions.users;

        const mencionoADexter = menciones.has(this.ID_DEXTER);
        const mencionoAAlezinho = menciones.has(this.ID_ALEZINHO);

        if (!mencionoADexter && !mencionoAAlezinho) return;

        const autorId = message.author.id;

        // Evitar auto-felicitaciones
        if (
            (autorId === this.ID_DEXTER && mencionoADexter) ||
            (autorId === this.ID_ALEZINHO && mencionoAAlezinho)
        ) {
            return;
        }

        try {
            // Reaccionar al mensaje
            await message.react("❤️");

            // Comprobar si ya recibió la recompensa
            if (this.usuariosRecompensados.has(autorId)) {
                return;
            }

            // Entregar 100.000 monedas mediante UnbelievaBoat
            await this.otorgarCasino(
                message.guild.id,
                autorId,
                100000
            );

            // Registrar que ya cobró
            this.usuariosRecompensados.add(autorId);

        } catch (error) {
            console.error(
                "[BirthdayRewardService] Error procesando felicitación:",
                error
            );
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
}
