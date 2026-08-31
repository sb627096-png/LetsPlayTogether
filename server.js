const express=require("express");
const http=require("http");
const {Server}=require("socket.io");
const crypto=require("crypto");

const app=express(), server=http.createServer(app);
const io=new Server(server,{cors:{origin:"*"}});
const PORT=process.env.PORT||3000;
app.use(express.static("public"));

const rooms=new Map();
const games=["fight","racing","football","space","runner"];

function code(){
 let c;
 do c=crypto.randomBytes(3).toString("hex").toUpperCase();
 while(rooms.has(c));
 return c;
}
function name(n){return String(n||"Player").trim().slice(0,14)||"Player"}
function room(s){
 for(const r of rooms.values()) if(r.players.has(s.id)) return r;
 return null;
}
function players(r){
 return [...r.players.values()].map(p=>({
  id:p.id,name:p.name,num:p.num,x:p.x,y:p.y,hp:p.hp,score:p.score,lane:p.lane
 }));
}
function update(r){
 io.to(r.code).emit("room:update",{
  code:r.code,game:r.game,started:r.started,players:players(r)
 });
}
function start(r,g){
 if(!games.includes(g))return;
 r.game=g;r.started=true;
 r.state={tick:0,ball:{x:600,y:250},bullets:[],enemies:[],obs:[]};
 for(const p of r.players.values()){
  p.hp=100;p.score=0;p.vx=0;p.vy=0;
  p.lane=(p.num-1)%3;
  if(g==="fight"){p.x=100+p.num*120;p.y=330}
  if(g==="racing"){p.x=50;p.y=70+(p.num-1)*55}
  if(g==="football"){p.x=150+(p.num%4)*120;p.y=120+Math.floor((p.num-1)/4)*180}
  if(g==="space"){p.x=120+(p.num-1)*130;p.y=440}
  if(g==="runner"){p.x=50;p.y=0}
 }
 if(g==="space")
  r.state.enemies=Array.from({length:7},(_,i)=>({x:100+i*160,y:70,hp:30}));
 if(g==="runner")
  r.state.obs=Array.from({length:15},(_,i)=>({x:600+i*250,lane:i%3}));
 update(r);
}
function state(r){
 return {
  game:r.game,started:r.started,players:players(r),
  ball:r.state.ball,bullets:r.state.bullets,
  enemies:r.state.enemies,obs:r.state.obs
 };
}

