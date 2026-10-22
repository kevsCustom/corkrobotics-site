import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const script = await readFile(new URL('../assets/js/design.js', import.meta.url), 'utf8');
function photoPage() {
  const pending = [];
  const buttons = ['carry', 'folded', 'hero'].map(name => ({
    dataset: {productView: name}, pressed: String(name === 'carry'),
    getAttribute() { return this.pressed; },
    setAttribute(key, value) { this.pressed = value; },
    closest() { return this; },
  }));
  let click;
  const controls = {hidden:true, contains:item=>buttons.includes(item), querySelectorAll:()=>buttons, addEventListener:(event, fn)=>{click=fn;}};
  const classes = new Set();
  const image = {src:'/carry.jpg', alt:'Carry', classList:{add:name=>classes.add(name), remove:name=>classes.delete(name)}};
  const source = {srcset:'/carry.webp 1024w'};
  const caption = {textContent:'Carry'};
  const attrs = new Map();
  const figure = {querySelector:selector=>({img:image, source, figcaption:caption, '.product-view-controls':controls})[selector], setAttribute:(key,value)=>attrs.set(key,value),removeAttribute:key=>attrs.delete(key)};
  const document = {querySelector:()=>figure,querySelectorAll:()=>[]};
  const preference = {matches:true,addEventListener(){}};
  class Image {
    decode() {return new Promise((resolve,reject)=>pending.push({resolve,reject}));}
  }
  vm.runInNewContext(script,{document,window:{matchMedia:()=>preference},Image,requestAnimationFrame:fn=>fn()});
  return {image,source,caption,controls,buttons,attrs,classes,pending,click:index=>click({target:buttons[index]})};
}
test('latest photograph selection wins when images finish loading out of order',async()=>{
  const p=photoPage();
  const first=p.click(1),second=p.click(2);
  p.pending[1].resolve(); await second;
  p.pending[0].resolve(); await first;
  assert.match(p.image.src,/corkbot-hero-1024.jpg$/);
  assert.match(p.source.srcset,/corkbot-hero-640.webp/);
  assert.equal(p.buttons[2].pressed,'true');
  assert.equal(p.buttons[1].pressed,'false');
  assert.equal(p.attrs.has('aria-busy'),false);
});
test('failed photograph loads keep the current image and expose a recoverable message',async()=>{
  const p=photoPage();const action=p.click(1);
  p.pending[0].reject(new Error('offline'));await action;
  assert.equal(p.image.src,'/carry.jpg');
  assert.equal(p.buttons[0].pressed,'true');
  assert.match(p.caption.textContent,/try again/);
  assert.equal(p.attrs.has('aria-busy'),false);
  const retry=p.click(1);p.pending[1].resolve();await retry;
  assert.match(p.caption.textContent,/Folded between projects/);
});
test('photo controls remain usable without motion and do not reload the current selection',async()=>{
  const p=photoPage();assert.equal(p.controls.hidden,false);
  await p.click(0);assert.equal(p.pending.length,0);
  const action=p.click(1);p.pending[0].resolve();await action;
  assert.equal(p.classes.size,0);
  assert.equal(p.buttons[1].pressed,'true');
  assert.match(p.image.alt,/folded/);
});
