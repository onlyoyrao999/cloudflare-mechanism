# MacauJC 赛马轨迹分析客户端 (MacauJC Trajectory Analysis Client)

![React](https://img.shields.io/badge/react-%2320232a.svg?style=for-the-badge&logo=react&logoColor=%2361DAFB)
![Vite](https://img.shields.io/badge/vite-%23646CFF.svg?style=for-the-badge&logo=vite&logoColor=white)
![Cloudflare Pages](https://img.shields.io/badge/Cloudflare%20Pages-%23F38020.svg?style=for-the-badge&logo=cloudflare&logoColor=white)
![TailwindCSS](https://img.shields.io/badge/tailwindcss-%2338B2AC.svg?style=for-the-badge&logo=tailwind-css&logoColor=white)
![Gemini](https://img.shields.io/badge/Gemini%203.5%20Flash-8E75B2?style=for-the-badge&logo=googlebard&logoColor=white)

这是一个专注于 **澳门赛马会 (MacauJC) 数据推演与混沌概率学分析** 的 Serverless 智能分析系统。

本系统不仅提供前端可视化的数理统计面板，还在后端深度集成了 Google **Gemini 3.5 Flash** 人工智能大模型。通过结合大盘趋势、遗漏极限和均值回归定理，系统能自主演算并推导出下一期“最不可能开出的 6 个号码”（杀号/排除名单），并通过基于历史回测的真实胜率进行自适应策略微调。

## ✨ 核心亮点 (Key Features)

* **🧠 Gemini AI 强力驱动**：抛弃了刻板的纯静态数学公式，每一期的预测都由 Gemini 大模型实时读取最近 49 期历史轨迹，生成长篇的混沌数学逻辑推演报告。
* **♻️ 胜败自适应回测机制 (Feedback Loop)**：如果 AI 在上一期预测出现了“误杀”，后台引擎会在下一期的 Prompt 中直接注入强制反馈（Warning），迫使大模型做出权重修正。
* **📊 Cloudflare KV 缓存与离线容灾**：使用 Cloudflare KV 数据库自动缓存上一次的预测结果和历史开奖记录，实现边缘极速响应。
* **🌐 Cloudflare Pages 无缝集成**：前端使用 `Vite` 构建，后端 API 直接集成在 `functions/api` 目录中，天然适配 Cloudflare Pages 边缘网络。

## 🧮 算法理论模型

本系统的 6 码排除网络主要建立在以下三大防线上：
1. **触发特征与号码锁定**：根据前期冷热与特定开出位置，建立隔期同号追踪链条。
2. **边缘算法与路径推演**：首尾边缘的高维流形映射，避开高回补概率的振荡节点。
3. **遗漏波峰与混沌均值回归**：在最近 49 期的数据窗口中，测算长期极冷号码的负指数衰减以及温热号码的均值排斥力。

---

## 🚀 本地开发指南 (Local Development)

### 1. 环境依赖
确保您的电脑上已安装 [Node.js](https://nodejs.org/) (建议版本 v18 或以上)。

### 2. 克隆与安装包
```bash
npm install
```

### 3. 配置环境变量
在项目的根目录下找到或新建 `.env` 文件，写入您的 Google Gemini API 密钥：
```env
# Google Gemini 3.5 API Key (必填，否则系统降级为纯本地数学引擎)
GEMINI_API_KEY=<在这里填入您的真实密钥，请勿泄露>
```

### 4. 启动本地开发服务器
```bash
npm run dev
```

---

## ☁️ 部署到 Cloudflare Pages (Production Deployment)

本应用架构完全针对 Cloudflare Pages Functions 设计，请按照以下步骤进行上线部署：

### 1. 安装 Wrangler CLI
确保您已安装 Cloudflare 官方的命令行工具并完成登录：
```bash
npm install -g wrangler
wrangler login
```

### 2. 创建 KV 命名空间
系统需要使用 KV 存储历史记录和缓存，执行以下命令创建一个名为 `MACAUJC_KV` 的空间：
```bash
wrangler kv:namespace create "MACAUJC_KV"
```
*(创建后，终端会输出 `binding` 和 `id`，稍后请在 Cloudflare Pages 项目后台进行绑定)*

### 3. 构建并部署
```bash
# 1. 编译前端静态页面至 dist/ 目录
npm run build

# 2. 将 dist 目录及 functions/ 后端 API 部署到 Cloudflare
wrangler pages deploy dist --project-name=macaujc-analytics
```

### 4. 云端环境变量与 KV 绑定
代码部署成功后，请登录 [Cloudflare 控制台](https://dash.cloudflare.com/)：
1. 进入 `Pages` -> 您部署的项目 (如 `macaujc-analytics`) -> **Settings (设置)**。
2. 找到 **Functions (函数)** -> **KV namespace bindings (KV 命名空间绑定)**，添加绑定变量名 `MACAUJC_KV`，并选择您刚才创建的命名空间。
3. 找到 **Environment variables (环境变量)**，添加 `GEMINI_API_KEY`，值为您的实际 API 密钥 (配置后 Cloudflare 会自动将其加密加密保护，不会被公开访问)。

## 📜 声明
*本系统仅用作高等数学模型、混沌概率学研究与 AI 提示词工程的学术实验，不包含任何商业性推广及诱导投注行为。*
