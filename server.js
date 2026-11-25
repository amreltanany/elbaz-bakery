// مخبز الباز: سيرفر الطلبات. تشغيل: node server.js  (بدون أي مكتبات خارجية، Node 22+)
process.removeAllListeners('warning'); // node:sqlite experimental notice
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const {DatabaseSync}=require('node:sqlite');

const ROOT=__dirname,cfgPath=path.join(ROOT,'config.json');
let cfg;
try{cfg=JSON.parse(fs.readFileSync(cfgPath,'utf8'))}
catch{cfg={port:4173,ntfyTopic:'elbaz-'+crypto.randomBytes(8).toString('hex'),adminKey:crypto.randomBytes(9).toString('base64url')};fs.writeFileSync(cfgPath,JSON.stringify(cfg,null,2))}
const PORT=+(process.env.PORT||cfg.port),NTFY=process.env.NTFY_TOPIC??cfg.ntfyTopic,ADMIN=process.env.ADMIN_KEY||cfg.adminKey;
const DBFILE=process.env.DB||path.join(ROOT,'data','elbaz.db');
if(DBFILE!==':memory:')fs.mkdirSync(path.dirname(DBFILE),{recursive:true});

const PRODUCTS=JSON.parse(fs.readFileSync(path.join(ROOT,'products.json'),'utf8')),byId=Object.fromEntries(PRODUCTS.map(p=>[p.id,p]));
const DELIVERY=Number.isFinite(cfg.delivery)?cfg.delivery:30; // رسوم التوصيل بالجنيه؛ غيّرها بإضافة "delivery" في config.json
const STATUS=['new','prep','out','done','cancel'];

const db=new DatabaseSync(DBFILE);
db.exec(`
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,phone TEXT UNIQUE NOT NULL,pass TEXT NOT NULL,name TEXT DEFAULT '',address TEXT DEFAULT '');
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id INTEGER NOT NULL,created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS orders(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,name TEXT NOT NULL,phone TEXT NOT NULL,address TEXT NOT NULL,note TEXT DEFAULT '',items TEXT NOT NULL,total INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'new',created INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS orders_phone ON orders(phone);`);
try{db.exec('ALTER TABLE orders ADD COLUMN delivery INTEGER NOT NULL DEFAULT 0')}catch{} // databases created before delivery fees existed

// ---- helpers
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const hashPass=(p,salt=crypto.randomBytes(16).toString('hex'))=>salt+':'+crypto.scryptSync(p,salt,32).toString('hex');
const checkPass=(p,stored)=>{const [salt]=stored.split(':');return crypto.timingSafeEqual(Buffer.from(hashPass(p,salt)),Buffer.from(stored))};
const safeEq=(a,b)=>{const x=Buffer.from(sha(String(a))),y=Buffer.from(sha(String(b)));return crypto.timingSafeEqual(x,y)};
// 01xxxxxxxxx; accepts Arabic digits, spaces and a +20 prefix
function normPhone(v){
  let s=String(v??'').replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/\D/g,'');
  if(s.startsWith('0020'))s=s.slice(3);else if(s.startsWith('20')&&s.length===12)s='0'+s.slice(2);
  return /^01[0125]\d{8}$/.test(s)?s:null;
}
const str=(v,min,max)=>{const s=String(v??'').trim();return s.length>=min&&s.length<=max?s:null};
class Bad extends Error{constructor(msg,code=400){super(msg);this.code=code}}

// ponytail: in-memory per-IP limiter, resets on restart; move to the DB or a proxy if this runs on more than one process
const hits=new Map();
function limit(ip,max=40){const now=Date.now(),h=hits.get(ip);if(!h||now-h.t>60000){hits.set(ip,{t:now,n:1});return}if(++h.n>max)throw new Bad('محاولات كتير، استنى دقيقة وجرّب تاني',429)}

