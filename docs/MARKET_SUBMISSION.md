# 插件仓库与市场提交指南

开发者在自己的公开 GitHub 仓库维护插件，通过 [TideBot-plugins Issues](https://github.com/yutan123/TideBot-plugins/issues/new) 申请收录或更新。市场维护者逐版本审核，将批准版本加入索引。APP 从审核通过的完整提交下载 GitHub 自动生成的 ZIP；不需要发布 Release 附件。

## 仓库结构

一个仓库对应一个插件，运行文件直接放在仓库根目录：

```text
tidebot_meme_search/
├── manifest.json       必需：运行清单
├── main.js             必需：manifest.entry 指定的实际入口，可改名
├── README.md           必需：用途、配置、权限、使用方法
├── LICENSE             可选：代码使用许可
├── market.json         市场申请必需：不含 commit 的市场信息
├── config.schema.json  可选：独立配置 Schema
├── icon.png            可选：清单引用的图标
├── ui.json             可选：声明式界面
└── lib/                可选：包内模块及资源
```

入口及其依赖必须提交完整；TypeScript 和 npm 依赖应先编译或打包，并将可运行产物提交到同一个审核提交。APP 不会执行 npm install 或构建脚本。不要上传密钥、用户数据、node_modules、缓存或生成的安装包。模块、资源和界面的声明方式见[开发指南](PLUGIN_DEVELOPMENT.md)。

最小运行清单示例：

```json
{
  "apiVersion": 1,
  "id": "tidebot_meme_search",
  "name": "表情包搜索",
  "author": "你的名字",
  "description": "搜索表情包。",
  "version": "1.0.0",
  "entry": "main.js",
  "permissions": [],
  "tools": []
}
```

最小 `main.js`：

```js
// 在这里同步注册 manifest 声明的工具和事件。
// 异步初始化放在 activate 生命周期中。
```

这个最小入口只用于展示目录结构；实际功能和工具注册见开发指南及 examples。

## 插件 ID 和版本

ID 必须以 `tidebot` 开头，不区分大小写；总长度 6～64，只允许英文字母、数字、`.`、`_`、`-`。例如 `tidebot_meme_search`、`tidebot.meme.search`、`tidebot.meme_search`、`TideBot_Meme_Search`。不得使用斜杠、空格或中文。建议统一小写并采用独有名称，避免与其他插件冲突。

发布后不要改变 ID，包括大小写。前缀的大小写兼容不代表不同拼写会自动合并成同一个插件。旧 ID 改为新 ID 会被视为另一个插件，配置和私有数据不会自动迁移。新安装与更新包都需要符合前缀规则。

市场版本使用 `主版本.次版本.修订版本`，例如 `1.0.0`，每次申请更新必须递增。当前市场不接受预发布后缀或构建元数据。manifest 与申请信息的 ID、版本必须完全一致，名称、作者和简介也应保持一致。

## 上传到 GitHub

1. 登录 GitHub，选择 **New repository**，输入仓库名，例如 `tidebot_meme_search`，可见性选择 **Public**，创建仓库。
2. 在仓库页面选择 **Add file → Upload files**；空仓库可选择 **uploading an existing file**。
3. 上传插件目录里面的文件，确保仓库首页直接能看到 `manifest.json` 和入口文件，不要再套一层插件文件夹。保留模块和资源自身的相对目录结构。
4. 填写提交说明，选择 **Commit changes**。以后修改文件也需要提交。
5. 打开仓库最新提交记录，进入本次准备审核的提交，复制完整的 40 位 commit SHA。不要使用短哈希、分支名或标签代替。

也可在本地完成提交后运行 `git rev-parse HEAD` 获取完整哈希，并推送该提交到公开仓库。审核所指提交必须可以公开访问，且包含全部运行文件。

## 申请信息格式

将以下 JSON 完整填写到申请 Issue。其字段与市场 `plugins` 数组中的单个条目一致，维护者可以直接复制。`repository` 填仓库首页 HTTPS 地址，不带 `.git`、末尾斜杠或 `/tree/...`。

```json
{
  "id": "tidebot_meme_search",
  "name": "表情包搜索",
  "author": "你的名字",
  "description": "搜索并发送表情包。",
  "repository": "https://github.com/your-name/tidebot_meme_search",
  "version": "1.0.0",
  "commit": "0123456789abcdef0123456789abcdef01234567",
  "changelog": "首次发布。"
}
```

示例仓库和哈希均为占位，提交前替换为真实值。`changelog` 是可选字段，更新申请建议填写。

**提交哈希不能写入它自身对应的提交内容中。** 修改文件会产生新的提交哈希。因此，完整的审核 JSON 以 Issue 正文为准，待代码提交后再填写 `commit`。仓库中的 `market.json` 应保存相同字段但省略 `commit`，方便复制后补充；不要求为了保存新哈希反复提交。`manifest.json` 负责运行声明，审核条目负责锁定分发版本，两者不能互相替代。

## 提交市场审核

1. 打开 [新建 Issue](https://github.com/yutan123/TideBot-plugins/issues/new)。
2. 标题填写 `[插件收录] tidebot_meme_search 1.0.0`；申请新版本时填写 `[插件更新] tidebot_meme_search 1.0.1`。
3. 正文粘贴填好的完整 JSON，并附上功能说明、配置方法、所需权限与网络域名、测试步骤和结果。涉及外部服务时说明账号或费用要求，不要公开真实密钥。
4. 选择 **Submit new issue**。按审核反馈修改代码后，在原 Issue 中提供新的完整提交哈希及对应版本，避免让审核者猜测审核目标。

不要将插件源码上传到市场索引仓库的 Issue 附件中代替公开仓库，也不需要将个人插件源码合并到市场仓库。每个更新版本都需要重新提交审核；作者仓库新增提交不会自动进入 APP。批准后维护者更新市场索引，APP 刷新索引后提供下载或更新入口，用户手动确认更新。

## 安装包检查

使用本仓库打包工具检查你的插件目录：

```sh
python3 tools/pack_plugin.py /path/to/your/plugin --check
python3 tools/pack_plugin.py /path/to/your/plugin --out /path/to/output/plugin.zip
```

本地手动导入的 ZIP 文件需要将 `manifest.json` 放在压缩包根目录。市场安装会自动剥离 GitHub ZIP 的一层仓库包装目录，但该目录下面必须直接存在清单。GitHub 网页的 **Download ZIP** 通常带包装目录，不应直接当成手动导入包。

提交审核前，在 APP 中导入打包结果，检查配置、启用、功能调用、停用及更新后的数据保留。只申请实际需要的权限和网络域名。不得隐藏远程下载执行代码、窃取数据或绕过宿主限制；审核批准的是具体提交，不是该仓库未来所有代码。
