import express from "express";
import { exec } from "child_process";
import cors from "cors";
import path from "path";
import fs from "fs";
import os from "os";
import { fileURLToPath } from "url";
import OpenAI from "openai";
import FormData from "form-data";

// 获取当前文件的目录路径
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// 初始化豆包AI客户端
const openai = new OpenAI({
  apiKey: "28f0d7a7-6571-4e64-b346-8acfab09e056",
  baseURL: "https://ark.cn-beijing.volces.com/api/v3",
});

// 设置默认的模型ID
const MODEL_ID = "doubao-1-5-pro-32k-250115";

// 中间件
app.use(cors());
app.use(express.json());

// 静态文件托管
app.use(express.static(path.join(__dirname, "public")));

// 保存应用路径配置
const configPath = path.join(__dirname, "appConfig.json");
let appConfig = {};

// 初始化配置文件
if (fs.existsSync(configPath)) {
  try {
    appConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch (err) {
    console.error("读取配置文件失败:", err);
    appConfig = {};
  }
} else {
  // 创建默认配置
  appConfig = {
    apps: {
      // 例如：'微信': '/Applications/WeChat.app'
    },
  };
  fs.writeFileSync(configPath, JSON.stringify(appConfig, null, 2));
}

// 确保public目录存在
const publicDir = path.join(__dirname, "public");
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// =====  ai自起本地应用 =====
// 豆包AI接口
app.post("/doubao", async (req, res) => {
  console.log("收到豆包AI请求:", req.body); // 添加日志
  const { message } = req.body;

  if (!message) {
    return res.status(400).json({ success: false, message: "缺少消息内容" });
  }

  try {
    const completion = await openai.chat.completions.create({
      messages: [
        {
          role: "system",
          content: `你是一个智能助手，可以控制电脑上的应用程序。你可以执行以下操作：
1. 打开应用程序（如：请帮我打开微信）
2. 启动应用程序（如：请帮我启动Chrome）
3. 打开桌面上的应用程序（如：请帮我打开桌面的微信）

已配置的应用程序有：${JSON.stringify(appConfig.apps, null, 2)}

请根据用户请求，返回一个JSON格式的响应，包含以下字段：
- action: 要执行的操作（launch_app）
- app: 要启动的应用程序名称
- path: 应用程序的路径（如果已知）
- message: 要显示给用户的消息`,
        },
        { role: "user", content: message },
      ],
      model: MODEL_ID,
    });

    const response = completion.choices[0]?.message?.content;
    console.log("豆包AI响应:", response); // 添加日志
    let parsedResponse;

    try {
      parsedResponse = JSON.parse(response);
    } catch (err) {
      console.error("解析响应失败:", err); // 添加日志
      return res.json({
        success: false,
        message: "无法解析AI响应",
        error: err.message,
      });
    }

    // 如果AI建议启动应用，则执行启动操作
    if (parsedResponse.action === "launch_app") {
      const appPath = parsedResponse.path || appConfig.apps[parsedResponse.app];

      if (!appPath) {
        return res.json({
          success: false,
          message: `未找到应用程序 ${parsedResponse.app} 的路径`,
        });
      }

      launchApp(appPath, (err, result) => {
        if (err) {
          return res.json({
            success: false,
            message: `无法启动${parsedResponse.app}: ${err.message}`,
          });
        }

        res.json({
          success: true,
          message: parsedResponse.message || `已启动${parsedResponse.app}`,
          action: "launch",
          app: parsedResponse.app,
        });
      });
    } else {
      res.json({
        success: true,
        message: parsedResponse.message || "操作已完成",
        action: parsedResponse.action,
      });
    }
  } catch (error) {
    console.error("豆包AI请求失败:", error);
    res.status(500).json({
      success: false,
      message: "豆包AI请求失败",
      error: error.message,
    });
  }
});
// MCP协议的端点
app.post("/mcp", (req, res) => {
  const { text } = req.body;

  if (!text) {
    return res.status(400).json({ success: false, message: "缺少请求内容" });
  }

  // 简单的意图识别
  if (text.includes("打开") || text.includes("启动")) {
    // 从请求中提取应用名称
    const appNames = Object.keys(appConfig.apps);
    const requestedApp = appNames.find((app) => text.includes(app));

    if (requestedApp && appConfig.apps[requestedApp]) {
      launchApp(appConfig.apps[requestedApp], (err, result) => {
        if (err) {
          return res.json({
            success: false,
            message: `无法启动${requestedApp}: ${err.message}`,
          });
        }
        res.json({
          success: true,
          message: `已启动${requestedApp}`,
          action: "launch",
          app: requestedApp,
        });
      });
    } else {
      // 尝试在桌面上查找应用
      const desktopPath = path.join(os.homedir(), "Desktop");
      let foundPath = null;

      if (text.includes("桌面")) {
        // 从文本中提取应用名称
        const appNameMatch =
          text.match(/打开桌面的(.+)/) || text.match(/启动桌面的(.+)/);
        const searchAppName = appNameMatch ? appNameMatch[1].trim() : "";

        if (searchAppName && fs.existsSync(desktopPath)) {
          try {
            const desktopFiles = fs.readdirSync(desktopPath);
            const possibleApp = desktopFiles.find((file) =>
              file.toLowerCase().includes(searchAppName.toLowerCase())
            );

            if (possibleApp) {
              foundPath = path.join(desktopPath, possibleApp);
              // 将找到的应用保存到配置
              appConfig.apps[searchAppName] = foundPath;
              fs.writeFileSync(configPath, JSON.stringify(appConfig, null, 2));
            }
          } catch (err) {
            console.error("搜索桌面应用时出错:", err);
          }
        }
      }

      if (foundPath) {
        launchApp(foundPath, (err, result) => {
          if (err) {
            return res.json({
              success: false,
              message: `无法启动应用: ${err.message}`,
            });
          }
          res.json({
            success: true,
            message: `已启动找到的应用`,
            action: "launch",
            path: foundPath,
          });
        });
      } else {
        res.json({
          success: false,
          message: "未找到请求的应用，请先配置应用路径",
        });
      }
    }
  } else {
    res.json({
      success: false,
      message: "不支持的操作，目前只支持打开/启动应用",
    });
  }
});

// 管理应用配置的API
app.get("/apps", (req, res) => {
  res.json(appConfig.apps);
});

app.post("/apps", (req, res) => {
  const { name, path } = req.body;

  if (!name || !path) {
    return res
      .status(400)
      .json({ success: false, message: "缺少应用名称或路径" });
  }

  appConfig.apps[name] = path;
  fs.writeFileSync(configPath, JSON.stringify(appConfig, null, 2));

  res.json({ success: true, message: "应用配置已保存" });
});

app.delete("/apps/:name", (req, res) => {
  const { name } = req.params;

  if (appConfig.apps[name]) {
    delete appConfig.apps[name];
    fs.writeFileSync(configPath, JSON.stringify(appConfig, null, 2));
    res.json({ success: true, message: "应用配置已删除" });
  } else {
    res.status(404).json({ success: false, message: "应用配置不存在" });
  }
});

// 启动应用的函数
function launchApp(appPath, callback) {
  let command;

  if (process.platform === "darwin") {
    // macOS
    command = `open "${appPath}"`;
  } else if (process.platform === "win32") {
    // Windows
    command = `start "" "${appPath}"`;
  } else {
    // Linux
    command = `xdg-open "${appPath}"`;
  }

  exec(command, (err, stdout, stderr) => {
    if (err) {
      console.error(`启动应用失败: ${err.message}`);
      return callback(err);
    }

    if (stderr) {
      console.error(`启动应用警告: ${stderr}`);
    }

    callback(null, { stdout, stderr });
  });
}

// =====  ai音色克隆 =====
const voiceCloneConfig = {
  apiHost: "https://api.minimax.chat",
  apiKey:
    "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJHcm91cE5hbWUiOiJycXh4IiwiVXNlck5hbWUiOiJycXh4IiwiQWNjb3VudCI6IiIsIlN1YmplY3RJRCI6IjE5MjQzMDQ0OTE5MzEyNDI4NjIiLCJQaG9uZSI6IjEzMzU2MDAzNTk2IiwiR3JvdXBJRCI6IjE5MjQzMDQ0OTE5MjcwNDg1NTgiLCJQYWdlTmFtZSI6IiIsIk1haWwiOiIiLCJDcmVhdGVUaW1lIjoiMjAyNS0wNS0xOSAyMjo1MzowNCIsIlRva2VuVHlwZSI6MSwiaXNzIjoibWluaW1heCJ9.AE8NfhEgF28S1kB8PA798c2aiy3vYbPPcvCksoYnAvcWciiFwuKtsFEotqVJIGOlneVPnY8LHNCV_5u53GdDt1m2ADNkSuU3oOXyXhfL388RWF4AsHJEffFJ785myIt4936uMOh523AL5WhXumiOcieWyn0GUe9bnN4nKji0u9F7aM-Dj802YzjUE6TZZcMjh8em4xlpZhEI81KOahXiu2ZAOHr3NGu6Kze_uH9NY9VeYBC5MUTQvkLdcjSN0gQDh4Y_RA4JuyUm_hsBt6f8a-SJjMVnUNQUamb6nUrCj50hkqta0aIpqmepy9Ro3ZqDngmzLSNeS8rj056SA45KHA",
  groupId: "1924304491927048558",
};
// 示例音频上传
app.post("/voice-upload", async (req, res) => {
  const { file } = req.body;
  if (!file) {
    return res.status(400).json({ success: false, message: "缺少请求内容" });
  }

  try {
    // 将 Base64 字符串保存为临时文件
    const tempFilePath = path.join(
      os.tmpdir(),
      `voice-sample-${Date.now()}.mp3`
    );
    fs.writeFileSync(tempFilePath, Buffer.from(file, "base64"));

    // 读取文件并创建表单边界
    const fileData = fs.readFileSync(tempFilePath);
    const boundary =
      "----WebKitFormBoundary" + Math.random().toString(16).substr(2);

    // 手动构建 multipart/form-data 请求体
    let requestBody = "";

    // 添加 purpose 字段
    requestBody += `--${boundary}\r\n`;
    requestBody += 'Content-Disposition: form-data; name="purpose"\r\n\r\n';
    requestBody += "voice_clone\r\n";

    // 添加文件数据（文件头部）
    requestBody += `--${boundary}\r\n`;
    requestBody +=
      'Content-Disposition: form-data; name="file"; filename="voice-sample.mp3"\r\n';
    requestBody += "Content-Type: audio/mpeg\r\n\r\n";

    // 将文本和文件数据组合
    const requestBodyBuffer = Buffer.concat([
      Buffer.from(requestBody, "utf8"),
      fileData,
      Buffer.from(`\r\n--${boundary}--\r\n`, "utf8"),
    ]);

    // 上传文件到 MiniMax
    const uploadResponse = await fetch(
      `${voiceCloneConfig.apiHost}/v1/files/upload?GroupId=${voiceCloneConfig.groupId}`,
      {
        method: "POST",
        headers: {
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          Authorization: `Bearer ${voiceCloneConfig.apiKey}`,
        },
        body: requestBodyBuffer,
      }
    );

    // 删除临时文件
    fs.unlinkSync(tempFilePath);

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      throw new Error(`API 返回错误: ${uploadResponse.status} - ${errorText}`);
    }

    const responseText = await uploadResponse.text();
    const uploadResult = JSON.parse(responseText);
    const fileId = uploadResult.file.file_id;
    res.json({ success: true, message: "文件上传成功", fileId });
  } catch (error) {
    console.error("上传文件到MiniMax时出错:", error);
    res
      .status(500)
      .json({ success: false, message: "上传文件失败", error: error.message });
  }
});
// 克隆请求
app.post("/voice-clone", async (req, res) => {
  let { fileId, message } = req.body;
  console.log("克隆请求:", { fileId, message });

  if (!fileId || !message) {
    return res.status(400).json({ success: false, message: "缺少请求内容" });
  }

  // 271327409115518 - y
  // 274177726677260 - r
  // 测试
  fileId = 274177726677260;
  try {
    const voiceId = `voice_rqx_${Date.now()}`;
    const cloneRequestData = {
      file_id: fileId,
      voice_id: voiceId,
      text: message,
      model: "speech-02-hd",
      need_noise_reduction: false,
    };

    console.log("发送克隆请求:", cloneRequestData);

    // 克隆请求
    const cloneResponse = await fetch(
      `${voiceCloneConfig.apiHost}/v1/voice_clone?GroupId=${voiceCloneConfig.groupId}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${voiceCloneConfig.apiKey}`,
        },
        body: JSON.stringify(cloneRequestData),
      }
    );

    if (!cloneResponse.ok) {
      const errorText = await cloneResponse.text();
      throw new Error(`API 返回错误: ${cloneResponse.status} - ${errorText}`);
    }

    const cloneResult = await cloneResponse.json();

    if (!cloneResult.demo_audio) {
      throw new Error("第三方API未返回语音数据");
    }

    res.json({
      success: true,
      message: "克隆成功",
      demo_audio: cloneResult.demo_audio,
    });
  } catch (error) {
    console.error("语音克隆失败:", error);
    res.status(500).json({
      success: false,
      message: "语音克隆失败",
      error: error.message,
    });
  }
});
// 豆包-讲故事
// 豆包AI接口
app.post("/doubao-story", async (req, res) => {
  console.log("收到豆包AI请求:", req.body); // 添加日志
  const { message } = req.body;

  if (!message) {
    return res.status(400).json({ success: false, message: "缺少消息内容" });
  }

  try {
    const completion = await openai.chat.completions.create({
      messages: [
        {
          role: "system",
          content: `你是一个智能助手，可以讲故事。
请根据用户请求，讲一个简短的故事。`,
        },
        { role: "user", content: message },
      ],
      model: MODEL_ID,
    });

    const response = completion.choices[0]?.message?.content;
    console.log("豆包AI响应:", response); // 添加日志

    // 不再尝试解析JSON，而是直接使用文本响应
    res.json({
      success: true,
      action: "story",
      story: response,
      message: response,
    });
  } catch (error) {
    console.error("豆包AI请求失败:", error);
    res.status(500).json({
      success: false,
      message: "豆包AI请求失败",
      error: error.message,
    });
  }
});

