#!/usr/bin/env python3
"""Disposable localhost QA only. Start an empty PostgreSQL-backed QA API first.
QA_PASSCODE must match the locally generated test backend. Never point at deployment.
Results contain redacted credentials. Does not change product code.
"""
import concurrent.futures, copy, json, os, pathlib, urllib.request, urllib.error, uuid, hashlib, re
BASE = 'http://127.0.0.1:18080'
OUT = pathlib.Path(__file__).parent / 'evidence'
PRIVATE = pathlib.Path('/tmp/qr-order-qa')
TOKEN = None
CREDS = {}
RESULTS=[]
TRACE=[]

def redact(v):
    if isinstance(v,dict): return {k:('[REDACTED]' if any(s in k.lower() for s in ['token','passcode','qr','hash']) else redact(x)) for k,x in v.items()}
    if isinstance(v,list): return [redact(x) for x in v]
    if isinstance(v,str): return re.sub(r"(?i)(token=)[0-9a-f]{64}", r"\1[REDACTED]", v)
    return v

def api(path,body=None,staff=False,method='POST',headers=None):
    hdr={'Content-Type':'application/json'}
    if staff: hdr['Authorization']='Bearer '+TOKEN
    hdr.update(headers or {})
    req=urllib.request.Request(BASE+path,data=json.dumps(body or {}).encode() if method!='GET' else None,headers=hdr,method=method)
    try:
        with urllib.request.urlopen(req,timeout=12) as r: status=r.status; raw=r.read(); rh=dict(r.headers)
    except urllib.error.HTTPError as r: status=r.code; raw=r.read(); rh=dict(r.headers)
    try: res=json.loads(raw)
    except ValueError: res={'raw':raw.decode()[:500]}
    TRACE.append({'path':path,'method':method,'request':redact(body),'status':status,'response':redact(res)})
    return status,{k:v for k,v in res.items() if v is not None}

def check(name,condition,actual=None):
    row={'name':name,'result':'PASS' if condition else 'FAIL','actual':redact(actual)}
    RESULTS.append(row); print(json.dumps(row,ensure_ascii=False),flush=True)

def c(path,body=None,t='T01'): return api('/api/v1/customer/'+path,dict(CREDS[t],**(body or {})))
def s(path,body=None): return api('/api/v1/staff/'+path,body,True)
def a(path,body=None,method='PUT'): return api('/api/v1/admin/'+path,body,True,method)
def order(t='T01',quantity=1,menu='chicken-feet',opts=None,rid=None):
    return dict(CREDS[t],clientRequestId=rid or str(uuid.uuid4()),note='QA test only',items=[dict(menuId=menu,quantity=quantity,selectedOptionIds=opts or [])])
def create(payload): return api('/api/v1/customer/orders/create',payload)
def setting(key,value): return a('settings/'+key,{'value':str(value)})
def menu_body(price=10000): return {'categoryId':'qa','name':'QA 옵션 메뉴','description':'QA only','basePrice':price,'available':True,'minQuantity':1,'maxQuantity':10,'sortOrder':100}

