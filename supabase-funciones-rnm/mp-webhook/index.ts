// Recibe los avisos de Mercado Pago. No confía en lo que llega: consulta el pago a Mercado Pago, comprueba el monto
// contra lo que guardamos y recién entonces activa o renueva el plan. Cada cobro se aplica una sola vez.
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

async function mp(ruta: string, init: RequestInit = {}) {
  const token = Deno.env.get("MP_ACCESS_TOKEN");
  if (!token) throw new Error("MP_ACCESS_TOKEN no configurado");
  const res = await fetch("https://api.mercadopago.com" + ruta, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const cuerpo = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, cuerpo };
}

// Firma opcional: si hay MP_WEBHOOK_SECRET, solo aceptamos avisos firmados por Mercado Pago.
async function firmaValida(req: Request, idDato: string): Promise<boolean> {
  const secreto = Deno.env.get("MP_WEBHOOK_SECRET");
  if (!secreto) return true;
  const cabecera = req.headers.get("x-signature") ?? "";
  const ts = /ts=([^,]+)/.exec(cabecera)?.[1];
  const v1 = /v1=([a-f0-9]+)/i.exec(cabecera)?.[1];
  const requestId = req.headers.get("x-request-id") ?? "";
  if (!ts || !v1) return false;
  const id = /^[A-Za-z0-9]+$/.test(idDato) ? idDato.toLowerCase() : idDato;
  const manifiesto = `id:${id};request-id:${requestId};ts:${ts};`;
  const llave = await crypto.subtle.importKey("raw", new TextEncoder().encode(secreto), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const firma = new Uint8Array(await crypto.subtle.sign("HMAC", llave, new TextEncoder().encode(manifiesto)));
  const hex = [...firma].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (hex.length !== v1.length) return false;
  let dif = 0;
  for (let i = 0; i < hex.length; i++) dif |= hex.charCodeAt(i) ^ v1.toLowerCase().charCodeAt(i);
  return dif === 0;
}

async function cobroAutorizado(id: string): Promise<{ ok: boolean; motivo?: string }> {
  const r = await mp(`/authorized_payments/${encodeURIComponent(id)}`);
  if (r.status === 404) return { ok: true, motivo: "no_existe" }; // p. ej. el aviso de prueba de Mercado Pago (id inventado)
  if (!r.ok) throw new Error(`authorized_payments ${r.status}`);
  const ap = r.cuerpo;
  const pagoId = String(ap?.payment?.id ?? "");
  if (ap?.payment?.status !== "approved" || !pagoId) return { ok: true, motivo: "aun_no_aprobado" };

  const preapprovalId = String(ap?.preapproval_id ?? "");
  const { data: sus } = await admin.from("rnm_suscripciones_mp").select("*").eq("preapproval_id", preapprovalId).maybeSingle();
  if (!sus) { console.error("suscripcion_desconocida", preapprovalId); throw new Error("suscripcion_desconocida"); } // aún no guardada: Mercado Pago reintenta

  const monto = Math.round(Number(ap?.transaction_amount) * 100);
  if (monto !== sus.monto_centavos) {
    console.error("monto_distinto", JSON.stringify({ recibido: monto, esperado: sus.monto_centavos, preapprovalId }));
    return { ok: true, motivo: "monto_distinto" };
  }

  // Un cobro = una sola vez
  const { error: errPago } = await admin.from("rnm_pagos_mp").insert({
    payment_id: pagoId, preapproval_id: preapprovalId, user_id: sus.user_id, cupos: sus.cupos, monto_centavos: monto,
  });
  if (errPago) {
    if (errPago.code === "23505") return { ok: true, motivo: "ya_aplicado" };
    throw new Error("guardar_pago: " + errPago.message);
  }

  const { data: res, error: errPlan } = await admin.rpc("rnm_activar_plan_servicio", {
    p_user: sus.user_id, p_cupos: sus.cupos, p_ref: `mp:${pagoId}`, p_preapproval: preapprovalId,
  });
  if (errPlan) {
    await admin.from("rnm_pagos_mp").delete().eq("payment_id", pagoId); // para que el reintento de Mercado Pago lo aplique
    throw new Error("activar_plan: " + errPlan.message);
  }

  await admin.from("rnm_suscripciones_mp").update({ estado: "activa", actualizado_at: new Date().toISOString() }).eq("preapproval_id", preapprovalId);

  // Si cambió de plan, la suscripción anterior se cancela para no cobrarle dos veces.
  const anterior = res?.preapproval_anterior as string | null | undefined;
  if (anterior && anterior !== preapprovalId) {
    const c = await mp(`/preapproval/${encodeURIComponent(anterior)}`, { method: "PUT", body: JSON.stringify({ status: "cancelled" }) });
    await admin.from("rnm_suscripciones_mp").update({ estado: c.ok ? "reemplazada" : "reemplazada_pendiente_cancelar", actualizado_at: new Date().toISOString() }).eq("preapproval_id", anterior);
    if (!c.ok) console.error("no_se_pudo_cancelar_anterior", anterior, c.status);
  }
  return { ok: true };
}

async function estadoSuscripcion(id: string) {
  const r = await mp(`/preapproval/${encodeURIComponent(id)}`);
  if (r.status === 404) return; // p. ej. el aviso de prueba de Mercado Pago (id inventado)
  if (!r.ok) throw new Error(`preapproval ${r.status}`);
  const estado = String(r.cuerpo?.status ?? "");
  if (estado) await admin.from("rnm_suscripciones_mp").update({ estado, actualizado_at: new Date().toISOString() }).eq("preapproval_id", id);
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  let cuerpo: any = {};
  try { cuerpo = await req.json(); } catch { /* algunos avisos vienen solo por la dirección */ }
  const tipo = String(cuerpo?.type ?? cuerpo?.topic ?? url.searchParams.get("type") ?? url.searchParams.get("topic") ?? "");
  const id = String(cuerpo?.data?.id ?? url.searchParams.get("data.id") ?? url.searchParams.get("id") ?? "");
  if (!id) return new Response("ok");

  if (!(await firmaValida(req, String(url.searchParams.get("data.id") ?? cuerpo?.data?.id ?? id)))) {
    return new Response("firma_invalida", { status: 401 });
  }

  try {
    if (tipo === "subscription_authorized_payment") await cobroAutorizado(id);
    else if (tipo === "subscription_preapproval") await estadoSuscripcion(id);
    // Otros avisos (por ejemplo "payment") se ignoran: el cobro llega por "subscription_authorized_payment".
    return new Response("ok");
  } catch (e) {
    console.error("webhook_error", tipo, id, (e as Error).message);
    return new Response("error", { status: 500 }); // Mercado Pago reintenta
  }
});
