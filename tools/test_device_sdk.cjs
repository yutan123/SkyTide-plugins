const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');

function setup() {
  const requests = [];
  const results = new Map();
  const sandbox = vm.createContext({sendMessage(channel, raw) {
    const message = JSON.parse(raw);
    if (channel === 'tide.host') {
      requests.push(message);
      sandbox.__tideResolve(message.id, true, null);
    } else {
      results.get(message.id)(message);
    }
  }});
  vm.runInContext(fs.readFileSync(path.join(root, 'sdk/runtime.js'), 'utf8'), sandbox);
  let next = 0;
  return {requests, sandbox, dispatch(event, payload) {
    const id = ++next;
    return new Promise(resolve => {
      results.set(id, resolve);
      sandbox.__tideDispatch(id, 'event', event, payload);
    });
  }};
}

test('desktop pet opens from ui.action and sends updates on overlay.message', async () => {
  const {requests, sandbox, dispatch} = setup();
  vm.runInContext(fs.readFileSync(path.join(root, 'examples/desktop_pet/main.js'), 'utf8'), sandbox);
  assert.equal((await dispatch('ui.action', {
    __tideDeviceAction: 'action-token', payload: {action: 'open', values: {}},
  })).error, undefined);
  assert.deepEqual(requests[0].args, {
    entry: 'pet.html', assetPaths: ['pet.svg'], width: 112, height: 112,
    compact: true, actionToken: 'action-token',
  });
  assert.equal(requests[0].method, 'overlay.show');
  assert.equal((await dispatch('overlay.message', {data: {type: 'pet'}})).error, undefined);
  assert.equal(requests[1].method, 'overlay.update');
  assert.deepEqual(requests[1].args, {data: {taps: 1}});
});

test('picker authorization is scoped to the action handler', async () => {
  const {requests, sandbox, dispatch} = setup();
  vm.runInContext(`
    tide.on('ui.action', (payload, ctx) => ctx.device.pickPhoto({path: 'pet.png', actionToken: 'fake'}));
    tide.on('app.ready', (payload, ctx) => [typeof ctx.device, typeof tide.device.pickPhoto]);
  `, sandbox);
  await dispatch('ui.action', {__tideDeviceAction: 'actual', payload: {action: 'pick', values: {}}});
  assert.deepEqual(requests[0].args, {path: 'pet.png', actionToken: 'actual'});
  assert.deepEqual((await dispatch('app.ready', {})).value, ['undefined', 'undefined']);
});
