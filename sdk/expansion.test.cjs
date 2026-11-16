'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {createMock} = require('./mock.cjs');

test('file and binary transfer APIs preserve options and report progress', async () => {
  const calls = [];
  const handlers = Object.fromEntries([
    'files.write', 'files.read', 'files.stat', 'files.list', 'files.delete',
    'http.downloadFile', 'http.uploadFile', 'http.cancelFile', 'http.fileProgress',
  ].map(method => [method, args => {calls.push([method, args]); return null;}]));
  const mock = createMock({handlers});
  mock.load(`tide.registerTool('files', async () => {
    await tide.files.write({path:'a',data:'AA==',encoding:'base64'});
    await tide.files.read({path:'a',offset:1,length:2,encoding:'base64'});
    await tide.files.stat('a'); await tide.files.list('cache'); await tide.files.delete('a');
    await tide.network.downloadFile({requestId:'d',url:'https://example.com',path:'video',headers:{Referer:'r'}});
    await tide.network.uploadFile({requestId:'u',url:'https://example.com',path:'video',method:'POST'});
    await tide.network.fileProgress('d'); await tide.network.cancelFile('d');
    return true;
  });`);
  assert.equal(await mock.dispatch('tool', 'files', {}), true);
  assert.equal(calls.length, 9);
  assert.deepEqual(calls[0], ['files.write', {path:'a',data:'AA==',encoding:'base64'}]);
  assert.equal(calls[5][1].headers.Referer, 'r');
  assert.equal(calls[6][1].method, 'POST');
  assert.deepEqual(calls[8], ['http.cancelFile', {requestId:'d'}]);
});

test('media processing, file resources and task updates use the invocation token', async () => {
  const methods = ['media.fromFile', 'media.process', 'media.saveFile', 'tasks.update'];
  const mock = createMock({handlers: Object.fromEntries(methods.map(method => [method, args => {
    assert.equal(args.contextToken, 'real');
    return method === 'media.fromFile' ? {resourceId:'input'} : method === 'media.process' ? {resourceId:'output'} : true;
  }]))});
  mock.load(`tide.registerTool('process', async (_,ctx) => {
    const input = await ctx.media.fromFile({path:'in.mp4',kind:'video',contextToken:'forged'});
    const output = await tide.media.process(ctx,{operation:'transcode',resourceId:input.resourceId,format:'mp3',contextToken:'forged'});
    await tide.media.saveFile(ctx,{resourceId:output.resourceId,path:'out.mp3',contextToken:'forged'});
    return ctx.tasks.update({id:'repeat',intervalMs:60000,payload:{rows:[{id:1}]},contextToken:'forged'});
  });`);
  assert.equal(await mock.dispatch('tool', 'process', {__tideInvocation:true,args:{},contextToken:'real'}), true);
  assert.deepEqual(mock.calls.map(call => call.method), methods);
  assert.equal(mock.calls[3].args.intervalMs, 60000);
});

test('new APIs advertise capabilities and unscoped processing rejects', async () => {
  const mock = createMock();
  mock.load(`tide.registerTool('caps', () => tide.capabilities);
    tide.on('app.ready', (_,ctx) => ctx.media.process({operation:'hls',url:'https://example.com/list.m3u8'}));`);
  const caps = await mock.dispatch('tool','caps',{});
  for (const cap of ['files','network.files','media.process','schema.nested','storage.large','tasks.recurring']) assert.ok(caps.includes(cap));
  await assert.rejects(mock.dispatch('event','app.ready',{}), /requires a tool invocation/);
  assert.equal(mock.calls.length, 0);
});