# 私有文件与媒体处理

## 权限与能力

以下字段合并到完整 manifest 中使用，只声明插件需要的权限与能力：

```json
{
  "permissions": ["files", "network", "media.download", "media.process", "chat.send"],
  "requiredCapabilities": ["files", "network.files", "media.process"],
  "networkOrigins": ["https://api.example.com", "https://*.example.com"]
}
```

| 接口 | 权限 | 能力 |
| --- | --- | --- |
| `tide.files.*` | `files` | `files` |
| `tide.network.downloadFile/uploadFile/cancelFile/fileProgress` | `files`、`network` | `network.files` |
| `context.media.fromFile/saveFile` | `files`、`media.download` | `files` |
| `context.media.process` | `media.download`、`media.process`；HLS 另需 `network` | `media.process` |

私有文件按插件 ID 隔离，与只读安装包分开。路径使用私有目录内的相对路径，拒绝绝对路径、空片段、`.`、`..`、反斜杠、冒号、符号链接及宿主保留的 `.pending-` 前缀。API 不返回宿主绝对路径。插件更新保留私有文件，卸载清除私有文件。

## 文件 API

| 调用 | 参数 | 返回 |
| --- | --- | --- |
| `tide.files.write(options)` | `{path, data, encoding?: 'utf8'\|'base64', append?: boolean}` | `{path, size}`，size 为写入后文件字节数 |
| `tide.files.read(options)` | `{path, offset?: number, length?: number, encoding?: 'utf8'\|'base64'}` | `{data, size, eof}`，size 为本次返回字节数 |
| `tide.files.stat(path)` | 文件路径 | `{path, size, modifiedAt}` 或不存在时 `null` |
| `tide.files.list(directory?)` | 可省略的子目录路径 | `{path, type: 'file'\|'directory', size}[]` |
| `tide.files.delete(path)` | 文件路径 | 是否删除成功；不存在返回 `false` |

单文件最多 256 MiB，每插件文件总量最多 512 MiB，目录最多返回 1000 项。write 自动创建父目录，默认覆盖，`append: true` 追加；读写通过插件共享存储锁串行化，写入失败不会用不完整内容替换原文件。

单次读写最多 384 KiB 原始字节。read 的 offset/length 以字节计数，默认 offset 为 0、length 为 393216、encoding 为 utf8。对二进制和 UTF-8 跨字符分块使用 base64；utf8 解码遇到截断字符会失败。大文件网络传输使用流式接口，避免通过 RPC 逐块追加造成重复复制。

```javascript
await tide.files.write({path: 'cache/state.json', data: JSON.stringify({page: 2})});
const saved = await tide.files.read({path: 'cache/state.json'});
const state = JSON.parse(saved.data);
const metadata = await tide.files.stat('cache/state.json');
```

文件权限允许保存插件自己的业务数据，不能用于读取其他插件或宿主文件。需要保密的小型状态可使用 `tide.storage`，其 JSON 总量为 8 MiB；私有文件自身不额外加密。

## 流式下载与上传

```javascript
await tide.network.downloadFile({
  requestId: 'download-video',
  url: 'https://api.example.com/video',
  path: 'downloads/video.mp4',
  headers: {Referer: 'https://api.example.com'},
  timeoutMs: 300000
});
const progress = await tide.network.fileProgress('download-video');
const response = await tide.network.uploadFile({
  requestId: 'upload-video',
  url: 'https://api.example.com/upload',
  path: 'downloads/video.mp4',
  method: 'PUT',
  headers: {'Content-Type': 'video/mp4'}
});
```

