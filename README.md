# TideBot 插件

TideBot 插件使用 JavaScript 编写，以 `.tideplugin` ZIP 文件分发。

- [插件仓库、GitHub 上传与市场审核申请](docs/MARKET_SUBMISSION.md)
- [开发指南与 API](docs/PLUGIN_DEVELOPMENT.md)
- [消息事件与持久任务](docs/EVENTS_AND_TASKS.md)
- [通知、网络传输与诊断](docs/HOST_APIS.md)
- [示例插件](examples/)

## 打包

在仓库根目录执行：

```sh
python3 tools/pack_plugin.py examples/meme_search --out meme_search.tideplugin
```

应用宿主与内置运行时由 [TideBot-Dev](https://github.com/yutan123/TideBot-Dev) 维护。
