# SkyTide 插件

SkyTide 插件以普通 `.zip` 文件分发。脚本插件使用 JavaScript，由应用内置运行时执行；仅提供启动动画的插件只需清单和素材。

- [开发指南与 API](docs/PLUGIN_DEVELOPMENT.md)
- [应用内启动动画接口与示例](docs/LAUNCH_ANIMATION.md)
- [消息事件与持久任务](docs/EVENTS_AND_TASKS.md)
- [常驻任务、AI 与文档数据库](docs/WORKERS_AI_DATABASE.md)
- [私有文件与媒体处理](docs/FILES_AND_MEDIA.md)
- [通知、网络传输与诊断](docs/HOST_APIS.md)
- [SDK 类型与本地测试](docs/SDK_TOOLING.md)
- [插件仓库、GitHub 上传与市场审核申请](docs/MARKET_SUBMISSION.md)
- [示例插件](examples/)

[数据任务示例](examples/data_worker) 展示启用后自主采样、私有数据库持久化和 `/workerstats`、`/workersummary` 命令；AI 仅在请求摘要时调用。常驻任务在宿主引擎存活期间运行，后台执行取决于系统调度。

## 生成插件 ZIP（可选）

`tools/pack_plugin.py` 是一个可选的打包工具，用来把插件目录压缩成可导入的 ZIP 文件。它不是提交市场申请的必填步骤。

在仓库根目录执行下面的命令，将示例插件目录 `examples/meme_search` 打包为 `meme_search.zip`：

```sh
python3 tools/pack_plugin.py examples/meme_search --out meme_search.zip
```

如果要打包自己的插件，将命令中的输入目录和输出文件名替换为实际路径即可：

```sh
python3 tools/pack_plugin.py <插件目录> --out <输出文件.zip>
```

提交市场审核时，开发者只需要提供公开插件仓库地址、审核提交的完整 commit SHA 和市场信息；是否使用这个工具生成 ZIP 不影响审核。

应用宿主与内置运行时由 [SkyTide](https://github.com/yutan123/TideBot) 维护。

- [插件设置表单与动态选择器](docs/CONFIGURATION.md)
- [Android 系统权限与悬浮窗](docs/ANDROID_DEVICE.md)
