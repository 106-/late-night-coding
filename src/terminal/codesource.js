// Picks a random piece of real code from well-known public GitHub repositories for Rei to type.
// GitHub's API lists one folder of a repo (60 requests/hour without a token, so the lists are cached);
// the file itself comes from raw.githubusercontent.com, which has no such limit.

// 'owner/repo:folder' — famous projects, each pointed at a folder full of its core source
// (listing one folder keeps the request small even for huge repos like linux or vscode)
export const REPOS = [
  'torvalds/linux:kernel', 'torvalds/linux:mm', 'git/git:builtin', 'redis/redis:src',
  'python/cpython:Lib', 'python/cpython:Objects', 'golang/go:src/net/http', 'rust-lang/rust:library/std/src',
  'nodejs/node:lib', 'facebook/react:packages/react-reconciler/src', 'vuejs/core:packages/runtime-core/src',
  'microsoft/vscode:src/vs/base/common', 'django/django:django/db/models', 'pallets/flask:src/flask',
  'psf/requests:src/requests', 'huggingface/transformers:src/transformers', 'pytorch/pytorch:torch/nn/modules',
  'curl/curl:lib', 'nginx/nginx:src/core', 'sqlite/sqlite:src', 'neovim/neovim:src/nvim',
  'mrdoob/three.js:src/core', 'vercel/next.js:packages/next/src/server', 'kubernetes/kubernetes:pkg/kubelet',
  'ggml-org/llama.cpp:src', 'karpathy/nanoGPT:', 'expressjs/express:lib', 'jquery/jquery:src',
  'bitcoin/bitcoin:src', 'godotengine/godot:core/math', 'ollama/ollama:server', 'denoland/deno:runtime',
  'sveltejs/svelte:packages/svelte/src/internal/client',
];

// used when the API is rate-limited: files known to exist (raw.githubusercontent only)
const KNOWN = [
  'torvalds/linux:kernel/async.c', 'torvalds/linux:kernel/acct.c', 'git/git:builtin/add.c', 'redis/redis:src/ae.c',
  'redis/redis:src/adlist.c', 'python/cpython:Objects/boolobject.c', 'golang/go:src/net/http/client.go',
  'rust-lang/rust:library/std/src/alloc.rs', 'nodejs/node:lib/assert.js', 'facebook/react:packages/react-reconciler/src/ReactFiber.js',
  'vuejs/core:packages/runtime-core/src/apiCreateApp.ts', 'microsoft/vscode:src/vs/base/common/arrays.ts',
  'django/django:django/db/models/aggregates.py', 'pallets/flask:src/flask/blueprints.py', 'nginx/nginx:src/core/ngx_buf.c',
  'sqlite/sqlite:src/attach.c', 'mrdoob/three.js:src/core/BufferGeometry.js', 'karpathy/nanoGPT:model.py',
  'expressjs/express:lib/application.js', 'jquery/jquery:src/callbacks.js', 'godotengine/godot:core/math/a_star.cpp',
  'curl/curl:lib/altsvc.c', 'ggml-org/llama.cpp:src/llama-adapter.cpp', 'ollama/ollama:server/create.go',
];

const EXT = /\.(c|cc|cpp|js|mjs|ts|py|go|rs|lua|rb|java|sh|zig)$/i;   // no headers: mostly bare declarations
const SKIP = /(^|\/)(tests?|__tests__|spec|vendor|third_party|deps|external|dist|build|node_modules|fixtures?|docs?|benchmarks?|testdata)\/|\.min\.|\.d\.ts$|(^|\/)test_|_test\.|\.test\.|\.spec\./i;

// last-resort pieces, written for this page, when GitHub is unreachable
const OFFLINE = [
  {
    source: 'rei/night-tools · penguin.c',
    text: `#include <stdio.h>
#include <time.h>

struct penguin {
    const char *name;
    int fish;
    int awake;
};

static void feed(struct penguin *p, int n)
{
    p->fish += n;
    if (p->fish > 3) {
        p->awake = 1;
    }
}

int main(void)
{
    struct penguin pen = { "pen", 0, 0 };
    struct penguin gin = { "gin", 0, 0 };

    for (int i = 0; i < 4; i++) {
        feed(&pen, 1);
        feed(&gin, i % 2);
    }
    printf("%s: %d fish\\n", pen.name, pen.fish);
    printf("%s: %d fish\\n", gin.name, gin.fish);
    return 0;
}`,
  },
  {
    source: 'rei/night-tools · shift.py',
    text: `import time


def remaining(tasks):
    return [t for t in tasks if not t.get("done")]


def work(tasks, cans=3):
    started = time.time()
    for task in tasks:
        if cans <= 0:
            print("out of fuel")
            break
        task["done"] = True
        cans -= 1
    return time.time() - started


if __name__ == "__main__":
    todo = [{"name": "fix bug"}, {"name": "fix the fix"}]
    print(work(todo), remaining(todo))`,
  },
];

const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
};

