const express=require('express');
const http=require('http');const {Server}=require('socket.io');
const questions=require('./questions.json');
const app=express();app.use(express.static('public'));
const server=http.createServer(app),io=new Server(server),rooms=new Map();
const norm=s=>String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
const safe=s=>String(s||'').replace(/[<>]/g,'').trim().slice(0,22);
const getPlayers=r=>Object.values(r.players).map(p=>({name:p.name,score:p.score,answered:p.answered})).sort((a,b)=>b.score-a.score);
function send(r){io.to(r.code).emit('state',{code:r.code,phase:r.phase,index:r.index,total:questions.length,question:r.phase==='question'?questions[r.index].q:null,players:getPlayers(r),endAt:r.endAt||null,answer:r.phase==='reveal'?questions[r.index].answer:null,host:r.host});}
function advance(r){clearTimeout(r.timer);r.index++;if(r.index>=questions.length){r.phase='done';send(r);return;}r.phase='question';r.endAt=Date.now()+45000;for(const p of Object.values(r.players))p.answered=false;send(r);r.timer=setTimeout(()=>reveal(r),45000);}
function reveal(r){if(r.phase!=='question')return;clearTimeout(r.timer);r.phase='reveal';r.endAt=null;send(r);}
io.on('connection',s=>{
 s.on('create',({name},cb)=>{let code;do{code=String(Math.floor(100000+Math.random()*900000))}while(rooms.has(code));const r={code,host:s.id,phase:'lobby',index:-1,players:{},timer:null,endAt:null};rooms.set(code,r);r.players[s.id]={name:safe(name)||'Host',score:0,answered:false};s.join(code);s.data.code=code;send(r);cb?.({ok:true,code,host:true});});
 s.on('join',({code,name},cb)=>{const r=rooms.get(String(code));if(!r||r.phase==='done'){cb?.({error:'Room not found or game already ended.'});return;}if(r.phase!=='lobby'){cb?.({error:'Game already started. Join before the host starts.'});return;}if(Object.keys(r.players).length>=30){cb?.({error:'Room is full.'});return;}r.players[s.id]={name:safe(name)||'Player',score:0,answered:false};s.join(r.code);s.data.code=r.code;send(r);cb?.({ok:true,code:r.code,host:false});});
 s.on('start',()=>{const r=rooms.get(s.data.code);if(r&&r.host===s.id&&r.phase==='lobby')advance(r);});
 s.on('next',()=>{const r=rooms.get(s.data.code);if(r&&r.host===s.id&&r.phase==='reveal')advance(r);});
 s.on('reveal',()=>{const r=rooms.get(s.data.code);if(r&&r.host===s.id)reveal(r);});
 s.on('answer',(value,cb)=>{const r=rooms.get(s.data.code);if(!r||r.phase!=='question'||Date.now()>r.endAt){cb?.({error:'Time is up.'});return;}const p=r.players[s.id];if(!p||p.answered){cb?.({error:'Already answered.'});return;}p.answered=true;const a=norm(value);const ok=a.length>=3&&questions[r.index].keywords.some(k=>{const key=norm(k);return key.length>=3&&(a===key||a.includes(key));});if(ok)p.score+=100+Math.max(0,Math.ceil((r.endAt-Date.now())/1000));cb?.({ok:true,correct:ok,expected:questions[r.index].answer});send(r);if(Object.values(r.players).every(p=>p.answered))reveal(r);});
 s.on('disconnect',()=>{const r=rooms.get(s.data.code);if(!r)return;delete r.players[s.id];if(!Object.keys(r.players).length){clearTimeout(r.timer);rooms.delete(r.code);return;}if(r.host===s.id)r.host=Object.keys(r.players)[0];send(r);});
});
server.listen(process.env.PORT||3000,()=>console.log('Game listening'));
