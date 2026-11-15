'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {createMock} = require('./mock.cjs');

test('concurrent scoped events keep task and query tokens isolated', async () => {
  const mock = createMock({handlers: {
    'chat.getRecentMessages': args => [{id: args.contextToken}],
    'tasks.schedule': args => ({id: args.id, status: 'pending'}),
  }});
  mock.load(`tide.on('chat.message', async (event, context) => {
    const messages = await context.chat.getRecentMessages({limit: 2, contextToken: 'forged'});
    return context.tasks.schedule({id: messages[0].id, at: event.at, contextToken: 'forged'});
  });`);
  const deliver = token => mock.dispatch('event', 'chat.message', {
    __tideEvent: true, contextToken: token, payload: {at: 123},
  });
  const results = await Promise.all([deliver('a'), deliver('b')]);
  assert.deepEqual(JSON.parse(JSON.stringify(results)), [
    {id: 'a', status: 'pending'}, {id: 'b', status: 'pending'},
  ]);
  assert.deepEqual(mock.calls.filter(x => x.method === 'tasks.schedule')
    .map(x => [x.args.id, x.args.contextToken]), [['a', 'a'], ['b', 'b']]);
});

test('unscoped lifecycle handlers cannot schedule tasks', async () => {
  const mock = createMock();
  mock.load("tide.on('app.ready', (_, context) => context.tasks.schedule({id: 'bad', at: 1}));");
  await assert.rejects(mock.dispatch('event', 'app.ready', {}), /requires a tool invocation or scoped event context/);
  assert.equal(mock.calls.length, 0);
});

test('task triggers unwrap payload and forward host failures', async () => {
  const mock = createMock({handlers: {'tasks.cancel': () => {throw new Error('context expired');}}});
  mock.load("tide.on('task.trigger', (event, context) => context.tasks.cancel(event.id));");
  await assert.rejects(mock.dispatch('event', 'task.trigger', {
    __tideEvent: true, contextToken: 'task-token', payload: {id: 'reminder'},
  }), /context expired/);
  assert.deepEqual(mock.calls[0].args, {id: 'reminder', contextToken: 'task-token'});
});

test('notifications and task listing use the event scope', async () => {
  const mock = createMock({handlers: {
    'notifications.show': args => {assert.equal(args.contextToken, 'scope'); return null;},
    'tasks.list': args => {assert.equal(args.contextToken, 'scope'); return [];},
  }});
  mock.load("tide.on('task.trigger', async (_, ctx) => {await ctx.notifications.show({title:'t',body:'b',contextToken:'forged'}); return ctx.tasks.list();});");
  const result = await mock.dispatch('event', 'task.trigger', {__tideEvent:true,contextToken:'scope',payload:{}});
  assert.deepEqual(JSON.parse(JSON.stringify(result)), []);
});
test('versioned host errors expose stable codes', async () => {
  const mock = createMock({handlers: {'http.transfer': () => {
    throw new Error(JSON.stringify({tideError:1,code:'TIMEOUT',message:'late',retryable:true}));
  }}});
  mock.load("tide.registerTool('run', async () => {try {await tide.network.transfer({requestId:'r',url:'https://example.com'});} catch(e) {return {code:e.code,message:e.message,retryable:e.retryable};}});");
  const result = await mock.dispatch('tool','run',{});
  assert.deepEqual(JSON.parse(JSON.stringify(result)), {code:'TIMEOUT',message:'late',retryable:true});
});
test('PDF send and resource inspection bind the event token', async () => {
  const mock = createMock({handlers: {
    'media.inspect': args => ({resourceId:args.resourceId,kind:'document'}),
    'chat.sendDocument': args => {assert.equal(args.contextToken,'pdf'); return {messageId:'m',status:'sent'};},
  }});
  mock.load("tide.on('task.trigger', async (_,ctx) => {const item=await ctx.media.inspect('r'); return ctx.chat.sendDocument({resourceId:item.resourceId,requestId:'pdf'});});");
  assert.equal((await mock.dispatch('event','task.trigger',{__tideEvent:true,contextToken:'pdf',payload:{}})).messageId,'m');
});
