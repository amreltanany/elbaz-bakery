// node test.js : يشغّل السيرفر على قاعدة بيانات مؤقتة ويختبر الطلب والحساب والتتبع والإدارة
Object.assign(process.env,{PORT:'4199',DB:':memory:',NTFY_TOPIC:'',ADMIN_KEY:'test-key'});
const assert=require('assert'),{server,normPhone}=require('./server.js'),B='http://localhost:4199';
let jar='';
async function call(path,body,headers={}){
  const r=await fetch(B+path,{method:body?'POST':'GET',headers:{...(body&&{'Content-Type':'application/json'}),cookie:jar,...headers},body:body&&JSON.stringify(body)});
  const c=r.headers.get('set-cookie');if(c)jar=c.split(';')[0];
  return {s:r.status,j:await r.json().catch(()=>null)};
}
server.on('listening',async()=>{
  try{
    assert.equal(normPhone('٠١٠ ١٢٣٤ ٥٦٧٨'),'01012345678');assert.equal(normPhone('+20 101 234 5678'),'01012345678');assert.equal(normPhone('12345'),null);
    const guest={name:'ضيف تجربة',phone:'01012345678',address:'شارع تجريبي ١'};
    let r=await call('/api/orders',{...guest,items:{fino:10,cro:1}});
    assert.equal(r.s,200);assert.equal(r.j.total,70,'total = server prices (40) + 30 delivery');assert.equal(r.j.delivery,30);assert.equal((await call('/api/config')).j.delivery,30);
    assert.equal((await call('/api/orders',{...guest,items:{fino:-1}})).s,400);
    assert.equal((await call('/api/orders',{...guest,items:{nope:1}})).s,400);
    assert.equal((await call('/api/orders',{...guest,phone:'123',items:{fino:1}})).s,400);
    assert.equal((await call('/api/orders',{...guest,items:{}})).s,400);

    assert.equal((await call('/api/register',{phone:'01112223334',password:'secret1'})).s,200);
    assert.equal((await call('/api/register',{phone:'01112223334',password:'secret1'})).s,409);
    r=await call('/api/orders',{name:'عميل حساب',phone:'ignored',address:'عنوان الحساب ٥',items:{fino:5}});
    assert.equal(r.j.phone,'01112223334','account orders use the account phone');
    r=await call('/api/me');assert.deepEqual(r.j.user,{phone:'01112223334',name:'عميل حساب',address:'عنوان الحساب ٥'});
    await call('/api/logout',{});assert.equal((await call('/api/me')).j.user,null);
    assert.equal((await call('/api/login',{phone:'01112223334',password:'wrong'})).s,401);
    assert.equal((await call('/api/login',{phone:'01112223334',password:'secret1'})).j.user.name,'عميل حساب');

    r=await call('/api/track?phone=01012345678');
    assert.equal(r.j.orders.length,1);assert.equal(r.j.orders[0].status,'new');assert.equal(r.j.orders[0].delivery,30);assert.equal(r.j.orders[0].address,undefined,'tracking never leaks the address');
    assert.equal((await call('/api/admin/orders')).s,401);
    const k={'x-admin-key':'test-key'};
    assert.equal((await call('/api/admin/orders',null,k)).j.orders.length,2);
    assert.equal((await call('/api/admin/status',{id:1,status:'out'},k)).s,200);
    assert.equal((await call('/api/admin/status',{id:1,status:'hack'},k)).s,400);
    assert.equal((await call('/api/track?phone=01012345678')).j.orders[0].status,'out');
    for(const f of ['/server.js','/config.json','/data/elbaz.db','/products.json','/..%2fserver.js'])assert.equal((await fetch(B+f)).status,404,f+' must not be served');
    assert.equal((await fetch(B+'/')).status,200);
    console.log('كل الاختبارات نجحت');
  }catch(e){console.error(e);process.exitCode=1}
  server.close();
});
