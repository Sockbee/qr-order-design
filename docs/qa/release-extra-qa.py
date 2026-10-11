#!/usr/bin/env python3
import importlib.util,json,concurrent.futures as cf,pathlib,uuid,subprocess
spec=importlib.util.spec_from_file_location('qa',pathlib.Path(__file__).with_name('release-api-qa.py'));q=importlib.util.module_from_spec(spec);spec.loader.exec_module(q)
saved=json.loads((q.PRIVATE/'credentials.json').read_text());q.TOKEN=saved['staffToken'];q.CREDS.update(saved['tables'])
# These are additional checks on the existing fixture, not another seed run.
def sql(statement):return subprocess.check_output(['docker','exec','qr-order-release-qa-20260922','psql','-U','qa','-d','qr_order_qa','-Atc',statement],text=True).strip()
try:
 # Inspect the first race outcome using the database, accepting 404 or 409 after checkout.
 row=sql("select count(*) from table_sessions ts join orders o using(session_id) where ts.table_id='T14' and ts.payment_status='PAID' and ts.final_amount<>o.total_amount")
 q.check('edit/payment DB invariant T14',row=='0',row)
 q.order('T16');pay=q.payment('T16');iid=q.detail('T16')['items'][0]['itemId']
 with cf.ThreadPoolExecutor(max_workers=2) as pool:
  fs=[pool.submit(q.s,'orders/update',{'operation':'quantity','itemId':iid,'quantity':2}),pool.submit(q.s,'tables/confirm-payment',pay)];rr=[f.result() for f in fs]
 q.check('edit/payment accepted serial outcomes',sum(r[0]==200 for r in rr)==1 and all(r[0] in [200,404,409] for r in rr),rr)
 q.order('T17');pay=q.payment('T17')
 with cf.ThreadPoolExecutor(max_workers=2) as pool:
  fs=[pool.submit(q.create,q.payload('T17')),pool.submit(q.s,'tables/confirm-payment',pay)];rr=[f.result() for f in fs]
 q.check('order/payment no server error',rr[0][0]==200 and rr[1][0] in [200,409],rr)
 row=sql("select count(*) from table_sessions ts where table_id in ('T14','T16','T17') and payment_status='PAID' and final_amount <> (select coalesce(sum(total_amount),0) from orders o where o.session_id=ts.session_id and o.status<>'CANCELLED')")
 q.check('race paid amounts match snapshots',row=='0',row)
 # Standard numeric overflow must not wrap into an accepted amount or quantity.
 q.order('T19');iid=q.detail('T19')['items'][0]['itemId'];r=q.s('orders/update',{'operation':'quantity','itemId':iid,'quantity':4294967297});q.check('staff overflow quantity rejected',400<=r[0]<500,{'response':r,'detail':q.detail('T19')})
 r=q.a('menus/qa-overflow',q.menu(4294967296));q.check('admin overflow price rejected',400<=r[0]<500,{'response':r,'saved_price':sql("select base_price from menus where menu_id='qa-overflow'")})
 # OpenAPI requires clientRequestId; missing IDs must not silently create new orders.
 p=q.payload('T19');p.pop('clientRequestId');a=q.create(p);b=q.create(p);q.check('required clientRequestId omission rejected',400<=a[0]<500 and 400<=b[0]<500,{'first':a,'second':b})
 # Staff finished settlement replay / reopen / reconfirm.
 st=q.data(q.s('settlements/list',{'includeSettled':True}))['members'][0]
 r=q.s('settlements/reopen',{'staffId':'S-001','expectedSettledAt':st['settledAt']});q.check('settlement reopen',r[0]==200,r)
 r=q.s('settlements/confirm',{'staffId':'S-001','expectedChargeAmount':8000});q.check('settlement reconfirm',r[0]==200,r)
 # Cleanup future UI catalog of intentionally invalid synthetic products.
 for menu in ['qa-fractional','qa-overflow','qa-price']: q.a('menus/'+menu,{},'DELETE')
finally:
 (q.OUT/'extra-results.json').write_text(json.dumps(q.RESULTS,ensure_ascii=False,indent=2));(q.OUT/'extra-trace.json').write_text(json.dumps(q.TRACE,ensure_ascii=False,indent=2))
