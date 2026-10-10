'use strict';
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const ts = require('typescript');
const { webpack } = require('next/dist/compiled/webpack/webpack');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '../..'); const directory = path.join(ROOT, '.local/pilot-author');
const lessons = id => JSON.parse(fs.readFileSync(path.join(directory, 'courses/' + id + '.json'))).modules.flatMap(m => m.lessons);
const output = path.join(directory, 'evidence/react-typescript-fixture'); fs.mkdirSync(output, { recursive: true });
const report = { at: new Date().toISOString(), checks: [], humanReview: 'PENDING' };
function checkTypes(files) {
  const paths = [];
  for (const [name, text] of Object.entries(files)) { const file = path.join(output, name); fs.writeFileSync(file, text); paths.push(file); }
  const program = ts.createProgram(paths, { strict: true, noEmit: true, target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, skipLibCheck: true, types: [], lib: ['lib.es2020.d.ts'] });
  return ts.getPreEmitDiagnostics(program);
}
(async () => {
  const extra = ["if(count!==4||title!=='Оқу')throw Error('bad');", "if(total([2,3])!==5||total([])!==0)throw Error('bad');", "if(label(' Оқу ')!=='Оқу'||label(5)!=='Белгісіз')throw Error('bad');",
    "if(greet('Айша')!=='Сәлем, Айша')throw Error('bad');", "if(task.title!=='Оқу'||task.note!==undefined)throw Error('bad');", "if(show({status:'ok',data:3})!=='3'||show({status:'error',message:'Қате'})!=='Қате')throw Error('bad');",
    "if(first([])!==undefined||n!==3)throw Error('bad');", '', "if(double(0)!==0)throw Error('bad');"];
  for (const [i, lesson] of lessons('C08').entries()) {
    const code = lesson.example.code;
    if (i === 7) {
      const parts = code.split('// count.ts');
      assert.equal(checkTypes({ 'model.ts': parts[0].replace('// model.ts', ''), 'count.ts': parts[1] }).length, 0);
      const runtime = ts.transpileModule(parts[1].replace('import type {Task} from "./model";', 'type Task={id:string;done:boolean};') + ';if(countDone([{id:"a",done:true},{id:"b",done:false}])!==1)throw Error("bad");', { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
      vm.runInNewContext(runtime, { exports: {} }, { timeout: 1000 });
    } else {
      assert.equal(checkTypes({ 'example.ts': code + '\n' + extra[i] }).length, 0, lesson.authoringId + ' strict diagnostics');
      vm.runInNewContext(ts.transpileModule(code + '\n' + extra[i], { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText, {}, { timeout: 1000 });
    }
    report.checks.push({ lesson: lesson.authoringId, result: 'PASS', environment: 'TypeScript ' + ts.version + ' strict program + isolated runtime assertions' });
  }
  assert.ok(checkTypes({ 'negative.ts': 'let count:number=3;count="төрт";' }).some(d => d.code === 2322));
  assert.ok(checkTypes({ 'negative.ts': 'const a:readonly number[]=[];a.push(1);' }).some(d => d.code === 2339));
  const examples = lessons('C07').map(l => l.example.code);
  const components = [
    examples[0] + '\nconst L1=Welcome;', examples[1] + '\nconst L2=()=> <Book title="Талдау" pages={120}/>;',
    examples[2] + '\nconst L3=({items=[]})=> <Books items={items}/>;', examples[3] + '\nconst L4=Counter;',
    'function L5(){const[n,setN]=useState(0);' + examples[4] + 'return <button onClick={addTwo}>{n}</button>}',
    'function L6(){const[tasks,setTasks]=useState([{id:"a",done:true},{id:"b",done:false}]);const removedId="a";function remove(){' + examples[5].split('\n')[0] + '}' + examples[5].split('\n')[1] + 'return <button onClick={remove}>{tasks.length}:{completed}</button>}',
    'function L7(){' + examples[6].split('\n')[0] + 'return <>' + examples[6].split('\n').slice(1).join('\n') + '</>}',
    'function L8(){' + examples[7] + 'return <p>Resize fixture</p>}',
    'function L9({status="loading",items=[],retry=()=>{}}){' + examples[8] + 'return <p>Дерек бар</p>}',
    'function TaskForm({onAdd}){return <button onClick={()=>onAdd({id:"a",title:"Оқу",done:false})}>Қосу</button>}function TaskList({items,onToggle}){return <ul>{items.map(t=><li key={t.id}><button onClick={()=>onToggle(t.id)}>{t.title}:{String(t.done)}</button></li>)}</ul>}function L10(){const[visibleTasks,setTasks]=useState([]);const addTask=t=>setTasks(old=>[...old,t]);const toggleTask=id=>setTasks(old=>old.map(t=>t.id===id?{...t,done:!t.done}:t));return <>' + examples[9] + '</>}',
    'function L11(){const tasks=[{id:"a",done:false}];const[message,setMessage]=useState("");function save(){' + examples[10] + '}return <><button onClick={save}>Сақтау</button><p role="status">{message}</p></>}',
  ];
  const source = 'import React,{useState,useEffect} from "react";import{createRoot}from"react-dom/client";\n' + components.join('\n') +
    '\nlet root;const components=[' + components.map((_, i) => 'L' + (i + 1)).join(',') + '];window.mount=(id,props={})=>{if(root)root.unmount();root=createRoot(document.getElementById("root"));root.render(React.createElement(components[id-1],props))};window.unmount=()=>{root.unmount();root=null};';
  const entry = path.join(output, 'entry.js'); fs.writeFileSync(entry, ts.transpileModule(source, { fileName: 'entry.tsx', compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.React } }).outputText);
  await new Promise((resolve, reject) => webpack({ mode: 'development', devtool: false, entry, output: { path: output, filename: 'bundle.js' }, resolve: { modules: [path.join(ROOT, 'frontend/node_modules')] } }, (error, stats) => error ? reject(error) : stats.hasErrors() ? reject(new Error(stats.toString({ all: false, errors: true }))) : resolve()));
  const server = http.createServer((req, res) => { res.setHeader('Content-Type', req.url === '/bundle.js' ? 'application/javascript' : 'text/html; charset=utf-8'); res.end(req.url === '/bundle.js' ? fs.readFileSync(path.join(output, 'bundle.js')) : '<html lang="kk"><main id="root"></main><script src="/bundle.js"></script></html>'); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  try {
    await page.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
    for (let n = 1; n <= 11; n++) {
      await page.goto(origin); await page.evaluate(n => window.mount(n), n);
      if (n === 1) await page.getByRole('heading', { name: 'Оқу клубы' }).waitFor();
      if (n === 2) await page.getByText('Талдау: 120 бет').waitFor();
      if (n === 3) { await page.getByText('Кітап жоқ').waitFor(); await page.evaluate(() => window.mount(3, { items: [{ id: 'a', title: 'Бір' }, { id: 'b', title: 'Екі' }] })); await page.getByText('Екі', { exact: true }).waitFor(); assert.equal(await page.locator('li').count(), 2); }
      if (n === 4) { await page.locator('button').click(); await page.getByRole('button', { name: '1', exact: true }).waitFor(); }
      if (n === 5) { await page.locator('button').click(); await page.getByRole('button', { name: '2', exact: true }).waitFor(); }
      if (n === 6) { await page.getByRole('button', { name: '2:1' }).click(); await page.getByRole('button', { name: '1:0' }).waitFor(); }
      if (n === 7) { await page.getByLabel('Атау', { exact: true }).fill('Оқу'); assert.equal(await page.locator('input').inputValue(), 'Оқу'); }
      if (n === 8) { await page.getByText('Resize fixture').waitFor(); const logs = []; const listener = message => { if (/^\d+$/.test(message.text())) logs.push(message.text()); }; page.on('console', listener); await page.evaluate(() => window.dispatchEvent(new Event('resize'))); await page.waitForTimeout(50); assert.equal(logs.length, 1); await page.evaluate(() => window.unmount()); await page.evaluate(() => window.dispatchEvent(new Event('resize'))); await page.waitForTimeout(50); assert.equal(logs.length, 1); page.off('console', listener); }
      if (n === 9) { await page.getByText('Жүктелуде…').waitFor(); await page.evaluate(() => window.mount(9, { status: 'error' })); await page.getByRole('button', { name: 'Қайта көру' }).waitFor(); await page.evaluate(() => window.mount(9, { status: 'success', items: [] })); await page.getByText('Әлі жазба жоқ').waitFor(); }
      if (n === 10) { await page.getByRole('button', { name: 'Қосу' }).click(); await page.getByRole('button', { name: 'Оқу:false' }).click(); await page.getByRole('button', { name: 'Оқу:true' }).waitFor(); }
      if (n === 11) { await page.getByRole('button', { name: 'Сақтау' }).click(); assert.ok(await page.evaluate(() => localStorage.getItem('study-tasks'))); await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException('Quota fixture', 'QuotaExceededError'); }; }); await page.getByRole('button', { name: 'Сақтау' }).click(); await page.getByRole('status').filter({ hasText: 'Сақтау қолжетімсіз' }).waitFor(); }
      report.checks.push({ lesson: 'C07-L' + String(n).padStart(2, '0'), result: 'PASS', environment: 'Actual React19 Chrome render/interaction with explicit teaching dependency wrappers' });
    }
    report.checks.push({ lesson: 'C07-L12', result: 'HUMAN_REVIEW_PENDING', scope: 'Independent app acceptance protocol requires review of learner project; no invented project grade' });
    fs.writeFileSync(path.join(directory, 'evidence/react-typescript-examples.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ typescriptExamples: 9, negativeCompilerCases: 2, reactRenderedExamples: 11, projectProtocol: 'HUMAN_REVIEW_PENDING' }));
  } finally { await browser.close(); await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
