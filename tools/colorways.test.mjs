import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source = await readFile(new URL('../assets/js/colorways.js', import.meta.url), 'utf8');
function viewer({reduced = true} = {}) {
  const pending = [], animations = [];
  function element() {
    return {hidden:true,disabled:false,textContent:'',attrs:new Map(),events:{},
      addEventListener(type,fn){this.events[type]=fn;},setAttribute(k,v){this.attrs.set(k,v);},
      getAttribute(k){return this.attrs.get(k);},removeAttribute(k){this.attrs.delete(k);},
      remove(){stage.images=stage.images.filter(image=>image!==this);}};
  }
  const choices = ['black','champagne','sky-blue','cobalt-blue','dark-green','red'].map((value,index)=>({
    value,checked:index===0,dataset:{label:value,alt:`Cork V1 ${value}`}}));
  const image=Object.assign(element(),{src:'black',alt:'Cork V1 black'});
  const stage=Object.assign(element(),{images:[image],style:{setProperty(k,v){this[k]=v;}},append(image){this.images.push(image);},querySelector(){return this.images[0];}});
  const selectors=Object.fromEntries(['.finish-options','.finish-compare','.finish-original','.finish-divider','.finish-comparison','[data-finish-name]','[data-finish-number]','[data-comparison-name]','.finish-status'].map(key=>[key,element()]));
  selectors['.finish-stage']=stage;
  const compare=selectors['.finish-compare']; compare.disabled=true;compare.setAttribute('aria-pressed','false');
  selectors['[data-finish-name]'].textContent='black';
  const slider=Object.assign(element(),{value:'50'});
  selectors['.finish-comparison'].querySelector=()=>slider;
  const root={querySelector:key=>selectors[key],querySelectorAll:()=>choices};
  const motion=Object.assign(element(),{matches:reduced});
  class Image {
    constructor(){Object.assign(this,element());}
    decode(){return new Promise((resolve,reject)=>pending.push({resolve,reject,image:this}));}
    animate(){const a={cancelled:false,cancel(){this.cancelled=true;}};animations.push(a);return a;}
  }
  vm.runInNewContext(source,{document:{querySelector:()=>root},window:{matchMedia:()=>motion},Image});
  return {selectors,stage,choices,compare,slider,pending,motion,animations,
    select(index){choices.forEach((c,i)=>{c.checked=i===index;});return selectors['.finish-options'].events.change({target:choices[index]});},
    compareClick(){compare.events.click();},
    get name(){return selectors['[data-finish-name]'].textContent;},
    get status(){return selectors['.finish-status'].textContent;}};
}
test('Black is stable by default with no image requests or automatic cycling', async()=>{
  const p=viewer();assert.equal(p.name,'black');assert.equal(p.compare.disabled,true);
  await p.select(0);assert.equal(p.pending.length,0);assert.equal(p.stage.images.length,1);
});
test('rapid requests resolve to the latest color, including stale load failures',async()=>{
  const p=viewer();const first=p.select(1),second=p.select(2);
  p.pending[1].resolve();await second;p.pending[0].reject(new Error('offline'));await first;
  assert.equal(p.name,'sky-blue');assert.equal(p.stage.images.length,1);
  assert.equal(p.stage.images[0].alt,'Cork V1 sky-blue');assert.equal(p.stage.attrs.has('aria-busy'),false);
  assert.equal(p.choices[2].checked,true);assert.equal(p.compare.disabled,false);
});
test('selecting current Black cancels an outstanding request without flashing another color',async()=>{
  const p=viewer();const loading=p.select(2);await p.select(0);p.pending[0].resolve();await loading;
  assert.equal(p.name,'black');assert.equal(p.stage.images[0].src,'black');assert.equal(p.stage.images.length,1);
  assert.equal(p.compare.disabled,true);assert.equal(p.stage.attrs.has('aria-busy'),false);
});
test('failed image loading retains the previous photo and allows retry',async()=>{
  const p=viewer();const fail=p.select(5);p.pending[0].reject(new Error('offline'));await fail;
  assert.equal(p.name,'black');assert.equal(p.choices[0].checked,true);assert.match(p.status,/try again/);
  const retry=p.select(5);p.pending[1].resolve();await retry;assert.equal(p.name,'red');assert.equal(p.animations.length,0);
});
test('comparison reveals Black, preserves slider value between colors and closes on Black',async()=>{
  const p=viewer();const select=p.select(2);p.pending[0].resolve();await select;p.compareClick();
  assert.equal(p.selectors['.finish-original'].hidden,false);assert.equal(p.compare.getAttribute('aria-pressed'),'true');
  p.slider.value='75';p.slider.events.input();assert.equal(p.stage.style['--split'],'75%');assert.equal(p.slider.getAttribute('aria-valuetext'),'75% original Black');
  const other=p.select(5);p.pending[1].resolve();await other;assert.equal(p.selectors['[data-comparison-name]'].textContent,'red');assert.equal(p.stage.style['--split'],'75%');
  const black=p.select(0);p.pending[2].resolve();await black;assert.equal(p.selectors['.finish-original'].hidden,true);assert.equal(p.compare.disabled,true);
});
test('crossfade layers are cleaned up if reduced motion changes during the animation',async()=>{
  const p=viewer({reduced:false});const select=p.select(1);p.pending[0].resolve();await select;
  assert.equal(p.stage.images.length,2);assert.equal(p.stage.images[0].getAttribute('aria-hidden'),'true');
  p.motion.matches=true;p.motion.events.change();assert.equal(p.stage.images.length,1);assert.equal(p.animations[0].cancelled,true);
  const next=p.select(2);p.pending[1].resolve();await next;assert.equal(p.animations.length,1);assert.equal(p.stage.images.length,1);
});
