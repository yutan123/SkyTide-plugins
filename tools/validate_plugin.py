"""Source package checks shared by the packer and author tooling."""
import json
import re
from urllib.parse import urlsplit


def validate(src):
    paths = sorted(src.rglob('*'))
    if any(p.is_symlink() for p in paths):
        raise ValueError('symbolic links are not supported')
    files = [p for p in paths if p.is_file()]
    if len(files) > 10000 or sum(p.stat().st_size for p in files) > 512 * 1024 * 1024:
        raise ValueError('package exceeds host size limits')
    manifest = src / 'manifest.json'
    if manifest.stat().st_size > 1024 * 1024:
        raise ValueError('manifest exceeds 1 MiB')
    m = json.loads(manifest.read_text(encoding='utf-8'))
    if not isinstance(m, dict):
        raise ValueError('manifest must be an object')
    if not isinstance(m.get('id'), str) or not re.fullmatch(r'tidebot[a-z0-9_.-]{0,57}', m['id'], re.IGNORECASE):
        raise ValueError('plugin id must start with tidebot (case-insensitive), use letters/digits/._-, and be at most 64 characters')
    if not isinstance(m.get('name'), str) or not m['name'].strip() or len(m['name']) > 80:
        raise ValueError('invalid plugin name')
    if not isinstance(m.get('version'), str) or not re.fullmatch(r'(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?', m['version']):
        raise ValueError('invalid semantic version')
    if m.get('apiVersion', 1) != 1:
        raise ValueError('unsupported apiVersion')
    capabilities = {'chat.read', 'chat.send', 'media.download', 'invocation.context', 'modules.commonjs', 'resources.read', 'ui.web', 'events.chat', 'tasks', 'notifications', 'network.transfer'}
    for field, allowed in [('permissions', {'storage', 'network', 'chat.read', 'chat.send', 'media.download', 'tasks', 'notifications'}), ('requiredCapabilities', capabilities), ('hooks', {'tool.before', 'tool.after', 'app.ready', 'chat.message', 'chat.sent', 'task.trigger'})]:
        values = m.get(field, [])
        if not isinstance(values, list) or any(not isinstance(v, str) or v not in allowed for v in values):
            raise ValueError('unsupported ' + field)

    def package_file(value):
        if not isinstance(value, str) or not value or '\\' in value or ':' in value or '\x00' in value:
            raise ValueError('invalid package path')
        p = src / value
        if not p.is_file() or not p.resolve().is_relative_to(src):
            raise ValueError('file outside package or missing: ' + value)
        return p

    entry = package_file(m.get('entry'))
    if entry.suffix != '.js' or entry.stat().st_size > 2 * 1024 * 1024:
        raise ValueError('entry must be JavaScript, at most 2 MiB')
    for field in ('modules', 'resources'):
        values = m.get(field, [])
        if not isinstance(values, list) or len(values) > 255:
            raise ValueError('invalid ' + field)
        seen = set()
        for value in values:
            p = package_file(value)
            if value in seen:
                raise ValueError('duplicate package path')
            seen.add(value)
            if field == 'modules' and p.suffix not in ('.js', '.json'):
                raise ValueError('invalid module type')
    if m.get('icon') is not None:
        package_file(m['icon'])
    if m.get('ui') is not None:
        if not isinstance(m['ui'], dict):
            raise ValueError('ui must be an object')
        package_file(m['ui'].get('entry'))
    origins = m.get('networkOrigins', [])
    if not isinstance(origins, list):
        raise ValueError('networkOrigins must be an array')
    for origin in origins:
        if not isinstance(origin, str):
            raise ValueError('invalid origin')
        u = urlsplit(origin)
        if u.scheme != 'https' or not u.hostname or u.username or u.password or u.path or u.query or u.fragment:
            raise ValueError('expected exact HTTPS origin')
    return files