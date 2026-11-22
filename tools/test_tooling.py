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
    def test_configuration_metadata(self):
        from config_ui import validate_config_ui
        for kind in ('provider', 'bot'):
            for multiple in (False, True):
                field = {'type': 'array' if multiple else 'string', 'x-ui': {'widget': kind}}
                if multiple:
                    field['items'] = {'type': 'string'}
                validate_config_ui({'type': 'object', 'properties': {'selected': field}})
        for field in (
            {'type': 'string', 'x-ui': None},
            {'type': 'string', 'enum': ['a'], 'x-ui': {'widget': 'file'}},
            {'type': 'integer', 'x-ui': {'widget': 'bot'}},
            {'type': 'string', 'x-ui': {'widget': 'provider', 'providerTypes': ['chat', 'chat']}},
            {'type': 'string', 'x-ui': {'widget': 'provider', 'providerTypes': ['unknown']}},
            {'type': 'string', 'format': 'password', 'x-ui': {'widget': 'multiline'}},
            {'type': 'integer', 'minimum': 0.5, 'maximum': 10.5, 'x-ui': {'widget': 'slider'}},
            {'type': 'integer', 'minimum': 0, 'maximum': 10001, 'x-ui': {'widget': 'slider'}},
            {'type': 'number', 'minimum': 0, 'maximum': 1, 'x-ui': {'widget': 'slider', 'step': 0.3}},
            {'type': 'string', 'x-ui': {'widget': 'file', 'extensions': ['.pem']}},
            {'type': 'string', 'x-ui': {'visibleWhen': {'missing': True}}},
        ):
            with self.subTest(field=field), self.assertRaises(ValueError):
                validate_config_ui({'type': 'object', 'properties': {'selected': field}})
        with self.assertRaises(ValueError):
            validate_config_ui({'type': 'object', 'properties': {
                'a': {'type': 'boolean', 'x-ui': {'visibleWhen': {'b': True}}},
                'b': {'type': 'boolean', 'x-ui': {'visibleWhen': {'a': True}}},
            }})

    def test_examples(self):
        for path in (ROOT / 'examples').iterdir():
            if path.is_dir() and (path / 'manifest.json').exists():
                self.assertTrue(validate(path.resolve()))

    def test_launch_animation_manifest(self):
        example = ROOT / 'examples/launch_animation'
        manifest = json.loads((example / 'manifest.json').read_text(encoding='utf-8'))
        launch = manifest['appearance']['launchAnimation']
        with tempfile.TemporaryDirectory() as folder:
            src = Path(folder)
            asset = src / launch['asset']
            asset.parent.mkdir()
            asset.write_bytes((example / launch['asset']).read_bytes())

            def check(**fields):
                (src / 'manifest.json').write_text(json.dumps({**manifest, **fields}))
                return validate(src)

            self.assertTrue(check())
            rules = {**launch, 'frequency': 'interval', 'intervalMinutes': 60,
                     'weekdays': [1, 5], 'timeWindow': {'start': '18:00', 'end': '02:00'},
                     'theme': 'dark', 'fit': 'contain'}
            self.assertTrue(check(appearance={'launchAnimation': rules}))
            (src / 'main.js').write_text('')
            self.assertTrue(check(entry='main.js', permissions=[]))
            for fields in ({'entry': None}, {'permissions': []}, {'tools': []},
                           {'appearance': None}):
                with self.subTest(fields=fields), self.assertRaises(ValueError):
                    check(**fields)
            for fields in ({'asset': '../intro.gif'}, {'asset': 'media/missing.gif'},
                           {'frequency': 'weekly'}, {'frequency': 'interval'},
                           {'intervalMinutes': 5}, {'weekdays': [1, 1]}, {'weekdays': [True]},
                           {'timeWindow': {'start': '24:00', 'end': '02:00'}},
                           {'theme': 'system'}, {'fit': 'stretch'}):
                with self.subTest(fields=fields), self.assertRaises(ValueError):
                    check(appearance={'launchAnimation': {**launch, **fields}})
            config = src / 'config.schema.json'
            config.write_text('{"type":"object"}')
            with self.assertRaisesRegex(ValueError, 'only support appearance'):
                check()
            config.unlink()
            asset.write_bytes(b'not a GIF')
            with self.assertRaisesRegex(ValueError, 'header'):
                check()
            with asset.open('wb') as stream:
                stream.truncate(16 * 1024 * 1024 + 1)
            with self.assertRaisesRegex(ValueError, '16 MiB'):
                check()

    def test_endpoint_grants(self):
        with tempfile.TemporaryDirectory(prefix='.endpoint-test-', dir=ROOT) as folder:
            src = Path(folder)
            manifest = {'id': 'skytide_endpoints', 'name': 'Endpoints', 'version': '1.0.0',
                        'entry': 'main.js', 'permissions': ['network', 'network.sockets',
                        'network.cleartext', 'network.local', 'credentials', 'auth.browser',
                        'background.send', 'chat.send', 'context.inject'],
                        'hooks': ['context.build'],
                        'requiredCapabilities': ['network.endpoints', 'auth.oauth', 'chat.files']}
            (src / 'main.js').write_text('')
            for endpoint in ['tls://mail.example.com:993', 'wss://example.com',
                             'tcp://127.0.0.1:2525', 'http://[::1]:8080']:
                manifest['networkEndpoints'] = [endpoint]
                (src / 'manifest.json').write_text(json.dumps(manifest))
                self.assertTrue(validate(src))
            for endpoint in ['tcp://host', 'http://host:0', 'tls://host:65536',
                             'https://host/path', 'ws://*.host', 'http://user@host',
                             'http://host?', 'https://host#']:
                manifest['networkEndpoints'] = [endpoint]
                (src / 'manifest.json').write_text(json.dumps(manifest))
                with self.subTest(endpoint=endpoint), self.assertRaises(ValueError):
                    validate(src)

    def test_pack_reproducible_and_failure_preserves_output(self):
        with tempfile.TemporaryDirectory(prefix='.tooling-test-', dir=ROOT) as folder:
            base = Path(folder)
            src = base / 'sample'
            src.mkdir()
            manifest = {'id': 'skytide_test_sample', 'name': 'Sample', 'version': '1.0.0',
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