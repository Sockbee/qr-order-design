#!/usr/bin/env python3
"""Create an already expired token signed only by the disposable QA secret."""
import base64,hashlib,hmac,json,time,urllib.request,urllib.error,pathlib
now=int(time.time()); payload={'deviceLabel':'카운터','issuedAt':now-120,'expiresAt':now-60,'epoch':2}
b64=lambda x:base64.urlsafe_b64encode(x).rstrip(b'=')
p=b64(json.dumps(payload).encode());sig=b64(hmac.new(b'qa-only-independent-signing-secret-20260913',p,hashlib.sha256).digest())
req=urllib.request.Request('http://127.0.0.1:18080/api/v1/staff/tables/list',data=b'{}',headers={'Content-Type':'application/json','Authorization':'Bearer '+(p+b'.'+sig).decode()})
try:
 with urllib.request.urlopen(req) as r:st=r.status;body=json.load(r)
except urllib.error.HTTPError as e:st=e.code;body=json.load(e)
r={'status':st,'error':body.get('error'),'pass':st==401 and body['error']['code']=='STAFF_TOKEN_EXPIRED'}
pathlib.Path('docs/qa/evidence/auth-expiry.json').write_text(json.dumps(r,ensure_ascii=False,indent=2));print(json.dumps(r,ensure_ascii=False));assert r['pass']
