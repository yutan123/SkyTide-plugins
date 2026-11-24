const test = require('node:test');
const assert = require('node:assert/strict');
const {createMock} = require('./mock.cjs');

test('message actions run only on dispatch and receive a single message without context', async () => {
  const mock = createMock({handlers: {'storage.set': () => null}});
  mock.load(`tide.registerMessageAction('save', async (message, context) => {
    if (context !== undefined || !Object.isFrozen(message)) throw new Error('Unexpected context');
    await tide.storage.set(message.id, message);
    return 'Saved';
  });`);
  await mock.dispatch('validateMessageActions', '', ['save']);
  assert.equal(mock.calls.length, 0);
  const message = {id: 'm1', role: 'user', text: 'hello'};
  assert.equal(await mock.dispatch('messageAction', 'save', message), 'Saved');
  assert.equal(mock.calls.length, 1);
  assert.deepEqual(mock.calls[0].args, {key: 'm1', value: message});
});

test('message action registrations and results are validated', async () => {
  const mock = createMock();
  mock.load(`tide.registerMessageAction('silent', () => {});
    tide.registerMessageAction('invalid', () => ({}));
    tide.registerMessageAction('large', () => 'x'.repeat(8193));`);
  assert.throws(() => mock.load(`tide.registerMessageAction('silent', () => {});`), /duplicate/);
  await assert.rejects(mock.dispatch('validateMessageActions', '', ['missing']), /Unregistered/);
  await assert.rejects(mock.dispatch('validateMessageActions', '', ['silent']), /Undeclared/);
  const payload = {id: 'm', role: 'assistant', text: 'text'};
  assert.equal(await mock.dispatch('messageAction', 'silent', payload), null);
  await assert.rejects(mock.dispatch('messageAction', 'invalid', payload), /Invalid/);
  await assert.rejects(mock.dispatch('messageAction', 'large', payload), /Invalid/);
});