# 连接、账号授权与插件记忆

本页适用于 SDK v1。插件业务使用 QuickJS，通过 `tide` 调用宿主接口。Node.js 的 `net`、`tls`、`Buffer`、npm 原生模块不属于运行环境；邮件协议、消息协议和服务商认证逻辑由插件实现。

## 能力与权限

在 `requiredCapabilities` 中声明依赖的能力，旧宿主会在安装时拒绝无法满足的依赖。

| 能力 | 接口 | 权限 |
| --- | --- | --- |
| `network.sockets` | TCP、TLS、STARTTLS | `network`、`network.sockets` |
| `network.websocket` | WebSocket | `network` |
| `network.stream` | HTTP 响应流、SSE | `network` |
| `network.binary` | Base64 二进制读写 | 随所属连接 |
| `network.endpoints` | 精确端点授权 | 随所属连接 |
| `crypto`、`auth.pkce` | 编码、密码学原语、PKCE | 无额外权限 |
| `auth.oauth` | 浏览器 OAuth 授权码流程 | `network`、`auth.browser` |
| `credentials` | 插件独立凭据存储 | `credentials` |
| `background.send` | 指定机器人投递文本 | `background.send`、`chat.send` |
| `context.inject` | 提供聊天参考记忆 | `context.inject` 与 `context.build` hook |

明文 `http`、`ws`、`tcp` 还需要 `network.cleartext`。本机、私有网络、链路本地及其他非公网地址需要 `network.local`。安装、更新确认及插件详情展示声明的权限和网络范围。

```json
{
  "permissions": ["network", "network.sockets"],
  "requiredCapabilities": ["network.sockets", "network.endpoints"],
  "networkEndpoints": ["tls://imap.example.com:993", "tls://smtp.example.com:465"]
}
```

`networkEndpoints` 最多 64 项，每项最多 300 字符，只包含协议、主机、端口；禁止路径、尾斜线、查询、片段、用户信息及通配符。TCP/TLS 必须显式指定端口；HTTP/WS 默认 80，HTTPS/WSS 默认 443。匹配时比较协议、主机与有效端口。请求的路径和查询可变化，但端点必须匹配。`networkOrigins` 继续用于原有 HTTPS 请求、文件传输、媒体与 OAuth；两类授权独立。

连接创建前解析 DNS 并检查地址范围，实际连接固定到检查后的地址，TLS 按原主机验证证书。当前使用 DNS 返回的第一个地址，失败时插件可重试；不自动轮询其他地址。HTTP/WS 流连接直接访问端点，不使用代理，不自动跟随重定向，不接受无效 TLS 证书。Android 全局网络策略继续禁止非回环明文请求；通过插件权限和精确端点检查后，宿主仅为该 HTTP/WS 请求设置 Flutter HTTP zone 例外。TCP 套接字同样先执行插件权限和端点检查。

## 连接与流

| API | 返回 |
| --- | --- |
| `tide.connections.connect({url})` | `{connectionId, secure}` |
| `tide.connections.webSocket({url, headers?})` | `{connectionId, protocol}` |
| `tide.connections.http({url, method?, headers?, text?, base64?, format?})` | `{connectionId, status, headers}` |
| `tide.connections.read(connectionId, {timeoutMs?})` | 数据块、事件、超时或流结束 |
| `tide.connections.write(connectionId, {text?, base64?})` | 写入字节数 |
| `tide.connections.startTls(connectionId)` | 升级后的 `{connectionId, secure: true}` |
| `tide.connections.close(connectionId)` | 是否存在该句柄 |

HTTP 方法支持 GET、POST、PUT、PATCH、DELETE、HEAD、OPTIONS，默认 GET；`format` 为 `binary`（默认）或 `sse`。HTTP 请求体最多 768 KiB，响应按块读取，不提供可写请求流。WebSocket 目前不协商子协议或扩展。

```js
const {connectionId} = await tide.connections.connect({url: 'tls://imap.example.com:993'});
try {
  await tide.connections.write(connectionId, {text: 'a1 CAPABILITY\r\n'});
  const chunk = await tide.connections.read(connectionId, {timeoutMs: 10000});
  if (!chunk.done && !chunk.timedOut) {
    const bytesBase64 = chunk.data;
    // 协议解析器应累计字节，处理半包、多包及跨块 UTF-8。
  }
} finally {
  await tide.connections.close(connectionId);
}
```

TCP/TLS 和 HTTP 数据块的 `data` 为 Base64，`type` 为 `binary`。WebSocket 文本帧另有 `type: 'text'` 和 `text`；二进制帧使用 Base64。流结束返回 `done: true`，读取超时返回 `done: false, timedOut: true`，超时不关闭连接。默认读取等待 30000 毫秒，允许 1～30000 毫秒。不要独立解码每个 TCP 块中的 UTF-8；可采用插件的增量解码器，或累计完整协议单元后调用 `tide.crypto.decode`。