const openspeech = {
  appid: "1439533276",
  apiHost: "https://openspeech.bytedance.com",
  apiKey: "h1VVdVbUjH4VQ4pxzeA_gWgKXrINIBez",
  speaker_id: "S_V0bG1PLs1",
};

// 创建音色
app.post("/create-voice", async (req, res) => {
  const { file } = req.body;

  const data = {
    appid: openspeech.appid,
    speaker_id: openspeech.speaker_id,
    audios: [
      {
        audio_bytes: file,
      },
    ],
    source: 2,
    model_type: 1,
  };
  const response = await fetch(
    `${openspeech.apiHost}/api/v1/mega_tts/audio/upload`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer; ${openspeech.apiKey}`,
        "Resource-Id": "volc.megatts.voiceclone",
      },
      body: JSON.stringify(data),
    }
  );
  const result = await response.json();
  console.log("创建音色结果:", result);
  res.json({
    success: true,
    message: "创建音色成功",
    data: result,
  });
});

app.post("/query-status", async (req, res) => {
  const data = {
    appid: openspeech.appid,
    speaker_id: openspeech.speaker_id,
  };
  const response = await fetch(`${openspeech.apiHost}/api/v1/mega_tts/status`, {
    method: "POST",
    headers: {
      Authorization: `Bearer; ${openspeech.apiKey}`,
      "Resource-Id": "volc.megatts.voiceclone",
    },
    body: JSON.stringify(data),
  });
  const result = await response.json();
  console.log("创建音色结果:", result);
  res.json({
    success: true,
    message: "创建音色成功",
    data: result,
  });
});
// tts语音合同
app.post("/tts-contract", async (req, res) => {
  const { message } = req.body;
  const uuid = `voice_rqx_${Date.now()}`;
  const data = {
    app: {
      appid: openspeech.appid,
      token: openspeech.apiKey,
      cluster: "volcano_icl",
    },
    user: {
      uid: uuid,
    },
    audio: {
      voice_type: openspeech.speaker_id,
      encoding: "mp3",
      speed_ratio: 1,
    },
    request: {
      reqid: uuid,
      text: message,
      operation: "query",
    },
  };
  const response = await fetch(`${openspeech.apiHost}/api/v1/tts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer; ${openspeech.apiKey}`,
    },
    body: JSON.stringify(data),
  });

  const result = await response.json();
  console.log("tts语音合同结果:", result);
  res.json({
    success: true,
    message: "tts语音合同成功",
    data: result.data,
  });
});
// 启动服务器
app.listen(PORT, () => {
  console.log(`服务启动在 http://localhost:${PORT}`);
  console.log(`MCP服务端点: http://localhost:${PORT}/mcp`);
  console.log(`豆包AI端点: http://localhost:${PORT}/doubao`);
  console.log(`网页客户端: http://localhost:${PORT}`);
});
