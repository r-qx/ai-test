# MiniMax MCP 语音克隆示例

这是一个结合MiniMax MCP与豆包AI的语音克隆示例应用，可以实现：

1. 录制用户语音并进行声音克隆
2. 使用克隆的声音播报豆包AI返回的内容
3. 通过语音或文字与豆包AI进行交互

## 功能特点

- 语音录制与播放
- 语音克隆技术集成
- 与豆包AI的文本交互
- 语音识别与语音合成

## 安装与运行

### 1. 安装依赖

```bash
npm install
```

### 2. 运行服务器

```bash
npm start
```

或者开发模式：

```bash
npm run dev
```

### 3. 访问应用

打开浏览器访问：http://localhost:3000

## 使用说明

1. 在主页中点击"进入语音克隆页面"
2. 按照界面提示，录制一段15-30秒的清晰语音
3. 等待系统完成语音克隆
4. 在聊天界面中通过文字或语音与AI交互
5. AI的回复将使用您克隆的声音播放出来

## MCP配置

MCP配置存储在 `~/.cursor/mcp.json` 文件中，包含以下关键配置：

- `MINIMAX_MCP_BASE_PATH`: 输出目录路径
- `MINIMAX_RESOURCE_MODE`: 资源模式(url或local)

## 技术栈

- 前端：HTML5, CSS3, JavaScript
- 后端：Node.js, Express
- 音频处理：Web Audio API
- AI集成：豆包AI, MiniMax MCP

## 注意事项

- 语音克隆功能为模拟演示，实际应用需要接入MiniMax的语音克隆API
- 需要确保浏览器允许麦克风访问权限 