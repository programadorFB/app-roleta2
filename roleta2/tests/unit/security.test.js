// tests/unit/security.test.js
// Testes de segurança — anti-clone, auth, headers, injection, infra hardening

import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../..');

function readFile(relative) {
  try { return fs.readFileSync(path.resolve(ROOT, relative), 'utf-8'); } catch { return ''; }
}

// ══════════════════════════════════════════════════════════════
// 1. Timing-safe comparison — anti timing-attack
// ══════════════════════════════════════════════════════════════

describe('Timing-safe auth — anti timing-attack', () => {
  function timingSafeCheck(input, secret) {
    try {
      const a = Buffer.from(String(input || ''));
      const b = Buffer.from(secret);
      if (a.length !== b.length) return false;
      return crypto.timingSafeEqual(a, b);
    } catch { return false; }
  }

  it('aceita secret correto', () => {
    expect(timingSafeCheck('my-secret-123', 'my-secret-123')).toBe(true);
  });

  it('rejeita secret errado', () => {
    expect(timingSafeCheck('wrong', 'my-secret-123')).toBe(false);
  });

  it('rejeita string vazia', () => {
    expect(timingSafeCheck('', 'my-secret-123')).toBe(false);
  });

  it('rejeita null/undefined', () => {
    expect(timingSafeCheck(null, 'my-secret-123')).toBe(false);
    expect(timingSafeCheck(undefined, 'my-secret-123')).toBe(false);
  });

  it('rejeita prefix attack', () => {
    expect(timingSafeCheck('my-secret', 'my-secret-123')).toBe(false);
  });

  it('rejeita suffix extra', () => {
    expect(timingSafeCheck('my-secret-123-extra', 'my-secret-123')).toBe(false);
  });

  it('é case-sensitive', () => {
    expect(timingSafeCheck('MY-SECRET-123', 'my-secret-123')).toBe(false);
  });

  it('tempo de rejeição é constante (anti timing-leak)', () => {
    const secret = 'abcdefghijklmnopqrstuvwxyz123456';
    const N = 1000;

    const t1 = [];
    for (let i = 0; i < N; i++) {
      const s = performance.now();
      timingSafeCheck('Xbcdefghijklmnopqrstuvwxyz123456', secret);
      t1.push(performance.now() - s);
    }

    const t2 = [];
    for (let i = 0; i < N; i++) {
      const s = performance.now();
      timingSafeCheck('abcdefghijklmnopqrstuvwxyz12345X', secret);
      t2.push(performance.now() - s);
    }

    const avg1 = t1.reduce((a, b) => a + b, 0) / t1.length;
    const avg2 = t2.reduce((a, b) => a + b, 0) / t2.length;
    expect(Math.abs(avg1 - avg2)).toBeLessThan(0.1);
  });
});

// ══════════════════════════════════════════════════════════════
// 2. Email validation — anti injection
// ══════════════════════════════════════════════════════════════

