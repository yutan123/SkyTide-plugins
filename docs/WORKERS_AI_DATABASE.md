# 常驻任务、AI 与文档数据库

这些接口使用 SDK v1，通过 `requiredCapabilities` 声明最低宿主能力。旧版宿主会拒绝安装要求其不支持能力的插件。

## 清单

```json
{
  "id": "tidebot_data_worker",
  "name": "数据工作台",
  "version": "1.0.0",
  "apiVersion": 1,
  "entry": "main.js",
  "permissions": ["workers", "database", "ai", "chat.read", "chat.send"],
  "requiredCapabilities": ["workers", "runtime.sleep", "database", "ai", "commands", "events.priority"],
  "workers": [{"name": "collect", "intervalMs": 5000}],
  "commands": ["stats"],
  "eventPriority": 0
}
```

`workers` 最多 8 项，名称以英文字母开头，后续使用字母、数字或下划线，最多 40 字符。`intervalMs` 默认 5000，范围 1000～86400000，表示本轮完成后至下一轮的最短间隔。声明 worker 必须申请 `workers` 权限，并在入口中注册相同名称；多注册或漏注册均导致启动失败。

## 常驻任务

```js
tide.registerWorker('collect', async context => {
  const previous = await tide.database.get('stats', 'latest');
  await tide.database.put('stats', 'latest', {
    count: (previous ? previous.count : 0) + 1,
    time: Date.now()
  });
  await context.sleep(50);
});
```

插件启用、宿主恢复已启用插件后自动开始调度。每个回调完成一轮工作后返回，宿主负责再次调度。同步 JavaScript 仍受执行预算限制；大量计算需要分块并等待宿主，不能使用无限同步循环，也不应从入口或生命周期回调创建脱离宿主管理的无限异步循环。单轮沿用宿主调用超时，默认约 6 分钟；超时可能关闭运行实例。

`context.sleep(ms)` 与 `tide.sleep(ms)` 支持 1～60000 毫秒等待，每实例最多同时等待 32 个。worker 的上下文等待额外检查该轮执行权。停用、重载、更新、卸载或实例退出会取消等待并关闭该实例的网络与 AI 请求。

同一插件同名 worker 使用 SQLite 租约协调前台与后台宿主：每秒检查、30 秒租约、持续续约。同一实例不会重叠执行同名 worker。运行实例异常退出后，其他活跃宿主可在租约到期后接手；失败按指数退避重试，间隔上限为 5 分钟或配置间隔中较大者。检测到执行权丢失会关闭失效实例。

租约无法撤销已经发给外部服务的请求，恢复也不保证业务操作恰好执行一次。采集游标应持久化，外部写入使用业务幂等键。后台和锁屏运行取决于宿主引擎是否仍活跃及系统调度；进程结束后不再执行。worker 没有聊天上下文，不能直接使用需要会话 token 的聊天、通知和媒体接口。

`tide.diagnostics.getStatus().workers` 返回当前宿主实例的任务声明与本地执行状态，可能包含 `state`、`startedAt`、`nextAt`、`failures`、`error`；未获得租约的实例可能只有声明信息。

## 文档数据库

需要 `database` 权限及 `database` 能力。数据按插件 ID、集合和键隔离，更新保留、卸载清除；插件不能执行 SQL 或读取宿主表。

| 接口 | 行为 |
| --- | --- |
| `get(collection, key)` | 返回 JSON 值；不存在时返回 `null` |
| `put(collection, key, value, {vector?})` | 替换记录；未提供向量时同时清除旧向量 |
| `delete(collection, key)` | 返回是否删除了记录 |
| `query(collection, {prefix?, after?, limit?})` | 按键升序返回 `{key, value, updatedAt}`；`after` 为排他游标 |
| `batch(operations)` | 在一个事务中执行 `get`、`put`、`delete`，按顺序返回结果 |
| `version()` | 返回当前迁移版本，初始为 0 |
| `migrate(from, to, operations)` | 当前版本等于 `from` 时原子执行操作并更新版本，返回 `true`；版本不匹配返回 `false` |
| `search(collection, vector, {limit?})` | 返回按余弦相似度降序排列的 `{key, value, score}` |

