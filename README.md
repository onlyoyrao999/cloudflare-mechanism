# MacauJC 赛马轨迹分析客户端 (MacauJC Trajectory Analysis Client)

![React](https://img.shields.io/badge/react-%2320232a.svg?style=for-the-badge&logo=react&logoColor=%2361DAFB)
![Vite](https://img.shields.io/badge/vite-%23646CFF.svg?style=for-the-badge&logo=vite&logoColor=white)
![Express](https://img.shields.io/badge/express.js-%23404d59.svg?style=for-the-badge&logo=express&logoColor=%2361DAFB)
![TailwindCSS](https://img.shields.io/badge/tailwindcss-%2338B2AC.svg?style=for-the-badge&logo=tailwind-css&logoColor=white)
![Gemini](https://img.shields.io/badge/Gemini%203.5%20Flash-8E75B2?style=for-the-badge&logo=googlebard&logoColor=white)

这是一个专注于 **澳门赛马会 (MacauJC) 数据推演与混沌概率学分析** 的全栈智能分析系统。

本系统不仅提供前端可视化的数理统计面板，还在后端深度集成了 Google **Gemini 3.5 Flash** 人工智能大模型。通过结合大盘趋势、遗漏极限和均值回归定理，系统能自主演算并推导出下一期“最不可能开出的 6 个号码”（杀号/排除名单），并通过基于历史回测的真实胜率进行自适应策略微调。

## ✨ 核心亮点 (Key Features)

* **🧠 Gemini AI 强力驱动**：抛弃了刻板的纯静态数学公式，每一期的预测都由 Gemini 大模型实时读取最近 49 期历史轨迹，生成长篇的混沌数学逻辑推演报告。
* **♻️ 胜败自适应回测机制 (Feedback Loop)**：如果 AI 在上一期预测出现了“误杀”（预测不会出的号码结果开出了），后台引擎会在下一期的 Prompt 中直接注入强制反馈（Warning），迫使大模型在“边缘算法与路径推演”中做出权重修正，避免在同一坑里跌倒。
* **📊 KV 缓存与离线容灾**：本地自动缓存上一次的预测结果和历史开奖记录（模拟 KV 引擎机制）。
* **🌐 全栈无缝集成**：使用 `Vite` + `Express` 一体化打包，后端直接拉取开奖数据与请求 Gemini API，杜绝任何客户端跨域 (CORS) 问题并保障 API Key 的绝对安全。

## 🧮 算法理论模型

本系统的 6 码排除网络主要建立在以下三大防线上：
1. **触发特征与号码锁定**：根据前期冷热与特定开出位置，建立隔期同号追踪链条。
2. **边缘算法与路径推演**：首尾边缘的高维流形映射，避开高回补概率的振荡节点。
3. **遗漏波峰与混沌均值回归**：在最近 49 期的数据窗口中，测算长期极冷号码的负指数衰减以及温热号码的均值排斥力。

---

## 🚀 安装与运行 (Installation)

### 1. 环境依赖
确保您的电脑上已安装 [Node.js](https://nodejs.org/) (建议版本 v18 或以上)。

### 2. 克隆与安装包
在终端执行以下命令：
```bash
# 安装所有的依赖包 (前后端合并在 package.json 中)
npm install
```

### 3. 配置环境变量
在项目的根目录下找到或新建 `.env` 文件，写入您的 Google Gemini API 密钥：
```env
# Google Gemini 3.5 API Key (必填，否则系统降级为纯本地数学引擎)
GEMINI_API_KEY=AIzaSyYourSecretKeyHere...
```

### 4. 启动开发服务器
```bash
npm run dev
```
启动成功后，浏览器访问 `http://localhost:3000` 即可看到精美的动态暗黑仪表盘。

---

## 🛠️ 构建与生产环境部署 (Production Build)

本应用采用了 `esbuild` 配合 `vite` 的一体化单文件服务器打包策略。只需一条命令，即可将所有前端 React 页面和后端 Express 服务打包。

```bash
# 执行生产环境构建
npm run build

# 启动编译后的纯净生产级服务器
npm run start
```
*构建成功后，`dist` 目录将包含前端的静态文件，并且 `dist/server.cjs` 就是独立无外部源码依赖的 Node.js 后端启动文件，非常适合部署至 Docker, Cloud Run 或 Vercel (需自行配置 adaptor) 等云端无服务架构中。*

## 📜 声明
*本系统仅用作高等数学模型、混沌概率学研究与 AI 提示词工程的学术实验，不包含任何商业性推广及诱导投注行为。博彩有风险，请遵守当地法律法规。*
