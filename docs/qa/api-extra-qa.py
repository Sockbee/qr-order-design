#!/usr/bin/env python3
"""Continues api-qa.py against its disposable localhost fixture."""
import importlib.util,json,pathlib,concurrent.futures,uuid
spec=importlib.util.spec_from_file_location('qa',pathlib.Path(__file__).with_name('api-qa.py'));q=importlib.util.module_from_spec(spec);spec.loader.exec_module(q)
p=json.loads(q.PRIVATE.joinpath('credentials.json').read_text());q.TOKEN=p['staffToken'];q.CREDS=p['tables']
try:
    q.setting('EVENT_OPEN','false');st,r=q.c('bootstrap');q.check('closed bootstrap reports open=false',st==200 and r['data']['store']['open']==False,{'status':st,'store':r['data']['store']});st,r=q.create(q.order());q.check('new order while closed rejected',st==409,{'status':st,'error':r.get('error')});q.setting('EVENT_OPEN','true')
    st,r=q.s('tables/discount',{'tableId':'T07','discountRate':10});q.check('unsupported discount rate rejected',st==400,{'status':st,'error':r.get('error')})
    st,r=q.s('tables/discount',{'tableId':'T07','discountRate':20});r=q.s('tables/bill',{'tableId':'T07'})[1];q.check('configured discount 20 percent',r['data']['finalAmount']==8000,r['data'])
    st,r=q.c('bootstrap',t='T18');q.check('rotated old token HTTP401',st==401,{'status':st})
    # Notes, reset, service orders and staff settlement.
    q.create(q.order(t='T11'))
    st,r=q.s('tables/note',{'tableId':'T11','note':'QA visit note'});q.check('open visit note saved',st==200,{'status':st})
    st,r=q.s('tables/detail',{'tableId':'T11'});sid=r['data'].get('sessionId');q.check('visit note persisted','QA visit note' in json.dumps(r),r['data'])
    if not sid:sid=q.s('tables/bill',{'tableId':'T11'})[1]['data']['sessionId']
    q.create(q.order(t='T11'));st,r=q.s('tables/reset',{'tableId':'T11','expectedSessionId':sid});q.check('reset closes current visit',st==200,{'status':st})
    q.create(q.order(t='T11'));st,r=q.s('tables/reset',{'tableId':'T11','expectedSessionId':sid});cur=q.c('orders/list',t='T11')[1]['data'];q.check('old reset replay preserves new visit',cur['sessionTotalAmount']==10000,{'status':st,'current':cur})
    st,r=q.a('staff-members/import',{'csv':'staff_id,name,affiliation,active,sort_order\nS-901,QA 직원,QA,TRUE,1\nS-902,QA 비활성,QA,FALSE,2'},'POST');q.check('test staff roster imported',st==200,{'status':st})
    st,r=q.s('members/list');q.check('active staff roster',st==200,r.get('data'))
    service={'tableId':'T12','chargedStaffId':'S-901','serviceMessage':'QA service','items':[{'menuId':'chicken-feet','quantity':1,'selectedOptionIds':[]}]}
    st,r=q.s('orders/service',service);q.check('service order created',st==200,r)
    if st==200:
        st,r=q.c('orders/list',t='T12');q.check('service customer free',r['data']['sessionTotalAmount']==0,r['data'])
        # Identical service body is retried; the endpoint offers no request ID.
        st,r=q.s('orders/service',service);q.check('service retry does not double staff debt',False if st==200 else True,{'status':st,'response':r})
    st,r=q.s('settlements/list',{});q.check('staff settlement listing',st==200,r.get('data'))
    st,r=q.s('settlements/confirm',{'staffId':'S-901','expectedChargeAmount':16000});q.check('staff settlement confirm',st==200,r)
    st,r=q.s('settlements/confirm',{'staffId':'S-901','expectedChargeAmount':16000});q.check('staff settlement replay rejected',st==409,r)
    # Two concurrent payment requests on the same visit.
    q.create(q.order(t='T13'));pay={'tableId':'T13','expectedFinalAmount':10000}
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool: rs=list(pool.map(lambda _:q.s('tables/confirm-payment',pay),range(2)))
    q.check('parallel payment one success',sum(x[0]==200 for x in rs)==1,[{'status':x[0],'error':x[1].get('error')} for x in rs])
    # Small race: four independent two-request interleavings.
    for tid in ['T14','T15','T16','T17']:
        q.create(q.order(t=tid))
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            f1=pool.submit(q.create,q.order(t=tid));f2=pool.submit(q.s,'tables/confirm-payment',{'tableId':tid,'expectedFinalAmount':10000});rs=[f1.result(),f2.result()]
        q.check('order/payment race '+tid,all(x[0]<500 for x in rs),[{'status':x[0],'error':x[1].get('error')} for x in rs])
    # Add SINGLE option group for browser selection change check.
    q.a('option-groups/qa-single',{'menuId':'qa-options','label':'QA 단일 선택','selectionType':'SINGLE','required':True,'minSelections':1,'maxSelections':1})
    for i in [1,2]:q.a('options/qa-single-'+str(i),{'menuId':'qa-options','optionGroupId':'qa-single','name':'단일 '+str(i),'priceDelta':0})
finally:
    q.OUT.joinpath('api-extra-results.json').write_text(json.dumps(q.RESULTS,ensure_ascii=False,indent=2));q.OUT.joinpath('api-extra-trace.json').write_text(json.dumps(q.TRACE,ensure_ascii=False,indent=2))
