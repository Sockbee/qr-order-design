#!/usr/bin/env python3
"""Disposable local QA fixture only; fixed loopback DB and synthetic credentials."""
import os,hashlib
os.environ.update(DB_URL='jdbc:postgresql://127.0.0.1:55432/qr_order_qa',DB_USER='qa',DB_PASSWORD='local-qa-only',TOKEN_PEPPER='local-development-token-pepper-please-change',STAFF_TOKEN_SECRET='qa-only-independent-signing-secret-20260913',STAFF_PASSCODE_HASH=hashlib.sha256(b'local-development-token-pepper-please-change:qa-passcode-only').hexdigest(),PORT='18080',SERVER_ADDRESS='127.0.0.1',ALLOWED_ORIGINS='http://localhost:5178,http://127.0.0.1:5178,http://localhost:4178',FRONTEND_BASE_URL='http://localhost:5178')
java_home=os.environ.get('JAVA_HOME','/Users/samso/Library/Java/JavaVirtualMachines/temurin-21.0.10/Contents/Home')
os.execv(java_home+'/bin/java',['java','-jar','qr-order-backend/build/libs/qr-order-backend-1.0.0.jar'])
