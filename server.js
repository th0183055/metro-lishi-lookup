// Protected Metro VIN history backend.
// Deploy as a private-data web service; NEVER place Google credentials in index.html or /data.
const http=require('http'),crypto=require('crypto'),fs=require('fs'),path=require('path'),querystring=require('querystring');
const PORT=process.env.PORT||3000,ROOT=__dirname;
const CALENDARS=[
 ['Tim','tim@wekeycars.com'],['Larry','larry@wekeycars.com'],['Noah','noah@wekeycars.com'],
 ['Kurt','kurt@metrolockdm.com'],['Gage','gage@wekeycars.com'],['Jason','jason@wekeycars.com']
];
const sessions=new Map();
const json=(res,status,obj,extra={})=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store',...extra});res.end(JSON.stringify(obj));};
const body=req=>new Promise((ok,no)=>{let s='';req.on('data',d=>{s+=d;if(s.length>20000)req.destroy();});req.on('end',()=>ok(s));req.on('error',no);});
function cookie(req,name){const m=('; '+(req.headers.cookie||'')).match('; '+name+'=([^;]*)');return m?decodeURIComponent(m[1]):'';}
function authed(req){const id=cookie(req,'metro_session'),x=sessions.get(id);return !!(x&&x>Date.now());}
async function googleToken(){
 const p=new URLSearchParams({client_id:process.env.GOOGLE_CLIENT_ID||'',client_secret:process.env.GOOGLE_CLIENT_SECRET||'',refresh_token:process.env.GOOGLE_REFRESH_TOKEN||'',grant_type:'refresh_token'});
 const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:p});if(!r.ok)throw new Error('Google token '+r.status);return (await r.json()).access_token;
}
function field(text,label){const m=String(text||'').match(new RegExp('(?:^|\\n)'+label+'\\s*[:#-]?\\s*([^\\n]+)','i'));return m?m[1].trim():'';}
function parseEvent(ev,tech,vin){
 const text=[ev.summary,ev.description].filter(Boolean).join('\n');
 const money=field(text,'(?:Subtotal|Vehicle Subtotal)');
 return {timestamp:ev.start?.dateTime||ev.start?.date||'',technician:tech,serviceType:field(text,'(?:Service|Service Type)')||String(ev.summary||'').split(/\s+/)[0]||'',gCalTitle:ev.summary||'',location:ev.location||'',partNumber:field(text,'Part\\(s\\) Used')||field(text,'Part Number'),programmer:field(text,'Programmer'),pinRequired:field(text,'PIN Required'),pinSuccess:field(text,'PIN Success'),pricingLevel:field(text,'Pricing Level'),additionalMileage:field(text,'Additional Mileage'),vehSubTotal:money.replace(/^\$/,''),replenishTo:field(text,'Replenish To'),paymentInfo:field(text,'Payment'),vinRaw:vin,notes:field(text,'Notes')||'',source:'Live Metro Google Calendar'};
}
async function calendarJobs(vin){
 const token=await googleToken(),jobs=[];
 for(const [tech,id] of CALENDARS){
   let page='';
   do{
     const u=new URL('https://www.googleapis.com/calendar/v3/calendars/'+encodeURIComponent(id)+'/events');
     u.searchParams.set('q',vin);u.searchParams.set('singleEvents','true');u.searchParams.set('maxResults','50');u.searchParams.set('timeMin','2015-01-01T00:00:00Z');u.searchParams.set('timeMax',new Date(Date.now()+86400000).toISOString());if(page)u.searchParams.set('pageToken',page);
     const r=await fetch(u,{headers:{Authorization:'Bearer '+token}});if(!r.ok)throw new Error('Calendar '+id+' '+r.status);
     const d=await r.json();for(const ev of d.items||[]){const hay=(ev.summary||'')+'\n'+(ev.description||'');if(hay.toUpperCase().replace(/[^A-Z0-9]/g,'').includes(vin))jobs.push(parseEvent(ev,tech,vin));}page=d.nextPageToken||'';
   }while(page);
 }
 jobs.sort((a,b)=>String(b.timestamp).localeCompare(String(a.timestamp)));
 const seen=new Set();return jobs.filter(j=>{const k=[j.timestamp,j.gCalTitle,j.partNumber,j.technician].join('|');if(seen.has(k))return false;seen.add(k);return true;});
}
const server=http.createServer(async(req,res)=>{
 try{
  const u=new URL(req.url,'http://localhost');
  if(u.pathname==='/api/login'&&req.method==='POST'){
    const raw=JSON.parse(await body(req)||'{}'),expected=process.env.METRO_HISTORY_PASSWORD||'';
    if(!expected||!crypto.timingSafeEqual(Buffer.from(String(raw.password||'').padEnd(expected.length).slice(0,expected.length)),Buffer.from(expected)))return json(res,401,{ok:false});
    const id=crypto.randomBytes(32).toString('hex');sessions.set(id,Date.now()+8*60*60*1000);
    return json(res,200,{ok:true},{'Set-Cookie':'metro_session='+id+'; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800'});
  }
  if(u.pathname==='/api/logout'){const id=cookie(req,'metro_session');sessions.delete(id);return json(res,200,{ok:true},{'Set-Cookie':'metro_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0'});}
  if(u.pathname==='/api/vin-history'){
    if(!authed(req))return json(res,401,{error:'authentication required'});
    const vin=String(u.searchParams.get('vin')||'').toUpperCase().replace(/[^A-Z0-9]/g,'');if(!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin))return json(res,400,{error:'valid 17-character VIN required'});
    return json(res,200,{vin,jobs:await calendarJobs(vin),calendars:CALENDARS.map(x=>x[0])});
  }
  let p=u.pathname==='/'?'/index.html':u.pathname;p=path.normalize(p).replace(/^\.\.(\/|\\)/,'');const file=path.join(ROOT,p);
  if(!file.startsWith(ROOT)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);return res.end('Not found');}
  const ext=path.extname(file),types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json'};
  res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY'});fs.createReadStream(file).pipe(res);
 }catch(e){console.error(e);json(res,500,{error:'server error'});}
});
server.listen(PORT,()=>console.log('Metro Lishi secure service listening on '+PORT));