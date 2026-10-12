// Crea una suscripción mensual en Mercado Pago para el plan elegido (1-4 RNM).
// - Con "card_token_id" (pantalla de pago de la app): la suscripción nace autorizada y se cobra con esa tarjeta.
// - Sin él: devuelve el enlace de pago de Mercado Pago (respaldo).
// Requiere un usuario con sesión (verify_jwt). El Access Token vive solo en el secreto MP_ACCESS_TOKEN.
// Los datos de la tarjeta nunca llegan aquí: Mercado Pago los convierte en un código de un solo uso en el navegador.
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP_URL = Deno.env.get("APP_URL") ?? "https://rnm-flujo-flujo-escala.vercel.app";
const ORIGENES = [APP_URL, "http://localhost:5180"];

function cors(req: Request) {
  const origen = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ORIGENES.includes(origen) ? origen : APP_URL,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
const json = (req: Request, cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { ...cors(req), "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "metodo_no_permitido" }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  // 1) ¿Quién llama? (debe ser una persona con sesión, no solo la llave pública)
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: sesion, error: errSesion } = await admin.auth.getUser(token);
  const user = sesion?.user;
  if (errSesion || !user || !user.email) return json(req, { error: "sin_sesion" }, 401);

  // 2) Plan pedido (y, si viene, el código de la tarjeta)
  let cupos = 0;
  let cardToken = "";
  try {
    const cuerpo = await req.json();
    cupos = Number(cuerpo.cupos);
    cardToken = typeof cuerpo.card_token_id === "string" ? cuerpo.card_token_id.trim() : "";
  } catch { /* cuerpo vacío */ }
  if (!Number.isInteger(cupos) || cupos < 1 || cupos > 4) return json(req, { error: "plan_invalido" }, 400);
  if (cardToken && !/^[A-Za-z0-9_-]{8,128}$/.test(cardToken)) return json(req, { error: "tarjeta_invalida" }, 400);

  const { count } = await admin.from("rnm_registros").select("id", { count: "exact", head: true }).eq("user_id", user.id);
  if (!count) return json(req, { error: "registra_un_rnm_primero" }, 400);

  // 3) Precio oficial desde la base de datos
  const { data: centavos, error: errPrecio } = await admin.rpc("rnm_precio_plan", { p_cupos: cupos });
  if (errPrecio || !Number.isInteger(centavos)) return json(req, { error: "precio_no_disponible" }, 500);

  const mpToken = Deno.env.get("MP_ACCESS_TOKEN");
  if (!mpToken) return json(req, { error: "pago_no_configurado" }, 503);

  // 4) Suscripción mensual en Mercado Pago
  const pedido: Record<string, unknown> = {
    reason: `FLUJO · Plan de ${cupos} RNM`,
    external_reference: user.id,
    payer_email: user.email,
    back_url: APP_URL,
    status: cardToken ? "authorized" : "pending",
    auto_recurring: { frequency: 1, frequency_type: "months", transaction_amount: centavos / 100, currency_id: "BRL" },
  };
  if (cardToken) pedido.card_token_id = cardToken;

  const res = await fetch("https://api.mercadopago.com/preapproval", {
    method: "POST",
    headers: { Authorization: `Bearer ${mpToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(pedido),
  });
  const mp = await res.json().catch(() => ({}));
  const completo = cardToken ? !!mp.id && mp.status === "authorized" : !!mp.id && !!mp.init_point;
  if (!res.ok || !completo) {
    console.error("mp_preapproval_error", res.status, JSON.stringify({ message: mp?.message, error: mp?.error, cause: mp?.cause, status: mp?.status }));
    // Al navegador solo va un código; el detalle queda en el log del servidor.
    const texto = String(mp?.message ?? mp?.error ?? mp?.status ?? "");
    const motivo = /same user/i.test(texto) ? "mismo_usuario"
      : /card|token|cvv|security|fund|reject|invalid/i.test(texto) ? "tarjeta_rechazada" : "otro";
    return json(req, { error: "mp_error", mp_status: res.status, motivo }, 502);
  }

  // 5) Recordar a quién pertenece (lo usa el aviso de cobro)
  const { error: errGuardar } = await admin.from("rnm_suscripciones_mp").insert({
    preapproval_id: String(mp.id), user_id: user.id, cupos, monto_centavos: centavos, estado: cardToken ? "autorizada" : "pendiente",
  });
  if (errGuardar) {
    console.error("guardar_suscripcion_error", errGuardar.message);
    return json(req, { error: "no_se_pudo_guardar" }, 500);
  }
  return json(req, cardToken ? { ok: true, estado: mp.status } : { url: mp.init_point });
});
