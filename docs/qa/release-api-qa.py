#!/usr/bin/env python3
"""Release QA, localhost only; requires a fresh disposable DB. No production writes.
Run once after release-start.py. Evidence is redacted; raw synthetic credentials stay /tmp.
"""
import concurrent.futures as cf, copy, json, pathlib, urllib.request, urllib.error, uuid, os, re, time, base64, hmac, hashlib
BASE='http://127.0.0.1:18081'
OUT=pathlib.Path(__file__).parent/'release-evidence'
PRIVATE=pathlib.Path('/tmp/qr-order-release-qa')
TOKEN=''; CREDS={}; RESULTS=[]; TRACE=[]
def redact(v):
 if isinstance(v,dict): return {k:('[REDACTED]' if any(s in k.lower() for s in ['token','passcode','qr','hash']) else redact(x)) for k,x in v.items()}
 if isinstance(v,list): return [redact(x) for x in v]
 if isinstance(v,str): return re.sub(r'(?i)(token=)[0-9a-f]{64}',r'\1[REDACTED]',v)
 return v
def api(path,body=None,staff=False,method='POST',headers=None):
 hdr={'Content-Type':'application/json'}
 if staff: hdr['Authorization']='Bearer '+TOKEN
 hdr.update(headers or {})
 req=urllib.request.Request(BASE+path,data=json.dumps(body or {}).encode() if method!='GET' else None,headers=hdr,method=method)
 try:
  with urllib.request.urlopen(req,timeout=15) as r: status=r.status; raw=r.read()
 except urllib.error.HTTPError as r: status=r.code; raw=r.read()
 try: res=json.loads(raw)
 except ValueError: res={'raw':raw.decode()[:300]}
 TRACE.append({'path':path,'method':method,'request':redact(body),'status':status,'response':redact(res)})
 return status,res

def check(name,ok,actual=None):
 row={'name':name,'result':'PASS' if ok else 'FAIL','actual':redact(actual)}; RESULTS.append(row); print(json.dumps(row,ensure_ascii=False),flush=True)
def c(path,b=None,t='T01'): return api('/api/v1/customer/'+path,dict(CREDS[t],**(b or {})))
def s(path,b=None): return api('/api/v1/staff/'+path,b,True)
def a(path,b=None,method='PUT'): return api('/api/v1/admin/'+path,b,True,method)
def data(r):
 assert r[0]==200,redact(r)
 return r[1].get('data')
def setting(k,v): return a('settings/'+k,{'value':str(v)})
def payload(t='T01',q=1,menu='chicken-feet',price=10000,**kw): return dict(CREDS[t],clientRequestId=str(uuid.uuid4()),expectedTotalAmount=q*price,note='QA synthetic',items=[{'menuId':menu,'quantity':q}],**kw)
def create(p): return api('/api/v1/customer/orders/create',p)
def order(t='T01',**kw): return data(create(payload(t,**kw)))
def bill(t): return data(s('tables/bill',{'tableId':t}))
def detail(t): return data(s('tables/detail',{'tableId':t}))
def payment(t):
 b=bill(t); d=detail(t)
 return dict(tableId=t,expectedSessionId=d['sessionId'],clientRequestId=str(uuid.uuid4()),expectedFinalAmount=b['finalAmount'],payerName='QA synthetic payer')
def menu(price=10000,**kw): return dict(categoryId='main',name='QA 검증 메뉴',description='QA only',basePrice=price,available=True,minQuantity=1,maxQuantity=10,sortOrder=99,**kw)
def save():
 OUT.mkdir(exist_ok=True); (OUT/'api-results.json').write_text(json.dumps(RESULTS,ensure_ascii=False,indent=2));(OUT/'api-trace.json').write_text(json.dumps(TRACE,ensure_ascii=False,indent=2))