集合名称以英文字母开头，只含字母、数字和下划线，最多 64 字符；键为 1～256 字符且不含 NUL。单条 JSON 编码后最多 128 KiB，每插件最多 10000 条、32 MiB，包括向量及键。批量与迁移接受 1～100 个操作；参数或配额检查失败回滚整个事务，迁移版本也回滚。跨宿主迁移需要处理 `false` 返回值，不能先读取版本再假设迁移一定成功。

查询 `limit` 默认 50，范围 1～100；查询和检索结果受约 512 KiB 上限约束，可能少于 `limit`，普通查询可用最后一条记录的键继续翻页。批量结果超过 512 KiB 会回滚并报错。所有调用还受宿主 IPC 大小和并发限制约束，应分批处理大数据。

向量检索还需要 `database.vector` 能力。向量包含 1～2048 个有限数字，必须有非零范数；宿主归一化后存储，同一集合有向量的记录维度必须一致。单集合最多检索 1000 条向量记录，超出会报错；这是有界的精确余弦检索。向量由插件或其授权的外部服务提供。

```js
await tide.database.migrate(0, 1, [
  {operation: 'put', collection: 'meta', key: 'schema', value: {ready: true}}
]);
await tide.database.put('vectors', 'item1', {text: '示例'}, {vector: [1, 0, 0]});
const matches = await tide.database.search('vectors', [0.9, 0.1, 0], {limit: 5});
```

## AI 文本生成

需要 `ai` 权限及 `ai` 能力。使用用户在应用中配置的 OpenAI 兼容聊天提供商；模型列表只包含公开标识、名称和模型名。标识是不透明值，插件通过列表选择后传回，不依赖应用内部提供商 ID。

```js
const providers = await tide.ai.listModels();
if (!providers.length) throw new Error('请先配置聊天模型');
const result = await tide.ai.generate({
  requestId: 'summarize-1',
  providerId: providers[0].id,
  model: providers[0].models[0],
  messages: [{role: 'user', content: '概括以下数据：…'}],
  maxTokens: 1024,
  temperature: 0.4
});
await tide.log(result.text);
```

API Key 和请求地址由宿主管理，不返回给插件。此接口执行无状态、非流式文本生成，不落聊天记录，也不进入工具调用链。插件自行传入历史；允许 `system`、`user`、`assistant` 文本消息，1～64 条，总编码最多 256 KiB。`model` 只能选择该提供商已配置的模型。

每实例最多 2 个并发请求，120 秒超时，响应最多 512 KiB。`maxTokens` 默认 2048，范围 1～8192；`temperature` 默认 0.7，范围 0～2。`requestId` 使用 1～80 个字母、数字、下划线或连字符；活动请求不能复用 ID。`tide.ai.cancel(requestId)` 返回是否找到活动请求，取消和停用后的迟到响应不会作为成功结果返回。请求会产生所选提供商的正常调用费用。

## 文本命令与事件顺序

`commands` 最多 32 个不重复名称，以小写英文字母开头，后续只含小写字母、数字或下划线，最多 40 字符。声明命令需要 `chat.read` 权限，在入口用 `tide.registerCommand` 一一注册；发送回复另需 `chat.send`。

```js
tide.registerCommand('stats', async (args, context) => {
  const latest = await tide.database.get('stats', 'latest');
  await context.chat.sendText({
    text: JSON.stringify(latest),
    requestId: 'stats-' + args.messageId
  });
});
```

收到用户消息 `/stats` 或 `/stats 参数` 时调用相应处理器，`args` 包含 `text`、`botId`、`messageId`。名称大小写敏感且要求完整匹配；参数为命令后修剪首尾空白的文本。命令使用当前消息的会话上下文，遵守机器人范围开关与现有消息去重规则。消息认领后不自动重试，插件回复应使用稳定的 `requestId`。

`eventPriority` 为 -100～100 的整数，默认 0。不同插件的聊天事件与工具 Hook 按优先级从高到低执行，同优先级按插件 ID 排序；单个插件的事件处理器仍按注册顺序执行。命令先于该插件的 `chat.message` Hook；命令报错后跳过该插件本条消息的后续处理，其他插件继续执行。多个插件可声明同名命令并分别收到消息；命令不会阻止正常 AI 回复。工具 Hook 继续使用现有的 payload 变换与接管协议。
