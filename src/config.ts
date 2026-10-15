/**
 * Configuração estática do app (valores definidos em tempo de build via .env).
 */

/** Link fixo da pasta do Drive da República. Só muda com novo deploy (RN12). */
export const DRIVE_URL: string | undefined = import.meta.env.VITE_DRIVE_URL || undefined;

/**
 * Link PROVISÓRIO da última ata. Na Fase 1 será substituído pela consulta
 * à tabela `atas_reuniao` (maior `data_reuniao`).
 */
export const ULTIMA_ATA_URL: string | undefined = import.meta.env.VITE_ATA_URL || undefined;
