"""Run with python3 -B tools/test_tooling.py from the repository root."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import zipfile
from validate_plugin import validate

ROOT = Path(__file__).resolve().parents[1]


class ToolingTests(unittest.TestCase):
    def test_examples(self):
        for path in (ROOT / 'examples').iterdir():
            if path.is_dir() and (path / 'manifest.json').exists():
                self.assertTrue(validate(path.resolve()))

    def test_pack_reproducible_and_failure_preserves_output(self):
        with tempfile.TemporaryDirectory(prefix='.tooling-test-', dir=ROOT) as folder:
            base = Path(folder)
            src = base / 'sample'
            src.mkdir()
            manifest = {'id': 'tidebot_test_sample', 'name': 'Sample', 'version': '1.0.0',
                        'entry': 'main.js', 'permissions': ['tasks', 'notifications', 'files', 'media.process'],
                        'hooks': ['task.trigger', 'chat.message'],
                        'requiredCapabilities': ['events.chat', 'tasks', 'network.transfer',
                                                  'media.requestHeaders', 'network.originPatterns', 'files', 'network.files',
                                                  'media.process', 'schema.nested', 'storage.large', 'tasks.recurring'],
                         'networkOrigins': ['https://*.bilivideo.com', '*']}
            (src / 'manifest.json').write_text(json.dumps(manifest))
            (src / 'main.js').write_text("tide.on('task.trigger', () => null);")
            out = base / 'package.zip'
            command = [sys.executable, '-B', str(ROOT / 'tools/pack_plugin.py'), str(src), '--out', str(out)]
            first = subprocess.run(command, capture_output=True, text=True)
            self.assertEqual(first.returncode, 0, first.stderr)
            digest = hashlib.sha256(out.read_bytes()).hexdigest()
            self.assertIn(digest, first.stdout)
            (src / 'main.js').touch()
            second = subprocess.run(command, capture_output=True, text=True)
            self.assertEqual(second.returncode, 0, second.stderr)
            self.assertEqual(hashlib.sha256(out.read_bytes()).hexdigest(), digest)
            with zipfile.ZipFile(out) as archive:
                self.assertIsNone(archive.testzip())
                self.assertEqual(set(archive.namelist()), {'main.js', 'manifest.json'})
            manifest['permissions'] = ['arbitrary.files']
            (src / 'manifest.json').write_text(json.dumps(manifest))
            failed = subprocess.run(command, capture_output=True, text=True)
            self.assertNotEqual(failed.returncode, 0)
            self.assertEqual(hashlib.sha256(out.read_bytes()).hexdigest(), digest)
            self.assertFalse(list(base.glob('.zip-*')))


if __name__ == '__main__':
    unittest.main()