io.on("connection",s=>{
 s.on("room:create",({name:n}={})=>{
  const r={code:code(),host:s.id,game:null,started:false,players:new Map(),
          state:{tick:0,ball:{x:600,y:250},bullets:[],enemies:[],obs:[]}};
  r.players.set(s.id,{id:s.id,name:name(n||"Monitor"),num:0,x:0,y:0,
                      vx:0,vy:0,hp:100,score:0,lane:0});
  rooms.set(r.code,r);s.join(r.code);
  s.emit("room:created",{code:r.code});update(r);
 });

 s.on("room:join",({code:c,name:n}={})=>{
  const r=rooms.get(String(c||"").toUpperCase());
  if(!r)return s.emit("error:message","Room nahi mila.");
  if(r.started)return s.emit("error:message","Game already started.");
  if(r.players.size>=8)return s.emit("error:message","Room full hai.");
  const num=[...r.players.values()].filter(p=>p.num>0).length+1;
  r.players.set(s.id,{id:s.id,name:name(n),num,x:0,y:0,vx:0,vy:0,
                      hp:100,score:0,lane:(num-1)%3});
  s.join(r.code);s.emit("room:joined",{code:r.code,num});update(r);
 });

 s.on("game:select",({game:g}={})=>{
  const r=room(s);
  if(r&&r.host===s.id&&!r.started&&games.includes(g)){r.game=g;update(r)}
 });
 s.on("game:start",({game:g}={})=>{
  const r=room(s);if(r&&r.host===s.id)start(r,g||r.game||"fight");
 });
 s.on("game:stop",()=>{
  const r=room(s);
  if(r&&r.host===s.id){r.started=false;r.game=null;update(r)}
 });

 s.on("control",({action}={})=>{
  const r=room(s);if(!r||!r.started)return;
  const p=r.players.get(s.id);if(!p||p.num===0)return;

  if(r.game==="fight"){
   if(action==="left")p.vx=-7;
   if(action==="right")p.vx=7;
   if(action==="jump"&&p.y>=300)p.vy=-12;
   if(action==="attack"){
    for(const q of r.players.values())
     if(q!==p&&q.num>0&&Math.abs(q.x-p.x)<120)
      q.hp=Math.max(0,q.hp-10);
   }
  }

  if(r.game==="racing"){
   if(action==="up")p.vx=Math.min(12,p.vx+2);
   if(action==="down")p.vx=Math.max(0,p.vx-3);
   if(action==="left")p.lane=Math.max(0,p.lane-1);
   if(action==="right")p.lane=Math.min(5,p.lane+1);
  }

  if(r.game==="football"){
   if(action==="up")p.vy=-5;
   if(action==="down")p.vy=5;
   if(action==="left")p.vx=-5;
   if(action==="right")p.vx=5;
   if(action==="action"){
    const b=r.state.ball,dx=b.x-p.x,dy=b.y-p.y,d=Math.max(1,Math.hypot(dx,dy));
    if(d<80){b.vx=dx/d*12;b.vy=dy/d*12}
   }
  }

  if(r.game==="space"){
   if(action==="left")p.vx=-6;
   if(action==="right")p.vx=6;
   if(action==="up")p.vy=-5;
   if(action==="down")p.vy=5;
   if(action==="action")
    r.state.bullets.push({x:p.x,y:p.y,vx:0,vy:-12,owner:p.id});
  }

  if(r.game==="runner"){
   if(action==="left")p.lane=Math.max(0,p.lane-1);
   if(action==="right")p.lane=Math.min(2,p.lane+1);
   if(action==="jump"&&p.y===0)p.vy=-13;
  }
 });

 s.on("disconnect",()=>{
  const r=room(s);if(!r)return;
  r.players.delete(s.id);
  if(r.host===s.id){io.to(r.code).emit("room:closed");rooms.delete(r.code)}
  else update(r);
 });
});

setInterval(()=>{
 for(const r of rooms.values()){
  if(!r.started)continue;

  for(const p of r.players.values()){
   if(r.game==="fight"){
    p.x=Math.max(50,Math.min(1150,p.x+p.vx));
    p.vx*=.75;p.vy+=.7;p.y+=p.vy;
    if(p.y>330){p.y=330;p.vy=0}
   }
   if(r.game==="racing"){
    p.vx*=.98;p.x+=p.vx;p.score=Math.floor(p.x/10);
   }
   if(r.game==="football"){
    p.x=Math.max(30,Math.min(1170,p.x+p.vx));
    p.y=Math.max(30,Math.min(470,p.y+p.vy));
    p.vx*=.8;p.vy*=.8;
   }
   if(r.game==="space"){
    p.x=Math.max(30,Math.min(1170,p.x+p.vx));
    p.y=Math.max(250,Math.min(470,p.y+p.vy));
    p.vx*=.85;p.vy*=.85;
   }
   if(r.game==="runner"){
    p.x+=5;p.vy+=.8;p.y+=p.vy;
    if(p.y>0){p.y=0;p.vy=0}
    p.score=Math.floor(p.x/10);
   }
  }

  if(r.game==="football"){
   const b=r.state.ball;
   b.x+=b.vx;b.y+=b.vy;b.vx*=.985;b.vy*=.985;
   if(b.x<20||b.x>1180){b.x=600;b.y=250;b.vx=b.vy=0}
  }

  if(r.game==="space"){
   for(const b of r.state.bullets){
    b.x+=b.vx;b.y+=b.vy;
    for(const e of r.state.enemies){
     if(e.hp>0&&Math.hypot(b.x-e.x,b.y-e.y)<30){
      e.hp-=10;b.dead=true;
      if(e.hp<=0){
       const p=r.players.get(b.owner);if(p)p.score+=10;
      }
     }
    }
   }
   r.state.bullets=r.state.bullets.filter(b=>!b.dead&&b.y>0);
  }

  io.to(r.code).emit("game:state",state(r));
 }
},33);

server.listen(PORT,"0.0.0.0",()=>console.log("LetsPlayTogether running on "+PORT));
