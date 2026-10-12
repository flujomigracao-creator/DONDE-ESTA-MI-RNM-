# ¿Dónde está mi RNM? (FLUJO Migração)

PWA para que los clientes vean el estado de su RNM en la Polícia Federal.

- `app-rnm/` — la app (HTML/JS estático, desplegada en Vercel). Login con Google vía Supabase.
- `extension-rnm-pf/` — extensión de Chrome que usa el equipo para consultar la PF (captcha Turnstile requiere navegador real).
- `supabase-funciones-rnm/` — Edge Functions de Mercado Pago (`mp-crear-suscripcion`, `mp-webhook`).

Secretos: `MP_ACCESS_TOKEN` y `MP_WEBHOOK_SECRET` viven solo como variables de entorno de Supabase; nunca en el repositorio.
