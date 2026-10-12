// Crea un pago de UN mes por Pix o Boleto en Mercado Pago. A diferencia de la tarjeta, no se renueva solo:
// cuando se confirma el pago (aviso "payment" en mp-webhook) se activa o se extiende el plan por un mes.
// Requiere un usuario con sesión (verify_jwt). El precio sale siempre de la base de datos.
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

// Validación de CPF (dígitos verificadores)
function cpfValido(cpf: string): boolean {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  for (const n of [9, 10]) {
    let s = 0;
    for (let i = 0; i < n; i++) s += Number(cpf[i]) * (n + 1 - i);
    if (((s * 10) % 11) % 10 !== Number(cpf[n])) return false;
  }
  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "metodo_no_permitido" }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: sesion, error: errSesion } = await admin.auth.getUser(token);
  const user = sesion?.user;
  if (errSesion || !user || !user.email) return json(req, { error: "sin_sesion" }, 401);

  let cupos = 0, metodo = "", cpf = "";
  try {
    const c = await req.json();
    cupos = Number(c.cupos);
    metodo = String(c.metodo ?? "");
    cpf = String(c.cpf ?? "").replace(/\D/g, "");
  } catch { /* cuerpo vacío */ }
  if (!Number.isInteger(cupos) || cupos < 1 || cupos > 4) return json(req, { error: "plan_invalido" }, 400);
  if (metodo !== "pix" && metodo !== "boleto") return json(req, { error: "metodo_invalido" }, 400);
  if (!cpfValido(cpf)) return json(req, { error: "cpf_invalido" }, 400);

  const { count } = await admin.from("rnm_registros").select("id", { count: "exact", head: true }).eq("user_id", user.id);
  if (!count) return json(req, { error: "registra_un_rnm_primero" }, 400);

  const { data: centavos, error: errPrecio } = await admin.rpc("rnm_precio_plan", { p_cupos: cupos });
  if (errPrecio || !Number.isInteger(centavos)) return json(req, { error: "precio_no_disponible" }, 500);

  const mpToken = Deno.env.get("MP_ACCESS_TOKEN");
  if (!mpToken) return json(req, { error: "pago_no_configurado" }, 503);

  const { data: perfil } = await admin.from("rnm_perfiles").select("nombre, direccion, ciudad, estado, cep").eq("user_id", user.id).maybeSingle();
  const partes = String(perfil?.nombre ?? user.email.split("@")[0]).trim().split(/\s+/);
  const payer: Record<string, unknown> = {
    email: user.email,
    first_name: partes[0] || "Cliente",
    last_name: partes.slice(1).join(" ") || partes[0] || "FLUJO",
    identification: { type: "CPF", number: cpf },
  };

  const ahora = Date.now();
  const pedido: Record<string, unknown> = {
    transaction_amount: centavos / 100,
    description: `FLUJO · Plan de ${cupos} RNM (1 mes)`,
    payment_method_id: metodo === "pix" ? "pix" : "bolbradesco",
    external_reference: user.id,
    payer,
    // Pix vence en 30 minutos; el boleto en 3 días.
    date_of_expiration: new Date(ahora + (metodo === "pix" ? 30 * 60 * 1000 : 3 * 24 * 3600 * 1000)).toISOString().replace("Z", "+00:00"),
  };

  if (metodo === "boleto") {
    const cep = String(perfil?.cep ?? "").replace(/\D/g, "");
    const uf = String(perfil?.estado ?? "").toUpperCase();
    if (!/^\d{8}$/.test(cep) || !/^[A-Z]{2}$/.test(uf) || !perfil?.ciudad || !perfil?.direccion) return json(req, { error: "faltan_datos_boleto" }, 400);
    const trozos = String(perfil.direccion).split(",").map((t: string) => t.trim()).filter(Boolean);
    const numero = /\d+/.exec(String(perfil.direccion))?.[0] ?? "0";
    (payer as any).address = {
      zip_code: cep,
      street_name: (trozos[0] ?? "Rua").replace(/\d+/g, "").trim() || "Rua",
      street_number: numero,
      neighborhood: trozos[1] ?? "Centro",
      city: String(perfil.ciudad),
      federal_unit: uf,
    };
  }

  const res = await fetch("https://api.mercadopago.com/v1/payments", {
    method: "POST",
    headers: { Authorization: `Bearer ${mpToken}`, "Content-Type": "application/json", "X-Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify(pedido),
  });
  const mp = await res.json().catch(() => ({}));
  const info = mp?.point_of_interaction?.transaction_data ?? {};
  const td = mp?.transaction_details ?? {};
  const ok = res.ok && !!mp.id && (metodo === "pix" ? !!info.qr_code : !!(td.external_resource_url ?? info.ticket_url));
  if (!ok) {
    console.error("mp_payment_error", res.status, JSON.stringify({ message: mp?.message, error: mp?.error, cause: mp?.cause, status: mp?.status }));
    const texto = String(mp?.message ?? mp?.error ?? "");
    const motivo = /same user|payer.*collector/i.test(texto) ? "mismo_usuario" : /not.*enabled|not.*allowed|unauthorized|payment_method/i.test(texto) ? "metodo_no_disponible" : "otro";
    return json(req, { error: "mp_error", mp_status: res.status, motivo }, 502);
  }

  const { error: errGuardar } = await admin.from("rnm_pagos_unicos").insert({
    payment_id: String(mp.id), user_id: user.id, cupos, monto_centavos: centavos, metodo,
  });
  if (errGuardar) {
    console.error("guardar_pago_unico_error", errGuardar.message);
    return json(req, { error: "no_se_pudo_guardar" }, 500);
  }

  return json(req, {
    ok: true,
    metodo,
    payment_id: String(mp.id),
    vence: mp.date_of_expiration ?? null,
    pix: metodo === "pix" ? { copia_y_cola: info.qr_code, qr_base64: info.qr_code_base64 ?? null } : null,
    boleto: metodo === "boleto" ? { url: td.external_resource_url ?? info.ticket_url, codigo: mp?.barcode?.content ?? null } : null,
  });
});
