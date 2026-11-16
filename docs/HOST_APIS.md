# 通知、网络传输与诊断

常驻任务、AI 文本生成、私有文档数据库与命令接口见[常驻任务、AI 与文档数据库](WORKERS_AI_DATABASE.md)。

## 通知

清单声明 `notifications` 权限后，在工具或消息、任务事件中调用：

```javascript
await context.notifications.show({title: '提醒', body: '任务已完成'});
```

需要有效的机器人上下文，标题最多 120 字符，正文最多 2000 字符。通知显示插件名称，点击进入所属机器人。相同插件与机器人十秒内最多发送一次，后续通知替换先前通知。系统通知权限和系统渠道设置决定是否实际显示；接口不主动弹出系统授权对话框。限频为运行引擎内限制。

## 可取消网络传输

原有 `tide.request()` 继续可用。需要取消、进度或 multipart 上传时使用 `tide.network`，清单声明 `network` 权限、`networkOrigins`（精确 HTTPS origin、`https://*.example.com` 或 `*`），以及 `network.transfer` 能力依赖。

```javascript
const result = tide.network.transfer({
  requestId: 'upload-1',
  url: 'https://example.com/upload',
  method: 'POST',
  timeoutMs: 30000,
  multipart: [
    {name: 'description', value: '示例'},
    {name: 'file', filename: 'hello.txt', base64: 'aGVsbG8='}
  ]
});
// 在另一个仍在执行的处理函数中查询或取消同一个请求。
const progress = await tide.network.progress('upload-1');
// await tide.network.cancel('upload-1');
const response = await result;
```

- `transfer()` 返回与 `tide.request()` 相同的 `{status, headers, body}`。
- `requestId` 是 1～128 位英文字母、数字、下划线、点或连字符，在运行实例保留的请求记录中不得重复。
- `progress(id)` 返回 `{sent, received, total, state}` 或 `null`。`sent` 是提交给 HTTP 客户端的请求体字节数，不表示服务器已接收；`total` 是响应 Content-Length，未知时为 `null`。
- `state` 为 `running`、`finished` 或 `cancelled`。`finished` 只表示请求已结束，包括异常；结果以 `transfer()` 的 Promise 为准。
- `cancel(id)` 关闭进行中的客户端，返回是否接受取消。已结束或不存在时返回 `false`。请求尚未登记时取消也返回 `false`。
- 最多八个并发请求，保留最多约 64 个近期状态；清理已结束状态后旧 ID 可复用。
- multipart 最多 16 项；文件用 base64 提供，每个文件最多 512 KiB，请求体最多 768 KiB，响应最多 1 MiB。body 与 multipart 互斥。
- 上传名称和文件名只允许英文字母、数字、下划线、点和连字符。接口不读取本地文件路径。
- 不自动跟随重定向。超时最多 330000 毫秒。插件关闭、更新或运行实例失效时关闭传输。

HTTP 非成功状态仍返回响应，由插件检查 `status`。网络异常通过 Promise 拒绝传递。

## 通用文件发送
`context.chat.sendFile({url, requestId, fileName?, caption?, headers?, timeoutMs?})` 或 `{resourceId, requestId, fileName?, caption?}` 发送任意格式的文件附件。ZIP、Office 文档、文本、二进制及音视频文件均可发送，不按扩展名或文件头限制格式。单文件最多 256 MiB，消息类型为 `file`，显示文件卡片，点击调用设备上的应用打开；能否预览由设备已安装应用决定。

发送需要 `chat.send`；直接使用 URL 另需 `network`、`media.download` 和对应 `networkOrigins`。`url` 与 `resourceId` 互斥。资源仅限当前会话上下文，可直接使用 `file`、`image`、`video`、`audio` 或 `document` 类型资源；文件发送不转码、不改变原始内容。

`fileName` 是包含扩展名的文件名，最多 180 个字符且 UTF-8 最多 240 字节，不允许路径分隔符、控制字符、`.`、`..` 或首尾空白。优先使用发送时指定的名称，其次使用资源记录的名称；URL 下载默认取原始 URL 最后一个路径片段，不能作为合法文件名时使用 `attachment.bin`；不读取 Content-Disposition。已有媒体资源没有文件名时使用 `attachment.<识别出的扩展名>`。文件按消息独立保存，保留名称，不覆盖同名附件。请求 ID 去重、单次上下文最多发送 10 条消息、权限和生命周期规则与其他发送接口一致。

