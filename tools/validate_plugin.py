"""Source package checks shared by the packer and author tooling."""
import json
import re
from urllib.parse import urlsplit
from config_ui import validate_config_ui


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
    capabilities = {'chat.files', 'chat.read', 'chat.send', 'media.download', 'invocation.context', 'modules.commonjs', 'resources.read', 'ui.web', 'events.chat', 'tasks', 'notifications', 'network.transfer', 'media.requestHeaders', 'network.originPatterns', 'files', 'network.files', 'media.process', 'schema.nested', 'config.ui', 'storage.large', 'tasks.recurring', 'workers', 'runtime.sleep', 'database', 'database.vector', 'ai', 'commands', 'events.priority', 'network.sockets', 'network.websocket', 'network.stream', 'network.binary', 'network.endpoints', 'crypto', 'auth.pkce', 'auth.oauth', 'credentials', 'background.send', 'context.inject'}
    for field, allowed in [('permissions', {'workers', 'database', 'ai', 'storage', 'files', 'media.process', 'network', 'chat.read', 'chat.send', 'media.download', 'tasks', 'notifications', 'network.sockets', 'network.cleartext', 'network.local', 'auth.browser', 'credentials', 'background.send', 'context.inject'}), ('requiredCapabilities', capabilities), ('hooks', {'context.build', 'tool.before', 'tool.after', 'app.ready', 'chat.message', 'chat.sent', 'task.trigger'})]:
        values = m.get(field, [])
        if not isinstance(values, list) or any(not isinstance(v, str) or v not in allowed for v in values):
            raise ValueError('unsupported ' + field)

    if 'systemPermissions' in m:
        values = m['systemPermissions']
        allowed = {'overlay', 'location', 'microphone', 'photos', 'videos', 'motion'}
        if not isinstance(values, list) or any(not isinstance(v, str) or v not in allowed for v in values):
            raise ValueError('unsupported systemPermissions')

    config = m.get('config')
    if config is None and (src / 'config.schema.json').is_file():
        config = json.loads((src / 'config.schema.json').read_text(encoding='utf-8'))
    if config is not None:
        validate_config_ui(config)

    endpoints = m.get('networkEndpoints', [])
    if not isinstance(endpoints, list) or len(endpoints) > 64:
        raise ValueError('invalid networkEndpoints')
    for endpoint in endpoints:
        if not isinstance(endpoint, str) or len(endpoint) > 300:
            raise ValueError('invalid network endpoint')
        parsed = urlsplit(endpoint)
        if parsed.scheme not in {'http', 'https', 'ws', 'wss', 'tcp', 'tls'} or not parsed.hostname or '*' in parsed.hostname or parsed.username is not None or parsed.path or '?' in endpoint or '#' in endpoint or not 1 <= (parsed.port if parsed.port is not None else {'http':80,'https':443,'ws':80,'wss':443}.get(parsed.scheme, 0)) <= 65535:
            raise ValueError('invalid network endpoint')
    workers = m.get('workers', [])
    if not isinstance(workers, list) or len(workers) > 8:
        raise ValueError('workers must be an array of at most 8 items')
    names = set()
    for worker in workers:
        if not isinstance(worker, dict) or not isinstance(worker.get('name'), str) or not re.fullmatch(r'[a-zA-Z][a-zA-Z0-9_]{0,39}', worker['name']) or worker['name'] in names:
            raise ValueError('invalid or duplicate worker name')
        names.add(worker['name'])
        interval = worker.get('intervalMs', 5000)
        if type(interval) is not int or not 1000 <= interval <= 86400000:
            raise ValueError('invalid worker intervalMs')
    if workers and 'workers' not in m.get('permissions', []):
        raise ValueError('workers permission required')
    commands = m.get('commands', [])
    if not isinstance(commands, list) or len(commands) > 32 or any(not isinstance(v, str) or not re.fullmatch(r'[a-z][a-z0-9_]{0,39}', v) for v in commands) or len(set(commands)) != len(commands):
        raise ValueError('invalid or duplicate commands')
    if commands and 'chat.read' not in m.get('permissions', []):
        raise ValueError('commands require chat.read')
    priority = m.get('eventPriority', 0)
    if type(priority) is not int or not -100 <= priority <= 100:
        raise ValueError('invalid eventPriority')
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
        if origin == '*':
            continue
        normalized = origin.replace('https://*.', 'https://', 1) if origin.startswith('https://*.') else origin
        u = urlsplit(normalized)
        if u.scheme != 'https' or not u.hostname or '*' in u.hostname or u.username or u.password or u.path or u.query or u.fragment:
            raise ValueError('expected HTTPS origin, https://*.example.com, or *')
    return files