- 公共参数为 `{requestId, url, path, headers?, timeoutMs?}`。同一插件内活动 requestId 必须唯一，最长 128 字符；最多同时传输 8 个文件。timeoutMs 为 1～330000 毫秒，默认 330000。
- 下载执行 GET，接收 HTTP 200 后流式写入私有文件，返回 `{path, size, status, headers}`。最多跟随三次重定向，每跳执行 HTTPS 和 networkOrigins 授权检查。跨 origin 跳转删除 Authorization、Cookie、Proxy-Authorization、Host。
- 上传方法为 PUT（默认）、POST 或 PATCH，请求体是文件原始字节，不自动封装 multipart。需要 multipart 的服务可由插件准备完整请求文件并指定 Content-Type。上传不自动重定向，返回 `{status, headers, bodyBase64}`，响应体最多 512 KiB；HTTP 状态由插件判断。
- `fileProgress(requestId)` 返回 `{requestId, bytes, state}` 或 `null`。bytes 是下载接收或上传读取的正文累计字节，state 为 running/completed/failed/timeout/cancelled；最近保留最多 128 条记录，不是跨重启持久状态。
- `cancelFile(requestId)` 返回是否取消活动请求。插件停用、更新和退出也会关闭请求。下载失败或取消不会替换目标文件；上传已经抵达服务端的字节无法回滚。

## 媒体合并、封装与转码

这些 API 仅在工具调用或有会话上下文的事件处理期间可用；全局 `tide.media.process(context, options)` 等价于对应 context 方法。

```javascript
const video = await context.media.fromFile({path: 'downloads/video.mp4', kind: 'video'});
const audio = await context.media.download({
  url: 'https://api.example.com/audio.m4a', kind: 'audio'
});
const merged = await context.media.process({
  operation: 'merge', videoResourceId: video.resourceId,
  audioResourceId: audio.resourceId, format: 'mp4'
});
await context.media.saveFile({resourceId: merged.resourceId, path: 'results/merged.mp4'});
await context.chat.sendVideo({resourceId: merged.resourceId, requestId: 'send-merged'});
```

| operation | 参数 | 行为 |
| --- | --- | --- |
| `merge` | `videoResourceId`、`audioResourceId`、`format?: 'mp4'` | 选取第一个输入的视频轨和第二个输入的音轨，复制编码并封装 MP4 |
| `transcode` | `resourceId`、`format?: 'mp4'\|'webm'\|'mp3'\|'m4a'\|'wav'` | 转码；默认 MP4，音频格式只输出音频 |
| `hls` | `url`、`headers?`、`format?: 'mp4'\|'m4a'` | 下载 HLS 点播清单及分片后复制编码封装，默认 MP4；M4A 仅保留音频 |

返回 `{resourceId, kind, size, extension}`。资源仅在当前上下文有效，同时最多保留 4 个，可 `context.media.release(resourceId)` 提前释放。`fromFile` 复制私有文件创建资源，`saveFile({resourceId, path})` 持久保存资源并返回 `{path, size}`；资源释放和调用结束不影响已保存文件或已发送消息。

转码使用宿主现有 FFmpeg：MP4 为 MPEG-4 视频与 AAC 音频，WebM 为 VP8/Vorbis，MP3 为 MP3 编码，M4A 为 AAC，WAV 为 PCM。输入解码器或输出编码器不可用、编码与容器不兼容时返回错误。合并复制编码，不自动转码不兼容的音轨或视频轨。

HLS 支持结束的点播清单、主清单第一个变体、外部音轨、初始化分片和 AES-128 key；所有远程资源均先通过宿主下载并本地化，FFmpeg 只读取本地文件。相对 URI 依据重定向后的清单地址解析；跨 origin 子资源不继承敏感凭证。清单最多 1 MiB、8 层、2048 个资源，总下载量最多 256 MiB。直播清单及不支持的加密方式会报错。

原生媒体处理最多执行五分钟，调用失效会取消处理。输出继续遵守媒体配额：视频 256 MiB、音频 64 MiB；达到处理输出上限时报错，不将截断输出作为正常结果发送。插件只提供操作和资源引用，不提供宿主路径或任意 FFmpeg 命令行。
