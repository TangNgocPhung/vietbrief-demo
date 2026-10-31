import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from inference import DemoError, ModelService, clean_text


class BackendTests(unittest.TestCase):
    def test_input_validation_before_loading(self):
        service = ModelService()
        for text, key, status in [(' ', 'mt5', 400), ('a' * 200001, 'mt5', 413), ('abc', 'bad', 400), ('...', 'mt5', 400), ('abc', [], 400)]:
            with self.subTest(text=str(text)[:12], key=key):
                with self.assertRaises(DemoError) as caught:
                    service.summarize(text, key)
                self.assertEqual(caught.exception.status, status)

    def test_unevaluated_checkpoint_is_unavailable(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            best = root / 'best'
            best.mkdir()
            for filename in ('config.json', 'model.safetensors', 'spiece.model'):
                (best / filename).touch()
            config = root / 'models.json'
            config.write_text(json.dumps({'mt5': str(best)}))
            service = ModelService(config)
            with patch.dict('os.environ', {'MT5_CHECKPOINT': ''}):
                self.assertIn('test_info', service.model_status('mt5')['reason'])
                (root / 'test_info.json').write_text('{}')
                with patch('importlib.util.find_spec', return_value=object()):
                    self.assertTrue(service.model_status('mt5')['available'])

    def test_missing_config_and_lock(self):
        service = ModelService(Path('not-present-models.json'))
        with patch.dict('os.environ', {'MT5_CHECKPOINT': '', 'VIT5_CHECKPOINT': '', 'NLP_MODEL_ROOT': ''}):
            self.assertFalse(service.status()['models']['mt5']['available'])
        service.lock.acquire()
        try:
            with self.assertRaises(DemoError) as caught:
                service.summarize('Bài báo có nội dung.', 'mt5')
            self.assertEqual(caught.exception.status, 429)
        finally:
            service.lock.release()

    def test_normalization_matches_notebook(self):
        self.assertEqual(clean_text('Hà Nội\u200b\n   đẹp'), 'Hà Nội đẹp')


if __name__ == '__main__':
    unittest.main()
