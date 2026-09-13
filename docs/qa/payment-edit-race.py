#!/usr/bin/env python3
"""Deterministic two-request interleaving, isolated PostgreSQL ONLY.
Requires a QA-only BEFORE UPDATE sleep trigger (see report). No product changes.
"""
import importlib.util,pathlib,json,time,concurrent.futures
spec=importlib.util.spec_from_file_location('qa',pathlib.Path(__file__).with_name('api-qa.py'));q=importlib.util.module_from_spec(spec);spec.loader.exec_module(q)
p=json.loads(q.PRIVATE.joinpath('credentials.json').read_text());q.TOKEN=p['staffToken'];q.CREDS=p['tables']
r=q.s('tables/detail',{'tableId':'T16'})[1]['data'];iid=r['items'][0]['itemId'];bill=r['finalAmount']
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    edit=pool.submit(q.s,'orders/update',{'operation':'quantity','itemId':iid,'quantity':3})
    time.sleep(0.35)
    payment=pool.submit(q.s,'tables/confirm-payment',{'tableId':'T16','expectedFinalAmount':bill})
    results={'before':r,'edit':edit.result(),'payment':payment.result()}
q.OUT.joinpath('payment-edit-race.json').write_text(json.dumps(q.redact(results),ensure_ascii=False,indent=2))
print(json.dumps({'editStatus':results['edit'][0],'paymentStatus':results['payment'][0],'paidExpected':bill}))
