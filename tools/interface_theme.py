"""Manifest and local decoration checks for interface appearance plugins."""
import math
import re

COLORS = {
    'primary',
    'primaryLight',
    'pageBackground',
    'surface',
    'surfaceVariant',
    'glass',
    'textStrong',
    'textWeak',
    'textFaint',
    'iconMuted',
    'border',
    'divider',
    'bubbleAi',
    'bubbleUser',
    'buttonSecondary',
    'backgroundOverlay',
}
TARGETS = {
    'card',
    'card.glass',
    'card.frost',
    'card.bot',
    'card.voiceCall',
    'card.link',
    'card.code',
    'card.video',
    'card.post',
    'card.metrics',
    'card.chart',
    'card.control',
    'dialog',
    'dialog.confirm',
    'dialog.notice',
    'dialog.choice',
    'dialog.form',
    'dialog.progress',
    'dialog.sheet',
    'dialog.popover',
    'chat.header',
    'chat.input',
}
ANCHORS = {
    'topLeft',
    'topCenter',
    'topRight',
    'centerLeft',
    'center',
    'centerRight',
    'bottomLeft',
    'bottomCenter',
    'bottomRight',
}

MATERIALS = {'normal', 'frosted', 'liquid'}
STYLE = {'fill', 'stroke', 'strokeWidth', 'decorations'}
PNG_HEADER = bytes.fromhex('89504e470d0a1a0a0000000d49484452')


def _object(value, allowed, field):
    if not isinstance(value, dict) or value.keys() - allowed:
        raise ValueError('invalid interfaceTheme ' + field)
    return value


def _color(value):
    if not isinstance(value, str) or not re.fullmatch(r'#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})', value):
        raise ValueError('invalid interfaceTheme color')


def _number(value, minimum, maximum):
    if type(value) not in (int, float) or not minimum <= value <= maximum or not math.isfinite(value):
        raise ValueError('invalid interfaceTheme number')


def _style(rule, assets):
    for key in ('fill', 'stroke'):
        if key in rule:
            _color(rule[key])
    if 'strokeWidth' in rule:
        _number(rule['strokeWidth'], 0, 8)
    decorations = rule.get('decorations', [])
    if not isinstance(decorations, list) or len(decorations) > 16:
        raise ValueError('interfaceTheme accepts at most 16 decorations per style')
    for value in decorations:
        image = _object(value, {'asset', 'anchor', 'width', 'height', 'offsetX', 'offsetY', 'opacity'}, 'decoration')
        asset = image.get('asset')
        if (not isinstance(asset, str) or len(asset) > 200 or not asset.endswith('.png')
                or not re.fullmatch(r'[A-Za-z0-9_.-]+(?:/[A-Za-z0-9_.-]+)*', asset)
                or any(segment in ('.', '..') for segment in asset.split('/'))):
            raise ValueError('invalid interfaceTheme decoration asset path')
        anchor = image.get('anchor', 'center')
        if not isinstance(anchor, str) or anchor not in ANCHORS:
            raise ValueError('invalid interfaceTheme decoration anchor')
        for key in ('width', 'height'):
            _number(image.get(key), 1, 512)
        for key in ('offsetX', 'offsetY'):
            _number(image.get(key, 0), -2048, 2048)
        _number(image.get('opacity', 1), 0, 1)
        assets.add(asset)


def validate_interface_theme(appearance, package_file):
    if 'interfaceTheme' not in appearance:
        return False
    root = _object(appearance['interfaceTheme'], {'common', 'light', 'dark'}, 'root')
    assets = set()
    for value in root.values():
        layer = _object(value, {'colors', 'surfaces'}, 'mode')
        for color in _object(layer.get('colors', {}), COLORS, 'colors').values():
            _color(color)
        for value in _object(layer.get('surfaces', {}), TARGETS, 'surfaces').values():
            rule = _object(value, STYLE | MATERIALS, 'surface')
            _style(rule, assets)
            for material in rule.keys() & MATERIALS:
                _style(_object(rule[material], STYLE, 'material'), assets)
    if len(assets) > 64:
        raise ValueError('interfaceTheme accepts at most 64 decoration assets')
    total = 0
    for asset in assets:
        path = package_file(asset)
        length = path.stat().st_size
        total += length
        if not 33 <= length <= 1024 * 1024 or total > 8 * 1024 * 1024:
            raise ValueError('invalid interfaceTheme asset size')
        with path.open('rb') as image:
            header = image.read(24)
        if (header[:16] != PNG_HEADER or
                any(not 1 <= int.from_bytes(header[i:i + 4], 'big') <= 1024 for i in (16, 20))):
            raise ValueError('invalid interfaceTheme PNG header or dimensions')
    return True
