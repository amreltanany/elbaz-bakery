// مواعيد العمل (ساعة ٢٤). الأصناف والأسعار في products.json
const CONFIG={open:6,close:24};
const $=s=>document.querySelector(s),$$=s=>document.querySelectorAll(s),num=x=>Number(x).toLocaleString('ar-EG'),egp=x=>num(x)+' ج.م';
const store={get:k=>{try{return JSON.parse(localStorage.getItem(k))}catch(e){return null}},set:(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}};
async function api(url,body){
  let r;try{r=await fetch(url,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})}catch(e){throw Error('مفيش اتصال بالسيرفر، جرّب تاني')}
  const j=await r.json().catch(()=>({}));if(!r.ok)throw Error(j.error||'حصل خطأ، جرّب تاني');return j;
}
const STATUS={new:'اتسجّل',prep:'بيتجهز',out:'في الطريق',done:'اتسلّم'},STEPS=Object.keys(STATUS);
const dlg=$('#cart');let DELIVERY=0,P=[],byId={},cart=store.get('baz-cart')||{},me=null,STATIC=false,mode=store.get('baz-mode')==='acct'?'acct':'guest',lenis;

const ctl=id=>cart[id]
  ?`<div class="step"><button type="button" data-inc="${id}" aria-label="زوّد ${byId[id].n}">+</button><span aria-live="polite">${num(cart[id])}</span><button type="button" data-dec="${id}" aria-label="قلّل ${byId[id].n}">−</button></div>`
  :`<button type="button" class="add" data-inc="${id}">أضف للسلة</button>`;

