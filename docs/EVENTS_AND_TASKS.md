# 消息事件与持久任务

常驻任务、AI 文本生成、私有文档数据库与命令接口见[常驻任务、AI 与文档数据库](WORKERS_AI_DATABASE.md)。

插件在 `manifest.json` 中声明 `hooks`；声明 `requiredCapabilities` 可让不支持这些能力的宿主在导入时拒绝安装。

```json
{
  "permissions": ["chat.read", "chat.send", "tasks"],
  "hooks": ["chat.message", "task.trigger"],
  "requiredCapabilities": ["events.chat", "tasks"]
}
```

以上字段合并到完整清单中使用。插件默认对全部机器人启用，包括新建机器人；用户可在插件管理页取消勾选部分机器人。查询、发送、消息事件和任务都遵守这一范围。

## 消息事件

`chat.message` 在当前运行引擎收到用户消息插入事件时触发，`chat.sent` 对应其它角色的消息插入事件。需要 `chat.read` 权限。由插件发送的消息不再次触发插件消息事件，避免递归。

处理函数的第一个参数为 `{botId, messageId, message}`，其中 `message` 只包含 `id`、`role`、`type`、`content`、`timestamp`。第二个参数是绑定该机器人的上下文：

```javascript
tide.on('chat.message', async (event, context) => {
  const recent = await context.chat.getRecentMessages({limit: 10});
  await tide.log(`当前会话最近 ${recent.length} 条消息`);
});
```

`context.chat.getBotInfo()`、`getRecentMessages({limit})`、`getUnreadCount()` 需要 `chat.read`。最近消息按时间和 ID 倒序返回，默认 20 条，最多 100 条。查询不接受机器人 ID。上下文在处理结束、插件停用或机器人被排除后失效，不能缓存起来用于稍后调用。`app.ready` 等普通生命周期事件没有会话上下文。

消息事件来自当前引擎内的消息总线，不是持久订阅，也不补发历史消息；前后台引擎各自处理本引擎收到的消息；同一插件、机器人、事件和消息 ID 使用 SQLite 去重，记录保留七天。应用退出期间的消息不保证送达，已领取事件即使处理失败也不重投。宿主最多同时接收 32 个待处理事件，超过上限的事件会丢弃。业务不能依赖逐条必达。

## 持久任务

工具调用或带会话上下文的事件可以使用 `context.tasks`：

```javascript
tide.registerTool('remind', async (args, context) => {
  await context.tasks.schedule({
    id: args.id,
    at: Date.now() + 60000,
    payload: {text: args.text}
  });
  return {scheduled: true};
});

tide.on('task.trigger', async (event, context) => {
  await context.chat.sendText({
    text: event.payload.text,
    requestId: `task-${event.id}`
  });
});
```

工具仍须在清单的 `tools` 中声明其参数 schema。发送需要额外的 `chat.send` 权限。

- `schedule({id, at, payload, intervalMs?})` 返回 `{id, status: 'pending'}`。`at` 为毫秒 Unix 时间，必须在当前时间到未来一年内。
- ID 允许 1～128 个英文字母、数字、下划线、点和连字符，在同一插件内唯一；重复 ID 会报错，不覆盖旧任务。
- `payload` 必须可 JSON 序列化，编码后最多 16 KiB。每个插件最多 100 个等待或运行中的任务。
- `cancel(id)` 取消当前机器人的等待或运行中任务，成功返回 `true`；不存在、已结束或属于其它机器人时返回 `false`。取消使运行任务的会话上下文失效，已完成的外部副作用不会回滚。
- `task.trigger` 收到 `{id, botId, scheduledAt, payload}`，上下文绑定任务所属机器人。

任务保存在 SQLite 中，前台启动、前台分钟心跳和后台服务心跳会领取到期任务，每次最多处理 8 个。应用和后台服务停止时不会唤醒系统，时间表示最早执行时间，不保证准点执行。

任务领取使用事务和十分钟租约，进程中断后可重新领取，最多三次领取；单次任务的普通处理异常直接结束为失败；周期任务记录错误并进入下一周期。停用插件、删除机器人或排除机器人会让执行检查失败。卸载插件会清除其任务。终态记录在后续任务结束时清理，保留窗口为到期时间起 30 天。

中断恢复可能重复进入处理函数。发送时应使用稳定的 `requestId`，其它外部副作用由插件自行实现幂等。

## 本地协议测试

```sh
node --test sdk/events.test.cjs
```

mock 要求显式提供宿主 API handler，验证上下文绑定与错误传递；不模拟 Android 服务、SQLite 恢复或真实权限隔离。

## 周期任务与修改

周期任务需要 `tasks` 权限、`task.trigger` Hook 和 `tasks.recurring` 能力。`schedule` 增加 `intervalMs`，范围为 60000～31536000000 毫秒；省略或设为 0 表示单次任务。周期基于到期时间保持固定节拍，执行完成后进入当前时间之后的下一个周期；错过的周期不逐个补跑。处理失败也进入下一周期；单个周期因进程中断最多重新领取三次，达到上限时记录错误并跳到下一周期。

```javascript
await context.tasks.schedule({
  id: 'hourly', at: Date.now() + 60000,
  intervalMs: 3600000, payload: {text: '定时提醒'}
});
await context.tasks.update({id: 'hourly', intervalMs: 7200000});
const statuses = await context.tasks.list();
await context.tasks.cancel('hourly');
```

`update({id, at?, payload?, intervalMs?})` 原子修改属于当前机器人的等待任务，至少提供一个修改字段，返回是否成功；正在执行和终态任务返回 `false`。`at` 和 `payload` 沿用 schedule 的校验规则；`intervalMs: 0` 将等待中的周期任务改为单次任务。省略字段保持原值，修改周期不会自动调整已保存的 `at`。

`list()` 返回最近到期的最多 100 条记录，字段为 `id/due_at/state/attempts/error/interval_ms`。`interval_ms` 为 0 表示单次任务；`attempts` 表示当前周期的领取次数。任务和私有文件在插件更新后保留，卸载时清除。

周期发送的幂等键应包含计划时间，例如 `requestId: 'task-' + event.id + '-' + event.scheduledAt`，这样不同周期可以分别发送，中断重试仍使用相同键。时间表示最早执行时间，应用和后台服务退出期间不会唤醒系统。
