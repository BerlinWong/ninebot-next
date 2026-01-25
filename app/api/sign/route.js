import { NextResponse } from 'next/server';
import axios from 'axios';
import moment from 'moment';
import 'moment/locale/zh-cn';

// 设置中文时间
moment.locale('zh-cn');

// === 核心配置 (完全还原稳定版 Headers，切勿删除任何字段) ===
const CONFIG = {
    timeout: 10000,
    headers: {
        "Accept": "application/json, text/plain, */*",
        "Accept-Encoding": "gzip, deflate, br",
        "Accept-Language": "zh-CN,zh-Hans;q=0.9",
        "Content-Type": "application/json",
        "Host": "cn-cbu-gateway.ninebot.com",
        "Origin": "https://h5-bj.ninebot.com",
        "Referer": "https://h5-bj.ninebot.com/",
        "from_platform_1": "1", // 关键字段，缺少可能导致 401
        "language": "zh",
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 15_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Segway v6 C 609033420",
    }
};

class NineBot {
    constructor(deviceId, authorization, name) {
        this.msg = [];
        this.name = name;
        this.deviceId = deviceId;
        // 核心：严格合并 Headers，保留 trim 防止回车符
        this.headers = {
            ...CONFIG.headers,
            "Authorization": authorization ? authorization.trim() : "",
        };
        this.endpoints = {
            sign: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
            status: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status"
        };
    }

    log(name, value) {
        this.msg.push({ name, value });
        console.log(`[${this.name}] ${name}: ${value}`);
    }

    async makeRequest(method, url, data = null) {
        try {
            const response = await axios({
                method,
                url,
                data,
                headers: this.headers, // 必须使用包含完整字段的 headers
                timeout: CONFIG.timeout
            });
            return response.data;
        } catch (error) {
            throw error;
        }
    }

    // checkOnly=true 时只查不签
    async run(checkOnly = false) {
        try {
            const timestamp = moment().valueOf();

            // --- 1. 验证状态 ---
            let statusRes;
            try {
                statusRes = await this.makeRequest("get", `${this.endpoints.status}?t=${timestamp}`);
            } catch (e) {
                const errDetail = e.response ? `HTTP ${e.response.status}` : e.message;
                this.log("验证失败", errDetail);
                return { status: "error", summary: "接口请求失败", logs: this.msg, consecutiveDays: 0 };
            }

            if (statusRes.code !== 0) {
                this.log("验证失败", `Code=${statusRes.code}, Msg=${statusRes.msg}`);
                return { status: "error", summary: `Token无效: ${statusRes.msg}`, logs: this.msg, consecutiveDays: 0 };
            }

            const data = statusRes.data;
            const consecutiveDays = data.consecutiveDays || 0;
            const completed = data.currentSignStatus === 1;

            this.log("连续签到", `${consecutiveDays}天`);

            // --- 2. 判断是否已签 ---
            if (completed) {
                this.log("状态", "今日已签到");
                return { status: "skipped", summary: "今日已签", logs: this.msg, consecutiveDays: consecutiveDays };
            }

            // --- 仅检测模式 ---
            if (checkOnly) {
                 this.log("状态", "尚未签到");
                 return { status: "waiting", summary: "等待签到", logs: this.msg, consecutiveDays: consecutiveDays };
            }

            // --- 3. 执行签到 ---
            this.log("动作", "执行签到中...");
            const signRes = await this.makeRequest("post", this.endpoints.sign, { deviceId: this.deviceId.trim() });

            if (signRes.code === 0) {
                this.log("结果", "签到成功 🎉");
                return { status: "success", summary: "签到成功", logs: this.msg, consecutiveDays: consecutiveDays + 1 };
            } else {
                this.log("结果", `失败: ${signRes.msg}`);
                return { status: "error", summary: signRes.msg || "签到失败", logs: this.msg, consecutiveDays: consecutiveDays };
            }

        } catch (error) {
            const errInfo = error.response?.data?.msg || error.message;
            this.log("系统异常", errInfo);
            return { status: "error", summary: "脚本出错", logs: this.msg, consecutiveDays: 0 };
        }
    }
}

// === 获取今日诗词 (创意部分) ===
async function getPoetry() {
    try {
        const res = await axios.get("https://v1.jinrishici.com/all.json", { timeout: 3000 });
        if (res.data && res.data.content) {
            return {
                content: res.data.content,
                author: res.data.author,
                origin: res.data.origin
            };
        }
    } catch (e) {
        console.error("诗词获取超时", e.message);
    }
    return { content: "生活原本沉闷，但跑起来就有风。", author: "九号", origin: "致骑士" };
}

