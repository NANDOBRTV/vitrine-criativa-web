#!/usr/bin/env python3
"""Generate original-vehicle 2D sprite animations from accepted StockCar WebP views.
Works in GitHub Actions and locally. Does not fabricate true 3D meshes."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter
import base64, io, json, math, random, zipfile, hashlib
BASE=Path(__file__).resolve().parent
BUNDLE=BASE/'stockcar-web-assets.b64'
ROOT=BASE/'v12-build'
ROOT.mkdir(exist_ok=True)
raw=base64.b64decode(BUNDLE.read_text())
with zipfile.ZipFile(io.BytesIO(raw)) as z: z.extractall(ROOT)
AS=ROOT/'assets/stockcar'
M=AS/'manifest.json'
m=json.loads(M.read_text())
ACTIONS=['acceleration','braking','curve_left','curve_right','drift','collision']
VIEWS=['rear','rear','rear_3q','rear_3q','side','rear']
FW,FH,FRAMES=224,128,8
for d in ['car_sheets','wheel_sheets','effect_sheets']:
 (AS/'animations'/d).mkdir(parents=True,exist_ok=True)
def trimmed(car,view):
 data=car['views'].get(view)
 if not data:raise RuntimeError('Missing accepted car view '+car['id']+' '+view)
 im=Image.open(ROOT/data['path']).convert('RGBA')
 box=im.getchannel('A').getbbox()
 if not box:raise RuntimeError('Empty sprite '+car['id']+' '+view)
 im=im.crop(box);im.thumbnail((184,90),Image.Resampling.LANCZOS)
 return im
def paint(car,action,frame,im):
 rnd=random.Random(int(car['number'])*17+frame*131+ACTIONS.index(action)*101)
 canvas=Image.new('RGBA',(FW,FH));dr=ImageDraw.Draw(canvas)
 t=frame/7;xx=(FW-im.width)//2;yy=FH-im.height-10
 if action=='acceleration':
  for off in [-.18,.18]:
   fx=int(FW/2+off*im.width);tail=8+frame*2
   dr.polygon([(fx-6,FH-14),(fx+6,FH-14),(fx,FH-3+tail//2)], fill=(255,169+frame*7,26,210))
  yy+=round(math.sin(frame*.8)*2)
 if action=='braking' and frame>0:
  dr.ellipse((FW//2-60,FH-39,FW//2+60,FH-11),fill=(255,30,38,min(110,frame*14)))
 if action.startswith('curve'):
  direction=-1 if action=='curve_left' else 1
  xx+=round(direction*math.sin(math.pi*t)*17)
  yy-=round(math.sin(math.pi*t)*3)
 if action=='drift':
  xx+=round(math.sin(frame*.72)*14)
  for j in range(6):
   sx=FW//2+rnd.randint(-62,62);sy=FH-18-rnd.randint(0,18);rr=rnd.randint(7,21)
   dr.ellipse((sx-rr,sy-rr,sx+rr,sy+rr),fill=(163,176,189,65+j*5))
 if action=='collision' and frame>=2:
  xx+=rnd.randint(-2,2)
  for j in range(11):
   sx=FW//2+rnd.randint(-60,60);sy=FH//2+rnd.randint(0,38)
   dr.line((sx,sy,sx+rnd.randint(-25,25),sy+rnd.randint(-25,25)),fill=(255,rnd.randint(155,245),30,230),width=2)
 canvas.alpha_composite(im,(xx,yy))
 if action=='braking' and frame:
  dr=ImageDraw.Draw(canvas)
  for fx in (FW*.37,FW*.63):
   dr.ellipse((fx-5,yy+im.height*.52-4,fx+5,yy+im.height*.52+4),fill=(255,35,38,100+frame*18))
 return canvas
def wheels(car):
 p=ROOT/f"assets/stockcar/cars/{car['id']}/{car['id']}_wheel.webp"
 wheel=Image.open(p).convert('RGBA');wheel.thumbnail((52,52),Image.Resampling.LANCZOS)
 frame=Image.new('RGBA',(64,64));frame.alpha_composite(wheel,((64-wheel.width)//2,(64-wheel.height)//2))
 sheet=Image.new('RGBA',(64*12,64))
 distinct=set()
 for f in range(12):
  spin=frame.rotate(-30*f,resample=Image.Resampling.BICUBIC)
  sheet.alpha_composite(spin,(64*f,0));distinct.add(hashlib.sha256(spin.tobytes()).hexdigest())
 if len(distinct)<8:raise RuntimeError('Wheel animation frames identical '+car['id'])
 dest=AS/'animations/wheel_sheets'/f"{car['id']}_wheels_12.png";sheet.save(dest,optimize=True)
 car['generated_wheels']={'path':str(dest.relative_to(ROOT)).replace('\\','/'),'frames':12,'columns':12,'frame_size':[64,64],'generated':True}
for car in m['cars']:
 sheet=Image.new('RGBA',(FW*FRAMES,FH*len(ACTIONS)))
 for row,(action,view) in enumerate(zip(ACTIONS,VIEWS)):
  im=trimmed(car,view)
  for frame in range(FRAMES):
   sheet.alpha_composite(paint(car,action,frame,im),(FW*frame,FH*row))
 dest=AS/'animations/car_sheets'/f"{car['id']}_actions.png";sheet.save(dest,optimize=True)
 car['generated_animation']={'path':str(dest.relative_to(ROOT)).replace('\\','/'),'frame_width':FW,'frame_height':FH,
    'columns':FRAMES,'rows':len(ACTIONS),'actions':{a:{'row':i,'frames':FRAMES,'fps':10,'source_view':VIEWS[i],'generated':True} for i,a in enumerate(ACTIONS)},
    'validation':'alpha and source-identity checked; GPU testing still required'}
 wheels(car)
FX=('smoke','sparks','nitro','skid','impact')
fxm={}
for kind in FX:
 pic=Image.new('RGBA',(384,384))
 for i in range(16):
  r=random.Random(354+13*i+len(kind)*119);im=Image.new('RGBA',(96,96));dr=ImageDraw.Draw(im)
  t=i/15
  if kind=='smoke':
   for j in range(13):
    x=48+r.randint(-24,24);y=50+r.randint(-15,15)-t*12;rad=r.randint(9,24)*(1+t)
    dr.ellipse((x-rad,y-rad,x+rad,y+rad),fill=(161,177,189,round((69+j*3)*(1-t*.7))))
   im=im.filter(ImageFilter.GaussianBlur(1))
  elif kind=='sparks':
   for j in range(22):
    a=r.random()*2*math.pi;rad=(12+52*t)*r.random()
    x=48+math.cos(a)*rad;y=48+math.sin(a)*rad*.7
    dr.line((x,y,x+math.cos(a)*13,y+math.sin(a)*9),fill=(255,r.randint(157,249),33,round(230*(1-t*.7))),width=2)
  elif kind=='nitro':
   for w,col in [(18,(255,94,15,175)),(11,(255,213,55,240)),(4,(255,255,230,255))]:
    dr.polygon([(48-w,30),(48+w,30),(48,54+38*t)],fill=col)
  elif kind=='skid':
   for x in [32,61]:
    dr.line((x,9,x-10,87),fill=(18,21,22,195),width=7)
  else:
   for rad,col in [(31*(1-t*.4),(255,85,32,140)),(21*(1-t*.4),(255,188,48,205)),(9,(255,241,199,240))]:
    dr.ellipse((48-rad,48-rad,48+rad,48+rad),fill=col)
  pic.alpha_composite(im,((i%4)*96,(i//4)*96))
 dest=AS/'animations/effect_sheets'/f'{kind}_16.png';pic.save(dest,optimize=True)
 fxm[kind]={'path':str(dest.relative_to(ROOT)).replace('\\','/'),'columns':4,'rows':4,'frames':16,'frame_width':96,'frame_height':96,'generated':True}
m['schema_version']='stockcar-sprites-v12';m['generated_animation_sheets']={'cars':10,'actions_per_car':6,'frames_per_action':8,'wheel_sheets':10,'wheel_frames':12,'effects':fxm,'source':'original car sprite views'}
M.write_text(json.dumps(m,ensure_ascii=False,indent=2))
out=io.BytesIO()
with zipfile.ZipFile(out,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=7) as z:
 for file in sorted(ROOT.rglob('*')):
  if file.is_file():z.write(file,file.relative_to(ROOT).as_posix())
BUNDLE.write_text(base64.b64encode(out.getvalue()).decode('ascii')+'\n')
print('STOCKCAR_V12_ASSETS_CREATED cars=10 action_sheets=10 wheel_sheets=10 effects=5 zip_bytes='+str(len(out.getvalue())))
