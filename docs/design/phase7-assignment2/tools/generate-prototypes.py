import os, json, math, shutil, tempfile
from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, 'assets')
WIN = os.path.join(ASSETS, 'windows')
AND = os.path.join(ASSETS, 'android')
COMP = os.path.join(WIN, 'comparison')
BR = os.path.join(ASSETS, 'browser-render')
FONTS = os.path.join(ASSETS, 'fonts')
for p in [ROOT, ASSETS, WIN, AND, COMP, BR, FONTS,
          os.path.join(WIN,'direction-a'), os.path.join(WIN,'direction-b'),
          os.path.join(AND,'previews'), os.path.join(WIN,'direction-a','responsive'), os.path.join(WIN,'direction-b','responsive')]:
    os.makedirs(p, exist_ok=True)

LATIN = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
LATIN_BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
MONO = '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf'
MONO_BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf'
_GUR_WOFF2 = os.path.join(FONTS, 'noto-sans-gurmukhi.woff2')
_GUR_FD, _GUR_TTF = tempfile.mkstemp(prefix='sornio-gurmukhi-', suffix='.ttf')
os.close(_GUR_FD)
TTFont(_GUR_WOFF2).save(_GUR_TTF)
GUR = _GUR_TTF

C = {
    'bg':'#F7F8FA','surface':'#FFFFFF','nav':'#182333','nav2':'#243449','text':'#182333',
    'muted':'#667085','accent':'#246B65','accent2':'#1D5A55','soft':'#E7EEE9',
    'line':'#D8DEE6','line2':'#E4E7EC','border':'#7A8699','white':'#FFFFFF',
    'navText':'#FFFFFF','navMuted':'#C7D0DC','focus':'#7BC2B7',
    'success':'#1B6E4A','successBg':'#E7F4EC','warn':'#8A5A00','warnBg':'#FFF4D6',
    'error':'#A4262C','errorBg':'#FDECEC','debt':'#7A3E00','debtBg':'#FFF1DE',
    'pending':'#6B4E00','pendingBg':'#FFF4D6','recon':'#2C5E8A','reconBg':'#EAF2FA',
    'disabled':'#D6DEDD','shadow':'#E3E8ED','current':'#365b8a','currentBg':'#f5f6f7',
    'currentText':'#253244','currentMuted':'#6c7584','currentLine':'#e4e7ec'
}
STYLE = {
 'A': dict(name='Direction A — Precision Retail', nav_labels=False, radius=6, gap=12, pad=16,
           row=36, body=13, small=11, title=20, shadow=False, guidance=False, soft_group=False, nav_extra=0),
 'B': dict(name='Direction B — Refined Commerce', nav_labels=True, radius=12, gap=18, pad=22,
           row=44, body=14, small=12, title=22, shadow=True, guidance=True, soft_group=True, nav_extra=36),
}
_cache = {}
def font(size, bold=False, mono=False, gur=False):
    key=(int(size),bold,mono,gur)
    if key not in _cache:
        path = GUR if gur else (MONO_BOLD if mono and bold else MONO if mono else (LATIN_BOLD if bold else LATIN))
        _cache[key] = ImageFont.truetype(path, int(size))
    return _cache[key]

def is_gur(ch): return 0x0A00 <= ord(ch) <= 0x0A7F
def runs(text):
    out=[]; cur=''; flag=False
    for ch in text:
        g=is_gur(ch)
        if cur and g != flag:
            out.append((cur,flag)); cur=''
        cur += ch; flag=g
    if cur: out.append((cur,flag))
    return out

def text_w(text,size,bold=False,mono=False):
    return sum(font(size,bold,mono,g).getlength(seg) for seg,g in runs(text))

def draw_text(d,x,y,text,size,color,bold=False,mono=False,align='left',max_width=None,line_gap=1.32):
    if max_width:
        words=text.split(' '); lines=[]; cur=''
        for w in words:
            t=(cur+' '+w).strip()
            if cur and text_w(t,size,bold,mono)>max_width:
                lines.append(cur); cur=w
            else: cur=t
        if cur: lines.append(cur)
    else: lines=[text]
    yy=y
    for line in lines:
        w=text_w(line,size,bold,mono)
        xx = x if align=='left' else (x-w if align=='right' else x-w/2)
        for seg,g in runs(line):
            f=font(size,bold,mono,g)
            bb=f.getbbox(seg)
            d.text((xx, yy-bb[1]), seg, font=f, fill=color)
            xx += f.getlength(seg)
        yy += size*line_gap
    return yy

def panel(d,box,style,fill=None,outline=None,width=1,shadow=None):
    x1,y1,x2,y2=box; r=style['radius']
    if shadow:
        d.rounded_rectangle((x1+3,y1+4,x2+3,y2+4), radius=r, fill=C['shadow'])
    d.rounded_rectangle(box, radius=r, fill=fill or C['surface'], outline=outline or C['line'], width=width)

def chip(d,x,y,text,style,bg=None,fg=None,size=None,icon=None):
    size=size or style['small']
    label=(icon+' ' if icon else '')+text
    w=text_w(label,size,True)+18; h=size+14
    d.rounded_rectangle((x,y,x+w,y+h), radius=style['radius'], fill=bg or C['soft'], outline=None)
    draw_text(d,x+9,y+6,label,size,fg or C['accent'],bold=True)
    return w,h

def button(d,x,y,w,h,label,style,primary=True,disabled=False):
    if disabled:
        fill=C['disabled']; fg=C['muted']; outline=None
    elif primary:
        fill=C['accent']; fg=C['white']; outline=None
    else:
        fill=C['surface']; fg=C['accent']; outline=C['accent']
    d.rounded_rectangle((x,y,x+w,y+h), radius=style['radius'], fill=fill, outline=outline, width=1)
    draw_text(d,x+w/2,y+h/2-8,label,style['body'],fg,bold=True,align='center')

def table_row(d,x,y,w,h,cols,widths,style,right_cols=(),header=False,row_fill=None):
    if header:
        d.rounded_rectangle((x,y,x+w,y+h), radius=4, fill=C['bg'])
    elif row_fill:
        d.rectangle((x,y,x+w,y+h), fill=row_fill)
    cx=x
    for i,(col,cw) in enumerate(zip(cols,widths)):
        if i in right_cols:
            draw_text(d,x+sum(widths[:i+1])-8,y+(h-style['small'])/2-2,col,style['small'],C['text'] if not header else C['muted'],bold=header,mono=True,align='right')
        else:
            draw_text(d,x+sum(widths[:i])+8,y+(h-style['small'])/2-2,col,style['small'],C['text'] if not header else C['muted'],bold=header,max_width=cw-16)
    d.line((x,y+h-1,x+w,y+h-1),fill=C['line2'],width=1)

def layout(W,H,direction):
    s=STYLE[direction]
    if W<=1100:
        gutter=12; nav=48; right=320; gap=12; top=52; footer=26
    elif W<=1300:
        gutter=16; nav=64 if direction=='A' else 160; right=360; gap=16; top=56; footer=28
    elif W<=1400:
        gutter=24; nav=64 if direction=='A' else 180; right=384; gap=16; top=56; footer=28
    elif W<=1700:
        gutter=32; nav=72 if direction=='A' else 216; right=400; gap=24; top=60; footer=30
    else:
        gutter=40; nav=80 if direction=='A' else 240; right=420; gap=32; top=64; footer=32
    right_x=W-gutter-right; center_x=nav+gutter; center_w=right_x-gap-center_x
    content_y=top+gutter; content_bottom=H-footer-gutter
    return dict(nav=nav,gutter=gutter,right=right,right_x=right_x,center_x=center_x,center_w=center_w,
                gap=gap,top=top,footer=footer,content_y=content_y,content_bottom=content_bottom,
                content_h=content_bottom-content_y)

NAV=[('billing','B','Billing'),('stock','S','Stock'),('customers','C','Customers'),('payments','P','Payments'),('close','D','Day close'),('admin','A','Admin')]

