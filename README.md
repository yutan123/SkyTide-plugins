# TideBot 插件
TideBot 插件使用 JavaScript 编写，以普通 `.zip` 文件分发。
- [插件仓库、GitHub 上传与市场审核申请](docs/MARKET_SUBMISSION.md)
- [开发指南与 API](docs/PLUGIN_DEVELOPMENT.md)
- [消息事件与持久任务](docs/EVENTS_AND_TASKS.md)
- [通知、网络传输与诊断](docs/HOST_APIS.md)
- [示例插件](examples/)
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

应用宿主与内置运行时由 [TideBot](https://github.com/yutan123/TideBot) 维护。
