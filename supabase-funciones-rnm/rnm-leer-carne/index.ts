// Lee con IA de visión una foto del carné RNM (CRNM) que sube el cliente y devuelve SOLO los datos que necesita la app.
//  lado "frente" (por defecto): nombre, número de RNM, fecha de nacimiento y validez.
//  lado "verso": validez, CPF (solo si es válido) y, si aparece impreso, el número de RNM; además dice si lo que ve es de verdad el verso.
// No guarda la foto (la app la sube aparte, a un espacio privado, si el cliente la confirma).
// Requiere sesión (verify_jwt). Proveedor de IA, por orden: GROQ_API_KEY o ANTHROPIC_API_KEY (modelo MODELO_VISION).
// Modelo de Groq: qwen/qwen3.6-27b (visión). MODELO_GROQ puede cambiarlo, o ser una lista separada por comas que se prueba en orden.
// Sin ninguna clave devuelve 503 y la app deja escribir los datos a mano.
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const APP_URL = Deno.env.get('APP_URL') ?? 'https://rnm-flujo-flujo-escala.vercel.app';
const ORIGENES = [APP_URL, 'https://mirnm.com.br', 'http://localhost:5180', 'http://localhost:4173'];
const MAX_BASE64 = 3_000_000; // ~2,2 MB de imagen (Groq acepta hasta 4 MB en base64)
const MODELOS_GROQ = (Deno.env.get('MODELO_GROQ') ?? 'qwen/qwen3.6-27b').split(',').map((m) => m.trim()).filter(Boolean);

function cors(req: Request) {
  const origen = req.headers.get('origin') ?? '';
  return {
    'Access-Control-Allow-Origin': ORIGENES.includes(origen) ? origen : APP_URL,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}
const json = (req: Request, cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { ...cors(req), 'Content-Type': 'application/json' } });

