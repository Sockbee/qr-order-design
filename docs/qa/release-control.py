#!/usr/bin/env python3
"""Small local QA controls; refuses any configurable network destination."""
import sys,json,importlib.util,pathlib
spec=importlib.util.spec_from_file_location('qa',pathlib.Path(__file__).with_name('release-api-qa.py'));q=importlib.util.module_from_spec(spec);spec.loader.exec_module(q)
v=json.loads((q.PRIVATE/'credentials.json').read_text());q.TOKEN=v['staffToken'];q.CREDS.update(v['tables'])
if sys.argv[1]=='setting': r=q.setting(sys.argv[2],sys.argv[3])
elif sys.argv[1]=='sold-out': r=q.s('menu/availability',{'itemId':sys.argv[2],'soldOut':sys.argv[3]=='true'})
elif sys.argv[1]=='api': r=q.s(sys.argv[2],json.loads(sys.argv[3]))
else: raise SystemExit('Unknown command')
print(json.dumps(q.redact(r),ensure_ascii=False))
with (q.OUT/'controls-trace.jsonl').open('a') as f:
 for row in q.TRACE:f.write(json.dumps(row,ensure_ascii=False)+'\n')
