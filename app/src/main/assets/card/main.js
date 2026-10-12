(function(){
'use strict';
var config=window.CARD_CONFIG||{},cv=document.getElementById('rear'),ctx=cv.getContext('2d');
var W=window.CANVAS_W||912,H=window.CANVAS_H||596;
var imgs={},loaded=0,total=0;
function round(x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
function textFit(str,size,x,y,width,color){ctx.font='600 '+size+'px sans-serif';while(size>12&&ctx.measureText(str).width>width){size--;ctx.font='600 '+size+'px sans-serif';}ctx.fillStyle=color;ctx.fillText(str,x,y);}
function rating(){
 var n=config.rating||0,s=350/664,x=511,y=260;
 ctx.drawImage(imgs.rating,x,y,350,130*s);
 var str=String(n).padStart(5,'0');
 for(var i=0;i<5;i++){ctx.drawImage(imgs['d'+str[i]],x+(85*664/186+i*15*664/186)*s,y+(8*130/35)*s,17*664/186*s,20*130/35*s);}
}
function draw(){
 ctx.clearRect(0,0,W,H);
 ctx.fillStyle='#f5f3f7';ctx.fillRect(0,0,W,H);
 if(imgs.frame){var bgScale=Math.max(W/imgs.frame.width,H/imgs.frame.height),bw=imgs.frame.width*bgScale,bh=imgs.frame.height*bgScale;ctx.drawImage(imgs.frame,W*604/912-bw/2,(H-bh)/2,bw,bh);}
 var fit=Math.min(W/912,H/596);ctx.save();ctx.translate(W-912*fit,(H-596*fit)/2);ctx.scale(fit,fit);
 if(imgs.plate)ctx.drawImage(imgs.plate,320,44,568,568*imgs.plate.height/imgs.plate.width);
 ctx.fillStyle='rgba(255,255,255,.55)';round(320,169,568,190,17);ctx.fill();ctx.strokeStyle='rgba(255,255,255,.65)';ctx.lineWidth=1;ctx.stroke();
 if(imgs.icon){ctx.save();round(343,191,146,146,11);ctx.clip();ctx.drawImage(imgs.icon,343,191,146,146);ctx.restore();}
 ctx.textBaseline='middle';ctx.textAlign='left';textFit(config.name||'舞萌玩家',38,512,220,342,'#252233');
 if(imgs.rating)rating();
 if(config.title){if(imgs.title)ctx.drawImage(imgs.title,320,381,568,53);ctx.textAlign='center';textFit(config.title,23,604,407,530,'#28272d');}
 // Display actual rank badges only after full profile sync, without inventing a rank.
 if(config.fullUpdatedAt){var bx=512;if(imgs.course&&config.courseRank){ctx.drawImage(imgs.course,bx,444,112,45);bx+=128;}if(imgs.class&&config.classRank)ctx.drawImage(imgs.class,bx,435,92,55);}
 ctx.restore();
}
var paths={rating:config.ratingAsset||'assets/rating.png',title:config.titleAsset||'assets/title-normal.png'};
if(config.frameAsset)paths.frame=config.frameAsset;if(config.plateAsset)paths.plate=config.plateAsset;if(config.iconAsset)paths.icon=config.iconAsset;
if(config.courseAsset)paths.course=config.courseAsset;if(config.classAsset)paths.class=config.classAsset;
for(var k=0;k<10;k++)paths['d'+k]='assets/digit-'+k+'.png';
Object.keys(paths).forEach(function(){total++;});
Object.keys(paths).forEach(function(key){var image=new Image();image.onload=function(){imgs[key]=image;loaded++;if(loaded===total)draw();};image.onerror=function(){loaded++;if(loaded===total)draw();};image.src=(config.imageSources||{})[paths[key]]||paths[key];});
})();