STARTTLS 前先在明文连接中完成协议协商，确认服务端允许升级，消费完明文响应，再调用 `startTls`。升级时不能存在未读缓冲、并行读取或写入。初始 TCP 端点仍需 `network.cleartext`，升级使用原连接主机验证 TLS 证书。宿主不代发 SMTP STARTTLS 或 IMAP STARTTLS 命令。

每个插件最多 8 个连接或响应流，每个句柄最多一个读取和一个写入操作；单次写入及 WebSocket 消息最多 64 KiB。接收缓冲最多 1 MiB 或 1024 项，读取较慢时暂停接收，超过限额则关闭。连接两分钟内没有 API 访问会被回收，检查周期 30 秒；定期读取可保持活动连接。流结束后仍需显式关闭句柄以释放配额。停用、更新、配置重启及运行时结束都会关闭连接。插件应在 worker 回调中分批读取，使用退避重连并保存消费游标。单次 worker、工具和 UI 回调仍受六分钟运行时调用预算约束，不要在回调内无限循环；可在预算前返回，由后续 worker 回调继续使用活动句柄或重连。

## SSE

```js
const stream = await tide.connections.http({
  url: 'https://events.example.com/mail',
  format: 'sse',
  headers: {'accept': 'text/event-stream'}
});
try {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    const item = await tide.connections.read(stream.connectionId);
    if (item.done) break;
    if (item.type === 'event') {
      const {data, event, id, retry} = item.event;
      // 持久化 id，并由插件处理事件和重连。
    }
  }
} finally {
  await tide.connections.close(stream.connectionId);
}
```

示例每轮最多处理约一分钟后返回；后续 worker 回调使用已保存的消费游标重新连接。响应必须为 `text/event-stream`。解析器支持增量 UTF-8、BOM、CR/LF/CRLF、注释及 `data/event/id/retry`；多行 data 使用换行合并。每行与每个事件上限为 32 Ki 字符。只有空行结束的事件会投递，流结束时未完成事件会丢弃。返回数据中的 `id` 和 `retry` 可供重连使用；自动重连和 `Last-Event-ID` 请求头由插件管理。

## 编码与加密

`random(length = 32)` 返回 Base64 安全随机字节，长度 1～4096。`encode(text)` 将 UTF-8 转为 Base64，`decode(base64, {allowMalformed?})` 反向转换。摘要与 HMAC 支持 `sha256`（默认）、`sha512`、`sha1`、`md5`，返回 `{hex, base64}`；后两者用于兼容已有协议，新签名优先使用 SHA-256 或 SHA-512。

```js
const data = await tide.crypto.encode('hello');
const digest = await tide.crypto.digest({base64: data, algorithm: 'sha256'});
const key = await tide.crypto.random(32);
const sealed = await tide.crypto.encrypt({key, base64: data});
const clear = await tide.crypto.decrypt({key, ...sealed});
```

加密使用 AES-256-GCM，key 为 32 字节 Base64；加密生成随机 nonce 并返回 `{base64, nonce, mac}`。可选 `aad` 为 Base64，解密必须一致。nonce 为 12 字节，mac 为 16 字节。一般数据上限 256 KiB，HMAC key 上限 4096 字节。密钥和返回值由插件管理，不应写入日志、普通 UI 响应或聊天内容。

## OAuth 与凭据

浏览器授权支持服务商允许的桌面式回环 OAuth 授权码流程：宿主监听 `http://127.0.0.1:<随机端口>/callback`，使用随机 state、PKCE S256，并在外部浏览器打开 HTTPS 授权地址。服务商必须允许该回调形式和随机端口。仅支持固定 HTTPS 回调、应用自定义 scheme 或其他移动端流程的服务商，需要其对应的认证方案。

```js
const authorization = await tide.auth.authorize({
  url: 'https://accounts.example.com/authorize',
  parameters: {client_id: 'public-client-id', scope: 'mail.read offline_access'}
});
await tide.auth.exchangeToken({
  url: 'https://accounts.example.com/token',
  credentialKey: 'mail_account',
  fields: {
    grant_type: 'authorization_code', client_id: 'public-client-id',
    code: authorization.code, code_verifier: authorization.verifier,
    redirect_uri: authorization.redirectUri
  }
});
const accessToken = await tide.auth.getAccessToken({
  url: 'https://accounts.example.com/token', credentialKey: 'mail_account',
  fields: {client_id: 'public-client-id'}
});
```

