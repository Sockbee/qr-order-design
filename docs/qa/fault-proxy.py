#!/usr/bin/env python3
"""Local-only API fault injector; real backend commits are preserved.
Write /tmp/qr-order-qa/fault.json e.g. {"mode":"drop-next-order"}.
Other modes: hang-order (65s), fail-all, sse-off. No auth/body logging.
"""
import http.server,http.client,json,pathlib,time,threading
ROOT=pathlib.Path('/tmp/qr-order-qa'); LOCK=threading.Lock()
class Proxy(http.server.BaseHTTPRequestHandler):
    protocol_version='HTTP/1.1'
    def log_message(self,*args): pass
    def do_OPTIONS(self):
        self.send_response(204);self.cors();self.send_header('Content-Length','0');self.end_headers()
    def cors(self):
        self.send_header('Access-Control-Allow-Origin','http://localhost:4178')
        self.send_header('Access-Control-Allow-Headers','Content-Type, Authorization, Last-Event-ID')
        self.send_header('Access-Control-Allow-Methods','GET, POST, PUT, OPTIONS')
    def run_request(self):
        start=time.monotonic()
        with LOCK:
            cfg=json.loads((ROOT/'fault.json').read_text()) if (ROOT/'fault.json').exists() else {}
            mode=cfg.get('mode','normal')
            drop=mode=='drop-next-order' and self.path.endswith('/orders/create')
            if drop: (ROOT/'fault.json').write_text('{}')
        body=self.rfile.read(int(self.headers.get('Content-Length','0')))
        status=0
        try:
            if mode=='hang-order' and self.path.endswith('/orders/create'):time.sleep(65)
            if mode=='fail-all' or (mode=='sse-off' and self.path.endswith('/events')):
                status=503;self.send_response(status);self.cors();self.send_header('Content-Length','0');self.end_headers();return
            conn=http.client.HTTPConnection('127.0.0.1',18080,timeout=35)
            hdr={k:v for k,v in self.headers.items() if k.lower() not in ['host','origin','connection','content-length']}
            conn.request(self.command,self.path,body,hdr);r=conn.getresponse();status=r.status
            if drop:
                r.read();status=502
                self.send_response(status);self.cors();self.send_header('Content-Length','0');self.end_headers();return
            self.send_response(status);self.cors()
            for k,v in r.getheaders():
                if k.lower() not in ['connection','transfer-encoding','access-control-allow-origin','content-length']:self.send_header(k,v)
            is_sse='text/event-stream' in (r.getheader('Content-Type') or '')
            if is_sse:
                self.send_header('Connection','close');self.end_headers();self.close_connection=True
                while True:
                    line=r.readline()
                    if not line:break
                    self.wfile.write(line);self.wfile.flush()
            else:
                data=r.read();self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
            conn.close()
        except (BrokenPipeError,ConnectionResetError,TimeoutError):pass
        finally:
            with LOCK:
                with (ROOT/'proxy-trace.jsonl').open('a') as f:f.write(json.dumps({'method':self.command,'path':self.path,'status':status,'mode':mode,'seconds':round(time.monotonic()-start,3),'time':time.time()})+'\n')
    do_GET=run_request;do_POST=run_request;do_PUT=run_request
http.server.ThreadingHTTPServer(('127.0.0.1',18081),Proxy).serve_forever()
