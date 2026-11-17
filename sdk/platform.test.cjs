'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createMock} = require('./mock.cjs');

test('connection, credential, crypto and background APIs forward explicit handles and bot scope', async () => {
  const handlers = {};
  for (const name of ['connections.connect', 'connections.webSocket', 'connections.http', 'connections.read', 'connections.write', 'connections.startTls', 'connections.close', 'crypto.digest', 'credentials.set', 'auth.authorize', 'background.sendText']) {
    handlers[name] = args => args;
  }
  const mock = createMock({handlers});
  mock.load(`tide.registerTool('check', async () => {
    const a = await tide.connections.connect({url: 'tls://mail.example.com:993'});
    await tide.connections.webSocket({url: 'wss://example.com/events'});
    await tide.connections.http({url: 'https://example.com/sse', format: 'sse'});
    await tide.connections.read('handle', {timeoutMs: 50, connectionId: 'overridden'});
    await tide.connections.write('handle', {base64: 'AP+A', connectionId: 'overridden'});
    await tide.connections.startTls('handle');
    await tide.connections.close('handle');
    await tide.credentials.set('mail', 'secret');
    await tide.crypto.digest({base64: 'YWJj'});
    await tide.auth.authorize({url: 'https://example.com/oauth', parameters: {client_id: 'a'}});
    await tide.background.sendText({botId: 'bot', text: 'mail', requestId: 'mail_1'});
    return a;
  });`);
  await mock.dispatch('tool', 'check', {});
  assert.equal(mock.calls.find(c => c.method === 'connections.read').args.connectionId, 'handle');
  assert.equal(mock.calls.find(c => c.method === 'connections.write').args.connectionId, 'handle');
  assert.equal(mock.calls.find(c => c.method === 'background.sendText').args.botId, 'bot');
});

test('OAuth refresh is deduplicated and retains refresh tokens when server omits rotation', async () => {
  let stored = JSON.stringify({access_token: 'expired', refresh_token: 'refresh', expiresAt: 1});
  let requests = 0;
  const mock = createMock({handlers: {
    'credentials.get': () => stored,
    'credentials.set': args => { stored = args.value; return null; },
    'http.transfer': args => {
      requests++;
      assert.equal(args.method, 'POST');
      assert.match(args.body, /grant_type=refresh_token/);
      assert.match(args.body, /client_id=client%20id/);
      return {status: 200, body: JSON.stringify({access_token: 'fresh', expires_in: 3600})};
    },
  }});
  mock.load(`tide.registerTool('token', async () => {
    const options = {url: 'https://example.com/token', credentialKey: 'oauth', fields: {client_id: 'client id'}};
    return await Promise.all([tide.auth.getAccessToken(options), tide.auth.getAccessToken(options)]);
  });`);
  const result = await mock.dispatch('tool', 'token', {});
  assert.deepEqual(JSON.parse(JSON.stringify(result)), ['fresh', 'fresh']);
  assert.equal(requests, 1);
  assert.equal(JSON.parse(stored).refresh_token, 'refresh');
  await mock.dispatch('tool', 'token', {});
  assert.equal(requests, 1);
});

test('OAuth errors do not overwrite stored credentials and permit retry', async () => {
  let attempts = 0;
  const mock = createMock({handlers: {
    'credentials.get': () => JSON.stringify({access_token: 'old', refresh_token: 'r', expiresAt: 1}),
    'http.transfer': () => { attempts++; return {status: 400, body: '{"error":"invalid_grant"}'}; },
    'credentials.set': () => { throw new Error('Must not overwrite'); },
  }});
  mock.load(`tide.registerTool('token', () => tide.auth.getAccessToken({url: 'https://example.com/token', credentialKey: 'oauth'}));`);
  await assert.rejects(mock.dispatch('tool', 'token', {}), /OAuth token request failed/);
  await assert.rejects(mock.dispatch('tool', 'token', {}), /OAuth token request failed/);
  assert.equal(attempts, 2);
});

test('context.build can retrieve plugin memory and return an additive context', async () => {
  const mock = createMock({handlers: {'database.get': args => ({notes: 'Remember tea', botId: args.key})}});
  mock.load(`tide.on('context.build', async payload => {
    const memory = await tide.database.get('memory', payload.botId);
    return {context: memory.notes};
  });`);
  const result = await mock.dispatch('event', 'context.build', {botId: 'bot', text: 'hello'});
  assert.equal(result.context, 'Remember tea');
});
test('new account token exchange never retains the previous account refresh token', async () => {
  let stored = JSON.stringify({access_token: 'old', refresh_token: 'old-account'});
  const mock = createMock({handlers: {
    'credentials.get': () => stored,
    'credentials.set': args => { stored = args.value; },
    'http.transfer': () => ({status: 200, body: JSON.stringify({access_token: 'new-account'})}),
  }});
  mock.load(`tide.registerTool('login', () => tide.auth.exchangeToken({
    url: 'https://example.com/token', credentialKey: 'account',
    fields: {grant_type: 'authorization_code', code: 'new-code'}
  }));`);
  await mock.dispatch('tool', 'login', {});
  assert.equal(JSON.parse(stored).access_token, 'new-account');
  assert.equal(JSON.parse(stored).refresh_token, undefined);
});