// === Bark 推送 (美化排版) ===
async function sendBark(title, body, group = "Ninebot") {
    const key = process.env.BARK_KEY ? process.env.BARK_KEY.trim() : "";
    if (!key) return;

    try {
        const baseUrl = process.env.BARK_URL || 'https://api.day.app';
        // Bark URL 编码处理
        const encodedTitle = encodeURIComponent(title);
        const encodedBody = encodeURIComponent(body);
        const encodedGroup = encodeURIComponent(group);

        // icon: 使用九号相关的图标或者通用的滑板车图标
        const url = `${baseUrl}/${key}/${encodedTitle}/${encodedBody}?group=${encodedGroup}&icon=https://cdn-icons-png.flaticon.com/512/15220/15220391.png `;

        await axios.get(url, { timeout: 5000 });
        console.log("Bark 推送成功 ✅");
    } catch (e) {
        console.error("Bark 推送失败 ❌:", e.message);
    }
}

async function handleSign(req) {
    const url = new URL(req.url);
    const action = url.searchParams.get('action') || 'sign'; // 'check', 'sign', 'bark'

    let accounts = [];

    // 严格的账号解析逻辑
    if (process.env.NINEBOT_ACCOUNTS) {
        try { accounts = JSON.parse(process.env.NINEBOT_ACCOUNTS); } catch (e) { console.error("JSON解析失败", e); }
    } else if (process.env.NINEBOT_DEVICE_ID) {
        accounts.push({
            name: process.env.NINEBOT_NAME || "默认账号",
            deviceId: (process.env.NINEBOT_DEVICE_ID || "").trim(),
            authorization: (process.env.NINEBOT_AUTHORIZATION || "").trim()
        });
    }

    if (!accounts.length) {
        return NextResponse.json({ error: "未配置环境变量" }, { status: 500 });
    }

    const results = await Promise.all(accounts.map(async (acc) => {
        // 双重保险：在这里也做一次 trim
        const safeAuth = acc.authorization ? acc.authorization.trim() : "";
        const safeId = acc.deviceId ? acc.deviceId.trim() : "";

        const bot = new NineBot(safeId, safeAuth, acc.name);

        // 逻辑：如果是 'sign' 动作，checkOnly=false (执行签到)
        // 逻辑：如果是 'check' 或 'bark' 动作，checkOnly=true (只查不签，除非你想点推送时也强制签到，可自行修改)
        const checkOnly = action !== 'sign';

        const res = await bot.run(checkOnly);
        return { name: acc.name, ...res };
    }));

    // === 推送逻辑 ===
    // 只有在 action='bark' (手动点击推送) 或 action='sign' (定时任务执行) 时才推送
    if (action === 'bark' || action === 'sign') {
        const poem = await getPoetry();
        // 日期格式优化：01-26 周一
        const dateStr = moment().format('MM-DD dddd');

        // 统计摘要：判断是否全部成功
        const isAllSuccess = results.every(r => r.status === 'success' || r.status === 'skipped');
        // 标题图标：全对用摩托，有错用警示
        const titleIcon = isAllSuccess ? "🛵" : "🚨";

        // 1. 标题：极简风格
        const title = `${titleIcon} 九号出行 • ${dateStr}`;

        // 2. 正文构建
        let body = "";

        // --- A. 结果列表区域 (置顶) ---
        results.forEach((r, index) => {
            let statusIcon = "";
            let statusText = "";

            switch(r.status) {
                case 'success':
                    statusIcon = "✅"; statusText = "签到成功"; break;
                case 'skipped':
                    statusIcon = "☕️"; statusText = "今日已签"; break;
                case 'waiting':
                    statusIcon = "⏳"; statusText = "等待执行"; break;
                case 'error':
                    statusIcon = "❌"; statusText = "执行失败"; break;
                default:
                    statusIcon = "❓"; statusText = "未知状态";
            }

            // 第一行：名字 + 状态图标
            body += `\n「 ${r.name} 」 ${statusIcon} - ${statusText}\n`;

            // 第二行：具体状态文字 + 连签天数
            body += `\n${statusText}  |  📅 连签 ${r.consecutiveDays} 天\n`;

            // 错误详情 (如果有)
            if (r.status === 'error') {
                body += `👉 错误: ${r.summary}\n`;
            }

            // 如果不是最后一个账号，加一条细分割线
            if (index < results.length - 1) {
                body += `────────────────\n`;
            }
        });

        // --- B. 分割区域 ---
        body += `\n━━━━━━━━━━━━━━\n\n`;

        // --- C. 诗词区域 (底部) ---
        // 增加引号装饰
        body += `❝ ${poem.content} ❞\n`;
        // 尝试通过空格模拟右对齐落款 (Bark对空格支持有限，但在通知栏通常有效)
        body += `\n                  —— ${poem.author}《${poem.origin}》`;

        await sendBark(title, body);
    }

    return NextResponse.json({
        timestamp: moment().format('YYYY-MM-DD HH:mm:ss'),
        action,
        results
    });
}

export async function GET(req) { return await handleSign(req); }
export async function POST(req) { return await handleSign(req); }