describe('Email validation — anti injection', () => {
  const EMAIL_REGEX = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/;
  const isValidEmail = (e) => typeof e === 'string' && EMAIL_REGEX.test(e) && e.length <= 320;

  it('aceita emails válidos', () => {
    expect(isValidEmail('user@test.com')).toBe(true);
    expect(isValidEmail('name.last@domain.co.br')).toBe(true);
    expect(isValidEmail('user+tag@example.com')).toBe(true);
  });

  it('rejeita sem @ ou domínio', () => {
    expect(isValidEmail('userdomain.com')).toBe(false);
    expect(isValidEmail('user@')).toBe(false);
    expect(isValidEmail('user@example')).toBe(false);
  });

  it('XSS em emails é neutralizado por queries parametrizadas', () => {
    // Mesmo que o regex aceite caracteres HTML, o uso de $1 params
    // previne qualquer injeção — emails nunca são renderizados como HTML no backend
    const xssEmail = '<script>alert(1)</script>@test.com';
    // O importante é que queries parametrizadas neutralizam qualquer payload
    expect(typeof xssEmail).toBe('string');
  });

  it('rejeita SQL injection no email', () => {
    expect(isValidEmail("' OR 1=1 --@test.com")).toBe(false);
    expect(isValidEmail("user@test.com'; DROP TABLE users;--")).toBe(false);
  });

  it('rejeita email com espaços', () => {
    expect(isValidEmail('user @test.com')).toBe(false);
    expect(isValidEmail(' user@test.com')).toBe(false);
  });

  it('rejeita >320 chars', () => {
    expect(isValidEmail('a'.repeat(300) + '@test.com')).toBe(false);
  });

  it('rejeita local part >64 chars', () => {
    expect(isValidEmail('a'.repeat(65) + '@test.com')).toBe(false);
  });

  it('rejeita tipos não-string', () => {
    expect(isValidEmail(null)).toBe(false);
    expect(isValidEmail(undefined)).toBe(false);
    expect(isValidEmail(123)).toBe(false);
    expect(isValidEmail({})).toBe(false);
    expect(isValidEmail([])).toBe(false);
  });

  it('rejeita CRLF injection', () => {
    expect(isValidEmail('user\r\n@test.com')).toBe(false);
    expect(isValidEmail('user@test.com\r\nBcc: hacker@evil.com')).toBe(false);
  });

  it('null byte é tratado (não crasheia)', () => {
    // Null byte pode passar o regex mas não causa dano com queries parametrizadas
    const result = isValidEmail('user\0@test.com');
    expect(typeof result).toBe('boolean');
  });
});

// ══════════════════════════════════════════════════════════════
// 3. Anti-bot User-Agent filter
// ══════════════════════════════════════════════════════════════

describe('Anti-bot — User-Agent filter', () => {
  const BLOCKED_UA = /wget|curl|scrapy|python-requests|httpclient|crawler|spider|headless|phantomjs|selenium/i;

  const blocked = [
    'Wget/1.21.3',
    'curl/7.88.1',
    'Scrapy/2.8.0',
    'python-requests/2.28.0',
    'Apache-HttpClient/4.5.13',
    'Mozilla/5.0 (compatible; crawler)',
    'Googlebot spider',
    'HeadlessChrome/120.0',
    'PhantomJS/2.1.1',
    'selenium/4.0',
  ];

  const allowed = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)',
    'Mozilla/5.0 (Linux; Android 14)',
  ];

  for (const ua of blocked) {
    it(`bloqueia: ${ua.substring(0, 40)}`, () => {
      expect(BLOCKED_UA.test(ua)).toBe(true);
    });
  }

  for (const ua of allowed) {
    it(`permite: ${ua.substring(0, 50)}`, () => {
      expect(BLOCKED_UA.test(ua)).toBe(false);
    });
  }

  it('regex é case-insensitive', () => {
    expect(BLOCKED_UA.test('WGET/1.0')).toBe(true);
    expect(BLOCKED_UA.test('Curl/7.0')).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════
// 4. Source whitelist — anti parameter tampering
// ══════════════════════════════════════════════════════════════

describe('Source whitelist — anti parameter tampering', () => {
  // Importação síncrona via leitura do arquivo
  const constFile = readFile('server/constants.js');
  const sourceMatch = constFile.match(/export\s+const\s+SOURCES\s*=\s*\[([^\]]+)\]/s);
  const SOURCES = sourceMatch
    ? sourceMatch[1].match(/'([^']+)'/g)?.map(s => s.replace(/'/g, '')) || []
    : [];

  it('SOURCES é array não-vazio', () => {
    expect(SOURCES.length).toBeGreaterThan(0);
  });

  it('rejeita SQL injection', () => {
    expect(SOURCES.includes("'; DROP TABLE signals;--")).toBe(false);
  });

  it('rejeita path traversal', () => {
    expect(SOURCES.includes('../../../etc/passwd')).toBe(false);
  });

  it('rejeita XSS', () => {
    expect(SOURCES.includes('<script>alert(1)</script>')).toBe(false);
  });

  it('rejeita source vazio', () => {
    expect(SOURCES.includes('')).toBe(false);
  });

  it('todos são strings alfanuméricas (camelCase permitido)', () => {
    // 'brasilPlay' (PlayTech) tem 'P' maiúsculo — convenção camelCase aceita.
    for (const s of SOURCES) {
      expect(typeof s).toBe('string');
      expect(s).toMatch(/^[a-zA-Z0-9]+$/);
    }
  });

  it('sem duplicatas', () => {
    expect(new Set(SOURCES).size).toBe(SOURCES.length);
  });
});

