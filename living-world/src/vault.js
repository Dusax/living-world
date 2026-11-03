// Cofre: criptografa as mentes (chaves de API) com uma senha, para guardar o arquivo no GitHub sem expor nada.
// AES-256-GCM com chave derivada por PBKDF2-SHA256 (600 mil iterações). A senha nunca é gravada em lugar nenhum.
const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = (buf) => { let s = ''; for (const b of new Uint8Array(buf)) s += String.fromCharCode(b); return btoa(s); };
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export const VAULT_ITERATIONS = 600000;

async function deriveKey(pass, salt, iter) {
  const base = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function encryptJSON(obj, pass) {
  if (!pass || pass.length < 10) throw new Error('Use uma senha de pelo menos 10 caracteres. O ideal é uma frase longa que só você conheça.');
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(pass, salt, VAULT_ITERATIONS);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj)));
  return { v: 1, kdf: 'PBKDF2-SHA256', iter: VAULT_ITERATIONS, salt: b64(salt), iv: b64(iv), data: b64(ct) };
}

export async function decryptJSON(blob, pass) {
  if (!blob || blob.v !== 1 || !blob.data) throw new Error('Arquivo de mentes inválido.');
  try {
    const key = await deriveKey(pass, unb64(blob.salt), Math.min(blob.iter || VAULT_ITERATIONS, 2000000));
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(blob.iv) }, key, unb64(blob.data));
    return JSON.parse(dec.decode(pt));
  } catch { throw new Error('Senha errada ou arquivo corrompido.'); }
}

// Só provedores com chave (ou que dispensam chave) entram no cofre.
export function packMinds(llm) {
  return { share: llm.share, providers: llm.providers.filter((p) => p.key || p.keyOptional).map((p) => ({ preset: p.preset, label: p.label, kind: p.kind, baseUrl: p.baseUrl, key: p.key, model: p.model, rpm: p.rpm, rpd: p.rpd, keyOptional: !!p.keyOptional, enabled: p.enabled })) };
}
