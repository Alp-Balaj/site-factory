// One structured call to Claude through the local Claude Code login (claude.ai subscription), not an API key.
// demo.mjs (copy), theme.mjs (theme, with photos) and classify.mjs (archetype) all go through here.
// ANTHROPIC_API_KEY is stripped from the child env because the CLI prefers it over the subscription when set.
import { query } from '@anthropic-ai/claude-agent-sdk';

export const MODEL = 'claude-sonnet-4-6';

// prompt: text; images: content blocks ({ type: 'image', source: { type: 'base64', media_type, data } }); schema: JSON schema
// the answer must satisfy. Resolves with the parsed object; throws with a plain message when Claude does not answer.
export async function askJson({ prompt, images = [], schema, what = 'an answer', model = MODEL, maxTurns = 3 }) {
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  const input = images.length
    ? (async function* () { yield { type: 'user', parent_tool_use_id: null, message: { role: 'user', content: [{ type: 'text', text: prompt }, ...images] } }; })()
    : prompt;
  let out;
  for await (const msg of query({ prompt: input, options: { model, tools: [], maxTurns, env, outputFormat: { type: 'json_schema', schema } } })) {
    if (msg.type !== 'result') continue;
    if (msg.subtype !== 'success' || !msg.structured_output) {
      const detail = msg.subtype === 'success' ? msg.result : (msg.errors ? JSON.stringify(msg.errors) : '');
      throw new Error(`Claude did not return ${what} (${msg.subtype})${detail ? `: ${detail}` : ''}`);
    }
    out = msg.structured_output;
  }
  if (!out) throw new Error('No result from Claude (is Claude Code logged in? run: claude login)');
  return out;
}
