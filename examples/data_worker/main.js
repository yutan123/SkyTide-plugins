'use strict';

tide.on('activate', async () => {
  await tide.database.migrate(0, 1, [
    {operation: 'put', collection: 'meta', key: 'schema', value: {version: 1}}
  ]);
});

tide.registerWorker('sample', async () => {
  const previous = await tide.database.get('stats', 'latest');
  await tide.database.put('stats', 'latest', {
    iterations: (previous ? previous.iterations : 0) + 1,
    sampledAt: Date.now()
  });
});

tide.registerCommand('workerstats', async (args, context) => {
  const latest = await tide.database.get('stats', 'latest');
  await context.chat.sendText({
    text: latest ? '采样轮数：' + latest.iterations + '\n最近采样：' + new Date(latest.sampledAt).toISOString() : '暂未采样',
    requestId: 'workerstats-' + args.messageId
  });
});

tide.registerCommand('workersummary', async (args, context) => {
  const providers = await tide.ai.listModels();
  const provider = providers.find(item => item.models.length);
  if (!provider) {
    await context.chat.sendText({text: '请先在应用中配置聊天模型。', requestId: 'workersummary-' + args.messageId});
    return;
  }
  const latest = await tide.database.get('stats', 'latest');
  const result = await tide.ai.generate({
    requestId: 'summary-' + args.messageId,
    providerId: provider.id,
    model: provider.models[0],
    messages: [{role: 'user', content: '用一句中文概括以下采样状态，不推测未提供的信息：' + JSON.stringify(latest)}],
    maxTokens: 256
  });
  await context.chat.sendText({text: result.text, requestId: 'workersummary-' + args.messageId});
});