function body(req){return new Promise((res,rej)=>{let d='';req.on('data',c=>{d+=c;if(d.length>10000){rej(new Bad('الطلب كبير',413));req.destroy()}});req.on('end',()=>{try{res(d?JSON.parse(d):{})}catch{rej(new Bad('بيانات غير صالحة'))}});req.on('error',rej)})}
const cookie=(req,k)=>(req.headers.cookie||'').split(/;\s*/).map(c=>c.split('=')).find(c=>c[0]===k)?.[1];
function user(req){const t=cookie(req,'sid');if(!t)return null;return db.prepare('SELECT u.id,u.phone,u.name,u.address FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=?').get(sha(t))||null}
function login(res,uid){const t=crypto.randomBytes(24).toString('base64url');db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(sha(t),uid,Date.now());res.setHeader('Set-Cookie',`sid=${t}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${60*60*24*90}`)}
const pub=u=>u&&{phone:u.phone,name:u.name,address:u.address};
const orderOut=o=>({id:o.id,status:o.status,created:o.created,total:o.total,delivery:o.delivery,items:JSON.parse(o.items)});

function notify(o,items){
  if(!NTFY)return;
  const msg=[...items.map(i=>`${i.q} × ${i.n}`),`توصيل: ${o.delivery} ج.م`,'',`${o.name} · ${o.phone}`,o.address,o.note?`ملاحظات: ${o.note}`:''].filter((l,i,a)=>l||a[i-1]).join('\n');
  fetch('https://ntfy.sh',{method:'POST',body:JSON.stringify({topic:NTFY,title:`طلب جديد #${o.id} · ${o.total} ج.م`,message:msg,tags:['bread'],priority:4})})
    .then(r=>r.ok||console.error('ntfy:',r.status)).catch(e=>console.error('ntfy:',e.message));
}

// ---- API
const routes={
  'GET /api/products':()=>PRODUCTS,
  'GET /api/config':()=>({delivery:DELIVERY}),
  'GET /api/me':req=>({user:pub(user(req))}),
  'POST /api/register':async(req,res)=>{
    const b=await body(req),phone=normPhone(b.phone),pass=str(b.password,6,100);
    if(!phone)throw new Bad('رقم الموبايل مش صحيح');if(!pass)throw new Bad('كلمة السر لازم ٦ حروف على الأقل');
    if(db.prepare('SELECT 1 FROM users WHERE phone=?').get(phone))throw new Bad('الرقم ده عليه حساب بالفعل، اعمل دخول',409);
    const r=db.prepare('INSERT INTO users(phone,pass) VALUES(?,?)').run(phone,hashPass(pass));
    login(res,r.lastInsertRowid);return {user:{phone,name:'',address:''}};
  },
  'POST /api/login':async(req,res)=>{
    const b=await body(req),phone=normPhone(b.phone),u=phone&&db.prepare('SELECT * FROM users WHERE phone=?').get(phone);
    if(!u||!checkPass(String(b.password??''),u.pass))throw new Bad('رقم الموبايل أو كلمة السر غلط',401);
    login(res,u.id);return {user:pub(u)};
  },
  'POST /api/logout':(req,res)=>{const t=cookie(req,'sid');if(t)db.prepare('DELETE FROM sessions WHERE token=?').run(sha(t));res.setHeader('Set-Cookie','sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');return {ok:true}},
  'POST /api/orders':async req=>{
    const b=await body(req),u=user(req);
    const name=str(b.name,2,60),address=str(b.address,5,200),note=str(b.note,0,300),phone=u?u.phone:normPhone(b.phone);
    if(!name)throw new Bad('اكتب الاسم');if(!phone)throw new Bad('رقم الموبايل مش صحيح');if(!address)throw new Bad('اكتب العنوان بالتفصيل');if(note===null)throw new Bad('الملاحظات طويلة');
    const items=Object.entries(b.items&&typeof b.items==='object'?b.items:{}).map(([id,q])=>{
      const p=byId[id];if(!p||!Number.isInteger(q)||q<1||q>50)throw new Bad('فيه صنف أو كمية مش صحيحة');
      return {id,n:p.n,p:p.p,q};});
    if(!items.length)throw new Bad('السلة فاضية');
    const total=items.reduce((s,i)=>s+i.p*i.q,0)+DELIVERY; // prices always come from products.json, never from the client
    const o={user_id:u?u.id:null,name,phone,address,note,total,delivery:DELIVERY};
    o.id=Number(db.prepare('INSERT INTO orders(user_id,name,phone,address,note,items,total,delivery,created) VALUES(?,?,?,?,?,?,?,?,?)').run(o.user_id,name,phone,address,note,JSON.stringify(items),total,DELIVERY,Date.now()).lastInsertRowid);
    if(u)db.prepare('UPDATE users SET name=?,address=? WHERE id=?').run(name,address,u.id);
    notify(o,items);return {id:o.id,total,delivery:DELIVERY,phone};
  },
  'GET /api/track':(req,res,q)=>{
    const phone=normPhone(q.get('phone'));if(!phone)throw new Bad('رقم الموبايل مش صحيح');
    return {orders:db.prepare('SELECT * FROM orders WHERE phone=? ORDER BY id DESC LIMIT 50').all(phone).map(orderOut)}; // no name/address: anyone can type a phone number
  },
  'GET /api/admin/orders':req=>{admin(req);return {orders:db.prepare('SELECT * FROM orders ORDER BY id DESC LIMIT 200').all().map(o=>({...orderOut(o),name:o.name,phone:o.phone,address:o.address,note:o.note}))}},
  'POST /api/admin/status':async req=>{admin(req);const b=await body(req);if(!STATUS.includes(b.status))throw new Bad('حالة غير صحيحة');
    if(!db.prepare('UPDATE orders SET status=? WHERE id=?').run(b.status,Number(b.id)).changes)throw new Bad('الطلب مش موجود',404);return {ok:true}}
};
function admin(req){if(!safeEq(req.headers['x-admin-key']||'',ADMIN))throw new Bad('كلمة سر الإدارة غلط',401)}