授权与 token HTTPS origin 均须声明在 `networkOrigins`。授权端点不能带查询，参数放入 `parameters`，必须提供 client_id。宿主固定 response_type、redirect_uri、state 及 PKCE 字段；每个运行时最多一个授权，等待三分钟，停用时取消。`createPkce()` 单独返回 verifier、challenge、method 和 state，可用于插件自行实现其他合规回调流程。

`exchangeToken` 以表单 POST 发送字段，检查响应后返回 token；指定 credentialKey 时保存结果。`getAccessToken` 读取已存凭据，提前一分钟刷新过期 token；同一凭据键的并发刷新合并，刷新响应未携带 refresh_token 时保留原值。交换新账号的授权码不会继承旧账号的 refresh_token。刷新失败不会覆盖原凭据，插件应提示重新授权。

`tide.credentials.get/set/delete` 读写插件独立安全存储；键为 1～128 位字母、数字、下划线、点或连字符，值必须是字符串，总量上限 64 KiB JSON UTF-8。缺失返回 null；卸载清除，普通更新保留。操作与插件存储共用锁，避免和卸载竞争。凭据仍可由该插件读取，用户应只授权可信插件。客户端公共应用不应嵌入服务商客户端密钥。

## 后台文本投递

```js
await tide.background.sendText({
  botId: tide.config.botId,
  requestId: 'mail_' + stableMessageId,
  text: '收到一封新邮件'
});
```

botId 必须是存在且允许该插件的机器人；返回消息回执，沿用聊天发送校验和 requestId 去重。对同一机器人和插件重试时复用稳定 requestId。这个入口可在 worker 或 UI 事件中调用；它不创建聊天调用上下文，也不赋予上下文媒体引用。

Android 后台受进程存活、系统电量策略和应用生命周期约束。持久任务可保存调度状态，套接字与 OAuth 等进程内状态不会在进程被杀后自动恢复。需要可靠通知的插件应保存游标、使用任务或 worker 恢复连接并去重投递。

## 插件记忆与上下文

使用 `database`、`storage` 或 `files` 管理插件自己的记录，再按用户当前输入提供参考资料：

```js
tide.on('context.build', async ({botId, text}) => {
  const memory = await tide.database.get('memory', botId);
  const notes = memory && typeof memory === 'object' && !Array.isArray(memory)
    ? memory.notes : '';
  return {context: typeof notes === 'string' ? notes : ''};
});
```

清单声明 `permissions: ["context.inject", "database"]`、`hooks: ["context.build"]`，并按使用接口声明 capability。hook 只接收 botId 与最多 8000 字符的当前输入，无聊天上下文 token。只调用已启用且该机器人允许的插件；日记和今日一言生成不触发此 hook。

多个插件并行查询，每个最多等待五秒，按插件顺序合并。单插件 context 最多 8000 字符，总计最多 24000 字符，超限项忽略。超时仅停止本轮等待，未完成的 hook 不会在下一轮重复启动，直到原调用结束。返回内容作为带插件来源的参考记忆加入模型上下文，应仅包含相关资料。

内置世界书、日记及今日一言开关继续控制内置功能。关闭内置世界书不会关闭另行授权的插件数据库或 context hook；禁用插件或取消其机器人授权可停止对应注入。


### 设置聊天提示词

清单声明 `permissions: ["context.inject"]` 和 `requiredCapabilities: ["context.prompts"]`。每个插件在每个机器人下各有一个 `persistent` 槽和一个 `once` 槽。设置同一槽会覆盖原值，默认模式为 `persistent`。每条提示词最多 4000 字符。

```js
await tide.context.setPrompt({botId, prompt: '默认用简短段落回复。'});
await tide.context.setPrompt({botId, prompt: '下一次回复使用项目符号。', mode: 'once'});
await tide.context.clearPrompt({botId, mode: 'persistent'});
```

持续提示词随普通聊天请求发送，重启后保留。一次性提示词在下一次符合条件的聊天请求取用时移除，同一请求的模型重试复用已取出的内容。持久提示词位于可复用前缀，动态参考资料和一次性提示词放在历史之后。

### 请求机器人生成消息

清单在 `permissions` 和 `requiredCapabilities` 中均声明 `background.generate`。

```js
const receipt = await tide.background.requestReply({
  botId,
  requestId: `mail:${messageId}`,
  prompt: '用你的语气提醒用户收到一封邮件。',
  context: mailSummary,
});
```

宿主使用目标机器人的模型、人设和聊天历史异步生成消息。这轮请求关闭工具，任务文本和参考资料不写入聊天记录。`prompt` 最多 4000 字符，`context` 最多 8000 字符。`accepted` 表示已受理，`delivered` 表示该请求已有消息，`busy` 表示该机器人当前正在生成另一条插件消息，可稍后重试。失败或宿主中止后可用相同 `requestId` 重试，已保存的消息会去重。