const parteFecha = (t: unknown) => {
  if (typeof t !== 'string' || !/^\d{2}\/\d{2}\/\d{4}$/.test(t)) return null;
  const [d, m, a] = t.split('/').map(Number);
  const f = new Date(a, m - 1, d);
  return f.getFullYear() === a && f.getMonth() === m - 1 && f.getDate() === d ? f : null;
};
// Fecha de nacimiento verosimil: entre 1900 y hoy. Validez: entre 2000 y dentro de 25 años (descarta lecturas absurdas).
const nacimientoOk = (t: unknown) => { const f = parteFecha(t); return !!f && f.getFullYear() >= 1900 && f <= new Date(); };
const validezOk = (t: unknown) => { const f = parteFecha(t); return !!f && f.getFullYear() >= 2000 && f.getFullYear() <= new Date().getFullYear() + 25; };
// Algunos modelos devuelven "true" como texto o fechas con guiones: se aceptan.
const esSi = (v: unknown) => v === true || (typeof v === 'string' && /^(true|s[ií]|yes|sim)$/i.test(v.trim()));
const fechaDMA = (v: unknown) => {
  if (typeof v !== 'string') return null;
  const t = v.trim().replace(/[.\-]/g, '/');
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (m) return `${m[1].padStart(2, '0')}/${m[2].padStart(2, '0')}/${m[3]}`;
  const iso = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(t);
  return iso ? `${iso[3].padStart(2, '0')}/${iso[2].padStart(2, '0')}/${iso[1]}` : null;
};
// Nombre leído del frente: solo letras (con acentos), espacios, apóstrofo y guion; entre 3 y 120 caracteres; en formato «Nombre Apellido».
const nombreLimpio = (v: unknown) => {
  if (typeof v !== 'string') return null;
  const t = v.replace(/\s+/g, ' ').trim();
  if (t.length < 3 || t.length > 120 || !/^[\p{L}][\p{L} '’.\-]*$/u.test(t) || !/\s/.test(t)) return null;
  return t.toLowerCase().replace(/(^|[\s'’.\-])(\p{L})/gu, (_m, a, b) => a + b.toUpperCase());
};

// CPF con dígitos verificadores correctos (evita guardar una lectura equivocada de la IA)
function cpfValido(cpf: string): boolean {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  for (const n of [9, 10]) {
    let s = 0;
    for (let i = 0; i < n; i++) s += Number(cpf[i]) * (n + 1 - i);
    if (((s * 10) % 11) % 10 !== Number(cpf[n])) return false;
  }
  return true;
}

const COMUN = `Devuelve SOLO un JSON, sin texto extra y sin razonar en voz alta. Lee el texto impreso tal como está, dígito por dígito. Si un dato no se ve con claridad, pon null: NUNCA lo adivines ni inventes. No incluyas ningún dato personal fuera de las claves pedidas (por ejemplo, nada de la filiación). `
  + `Las etiquetas del carné están en portugués: Nome, Filiação, Nacionalidade, Data de Nascimento, Validade, RNM (Registro Nacional Migratório), CPF, Data de Expedição. `;
const INSTRUCCION_FRENTE = `Esta es una foto del FRENTE de un carné de registro migratorio brasileño (CRNM / RNM) de la Polícia Federal. ` + COMUN
  + `Claves exactas: {"es_carne": true|false, "legible": true|false, "nombre": string|null, "rnm": string|null, "fecha_nacimiento": "DD/MM/AAAA"|null, "validez": "DD/MM/AAAA"|null}. `
  + `"nombre" es el nombre completo del titular junto a la etiqueta Nome (no el de la filiación: ni el del padre ni el de la madre). `
  + `"rnm" es el número junto a la etiqueta RNM (6 a 12 letras mayúsculas y números, sin espacios; distingue 0 de O y 1 de I). `
  + `"fecha_nacimiento" es la que está junto a Data de Nascimento. "validez" es la fecha junto a Validade (no la de expedición). Si no es un carné RNM, es_carne=false.`;
const INSTRUCCION_VERSO = `Esta es una foto de un carné de registro migratorio brasileño (CRNM / RNM) de la Polícia Federal. Debes decir si es el VERSO (parte de atrás, que suele tener un código QR) o el FRENTE (que tiene la foto del titular). ` + COMUN
  + `Claves exactas: {"es_carne": true|false, "es_verso": true|false, "legible": true|false, "rnm": string|null, "validez": "DD/MM/AAAA"|null, "cpf": string|null}. `
  + `"es_carne" es true si ves un carné o tarjeta de identificación (aunque no puedas leer los datos). `
  + `"es_verso" es true SOLO si es la parte de atrás del carné (con código QR y sin la foto del titular); si ves la foto de una persona, es el frente: es_verso=false. `
  + `"cpf" son los 11 dígitos junto a la etiqueta CPF, solo números, sin puntos ni guión. "validez" es la fecha de Validade si aparece. "rnm" solo si aparece impreso.`;

// Los modelos "razonadores" (Qwen) pueden escribir su pensamiento antes de la respuesta: se descarta y se toma el último JSON.
function extraerJson(texto: string): any {
  const limpio = texto.replace(/<think>[\s\S]*?<\/think>/gi, ' ').replace(/<think>[\s\S]*$/i, ' ');
  const candidatos = limpio.match(/\{[^{}]*\}/g) ?? [];
  for (let i = candidatos.length - 1; i >= 0; i--) {
    try { const o = JSON.parse(candidatos[i]); if (o && typeof o === 'object' && 'es_carne' in o) return o; } catch { /* siguiente */ }
  }
  return {};
}

// Variantes de parámetros, de la más rápida a la más tolerante. Qwen "razona" antes de responder: lo ideal es apagarlo (reasoning_effort none),
// porque si no gasta el espacio de respuesta pensando y a veces no llega al JSON. El modo JSON con razonamiento activo falló en las pruebas
// (json_validate_failed). Se recuerda cuál funcionó para no repetir intentos fallidos en cada foto.
const VARIANTES: Record<string, unknown>[] = [
  { reasoning_effort: 'none', response_format: { type: 'json_object' } },
  { reasoning_effort: 'none' },
  { reasoning_format: 'hidden' },
  {},
];
let varianteBuena = 0;

// Devuelve el texto que contesta la IA, o lanza error.
async function leerConIA(imagen: string, mime: string, instruccion: string): Promise<string> {
  const groq = Deno.env.get('GROQ_API_KEY');
  if (groq) {
    let ultimoError = 'sin_modelo';
    for (const modelo of MODELOS_GROQ) {
      for (let k = 0; k < VARIANTES.length; k++) {
        const idx = (varianteBuena + k) % VARIANTES.length;
        const extra = VARIANTES[idx];
        const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${groq}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: modelo,
            temperature: 0,
            max_tokens: 2500, // margen por si el modelo razona antes de responder
            ...extra,
            messages: [{ role: 'user', content: [
              { type: 'text', text: instruccion },
              { type: 'image_url', image_url: { url: `data:${mime};base64,${imagen}` } },
            ] }],
          }),
        });
        const j = await r.json().catch(() => ({}));
        if (r.ok) {
          const texto = j?.choices?.[0]?.message?.content ?? '';
          // Respuesta vacía o cortada sin JSON: se prueba otra variante.
          if (!/\{[\s\S]*"es_carne"/.test(texto.replace(/<think>[\s\S]*?<\/think>/gi, ''))) { ultimoError = `groq ${modelo} sin_json (${Object.keys(extra).join('+') || 'sin_extras'})`; console.error('vision_sin_json_variante', ultimoError); continue; }
          varianteBuena = idx;
          console.log('vision_modelo_usado', modelo, Object.keys(extra).join('+') || 'sin_extras');
          return texto;
        }
        ultimoError = `groq ${modelo} ${r.status} ${JSON.stringify(j?.error ?? j).slice(0, 220)}`;
        console.error('vision_modelo_fallo', ultimoError);
        if (r.status === 401 || r.status === 403 || r.status === 429) throw new Error(ultimoError); // otra variante no ayuda
        if (r.status === 404) break; // el modelo no existe: siguiente modelo
      }
    }
    throw new Error(ultimoError);
  }
  const claude = Deno.env.get('ANTHROPIC_API_KEY');
  if (claude) {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': claude, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: Deno.env.get('MODELO_VISION') ?? 'claude-sonnet-5-5',
        max_tokens: 300,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: mime, data: imagen } },
          { type: 'text', text: instruccion },
        ] }],
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error('anthropic ' + r.status + ' ' + JSON.stringify(j?.error ?? j).slice(0, 300));
    return j?.content?.[0]?.text ?? '';
  }
  throw new Error('sin_proveedor');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== 'POST') return json(req, { error: 'metodo_no_permitido' }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: sesion, error: errSesion } = await admin.auth.getUser(token);
  if (errSesion || !sesion?.user) return json(req, { error: 'sin_sesion' }, 401);

  if (!Deno.env.get('GROQ_API_KEY') && !Deno.env.get('ANTHROPIC_API_KEY')) return json(req, { error: 'lectura_no_configurada' }, 503);

  let imagen = '', mime = 'image/jpeg', lado = 'frente';
  try {
    const c = await req.json();
    imagen = String(c.imagen ?? '').replace(/^data:[^,]+,/, '');
    mime = String(c.mime ?? 'image/jpeg');
    lado = c.lado === 'verso' ? 'verso' : 'frente';
  } catch { /* cuerpo vacío */ }
  if (!imagen || imagen.length > MAX_BASE64) return json(req, { error: 'imagen_invalida' }, 400);
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) return json(req, { error: 'imagen_invalida' }, 400);

  let texto = '';
  try { texto = await leerConIA(imagen, mime, lado === 'verso' ? INSTRUCCION_VERSO : INSTRUCCION_FRENTE); } catch (e) {
    console.error('vision_error', String((e as Error).message || e));
    return json(req, { error: 'lectura_fallo' }, 502);
  }
  const d: any = extraerJson(texto);

  const rnm = typeof d.rnm === 'string' ? d.rnm.toUpperCase().replace(/[^A-Z0-9]/g, '') : '';
  const cpf = typeof d.cpf === 'string' ? d.cpf.replace(/\D/g, '') : String(d.cpf ?? '').replace(/\D/g, '');
  const nac = fechaDMA(d.fecha_nacimiento), val = fechaDMA(d.validez);
  const salida = {
    ok: true,
    lado,
    es_carne: esSi(d.es_carne),
    es_verso: lado === 'verso' ? esSi(d.es_verso) : null,
    legible: !(d.legible === false || (typeof d.legible === 'string' && /^false|no$/i.test(d.legible.trim()))),
    nombre: lado === 'frente' ? nombreLimpio(d.nombre) : null,
    rnm: /^[A-Z0-9]{6,12}$/.test(rnm) ? rnm : null,
    fecha_nacimiento: lado === 'frente' && nacimientoOk(nac) ? nac : null,
    validez: validezOk(val) ? val : null,
    cpf: lado === 'verso' && cpfValido(cpf) ? cpf : null,
  };
  // Registro sin datos personales: solo qué campos se pudieron leer; si no se entendió la respuesta, un trozo corto para depurar.
  console.log('vision_resultado', lado, JSON.stringify({ es_carne: salida.es_carne, es_verso: salida.es_verso, legible: salida.legible, nombre: !!salida.nombre, rnm: !!salida.rnm, nac: !!salida.fecha_nacimiento, validez: !!salida.validez, cpf: !!salida.cpf }));
  if (!('es_carne' in d)) console.log('vision_sin_json', String(texto).replace(/\s+/g, ' ').slice(0, 160));
  return json(req, salida);
});
