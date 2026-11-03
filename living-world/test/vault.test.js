import test from 'node:test';
import assert from 'node:assert/strict';
import { encryptJSON, decryptJSON, packMinds } from '../src/vault.js';
import { LLM, newProvider } from '../src/llm.js';

test('cofre: criptografa, só abre com a senha certa e não deixa a chave em texto', async () => {
  const llm = new LLM();
  llm.providers = [newProvider('groq', { key: 'gsk_SEGREDO_123' }), newProvider('gemini', { key: '' }), newProvider('ollama')];
  const payload = packMinds(llm);
  assert.equal(payload.providers.length, 2, 'sem chave (e sem keyOptional) não entra');
  const blob = await encryptJSON(payload, 'uma frase longa que so eu sei');
  const text = JSON.stringify(blob);
  assert.ok(!text.includes('gsk_SEGREDO_123') && !text.includes('groq'), 'vazou texto puro no arquivo');
  const back = await decryptJSON(JSON.parse(text), 'uma frase longa que so eu sei');
  assert.equal(back.providers[0].key, 'gsk_SEGREDO_123'); assert.equal(back.share, 15);
  await assert.rejects(() => decryptJSON(blob, 'senha errada de proposito'), /Senha errada/);
  await assert.rejects(() => encryptJSON(payload, 'curta'), /pelo menos 10/);
  const b2 = await encryptJSON(payload, 'uma frase longa que so eu sei');
  assert.notEqual(b2.data, blob.data, 'cada exportação deve usar sal e IV novos');
});
