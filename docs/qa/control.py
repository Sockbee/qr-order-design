#!/usr/bin/env python3
"""Send a redacted QA request to the fixed disposable localhost backend."""
import importlib.util,json,pathlib,sys
spec=importlib.util.spec_from_file_location('qa',pathlib.Path(__file__).with_name('api-qa.py'));q=importlib.util.module_from_spec(spec);spec.loader.exec_module(q)
p=json.loads(q.PRIVATE.joinpath('credentials.json').read_text());q.TOKEN=p['staffToken'];q.CREDS=p['tables']
path=sys.argv[1];body=json.loads(sys.argv[2]) if len(sys.argv)>2 else {};method=sys.argv[3] if len(sys.argv)>3 else 'POST'
if path.startswith('customer/'):
    tid=body.get('tableId','T92');body={**q.CREDS[tid],**body}
st,r=q.api('/api/v1/'+path,body,not path.startswith('customer/'),method)
row={'status':st,'response':q.redact(r)}
with (q.OUT/'control-trace.jsonl').open('a') as f:f.write(json.dumps(q.TRACE[-1],ensure_ascii=False)+'\n')
print(json.dumps(row,ensure_ascii=False))