const TYPES={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml'};
const STATIC=/^\/(index\.html|admin\.html|qr\.html|app\.js|img\/[\w.-]+)$/; // whitelist: server.js, config.json and data/ are never served

const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://x'),json=(code,o)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(o))};
  if(url.pathname.startsWith('/api/')){
    try{
      const h=routes[req.method+' '+url.pathname];if(!h)throw new Bad('غير موجود',404);
      if(req.method==='POST'){if(!/^application\/json/.test(req.headers['content-type']||''))throw new Bad('بيانات غير صالحة',415);limit(req.socket.remoteAddress)}
      else if(url.pathname!=='/api/products'&&url.pathname!=='/api/config'&&url.pathname!=='/api/me')limit(req.socket.remoteAddress);
      json(200,await h(req,res,url.searchParams));
    }catch(e){if(!(e instanceof Bad))console.error(e);json(e.code>=400&&e.code<600?e.code:500,{error:e instanceof Bad?e.message:'حصل خطأ في السيرفر'})}
    return;
  }
  const p=url.pathname==='/'?'/index.html':url.pathname==='/admin'?'/admin.html':url.pathname==='/qr'?'/qr.html':url.pathname;
  if(req.method!=='GET'||!STATIC.test(p)){res.writeHead(404);return res.end('404')}
  fs.readFile(path.join(ROOT,p),(e,d)=>{if(e){res.writeHead(404);return res.end('404')}res.writeHead(200,{'Content-Type':TYPES[path.extname(p)]||'application/octet-stream'});res.end(d)});
});
server.listen(PORT,()=>console.log(`مخبز الباز شغال: http://localhost:${PORT}  |  الإدارة: http://localhost:${PORT}/admin  |  ntfy: ${NTFY?'https://ntfy.sh/'+NTFY:'مقفول'}`));
module.exports={server,normPhone};
