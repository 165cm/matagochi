import test from 'node:test';
import assert from 'node:assert/strict';
import { generateFromVideo } from '../src/analyzer.js';

const client = (name, fn) => ({ name, ai: () => ({ models: { generateContent: fn } }) });

test('video reads fall through to the next AI endpoint and report every failure', async () => {
  const seen = [];
  const out = await generateFromVideo({}, { videoUrl: 'https://www.youtube.com/watch?v=abcdefghijk', prompt: 'p', config: {} }, { clients: [
    client('vertex-us-central1', async () => { seen.push('a'); throw new Error('{"error":{"code":500,"status":"INTERNAL"}}'); }),
    client('vertex-global', async (req) => { seen.push('b'); assert.equal(req.contents[0].parts[0].fileData.fileUri, 'https://www.youtube.com/watch?v=abcdefghijk'); return { text: '{"ok":1}' }; })
  ] });
  assert.equal(out.via, 'vertex-global'); assert.equal(seen.join(''), 'ab'); assert.match(out.failures[0], /INTERNAL/);
  await assert.rejects(generateFromVideo({}, { videoUrl: 'x', prompt: 'p', config: {} }, { clients: [client('only', async () => { throw new Error('boom'); })] }),
    (e) => e.code === 'video_analysis_failed' && /only: boom/.test(e.detail));
});

test('the Gemini API key comes first when set', async () => {
  const env = { GEMINI_API_KEY: 'k', GOOGLE_CLOUD_PROJECT: 'p' };
  const names = [];
  await assert.rejects(generateFromVideo(env, { videoUrl: 'x', prompt: 'p', config: { httpOptions: { baseUrl: 'http://127.0.0.1:9' } } }), (e) => { names.push(...e.detail.split(' | ').map((x) => x.split(':')[0])); return true; });
  assert.deepEqual(names, ['gemini-api', 'vertex-us-central1', 'vertex-global']);
});
