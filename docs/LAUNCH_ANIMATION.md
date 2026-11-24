# 启动动画插件

SkyTide 通过插件的 `manifest.json` 声明 Flutter 应用内启动动画，支持播放包内媒体，或用 JavaScript 实时绘制。它不修改系统开屏或应用图标。安装 ZIP 后，在插件管理中启用，再完全关闭并重新打开应用；只从后台返回不算新的启动。

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

两种模式均支持频率、星期、时间窗口和主题配置。下表的 `asset` 与 `fit` 仅用于媒体模式。

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
- 只播放本地包内素材，静音、单次播放，可点按跳过。媒体模式不会执行脚本。

## JavaScript 实时绘制

[JavaScript 启动动画示例](../examples/launch_script/)包含独立的 `launch.js` 和一张透明 PNG。脚本用三角函数计算轨迹，实时绘制粒子、光晕、涟漪和贴图。从插件仓库根目录打包：

```sh
python3 tools/pack_plugin.py examples/launch_script --out launch_script.zip
```

在 `manifest.json` 中声明以下字段。`script` 与媒体模式的 `asset`、`fit` 互斥；频率、星期、时间和主题规则相同。

```json
{
  "id": "skytide.example.launchscript",
  "name": "JavaScript 启动动画示例",
  "version": "1.0.0",
  "requiredCapabilities": ["appearance.launchAnimation.script"],
  "appearance": {
    "launchAnimation": {
      "script": "launch.js",
      "durationMs": 3100,
      "images": {"star": "media/star.png"},
      "frequency": "everyLaunch"
    }
  }
}
```

- `script`：ZIP 内 UTF-8 JS bundle，不超过 128 KiB。纯动画包不需要根级 `entry`；同时提供普通插件功能时，`entry` 与动画脚本各自运行，不共享变量或权限。旧宿主不支持脚本能力时会拒绝安装。
- `durationMs`：整数，250–10000。首帧就绪后开始计时，播放一轮。
- `images`：可选对象，最多 16 个贴图，键为 1–40 位英文字母、数字、`_` 或 `-`，值为 ZIP 内相对路径。支持静态 PNG、JPEG 和 WebP；每项不超过 4 MiB，合计不超过 16 MiB。单边不超过 2048 像素，解码合计不超过 8,294,400 像素。

脚本定义同步的 `draw(frame)`。每一帧返回按先后顺序绘制的指令数组。可以使用变量、循环、数学函数和自定义缓动；没有 DOM、网络、文件读取或普通插件 SDK。每次播放启用新的脚本环境。例：

```js
function draw({width, height, progress, dark, images}) {
  const w = Math.min(width, height) * 0.18;
  const h = w * images.star.height / images.star.width;
  const x = width * (0.2 + 0.6 * progress);
  return [
    ['clear', dark ? 0xff101a33 : 0xffdbeaff],
    ['image', 'star', x - w / 2, height / 2 - h / 2, w, h, 1, progress * Math.PI],
  ];
}
```

`frame` 包含 `width`、`height`（画布逻辑像素）、`timeMs`（自开播经过的毫秒）、`durationMs`、`progress`（从 0 到接近 1）、`dark`（是否深色主题）和 `images`（各贴图的原始 `{width, height}`）。宿主最多约每 33 ms 请求一帧；用 `timeMs` 或 `progress` 驱动动画，而不是按调用次数推进。

| 指令 | 参数及用途 |
| --- | --- |
| `clear` | `color`：以指定颜色重置画布。 |
| `rect` | `x, y, width, height, color`：实心矩形。 |
| `circle` | `cx, cy, radius, color`：实心圆。 |
| `ring` | `cx, cy, radius, color, strokeWidth`：圆环。 |
| `line` | `x1, y1, x2, y2, color, strokeWidth`：线段。 |
| `path` | `segments, color, strokeWidth`：传 `null` 填充路径，否则描边。最多 128 段，支持 `['M', x, y]`、`['L', x, y]`、`['Q', cx, cy, x, y]`、`['C', c1x, c1y, c2x, c2y, x, y]` 和 `['Z']`。 |
| `linear` | `x1, y1, x2, y2, startColor, endColor`：铺满画布的双色线性渐变。 |
| `glow` | `cx, cy, radius, centerColor, edgeColor`：圆形径向渐变，半径至少 0.01。 |
| `image` | `id, x, y, width, height, opacity, radians`：按目标尺寸绘制贴图，绕中心旋转；透明度为 0–1。 |

颜色用无符号 `0xAARRGGBB`，坐标是左上角原点、向右和向下为正；绘制范围裁剪到画布，底色为黑色。坐标和尺寸的绝对值不超过 32768，线宽为 0–512，旋转为 −1000 到 1000 弧度。每帧最多 256 条指令、序列化后不超过 65536 字符。无效指令、脚本异常或帧超时会停止本次动画。

## 启用和回退

多个插件提供动画时，最近启用的插件优先。停用或卸载后，下次启动选择其余已启用插件中的下一项；没有已启用的动画插件时才使用内置动画。如果当前插件的规则未命中、系统开启了减少动态效果、素材损坏或播放初始化超时，本次直接进入应用，不改播其他插件动画或内置动画。首次使用时仍需完成协议确认。