def draw_shell(W,H,direction,screen):
    s=STYLE[direction]; L=layout(W,H,direction)
    img=Image.new('RGB',(W,H),C['bg']); d=ImageDraw.Draw(img)
    # nav rail
    d.rectangle((0,0,L['nav'],H-L['footer']),fill=C['nav'])
    draw_text(d,10 if not s['nav_labels'] else 18,16,'SORNIO',16 if not s['nav_labels'] else 20,C['white'],bold=True)
    draw_text(d,10 if not s['nav_labels'] else 18,38 if not s['nav_labels'] else 44,'SET THE STANDARD',8,C['navMuted'],bold=True)
    active={'W1':'billing','W2':'billing','W3':'billing','W4':'stock','W5':'customers','W6':'billing','W7':'admin'}[screen]
    ny=76
    for key,letter,label in NAV:
        sel=key==active
        if sel:
            d.rounded_rectangle((6,ny,L['nav']-6,ny+40),radius=s['radius'],fill=C['nav2'])
            d.rectangle((6,ny,9,ny+40),fill=C['focus'])
        if s['nav_labels']:
            draw_text(d,20,ny+11,(letter+'  ' if sel else '')+label,13,C['white'] if sel else C['navMuted'],bold=sel)
            ny+=48
        else:
            draw_text(d,L['nav']/2,ny+11,letter,16,C['white'] if sel else C['navMuted'],bold=True,align='center')
            ny+=48
    # topbar
    d.rectangle((L['nav'],0,W,L['top']),fill=C['surface'])
    d.line((L['nav'],L['top']-1,W,L['top']-1),fill=C['line'],width=1)
    draw_text(d,L['nav']+18,16,'SORNIO  ·  Sharma General Store  ·  Ravi (Owner)',s['small'],C['muted'],bold=False)
    # status chips
    x=W-18
    for label,bg,fg in [('DESIGN PROTOTYPE',C['soft'],C['accent']),('On this PC · Offline',C['bg'],C['text']),('Day open',C['successBg'],C['success'])]:
        w=text_w(label,s['small'],True)+18; x-=w+8
        d.rounded_rectangle((x,12,x+w,38),radius=999,fill=bg)
        draw_text(d,x+9,18,label,s['small'],fg,bold=True)
    # footer
    d.rectangle((0,H-L['footer'],W,H),fill='#EDEFF2')
    draw_text(d,12,H-L['footer']+7,'DESIGN PROTOTYPE — NOT PRODUCTION SOFTWARE  ·  SYNTHETIC DATA  ·  NOT INSTALLED WINDOWS APP',10,C['muted'],bold=True)
    draw_text(d,W-12,H-L['footer']+7,s['name'],10,C['accent'],bold=True,align='right')
    # panels
    cb=(L['center_x'],L['content_y'],L['right_x']-L['gap'],L['content_bottom'])
    rb=(L['right_x'],L['content_y'],W-L['gutter'],L['content_bottom'])
    panel(d,cb,s,shadow=s['shadow']); panel(d,rb,s,shadow=s['shadow'])
    return img,d,L,cb,rb,s

def header(d,box,title,subtitle,s,eyebrow=None):
    x1,y1,x2,y2=box; p=s['pad']; y=y1+p
    if eyebrow:
        draw_text(d,x1+p,y,eyebrow,s['small']-1,C['muted'],bold=True); y+=18
    y=draw_text(d,x1+p,y,title,s['title'],C['text'],bold=True)
    if subtitle:
        y=draw_text(d,x1+p,y+4,subtitle,s['small'],C['muted'],max_width=(x2-x1)-2*p)
    d.line((x1+p,y+10,x2-p,y+10),fill=C['line2'],width=1)
    return y+18

