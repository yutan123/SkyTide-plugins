tide.on('ui.action', async ({ action, values }) => {
  if (action !== 'test_connection') return;
  const response = await tide.request({
    url: values.endpoint,
    method: 'HEAD',
    timeoutMs: 10000
  });
  return { ok: response.status >= 200 && response.status < 400 };
});
