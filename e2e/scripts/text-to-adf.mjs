// Turns a bug draft (e2e/scripts/bugs/*.txt) into the JSON that
// `acli jira workitem create --from-json` expects (description in Atlassian Document Format).
//
// Draft format: "Summary:", "Priority:", "Labels:" header lines, then a body where
// "## " starts a heading, "- " a bullet, "1. " a numbered step, and a blank line ends a paragraph.
// URLs become links.
//
// Usage: node text-to-adf.mjs <draft.txt> <projectKey>  > out.json
import { readFileSync } from 'node:fs';

const [file, projectKey] = process.argv.slice(2);
if (!file || !projectKey) {
  console.error('usage: node text-to-adf.mjs <draft.txt> <projectKey>');
  process.exit(2);
}

const lines = readFileSync(file, 'utf8').split('\n');
const header = {};
while (lines.length && /^(Summary|Priority|Labels):/.test(lines[0])) {
  const [key, ...rest] = lines.shift().split(':');
  header[key.toLowerCase()] = rest.join(':').trim();
}

function inline(text) {
  const out = [];
  let last = 0;
  for (const m of text.matchAll(/https?:\/\/\S+/g)) {
    if (m.index > last) out.push({ type: 'text', text: text.slice(last, m.index) });
    out.push({ type: 'text', text: m[0], marks: [{ type: 'link', attrs: { href: m[0] } }] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ type: 'text', text: text.slice(last) });
  return out;
}

const content = [];
let list = null; // current bulletList / orderedList node
let para = null; // current paragraph lines

const flush = () => {
  if (para) content.push({ type: 'paragraph', content: inline(para.join(' ')) });
  para = null;
  if (list) content.push(list);
  list = null;
};

for (const line of lines) {
  const item = line.match(/^(- |\d+\. )(.*)$/);
  if (!line.trim()) {
    flush();
  } else if (line.startsWith('## ')) {
    flush();
    content.push({ type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: line.slice(3) }] });
  } else if (item) {
    const type = item[1] === '- ' ? 'bulletList' : 'orderedList';
    if (para) { content.push({ type: 'paragraph', content: inline(para.join(' ')) }); para = null; }
    if (!list || list.type !== type) { if (list) content.push(list); list = { type, content: [] }; }
    list.content.push({ type: 'listItem', content: [{ type: 'paragraph', content: inline(item[2]) }] });
  } else {
    if (list) { content.push(list); list = null; }
    (para ??= []).push(line.trim());
  }
}
flush();

const workitem = {
  projectKey,
  type: 'Bug',
  summary: header.summary,
  labels: (header.labels || '').split(',').map((l) => l.trim()).filter(Boolean),
  description: { type: 'doc', version: 1, content },
};
// acli documents additionalAttributes for custom fields; priority is a system field.
// file-bugs.sh reads the priority back after creating, rather than assuming this worked.
if (header.priority) workitem.additionalAttributes = { priority: { name: header.priority } };

process.stdout.write(JSON.stringify(workitem, null, 2) + '\n');
