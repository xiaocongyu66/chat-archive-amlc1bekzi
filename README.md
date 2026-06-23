# 总部 聊天归档资源

生成时间：2026-06-22T12:59:58.255Z

## 目录结构

- `archive.json`：聊天归档 JSON，页面渲染使用这个数据。
- `room.json`：群聊房间原始信息。
- `users.json`：用户列表，每个用户包含稳定 `uuid`、用户名和头像路径。
- `users-by-uuid.json`：以用户 `uuid` 为 key 的用户索引。
- `index.html`：GitHub Pages 静态入口，上传整个资源包目录后直接打开这个页面即可查看聊天记录。
- `viewer.js` / `viewer.css`：静态查看器资源，只使用相对路径读取本目录数据。
- `.nojekyll`：让 GitHub Pages 原样发布资源目录。
- `days.json`：按日期拆分的索引，静态页面用它懒加载每天的聊天记录。
- `api-messages.json`：API 返回的原始聊天消息数组，不包含截图补录。
- `messages.json`：本地完整聊天记录数组，已按时间合并 API 消息和 `manual-messages.json` 截图补录；网页看到的聊天记录以这个语义为准。
- `manual-messages.json`：人工补录消息数组，当前用于保存截图 OCR 证据。它们会在页面中和 API 消息合并显示，但不会覆盖原始 API 消息。
- `timeline.json`：合并后的轻量时间线，适合检索、校对时间和生成文档。
- `manifest.json`：资源清单，包含原始 URL、本地相对路径、资源类型和关联消息 ID。
- `README.md`：当前说明文档。
- `profile/avatars/`：用户头像资源。
- `evidence/images/`：从证据图片目录导入的截图原图，文件名带内容 hash，便于去重和长期引用。
- `evidence/screenshot-summary.json`：最近一次证据图片扫描摘要，包含来源目录、筛选规则、OCR 状态和置信度统计。
- `evidence/YYYY-MM-DD.json`：按补录消息时间拆分的截图证据消息。
- `YYYY-MM-DD/images/`：当天消息图片原图。
- `YYYY-MM-DD/thumbnails/`：当天消息图片缩略图。
- `YYYY-MM-DD/api-messages.json`：当天 API 原始消息。
- `YYYY-MM-DD/messages.txt`：当天合并后的纯文本聊天记录，方便快速检索或二次处理。
- `YYYY-MM-DD/messages.json`：当天合并后的结构化聊天记录。
- `YYYY-MM-DD/timeline.json`：当天合并后的轻量时间线。

## 数据引用

消息使用 `userUuid` 引用用户资料，用户资料统一从 `users-by-uuid.json` 或 `archive.json.usersByUuid` 读取。
同一个站点内同一个用户的 `uuid` 由账号身份稳定生成，多次导出保持一致。
每条消息都保存了 ISO 时间 `createdAt`、毫秒时间戳 `timestampMs`、日期 `date`、时间 `time` 和递增序号 `sequence`。
截图补录消息保存于 `manualMessages`，其中 `evidence.timeSource` 说明排序时间来源；只有 `ocr` 或 `ocr-partial` 表示来自图片画面识别。
`evidence.filePath` 是导入后的本地资源相对路径，`evidence.sourceRelativePath` 是它在本次证据目录中的原始相对路径；两者都不会覆盖 API 原始消息。
需要追加被删除聊天的截图时，在页面里填写“证据图片目录”并开始读取，程序会递归扫描该目录下的图片、导入到 `evidence/images/`，再生成 `manualMessages`。

## GitHub Pages 静态展示

把当前资源包目录的全部文件上传到 GitHub 仓库，并开启 GitHub Pages 指向该目录所在分支即可。页面入口是 `index.html`。
静态页面只按相对路径读取 `manifest.json`、`days.json`、`users-by-uuid.json` 和每天目录下的 `messages.json`，不需要运行本项目后端。
图片和头像路径会自动从本地 Web 前缀转换成相对路径，所以必须连同 `profile/`、日期目录、`evidence/` 等资源文件夹一起上传。

## Web 引用

本地控制台启动后，资源的公开前缀是：

```text
/archive-media/amlc1bekzi
```

归档 JSON 中的 `avatarLocalUrl`、`localUrl`、`thumbnailLocalUrl` 已经写成可直接给 HTML `img src` 使用的路径，例如：

```html
<img src="/archive-media/amlc1bekzi/2026-06-19/images/example.webp" alt="">
```

如果把导出的静态 HTML 单独发送给别人，本地媒体模式需要同时保留这个资源目录并通过本项目 Web 服务访问。想生成单文件 HTML 时请选择“内联到 HTML”模式。

## 当前归档

- 房间 ID：amlc1bekzi
- API 消息数：73429
- 截图补录数：0
- 本地完整聊天记录数：73429
- 用户数：2092
- 日期分布：2026-06-12, 2026-06-13, 2026-06-14, 2026-06-15, 2026-06-16, 2026-06-17, 2026-06-18, 2026-06-19, 2026-06-20, 2026-06-21, 2026-06-22
- API 是否已无更早返回：是
