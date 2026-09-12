// Claude Code hook: the design skills are mandatory before touching the template's UI source.
//   record   (PostToolUse Skill, UserPromptSubmit)  remembers which skills this session has loaded
//   require  (PreToolUse Edit|Write)                 blocks edits under template/src until all REQUIRED are loaded
// Hook JSON comes on stdin (session_id, tool_name, tool_input, prompt, cwd). Wired up in .claude/settings.json.
import fs from 'node:fs';
import path from 'node:path';

export const REQUIRED = ['impeccable', 'design-taste-frontend', 'emil-design-eng'];
const PROTECTED = 'template/src';

const mode = process.argv[2];
const input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
const marker = path.join(root, '.claude', '.design-skills', `${input.session_id || 'no-session'}.txt`);

const loaded = () => (fs.existsSync(marker) ? fs.readFileSync(marker, 'utf8').split('\n').filter(Boolean) : []);
const skillName = s => String(s ?? "").trim().replace(/^\//, "").split(/\s+/)[0].split(":").pop(); // "/impeccable craft x" -> impeccable, "plugin:skill" -> skill

if (mode === 'record') {
  let name;
  if (input.hook_event_name === 'PostToolUse' && input.tool_name === 'Skill') name = skillName(input.tool_input?.skill);
  if (input.hook_event_name === 'UserPromptSubmit' && /^\s*\//.test(input.prompt ?? '')) name = skillName(input.prompt);
  if (name && !loaded().includes(name)) {
    fs.mkdirSync(path.dirname(marker), { recursive: true });
    fs.appendFileSync(marker, `${name}\n`);
  }
} else if (mode === 'require') {
  const file = input.tool_input?.file_path || input.tool_input?.notebook_path || '';
  const rel = path.relative(root, path.resolve(root, file));
  const isProtected = rel === PROTECTED || rel.startsWith(PROTECTED + path.sep);
  const missing = REQUIRED.filter(s => !loaded().includes(s));
  if (isProtected && missing.length) {
    process.stderr.write(
      `Blocked: ${rel} is template UI source. Load the design skills first (Skill tool), then retry the edit.\n` +
      `Missing this session: ${missing.join(', ')}\n`,
    );
    process.exit(2);
  }
} else {
  process.stderr.write('usage: design-skills.mjs record|require  (reads hook JSON on stdin)\n');
  process.exit(1);
}
