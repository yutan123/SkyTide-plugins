"""Validation of configuration form presentation metadata."""
import math
import re


def validate_config_ui(schema, depth=0):
    if not isinstance(schema, dict) or depth > 16:
        raise ValueError('invalid configuration schema')
    ui = schema.get('x-ui', {})
    if not isinstance(ui, dict):
        raise ValueError('x-ui must be an object')
    allowed = {'widget', 'group', 'collapsed', 'unit', 'providerTypes', 'visibleWhen', 'rows', 'step', 'extensions', 'testAction', 'testLabel'}
    if set(ui) - allowed:
        raise ValueError('unsupported x-ui option')
    for key in ('widget', 'group', 'unit', 'testAction', 'testLabel'):
        if key in ui and (not isinstance(ui[key], str) or not ui[key].strip()):
            raise ValueError('invalid x-ui.' + key)
    if 'collapsed' in ui and not isinstance(ui['collapsed'], bool):
        raise ValueError('collapsed must be boolean')
    widget = ui.get('widget')
    if widget is not None and widget not in {'provider', 'bot', 'multiline', 'file', 'directory', 'date', 'time', 'timezone', 'slider'}:
        raise ValueError('unsupported config widget')
    if 'visibleWhen' in ui and not isinstance(ui['visibleWhen'], dict):
        raise ValueError('visibleWhen must be an object')
    if widget is not None and 'enum' in schema:
        raise ValueError('custom widgets cannot declare enum')
    if widget in ('provider', 'bot'):
        if not (schema.get('type') == 'string' or (schema.get('type') == 'array' and schema.get('items', {}).get('type') == 'string')) or 'enum' in schema:
            raise ValueError('selector requires a string or string array without enum')
    elif widget == 'slider':
        low, high = schema.get('minimum'), schema.get('maximum')
        if schema.get('type') not in ('integer', 'number') or any(type(v) not in (int, float) or not math.isfinite(v) for v in (low, high)) or low >= high:
            raise ValueError('slider requires a numeric range')
    elif widget is not None and schema.get('type') != 'string':
        raise ValueError('widget requires string type')
    if schema.get('format') == 'password' and (widget is not None or schema.get('type') != 'string'):
        raise ValueError('password requires a single-line string')
    if 'providerTypes' in ui:
        types = ui['providerTypes']
        if widget != 'provider' or not isinstance(types, list) or not types or any(t not in ('chat', 'stt', 'tts') for t in types) or len(set(types)) != len(types):
            raise ValueError('invalid providerTypes')
    if 'rows' in ui and (widget != 'multiline' or type(ui['rows']) is not int or not 2 <= ui['rows'] <= 20):
        raise ValueError('invalid multiline rows')
    if widget == 'slider' and schema['type'] == 'integer' and (schema['minimum'] % 1 or schema['maximum'] % 1):
        raise ValueError('integer slider requires integer bounds')
    step = ui.get('step', 1 if widget == 'slider' and schema['type'] == 'integer' else None)
    if step is not None:
        if widget != 'slider' or type(step) not in (int, float) or not math.isfinite(step) or step <= 0 or (schema['type'] == 'integer' and step != int(step)):
            raise ValueError('invalid slider step')
        divisions = (schema['maximum'] - schema['minimum']) / step
        if abs(divisions - round(divisions)) > 0.000001 or divisions > 10000:
            raise ValueError('step must divide the range into at most 10000 stops')
    if 'extensions' in ui:
        extensions = ui['extensions']
        if widget != 'file' or not isinstance(extensions, list) or not extensions or any(not isinstance(e, str) or not re.fullmatch(r'[a-zA-Z0-9]+', e) for e in extensions):
            raise ValueError('invalid file extensions')
    if 'testAction' in ui and (schema.get('type') != 'object' or not re.fullmatch(r'[a-zA-Z0-9_.-]{1,80}', ui['testAction'])):
        raise ValueError('invalid config testAction')
    props = schema.get('properties', {})
    if isinstance(props, dict):
        for key, field in props.items():
            validate_config_ui(field, depth + 1)
            when = field.get('x-ui', {}).get('visibleWhen', {})
            if any(k not in props or k == key for k in when):
                raise ValueError('visibleWhen must reference another sibling field')
        done, visiting = set(), set()
        def visit(key):
            if key in done:
                return
            if key in visiting:
                raise ValueError('cyclic visibleWhen')
            visiting.add(key)
            for dependency in props[key].get('x-ui', {}).get('visibleWhen', {}):
                visit(dependency)
            visiting.remove(key)
            done.add(key)
        for key in props:
            visit(key)
    if isinstance(schema.get('items'), dict):
        validate_config_ui(schema['items'], depth + 1)