def main():
 global TOKEN
 r=api('/actuator/health/readiness',method='GET');check('health readiness',r[0]==200,r)
 for path in ['staff/tables/list','staff/orders/queue','staff/events','admin/snapshot','admin/menus/qa']:
  r=api('/api/v1/'+path);check('unauthenticated '+path,r[0]==401,r)
 r=api('/api/v1/staff/login',{'passcode':'wrong','deviceLabel':'카운터'});check('wrong login',r[0]==401,r)
 r=api('/api/v1/staff/login',{'passcode':'release-qa-only','deviceLabel':'카운터'});TOKEN=data(r)['staffToken'];check('valid login',r[0]==200)
 for i in range(1,31):
  tid=f'T{i:02}'; d=data(a('tables/'+tid,{'displayName':f'QA {i:02}','sortOrder':i},'POST'))
  from urllib.parse import urlparse,parse_qs
  token=d.get('tableToken') or d.get('token')
  if not token: token=parse_qs(urlparse(next(v for v in d.values() if isinstance(v,str) and '?token=' in v)).query)['token'][0]
  CREDS[tid]={'tableId':tid,'tableToken':token}
 PRIVATE.mkdir(exist_ok=True); p=PRIVATE/'credentials.json';p.write_text(json.dumps({'staffToken':TOKEN,'tables':CREDS}));os.chmod(p,0o600)
 r=c('bootstrap');check('QR bootstrap 19 menus no options',r[0]==200 and len(data(r)['items'])==19 and 'optionGroups' not in data(r),{'items':len(data(r)['items'])})
 for name,p in [('missing',{'tableId':'T01'}),('malformed',{'tableId':'T01','tableToken':'bad'}),('other table',dict(CREDS['T02'],tableId='T01')),('unknown table',dict(CREDS['T01'],tableId='T99'))]:
  r=api('/api/v1/customer/bootstrap',p);check('QR '+name,400<=r[0]<500,r)
 a('tables/T03',{'displayName':'QA inactive','active':False});r=c('bootstrap',t='T03');check('inactive table',r[0]==410,r)
 setting('EVENT_OPEN','false');r=c('bootstrap');check('closed storefront',data(r)['store']['open']==False);r=create(payload());check('closed order rejected',r[0]==409,r);setting('EVENT_OPEN','true')
 p=payload();o=data(create(p));check('order total snapshot',o['totalAmount']==10000,o)
 r=create(p);check('same order replay',data(r)['orderId']==o['orderId'] and data(r)['idempotentReplay'])
 p2=copy.deepcopy(p);p2['items'][0]['quantity']=2;r=create(p2);check('ID payload conflict',r[0]==409,r)
 with cf.ThreadPoolExecutor(max_workers=4) as pool: rr=list(pool.map(create,[p]*4))
 check('4 identical concurrent orders',all(r[0]==200 and data(r)['orderId']==o['orderId'] for r in rr))
 with cf.ThreadPoolExecutor(max_workers=4) as pool: rr=list(pool.map(create,[payload('T02') for _ in range(4)]))
 check('4 distinct concurrent orders',all(r[0]==200 for r in rr) and len({data(r)['displayCode'] for r in rr})==4)
 r=c('orders/get',{'orderId':o['orderId']},'T02');check('cross table order blocked',r[0]==404,r)
 for q in [0,-1,11,1.5,'2',2147483648]:
  p2=payload();p2['items'][0]['quantity']=q;r=create(p2);check('customer quantity rejected '+str(q),400<=r[0]<500,r)
 check('customer maximum accepted',create(payload('T04',q=10))[0]==200)
 for name,kw in [('long note',{'note':'x'*201}),('empty items',{'items':[]}),('legacy options',{'items':[{'menuId':'chicken-feet','quantity':1,'selectedOptionIds':[]}]}),('unknown menu',{'items':[{'menuId':'missing','quantity':1}]})]:
  p2=payload();p2.update(kw);r=create(p2);check(name,400<=r[0]<500,r)
 s('menu/availability',{'itemId':'chicken-feet','soldOut':True});r=create(payload());check('sold out revalidated',r[0]==409,r);s('menu/availability',{'itemId':'chicken-feet','soldOut':False})
 a('menus/qa-price',menu());pp=payload('T05',menu='qa-price');op=data(create(pp));a('menus/qa-price',menu(12000));r=create(payload('T05',menu='qa-price'));check('price changed rejected',r[0]==409 and r[1]['error']['code']=='ORDER_PRICE_CHANGED',r)
 r=c('orders/get',{'orderId':op['orderId']},'T05');check('old price preserved',data(r)['totalAmount']==10000)
 setting('EVENT_OPEN','false');r=create(p);check('committed replay after closing',r[0]==200 and data(r)['orderId']==o['orderId']);setting('EVENT_OPEN','true')
 call={'clientRequestId':str(uuid.uuid4()),'reason':'UTENSIL'};r=c('calls/create',call);cid=data(r)['callId'];check('call create',r[0]==200)
 r=c('calls/create',call);check('call replay',data(r)['callId']==cid)
 r=c('calls/create',dict(call,reason='OTHER'));check('call ID conflict',r[0]==409,r)
 r=c('calls/create',dict(call,clientRequestId=str(uuid.uuid4())));check('call rate limit',r[0]==429,r)
 r=c('calls/cancel',{'callId':cid},'T02');check('cross table cancel blocked',r[0]==404)
 r=c('calls/cancel',{'callId':cid});check('call cancel',r[0]==200)
 r=c('calls/create',dict(call,clientRequestId=str(uuid.uuid4())),'T06');s('calls/acknowledge',{'tableId':'T06'});check('call acknowledgement snapshot',data(c('orders/list',t='T06')).get('activeCall') is None)
 check('staff customer totals equal',bill('T01')['finalAmount']==data(c('orders/list'))['sessionTotalAmount']==10000)
 s('tables/discount',{'tableId':'T01','discountRate':20});check('discount amount',bill('T01')['finalAmount']==8000)
 pay=payment('T01');bad=dict(pay,expectedFinalAmount=10000);r=s('tables/confirm-payment',bad);check('stale amount rejected',r[0]==409,r)
 with cf.ThreadPoolExecutor(max_workers=2) as pool: rr=list(pool.map(lambda _:s('tables/confirm-payment',pay),range(2)))
 check('2 simultaneous payments replay',all(r[0]==200 for r in rr))
 check('paid customer empty',data(c('orders/list'))['orders']==[] and data(c('orders/list'))['sessionTotalAmount']==0)
 order();new_session=detail('T01')['sessionId'];s('tables/confirm-payment',pay);check('payment replay leaves new visit',detail('T01')['sessionId']==new_session and bill('T01')['finalAmount']==10000)
 r=s('tables/confirm-payment',dict(pay,clientRequestId=str(uuid.uuid4())));check('old session payment rejected',r[0]==409,r)
 r=s('tables/confirm-payment',dict(pay,payerName='different'));check('payment ID payload conflict',r[0]==409,r)
 order('T07');order('T08',q=2);s('tables/merge',{'primaryTableId':'T07','secondaryTableId':'T08'});check('merge total and shared customer',bill('T08')['finalAmount']==30000 and data(c('orders/list',t='T07'))['sessionTotalAmount']==30000)
 s('tables/discount',{'tableId':'T07','discountRate':20});check('merge discount once',bill('T08')['finalAmount']==24000)
 s('tables/split',{'tableId':'T08'});check('split subtotal conserved',bill('T07')['subtotalAmount']+bill('T08')['subtotalAmount']==30000)
 r=s('tables/move',{'fromTableId':'T08','toTableId':'T09'});check('move',r[0]==200 and data(c('orders/list',t='T08'))['sessionTotalAmount']==data(c('orders/list',t='T09'))['sessionTotalAmount']==20000)
 stp={'tableId':'T10','clientRequestId':str(uuid.uuid4()),'items':[{'itemId':'chicken-feet','quantity':1}]};r=s('orders/create',stp);check('staff order',r[0]==200,r);sid=data(r)['orderId'];r=s('orders/create',stp);check('staff order replay',data(r)['orderId']==sid)
 item=detail('T10')['items'][0];iid=item.get('itemId') or item.get('id');r=s('orders/update',{'operation':'quantity','itemId':iid,'quantity':3});check('staff edit amount',r[0]==200 and bill('T10')['finalAmount']==30000)
 r=s('orders/update',{'operation':'quantity','itemId':iid,'quantity':1.9});check('staff fractional quantity rejected',400<=r[0]<500,{'response':r,'bill':bill('T10')})
 r=s('orders/update',{'operation':'cancel-item','itemId':iid});check('staff cancel removes total',r[0]==200 and bill('T10')['finalAmount']==0)
 coin=order('T11',menu='soju',q=2,price=9,paymentMethod='COIN');check('coin distinct currency',coin['totalAmount']==0 and coin['coinTotal']==18 and bill('T11')['finalAmount']==0)
 r=s('orders/status',{'orderId':coin['orderId'],'status':'SERVED'});check('coin receipt guards serving',r[0]==409,r)
 r=s('tables/confirm-payment',payment('T11'));check('coin receipt guards checkout',r[0]==409,r)
 with cf.ThreadPoolExecutor(max_workers=2) as pool: rr=list(pool.map(lambda _:s('orders/coins/receive',{'orderId':coin['orderId'],'expectedCoinTotal':18}),range(2)))
 check('coin concurrent receipt',all(r[0]==200 for r in rr));r=s('orders/status',{'orderId':coin['orderId'],'status':'SERVED'});check('coin serving after receipt',r[0]==200)
 r=s('tables/confirm-payment',payment('T11'));check('coin only checkout new session',r[0]==200 and detail('T11')['sessionId'] is None)
 finish()
