/**
 * adminGate.js — Cerca de rede na frente do painel administrativo.
 *
 * A senha é a última linha, não a primeira. Este módulo permite que /admin e
 * /api/admin só sejam ALCANÇÁVEIS por quem já passou por um controle externo —
 * Cloudflare Access ou uma lista de IPs — de modo que uma falha de autenticação
 * futura não fique exposta à internet inteira.
 *
 * Desligado por padrão (nenhuma das duas variáveis setada): mantém o
 * comportamento atual para quem não configurou nada, em vez de trancar o
 * painel de alguém no meio de um deploy.
 */

// Lista de IPs/CIDRs autorizados, separados por vírgula. Ex:
//   ADMIN_ALLOWED_IPS=189.10.20.30,201.50.0.0/16
const ALLOWED_IPS = (process.env.ADMIN_ALLOWED_IPS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

// Exige o header que o Cloudflare Access injeta depois de autenticar a pessoa.
// SÓ tem valor se o backend for inalcançável por fora do túnel — um header é
// trivial de forjar por quem consegue falar direto com a origem. Ver README.
const REQUIRE_CF_ACCESS = String(process.env.ADMIN_REQUIRE_CF_ACCESS || '').toLowerCase() === 'true';

export const gateAtivo = ALLOWED_IPS.length > 0 || REQUIRE_CF_ACCESS;

/** IPv4 em inteiro. Retorna null para qualquer coisa que não seja IPv4. */
function ipv4ParaInt(ip) {
  const limpo = String(ip || '').replace(/^::ffff:/, '');
  const partes = limpo.split('.');
  if (partes.length !== 4) return null;

  let n = 0;
  for (const p of partes) {
    const octeto = Number(p);
    if (!Number.isInteger(octeto) || octeto < 0 || octeto > 255) return null;
    n = (n * 256) + octeto;
  }
  return n;
}

/**
 * IP dentro da regra? Aceita IP exato ou CIDR.
 * Função pura, exportada para teste: errar aqui é abrir ou trancar o painel.
 */
export function ipCombina(ip, regra) {
  if (!ip || !regra) return false;

  // Normaliza antes de comparar: o Express entrega "::ffff:1.2.3.4" quando o
  // socket e IPv6 com IPv4 mapeado, e a comparacao crua contra "1.2.3.4"
  // barraria o admin do proprio IP que ele acabou de liberar.
  const ipLimpo = String(ip).replace(/^::ffff:/, '');
  if (regra === ipLimpo) return true;

  const [base, bitsStr] = regra.split('/');
  if (!bitsStr) return false;

  const bits = Number(bitsStr);
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;

  const ipInt = ipv4ParaInt(ip);
  const baseInt = ipv4ParaInt(base);
  if (ipInt === null || baseInt === null) return false;

  // /0 libera tudo; o deslocamento de 32 em JS seria no-op e daria falso negativo.
  if (bits === 0) return true;

  const mascara = (0xFFFFFFFF << (32 - bits)) >>> 0;
  return ((ipInt & mascara) >>> 0) === ((baseInt & mascara) >>> 0);
}

export function ipPermitido(ip) {
  return ALLOWED_IPS.some(regra => ipCombina(ip, regra));
}

/**
 * Middleware. Responde 404 (não 403) quando barra: para quem não deveria estar
 * ali, o painel simplesmente não existe — não confirma que há um /admin neste
 * domínio para varredura automatizada encontrar.
 */
export function adminNetworkGate(req, res, next) {
  if (!gateAtivo) return next();

  const ip = req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip;

  if (ALLOWED_IPS.length > 0 && ipPermitido(ip)) return next();

  if (REQUIRE_CF_ACCESS && req.headers['cf-access-authenticated-user-email']) return next();

  console.warn(`🚧 [admin-gate] acesso barrado — ip=${ip} path=${req.path}`);
  return res.status(404).json({ error: 'Not found' });
}
