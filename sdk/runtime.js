// TideBot JavaScript SDK, API version 1.
(() => {
  'use strict';
  const tools = new Map(), workers = new Map(), commands = new Map(), events = new Map(), pending = new Map();
  let sequence = 0;
  const send = (channel, data) => sendMessage(channel, JSON.stringify(data));
  const rpc = (method, args = {}) => new Promise((resolve, reject) => {
    if (pending.size >= 64) return reject(new Error('Too many pending host calls'));
    const id = ++sequence;
    pending.set(id, {resolve, reject});
    try {
      send('tide.host', {id, method, args});
    } catch (error) {
      pending.delete(id);
      reject(error);
    }
  });
  globalThis.__tideResolve = (id, value, error) => {
    const callback = pending.get(id);
    if (!callback) return;
    pending.delete(id);
    if (!error) return callback.resolve(value);
    let detail;
    try { detail = JSON.parse(error); } catch (_) {}
    const failure = new Error(detail && detail.tideError === 1 ? detail.message : String(error));
    failure.code = detail && detail.tideError === 1 ? detail.code : 'HOST_ERROR';
    failure.retryable = !!(detail && detail.tideError === 1 && detail.retryable);
    callback.reject(failure);
  };
  const scoped = token => {
    const call = (method, options = {}) => {
      if (!token) return Promise.reject(new Error('This API requires a tool invocation or scoped event context'));
      return rpc(method, {...options, contextToken: token});
    };
    return Object.freeze({
      chat: Object.freeze({
        getContext: () => call('chat.context'),
        getBotInfo: () => call('chat.getBotInfo'),
        getRecentMessages: (options = {}) => call('chat.getRecentMessages', options),
        getUnreadCount: () => call('chat.getUnreadCount'),
        sendText: options => call('chat.sendText', options),
        sendCard: options => call('chat.sendCard', options),
        storage: Object.freeze({
          get: key => call('botStorage.get', {key}),
          set: (key, value) => call('botStorage.set', {key, value}),
          delete: key => call('botStorage.delete', {key}),
          compareAndSet: (key, expected, value) => call('botStorage.compareAndSet', {key, expected, value}),
        }),
        sendImage: options => call('chat.sendImage', options),
        sendVideo: options => call('chat.sendVideo', options),
        sendAudio: options => call('chat.sendAudio', options),
        sendDocument: options => call('chat.sendDocument', options),
        sendFile: options => call('chat.sendFile', options),
        getStatus: requestId => call('chat.status', {requestId}),
      }),
      notifications: Object.freeze({show: options => call('notifications.show', options)}),
      tasks: Object.freeze({
        list: () => call('tasks.list'),
        schedule: options => call('tasks.schedule', options),
        update: options => call('tasks.update', options),
        cancel: id => call('tasks.cancel', {id}),
      }),
      media: Object.freeze({
        download: options => call('media.download', options),
        fromFile: options => call('media.fromFile', options),
        saveFile: options => call('media.saveFile', options),
        process: options => call('media.process', options),
        inspect: resourceId => call('media.inspect', {resourceId}),
        release: resourceId => call('media.release', {resourceId}),
      }),
    });
  };
  const tokenRefreshes = new Map();
  const tokenRequest = async options => {
    if (!options || typeof options.url !== 'string' || !options.url.startsWith('https://')) throw new Error('Token endpoint must use HTTPS');
    const fields = options.fields || {};
    if (Object.keys(fields).length > 32 || Object.values(fields).some(v => typeof v !== 'string')) throw new Error('Token fields must be strings');
    const body = Object.keys(fields).map(k => encodeURIComponent(k) + '=' + encodeURIComponent(fields[k])).join('&');
    const response = await rpc('http.transfer', {requestId: 'oauth_' + (++sequence), url: options.url, method: 'POST',
      headers: {'content-type': 'application/x-www-form-urlencoded'}, body});
    let token;
    try { token = JSON.parse(response.body); } catch (_) { throw new Error('Invalid OAuth token response'); }
    if (response.status < 200 || response.status >= 300 || !token || typeof token !== 'object' || token.error || typeof token.access_token !== 'string' || !token.access_token) {
      const error = new Error('OAuth token request failed');
      error.code = token && typeof token.error === 'string' ? token.error : 'OAUTH_ERROR';
      throw error;
    }
    const expires = Number(token.expires_in);
    if (Number.isFinite(expires) && expires > 0) token.expiresAt = Date.now() + expires * 1000;
    if (options.credentialKey) {
      const previousRaw = await rpc('credentials.get', {key: options.credentialKey});
      let previous = {};
      if (previousRaw) { try { previous = JSON.parse(previousRaw) || {}; } catch (_) {} }
      if (fields.grant_type === 'refresh_token' && !token.refresh_token && previous.refresh_token) token.refresh_token = previous.refresh_token;
      await rpc('credentials.set', {key: options.credentialKey, value: JSON.stringify(token)});
    }
    return token;
  };
  const accessToken = options => {
    if (!options || typeof options.credentialKey !== 'string') return Promise.reject(new Error('credentialKey is required'));
    const key = options.credentialKey;
    if (tokenRefreshes.has(key)) return tokenRefreshes.get(key);
    const work = (async () => {
      const raw = await rpc('credentials.get', {key});
      if (!raw) throw new Error('No stored OAuth token');
      const token = JSON.parse(raw);
      if (typeof token.access_token === 'string' && (!token.expiresAt || token.expiresAt > Date.now() + 60000)) return token.access_token;
      if (typeof token.refresh_token !== 'string') throw new Error('OAuth token expired without refresh token');
      const refreshed = await tokenRequest({...options, fields: {...(options.fields || {}), grant_type: 'refresh_token', refresh_token: token.refresh_token}});
      return refreshed.access_token;
    })();
    tokenRefreshes.set(key, work);
    work.then(() => tokenRefreshes.delete(key), () => tokenRefreshes.delete(key));
    return work;
  };
  globalThis.tide = Object.freeze({
    apiVersion: 1,
    sleep: ms => rpc('runtime.sleep', {ms}),
    registerCommand: (name, handler) => {
      if (typeof name !== 'string' || typeof handler !== 'function' || commands.has(name)) throw new Error('Invalid or duplicate command');
      commands.set(name, handler);
    },
    registerWorker: (name, handler) => {
      if (typeof name !== 'string' || typeof handler !== 'function' || workers.has(name)) throw new Error('Invalid or duplicate worker');
      workers.set(name, handler);
    },
    database: Object.freeze({
      get: (collection, key) => rpc('database.get', {collection, key}),
      put: (collection, key, value, options = {}) => rpc('database.put', {...options, collection, key, value}),
      delete: (collection, key) => rpc('database.delete', {collection, key}),
      query: (collection, options = {}) => rpc('database.query', {...options, collection}),
      search: (collection, vector, options = {}) => rpc('database.search', {...options, collection, vector}),
      batch: operations => rpc('database.batch', {operations}),
      version: () => rpc('database.version'),
      migrate: (from, to, operations) => rpc('database.migrate', {from, to, operations}),
    }),
    ai: Object.freeze({
      listModels: () => rpc('ai.listModels'),
      generate: options => rpc('ai.generate', options),
      cancel: requestId => rpc('ai.cancel', {requestId}),
    }),
    capabilities: Object.freeze(['chat.read', 'chat.send', 'chat.files', 'media.download', 'invocation.context', 'modules.commonjs', 'resources.read', 'ui.web', 'events.chat', 'tasks', 'notifications', 'network.transfer', 'media.requestHeaders', 'network.originPatterns', 'files', 'network.files', 'media.process', 'schema.nested', 'config.ui', 'storage.large', 'tasks.recurring', 'workers', 'runtime.sleep', 'database', 'database.vector', 'ai', 'commands', 'events.priority', 'network.sockets', 'network.websocket', 'network.stream', 'network.binary', 'network.endpoints', 'crypto', 'auth.pkce', 'auth.oauth', 'credentials', 'background.send', 'context.inject']),
    chat: Object.freeze({
      getContext: context => context.chat.getContext(),
      getBotInfo: context => context.chat.getBotInfo(),
      getRecentMessages: (context, options) => context.chat.getRecentMessages(options),
      getUnreadCount: context => context.chat.getUnreadCount(),
      sendText: (context, options) => context.chat.sendText(options),
      sendImage: (context, options) => context.chat.sendImage(options),
      sendVideo: (context, options) => context.chat.sendVideo(options),
      sendAudio: (context, options) => context.chat.sendAudio(options),
      sendDocument: (context, options) => context.chat.sendDocument(options),
      sendFile: (context, options) => context.chat.sendFile(options),
      getStatus: (context, requestId) => context.chat.getStatus(requestId),
    }),
    media: Object.freeze({
      download: (context, options) => context.media.download(options),
      fromFile: (context, options) => context.media.fromFile(options),
      saveFile: (context, options) => context.media.saveFile(options),
      process: (context, options) => context.media.process(options),
      release: (context, resourceId) => context.media.release(resourceId),
    }),
    config: Object.freeze(globalThis.__tideConfig || {}),
    registerTool(name, handler) {
      if (typeof handler !== 'function' || tools.has(name)) throw new Error('Invalid/duplicate tool: ' + name);
      tools.set(name, handler);
    },
    on(event, handler) {
      if (typeof handler !== 'function') throw new Error('Event handler must be a function');
      if (!events.has(event)) events.set(event, []);
      events.get(event).push(handler);
    },
    storage: Object.freeze({
      get: key => rpc('storage.get', {key}),
      set: (key, value) => rpc('storage.set', {key, value}),
      delete: key => rpc('storage.delete', {key}),
      compareAndSet: (key, expected, value) => rpc('storage.compareAndSet', {key, expected, value}),
      async update(key, updater) {
        if (typeof updater !== 'function') throw new Error('Storage updater must be a function');
        for (let attempt = 0; attempt < 16; attempt++) {
          const expected = await rpc('storage.get', {key});
          const value = await updater(JSON.parse(JSON.stringify(expected)));
          if (value === undefined) throw new Error('Storage updater must return a JSON value');
          if (await rpc('storage.compareAndSet', {key, expected, value})) return value;
        }
        throw new Error('Storage update contention exceeded retry limit');
      },
    }),
    files: Object.freeze({
      read: options => rpc('files.read', options),
      write: options => rpc('files.write', options),
      list: (directory = '') => rpc('files.list', {directory}),
      stat: path => rpc('files.stat', {path}),
      delete: path => rpc('files.delete', {path}),
    }),
    resources: Object.freeze({readText: path => rpc('resources.readText', {path}), readJson: path => rpc('resources.readJson', {path})}),
    device: Object.freeze({
      hasPermission: permission => rpc('device.permission', {permission}),
      getLocation: () => rpc('device.location'),
      getMotion: () => rpc('device.motion'),
    }),
    overlay: Object.freeze({
      update: data => rpc('overlay.update', {data}),
      close: () => rpc('overlay.close'),
    }),
    request: options => rpc('http.request', options),
    network: Object.freeze({
      transfer: options => rpc('http.transfer', options),
      downloadFile: options => rpc('http.downloadFile', options),
      uploadFile: options => rpc('http.uploadFile', options),
      cancelFile: requestId => rpc('http.cancelFile', {requestId}),
      fileProgress: requestId => rpc('http.fileProgress', {requestId}),
      cancel: requestId => rpc('http.cancel', {requestId}),
      progress: requestId => rpc('http.progress', {requestId}),
    }),
    crypto: Object.freeze({
      random: length => rpc('crypto.random', {length}),
      encode: text => rpc('crypto.encode', {text}),
      decode: (base64, options = {}) => rpc('crypto.decode', {...options, base64}),
      digest: options => rpc('crypto.digest', options),
      hmac: options => rpc('crypto.hmac', options),
      encrypt: options => rpc('crypto.encrypt', options),
      decrypt: options => rpc('crypto.decrypt', options),
    }),
    auth: Object.freeze({authorize: options => rpc('auth.authorize', options), createPkce: () => rpc('auth.createPkce'), exchangeToken: tokenRequest, getAccessToken: accessToken}),
    credentials: Object.freeze({
      get: key => rpc('credentials.get', {key}),
      set: (key, value) => rpc('credentials.set', {key, value}),
      delete: key => rpc('credentials.delete', {key}),
    }),
    background: Object.freeze({sendText: options => rpc('background.sendText', options)}),
    connections: Object.freeze({
      connect: options => rpc('connections.connect', options),
      webSocket: options => rpc('connections.webSocket', options),
      http: options => rpc('connections.http', options),
      read: (connectionId, options = {}) => rpc('connections.read', {...options, connectionId}),
      write: (connectionId, options) => rpc('connections.write', {...options, connectionId}),
      startTls: connectionId => rpc('connections.startTls', {connectionId}),
      close: connectionId => rpc('connections.close', {connectionId}),
    }),
    diagnostics: Object.freeze({getStatus: () => rpc('diagnostics.getStatus')}),
    log: message => rpc('log', {message: String(message)}),
  });
  globalThis.__tideDispatch = (id, kind, name, payload) => {
    Promise.resolve().then(async () => {
      if (kind === 'validateCommands') {
        for (const name of payload) if (!commands.has(name)) throw new Error('Unregistered command: ' + name);
        for (const name of commands.keys()) if (!payload.includes(name)) throw new Error('Undeclared command: ' + name);
        return null;
      }
      if (kind === 'command') {
        const handler = commands.get(name);
        if (!handler) throw new Error('Unregistered command: ' + name);
        return await handler(payload.args, scoped(payload.contextToken));
      }
      if (kind === 'validateWorkers') {
        for (const name of payload) if (!workers.has(name)) throw new Error('Unregistered worker: ' + name);
        for (const name of workers.keys()) if (!payload.includes(name)) throw new Error('Undeclared worker: ' + name);
        return null;
      }
      if (kind === 'worker') {
        const handler = workers.get(name);
        if (!handler) throw new Error('Unregistered worker: ' + name);
        return await handler(Object.freeze({name, sleep: ms => rpc('runtime.sleep', {ms, workerToken: payload.workerToken})}));
      }
      if (kind === 'validate') {
        for (const tool of payload) if (!tools.has(tool)) throw new Error('Unregistered tool: ' + tool);
        for (const tool of tools.keys()) if (!payload.includes(tool)) throw new Error('Undeclared tool: ' + tool);
        return null;
      }
      if (kind === 'tool') {
        const handler = tools.get(name);
        if (!handler) throw new Error('Tool not registered: ' + name);
        const wrapped = payload && payload.__tideInvocation === true;
        return await handler(wrapped ? payload.args : payload, scoped(wrapped ? payload.contextToken : null));
      }
      const deviceToken = name === 'ui.action' && payload && payload.__tideDeviceAction;
      const eventWrapped = payload && payload.__tideEvent === true;
      const baseContext = scoped(eventWrapped ? payload.contextToken : null);
      const eventContext = deviceToken ? Object.freeze({
        ...baseContext,
        overlay: Object.freeze({show: options => rpc('overlay.show', {...options, actionToken: deviceToken})}),
        device: Object.freeze({
          pickPhoto: (options = {}) => rpc('device.photos', {...options, actionToken: deviceToken}),
          pickVideo: (options = {}) => rpc('device.videos', {...options, actionToken: deviceToken}),
          recordAudio: (durationMs = 2000) => rpc('device.microphone', {durationMs, actionToken: deviceToken}),
        }),
      }) : baseContext;
      let result = eventWrapped || deviceToken ? payload.payload : payload;
      for (const handler of events.get(name) || []) {
        const next = await handler(result, eventContext);
        if (next !== undefined) result = next;
      }
      return result;
    }).then(value => {
      const data = {id, value: value === undefined ? null : value};
      if (JSON.stringify(data).length > 1048576) throw new Error('Plugin result exceeds 1 MB');
      send('tide.result', data);
    }).catch(error => send('tide.result', {id, error: String(error && error.stack || error)}));
  };
})();
