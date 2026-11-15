'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

/** Runs the SDK protocol in Node. Host APIs must be supplied explicitly. */
function createMock({config = {}, handlers = {}, sdk = path.join(__dirname, 'runtime.js')} = {}) {
  const results = new Map();
  const calls = [];
  let sequence = 0;
  let sandbox;
  sandbox = vm.createContext({
    __tideConfig: config,
    sendMessage(channel, raw) {
      const data = JSON.parse(raw);
      if (channel === 'tide.result') {
        const waiter = results.get(data.id);
        if (!waiter) return;
        results.delete(data.id);
        data.error ? waiter.reject(new Error(data.error)) : waiter.resolve(data.value);
      } else if (channel === 'tide.host') {
        calls.push(data);
        Promise.resolve().then(() => {
          const handler = handlers[data.method];
          if (!handler) throw new Error('Mock host API not configured: ' + data.method);
          return handler(data.args);
        }).then(value => sandbox.__tideResolve(data.id, value, null),
          error => sandbox.__tideResolve(data.id, null, String(error.message || error)));
      } else throw new Error('Unknown bridge channel: ' + channel);
    },
  });
  vm.runInContext(fs.readFileSync(sdk, 'utf8'), sandbox, {timeout: 1000});
  return {
    calls,
    load(source) { vm.runInContext(source, sandbox, {timeout: 1000}); },
    dispatch(kind, name, payload, {timeoutMs = 2000} = {}) {
      const id = ++sequence;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          results.delete(id);
          reject(new Error('Mock invocation timed out'));
        }, timeoutMs);
        results.set(id, {
          resolve(value) { clearTimeout(timer); resolve(value); },
          reject(error) { clearTimeout(timer); reject(error); },
        });
        try { sandbox.__tideDispatch(id, kind, name, payload); }
        catch (error) { results.delete(id); clearTimeout(timer); reject(error); }
      });
    },
  };
}
module.exports = {createMock};