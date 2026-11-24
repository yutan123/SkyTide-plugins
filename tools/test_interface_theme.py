"""Regression coverage for the interface appearance manifest validator."""
import json
from pathlib import Path
import shutil
import tempfile
import unittest

from validate_plugin import validate

ROOT = Path(__file__).resolve().parent.parent


class InterfaceThemeTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.source = Path(temp.name) / 'example'
        shutil.copytree(ROOT / 'examples/interface_theme', self.source)
        self.manifest_path = self.source / 'manifest.json'
        self.manifest = json.loads(self.manifest_path.read_text(encoding='utf-8'))

    def write(self, theme):
        self.manifest['appearance']['interfaceTheme'] = theme
        self.manifest_path.write_text(json.dumps(self.manifest), encoding='utf-8')

    def test_appearance_only_and_invalid_rules(self):
        self.assertNotIn('entry', self.manifest)
        self.assertTrue(validate(self.source))
        image = dict(asset='decor/star.png', width=20, height=20)
        for rule in (
            {'material': 'liquid'}, {'strokeWidth': 9}, {'fill': '#12345'},
            {'decorations': [image] * 17},
            {'decorations': [{**image, 'anchor': None}]},
            {'decorations': [{**image, 'asset': '../star.png'}]},
            {'decorations': [{**image, 'width': True}]},
        ):
            with self.subTest(rule=rule), self.assertRaises(ValueError):
                self.write({'common': {'surfaces': {'card': rule}}})
                validate(self.source)
        for theme in ({'dark': None}, {'light': {'colors': None}},
                      {'common': {'surfaces': None}}):
            with self.subTest(theme=theme), self.assertRaises(ValueError):
                self.write(theme)
                validate(self.source)

    def test_png_dimensions_and_presence(self):
        path = self.source / 'decor/star.png'
        image = bytearray(path.read_bytes())
        image[16:20] = (1025).to_bytes(4, 'big')
        path.write_bytes(image)
        with self.assertRaisesRegex(ValueError, 'dimensions'):
            validate(self.source)
        path.unlink()
        with self.assertRaises(ValueError):
            validate(self.source)


if __name__ == '__main__':
    unittest.main()
