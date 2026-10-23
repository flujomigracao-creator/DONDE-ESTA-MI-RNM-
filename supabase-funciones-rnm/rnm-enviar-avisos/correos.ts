// Los avisos por correo salen ahora por n8n (función rnm-correos-n8n). Este módulo queda inactivo.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

export type CtxCorreos = {
  appUrl: string; supabaseUrl: string; claveFirma: string;
  lugarDeUnidad: (u: string) => string; reales: (c: number) => string; limpio: (t: unknown, max?: number) => string;
  dormir: (ms: number) => Promise<unknown>;
};

export async function enviarCorreos(_admin: SupabaseClient, _c: CtxCorreos) {
  return { omitido: 'correos por n8n (rnm-correos-n8n)' };
}
