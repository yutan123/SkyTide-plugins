"""Source package checks shared by the packer and author tooling."""
import json
import re
from urllib.parse import urlsplit
from config_ui import validate_config_ui
from interface_theme import validate_interface_theme



def validate_launch_animation(manifest, package_file):
    if 'appearance' not in manifest:
        return False
    appearance = manifest['appearance']
    if not isinstance(appearance, dict) or not appearance or appearance.keys() - {'launchAnimation', 'interfaceTheme'}:
        raise ValueError('invalid appearance fields')
    if 'launchAnimation' not in appearance:
        return False
    launch = appearance['launchAnimation']
    allowed = {'asset', 'script', 'images', 'durationMs', 'frequency', 'intervalMinutes',
               'weekdays', 'timeWindow', 'theme', 'fit'}
    if not isinstance(launch, dict) or set(launch) - allowed:
        raise ValueError('invalid launchAnimation fields')

    def relative_file(path):
        if not isinstance(path, str) or re.search(r'[\\:\x00-\x1f]', path) or any(
            part in ('', '.', '..') for part in path.split('/')
        ):
            raise ValueError('launch animation files must use package-relative paths')
        return package_file(path)

    def image_header(file, formats, limit):
        extension = file.suffix.lower()
        if extension not in formats:
            raise ValueError('unsupported launch asset format')
        if not 0 < file.stat().st_size <= limit:
            raise ValueError(f'launch asset must be nonempty and at most {limit // (1024 * 1024)} MiB')
        with file.open('rb') as stream:
            header = stream.read(12)
        signatures = {
            '.mp4': header[4:8] == b'ftyp',
            '.webm': header.startswith(bytes.fromhex('1a45dfa3')),
            '.gif': header.startswith((b'GIF87a', b'GIF89a')),
            '.webp': header.startswith(b'RIFF') and header[8:12] == b'WEBP',
            '.png': header.startswith(bytes.fromhex('89504e470d0a1a0a')),
            '.jpg': header.startswith(bytes.fromhex('ffd8ff')),
            '.jpeg': header.startswith(bytes.fromhex('ffd8ff')),
        }
        if not signatures[extension]:
            raise ValueError('launch animation header does not match the extension')

    if 'script' in launch:
        duration = launch.get('durationMs')
        capabilities = manifest.get('requiredCapabilities', [])
        if ('asset' in launch or 'fit' in launch or type(duration) is not int or
                not 250 <= duration <= 10000 or not isinstance(capabilities, list) or
                'appearance.launchAnimation.script' not in capabilities):
            raise ValueError('script launch animation needs its capability and durationMs (250–10000), without asset or fit')
        script = relative_file(launch['script'])
        if (script.suffix.lower() != '.js' or not 0 < script.stat().st_size <= 128 * 1024 or
                not script.read_text(encoding='utf-8').strip()):
            raise ValueError('launch script must be nonempty UTF-8 JS, at most 128 KiB')
        images = launch.get('images', {})
        if not isinstance(images, dict) or len(images) > 16:
            raise ValueError('launch images must be an object with at most 16 entries')
        total = 0
        for key, path in images.items():
            if not re.fullmatch(r'[a-zA-Z0-9_-]{1,40}', key):
                raise ValueError('invalid launch image ID')
            file = relative_file(path)
            image_header(file, {'.png', '.jpg', '.jpeg', '.webp'}, 4 * 1024 * 1024)
            total += file.stat().st_size
        if total > 16 * 1024 * 1024:
            raise ValueError('launch images exceed 16 MiB in total')
    else:
        if 'images' in launch or 'durationMs' in launch:
            raise ValueError('images and durationMs require a launch script')
        file = relative_file(launch.get('asset'))
        limit = 64 if file.suffix.lower() in ('.mp4', '.webm') else 16
        image_header(file, {'.mp4', '.webm', '.gif', '.webp'}, limit * 1024 * 1024)
    frequency = launch.get('frequency', 'daily')
    if frequency not in ('everyLaunch', 'daily', 'oncePerVersion', 'interval'):
        raise ValueError('invalid launchAnimation.frequency')
    minutes = launch.get('intervalMinutes')
    if frequency == 'interval':
        if type(minutes) is not int or not 1 <= minutes <= 525600:
            raise ValueError('intervalMinutes must be an integer from 1 to 525600')
    elif 'intervalMinutes' in launch:
        raise ValueError('intervalMinutes is only valid with interval frequency')
    if 'weekdays' in launch:
        days = launch['weekdays']
        if (not isinstance(days, list) or not 1 <= len(days) <= 7 or
                any(type(day) is not int or not 1 <= day <= 7 for day in days) or
                len(set(days)) != len(days)):
            raise ValueError('weekdays must contain unique integers from 1 to 7')
    if 'timeWindow' in launch:
        window = launch['timeWindow']
        if (not isinstance(window, dict) or set(window) != {'start', 'end'} or
                any(not isinstance(value, str) or
                    not re.fullmatch(r'(?:[01][0-9]|2[0-3]):[0-5][0-9]', value)
                    for value in window.values()) or window['start'] == window['end']):
            raise ValueError('timeWindow must contain distinct start and end times in HH:mm')
    if launch.get('theme', 'any') not in ('any', 'light', 'dark'):
        raise ValueError('invalid launchAnimation.theme')
    if launch.get('fit', 'cover') not in ('cover', 'contain'):
        raise ValueError('invalid launchAnimation.fit')
    return True


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
    if not isinstance(m.get('id'), str) or not re.fullmatch(r'skytide[a-z0-9_.-]{0,57}', m['id'], re.IGNORECASE):
        raise ValueError('plugin id must start with skytide (case-insensitive), use letters/digits/._-, and be at most 64 characters')
    if not isinstance(m.get('name'), str) or not m['name'].strip() or len(m['name']) > 80:
        raise ValueError('invalid plugin name')
    if not isinstance(m.get('version'), str) or not re.fullmatch(r'(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?', m['version']):
        raise ValueError('invalid semantic version')
    if m.get('apiVersion', 1) != 1:
        raise ValueError('unsupported apiVersion')
    capabilities = {'chat.files', 'chat.read', 'chat.send', 'media.download', 'invocation.context', 'modules.commonjs', 'resources.read', 'ui.web', 'events.chat', 'tasks', 'notifications', 'network.transfer', 'media.requestHeaders', 'network.originPatterns', 'files', 'network.files', 'media.process', 'schema.nested', 'config.ui', 'storage.large', 'tasks.recurring', 'workers', 'runtime.sleep', 'database', 'database.vector', 'ai', 'commands', 'chat.messageActions', 'events.priority', 'network.sockets', 'network.websocket', 'network.stream', 'network.binary', 'network.endpoints', 'crypto', 'auth.pkce', 'auth.oauth', 'credentials', 'background.send', 'background.generate', 'context.inject', 'context.prompts', 'appearance.launchAnimation'}
    capabilities.update({'appearance.launchAnimation.script', 'appearance.interfaceTheme'})
    for field, allowed in [('permissions', {'workers', 'database', 'ai', 'storage', 'files', 'media.process', 'network', 'chat.read', 'chat.send', 'media.download', 'tasks', 'notifications', 'network.sockets', 'network.cleartext', 'network.local', 'auth.browser', 'credentials', 'background.send', 'background.generate', 'context.inject'}), ('requiredCapabilities', capabilities), ('hooks', {'context.build', 'tool.before', 'tool.after', 'app.ready', 'chat.message', 'chat.sent', 'task.trigger'})]:
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
    actions = m.get('messageActions')
    if actions is not None:
        if not isinstance(actions, list) or len(actions) > 16:
            raise ValueError('messageActions must be an array of at most 16 actions')
        ids = set()
        for action in actions:
            if not isinstance(action, dict) or set(action) != {'id', 'label'}:
                raise ValueError('messageActions entries require id and label')
            name, label = action['id'], action['label']
            if not isinstance(name, str) or not re.fullmatch(r'[a-z][a-z0-9_]{0,39}', name) or name in ids:
                raise ValueError('invalid or duplicate message action id')
            if (not isinstance(label, str) or not 1 <= len(label) <= 40
                    or label.strip() != label
                    or any(ord(c) < 32 or 127 <= ord(c) <= 159 or c in ('\u2028', '\u2029') for c in label)):
                raise ValueError('invalid message action label')
            ids.add(name)
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

    has_launch = validate_launch_animation(m, package_file)
    has_theme = validate_interface_theme(m.get('appearance', {}), package_file)
    if 'entry' not in m and (has_launch or has_theme):
        allowed = {'id', 'name', 'version', 'description', 'author', 'icon',
                   'apiVersion', 'appearance', 'requiredCapabilities'}
        if set(m) - allowed or (src / 'config.schema.json').is_file():
            raise ValueError('appearance plugins without entry only support appearance and metadata')
    else:
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
