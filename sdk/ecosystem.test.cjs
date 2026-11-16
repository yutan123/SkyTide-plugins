'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {createMock} = require('./mock.cjs');
test('data worker example samples independently and summarizes only on command', async () => {
  const docs = new Map();
  const replies = [];
  let generations = 0;
  const mock = createMock({handlers: {
    'database.migrate': () => true,
    'database.get': args => docs.get(args.collection + ':' + args.key) || null,
    'database.put': args => {docs.set(args.collection + ':' + args.key, args.value); return null;},
    'chat.sendText': args => {replies.push(args); return {status: 'sent'};},
    'ai.listModels': () => [{id: 'opaque', name: 'Test', models: ['text']}],
    'ai.generate': args => {generations++; assert.equal(args.providerId, 'opaque'); return {text: '采样运行正常', model: 'text', requestId: args.requestId};},
  }});
  mock.load(fs.readFileSync(path.join(__dirname, '../examples/data_worker/main.js'), 'utf8'));
  await mock.dispatch('validate', '', []);
  await mock.dispatch('validateCommands', '', ['workerstats', 'workersummary']);
  await mock.dispatch('validateWorkers', '', ['sample']);
  await mock.dispatch('event', 'activate', {});
  await mock.dispatch('worker', 'sample', {workerToken: 'lease'});
  await mock.dispatch('worker', 'sample', {workerToken: 'lease2'});
  assert.equal(docs.get('stats:latest').iterations, 2);
  assert.equal(generations, 0);
  assert.equal(replies.length, 0);
  await mock.dispatch('command', 'workerstats', {args: {text:'', botId:'b', messageId:'m'}, contextToken: 'scope'});
  assert.match(replies[0].text, /采样轮数：2/);
  assert.equal(replies[0].contextToken, 'scope');
  await mock.dispatch('command', 'workersummary', {args: {text:'', botId:'b', messageId:'m2'}, contextToken: 'scope'});
  assert.equal(generations, 1);
  assert.equal(replies[1].text, '采样运行正常');
});