def main():
    global TOKEN
    status,res=api('/actuator/health/readiness',method='GET'); check('health readiness',status==200,res)
    for path in ['staff/tables/list','staff/orders/queue','admin/snapshot']:
        st,re=api('/api/v1/'+path); check('unauthenticated '+path,st==401,{'status':st,'error':re.get('error')})
    st,re=api('/api/v1/staff/login',{'passcode':'qa-wrong','deviceLabel':'카운터'});check('wrong staff login rejected',st==401,{'status':st,'error':re.get('error')})
    st,re=api('/api/v1/staff/login',{'passcode':os.environ.get('QA_PASSCODE','qa-passcode-only'),'deviceLabel':'카운터'})
    check('staff login success',st==200,{'status':st}); TOKEN=re['data']['staffToken']
    PRIVATE.mkdir(exist_ok=True)
    for i in list(range(1,19))+[90,91,92]:
        tid=f'T{i:02}'
        st,re=a('tables/'+tid,{'displayName':f'QA 테이블 {i}','sortOrder':i},'POST')
        assert st==200, (tid,st)
        # Extract original token privately from returned QR URL.
        from urllib.parse import urlparse,parse_qs
        data=re['data']
        token=data.get('tableToken') or data.get('token')
        if not token:
            urls=[v for k,v in data.items() if isinstance(v,str) and '?token=' in v]
            token=parse_qs(urlparse(urls[0]).query)['token'][0]
        CREDS[tid]={'tableId':tid,'tableToken':token}
    PRIVATE.joinpath('credentials.json').write_text(json.dumps({'staffToken':TOKEN,'tables':CREDS}));os.chmod(PRIVATE/'credentials.json',0o600)
    st,re=c('bootstrap');check('valid QR bootstrap',st==200,{'status':st,'items':len(re.get('data',{}).get('items',[]))})
    for name,payload in [('missing token',{'tableId':'T01'}),('malformed token',{'tableId':'T01','tableToken':'bad'}),('wrong table token',dict(CREDS['T02'],tableId='T01')),('unknown table',dict(CREDS['T01'],tableId='T99'))]:
        st,re=api('/api/v1/customer/bootstrap',payload);check(name,400<=st<500,{'status':st,'error':re.get('error')})
    a('tables/T03',{'displayName':'QA inactive','active':False});st,re=c('bootstrap',t='T03');check('inactive table rejected',400<=st<500,{'status':st,'error':re.get('error')})
    setting('EVENT_OPEN','false');st,re=c('bootstrap');check('closed event bootstrap reports closed',st==200 and re['data']['store']['open']==False,{'status':st,'store':re['data']['store']});setting('EVENT_OPEN','true')
    p=order();st,re=create(p); oid=re['data']['orderId'];check('guest order total',st==200 and re['data']['totalAmount']==10000,re['data'])
    st,re=create(p);check('same request replay',st==200 and re['data']['orderId']==oid and re['data']['idempotentReplay'],re.get('data'))
    p2=copy.deepcopy(p);p2['items'][0]['quantity']=2;st,re=create(p2);check('same ID different payload rejected',st==409,{'status':st,'error':re.get('error')})
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool: rr=list(pool.map(create,[p]*4))
    check('4 parallel identical requests one order',all(x[0]==200 and x[1]['data']['orderId']==oid for x in rr),[{'status':x[0],'id':x[1].get('data',{}).get('orderId')} for x in rr])
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool: rr=list(pool.map(create,[order(t='T02') for _ in range(4)]))
    check('4 parallel distinct requests unique numbers',all(x[0]==200 for x in rr) and len({x[1].get('data',{}).get('displayCode') for x in rr})==4,[{'status':x[0],'code':x[1].get('data',{}).get('displayCode')} for x in rr])
    st,re=c('orders/get',{'orderId':oid},'T02');check('cross table order hidden',st==404,{'status':st})
    for q in [0,-1,11,1.5,'2']:
        st,re=create(order(quantity=q));check('quantity rejected '+str(q),400<=st<500,{'status':st,'error':re.get('error')})
    st,re=create(order(quantity=10,t='T04'));check('quantity max accepted',st==200,{'status':st})
    for mutation in [('note too long',{'note':'x'*201}),('empty items',{'items':[]}),('unexpected price',{'price':1}),('unknown menu',{'items':[{'menuId':'missing','quantity':1}]}),('invalid options type',{'items':[{'menuId':'chicken-feet','quantity':1,'selectedOptionIds':7}]})]:
        st,re=create(dict(order(),**mutation[1]));check(mutation[0]+' returns 4xx',400<=st<500,{'status':st,'error':re.get('error')})
    s('menu/availability',{'itemId':'chicken-feet','soldOut':True});st,re=create(order());check('soldout revalidated at submit',st==409,{'status':st,'error':re.get('error')});s('menu/availability',{'itemId':'chicken-feet','soldOut':False})
    a('categories/qa',{'label':'QA','heading':'QA 옵션 검증','active':True,'sortOrder':100})
    a('menus/qa-options',menu_body())
    a('option-groups/qa-required',{'menuId':'qa-options','label':'QA 필수','selectionType':'MULTIPLE','required':True,'minSelections':1,'maxSelections':2})
    for i in range(1,4): a('options/qa-o'+str(i),{'menuId':'qa-options','optionGroupId':'qa-required','name':'QA 옵션 '+str(i),'priceDelta':i*100,'available':True})
    for opts,expected in [([],400),(['qa-o1','qa-o2','qa-o3'],400),(['qa-o1','qa-o1'],400),(['missing'],400),(['qa-o1','qa-o2'],200)]:
        st,re=create(order(t='T05',menu='qa-options',opts=opts));check('option limits '+str(opts),st==expected,{'status':st,'amount':re.get('data',{}).get('totalAmount'),'error':re.get('error')})
        if st==200: snapid=re['data']['orderId']
    a('menus/qa-options',menu_body(12000));st,re=c('orders/get',{'orderId':snapid},'T05');check('price snapshot retained',re['data']['totalAmount']==10300,re['data'])
    st,re=create(order(t='T05',menu='qa-options',opts=['qa-o1','qa-o2']));check('new price server recalculated',re.get('data',{}).get('totalAmount')==12300,{'status':st,'total':re.get('data',{}).get('totalAmount')})
    a('options/qa-o1',{'menuId':'qa-options','optionGroupId':'qa-required','name':'QA 옵션 1','priceDelta':100,'available':False});st,re=create(order(menu='qa-options',opts=['qa-o1']));check('soldout option rejected',st==409,{'status':st,'error':re.get('error')})
    a('options/qa-o1',{'menuId':'qa-options','optionGroupId':'qa-required','name':'QA 옵션 1','priceDelta':100,'available':True})
    # A hidden category must not keep selling through a stale cart/direct API.
    a('categories/qa',{'label':'QA','heading':'QA 옵션 검증','active':False});st,re=create(order(menu='qa-options',opts=['qa-o1'],t='T06'));check('inactive category order blocked',400<=st<500,{'status':st,'total':re.get('data',{}).get('totalAmount')});a('categories/qa',{'label':'QA','heading':'QA 옵션 검증','active':True,'sortOrder':100})
    # Retry after commit + event closure must remain recoverable.
    setting('EVENT_OPEN','false');st,re=create(p);check('committed order replay after closing',st==200 and re.get('data',{}).get('orderId')==oid,{'status':st,'error':re.get('error')});setting('EVENT_OPEN','true')
    call={'clientRequestId':str(uuid.uuid4()),'reason':'UTENSIL'}
    st,re=c('calls/create',call);callid=re['data']['callId'];check('call created',st==200,{'status':st})
    st,re=c('calls/create',call);check('call replay',st==200 and re['data']['callId']==callid,re.get('data'))
    st,re=c('calls/create',dict(call,reason='OTHER'));check('call payload conflict',st==409,{'status':st})
    st,re=c('calls/create',dict(call,clientRequestId=str(uuid.uuid4())));check('call throttled',st==429,{'status':st})
    st,re=c('calls/cancel',{'callId':callid},'T02');check('other table cannot cancel',st==404,{'status':st})
    st,re=c('calls/cancel',{'callId':callid});check('call cancel',st==200,{'status':st})
    st,re=c('calls/create',dict(call,clientRequestId=str(uuid.uuid4())),'T02');check('other table independent call',st==200,{'status':st});s('calls/acknowledge',{'tableId':'T02'})
    # Normal visit lifecycle and safe amount conflict.
    st,re=s('tables/bill',{'tableId':'T01'});check('staff/customer amount agree',re['data']['finalAmount']==10000,re['data'])
    s('tables/discount',{'tableId':'T01','discountRate':20});st,re=s('tables/bill',{'tableId':'T01'});check('discount total',re['data']['finalAmount']==8000,re['data'])
    st,re=s('tables/confirm-payment',{'tableId':'T01','expectedFinalAmount':10000});check('stale payment amount rejected',st==409,{'status':st,'error':re.get('error')})
    st,re=s('tables/confirm-payment',{'tableId':'T01','expectedFinalAmount':8000});check('payment closes visit',st==200,{'status':st})
    st,re=c('orders/list');check('paid visit no longer listed',re['data']['orders']==[] and re['data']['sessionTotalAmount']==0,re['data'])
    create(order());st,re=c('orders/list');check('next visit only new amount',len(re['data']['orders'])==1 and re['data']['sessionTotalAmount']==10000,re['data'])
    # Previous payment retried against a same-price new session.
    s('tables/discount',{'tableId':'T01','discountRate':20});st,re=s('tables/confirm-payment',{'tableId':'T01','expectedFinalAmount':8000});check('old payment request cannot close next visit',st==409,{'status':st,'response':re})
    # Group arithmetic, move preserving origin QR, cancel/edit.
    create(order(t='T07'));create(order(t='T08',quantity=2))
    st,re=s('tables/merge',{'primaryTableId':'T07','secondaryTableId':'T08'});st,re=s('tables/bill',{'tableId':'T08'});check('merge totals',re['data']['finalAmount']==30000,re['data'])
    s('tables/discount',{'tableId':'T07','discountRate':20});st,re=s('tables/bill',{'tableId':'T07'});check('merged discount',re['data']['finalAmount']==24000,re['data'])
    st,re=s('tables/split',{'tableId':'T08'});b7=s('tables/bill',{'tableId':'T07'})[1]['data'];b8=s('tables/bill',{'tableId':'T08'})[1]['data'];check('split no duplicate subtotal',b7['subtotalAmount']+b8['subtotalAmount']==30000,[b7,b8])
    st,re=s('tables/move',{'fromTableId':'T08','toTableId':'T09'});check('move empty table',st==200,{'status':st})
    st,re=c('orders/list',t='T08');check('origin QR reads moved session',re['data']['sessionTotalAmount']==20000,re['data'])
    st,re=c('orders/list',t='T09');check('destination QR reads moved session',re['data']['sessionTotalAmount']==20000,re['data'])
    st,re=s('orders/create',{'tableId':'T10','clientRequestId':str(uuid.uuid4()),'items':[{'itemId':'chicken-feet','quantity':1}]});check('staff creates guest order',st==200,re.get('data'))
    st,re=s('tables/detail',{'tableId':'T10'});item=re['data']['items'][0];iid=item.get('itemId') or item.get('id')
    st,re=s('orders/update',{'operation':'quantity','itemId':iid,'quantity':3});b=s('tables/bill',{'tableId':'T10'})[1]['data'];check('staff quantity edit recalculates',st==200 and b['finalAmount']==30000,b)
    st,re=s('orders/update',{'operation':'cancel-item','itemId':iid});b=s('tables/bill',{'tableId':'T10'})[1]['data'];check('cancel item removes amount',st==200 and b['finalAmount']==0,b)
    # QR rotation: response is intentionally kept private.
    old=CREDS['T18'].copy();st,re=a('tables/T18/rotate-token',{},'POST');st,re=api('/api/v1/customer/bootstrap',old);check('rotated QR old token rejected',st==401,{'status':st,'error':re.get('error')})
    for origin,allowed in [('http://localhost:5178',True),('http://untrusted.invalid',False)]:
        st,re=api('/api/v1/customer/bootstrap',CREDS['T01'],headers={'Origin':origin});check('CORS '+origin,(st==200)==allowed,{'status':st})
    # Token epoch invalidation is server-side verified, then restored for browser QA.
    setting('STAFF_TOKEN_EPOCH','2');st,re=s('tables/list');check('revoked token rejected',st==401,{'status':st,'error':re.get('error')})
    st,re=api('/api/v1/staff/login',{'passcode':os.environ.get('QA_PASSCODE','qa-passcode-only'),'deviceLabel':'카운터'});TOKEN=re['data']['staffToken']
    PRIVATE.joinpath('credentials.json').write_text(json.dumps({'staffToken':TOKEN,'tables':CREDS}))

if __name__=='__main__':
    try: main()
    finally:
        OUT.mkdir(exist_ok=True)
        (OUT/'api-results.json').write_text(json.dumps(RESULTS,ensure_ascii=False,indent=2))
        (OUT/'api-trace.json').write_text(json.dumps(TRACE,ensure_ascii=False,indent=2))
