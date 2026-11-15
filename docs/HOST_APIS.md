# 通知、网络传输与诊断

## 通知

清单声明 `notifications` 权限后，在工具或消息、任务事件中调用：

```javascript
await context.notifications.show({title: '提醒', body: '任务已完成'});
```

需要有效的机器人上下文，标题最多 120 字符，正文最多 2000 字符。通知显示插件名称，点击进入所属机器人。相同插件与机器人十秒内最多发送一次，后续通知替换先前通知。系统通知权限和系统渠道设置决定是否实际显示；接口不主动弹出系统授权对话框。限频为运行引擎内限制。

## 可取消网络传输

原有 `tide.request()` 继续可用。需要取消、进度或 multipart 上传时使用 `tide.network`，清单声明 `network` 权限、精确 HTTPS `networkOrigins`，以及 `network.transfer` 能力依赖。

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

## PDF 文件与媒体元数据

`context.chat.sendDocument({url, requestId, caption?})` 或 `{resourceId, requestId, caption?}` 发送 PDF 文档。文档类型为 `document`，最多 20 MiB，宿主检查 `%PDF-` 文件头；扩展名或服务器 Content-Type 不能替代内容检查。发送需要 `chat.send`，远程下载还需要 `network`、`media.download`。

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