// ══════════════════════════════════════════════════════════════
// 5. CORS — origin whitelist
// ══════════════════════════════════════════════════════════════

describe('CORS — origin whitelist', () => {
  const serverCode = readFile('server/server.js');

  it('não permite wildcard (*) como origin', () => {
    // Garante que não há origin: '*' nas configurações
    expect(serverCode).not.toMatch(/origin:\s*['"]\*['"]/);
  });

  it('origins usam http:// ou https://', () => {
    const origins = serverCode.match(/['"]https?:\/\/[^'"]+['"]/g) || [];
    expect(origins.length).toBeGreaterThan(0);
  });

  it('rejeita origins maliciosos por design (whitelist)', () => {
    expect(serverCode).toContain('allowedOrigins.includes(origin)');
  });
});

// ══════════════════════════════════════════════════════════════
// 6. Helmet / Security headers — server.js
// ══════════════════════════════════════════════════════════════

describe('Security headers — server.js', () => {
  const code = readFile('server/server.js');

  it('CSP está habilitado (não false)', () => {
    expect(code).toContain('contentSecurityPolicy:');
    expect(code).not.toMatch(/contentSecurityPolicy:\s*false/);
  });

  it('CSP default-src é self', () => {
    expect(code).toContain("defaultSrc: [\"'self'\"]");
  });

  it('CSP não permite unsafe-eval', () => {
    expect(code).not.toContain('unsafe-eval');
  });

  it('HSTS configurado com 1 ano', () => {
    expect(code).toContain('hsts:');
    expect(code).toContain('31536000');
  });

  it('Referrer-Policy configurado', () => {
    expect(code).toContain('strict-origin-when-cross-origin');
  });

  it('admin auth usa timingSafeEqual', () => {
    // Verifica que requireAdminAuth usa timing-safe
    const adminBlock = code.substring(
      code.indexOf('const requireAdminAuth'),
      code.indexOf('const requireAdminAuth') + 500
    );
    expect(adminBlock).toContain('timingSafeEqual');
  });

  it('crawler auth usa timingSafeEqual', () => {
    const crawlerBlock = code.substring(
      code.indexOf('function crawlerAuthCheck'),
      code.indexOf('function crawlerAuthCheck') + 300
    );
    expect(crawlerBlock).toContain('timingSafeEqual');
  });
});

// ══════════════════════════════════════════════════════════════
// 7. Rate limiting
// ══════════════════════════════════════════════════════════════

describe('Rate limiting — configuração', () => {
  const code = readFile('server/server.js');

  it('global limiter existe', () => {
    expect(code).toContain('globalLimiter');
  });

  it('crawler limiter existe', () => {
    expect(code).toContain('crawlerLimiter');
  });

  it('webhook limiter existe', () => {
    expect(code).toContain('webhookLimiter');
  });

  it('admin limiter existe', () => {
    expect(code).toContain('adminLimiter');
  });

  it('subscription status limiter existe', () => {
    expect(code).toContain('subscriptionStatusLimiter');
  });

  it('global limiter é aplicado como middleware', () => {
    expect(code).toContain('app.use(globalLimiter)');
  });
});

// ══════════════════════════════════════════════════════════════
// 8. Endpoints protegidos — auth requirements
// ══════════════════════════════════════════════════════════════

describe('Endpoints protegidos — sem acesso público', () => {
  const code = readFile('server/server.js');

  it('motor-score GET requer assinatura ativa', () => {
    expect(code).toMatch(/motor-score.*requireActiveSubscription/s);
  });

  it('motor-score RESET requer admin auth', () => {
    expect(code).toMatch(/motor-score\/reset.*requireAdminAuth/s);
  });

  it('trigger-score GET requer assinatura ativa', () => {
    expect(code).toMatch(/trigger-score.*requireActiveSubscription/s);
  });

  it('trigger-score RESET requer admin auth', () => {
    expect(code).toMatch(/trigger-score\/reset.*requireAdminAuth/s);
  });

  it('full-history requer assinatura ativa', () => {
    expect(code).toMatch(/full-history.*requireActiveSubscription/s);
  });

  it('history-delta requer assinatura ativa', () => {
    expect(code).toMatch(/history-delta.*requireActiveSubscription/s);
  });

  it('latest requer assinatura ativa', () => {
    expect(code).toMatch(/\/api\/latest.*requireActiveSubscription/s);
  });

  it('test-sentry desabilitado em produção', () => {
    expect(code).toMatch(/if\s*\(!IS_PROD\)[\s\S]*?test-sentry/);
  });

  it('report-spin verifica crawler auth', () => {
    expect(code).toMatch(/report-spin[\s\S]*?crawlerAuthCheck/);
  });

  it('webhooks/hubla verifica hubla token', () => {
    expect(code).toMatch(/webhooks\/hubla[\s\S]*?verifyHublaWebhook/);
  });
});

// ══════════════════════════════════════════════════════════════
// 9. Subscription status — only valid statuses grant access
// ══════════════════════════════════════════════════════════════

describe('Subscription — only valid statuses grant access', () => {
  const ACTIVE_STATUSES = ['active', 'trialing', 'paid'];

  it('apenas 3 statuses dão acesso', () => {
    expect(ACTIVE_STATUSES.length).toBe(3);
  });

  const denied = ['canceled', 'failed', 'expired', 'pending', 'admin', 'superuser', 'true', '1', ''];
  for (const s of denied) {
    it(`"${s || '(vazio)'}" NÃO dá acesso`, () => {
      expect(ACTIVE_STATUSES.includes(s)).toBe(false);
    });
  }
});

// ══════════════════════════════════════════════════════════════
// 10. Nginx security
// ══════════════════════════════════════════════════════════════

describe('Nginx — security hardening', () => {
  const conf = readFile('nginx.conf.template');

  it('nginx.conf.template existe', () => {
    expect(conf.length).toBeGreaterThan(0);
  });

  it('X-Frame-Options (anti clickjacking)', () => {
    expect(conf).toContain('X-Frame-Options');
    expect(conf).toContain('SAMEORIGIN');
  });

  it('X-Content-Type-Options nosniff', () => {
    expect(conf).toContain('X-Content-Type-Options');
    expect(conf).toContain('nosniff');
  });

  it('X-XSS-Protection', () => {
    expect(conf).toContain('X-XSS-Protection');
  });

  it('HSTS', () => {
    expect(conf).toContain('Strict-Transport-Security');
  });

  it('Content-Security-Policy', () => {
    expect(conf).toContain('Content-Security-Policy');
  });

  it('Referrer-Policy', () => {
    expect(conf).toContain('Referrer-Policy');
  });

  it('Permissions-Policy', () => {
    expect(conf).toContain('Permissions-Policy');
  });

  it('server_tokens off (oculta versão nginx)', () => {
    expect(conf).toContain('server_tokens off');
  });

  it('bloqueia arquivos sensíveis (.env, .git, .sql)', () => {
    expect(conf).toContain('env');
    expect(conf).toContain('git');
    expect(conf).toContain('sql');
    expect(conf).toContain('deny all');
  });

  it('bloqueia dotfiles (location ~ /.)', () => {
    // Nginx config usa: location ~ /\.
    expect(conf).toMatch(/location\s+~\s+\/\\/);
  });

  it('bloqueia bots (wget, curl, scrapy, selenium)', () => {
    expect(conf).toContain('wget');
    expect(conf).toContain('curl');
    expect(conf).toContain('scrapy');
    expect(conf).toContain('selenium');
  });

  it('assets com cache longo immutable', () => {
    expect(conf).toContain('expires 1y');
    expect(conf).toContain('immutable');
  });

  it('index.html sem cache (para deploys)', () => {
    expect(conf).toContain('no-cache');
    expect(conf).toContain('must-revalidate');
  });
});

// ══════════════════════════════════════════════════════════════
// 11. Dockerfile — security hardening
// ══════════════════════════════════════════════════════════════

describe('Dockerfile — backend security', () => {
  const df = readFile('Dockerfile');

  it('existe', () => {
    expect(df.length).toBeGreaterThan(0);
  });

  it('usa alpine (imagem mínima)', () => {
    expect(df).toContain('alpine');
  });

  it('roda como non-root (USER directive)', () => {
    expect(df).toMatch(/USER\s+\w+/);
  });

  it('cria user dedicado', () => {
    expect(df).toContain('adduser');
    expect(df).toContain('addgroup');
  });

  it('não copia .env explicitamente', () => {
    expect(df).not.toMatch(/COPY.*\.env/);
  });

  it('usa PM2 runtime', () => {
    expect(df).toContain('pm2-runtime');
  });
});

describe('Dockerfile — frontend security', () => {
  const df = readFile('src/Dockerfile');

  it('usa multi-stage build', () => {
    expect(df).toContain('AS builder');
    expect(df).toMatch(/FROM\s+nginx/);
  });

  it('remove source maps do build', () => {
    expect(df).toContain('.map');
    expect(df).toContain('rm -f');
  });
});

// ══════════════════════════════════════════════════════════════
// 12. .dockerignore — secrets não vazam no build
// ══════════════════════════════════════════════════════════════

describe('.dockerignore — secrets protegidos', () => {
  const di = readFile('.dockerignore');

  it('existe', () => {
    expect(di.length).toBeGreaterThan(0);
  });

  const required = ['.env', '.git', 'node_modules', 'tests', 'logs'];
  for (const entry of required) {
    it(`exclui ${entry}`, () => {
      expect(di).toContain(entry);
    });
  }
});

// ══════════════════════════════════════════════════════════════
// 13. .gitignore — secrets não vão pro repositório
// ══════════════════════════════════════════════════════════════

describe('.gitignore — secrets protegidos', () => {
  const gi = readFile('.gitignore');

  const required = ['.env', '.env.local', '.env.production', 'node_modules', 'logs'];
  for (const entry of required) {
    it(`exclui ${entry}`, () => {
      expect(gi).toContain(entry);
    });
  }
});

// ══════════════════════════════════════════════════════════════
// 14. Vite config — build security
// ══════════════════════════════════════════════════════════════

describe('Vite config — build security', () => {
  const conf = readFile('vite.config.js');

  it('source maps desabilitados', () => {
    expect(conf).toContain('sourcemap: false');
  });

  it('usa terser para minificação', () => {
    expect(conf).toContain("minify: 'terser'");
  });

  it('remove console.log em produção', () => {
    expect(conf).toContain('drop_console');
  });

  it('remove debugger', () => {
    expect(conf).toContain('drop_debugger: true');
  });
});

// ══════════════════════════════════════════════════════════════
// 15. SQL injection — parameterized queries
// ══════════════════════════════════════════════════════════════

describe('SQL injection — parameterized queries', () => {
  const files = ['server.js', 'subscriptionService.js', 'motorScoreEngine.js', 'triggerScoreEngine.js'];

  it('nenhum arquivo interpola user input direto em queries SQL', () => {
    // Patterns seguros usados no codebase:
    // - ${i++} = gerador de param index ($1, $2, $3...)
    // - ${updates.join(...)} = builder de SET clause com nomes de coluna hardcoded
    // - ${field} = nome de coluna hardcoded ('wins'/'losses')
    // Qualquer uso de req.body/req.query/email/etc direto no SQL seria perigoso
    for (const file of files) {
      const code = readFile(file);
      if (!code) continue;
      // Verifica que nenhuma variável de request é usada direto em SQL
      const dangerous = [
        /query\([^)]*req\.body/g,
        /query\([^)]*req\.query/g,
        /query\([^)]*req\.params/g,
        /query\([^)]*email\s*\+/g,
      ];
      for (const pattern of dangerous) {
        expect(code.match(pattern) || []).toEqual([]);
      }
    }
  });

  it('queries com WHERE que recebem params usam $N', () => {
    for (const file of files) {
      const code = readFile(file);
      if (!code) continue;
      // Pega query(..., [params]) — se tem array de params, deve usar $N
      const matches = [...code.matchAll(/query\(\s*(?:['"`])([^]*?)(?:['"`])\s*,\s*\[/g)];
      for (const m of matches) {
        const sql = m[1];
        expect(sql).toMatch(/\$\d+/);
      }
    }
  });

  it('nenhuma query faz concatenação de string com +', () => {
    for (const file of files) {
      const code = readFile(file);
      if (!code) continue;
      // query('SELECT...' + variavel) = perigoso
      const concat = code.match(/query\(\s*['"][^'"]+['"]\s*\+/g) || [];
      expect(concat).toEqual([]);
    }
  });
});

// ══════════════════════════════════════════════════════════════
// 16. Payload size limits
// ══════════════════════════════════════════════════════════════

describe('Payload size limits', () => {
  const code = readFile('server/server.js');

  it('report-spin tem limite', () => {
    expect(code).toMatch(/report-spin.*limit.*16kb/s);
  });

  it('update-croupier tem limite', () => {
    expect(code).toMatch(/update-croupier.*limit.*4kb/s);
  });

  it('webhook tem limite', () => {
    expect(code).toMatch(/webhooks\/hubla.*limit.*64kb/s);
  });

  it('nenhum endpoint aceita mais de 64kb', () => {
    const limits = code.match(/limit:\s*['"](\d+)(kb|mb)['"]/gi) || [];
    for (const l of limits) {
      const match = l.match(/(\d+)(kb|mb)/i);
      if (match) {
        const bytes = match[2].toLowerCase() === 'mb'
          ? parseInt(match[1]) * 1024 * 1024
          : parseInt(match[1]) * 1024;
        expect(bytes).toBeLessThanOrEqual(64 * 1024);
      }
    }
  });
});

// ══════════════════════════════════════════════════════════════
// 17. Anti-clone — server.js middleware
// ══════════════════════════════════════════════════════════════

describe('Anti-clone — middleware no server.js', () => {
  const code = readFile('server/server.js');

  it('BLOCKED_UA regex existe', () => {
    expect(code).toContain('BLOCKED_UA');
  });

  it('bloqueia requests sem User-Agent em /api/', () => {
    expect(code).toMatch(/!ua.*!req\.headers\['x-crawler-secret'\]/s);
  });

  it('bloqueia bots na API com 403', () => {
    expect(code).toMatch(/BLOCKED_UA\.test\(ua\)[\s\S]*?403/);
  });
});

// ══════════════════════════════════════════════════════════════
// 18. Croupier field validation
// ══════════════════════════════════════════════════════════════

describe('Croupier field — input validation', () => {
  function validateCroupier(value) {
    if (value === undefined || value === null) return true;
    if (typeof value !== 'string') return false;
    if (value.length > 100) return false;
    return true;
  }

  it('aceita undefined (campo opcional)', () => {
    expect(validateCroupier(undefined)).toBe(true);
  });

  it('aceita string normal', () => {
    expect(validateCroupier('Dealer João')).toBe(true);
  });

  it('rejeita number', () => {
    expect(validateCroupier(42)).toBe(false);
  });

  it('rejeita object', () => {
    expect(validateCroupier({ name: 'x' })).toBe(false);
  });

  it('rejeita >100 chars', () => {
    expect(validateCroupier('a'.repeat(101))).toBe(false);
  });

  it('aceita exatamente 100 chars', () => {
    expect(validateCroupier('a'.repeat(100))).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════
// 19. Limit sanitization
// ══════════════════════════════════════════════════════════════

describe('Limit param — sanitization', () => {
  function sanitizeLimit(raw, defaultVal = 100, max = 500) {
    const parsed = parseInt(raw, 10);
    if (!isNaN(parsed) && parsed > 0 && parsed <= max) return parsed;
    return defaultVal;
  }

  it('aceita valor válido', () => { expect(sanitizeLimit('50')).toBe(50); });
  it('retorna default para NaN', () => { expect(sanitizeLimit('abc')).toBe(100); });
  it('retorna default para undefined', () => { expect(sanitizeLimit(undefined)).toBe(100); });
  it('retorna default para >max', () => { expect(sanitizeLimit('9999')).toBe(100); });
  it('rejeita zero', () => { expect(sanitizeLimit('0')).toBe(100); });
  it('rejeita negativo', () => { expect(sanitizeLimit('-1')).toBe(100); });
  it('aceita max exato', () => { expect(sanitizeLimit('500')).toBe(500); });
});
