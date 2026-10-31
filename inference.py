"""Inference adapter for evaluated notebook best/ exports; no training or downloads."""
from __future__ import annotations

import gc
import importlib.util
import json
import os
from pathlib import Path
import re
import threading
import time
import unicodedata

ROOT = Path(__file__).resolve().parent
MAX_CHARS = 200_000
GENERATION = dict(num_beams=4, length_penalty=1.0, no_repeat_ngram_size=3, max_new_tokens=128)
LABELS = {'mt5': 'mT5-small', 'vit5': 'ViT5-base'}


class DemoError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


def clean_text(text: str) -> str:
    text = unicodedata.normalize('NFC', text)
    text = ''.join(ch for ch in text if ch in '\t\n\r' or unicodedata.category(ch)[0] != 'C')
    return re.sub(r'\s+', ' ', text).strip()


class ModelService:
    def __init__(self, config_path: Path | None = None):
        self.config_path = config_path or ROOT / 'models.json'
        self.lock = threading.Lock()
        self.cache = {}
        self.device = None

    def config(self) -> dict:
        if not self.config_path.exists():
            return {}
        try:
            data = json.loads(self.config_path.read_text(encoding='utf-8-sig'))
            if not isinstance(data, dict):
                raise ValueError('Expected object')
            return data
        except (ValueError, OSError) as exc:
            raise DemoError('Không đọc được models.json. Kiểm tra định dạng JSON và đường dẫn.', 503) from exc

    def model_path(self, key: str) -> Path | None:
        config = self.config()
        value = os.environ.get(f'{key.upper()}_CHECKPOINT') or config.get(key)
        if not value:
            data_root = os.environ.get('NLP_MODEL_ROOT') or config.get('root')
            if data_root:
                base = Path(data_root).expanduser()
                if not base.is_absolute():
                    base = self.config_path.parent / base
                value = str(base / 'pretrained' / key / config.get('run', 'kaggle_run01') / 'best')
        if not value:
            return None
        if not isinstance(value, str):
            raise DemoError(f'Cấu hình {key} cần là đường dẫn dạng chuỗi.', 503)
        path = Path(value).expanduser()
        return path if path.is_absolute() else self.config_path.parent / path

    def model_status(self, key: str) -> dict:
        path = self.model_path(key)
        if path is None:
            return dict(available=False, reason='Chưa cấu hình đường dẫn checkpoint best/.')
        if not path.is_dir() or not (path / 'config.json').is_file():
            return dict(available=False, reason='Không tìm thấy best/config.json. Kiểm tra lại thư mục checkpoint.')
        weights = any((path / name).is_file() for name in (
            'model.safetensors', 'model.safetensors.index.json', 'pytorch_model.bin', 'pytorch_model.bin.index.json'))
        if not weights:
            return dict(available=False, reason='Thư mục best/ thiếu trọng số mô hình.')
        if not (path.parent / 'test_info.json').is_file():
            return dict(available=False, reason='Thiếu test_info.json cạnh best/. Hãy xuất đánh giá Test theo notebook.')
        if not any((path / name).is_file() for name in ('spiece.model', 'tokenizer.json')):
            return dict(available=False, reason='Thiếu tokenizer đi kèm checkpoint.')
        if not all(importlib.util.find_spec(module) for module in ('torch', 'transformers', 'sentencepiece')):
            return dict(available=False, reason='Chưa cài thư viện suy luận. Chạy pip install -r requirements-models.txt.')
        return dict(available=True, reason='Đã tìm thấy checkpoint và thông tin đánh giá; trọng số sẽ được nạp khi chạy.')

    def status(self) -> dict:
        try:
            models = {key: self.model_status(key) for key in LABELS}
        except DemoError as exc:
            models = {key: dict(available=False, reason=str(exc)) for key in LABELS}
        # Avoid importing heavyweight torch at startup just for the status badge.
        return dict(service='vietbrief', models=models, device=self.device.upper() if self.device else 'tự chọn GPU / CPU', generation=GENERATION,
                    max_input_tokens=512, max_characters=MAX_CHARS)

    def clear_cache(self):
        self.cache.clear()
        gc.collect()
        import torch
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

    def summarize(self, raw: object, key: object) -> dict:
        if not isinstance(key, str) or key not in LABELS:
            raise DemoError('Mô hình không hợp lệ. Chọn mt5 hoặc vit5.')
        if not isinstance(raw, str) or not raw.strip():
            raise DemoError('Hãy nhập bài báo tiếng Việt.')
        if len(raw) > MAX_CHARS:
            raise DemoError('Đầu vào vượt 200.000 ký tự; hãy rút ngắn.', 413)
        text = clean_text(raw)
        if not re.search(r'\w', text, re.UNICODE):
            raise DemoError('Nội dung cần có chữ hoặc số để tóm tắt.')
        # One request/model at a time; comparing models also uses this same lock.
        if not self.lock.acquire(blocking=False):
            raise DemoError('Máy chủ đang xử lý một bài khác. Hãy chờ rồi thử lại.', 429)
        try:
            status = self.model_status(key)
            if not status['available']:
                raise DemoError(status['reason'], 503)
            os.environ.setdefault('USE_TF', '0')
            os.environ.setdefault('USE_TORCH', '1')
            os.environ.setdefault('TOKENIZERS_PARALLELISM', 'false')
            # Keep runtime files inside this local project; weights are never fetched.
            os.environ.setdefault('HF_HOME', str(ROOT / '.runtime' / 'huggingface'))
            os.environ.setdefault('HF_HUB_OFFLINE', '1')
            os.environ.setdefault('HF_HUB_DISABLE_TELEMETRY', '1')
            import torch
            from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
            device = 'cuda' if torch.cuda.is_available() else 'cpu'
            self.device = device
            checkpoint = str(self.model_path(key).resolve())
            cold_start = self.cache.get('checkpoint') != checkpoint
            load_started = time.perf_counter()
            if cold_start:
                self.clear_cache()
                tokenizer = AutoTokenizer.from_pretrained(checkpoint, use_fast=False, local_files_only=True, trust_remote_code=False)
                model = AutoModelForSeq2SeqLM.from_pretrained(checkpoint, local_files_only=True, trust_remote_code=False).to(device).eval()
                model.config.use_cache = True
                self.cache.update(checkpoint=checkpoint, tokenizer=tokenizer, model=model)
            load_seconds = time.perf_counter() - load_started if cold_start else 0
            tokenizer, model = self.cache['tokenizer'], self.cache['model']
            n_tokens = len(tokenizer(text, truncation=False, verbose=False)['input_ids'])
            inputs = tokenizer([text], return_tensors='pt', padding=True, truncation=True, max_length=512).to(device)
            if device == 'cuda':
                torch.cuda.synchronize()
            start = time.perf_counter()
            from contextlib import nullcontext
            # Mirror notebook FP32 on T4/CPU, BF16 only when supported; never force FP16.
            amp = torch.autocast('cuda', dtype=torch.bfloat16) if device == 'cuda' and torch.cuda.is_bf16_supported() else nullcontext()
            with torch.inference_mode(), amp:
                ids = model.generate(**inputs, **GENERATION)
                summary = tokenizer.batch_decode(ids, skip_special_tokens=True)[0]
            if device == 'cuda':
                torch.cuda.synchronize()
            seconds = time.perf_counter() - start
            warnings = []
            if n_tokens > 512:
                warnings.append(f'Bài có {n_tokens:,} token; chỉ 512 token đầu được đọc. Thông tin cuối bài có thể bị bỏ sót.')
            if cold_start:
                warnings.append(f'Nạp checkpoint lần đầu: {load_seconds:.2f} giây. Thời gian xử lý hiển thị đo bước sinh và giải mã, không gồm nạp mô hình.')
            if not summary.strip():
                warnings.append('Checkpoint sinh kết quả rỗng. Hãy kiểm tra chất lượng checkpoint; ứng dụng giữ nguyên đầu ra.')
            return dict(summary=summary, model=key, label=LABELS[key], input_tokens=n_tokens,
                        used_tokens=int(inputs['attention_mask'].sum().item()), seconds=seconds,
                        load_seconds=load_seconds, device=device, truncated=n_tokens > 512, warnings=warnings)
        except DemoError:
            raise
        except Exception as exc:
            # Preserve a clear OOM response without requiring torch on preview-only installs.
            if type(exc).__name__ == 'OutOfMemoryError':
                self.clear_cache()
                raise DemoError('GPU thiếu bộ nhớ. Đã dọn bộ nhớ mô hình; dừng huấn luyện hoặc khởi động lại session rồi thử lại.', 503) from exc
            raise DemoError(f'Không nạp/sinh được ({type(exc).__name__}): {str(exc)[:220]}', 500) from exc
        finally:
            self.lock.release()
