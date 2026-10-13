import type { PluginPackage } from '@tuxos/sdk';

export interface CatalogPlugin { package: PluginPackage; category: string; tagline: string; accent: string; }

const document = (title: string, content: string, script = '') => `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title><style>
*{box-sizing:border-box}body{margin:0;padding:28px;background:#101723;color:#edf2f7;font:15px system-ui,sans-serif}h1{font-size:25px;letter-spacing:-.6px;margin:0 0 8px}p{color:#a6b5c8;line-height:1.6}button,input,textarea{font:inherit}button{border:1px solid #40536c;border-radius:8px;background:#24364f;color:#fff;padding:10px 16px;cursor:pointer}button:focus-visible,input:focus-visible,textarea:focus-visible{outline:3px solid #79c8ff;outline-offset:3px}button:hover{background:#314765}textarea{display:block;width:100%;min-height:220px;background:#192334;color:#edf2f7;border:1px solid #40536c;border-radius:10px;padding:16px;resize:vertical;line-height:1.7}small{display:block;color:#a6b5c8;margin-top:14px}.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.badge{color:#81d8ac;font-size:12px;text-transform:uppercase;letter-spacing:2px;margin-bottom:16px}.big{font-size:clamp(48px,14vw,88px);font-variant-numeric:tabular-nums;letter-spacing:-4px;margin:32px 0}.panel{padding:20px;border:1px solid #33455c;border-radius:12px;margin-top:20px}label{display:inline-flex;align-items:center;gap:8px;margin:8px 12px 8px 0}input[type=checkbox]{width:19px;height:19px;accent-color:#81d8ac}code{font-family:ui-monospace,monospace;color:#81d8ac}
</style></head><body>${content}${script ? `<script>${script}</script>` : ''}</body></html>`;

function pkg(id: string, appId: string, name: string, description: string, icon: string, html: string, capabilities: string[] = []): PluginPackage {
  return { format: 'tuxos-plugin', formatVersion: 1, manifest: { id, name, description, author: 'TuxOS', version: '1.0.0', capabilities,
    contributes: { apps: [{ id: appId, title: name, icon, category: 'Utilities', defaultGeometry: { width: 560, height: 480 } }] } }, html };
}

export const PLUGIN_CATALOG: readonly CatalogPlugin[] = [
  { category: 'Productivity', tagline: 'A little space for your next big idea.', accent: 'mint', package: pkg('tuxos-notes', 'quick-notes', 'Quick Notes', 'Keep a scratchpad beside your terminal. Your notes stay with your saved TuxOS system.', '📝',
    document('Quick Notes', '<div class="badge">Your desktop scratchpad</div><h1>Quick Notes</h1><p>Commands to remember. Ideas to come back to.</p><textarea aria-label="Your notes" placeholder="Start writing…" disabled></textarea><small role="status">Opening your notes…</small>', `
const area=document.querySelector('textarea'),status=document.querySelector('[role=status]');let timer,queue=Promise.resolve();
(async()=>{try{await tuxos.ready;try{area.value=await tuxos.storage.read('notes.txt')}catch(error){if(error.code!=='ENOENT')throw error}area.disabled=false;status.textContent='Ready. Notes save automatically.'}catch(error){status.textContent=error.message}})();
area.addEventListener('input',()=>{clearTimeout(timer);status.textContent='Unsaved changes…';timer=setTimeout(()=>{const text=area.value;queue=queue.catch(()=>{}).then(()=>tuxos.storage.write('notes.txt',text)).then(()=>{status.textContent='Saved in TuxOS.'}).catch(error=>{status.textContent='Could not save: '+error.message})},250)});
`), ['fs:read', 'fs:write']) },
  { category: 'Productivity', tagline: 'One task. A clear head. Twenty-five minutes.', accent: 'peach', package: pkg('tuxos-focus', 'focus-timer', 'Focus Timer', 'A simple 25-minute focus timer with start, pause and reset. No permissions needed.', '⏱',
    document('Focus Timer', '<div class="badge">Make room for focus</div><h1>One thing at a time.</h1><p>Pick a task, settle in, and give it your attention.</p><div class="big" role="timer" aria-label="Time remaining">25:00</div><div class="row"><button id="toggle">Start focus</button><button id="reset">Reset</button></div><small role="status">Ready when you are.</small>', `
let remaining=25*60*1000,until=null;const face=document.querySelector('[role=timer]'),toggle=document.getElementById('toggle'),status=document.querySelector('[role=status]');
function draw(){let left=until===null?remaining:Math.max(0,until-Date.now());const seconds=Math.ceil(left/1000);face.textContent=String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');if(until!==null&&left===0){until=null;remaining=0;toggle.textContent='Start again';status.textContent='Session complete. Take a short break.'}}
toggle.onclick=()=>{if(until!==null){remaining=Math.max(0,until-Date.now());until=null;toggle.textContent='Resume';status.textContent='Paused.'}else{if(!remaining)remaining=25*60*1000;until=Date.now()+remaining;toggle.textContent='Pause';status.textContent='Focus session in progress.'}draw()};
document.getElementById('reset').onclick=()=>{remaining=25*60*1000;until=null;toggle.textContent='Start focus';status.textContent='Ready when you are.';draw()};setInterval(draw,250);
`)) },
  { category: 'Learning', tagline: 'Turn permission bits into understanding.', accent: 'lavender', package: pkg('tuxos-permissions', 'permission-lab', 'Permission Explorer', 'Toggle read, write and execute permissions and see their octal and symbolic forms instantly.', '🔐',
    document('Permission Explorer', '<div class="badge">Learn by changing things</div><h1>Permission Explorer</h1><p>Each permission is a bit. Switch them on to see how chmod works.</p><div id="controls" class="panel"></div><div class="panel"><code id="symbolic"></code><h2 id="octal"></h2><code id="command"></code></div>', `
const controls=document.getElementById('controls');['Owner','Group','Others'].forEach((who,row)=>{const line=document.createElement('div'),title=document.createElement('strong');title.textContent=who+' ';line.append(title);['Read','Write','Execute'].forEach((name,col)=>{const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.value=String(1<<(8-row*3-col));input.setAttribute('aria-label',who+' '+name);input.checked=(420&Number(input.value))!==0;label.append(input,document.createTextNode(name));line.append(label)});controls.append(line)});
function update(){const mode=[...controls.querySelectorAll('input')].reduce((sum,input)=>sum+(input.checked?Number(input.value):0),0),octal=mode.toString(8).padStart(3,'0');document.getElementById('symbolic').textContent=[...controls.querySelectorAll('input')].map((input,i)=>input.checked?'rwx'[i%3]:'-').join('');document.getElementById('octal').textContent=octal;document.getElementById('command').textContent='chmod '+octal+' file'}controls.addEventListener('change',update);update();
`)) },
];

export const STARTER_PLUGIN: PluginPackage = pkg('my-plugin', 'my-plugin-app', 'My Plugin', 'A desktop app I made for TuxOS.', '🧩',
  document('My Plugin', '<div class="badge">Made by you</div><h1>Hello, TuxOS!</h1><p>Edit this HTML, change the manifest ID and name, then import your package in Plugins.</p>'));
