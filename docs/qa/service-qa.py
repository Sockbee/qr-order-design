#!/usr/bin/env python3
"""Continues api-qa.py against its disposable localhost fixture."""
import importlib.util,json,pathlib,concurrent.futures,uuid
spec=importlib.util.spec_from_file_location('qa',pathlib.Path(__file__).with_name('api-qa.py'));q=importlib.util.module_from_spec(spec);spec.loader.exec_module(q)
p=json.loads(q.PRIVATE.joinpath('credentials.json').read_text());q.TOKEN=p['staffToken'];q.CREDS=p['tables']
try:
    st,r=q.a('staff-members/import',{'csv':'staff_id,name,affiliation,active,sort_order\nS-901,QA 직원,QA,TRUE,1\nS-902,QA 비활성,QA,FALSE,2'},'POST');q.check('test staff roster imported',st==200,{'status':st})
    st,r=q.s('members/list');q.check('active staff roster',st==200,r.get('data'))
    service={'tableId':'T12','chargedStaffId':'S-901','serviceMessage':'QA service','items':[{'menuId':'chicken-feet','quantity':1,'selectedOptionIds':[]}]}
    st,r=q.s('orders/service',service);q.check('service order created',st==200,r)
    if st==200:
        st,r=q.c('orders/list',t='T12');q.check('service customer free',r['data']['sessionTotalAmount']==0,r['data'])
        # Identical service body is retried; the endpoint offers no request ID.
        st,r=q.s('orders/service',service);q.check('service retry does not double staff debt',False if st==200 else True,{'status':st,'response':r})
    st,r=q.s('settlements/list',{});q.check('staff settlement listing',st==200,r.get('data'))
    data=q.s('settlements/list',{})[1]['data']
    st,r=q.s('settlements/confirm',{'staffId':'S-901','expectedChargeAmount':16000});q.check('staff settlement confirm correct amount',st==200,r)
    st,r=q.s('settlements/confirm',{'staffId':'S-901','expectedChargeAmount':16000});q.check('staff settlement replay rejected',st==409,r)
    st,r=q.s('settlements/list',{'includeSettled':True});q.check('settled staff retained',st==200,r)
    q.a('option-groups/qa-single',{'menuId':'qa-options','label':'QA 단일 선택','selectionType':'SINGLE','required':True,'minSelections':1,'maxSelections':1})
    for i in [1,2]:q.a('options/qa-single-'+str(i),{'menuId':'qa-options','optionGroupId':'qa-single','name':'단일 '+str(i),'priceDelta':0})
finally:
    q.OUT.joinpath('service-results.json').write_text(json.dumps(q.RESULTS,ensure_ascii=False,indent=2));q.OUT.joinpath('service-trace.json').write_text(json.dumps(q.TRACE,ensure_ascii=False,indent=2))
