"""Local demo server: standard library only; optional PyTorch inference adapter."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
import argparse
import json
import socket

from inference import DemoError, ModelService

ROOT = Path(__file__).resolve().parent
service = ModelService()


class DemoHTTPServer(ThreadingHTTPServer):
    # Windows otherwise permits stale demo processes to share the same port.
    allow_reuse_address = False

    def server_bind(self):
        if hasattr(socket, 'SO_EXCLUSIVEADDRUSE'):
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT / 'dist'), **kwargs)

    def end_headers(self):
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'same-origin')
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def json_response(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if urlsplit(self.path).path == '/api/status':
            self.json_response(service.status())
        elif urlsplit(self.path).path.startswith('/api/'):
            self.json_response({'error': 'Không tìm thấy API.'}, 404)
        else:
            super().do_GET()

    def do_POST(self):
        if urlsplit(self.path).path != '/api/summarize':
            return self.json_response({'error': 'Không tìm thấy API.'}, 404)
        origin = self.headers.get('Origin')
        # Same-origin POST only; the browser frontend is served by this process.
        if origin and urlsplit(origin).netloc != self.headers.get('Host'):
            return self.json_response({'error': 'Yêu cầu khác nguồn không được hỗ trợ.'}, 403)
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if length <= 0 or length > 2_500_000:
                raise DemoError('Kích thước yêu cầu không hợp lệ.', 413)
            data = json.loads(self.rfile.read(length).decode('utf-8'))
            if not isinstance(data, dict):
                raise DemoError('Nội dung yêu cầu cần là một đối tượng JSON.')
            result = service.summarize(data.get('text'), data.get('model', 'mt5'))
            self.json_response(result)
        except (ValueError, UnicodeDecodeError):
            self.json_response({'error': 'JSON không hợp lệ.'}, 400)
        except DemoError as exc:
            self.json_response({'error': str(exc)}, exc.status)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='VietBrief local demo')
    parser.add_argument('--port', type=int, default=8765)
    args = parser.parse_args()
    server = DemoHTTPServer(('127.0.0.1', args.port), Handler)
    print(f'VietBrief: http://127.0.0.1:{args.port}', flush=True)
    print('Ctrl+C to stop. Configure models.json to connect evaluated best/ checkpoints.', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
