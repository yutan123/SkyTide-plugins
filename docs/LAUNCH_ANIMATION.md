# 启动动画插件

SkyTide 通过插件的 `manifest.json` 声明 Flutter 应用内启动动画。它不修改系统开屏或应用图标。安装 ZIP 后，在插件管理中启用，再完全关闭并重新打开应用；只从后台返回不算新的启动。

## 示例与打包

仓库提供可直接打包的[启动动画示例](../examples/launch_animation/)，仅包含清单和素材。在仓库根目录运行：

```sh
python3 tools/pack_plugin.py examples/launch_animation --out launch_animation.zip
```

手动打包时，将 `manifest.json` 和它引用的 `media/intro.gif` 放入同一个 ZIP，清单位于 ZIP 根目录：

```json
{
  "id": "skytide.example.launch",
  "name": "月光开场",
  "version": "1.0.0",
  "description": "以月光与涟漪演示应用内启动动画。",
  "requiredCapabilities": [
    "appearance.launchAnimation"
  ],
  "appearance": {
    "launchAnimation": {
      "asset": "media/intro.gif",
      "frequency": "everyLaunch",
      "fit": "cover"
    }
  }
}
```

仅提供动画时，省略 `entry`。除 `appearance` 外，仅可声明 `id`、`name`、`version`、`description`、`author`、`icon`、`apiVersion` 和 `requiredCapabilities`，不使用权限、工具、事件或配置文件。`icon` 仍是插件卡片图标，不是动画素材。已有脚本插件可以保留原入口并追加 `appearance`。建议声明 `appearance.launchAnimation` 能力，让不支持此接口的宿主拒绝安装。

## `appearance.launchAnimation`

| 字段 | 类型 | 默认值 | 规则 |
| --- | --- | --- | --- |
| `asset` | 字符串 | 必填 | ZIP 内相对路径，使用 `/`，不接受 URL 或 `..` 路径。 |
| `frequency` | 字符串 | `daily` | `everyLaunch` 每次重新启动，`daily` 每个当地日历日一次，`oncePerVersion` 同一插件版本一次，`interval` 距上次播放至少指定分钟数。 |
| `intervalMinutes` | 整数 | — | 仅 `interval` 使用且必填，范围 `1–525600`。 |
| `weekdays` | 整数数组 | 不限 | 不重复的星期编号，`1` 为周一，`7` 为周日。 |
| `timeWindow` | 对象 | 不限 | 本地时间 `HH:mm`，包含 `start`、不含 `end`；两者不能相同。跨午夜时，凌晨部分按窗口开始的那一天匹配 `weekdays`。 |
| `theme` | 字符串 | `any` | `any`、`light`、`dark`，匹配启动时应用主题。 |
| `fit` | 字符串 | `cover` | `cover` 填满并适当裁切；`contain` 显示完整画面，空白处填黑。 |

星期、时间、主题和频率须同时匹配。首次显示画面后记录播放；显示后点按跳过也算一次，未开始播放不计次。

## 素材规格

- **MP4、WebM**：每个文件不超过 64 MiB。优先使用 **MP4 / H.264**；WebM 建议 VP8 或 VP9，实际解码能力取决于设备。
- **动态 GIF、动态 WebP**：每个文件不超过 16 MiB，必须含多个帧。宿主只播放一轮，忽略素材自带的循环设置。
- 宽高各不超过 4096 像素，总像素不超过 8,294,400。建议竖屏 `720 × 1280`，视频 30 fps，**建议 5 秒以内，不设固定时长上限**。
- 只播放本地包内素材，静音、单次播放，可点按跳过。不执行启动脚本，不读取远程素材。

## 启用和回退

多个插件提供动画时，最近启用的插件优先。停用或卸载后，下次启动选择其余已启用插件中的下一项；没有已启用的动画插件时才使用内置动画。如果当前插件的规则未命中、系统开启了减少动态效果、素材损坏或播放初始化超时，本次直接进入应用，不改播其他插件动画或内置动画。首次使用时仍需完成协议确认。
