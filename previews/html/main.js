/* Layout and player data stay independent of Android and of individual textures. */
var PROFILE = { name: 'ＦＩＮＡＬＬ', rating: 15158, title: '蓮ノ空のこと好き好きクラブのみなさん' };
var canvas = document.getElementById('rear');
var ctx = canvas.getContext('2d');
var images = {};
var layout = { width: 912, height: 596, safeLeft: 296, left: 320, right: 888 };
function loadImage(key, path) {
  return new Promise(function(resolve, reject) {
    var image = new Image();
    image.onload = function() { images[key] = image; resolve(); };
    image.onerror = function() { reject(new Error('素材加载失败：' + path)); };
    image.src = path;
  });
}
function roundRect(x,y,w,h,r) {
  ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r);
  ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
}
function drawRating(x, y, width) {
  var s = width / 174;
  ctx.drawImage(images.rating,x,y,width,36*s);
  String(PROFILE.rating).padStart(5,'0').split('').forEach(function(d,i) {
    ctx.drawImage(images['digit'+d],x+[84,98,113,128,143][i]*s,y+8*s,18*s,21*s);
  });
}
function draw() {
  ctx.clearRect(0,0,912,596);
  // Keep the centre cabinet in the safe area; do not stretch the background.
  var bg = images.frame, bh=596, bw=bg.width*bh/bg.height;
  ctx.drawImage(bg,604-bw/2,0,bw,bh);
  var s=Number(document.getElementById('scale').value)/100;
  ctx.save();ctx.translate(604,300);ctx.scale(s,s);ctx.translate(-604,-300);
  // Original nameplate artwork remains whole.
  ctx.save();ctx.shadowColor='#0008';ctx.shadowBlur=16;ctx.shadowOffsetY=5;
  ctx.drawImage(images.plate,320,44,568,568*116/720);ctx.restore();
  // Translucent white backing; keep the equipped background at its original brightness.
  ctx.fillStyle='rgba(255,255,255,.55)';roundRect(320,169,568,190,17);ctx.fill();
  ctx.strokeStyle='rgba(255,255,255,.65)';ctx.lineWidth=1;ctx.stroke();
  ctx.fillStyle='#bea0ed';roundRect(320,191,3,146,1.5);ctx.fill();
  // 22 px top and bottom padding around the portrait.
  ctx.save();roundRect(343,191,146,146,11);ctx.clip();ctx.drawImage(images.icon,343,191,146,146);ctx.restore();
  ctx.strokeStyle='#efe0ff';ctx.lineWidth=3;roundRect(343,191,146,146,11);ctx.stroke();
  ctx.fillStyle='#252233';ctx.font='600 38px sans-serif';ctx.textBaseline='middle';ctx.textAlign='left';
  var fs=38;while(ctx.measureText(PROFILE.name).width>342){fs--;ctx.font='600 '+fs+'px sans-serif';}
  ctx.fillText(PROFILE.name,512,220);
  drawRating(511,260,350);
  // Full title follows the compact identity panel.
  ctx.drawImage(images.title,320,381,568,53);
  ctx.fillStyle='#28272d';ctx.textAlign='center';ctx.textBaseline='middle';
  fs=23;ctx.font='600 '+fs+'px sans-serif';
  while(ctx.measureText(PROFILE.title).width>530){fs--;ctx.font='600 '+fs+'px sans-serif';}
  ctx.fillText(PROFILE.title,604,407);
  ctx.restore();
}
var tasks=['frame','plate','icon','rating','title'].map(function(k){return loadImage(k,'assets/'+k+'.png');});
for(var i=0;i<10;i++)tasks.push(loadImage('digit'+i,'assets/digit-'+i+'.png'));
Promise.all(tasks).then(function(){draw();document.getElementById('status').textContent='本地素材已加载';}).catch(function(e){document.getElementById('status').textContent=e.message;});
document.getElementById('scale').addEventListener('input',draw);
document.getElementById('cameras').addEventListener('change',function(e){document.querySelectorAll('.lens').forEach(function(el){el.style.display=e.target.checked?'block':'none';});});
document.getElementById('guides').addEventListener('change',function(e){document.querySelector('.safe').style.display=e.target.checked?'block':'none';});
document.getElementById('download').addEventListener('click',function(){var a=document.createElement('a');a.download='maimai-rear-card.png';a.href=canvas.toDataURL('image/png');a.click();});