function sync(){
  store.set('baz-cart',cart);
  const ids=Object.keys(cart),count=ids.reduce((s,i)=>s+cart[i],0),total=ids.reduce((s,i)=>s+cart[i]*byId[i].p,0);
  $$('[data-ctl]').forEach(el=>el.innerHTML=ctl(el.dataset.ctl));
  $('#hcount').textContent=num(count);$('#hcount').hidden=!count;
  $('#bar').classList.toggle('on',count>0);
  $('#barN').innerHTML=`عرض السلة <b>${num(count)}</b>`;$('#barT').textContent=egp(total);
  $('#items').innerHTML=ids.length?ids.map(i=>`<div class="li"><img src="${byId[i].img}" alt=""><div><b>${byId[i].n}</b><small>${egp(byId[i].p*cart[i])}</small></div>${ctl(i)}</div>`).join(''):'<p class="empty">السلة فاضية. اختار حاجة من المنيو.</p>';
  $('#sub').textContent=egp(total);$('#del').textContent=egp(ids.length?DELIVERY:0);$('#total').textContent=egp(total+(ids.length?DELIVERY:0));
  checkout();
}
// which checkout form shows: guest form, login form, or the saved-details form
function checkout(){
  const has=Object.keys(cart).length>0,done=!$('#done').hidden,needAuth=mode==='acct'&&!me;
  $('#checkout').hidden=!has||done;$('#cfoot').hidden=done;$('#items').hidden=done;
  $$('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.mode===mode));
  $('#auth').hidden=!needAuth;$('#ord').hidden=needAuth;
  $('#send').disabled=!has||needAuth;$('#clr').hidden=!has;
  const acct=mode==='acct'&&me,ph=$('#ord').phone;
  $('#who').hidden=!acct;if(acct)$('#whoTxt').textContent=`داخل بحساب ${me.phone}`;
  ph.readOnly=!!acct;if(acct)ph.value=me.phone;
}
function fill(){ // saved details for accounts; guests keep what they typed last time on this phone
  const f=$('#ord'),d=mode==='acct'&&me?me:store.get('baz-guest')||{};
  f.name.value=d.name||'';f.addr.value=d.address||'';f.phone.value=d.phone||'';
}
const err=m=>{$('#err').textContent=m||''};
// the cart dialog stops Lenis and only restarts it on its async 'close' event, so restart here or scrollTo is ignored
const goto=sel=>{const t=$(sel);if(lenis){lenis.start();lenis.scrollTo(t,{offset:-70,force:true})}else t.scrollIntoView()};

// navbar: transparent at top, slides away scrolling down past 40% of the viewport, returns as a white pill scrolling up
const hd=$('#hd'),burger=$('#burger');let lastY=scrollY,goingUp=false;
function setScrolled(){
  const y=scrollY,scrolled=y>innerHeight*.4;
  if(scrolled){if(y<lastY-2)goingUp=true;else if(y>lastY+2)goingUp=false}else goingUp=false;
  lastY=y;hd.classList.toggle('is-scrolled',scrolled);hd.classList.toggle('is-up',scrolled&&goingUp);
}
function menu(open){
  if(hd.classList.contains('menu-open')===open)return;
  hd.classList.toggle('menu-open',open);burger.setAttribute('aria-expanded',open);burger.setAttribute('aria-label',open?'اقفل القائمة':'افتح القائمة');
  if(lenis)open?lenis.stop():lenis.start();else document.body.style.overflow=open?'hidden':'';
}
burger.onclick=()=>menu(!hd.classList.contains('menu-open'));
$('#nav').onclick=()=>menu(false); // a link tap, or a tap on the drawer background
addEventListener('keydown',e=>{if(e.key==='Escape')menu(false)});
addEventListener('resize',()=>{if(innerWidth>860)menu(false)});
setScrolled();

document.addEventListener('click',async e=>{
  const b=e.target.closest('[data-inc],[data-dec]');
  if(b){
    const id=b.dataset.inc||b.dataset.dec,q=(cart[id]||0)+(b.dataset.inc?1:-1),host=b.closest('[data-ctl]'),inCart=!!b.closest('#cart');
    q>0?cart[id]=Math.min(q,50):delete cart[id];sync();
    if(b.dataset.inc){const bar=$('#bar');bar.classList.remove('bump');void bar.offsetWidth;bar.classList.add('bump')}
    // keep keyboard focus on the control that was just re-rendered
    const again=inCart?$(`#items [data-inc="${id}"]`):host&&host.querySelector('[data-inc]');
    (again||(inCart&&$('[data-close]')))?.focus({preventScroll:true});
    return;
  }
  const c=e.target.closest('[data-cat]');
  if(c){
    $$('.cat').forEach(x=>x.setAttribute('aria-pressed',x===c));
    const shown=[];$$('.card').forEach(el=>{el.hidden=c.dataset.cat!=='الكل'&&el.dataset.c!==c.dataset.cat;if(!el.hidden)shown.push(el)});
    if(window.gsap){gsap.fromTo(shown,{y:24,opacity:0},{y:0,opacity:1,duration:.5,stagger:.05,ease:'power3.out',overwrite:true});window.ScrollTrigger&&ScrollTrigger.refresh()}
    return;
  }
  const m=e.target.closest('[data-mode]');
  if(m){mode=m.dataset.mode;store.set('baz-mode',mode);err();fill();checkout();return}
  if(e.target.closest('#logout')){await api('/api/logout',{}).catch(()=>{});me=null;fill();checkout();return}
  if(e.target.closest('[data-track]')){dlg.close();goto('#track');track();return}
  const ag=e.target.closest('[data-again]');
  // reorder: the cart becomes that order (items no longer on the menu are dropped; prices are today's)
  if(ag){cart={};for(const s of ag.dataset.again.split(',')){const [id,q]=s.split(':');if(byId[id])cart[id]=+q}sync()}
  if(ag||e.target.closest('[data-open]')){menu(false);dlg.showModal();lenis&&lenis.stop()}
  else if(e.target.closest('[data-close]')||e.target===dlg)dlg.close();
});
dlg.addEventListener('close',()=>{lenis&&lenis.start();$('#done').hidden=true;err();checkout()});
$('#clr').onclick=()=>{cart={};sync()};

$('#auth').onsubmit=async e=>{
  e.preventDefault();const f=e.target,act=e.submitter&&e.submitter.value==='register'?'register':'login';err();
  try{me=(await api('/api/'+act,{phone:f.phone.value,password:f.password.value})).user;f.reset();fill();checkout();$('#ord').name.focus()}
  catch(x){err(x.message)}
};
$('#ord').onsubmit=async e=>{
  e.preventDefault();const f=e.target,btn=$('#send');err();
  if(STATIC){
    const ids=Object.keys(cart);if(!ids.length)return err('السلة فاضية');
    const sub=ids.reduce((s,i)=>s+cart[i]*byId[i].p,0),v=k=>f[k].value.trim();
    const msg=['طلب جديد من الموقع',...ids.map(i=>`${cart[i]} × ${byId[i].n}`),`التوصيل: ${DELIVERY} ج.م`,`الإجمالي: ${sub+DELIVERY} ج.م (الدفع عند الاستلام)`,'',`الاسم: ${v('name')}`,`الموبايل: ${v('phone')}`,`العنوان: ${v('addr')}`,v('note')?`ملاحظات: ${v('note')}`:null].filter(l=>l!==null).join('\n');
    const wa='https://wa.me/201119708154?text='+encodeURIComponent(msg);window.open(wa,'_blank');
    store.set('baz-guest',{name:v('name'),address:v('addr'),phone:v('phone')});f.note.value='';
    $('#done h3').textContent='كمّل طلبك على واتساب';
    $('#doneTxt').innerHTML=`الإجمالي ${egp(sub+DELIVERY)} شامل ${egp(DELIVERY)} توصيل. لو واتساب ما اتفتحش <a href="${wa}" target="_blank" rel="noopener">دوس هنا</a> وابعت الرسالة.`;
    $('#done').hidden=false;cart={};sync();return;
  }
  btn.disabled=true;
  try{
    const o=await api('/api/orders',{items:cart,name:f.name.value,phone:f.phone.value,address:f.addr.value,note:f.note.value});
    if(mode==='acct'&&me)me={...me,name:f.name.value.trim(),address:f.addr.value.trim()};
    else store.set('baz-guest',{name:f.name.value.trim(),address:f.addr.value.trim(),phone:o.phone});
    store.set('baz-phone',o.phone);$('#tform').phone.value=o.phone;f.note.value='';
    $('#doneTxt').textContent=`طلبك رقم ${num(o.id)} اتسجل، والإجمالي ${egp(o.total)} شامل ${egp(o.delivery)} توصيل. الدفع عند الاستلام.`;
    $('#done').hidden=false;cart={};sync();$('#done button').focus();
  }catch(x){err(x.message);btn.disabled=false}
};

async function track(){
  const f=$('#tform'),out=$('#tres');if(!f.phone.value.trim())return;
  out.innerHTML='<p class="hint">ثواني...</p>';
  try{
    const {orders}=await api('/api/track?phone='+encodeURIComponent(f.phone.value));store.set('baz-phone',f.phone.value.trim());
    // orders arrive newest first, so each group (اليوم / امبارح / الأسبوع / الشهر) is one run: print its heading when it changes
    const today=new Date().setHours(0,0,0,0),grp=t=>{const d=Math.round((today-new Date(t).setHours(0,0,0,0))/864e5);return d<=0?'اليوم':d===1?'امبارح':d<7?'الأسبوع ده':d<30?'الشهر ده':'أقدم'};
    let last;
    out.innerHTML=orders.length?orders.map(o=>{
      const at=STEPS.indexOf(o.status),when=new Date(o.created).toLocaleString('ar-EG',{dateStyle:'medium',timeStyle:'short'}),g=grp(o.created),head=g!==last?`<h3 class="grp">${g}</h3>`:'';last=g;
      return `${head}<article class="oc"><div class="oh"><b>طلب رقم ${num(o.id)}</b><small>${when}</small></div>
        <p>${o.items.map(i=>`${num(i.q)} × ${i.n}`).join('، ')}</p><b class="price">${egp(o.total)}${o.delivery?` <small>شامل ${egp(o.delivery)} توصيل</small>`:''}</b>
        ${o.status==='cancel'?'<span class="cancel">الطلب اتلغى</span>':`<ol class="steps">${STEPS.map((s,i)=>`<li class="${i<=at?'on':''}"${i===at?' aria-current="step"':''}>${STATUS[s]}</li>`).join('')}</ol>`}
        ${o.items.some(i=>byId[i.id])?`<button type="button" class="again" data-again="${o.items.map(i=>i.id+':'+i.q).join(',')}">اطلب نفس الطلب تاني</button>`:''}</article>`;
    }).join(''):'<p class="hint">مفيش طلبات على الرقم ده.</p>';
    if(window.gsap){gsap.from('#tres>*',{y:24,opacity:0,duration:.5,stagger:.06,ease:'power3.out'});window.ScrollTrigger&&ScrollTrigger.refresh()}
  }catch(x){out.innerHTML=`<p class="err">${x.message}</p>`}
}
$('#tform').onsubmit=e=>{e.preventDefault();track()};

(async()=>{
  try{[P,{user:me},{delivery:DELIVERY}]=await Promise.all([api('/api/products'),api('/api/me'),api('/api/config')])}
  catch(x){ // no server (GitHub Pages): menu from products.json, orders go out by WhatsApp
    try{P=await(await fetch('products.json')).json();STATIC=true;DELIVERY=30;me=null;mode='guest';document.documentElement.classList.add('static')}
    catch(e){$('#grid').innerHTML=`<p class="err">${x.message}</p>`;return}
  }
  byId=Object.fromEntries(P.map(p=>[p.id,p]));
  for(const k in cart)if(!byId[k]||!(cart[k]>0))delete cart[k];
  $('#grid').innerHTML=P.map(p=>`<article class="card" data-c="${p.c}"><div class="ph reveal"><img class="${p.fit||''}" src="${p.img}" alt="${p.n}" loading="lazy"></div><h3>${p.n}</h3><p>${p.d}</p><span class="price">${egp(p.p)}</span><div class="ctl" data-ctl="${p.id}"></div></article>`).join('');
  $('#cats').innerHTML=['الكل',...new Set(P.map(p=>p.c))].map((c,i)=>`<button class="cat" aria-pressed="${!i}" data-cat="${c}">${c}</button>`).join('');
  fill();sync();
  const last=store.get('baz-phone');if(last&&!STATIC){$('#tform').phone.value=last;track()}

  const h=new Date().getHours(),isOpen=h>=CONFIG.open&&h<CONFIG.close;
  $('#openTxt').textContent=isOpen?'مفتوح دلوقتي':'مقفول دلوقتي';$('#openTxt').classList.toggle('open',isOpen);
  $('#yr').textContent=new Date().getFullYear().toLocaleString('ar-EG',{useGrouping:false});

  // arrow: draws once when scrolled to. Position is cached (not IntersectionObserver) so a jump straight past it still draws it
  let arrows=[];
  const measure=()=>{arrows=[...$$('.arrow:not(.is-drawn)')].map(el=>{const r=el.getBoundingClientRect();return {el,top:r.top+scrollY+r.height/4}});drawArrows()};
  const drawArrows=()=>{if(!arrows.length)return;const y=scrollY+innerHeight;arrows=arrows.filter(a=>y>a.top?(a.el.classList.add('is-drawn'),false):true)};
  addEventListener('resize',measure);addEventListener('load',measure);measure();

  // scroll effects: always on (no reduced-motion gate); content stays visible if the CDN is blocked
  if(window.gsap&&window.ScrollTrigger&&window.Lenis){
    gsap.registerPlugin(ScrollTrigger);
    lenis=new Lenis({duration:1.1,easing:t=>Math.min(1,1.001-Math.pow(2,-10*t))});
    lenis.on('scroll',()=>{ScrollTrigger.update();drawArrows();setScrolled()}); // the one scroll handler
    gsap.ticker.add(t=>lenis.raf(t*1000));gsap.ticker.lagSmoothing(0);
    document.addEventListener('click',e=>{const a=e.target.closest('a[href^="#"]');if(!a)return;const t=a.getAttribute('href')==='#top'?0:$(a.getAttribute('href'));if(t!=null){e.preventDefault();lenis.scrollTo(t,{offset:-70})}});
    const sc={trigger:'.hero',start:'top top',end:'bottom top',scrub:true};
    // while the loading screen shows: keep scroll locked and hold the hero intro until the curtain lifts
    const loading=document.documentElement.classList.contains('loading');
    if(loading){lenis.stop();setTimeout(()=>{if(!dlg.open&&!hd.classList.contains('menu-open'))lenis.start()},3400)}
    gsap.from('.hero .wrap>*',{y:36,opacity:0,duration:.9,stagger:.09,ease:'power3.out',delay:loading?2.7:0});
    gsap.to('#hlogo',{yPercent:18,scale:.9,ease:'none',scrollTrigger:sc});
    gsap.to('#herobg',{yPercent:14,ease:'none',scrollTrigger:sc});
    gsap.to('.float.a',{yPercent:-70,rotate:-40,ease:'none',scrollTrigger:sc});
    gsap.to('.float.b',{yPercent:-110,rotate:40,ease:'none',scrollTrigger:sc});
    gsap.utils.toArray('[data-r]').forEach(el=>gsap.from(el,{y:40,opacity:0,duration:.9,ease:'power3.out',scrollTrigger:{trigger:el,start:'top 92%'}}));
    ScrollTrigger.batch('.card',{start:'top 94%',once:true,onEnter:b=>gsap.from(b,{y:48,opacity:0,duration:.8,stagger:.08,ease:'power3.out'})});
    // clip-path reveal (wipe from the top) + inner image settling from 1.3x; CSS hides .reveal only once html.gsap is set
    document.documentElement.classList.add('gsap');
    gsap.utils.toArray('.reveal').forEach(el=>{
      const st={trigger:el,start:'top 90%'};
      gsap.fromTo(el,{clipPath:'inset(0 0 100% 0)'},{clipPath:'inset(0 0 0% 0)',duration:1.3,ease:'expo.out',scrollTrigger:st});
      const im=el.querySelector('img');
      if(im)gsap.fromTo(im,{scale:1.3},{scale:1,duration:1.3,ease:'expo.out',clearProps:'transform',scrollTrigger:st});
    });
    ScrollTrigger.addEventListener('refresh',measure);
    gsap.to('footer img',{yPercent:-18,ease:'none',scrollTrigger:{trigger:'footer',start:'top bottom',end:'bottom bottom',scrub:true}});
  }else addEventListener('scroll',()=>{drawArrows();setScrolled()},{passive:true}); // CDN blocked: native scroll still drives navbar + arrow
})();
