import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface BlacklistedUser {
    id: number;
    username: string;
    display_name: string;
    banned_at: string;
    reason: string;
    moderator: string;
}

const blacklistPath = path.join(__dirname, '../blacklist_file.json');

export function getBlacklist(): BlacklistedUser[] {
    if (!fs.existsSync(blacklistPath)) return [];
    const data = fs.readFileSync(blacklistPath, 'utf-8');
    try {
        return JSON.parse(data);
    } catch (error) {
        console.error("Error al leer el archivo de blacklist:", error);
        return [];
    }
}

export function checkMemberBlacklist(memberId: string, username: string, displayName: string): BlacklistedUser | null {
    const blacklist = getBlacklist();
    const cleanUsername = username ? username.toLowerCase() : '';
    const cleanDisplayName = displayName ? displayName.toLowerCase() : '';

    for (const entry of blacklist) {
        // 1. Coincidencia estricta por ID (lo más seguro)
        if (entry.id.toString() === memberId) {
            return entry;
        }

        const entryUser = entry.username ? entry.username.toLowerCase() : '';
        const entryDisplay = entry.display_name ? entry.display_name.toLowerCase() : '';

        // 2. Coincidencia exactas en lugar de includes para evitar falsos positivos
        if (
            (cleanUsername && entryUser === cleanUsername) ||
            (cleanDisplayName && entryDisplay === cleanDisplayName)
        ) {
            return entry;
        }
    }

    return null;
}