def W1(W,H,direction):
    img,d,L,cb,rb,s=draw_shell(W,H,direction,'W1')
    y=header(d,cb,'Billing workspace','Everything for today’s counter, on this PC.',s,'COUNTER / 04 NOV 2026')
    x1,y1,x2,y2=cb; p=s['pad']; cw=(x2-x1-2*p-s['gap'])//2; ch=110
    cards=[('Billing','Fast sale, exact SKU scan, cart and payment.','Open billing',True),('Stock','Items, quantities and low-stock signals.','View stock',False),('Customers / Udhar','Balances, repayments and statements.','Open khata',False),('Day closing','Expected cash, variance and reopen.','Open closing',False)]
    for i,(t,desc,act,primary) in enumerate(cards):
        cx=x1+p+(i%2)*(cw+s['gap']); cy=y+(i//2)*(ch+s['gap'])
        panel(d,(cx,cy,cx+cw,cy+ch),s,fill=C['surface'],outline=C['line'],shadow=False)
        draw_text(d,cx+14,cy+12,t,15,C['text'],bold=True)
        draw_text(d,cx+14,cy+38,desc,s['small'],C['muted'],max_width=cw-28)
        button(d,cx+14,cy+ch-42,min(cw-28,150),32,act,s,primary=primary)
    # right
    ry=header(d,rb,'Today at a glance','Synthetic demonstration figures.',s,'ON THIS PC')
    rx1,_,rx2,ry2=rb; rp=s['pad']
    metrics=[("Today's sales",'₹12,450.00'),('Collections','₹8,200.00'),('Outstanding','₹4,300.00'),('Low stock','3 items')]
    for label,val in metrics:
        d.rounded_rectangle((rx1+rp,ry,rx2-rp,ry+58),radius=s['radius'],fill=C['bg'])
        draw_text(d,rx1+rp+12,ry+8,label,s['small'],C['muted'],bold=True)
        draw_text(d,rx2-rp-12,ry+28,val,16,C['text'],bold=True,mono=True,align='right')
        ry+=66
    chip(d,rx1+rp,ry+8,'Day open · offline',s,bg=C['successBg'],fg=C['success'],icon='✓')
    return img

def W2(W,H,direction):
    img,d,L,cb,rb,s=draw_shell(W,H,direction,'W2')
    compact = H <= 600
    if compact:
        s = dict(s)
        s.update(row=30, body=12, small=10, pad=12, gap=10, title=18, guidance=False)
    x1,y1,x2,y2=cb; p=s['pad']; y=header(d,cb,'Billing','Scan or type an exact SKU. F2 focuses search.',s,'CASHIER')
    # search
    d.rounded_rectangle((x1+p,y,x2-p,y+44),radius=s['radius'],fill=C['bg'],outline=C['border'],width=2)
    draw_text(d,x1+p+12,y+12,'⌕  Scan or type SKU / name  ·  F2',s['body'],C['text'],bold=False)
    chip(d,x2-p-92,y+8,'Exact SKU',s,bg=C['soft'],fg=C['accent'],size=s['small']-1)
    y+=56
    # results
    draw_text(d,x1+p,y,'Product results · first 50',s['small'],C['muted'],bold=True); y+=22
    rows=[('ਵਿਕਰੀ ਲਈ ਸਮਾਨ · Basmati Rice 5 kg','RICE-5KG','₹425.00','12.500 kg'),('Atta 20 kg · Aashirvaad','ATTA-20','₹1,000.00','8 pcs'),('Fortune Sunflower Oil 1 L','OIL-1L','₹165.00','24 pcs'),('Cycle brake cable · long housing','BRK-CBL','₹85.00','3 pcs')]
    if compact: rows = rows[:3]
    widths=[int((x2-x1-2*p)*0.48),int((x2-x1-2*p)*0.20),int((x2-x1-2*p)*0.16),int((x2-x1-2*p)*0.16)]
    widths[0]=(x2-x1-2*p)-sum(widths[1:])
    table_row(d,x1+p,y,(x2-x1-2*p),30,['Product / SKU','Price','Stock'],[widths[0]+widths[1],widths[2],widths[3]],s,right_cols=(1,2),header=True)
    y+=30
    for name,sku,price,stock in rows:
        table_row(d,x1+p,y,(x2-x1-2*p),s['row'],[name+' · '+sku,price,stock],[widths[0]+widths[1],widths[2],widths[3]],s,right_cols=(1,2))
        y+=s['row']
    y+=14
    draw_text(d,x1+p,y,'Current sale · 2 lines',s['small'],C['muted'],bold=True); y+=22
    table_row(d,x1+p,y,(x2-x1-2*p),30,['Item','Qty','Line total'],[int((x2-x1-2*p)*0.55),int((x2-x1-2*p)*0.18),int((x2-x1-2*p)*0.27)],s,right_cols=(1,2),header=True)
    y+=30
    cart=[('Atta 20 kg · Aashirvaad','1','₹1,000.00'),('Basmati Rice 5 kg','0.250','₹106.25')]
    cw=[int((x2-x1-2*p)*0.55),int((x2-x1-2*p)*0.18),int((x2-x1-2*p)*0.27)]
    for name,qty,total in cart:
        table_row(d,x1+p,y,(x2-x1-2*p),s['row'],[name,qty,total],cw,s,right_cols=(1,2)); y+=s['row']
    # right
    ry=header(d,rb,'Checkout','Preview only. Native store revalidates before posting.',s,'PAYMENT')
    rx1,_,rx2,ry2=rb; rp=s['pad']; rw=rx2-rx1-2*rp
    chip(d,rx1+rp,ry,'Walk-in customer',s,bg=C['bg'],fg=C['text'],icon='○'); ry+=38
    draw_text(d,rx1+rp,ry,'Transaction type',s['small'],C['muted'],bold=True); ry+=20
    d.rounded_rectangle((rx1+rp,ry,rx2-rp,ry+38),radius=s['radius'],fill=C['bg'],outline=C['border'])
    draw_text(d,rx1+rp+10,ry+10,'Cash',s['body'],C['text']); ry+=50
    d.rounded_rectangle((rx1+rp,ry,rx2-rp,ry+82),radius=s['radius'],fill=C['soft'] if s['soft_group'] else C['bg'])
    draw_text(d,rx1+rp+12,ry+10,'Subtotal',s['small'],C['muted'])
    draw_text(d,rx2-rp-12,ry+10,'₹1,106.25',s['body'],C['text'],mono=True,align='right')
    draw_text(d,rx1+rp+12,ry+34,'Tax (5%)',s['small'],C['muted'])
    draw_text(d,rx2-rp-12,ry+34,'₹55.31',s['body'],C['text'],mono=True,align='right')
    draw_text(d,rx1+rp+12,ry+58,'TOTAL',s['body'],C['text'],bold=True)
    draw_text(d,rx2-rp-12,ry+54,'₹1,161.56',20,C['text'],bold=True,mono=True,align='right')
    ry+=96
    button(d,rx1+rp,ry,rw,44,'Review sale  ·  F4',s,primary=True); ry+=52
    if not compact:
        button(d,rx1+rp,ry,rw,36,'Find saved receipt',s,primary=False); ry+=44
    else:
        ry+=6
    draw_text(d,rx1+rp,ry,'F4 review · Enter confirm · F8 recover · Esc cancel',s['small']-1,C['muted'],max_width=rw)
    if s['guidance']:
        ry+=28; draw_text(d,rx1+rp,ry,'Tip: press F2, scan the code, then press Enter.',s['small'],C['accent'],max_width=rw)
    return img

def W3(W,H,direction):
    img,d,L,cb,rb,s=draw_shell(W,H,direction,'W3')
    x1,y1,x2,y2=cb; p=s['pad']; y=header(d,cb,'Split-payment reconciliation','Same financial workflow as a normal sale.',s,'CASHIER / REVIEW')
    # center cart summary
    d.rounded_rectangle((x1+p,y,x2-p,y+96),radius=s['radius'],fill=C['bg'])
    draw_text(d,x1+p+14,y+12,'Current sale · 1 line',s['small'],C['muted'],bold=True)
    draw_text(d,x1+p+14,y+38,'Atta 20 kg · Aashirvaad',s['body'],C['text'],bold=True)
    draw_text(d,x1+p+14,y+64,'1 × ₹1,000.00 · Tax 0% · SKU ATTA-20',s['small'],C['muted'])
    draw_text(d,x2-p-14,y+38,'₹1,000.00',18,C['text'],bold=True,mono=True,align='right')
    y+=112
    d.rounded_rectangle((x1+p,y,x2-p,y+92),radius=s['radius'],fill=C['warnBg'],outline=C['warn'])
    draw_text(d,x1+p+14,y+12,'△  PREVIEW ONLY — NOT POSTED',s['small'],C['warn'],bold=True)
    draw_text(d,x1+p+14,y+36,'The native store rechecks prices, stock, customer credit and exact payment totals before any sale is saved.',s['small'],C['text'],max_width=(x2-x1)-2*p-28)
    y+=108
    d.rounded_rectangle((x1+p,y,x2-p,y+80),radius=s['radius'],fill=C['successBg'],outline=C['success'])
    draw_text(d,x1+p+14,y+10,'✓  AFTER NATIVE CONFIRMATION',s['small'],C['success'],bold=True)
    draw_text(d,x1+p+14,y+34,'Sale saved on this PC · Invoice S-000000000042',s['small'],C['text'])
    draw_text(d,x1+p+14,y+56,'No duplicate sale · Original operation ID preserved',s['small'],C['muted'])
    # right
    ry=header(d,rb,'Allocate payment','₹1,000.00 invoice total',s,'NATIVE REVALIDATION')
    rx1,_,rx2,ry2=rb; rp=s['pad']; rw=rx2-rx1-2*rp
    chip(d,rx1+rp,ry,'● Cash recorded',s,bg=C['successBg'],fg=C['success'],icon=''); ry+=34
    chip(d,rx1+rp,ry,'▢ Customer credit — outstanding',s,bg=C['debtBg'],fg=C['debt'],icon=''); ry+=40
    draw_text(d,rx1+rp,ry,'Ravi Kumar · Available ₹1,600.00',s['small'],C['muted']); ry+=24
    alloc=[('Cash','₹600.00','●'),('Customer credit','₹400.00','▢'),('UPI','₹0.00','○'),('Card','₹0.00','○')]
    for label,val,icon in alloc:
        d.rounded_rectangle((rx1+rp,ry,rx2-rp,ry+42),radius=s['radius'],fill=C['surface'],outline=C['line'])
        draw_text(d,rx1+rp+10,ry+11,icon+'  '+label,s['body'],C['text'],bold=(label!='UPI' and label!='Card'))
        draw_text(d,rx2-rp-10,ry+11,val,s['body'],C['text'],mono=True,align='right')
        ry+=46
    d.rounded_rectangle((rx1+rp,ry,rx2-rp,ry+64),radius=s['radius'],fill=C['soft'])
    draw_text(d,rx1+rp+10,ry+8,'Allocated',s['small'],C['muted']); draw_text(d,rx2-rp-10,ry+8,'₹1,000.00',s['body'],C['text'],mono=True,align='right')
    draw_text(d,rx1+rp+10,ry+34,'Remaining',s['small'],C['muted'],bold=True); draw_text(d,rx2-rp-10,ry+32,'₹0.00',16,C['success'],bold=True,mono=True,align='right')
    ry+=76
    button(d,rx1+rp,ry,rw,44,'Confirm sale',s,primary=True); ry+=52
    draw_text(d,rx1+rp,ry,'Frontend preview is not proof of posting.',s['small']-1,C['warn'],bold=True,max_width=rw)
    return img

def W4(W,H,direction):
    img,d,L,cb,rb,s=draw_shell(W,H,direction,'W4')
    x1,y1,x2,y2=cb; p=s['pad']; y=header(d,cb,'Stock','Search, add and adjust items on this PC.',s,'INVENTORY')
    d.rounded_rectangle((x1+p,y,x2-p,y+42),radius=s['radius'],fill=C['bg'],outline=C['border'])
    draw_text(d,x1+p+12,y+11,'⌕  Search name or SKU',s['body'],C['muted']); y+=54
    button(d,x1+p,y,150,36,'+ Add item',s,primary=True); button(d,x1+p+162,y,190,36,'Record stock change',s,primary=False); y+=50
    total=x2-x1-2*p; widths=[int(total*0.44),int(total*0.18),int(total*0.16),int(total*0.12),int(total*0.10)]
    widths[0]=total-sum(widths[1:])
    table_row(d,x1+p,y,total,30,['Product / SKU','Price','Available','Status','Rev'],widths,s,right_cols=(1,2),header=True); y+=30
    rows=[('Basmati Rice 5 kg · RICE-5KG','₹425.00','12.500 kg','OK','4'),('Atta 20 kg · ATTA-20','₹1,000.00','8 pcs','OK','2'),('Fortune Oil 1 L · OIL-1L','₹165.00','2 pcs','Low','3'),('Cycle brake cable · BRK-CBL','₹85.00','3 pcs','Low','1'),('ਵਿਕਰੀ ਲਈ ਸਮਾਨ · Tea 250g','₹120.00','18 pcs','OK','2')]
    for r in rows:
        table_row(d,x1+p,y,total,s['row'],r,widths,s,right_cols=(1,2)); y+=s['row']
    # right
    ry=header(d,rb,'Item details','Read before changing stock.',s,'SELECTED ITEM')
    rx1,_,rx2,ry2=rb; rp=s['pad']; rw=rx2-rx1-2*rp
    d.rounded_rectangle((rx1+rp,ry,rx2-rp,ry+130),radius=s['radius'],fill=C['bg'])
    draw_text(d,rx1+rp+12,ry+12,'Atta 20 kg',16,C['text'],bold=True)
    draw_text(d,rx1+rp+12,ry+40,'SKU ATTA-20 · Unit pcs',s['small'],C['muted'])
    draw_text(d,rx1+rp+12,ry+68,'Price ₹1,000.00',s['body'],C['text'],mono=True)
    draw_text(d,rx1+rp+12,ry+96,'Available 8 pcs · Revision 2',s['small'],C['muted'])
    ry+=146
    button(d,rx1+rp,ry,rw,40,'Save stock change',s,primary=True); ry+=48
    chip(d,rx1+rp,ry,'Saved — acknowledgement pending',s,bg=C['pendingBg'],fg=C['pending'],icon='△')
    return img

def W5(W,H,direction):
    img,d,L,cb,rb,s=draw_shell(W,H,direction,'W5')
    x1,y1,x2,y2=cb; p=s['pad']; y=header(d,cb,'Customers / Udhar','ਗਾਹਕ ਉਧਾਰ · Balances, statements and repayments.',s,'KHATA')
    d.rounded_rectangle((x1+p,y,x2-p,y+42),radius=s['radius'],fill=C['bg'],outline=C['border'])
    draw_text(d,x1+p+12,y+11,'⌕  Search name, phone or customer ID',s['body'],C['muted']); y+=54
    total=x2-x1-2*p; widths=[int(total*0.50),int(total*0.25),int(total*0.25)]
    widths[0]=total-sum(widths[1:])
    table_row(d,x1+p,y,total,30,['Customer','Outstanding','Available'],widths,s,right_cols=(1,2),header=True); y+=30
    rows=[('Ravi Kumar · CUST-001','₹400.00','₹1,600.00'),('Meena Store · CUST-002','₹1,250.00','₹750.00'),('Asha Traders · CUST-003','₹0.00','₹2,000.00')]
    for r in rows:
        table_row(d,x1+p,y,total,s['row'],r,widths,s,right_cols=(1,2)); y+=s['row']
    y+=16
    draw_text(d,x1+p,y,'Statement · Ravi Kumar',s['small'],C['muted'],bold=True); y+=24
    sw=[int(total*0.45),int(total*0.25),int(total*0.30)]
    sw[0]=total-sum(sw[1:])
    table_row(d,x1+p,y,total,28,['Entry','Change','Balance'],sw,s,right_cols=(1,2),header=True); y+=28
    for r in [('Credit sale · S-000000000042','₹400.00','₹400.00'),('Cash repayment · RCP-018','-₹200.00','₹200.00'),('Credit sale · S-000000000051','₹200.00','₹400.00')]:
        table_row(d,x1+p,y,total,s['row'],r,sw,s,right_cols=(1,2)); y+=s['row']
    # right
    ry=header(d,rb,'Outstanding','Clear monetary status.',s,'SELECTED CUSTOMER')
    rx1,_,rx2,ry2=rb; rp=s['pad']; rw=rx2-rx1-2*rp
    d.rounded_rectangle((rx1+rp,ry,rx2-rp,ry+150),radius=s['radius'],fill=C['debtBg'])
    draw_text(d,rx1+rp+12,ry+12,'Ravi Kumar',16,C['text'],bold=True)
    draw_text(d,rx1+rp+12,ry+40,'Outstanding',s['small'],C['debt'])
    draw_text(d,rx1+rp+12,ry+62,'₹400.00',24,C['debt'],bold=True,mono=True)
    draw_text(d,rx1+rp+12,ry+104,'Limit ₹2,000.00 · Available ₹1,600.00',s['small'],C['text'])
    ry+=166
    button(d,rx1+rp,ry,rw,40,'Confirm credit entry',s,primary=True); ry+=48
    button(d,rx1+rp,ry,rw,36,'Print customer statement',s,primary=False); ry+=44
    chip(d,rx1+rp,ry,'Repayment ₹200.00 · saved',s,bg=C['successBg'],fg=C['success'],icon='✓')
    return img

def W6(W,H,direction):
    img,d,L,cb,rb,s=draw_shell(W,H,direction,'W6')
    x1,y1,x2,y2=cb; p=s['pad']; y=header(d,cb,'Checkout recovery','The exact request is kept on this PC.',s,'UNCERTAIN RESULT')
    d.rounded_rectangle((x1+p,y,x2-p,y+150),radius=s['radius'],fill=C['warnBg'],outline=C['warn'])
    draw_text(d,x1+p+16,y+14,'△  RESULT UNCERTAIN — RETRY SAME SALE',s['body'],C['warn'],bold=True)
    draw_text(d,x1+p+16,y+46,'The sale may or may not have been saved. Do not enter the items again.',s['small'],C['text'],max_width=(x2-x1)-2*p-32)
    draw_text(d,x1+p+16,y+80,'Original operation ID',s['small'],C['muted'],bold=True)
    d.rounded_rectangle((x1+p+16,y+104,x2-p-16,y+134),radius=4,fill=C['surface'],outline=C['line'])
    draw_text(d,x1+p+26,y+112,'9f2c4a10-7b6e-4c11-9d20-6a1f8e3b5c74',s['small'],C['text'],mono=True)
    y+=166
    d.rounded_rectangle((x1+p,y,x2-p,y+108),radius=s['radius'],fill=C['bg'])
    draw_text(d,x1+p+14,y+12,'Cart preserved',s['small'],C['muted'],bold=True)
    draw_text(d,x1+p+14,y+38,'1 × Atta 20 kg · ₹1,000.00',s['body'],C['text'])
    draw_text(d,x1+p+14,y+66,'Cash ₹600.00 · Customer credit ₹400.00',s['small'],C['muted'])
    draw_text(d,x2-p-14,y+38,'₹1,000.00',18,C['text'],bold=True,mono=True,align='right')
    y+=124
    chip(d,x1+p,y,'No duplicate sale will be created',s,bg=C['successBg'],fg=C['success'],icon='✓')
    # right
    ry=header(d,rb,'Safe retry','Native revalidation decides the outcome.',s,'RECOVERY STATUS')
    rx1,_,rx2,ry2=rb; rp=s['pad']; rw=rx2-rx1-2*rp
    d.rounded_rectangle((rx1+rp,ry,rx2-rp,ry+96),radius=s['radius'],fill=C['soft'])
    draw_text(d,rx1+rp+12,ry+12,'Recovery status',s['small'],C['muted'],bold=True)
    draw_text(d,rx1+rp+12,ry+36,'Pending · checkpoint preserved',s['body'],C['text'],bold=True)
    draw_text(d,rx1+rp+12,ry+66,'No new operation ID',s['small'],C['muted'])
    ry+=112
    button(d,rx1+rp,ry,rw,44,'Retry same sale  ·  F8',s,primary=True); ry+=52
    button(d,rx1+rp,ry,rw,36,'Copy confirmation ID',s,primary=False); ry+=44
    draw_text(d,rx1+rp,ry,'If the native store already saved the sale, retry returns the same receipt.',s['small']-1,C['muted'],max_width=rw)
    if s['guidance']:
        ry+=34; draw_text(d,rx1+rp,ry,'Tip: F8 is safe. It never starts a second sale.',s['small'],C['accent'],max_width=rw)
    return img

def W7(W,H,direction):
    img,d,L,cb,rb,s=draw_shell(W,H,direction,'W7')
    x1,y1,x2,y2=cb; p=s['pad']; y=header(d,cb,'What kind of business do you run?','Choose a starting profile. Only implemented modules are enabled.',s,'BUSINESS ONBOARDING')
    opts=[('Grocery / kirana','Daily billing, stock and udhar.'),('Cycle & spare parts','Item codes, stock and counter billing.'),('Small hardware','Long product names and mixed units.'),('General retail','Safe default — all implemented modules.')]
    cw=(x2-x1-2*p-s['gap'])//2; ch=104
    for i,(t,desc) in enumerate(opts):
        cx=x1+p+(i%2)*(cw+s['gap']); cy=y+(i//2)*(ch+s['gap'])
        selected=(i==0)
        panel(d,(cx,cy,cx+cw,cy+ch),s,fill=C['soft'] if selected else C['surface'],outline=C['accent'] if selected else C['line'],shadow=False)
        draw_text(d,cx+14,cy+12,('●  ' if selected else '○  ')+t,15,C['text'],bold=selected)
        draw_text(d,cx+14,cy+42,desc,s['small'],C['muted'],max_width=cw-28)
        draw_text(d,cx+14,cy+ch-28,'Template preview only · no AI decision',s['small']-1,C['muted'])
    y+=2*(ch+s['gap'])+8
    button(d,x1+p,y,220,40,'Continue with general retail',s,primary=True)
    # right
    ry=header(d,rb,'Enabled modules','Current Windows build only.',s,'DETERMINISTIC TEMPLATE')
    rx1,_,rx2,ry2=rb; rp=s['pad']; rw=rx2-rx1-2*rp
    mods=['Billing','Stock','Customers / Udhar','Payments','Day closing','Backup & recovery']
    for m in mods:
        chip(d,rx1+rp,ry,'✓  '+m,s,bg=C['successBg'],fg=C['success'],size=s['small']); ry+=34
    ry+=10
    d.rounded_rectangle((rx1+rp,ry,rx2-rp,ry+108),radius=s['radius'],fill=C['warnBg'],outline=C['warn'])
    draw_text(d,rx1+rp+12,ry+10,'CONCEPT ONLY — NOT ENABLED',s['small'],C['warn'],bold=True)
    draw_text(d,rx1+rp+12,ry+34,'Descriptive business profile and optional future AI assistance may suggest a template. They never post a sale or change permissions.',s['small'],C['text'],max_width=rw-24)
    ry+=122
    draw_text(d,rx1+rp,ry,'Hardware / cycle labels are proposed; current build uses the general-retail module set.',s['small']-1,C['muted'],max_width=rw)
    return img

SCREENS={'W1':W1,'W2':W2,'W3':W3,'W4':W4,'W5':W5,'W6':W6,'W7':W7}
SCREEN_TITLES={'W1':'Application shell','W2':'Cashier workspace','W3':'Split-payment reconciliation','W4':'Inventory','W5':'Customer credit','W6':'Transaction recovery','W7':'Business onboarding'}

# ---------- Android ----------
def android_base(title,subtitle,scr):
    W,H=412,915
    img=Image.new('RGB',(W,H),C['bg']); d=ImageDraw.Draw(img)
    # status bar
    d.rectangle((0,0,W,32),fill=C['surface'])
    draw_text(d,16,8,'9:41',12,C['text'],bold=True)
    draw_text(d,W-16,8,'● ▰',12,C['text'],align='right')
    # app header
    d.rectangle((0,32,W,104),fill=C['surface'])
    draw_text(d,18,46,'SORNIO',20,C['accent'],bold=True)
    draw_text(d,18,74,'Sharma General Store',12,C['muted'])
    chip(d,W-104,52,'DEMO',dict(radius=8,small=11),bg=C['warnBg'],fg=C['warn'])
    # demo banner
    d.rectangle((0,104,W,140),fill=C['warnBg'])
    draw_text(d,12,114,'DEMO DATA — NOT LIVE · figures may be outdated',11,C['warn'],bold=True)
    # title
    y=154
    draw_text(d,18,y,title,22,C['text'],bold=True); y+=32
    draw_text(d,18,y,subtitle,12,C['muted'],max_width=W-36); y+=34
    # bottom nav
    d.rectangle((0,H-72,W,H),fill=C['surface'])
    d.line((0,H-72,W,H-72),fill=C['line'],width=1)
    tabs=[('Home','⌂'),('Stock','▤'),('People','◉'),('Activity','≡'),('More','⋯')]
    active={'A1':0,'A2':1,'A3':2,'A4':3,'A5':4}[scr]
    tw=W//5
    for i,(lab,ic) in enumerate(tabs):
        col=C['accent'] if i==active else C['muted']
        draw_text(d,i*tw+tw/2,H-56,ic,18,col,align='center',bold=i==active)
        draw_text(d,i*tw+tw/2,H-30,lab,10,col,align='center',bold=i==active)
    return img,d,W,H,y

def card(d,x,y,w,h,title,value,hint=None,fill=None):
    d.rounded_rectangle((x,y,x+w,y+h),radius=14,fill=fill or C['surface'],outline=C['line'])
    draw_text(d,x+14,y+12,title,11,C['muted'],bold=True)
    draw_text(d,x+14,y+36,value,20,C['text'],bold=True,mono=True)
    if hint: draw_text(d,x+14,y+h-24,hint,11,C['muted'])

def A1():
    img,d,W,H,y=android_base('Shop overview','Day open · Last sync: demo copy, 04 Nov 09:12 IST','A1')
    chip(d,18,y,'● Day open',dict(radius=10,small=11),bg=C['successBg'],fg=C['success']); y+=42
    cw=(W-36-12)//2
    card(d,18,y,cw,96,"Today's sales",'₹12,450.00','₹8,200 cash · ₹4,250 credit'); card(d,18+cw+12,y,cw,96,'Collections','₹8,200.00','Cash recorded')
    y+=108
    card(d,18,y,cw,96,'Outstanding','₹4,300.00','Udhar / khata'); card(d,18+cw+12,y,cw,96,'Low stock','3','Items to review')
    y+=116
    draw_text(d,18,y,'Recent activity',14,C['text'],bold=True); y+=26
    for t,v,st in [('Sale · S-000000000051','₹1,000.00','Saved'),('Repayment · RCP-018','₹200.00','Saved'),('Sale · S-000000000050','₹120.00','Saved')]:
        d.rounded_rectangle((18,y,W-18,y+58),radius=12,fill=C['surface'],outline=C['line'])
        draw_text(d,30,y+10,t,12,C['text'],bold=True); draw_text(d,W-30,y+10,v,12,C['text'],mono=True,align='right')
        draw_text(d,30,y+34,st+' · read-only',10,C['muted']); y+=66
    return img

def A2():
    img,d,W,H,y=android_base('Stock','View only · no stock changes from Android','A2')
    d.rounded_rectangle((18,y,W-18,y+44),radius=12,fill=C['surface'],outline=C['border'],width=2)
    draw_text(d,30,y+13,'⌕  Search name or SKU',13,C['muted']); y+=56
    chip(d,18,y,'Read-only',dict(radius=10,small=11),bg=C['soft'],fg=C['accent'],icon='▢'); y+=38
    rows=[('Basmati Rice 5 kg','RICE-5KG','12.500 kg','OK'),('Atta 20 kg','ATTA-20','8 pcs','OK'),('Fortune Oil 1 L','OIL-1L','2 pcs','Low'),('Brake cable long','BRK-CBL','3 pcs','Low'),('ਵਿਕਰੀ ਲਈ ਸਮਾਨ · Tea','TEA-250','18 pcs','OK')]
    for name,sku,qty,st in rows:
        d.rounded_rectangle((18,y,W-18,y+84),radius=12,fill=C['surface'],outline=C['line'])
        draw_text(d,30,y+10,name,13,C['text'],bold=True)
        draw_text(d,30,y+34,sku+' · '+qty,11,C['muted'])
        col=C['success'] if st=='OK' else C['warn']; bg=C['successBg'] if st=='OK' else C['warnBg']
        chip(d,W-92,y+20,st,dict(radius=8,small=10),bg=bg,fg=col)
        y+=92
    return img

def A3():
    img,d,W,H,y=android_base('Customer balances','Udhar / khata · demo copy, not live','A3')
    d.rounded_rectangle((18,y,W-18,y+44),radius=12,fill=C['surface'],outline=C['border'],width=2)
    draw_text(d,30,y+13,'⌕  Search name or phone',13,C['muted']); y+=56
    d.rounded_rectangle((18,y,W-18,y+132),radius=14,fill=C['debtBg'],outline=C['debt'])
    draw_text(d,30,y+12,'Ravi Kumar · CUST-001',15,C['text'],bold=True)
    draw_text(d,30,y+40,'Outstanding',11,C['debt'])
    draw_text(d,30,y+60,'₹400.00',26,C['debt'],bold=True,mono=True)
    draw_text(d,30,y+102,'Limit ₹2,000.00 · Available ₹1,600.00',11,C['text'])
    y+=146
    draw_text(d,18,y,'Repayment history',14,C['text'],bold=True); y+=26
    for t,v in [('Cash repayment · RCP-018','-₹200.00'),('Credit sale · S-000000000042','₹400.00'),('Opening balance','₹200.00')]:
        d.rounded_rectangle((18,y,W-18,y+56),radius=12,fill=C['surface'],outline=C['line'])
        draw_text(d,30,y+10,t,12,C['text'],bold=True); draw_text(d,W-30,y+10,v,12,C['text'],mono=True,align='right')
        draw_text(d,30,y+32,'Data may be outdated · read-only',10,C['muted']); y+=64
    return img

def A4():
    img,d,W,H,y=android_base('Activity','Recent records · read-only presentation','A4')
    chip(d,18,y,'View only',dict(radius=10,small=11),bg=C['soft'],fg=C['accent'],icon='▢'); y+=38
    rows=[('Sale · S-000000000051','04 Nov 09:10 IST','₹1,000.00','Saved'),('Repayment · RCP-018','04 Nov 08:55 IST','₹200.00','Saved'),('Sale · S-000000000050','03 Nov 18:42 IST','₹120.00','Saved'),('UPI · PAY-007','03 Nov 17:20 IST','₹50.00','Pending — unverified'),('Return · RET-002','03 Nov 16:02 IST','₹5.63','Refund pending')]
    for ref,ts,val,st in rows:
        d.rounded_rectangle((18,y,W-18,y+88),radius=12,fill=C['surface'],outline=C['line'])
        draw_text(d,30,y+10,ref,12,C['text'],bold=True); draw_text(d,W-30,y+10,val,12,C['text'],mono=True,align='right')
        draw_text(d,30,y+34,ts,11,C['muted'])
        col=C['success'] if st=='Saved' else C['warn']; bg=C['successBg'] if st=='Saved' else C['warnBg']
        chip(d,30,y+56,st,dict(radius=8,small=10),bg=bg,fg=col)
        y+=96
    return img

def A5():
    img,d,W,H,y=android_base('Connectivity & sync','Live cloud sync is not enabled in Phase 1','A5')
    states=[('Online','Device has network access',C['successBg'],C['success'],'●'),('Offline','Showing cached copy',C['bg'],C['text'],'○'),('Last successfully synchronized','Demo copy · 04 Nov 09:12 IST',C['soft'],C['accent'],'✓'),('Data may be outdated','Do not treat as real-time balance',C['warnBg'],C['warn'],'△'),('Authentication required','Sign in again to refresh records',C['warnBg'],C['warn'],'!'),('Synchronization failed','Cached figures may be out of date',C['errorBg'],C['error'],'×')]
    for t,desc,bg,fg,icon in states:
        d.rounded_rectangle((18,y,W-18,y+78),radius=14,fill=bg,outline=fg if fg!=C['text'] else C['line'])
        draw_text(d,30,y+10,icon+'  '+t,13,fg,bold=True)
        draw_text(d,30,y+38,desc,11,C['text'],max_width=W-60)
        y+=86
    d.rounded_rectangle((18,y,W-18,y+62),radius=14,fill=C['surface'],outline=C['line'])
    draw_text(d,30,y+12,'productionSyncEnabled = false',12,C['text'],bold=True,mono=True)
    draw_text(d,30,y+36,'No live replication deployed',11,C['muted'])
    return img

ANDROID={'A1':A1,'A2':A2,'A3':A3,'A4':A4,'A5':A5}
AND_TITLES={'A1':'Shop overview','A2':'Inventory overview','A3':'Customer balances','A4':'Activity','A5':'Connectivity and sync status'}

def label_browser(W,H):
    img=Image.new('RGB',(W,H),C['currentBg']); d=ImageDraw.Draw(img)
    # current source approximation
    d.rectangle((0,0,238,H),fill=C['surface'])
    d.rectangle((238,0,W,73),fill=C['surface'])
    d.line((238,73,W,73),fill=C['currentLine'],width=1)
    draw_text(d,22,24,'Sornio',25,C['currentText'],bold=True)
    draw_text(d,22,90,'THIS DEVICE',10,C['currentMuted'],bold=True)
    draw_text(d,22,112,'Local workspace',13,C['currentText'],bold=True)
    draw_text(d,22,140,'Workspace draft',13,C['current'],bold=True)
    draw_text(d,22,176,'Checkout',13,C['currentText'])
    draw_text(d,22,212,'Items & stock',13,C['currentText'])
    draw_text(d,280,26,'Sharma General Store · Ravi · owner',11,C['currentMuted'])
    draw_text(d,W-160,26,'On this PC',10,C['currentMuted'])
    draw_text(d,280,110,'Your business.',44,C['currentText'],bold=True)
    draw_text(d,280,160,'Right here.',44,'#7b8999',bold=True)
    d.rounded_rectangle((280,230,W-60,310),radius=19,fill='#edf2f7',outline='#dfe6ee')
    draw_text(d,304,252,'Your draft stays on this device',12,C['currentText'],bold=True)
    draw_text(d,304,278,'Revision 12 · Local only',11,C['currentMuted'])
    d.rounded_rectangle((280,340,W-330,660),radius=24,fill=C['surface'],outline=C['currentLine'])
    draw_text(d,308,364,'Checkout',21,C['currentText'],bold=True)
    draw_text(d,308,398,'F2: find item · F3: edit quantity · F4: review',12,C['currentMuted'])
    d.rounded_rectangle((308,430,W-360,470),radius=12,fill='#fafbfc',outline=C['currentLine'])
    draw_text(d,320,444,'Search items for sale',12,C['currentMuted'])
    draw_text(d,308,500,'Subtotal: ₹5.31 · Tax: ₹0.27 (5%)',12,C['currentText'])
    draw_text(d,308,530,'Saved total: ₹5.58',16,C['currentText'],bold=True)
    d.rounded_rectangle((W-310,340,W-60,560),radius=24,fill='#edf0f4')
    draw_text(d,W-288,364,'A stronger foundation',11,C['currentMuted'],bold=True)
    draw_text(d,W-288,392,'A home on',24,C['currentText'],bold=True)
    draw_text(d,W-288,422,'your desktop.',24,C['currentText'],bold=True)
    draw_text(d,W-288,470,'The app screens are included in the Windows package.',11,C['currentMuted'],max_width=220)
    # browser render banner
    d.rectangle((0,0,W,34),fill=C['nav'])
    draw_text(d,12,9,'BROWSER RENDER — NOT INSTALLED WINDOWS APP',12,C['white'],bold=True)
    draw_text(d,W-12,9,'SOURCE-GROUNDED RECONSTRUCTION',11,C['navMuted'],bold=True,align='right')
    d.rectangle((0,H-28,W,H),fill='#EDEFF2')
    draw_text(d,12,H-20,'NOT A SCREENSHOT OF THE INSTALLED APPLICATION · current apps/desktop/src/style.css / main.tsx approximation',10,C['muted'],bold=True)
    return img

def make_sheet(panels, cols, cell_w, cell_h, out, title, subtitle):
    rows=math.ceil(len(panels)/cols)
    W=cols*cell_w+40; H=rows*(cell_h+54)+90
    img=Image.new('RGB',(W,H),'#EDF0F4'); d=ImageDraw.Draw(img)
    draw_text(d,20,16,title,20,C['text'],bold=True)
    draw_text(d,20,44,subtitle,12,C['muted'])
    for i,(lab,im) in enumerate(panels):
        r=i//cols; c=i%cols; x=20+c*cell_w; y=76+r*(cell_h+54)
        thumb=im.resize((cell_w-8,cell_h-8),Image.Resampling.LANCZOS)
        img.paste(thumb,(x+4,y+4))
        d.rectangle((x+4,y+4,x+cell_w-4,y+cell_h-4),outline=C['border'],width=1)
        draw_text(d,x+6,y+cell_h+8,lab,12,C['text'],bold=True)
    img.save(out,optimize=True)

def build():
    manifest={'classification':'DESIGN PROTOTYPE — NOT PRODUCTION SOFTWARE / SYNTHETIC DATA','sourceMain':'1cc5c798d1eada9a16463213b0776c01e99d36f9','windows':{},'android':{},'comparison':{},'browserRender':{}}
    # W1-W7 at 1366x768 for both directions
    for dr in ['A','B']:
        for scr,fn in SCREENS.items():
            im=fn(1366,768,dr)
            rel=f'assets/windows/direction-{dr.lower()}/{scr}-{SCREEN_TITLES[scr].lower().replace(" ","-").replace("/","-")}.png'
            path=os.path.join(ROOT,rel); im.save(path,optimize=True)
            manifest['windows'][f'{dr}-{scr}']={'file':rel,'label':SCREEN_TITLES[scr],'direction':dr,'viewport':'1366x768','classification':'DESIGN PROTOTYPE — NOT PRODUCTION SOFTWARE','synthetic':True}
    # Responsive W2 at required sizes
    vps=[(1280,720,'1280x720'),(1366,768,'1366x768'),(1600,900,'1600x900'),(1920,1080,'1920x1080'),(1024,576,'125-percent-1024x576')]
    for dr in ['A','B']:
        for W,H,tag in vps:
            im=W2(W,H,dr)
            rel=f'assets/windows/direction-{dr.lower()}/responsive/W2-cashier-{tag}.png'
            im.save(os.path.join(ROOT,rel),optimize=True)
            manifest['windows'][f'{dr}-responsive-{tag}']={'file':rel,'label':'Cashier workspace responsive capture','direction':dr,'viewport':tag,'classification':'DESIGN PROTOTYPE — NOT PRODUCTION SOFTWARE','synthetic':True}
    # Comparison sheets
    a=SCREENS['W2'](1366,768,'A'); b=SCREENS['W2'](1366,768,'B')
    make_sheet([('Direction A — Precision Retail · 1366×768',a),('Direction B — Refined Commerce · 1366×768',b)],2,660,380,os.path.join(COMP,'direction-comparison.png'),'SORNIO — DIRECTION A vs DIRECTION B','Same cashier workflow · same synthetic ₹1,161.56 sale · different geometry and density')
    manifest['comparison']['direction-comparison']={'file':'assets/windows/comparison/direction-comparison.png','label':'Two design directions','classification':'DESIGN PROTOTYPE — NOT PRODUCTION SOFTWARE','synthetic':True}
    panels=[]
    for tag,W,H in [('1280×720',1280,720),('1920×1080',1920,1080)]:
        for dr,label in [('A','Direction A'),('B','Direction B')]:
            panels.append((f'{label} · {tag}',SCREENS['W2'](W,H,dr)))
    make_sheet(panels,2,620,360,os.path.join(COMP,'responsive-side-by-side-1280-vs-1920.png'),'RESPONSIVE SIDE-BY-SIDE — 1280 × 720 / 1920 × 1080','Cart, invoice total, payment controls and primary checkout action remain visible')
    manifest['comparison']['responsive-side-by-side']={'file':'assets/windows/comparison/responsive-side-by-side-1280-vs-1920.png','label':'1280x720 / 1920x1080 side-by-side','classification':'DESIGN PROTOTYPE — NOT PRODUCTION SOFTWARE','synthetic':True}
    allv=[]
    for tag,W,H in [('1280×720',1280,720),('1366×768',1366,768),('1600×900',1600,900),('1920×1080',1920,1080)]:
        for dr,label in [('A','A'),('B','B')]: allv.append((f'Direction {label} · {tag}',SCREENS['W2'](W,H,dr)))
    make_sheet(allv,2,470,275,os.path.join(COMP,'responsive-matrix.png'),'WINDOWS RESPONSIVE MATRIX','1280×720 · 1366×768 · 1600×900 · 1920×1080 · both directions')
    manifest['comparison']['responsive-matrix']={'file':'assets/windows/comparison/responsive-matrix.png','label':'Four viewport matrix','classification':'DESIGN PROTOTYPE — NOT PRODUCTION SOFTWARE','synthetic':True}
    # 125% sheet
    make_sheet([('Direction A · 125% scaling (~1024×576 CSS px)',SCREENS['W2'](1024,576,'A')),('Direction B · 125% scaling (~1024×576 CSS px)',SCREENS['W2'](1024,576,'B'))],2,520,310,os.path.join(COMP,'responsive-125-percent.png'),'WINDOWS 125% SCALING CHECK','Effective CSS viewport ~1024×576 · total and confirm pinned')
    manifest['comparison']['responsive-125']={'file':'assets/windows/comparison/responsive-125-percent.png','label':'125% scaling comparison','classification':'DESIGN PROTOTYPE — NOT PRODUCTION SOFTWARE','synthetic':True}
    # Android
    for scr,fn in ANDROID.items():
        im=fn(); rel=f'assets/android/previews/{scr}-{AND_TITLES[scr].lower().replace(" ","-").replace("&","and")}.png'
        im.save(os.path.join(ROOT,rel),optimize=True)
        manifest['android'][scr]={'file':rel,'label':AND_TITLES[scr],'viewport':'412x915','classification':'DESIGN PROTOTYPE — NOT PRODUCTION SOFTWARE / DEMO DATA — NOT LIVE','synthetic':True}
    make_sheet([(f'{k} — {AND_TITLES[k]}',ANDROID[k]()) for k in ['A1','A2','A3','A4','A5']],5,260,580,os.path.join(AND,'android-comparison-sheet.png'),'SORNIO ANDROID COMPANION — A1 TO A5','Phone-first cards · read-only · honest data freshness · synthetic demo data')
    manifest['android']['comparison']={'file':'assets/android/android-comparison-sheet.png','label':'A1–A5 gallery','classification':'DESIGN PROTOTYPE — NOT PRODUCTION SOFTWARE','synthetic':True}
    # Browser render
    br=label_browser(1280,720); br.save(os.path.join(BR,'current-source-reconstruction.png'),optimize=True)
    manifest['browserRender']={'file':'assets/browser-render/current-source-reconstruction.png','label':'BROWSER RENDER — NOT INSTALLED WINDOWS APP','classification':'SOURCE-GROUNDED RECONSTRUCTION','synthetic':True,'html':'assets/browser-render/current-source-reconstruction.html'}
    # The licensed font, OFL text and CSS snapshot are committed beside this generator.
    for required in [os.path.join(FONTS,'noto-sans-gurmukhi.woff2'),
                     os.path.join(FONTS,'NotoSansGurmukhi-OFL.txt'),
                     os.path.join(BR,'current-style.css')]:
        if not os.path.exists(required):
            raise SystemExit('Missing committed prototype asset: '+required)
    # HTML files
    open(os.path.join(BR,'current-source-reconstruction.html'),'w').write('''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>BROWSER RENDER — NOT INSTALLED WINDOWS APP</title>
<link rel="stylesheet" href="current-style.css">
<style>.browser-banner{position:fixed;z-index:99;top:0;left:0;right:0;background:#182333;color:#fff;padding:8px 14px;font:600 12px "Segoe UI",sans-serif;letter-spacing:.4px}body{padding-top:34px}.recon-note{position:fixed;bottom:0;left:0;right:0;background:#EDEFF2;color:#667085;padding:6px 14px;font:600 10px "Segoe UI",sans-serif}</style></head>
<body><div class="browser-banner">BROWSER RENDER — NOT INSTALLED WINDOWS APP · static source-grounded DOM reconstruction, not a React runtime capture</div>
<div class="desktop-shell"><aside class="rail"><a class="wordmark" href="#main">Sornio</a><div class="workspace-name"><span class="eyebrow">THIS DEVICE</span><strong>Local workspace</strong><span>Windows foundation</span></div><nav aria-label="Workspace"><a class="selected" href="#main">◈ Workspace draft</a><a href="#checkout">Checkout</a><a href="#inventory-heading">Items &amp; stock</a></nav><div class="rail-bottom"><span class="status-dot"/> Built for your counter.<p>Local review · 0.3.0</p></div></aside>
<main id="main"><header class="topbar"><span>Sharma General Store · Ravi · owner</span><div class="topbar-actions"><span class="chip"><span class="status-dot"/> On this PC</span><button class="quiet-button" type="button">Lock workspace</button></div></header>
<div class="page"><div class="heading"><div><p class="eyebrow">SORNIO FOR WINDOWS</p><h1>Your business.<br/><span>Right here.</span></h1><p class="intro">A dedicated workspace that opens from your PC.</p></div><span class="review-label">Storage foundation<br/>Use test data only</span></div>
<section class="status-panel" aria-label="Local storage status"><span class="status-icon">↳</span><div><strong>Your draft stays on this device</strong><p role="status">Revision 12 · Local only</p></div><span class="revision">Revision 12</span></section>
<section class="panel checkout-panel" id="checkout"><div class="panel-heading"><div><p class="eyebrow">LOCAL CASHIER</p><h2>Checkout</h2></div><span class="small-chip">Synthetic preview</span></div><p class="muted">F2: find item · F3: edit quantity · Enter: add exact code or single match · F4: review · Enter: confirm · F8: recover pending sale</p><label for="recon-search">Search items for sale</label><input id="recon-search" placeholder="Search items for sale"/><p class="checkout-total">Subtotal: ₹5.31 · Tax: ₹0.27<br/><output>Total: ₹5.58</output></p></section>
<div class="workspace-grid"><form class="panel"><div class="panel-heading"><div><p class="eyebrow">FIRST WORKSPACE</p><h2>Keep a local draft.</h2></div><span class="small-chip">Saved</span></div><label for="bn">Business name</label><input id="bn" value="Sharma General Store"/><label for="bt">Business type</label><select id="bt"><option>General retail</option></select><label for="note">Workspace note</label><textarea id="note">Synthetic reconstruction</textarea></form><aside class="side-panel"><p class="eyebrow">A STRONGER FOUNDATION</p><h2>A home on<br/>your desktop.</h2><p>The app screens are included in the Windows package. Opening this workspace does not load the public website.</p><div class="divider"/><h3>What this review includes</h3><ul><li>Local draft save and reopen</li><li>Encrypted device storage</li><li>Password lock and unlock</li></ul></aside></div>
</div></main></div><div class="recon-note">NOT A SCREENSHOT OF THE INSTALLED APPLICATION · snapshot of apps/desktop/src/style.css from origin/main @ 1cc5c79 · relative font path adjusted for prototype only.</div></body></html>''')
    # index / CSS / JS / README / font note
    open(os.path.join(ROOT,'prototype.css'),'w').write('''*{box-sizing:border-box}body{margin:0;background:#F7F8FA;color:#182333;font:14px/1.5 "Segoe UI",system-ui,sans-serif}header.top{background:#182333;color:#fff;padding:18px 28px}header.top h1{margin:0;font-size:22px}header.top p{margin:4px 0 0;color:#C7D0DC;font-size:13px}.wrap{max-width:1240px;margin:24px auto;padding:0 20px}.tabs{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.tabs button,select{font:inherit;min-height:40px;padding:8px 14px;border:1px solid #7A8699;border-radius:8px;background:#fff;color:#182333}.tabs button[aria-pressed=true]{background:#246B65;color:#fff;border-color:#246B65}:focus-visible{outline:3px solid #246B65;outline-offset:2px}.stage{background:#fff;border:1px solid #D8DEE6;border-radius:12px;padding:18px}.stage img{max-width:100%;height:auto;display:block;border:1px solid #E4E7EC}.caption{margin-top:12px;color:#667085;font-size:13px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px}.grid figure{margin:0;background:#fff;border:1px solid #D8DEE6;border-radius:12px;padding:12px}.grid img{width:100%;height:auto}.badge{display:inline-block;background:#FFF4D6;color:#8A5A00;border-radius:999px;padding:4px 10px;font-size:11px;font-weight:700;letter-spacing:.4px}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;transition:none!important;animation:none!important}}''')
    open(os.path.join(ROOT,'prototype.js'),'w').write('''const DATA = {
  A: {label:'Direction A — Precision Retail', screens:{W1:['W1-application-shell.png','W1 — Application shell'],W2:['W2-cashier-workspace.png','W2 — Cashier workspace'],W3:['W3-split-payment-reconciliation.png','W3 — Split-payment reconciliation'],W4:['W4-inventory.png','W4 — Inventory'],W5:['W5-customer-credit.png','W5 — Customer credit'],W6:['W6-transaction-recovery.png','W6 — Transaction recovery'],W7:['W7-business-onboarding.png','W7 — Business onboarding']}, dir:'direction-a'},
  B: {label:'Direction B — Refined Commerce', screens:{W1:['W1-application-shell.png','W1 — Application shell'],W2:['W2-cashier-workspace.png','W2 — Cashier workspace'],W3:['W3-split-payment-reconciliation.png','W3 — Split-payment reconciliation'],W4:['W4-inventory.png','W4 — Inventory'],W5:['W5-customer-credit.png','W5 — Customer credit'],W6:['W6-transaction-recovery.png','W6 — Transaction recovery'],W7:['W7-business-onboarding.png','W7 — Business onboarding']}, dir:'direction-b'},
  android: {label:'Android companion', screens:{A1:['A1-shop-overview.png','A1 — Shop overview'],A2:['A2-inventory-overview.png','A2 — Inventory overview'],A3:['A3-customer-balances.png','A3 — Customer balances'],A4:['A4-activity.png','A4 — Activity'],A5:['A5-connectivity-and-sync-status.png','A5 — Connectivity and sync status']}, dir:'android/previews'}
};
function setView(dir, screen){
  const cfg = DATA[dir] || DATA.A;
  const item = cfg.screens[screen] || cfg.screens[Object.keys(cfg.screens)[0]];
  const base = dir === 'android' ? 'assets/android/previews/' : 'assets/windows/' + cfg.dir + '/';
  const img = document.getElementById('preview');
  img.src = base + item[0];
  img.alt = item[1] + ' — design prototype, not production software';
  document.getElementById('caption').textContent = cfg.label + ' · ' + item[1] + ' · DESIGN PROTOTYPE — NOT PRODUCTION SOFTWARE · SYNTHETIC DATA';
  document.querySelectorAll('[data-direction]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.direction === dir)));
  document.querySelectorAll('[data-screen]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.screen === screen)));
  location.hash = dir + '-' + screen;
}
function fromHash(){ const m = (location.hash || '#A-W2').slice(1).split('-'); setView(m[0], m.slice(1).join('-')); }
window.addEventListener('hashchange', fromHash);
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-direction]').forEach(b => b.addEventListener('click', () => setView(b.dataset.direction, b.dataset.defaultScreen)));
  document.querySelectorAll('[data-screen]').forEach(b => b.addEventListener('click', () => setView(b.dataset.dir, b.dataset.screen)));
  fromHash();
});
''')
    open(os.path.join(ROOT,'index.html'),'w').write('''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SORNIO — Phase 7 Assignment 2 Visual Preview</title><link rel="stylesheet" href="prototype.css"></head><body>
<header class="top"><h1>SORNIO — Phase 7 Assignment 2</h1><p>PRECISION WORKSPACE · Windows + Android design prototypes · synthetic data only · not production software</p></header>
<div class="wrap"><p><span class="badge">DESIGN PROTOTYPE — NOT PRODUCTION SOFTWARE</span></p>
<h2>Navigable Windows preview</h2><div class="tabs" id="directions"><button data-direction="A" data-default-screen="W2">Direction A — Precision Retail</button><button data-direction="B" data-default-screen="W2">Direction B — Refined Commerce</button></div>
<div class="tabs" id="screensA"><button data-dir="A" data-screen="W1">W1 Shell</button><button data-dir="A" data-screen="W2">W2 Cashier</button><button data-dir="A" data-screen="W3">W3 Split</button><button data-dir="A" data-screen="W4">W4 Stock</button><button data-dir="A" data-screen="W5">W5 Udhar</button><button data-dir="A" data-screen="W6">W6 Recovery</button><button data-dir="A" data-screen="W7">W7 Onboarding</button></div>
<div class="tabs" id="screensB"><button data-dir="B" data-screen="W1">W1 Shell</button><button data-dir="B" data-screen="W2">W2 Cashier</button><button data-dir="B" data-screen="W3">W3 Split</button><button data-dir="B" data-screen="W4">W4 Stock</button><button data-dir="B" data-screen="W5">W5 Udhar</button><button data-dir="B" data-screen="W6">W6 Recovery</button><button data-dir="B" data-screen="W7">W7 Onboarding</button></div>
<div class="stage"><img id="preview" src="assets/windows/direction-a/W2-cashier-workspace.png" alt="Windows design prototype"><p class="caption" id="caption"></p></div>
<h2>Android companion preview</h2><div class="tabs"><button data-direction="android" data-default-screen="A1">Android A1–A5</button><button data-dir="android" data-screen="A1">A1 Overview</button><button data-dir="android" data-screen="A2">A2 Stock</button><button data-dir="android" data-screen="A3">A3 Balances</button><button data-dir="android" data-screen="A4">A4 Activity</button><button data-dir="android" data-screen="A5">A5 Sync</button></div>
<h2>Comparison and responsive evidence</h2><div class="grid"><figure><img src="assets/windows/comparison/direction-comparison.png" alt="Direction comparison"><figcaption>Two design directions</figcaption></figure><figure><img src="assets/windows/comparison/responsive-side-by-side-1280-vs-1920.png" alt="1280 and 1920 side by side"><figcaption>1280×720 / 1920×1080</figcaption></figure><figure><img src="assets/windows/comparison/responsive-matrix.png" alt="Responsive matrix"><figcaption>Four viewport matrix</figcaption></figure><figure><img src="assets/windows/comparison/responsive-125-percent.png" alt="125 percent scaling"><figcaption>125% scaling check</figcaption></figure></div>
<h2>Evidence categories</h2><p><strong>INSTALLED WINDOWS APPLICATION — AUTHENTIC CAPTURE:</strong> none successfully decoded in this sandbox. <strong>BROWSER RENDER — NOT INSTALLED WINDOWS APP:</strong> <a href="assets/browser-render/current-source-reconstruction.html">source reconstruction</a> / <a href="assets/browser-render/current-source-reconstruction.png">preview</a>. <strong>DESIGN PROTOTYPE — NOT PRODUCTION SOFTWARE:</strong> every PNG in this directory.</p>
</div><script src="prototype.js"></script></body></html>''')
    open(os.path.join(ROOT,'FONT-LICENSES.md'),'w').write('''# Prototype font notes\n\n- Static PNG previews were generated with system **DejaVu Sans / DejaVu Sans Mono** (permissive Bitstream Vera / DejaVu licence) and a temporary TTF conversion of the repository's bundled **Noto Sans Gurmukhi** subset.\n- The bundled subset `assets/fonts/noto-sans-gurmukhi.woff2` is copied unchanged from `apps/desktop/public/fonts/` on `origin/main` @ `1cc5c79`; its **SIL Open Font License 1.1** text is included as `NotoSansGurmukhi-OFL.txt`.\n- No new font is introduced into production. The HTML browser-render snapshot adjusts only the relative `@font-face` path.\n- Pillow's basic layout engine does not perform full Gurmukhi complex shaping; the browser HTML uses the original WOFF2 where shaping is available. Gurmukhi print correctness remains a physical-hardware gate.\n''')
    open(os.path.join(ROOT,'README.md'),'w').write('''# SORNIO — Phase 7 Assignment 2 visual assets\n\n**Status:** NONPRODUCTION DESIGN REVIEW. Every image here is a **DESIGN PROTOTYPE — NOT PRODUCTION SOFTWARE** using synthetic demonstration data. No image is a screenshot of the installed Windows application.\n\n## Open first\n- [Navigable preview](index.html) — switch Direction A/B, W1–W7 and Android A1–A5.\n- [Direction A vs Direction B](assets/windows/comparison/direction-comparison.png)\n- [1280×720 / 1920×1080 side-by-side](assets/windows/comparison/responsive-side-by-side-1280-vs-1920.png)\n- [Four-viewport responsive matrix](assets/windows/comparison/responsive-matrix.png)\n- [125% scaling comparison](assets/windows/comparison/responsive-125-percent.png)\n\n## Windows prototypes\n- Direction A: [W1](assets/windows/direction-a/W1-application-shell.png) · [W2](assets/windows/direction-a/W2-cashier-workspace.png) · [W3](assets/windows/direction-a/W3-split-payment-reconciliation.png) · [W4](assets/windows/direction-a/W4-inventory.png) · [W5](assets/windows/direction-a/W5-customer-credit.png) · [W6](assets/windows/direction-a/W6-transaction-recovery.png) · [W7](assets/windows/direction-a/W7-business-onboarding.png)\n- Direction B: [W1](assets/windows/direction-b/W1-application-shell.png) · [W2](assets/windows/direction-b/W2-cashier-workspace.png) · [W3](assets/windows/direction-b/W3-split-payment-reconciliation.png) · [W4](assets/windows/direction-b/W4-inventory.png) · [W5](assets/windows/direction-b/W5-customer-credit.png) · [W6](assets/windows/direction-b/W6-transaction-recovery.png) · [W7](assets/windows/direction-b/W7-business-onboarding.png)\n- Responsive captures: `assets/windows/direction-a/responsive/` and `assets/windows/direction-b/responsive/`.\n\n## Android prototypes\n[A1 Shop overview](assets/android/previews/A1-shop-overview.png) · [A2 Inventory](assets/android/previews/A2-inventory-overview.png) · [A3 Customer balances](assets/android/previews/A3-customer-balances.png) · [A4 Activity](assets/android/previews/A4-activity.png) · [A5 Connectivity](assets/android/previews/A5-connectivity-and-sync-status.png) · [A1–A5 sheet](assets/android/android-comparison-sheet.png)\n\n## Evidence categories\n- **INSTALLED WINDOWS APPLICATION — AUTHENTIC CAPTURE:** none were decoded in this sandbox; see `docs/design/PHASE-7-ASSIGNMENT-2-VISUAL-EVIDENCE.md`.\n- **BROWSER RENDER — NOT INSTALLED WINDOWS APP:** [HTML source reconstruction](assets/browser-render/current-source-reconstruction.html) and [PNG preview](assets/browser-render/current-source-reconstruction.png).\n- **DESIGN PROTOTYPE — NOT PRODUCTION SOFTWARE:** all prototype PNGs above.\n\nSee [manifest.json](manifest.json) for machine-readable labels and [FONT-LICENSES.md](FONT-LICENSES.md) for font provenance.\n''')
    open(os.path.join(ROOT,'manifest.json'),'w').write(json.dumps(manifest,indent=2,ensure_ascii=False)+'\n')
    print('generated assets in',ROOT)

if __name__=='__main__': build()