def finish():
 data(a('staff-members/import',{'csv':'staff_id,name,affiliation,active,sort_order\nS-001,QA 직원,QA,true,1\n'},'POST'));r=s('members/list');check('synthetic staff roster',r[0]==200 and len(data(r)['members'])==1,r)
 sp={'tableId':'T12','clientRequestId':str(uuid.uuid4()),'chargedStaffId':'S-001','serviceMessage':'QA service','items':[{'menuId':'chicken-feet','quantity':1}]};r=s('orders/service',sp);sd=data(r);check('service create guest free',bill('T12')['finalAmount']==0,sd);r=s('orders/service',sp);check('service replay',data(r)['orderId']==sd['orderId']);r=s('orders/service',dict(sp,serviceMessage='changed'));check('service payload conflict',r[0]==409)
 r=s('settlements/list',{'includeSettled':True});check('staff settlements list',r[0]==200,r)
 charge=sd.get('chargeAmount',sd.get('staffChargeAmount',5000));r=s('settlements/confirm',{'staffId':'S-001','expectedChargeAmount':charge});check('staff settlement confirm',r[0]==200,r)
 old=CREDS['T18'].copy();r=a('tables/T18/rotate-token',{},'POST');check('QR rotate',r[0]==200);r=api('/api/v1/customer/bootstrap',old);check('old QR invalidated',r[0]==401)
 for origin,status in [('http://localhost:4179',200),('http://untrusted.invalid',403)]:
  r=api('/api/v1/customer/bootstrap',CREDS['T01'],headers={'Origin':origin});check('CORS '+origin,r[0]==status,{'status':r[0]})
 # Genuine correctly signed expired token from synthetic local secret.
 now=int(time.time());enc=lambda b:base64.urlsafe_b64encode(b).decode().rstrip('=')
 b=enc(json.dumps({'deviceLabel':'카운터','issuedAt':now-120,'expiresAt':now-60,'epoch':1}).encode());expired=b+'.'+enc(hmac.new(b'release-qa-only-signing-secret-20260922',b.encode(),hashlib.sha256).digest())
 r=api('/api/v1/staff/tables/list',headers={'Authorization':'Bearer '+expired});check('expired token rejected',r[0]==401 and r[1]['error']['code']=='STAFF_TOKEN_EXPIRED',r)
 # Payment while pending call: record current behavior, policy decision required.
 order('T13');c('calls/create',{'reason':'PAYMENT_REQUEST','clientRequestId':str(uuid.uuid4())},'T13');s('tables/confirm-payment',payment('T13'));r=c('orders/list',t='T13');check('closed visit clears pending call',data(r).get('activeCall') is None,r)
 # Price integer validation in admin.
 r=a('menus/qa-fractional',menu(1000.9));check('fractional won price rejected',400<=r[0]<500,r)
 # Race edited amount against checkout: one valid serial outcome, no paid mismatch.
 order('T14');pay=payment('T14');iid=detail('T14')['items'][0]['itemId']
 with cf.ThreadPoolExecutor(max_workers=2) as pool:
  jobs=[pool.submit(s,'tables/confirm-payment',pay),pool.submit(s,'orders/update',{'operation':'quantity','itemId':iid,'quantity':2})];rr=[f.result() for f in jobs]
 check('edit/payment serialized',sum(r[0]==200 for r in rr)==1 and all(r[0] in [200,404,409] for r in rr),rr)
 # Snapshot after menu deletion and protected identifier reuse.
 a('menus/qa-delete',menu(1234));oo=order('T15',menu='qa-delete',price=1234);r=a('menus/qa-delete',{},'DELETE');check('delete menu preserves history',r[0]==200 and data(c('orders/get',{'orderId':oo['orderId']},'T15'))['totalAmount']==1234);r=a('menus/qa-delete',menu(1234));check('deleted menu ID reuse blocked',400<=r[0]<500)
 # UI-only fixtures remain empty T20-T30.
if __name__=='__main__':
 try:
  import sys
  if '--continue' in sys.argv:
   saved=json.loads((PRIVATE/'credentials.json').read_text());TOKEN=saved['staffToken'];CREDS.update(saved['tables']);RESULTS.extend(json.loads((OUT/'api-results.json').read_text()));TRACE.extend(json.loads((OUT/'api-trace.json').read_text()));finish()
  else: main()
 finally: save()
