# 界面外观插件

在 `manifest.json` 的 `appearance.interfaceTheme` 中声明全局配色和组件外观。仅提供外观的插件省略 `entry`，无需 JavaScript、网络权限或聊天权限；如需程序逻辑，也可以在脚本插件中追加此声明。声明 `requiredCapabilities: ["appearance.interfaceTheme"]` 可让旧宿主拒绝安装不支持的外观包。

在插件管理中启用后即时应用，无需重启。多个外观插件启用时，不混合样式，使用最近启用的一个；关闭或卸载它后使用上一个仍启用的外观，无其他外观时恢复用户原有主题。外观插件不改写背景图、宿主材质开关或界面布局。

## 示例

```json
{
  "id": "skytide.example.interfacetheme",
  "name": "界面外观示例",
  "version": "1.0.0",
  "requiredCapabilities": ["appearance.interfaceTheme"],
  "appearance": {
    "interfaceTheme": {
      "common": {
        "surfaces": {
          "card.bot": {
            "stroke": "#809585C4",
            "strokeWidth": 1,
            "decorations": [
              {"asset": "decor/star.png", "anchor": "topRight", "offsetX": -10, "offsetY": 8, "width": 24, "height": 24},
              {"asset": "decor/star.png", "anchor": "bottomLeft", "offsetX": 8, "offsetY": -7, "width": 16, "height": 16, "opacity": 0.6}
            ],
            "liquid": {"fill": "#329585C4"}
          }
        }
      },
      "light": {"colors": {"primary": "#695398"}},
      "dark": {"colors": {"primary": "#C0A6F4"}}
    }
  }
}
```

可直接打包[示例目录](../examples/interface_theme/)：

```bash
python3 tools/pack_plugin.py examples/interface_theme --out interface_theme.zip
```

## 配色与样式

`common` 是通用配置，`light` 和 `dark` 是可选的日间和夜间覆盖。每层可包含 `colors` 和 `surfaces`，两个字段都可省略。颜色使用 `#RRGGBB` 或 `#AARRGGBB`（透明度写在前）。`colors` 配置宿主主题色，宿主对未声明的颜色继续使用原有的颜色。

| 用途 | `colors` 键 |
| --- | --- |
| 强调色 | `primary`、`primaryLight` |
| 页面和容器 | `pageBackground`、`backgroundOverlay`、`surface`、`surfaceVariant`、`glass` |
| 文本和图标 | `textStrong`、`textWeak`、`textFaint`、`iconMuted` |
| 线条 | `border`、`divider` |
| 聊天与次级按钮 | `bubbleAi`、`bubbleUser`、`buttonSecondary` |

| `surfaces` 目标 | 作用 |
| --- | --- |
| `card` | 卡片默认样式 |
| `card.glass`、`card.frost` | 通用玻璃和磨砂卡片 |
| `card.bot`、`card.voiceCall` | 机器人卡片、语音通话卡片 |
| `card.link`、`card.code`、`card.video`、`card.post` | 链接预览、代码、本地视频、分享动态卡片 |
| `card.metrics`、`card.chart`、`card.control` | 指标、图表、背景控制卡片 |
| `dialog` | 应用内弹窗的默认外观，不包含设备系统弹窗 |
| `dialog.confirm`、`dialog.notice`、`dialog.choice`、`dialog.form`、`dialog.progress` | 确认、提示、选择、表单、进度弹窗 |
| `dialog.sheet`、`dialog.popover` | 底部弹窗、锚点弹出菜单 |
| `chat.header`、`chat.input` | 聊天室顶部栏、输入区 |

每个目标可声明 `fill`（底色）、`stroke`（描边颜色）、`strokeWidth`（0–8 逻辑像素）及 `decorations`。`normal`、`frosted`、`liquid` 可以分别覆盖这四个字段，它们是样式分支，不是切换材质的选项。液态玻璃颜色作为半透明染色绘制，保留折射；通话卡片保持不透明。

样式按字段合并：先解析类别默认值（如 `card`），再解析具体目标（如 `card.bot`）。每一级先应用 `common`，再应用当前日夜层；同一层先应用基础字段，再应用当前材质分支。`decorations` 是整组替换，不与上层列表累加，空列表可以清除继承来的装饰。

## 装饰定位

- 每个装饰对齐其自身的锚点与组件的同名锚点，再应用 `offsetX` / `offsetY`（向右和向下为正，默认 `0`，范围 −2048～2048 个逻辑像素）。
- 锚点有 `topLeft`、`topCenter`、`topRight`、`centerLeft`、`center`、`centerRight`、`bottomLeft`、`bottomCenter`、`bottomRight`，默认 `center`。
- `width` 和 `height` 必填，范围 1–512 个逻辑像素。图片保持比例。`opacity` 范围 0–1，默认 `1`。
- 按数组顺序叠放，后写的装饰在上方；裁切在组件内，不占布局、不拦截点击。每个样式列表最多 16 项。
- `asset` 使用包内相对路径，只支持 PNG。一个包最多使用 64 张不同的装饰图；每图长宽最多 1024 像素、大小最多 1 MiB，去重后合计不超过 8 MiB。
