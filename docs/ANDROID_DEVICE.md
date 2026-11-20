# Android 系统权限与悬浮窗

在 `manifest.json` 的 `systemPermissions` 数组中声明用到的权限。它与 `permissions` 分开，安装或启用插件不会自动授权。用户在插件卡片中保存开关；悬浮窗、位置、麦克风还需要 SkyTide 获得相应的 Android 授权。

| 声明 | SDK | 行为 |
| --- | --- | --- |
| `overlay` | `ui.overlay.show(options)` | 在插件界面操作中打开跨应用窗口，需要 Android 8.0+。 |
| `location` | `tide.device.getLocation()` | 前台读取系统最后一次已知位置。可能为 `null` 或不是当前坐标；`timestamp` 为 Unix 毫秒。 |
| `motion` | `tide.device.getMotion()` | 前台采样约 200 毫秒；`screenRotation` 为屏幕旋转角度，其他字段视设备传感器而定。 |
| `microphone` | `ui.device.recordAudio(durationMs)` | 在插件界面操作中录制 0.5–10 秒的 AAC/M4A。返回 `mimeType` 和 `base64`；切出 SkyTide 前台会取消录音。 |
| `photos` | `ui.device.pickPhoto(options?)` | 在插件界面操作中启动系统图片选择器，只返回用户选中的文件。 |
| `videos` | `ui.device.pickVideo(options?)` | 同上，但选择视频。 |

`tide.device.hasPermission(key)` 检查插件授权及对应 Android 授权，不检查当前传感器、定位服务或选择器是否可用。选择器取消时返回 `null`。不指定 `path` 时，所选文件最多 700 KiB，返回 `{name, mimeType, base64}`；指定 `path` 时需要普通 `files` 权限，结果为 `{name, mimeType, path, size}`。`mimeType` 可能为 `null`。

## 打开窗口

```js
tide.on('ui.action', async ({action}, ui) => {
  if (action !== 'openPet') return;
  await ui.overlay.show({
    entry: 'pet.html', assetPaths: ['pet.svg'],
    width: 112, height: 112, compact: true,
  });
});
```

`show` 接受 `entry`（插件包内的 HTML 路径）或 `html`（内联 HTML），两者选一，最大 512 KiB。HTML 可内联 CSS 和 JavaScript，内容背景可透明。`width` 和 `height` 按 dp 传入，由宿主按屏幕范围限制；`compact: true` 将宿主标题栏缩成拖动与关闭控件。这两个控件由宿主保留。窗口不抢占输入焦点，透明区域不等同于触摸穿透。

`assetPaths` 为相对于插件包根目录的文件列表，上限 24 个，总大小不超过 512 KiB。支持 PNG、JPEG、WebP、GIF、SVG、WOFF2、MP3 和 OGG。页面通过 `TideOverlay.asset('pet.svg')` 获取对应的数据 URL；未列出的路径返回 `null`。WebView 不直接读取包目录、任意系统文件或网络地址，HTML 中的相对资源路径不会自动解析。

## 传递消息

- 网页调用 `TideOverlay.postMessage(value)` 向插件发送 JSON；插件通过 `tide.on('overlay.message', ({data}) => { ... })` 接收，无需在 `hooks` 声明。一次最多 32 KiB；上一条还在处理或发送间隔低于 100 毫秒时，新消息可能被丢弃。不适合连续传输动画帧。
- 插件调用 `tide.overlay.update(value)` 向网页推送 JSON；网页监听 `tideoverlayupdate` 并读取 `event.detail`。一次最多 32 KiB；初始文档未加载完成时只保留最近一次更新。
- `tide.overlay.close()` 关闭此插件自己的悬浮窗。完成 `ui.action` 后不能继续用该次操作的 `ui.overlay.show`、选图或录音。

同一时间只允许一个插件持有悬浮窗。同一插件重新打开会替换旧窗口。切到其他应用后，窗口可以在 SkyTide Activity 和进程仍存活时继续显示，Android 或前台应用可能限制叠加显示。停用、更新、卸载、撤销权限或 SkyTide Activity 销毁会关闭旧窗口；不会在进程重启后自动恢复。

完整实现见 [桌宠示例](../examples/desktop_pet/)。