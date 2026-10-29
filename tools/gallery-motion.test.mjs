import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source = await readFile(new URL('../assets/js/gallery-motion.js', import.meta.url), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));
function events(target = {}) {
  const handlers = new Map();
  target.addEventListener = (name, fn) => { if (!handlers.has(name)) handlers.set(name, []); handlers.get(name).push(fn); };
  target.emit = name => handlers.get(name)?.forEach(fn => fn());
  return target;
}
function page({reduced = false, saveData = false, reject = false, delayed = false} = {}) {
  let observe, finish;
  const label = {}, icon = {setAttribute() {}}, error = {hidden: true};
  const video = events({paused:true, dataset:{motionSrc:'/film.mp4'}, plays:0});
  video.getAttribute = () => video.src || null;
  video.removeAttribute = () => { delete video.src; };
  video.load = () => {};
  video.pause = () => { video.paused = true; video.emit('pause'); };
  video.play = () => {
    video.plays++;
    if (reject) return Promise.reject(new Error('autoplay blocked'));
    const played = () => { video.paused = false; video.emit('play'); };
    if (delayed) return new Promise(resolve => { finish = () => { played(); resolve(); }; });
    played(); return Promise.resolve();
  };
  const button = events({hidden:true,querySelector:s=>s==='[data-motion-label]'?label:icon});
  const dialog = events({open:false}), imageLink = events();
  const preference = events({matches:reduced}), connection = events({saveData});
  const document = events({hidden:false,querySelector:s=>({'.feeder-video':video,'.feeder-toggle':button,'.feeder-error':error,'.image-dialog, .film-dialog':dialog})[s],querySelectorAll:()=>[imageLink]});
  class IntersectionObserver { constructor(fn) { observe = fn; } observe() {} }
  const window = events({matchMedia:()=>preference, IntersectionObserver});
  vm.runInNewContext(source,{window,document,navigator:{connection},IntersectionObserver});
  return {video,button,label,error,dialog,imageLink,document,window,preference,connection,finish:()=>finish(),visible:value=>observe([{isIntersecting:value}])};
}
test('animation loads only on screen and pauses offscreen or behind an image or film dialog',async()=>{
  const p=page();assert.equal(p.video.src,undefined);
  p.visible(true);await flush();assert.equal(p.video.paused,false);
  p.visible(false);assert.equal(p.video.paused,true);
  p.visible(true);await flush();p.dialog.open=true;p.imageLink.emit('click');assert.equal(p.video.paused,true);
  p.dialog.open=false;p.dialog.emit('close');await flush();assert.equal(p.video.paused,false);
  p.document.hidden=true;p.document.emit('visibilitychange');assert.equal(p.video.paused,true);
});
test('reduced motion and data saving keep the poster; explicit play remains available',async()=>{
  for(const options of [{reduced:true},{saveData:true}]) {
    const p=page(options);p.visible(true);await flush();assert.equal(p.video.src,undefined);
    p.button.emit('click');await flush();assert.equal(p.video.paused,false);assert.equal(p.label.textContent,'Pause animation');
    p.preference.matches=true;p.preference.emit('change');assert.equal(p.video.paused,true);
  }
});
test('manual pause persists across scrolling and page restoration',async()=>{
  const p=page();p.visible(true);await flush();p.button.emit('click');assert.equal(p.video.paused,true);
  p.visible(false);p.visible(true);p.window.emit('pagehide');p.window.emit('pageshow');await flush();
  assert.equal(p.video.plays,1);assert.equal(p.label.textContent,'Play animation');
  p.button.emit('click');await flush();assert.equal(p.video.paused,false);
});
test('blocked autoplay is not retried while scrolling',async()=>{
  const p=page({reject:true});p.visible(true);await flush();p.visible(false);p.visible(true);await flush();
  assert.equal(p.video.plays,1);assert.equal(p.label.textContent,'Play animation');assert.equal(p.button.hidden,false);
});
test('late play completion cannot restart a hidden or manually paused animation',async()=>{
  for(const cancel of [p=>p.window.emit('pagehide'),p=>p.button.emit('click'),p=>{p.preference.matches=true;p.preference.emit('change');}]) {
    const p=page({delayed:true});p.visible(true);cancel(p);p.finish();await flush();assert.equal(p.video.paused,true);
  }
});
test('failed media retains the poster and offers the direct video fallback',async()=>{
  const p=page();p.visible(true);await flush();p.video.emit('error');p.visible(false);p.visible(true);
  assert.equal(p.error.hidden,false);assert.equal(p.button.hidden,true);assert.equal(p.video.src,undefined);assert.equal(p.video.paused,true);
});