`context.media.download({url, kind: 'file', fileName?, headers?, timeoutMs?})` 下载通用文件，`context.media.fromFile({path, kind: 'file', fileName?})` 从插件私有目录导入；后者需 `files`、`media.download`。通用文件资源的 `extension` 为 `bin`，原文件名记录在 `fileName`；文件卡片及外部打开使用文件名的扩展名。`inspect()` 返回资源元数据，不暴露宿主路径。插件可声明 `requiredCapabilities: ["chat.files"]` 要求支持这些接口的宿主。

```javascript
await context.chat.sendFile({
  url: 'https://cdn.example.com/archive.zip',
  fileName: '资料.zip', requestId: 'archive-001'
});
const local = await context.media.fromFile({path: 'exports/data.csv', kind: 'file'});
await context.chat.sendFile({resourceId: local.resourceId, requestId: 'data-001'});
```

### 音频发送为语音或文件
`sendAudio()` 发送可播放的语音消息，`sendFile()` 发送文件卡片。两种形式由插件明确选择，同一个音频资源可复用，分别使用不同的 `requestId`。

```javascript
const audio = await context.media.download({
  url: 'https://cdn.example.com/music.mp3', kind: 'audio'
});
await context.chat.sendAudio({
  resourceId: audio.resourceId, duration: 30, requestId: 'voice-001'
});
await context.chat.sendFile({
  resourceId: audio.resourceId, fileName: '音乐.mp3', requestId: 'audio-file-001'
});
```

作为文件发送的音视频保持文件卡片，不自动切换为语音或视频。`sendAudio()` 保留现有音频格式校验及 64 MiB 上限；通用 `file` 资源不能直接传给 `sendAudio()`，应以 `kind: 'audio'` 下载或导入后再发送为语音。

## PDF 文件与媒体元数据

`context.chat.sendDocument({url, requestId, caption?})` 或 `{resourceId, requestId, caption?}` 发送 PDF 文档。文档类型为 `document`，最多 64 MiB，宿主检查 `%PDF-` 文件头；扩展名或服务器 Content-Type 不能替代内容检查。发送需要 `chat.send`，远程下载还需要 `network`、`media.download`。

`context.media.download({url, kind: 'document'})` 创建会话资源；`context.media.inspect(resourceId)` 返回该资源的 `resourceId/kind/size/extension`，不返回本地路径。资源只在当前上下文有效，用完可 `release(resourceId)`，处理结束后宿主清理。

## 错误与诊断

宿主 API 拒绝时抛出的 JavaScript Error 提供 `code`、`message`、`retryable`。

| code | 含义 |
| --- | --- |
| `CANCELLED` | 已取消 |
| `TIMEOUT` | 超过宿主截止时间 |
| `INVALID_ARGUMENT` | 参数格式或类型无效 |
| `NETWORK` | 系统套接字或 HTTP I/O 异常 |
| `INVALID_STATE` | 当前权限、资源或生命周期状态不允许操作 |
| `HOST_ERROR` | 其它宿主错误或旧宿主未提供分类 |

`retryable` 只对 TIMEOUT 和 NETWORK 为 true，表示可以考虑重试，不保证重试安全。执行外部副作用时仍需幂等设计。不要根据中文 message 做业务分支。

`tide.diagnostics.getStatus()` 返回当前插件的 ID、版本、API 版本、运行状态、活动上下文数量和最后一个宿主记录错误；`package` 包含宿主记录的本地来源与已安装包 SHA-256。SHA-256 标识包内容，作者名称仅用于展示，不构成身份认证。运行日志通过 `tide.log()` 写入应用日志，不包含其它插件的私有存储。

`context.tasks.list()` 返回当前机器人最近 100 个任务的 `id/due_at/state/attempts/error`。需要 `tasks` 权限。备份恢复会停用插件，并取消备份中的等待和运行任务，避免恢复旧租约后重复产生副作用；重新检查配置并启用插件后再安排新任务。

媒体下载和直接 URL 发送支持 `headers` 与 `timeoutMs`，详见[开发指南](PLUGIN_DEVELOPMENT.md#下载请求头与动态-cdn)。普通请求及可取消传输均支持 GET、HEAD、OPTIONS、POST、PUT、PATCH、DELETE。

## 私有文件和媒体处理

`tide.files` 提供持久文件读写；`tide.network.downloadFile/uploadFile` 提供不经过 JavaScript 大字节串的流式传输；`context.media.process` 提供音视频合并、HLS 点播封装与转码；`context.media.fromFile/saveFile` 在私有文件与会话资源之间转换。参数、权限、配额与完整示例见[文件与媒体处理](FILES_AND_MEDIA.md)。