// file lists from the old whole-repo listing are no longer read
try { Object.keys(localStorage).filter(k => k.startsWith('rei-tree:')).forEach(k => localStorage.removeItem(k)); } catch { /* private mode */ }

async function listFiles(spec) {
  const key = `rei-dir:${spec}`;
  const cached = store.get(key);
  if (cached && Date.now() - cached.at < 7 * 864e5) return cached.files;
  const [repo, dir] = spec.split(':');
  const res = await fetch(`https://api.github.com/repos/${repo}/contents/${dir}`, { headers: { accept: 'application/vnd.github+json' } });
  if (!res.ok) throw new Error(`contents ${res.status}`);
  const json = await res.json();
  const files = (Array.isArray(json) ? json : [])
    .filter(e => e.type === 'file' && EXT.test(e.path) && !SKIP.test(e.path) && e.size > 1200 && e.size < 80000)
    .map(e => e.path);
  store.set(key, { at: Date.now(), files });
  return files;
}

async function fetchRaw(repo, path) {
  const res = await fetch(`https://raw.githubusercontent.com/${repo}/HEAD/${path.split('/').map(encodeURIComponent).join('/')}`);
  if (!res.ok) throw new Error(`raw ${res.status}`);
  return res.text();
}

const pickOne = a => a[Math.floor(Math.random() * a.length)];

// a random repo -> random source file -> one function-sized piece of it
export async function fetchSnippet({ maxLines = 60 } = {}) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      let repo, path;
      try {
        const spec = pickOne(REPOS);
        repo = spec.split(':')[0];
        const files = await listFiles(spec);
        if (!files.length) continue;
        path = pickOne(files);
      } catch {
        [repo, path] = pickOne(KNOWN).split(':');     // API limit: fall back to known files
      }
      const text = await fetchRaw(repo, path);
      const piece = cutPiece(text, maxLines);
      if (piece) return { source: `${repo} · ${path}`, url: `https://github.com/${repo}/blob/HEAD/${path}`, text: piece };
    } catch { /* try another file */ }
  }
  const o = pickOne(OFFLINE);
  return { source: o.source, url: null, text: o.text, offline: true };
}

// Choose a stretch that starts where a top-level definition starts and ends at a block end.
export function cutPiece(text, maxLines = 60) {
  if (/\0/.test(text)) return null;
  const lines = text.replace(/\r\n?/g, '\n').split('\n').map(l => l.replace(/\t/g, '    ').replace(/\s+$/, ''));
  if (lines.length < 8) return null;
  if (lines.filter(l => l.length > 110).length > lines.length * 0.05) return null;   // generated / minified
  const indent = l => l.match(/^ */)[0].length;
  const isStart = (l, i) => indent(l) === 0 && l.length > 3 &&
    /^(export |async |pub |static |func |fn |def |class |function |local function |local |int |void |char |bool |size_t |const |let |var |struct |impl |type |module\.exports|[A-Za-z_][\w:<>* ]*\s+\**[A-Za-z_]\w*\s*\()/.test(l) &&
    !/^\s*(\/\/|#|\*|--|\/\*)/.test(l) && !(i > 0 && /\\$/.test(lines[i - 1]));
  const starts = [];
  lines.forEach((l, i) => { if (isStart(l, i)) starts.push(i); });
  // include a doc comment / decorator directly above the start
  const lead = i => { while (i > 0 && lines[i - 1].trim() && indent(lines[i - 1]) === 0 && /^(\/\/|#|\/\*|\s*\*|--|@)/.test(lines[i - 1].trimStart())) i--; return i; };
  // prefer definitions with a body (not one-line declarations)
  const withBody = starts.filter(i => lines.slice(i + 1, i + 4).some(l => l.trim() && (indent(l) > 0 || /^[{(]/.test(l.trim()))));
  let from;
  if (starts.length) from = lead(pickOne(withBody.length ? withBody : starts));
  else {
    from = 0;
    while (from < lines.length && (!lines[from].trim() || /^(\/\/|#|\/?\*|--)/.test(lines[from].trim()))) from++;   // skip a licence header
  }
  // end: the last top-level block end (or definition boundary) that fits
  let end = Math.min(lines.length, from + maxLines);
  let best = -1;
  for (let i = from + 4; i < end; i++) {
    const t = lines[i].trim();
    const closes = indent(lines[i]) === 0 && /^([}\])]+[;,)]*|end[;,)]*|\};?)$/.test(t);
    const nextStart = starts.includes(i + 1) || (i + 1 < lines.length && !lines[i + 1].trim() && starts.includes(i + 2));
    if (closes || (nextStart && t)) best = i;
  }
  if (best > from) end = best + 1;
  const out = lines.slice(from, end);
  while (out.length && !out[out.length - 1].trim()) out.pop();
  // collapse runs of blank lines
  const tidy = out.filter((l, i) => l.trim() || (out[i - 1] ?? 'x').trim());
  return tidy.length >= 5 ? tidy.join('\n') : null;
}
