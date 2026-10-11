#!/usr/bin/env python3
"""Start the disposable localhost API only, after creating the named QA PostgreSQL container."""
import os,hashlib,pathlib
pathlib.Path('/tmp/qr-order-release-qa').mkdir(exist_ok=True)
os.environ.update(DB_URL='jdbc:postgresql://127.0.0.1:55433/qr_order_qa',DB_USER='qa',DB_PASSWORD='local-release-qa-only',TOKEN_PEPPER='release-qa-only-pepper',STAFF_TOKEN_SECRET='release-qa-only-signing-secret-20260922',STAFF_PASSCODE_HASH=hashlib.sha256(b'release-qa-only-pepper:release-qa-only').hexdigest(),PORT='18081',SERVER_ADDRESS='127.0.0.1',ALLOWED_ORIGINS='http://localhost:4179,http://127.0.0.1:4179',FRONTEND_BASE_URL='http://localhost:4179')
java=os.environ.get('QA_JAVA_HOME','/Users/samso/Library/Java/JavaVirtualMachines/temurin-21.0.10/Contents/Home')+'/bin/java'
with open('/tmp/qr-order-release-qa/backend.log','w') as f:
 os.dup2(f.fileno(),1);os.dup2(f.fileno(),2)
 os.execv(java,['java','-jar','qr-order-backend/build/libs/qr-order-backend-1.0.0.jar'])
