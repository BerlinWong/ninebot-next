import { NextResponse } from 'next/server';
import axios from 'axios';
import moment from 'moment';

// === 配置区域 (保持验证通过的配置) ===
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
        "from_platform_1": "1",
        "language": "zh",
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 15_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Segway v6 C 609033420",
    }
};

class NineBot {
    constructor(deviceId, authorization, name) {
        this.msg = [];
        this.name = name;
        this.deviceId = deviceId;
        // 关键：合并 Headers 并强制 trim 保证格式正确
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
                headers: this.headers,
                timeout: CONFIG.timeout
            });
            return response.data;
        } catch (error) {
            throw error;
        }
    }

    async run() {
        try {
            console.log(`[${this.name}] Token检查: ${this.headers.Authorization.substring(0, 10)}...`);
            const timestamp = moment().valueOf();

            // --- 1. 验证状态 ---
            let statusRes;
            try {
                statusRes = await this.makeRequest("get", `${this.endpoints.status}?t=${timestamp}`);
            } catch (e) {
                const errDetail = e.response ? `HTTP ${e.response.status}` : e.message;
                this.log("验证请求失败", errDetail);
                // 返回 consecutiveDays: 0 防止前端报错
                return { status: "error", summary: "网络/接口异常", logs: this.msg, consecutiveDays: 0 };
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
                // 关键：返回 consecutiveDays 给前端画日历
                return { status: "skipped", summary: "今日已签", logs: this.msg, consecutiveDays: consecutiveDays };
            }

            // --- 3. 执行签到 ---
            this.log("动作", "执行签到中...");
            // 确保 deviceId 也去空格
            const signRes = await this.makeRequest("post", this.endpoints.sign, { deviceId: this.deviceId.trim() });

            if (signRes.code === 0) {
                this.log("结果", "签到成功 🎉");
                // 签到成功后，天数+1 传给前端
                return { status: "success", summary: "签到成功", logs: this.msg, consecutiveDays: consecutiveDays + 1 };
            } else {
                this.log("结果", `失败: ${signRes.msg}`);
                return { status: "error", summary: signRes.msg || "签到失败", logs: this.msg, consecutiveDays: consecutiveDays };
            }

        } catch (error) {
            const errInfo = error.response?.data?.msg || error.message;
            this.log("系统异常", errInfo);
            return { status: "error", summary: "脚本执行出错", logs: this.msg, consecutiveDays: 0 };
        }
    }
}

// Bark 推送工具
async function sendBark(title, content) {
    const key = process.env.BARK_KEY ? process.env.BARK_KEY.trim() : "";
    if (!key) return;

    try {
        const baseUrl = process.env.BARK_URL || 'https://api.day.app';
        const safeContent = content.length > 500 ? content.substring(0, 500) + "..." : content;
        const url = `${baseUrl}/${key}/${encodeURIComponent(title)}/${encodeURIComponent(safeContent)}`;
        await axios.get(url, { timeout: 5000 });
        console.log("Bark 推送成功 ✅");
    } catch (e) {
        console.error("Bark 推送失败 ❌:", e.message);
    }
}

async function handleSign() {
    let accounts = [];

    // --- 严谨的配置读取逻辑 ---
    if (process.env.NINEBOT_ACCOUNTS) {
        try { accounts = JSON.parse(process.env.NINEBOT_ACCOUNTS); } catch (e) {
            console.error("JSON解析失败", e);
        }
    }
    else if (process.env.NINEBOT_DEVICE_ID) {
        accounts.push({
            name: process.env.NINEBOT_NAME || "默认账号",
            // 这里的 trim() 非常关键，防止.env文件复制粘贴带入回车
            deviceId: (process.env.NINEBOT_DEVICE_ID || "").trim(),
            authorization: (process.env.NINEBOT_AUTHORIZATION || "").trim()
        });
    }

    if (accounts.length === 0) {
        return NextResponse.json({ error: "未配置环境变量" }, { status: 500 });
    }

    const results = await Promise.all(accounts.map(async (acc) => {
        // 二次保险：确保传入类的参数也没有空格
        const safeAuth = acc.authorization ? acc.authorization.trim() : "";
        const safeId = acc.deviceId ? acc.deviceId.trim() : "";

        const bot = new NineBot(safeId, safeAuth, acc.name);
        const res = await bot.run();

        return {
            name: acc.name,
            ...res
        };
    }));

    // 构建 Bark 消息
    const iconMap = { success: "✅", skipped: "👌", error: "❌" };
    const barkMsg = results.map(r =>
        `${iconMap[r.status]} ${r.name}: ${r.summary}\n${r.logs.map(d => `${d.name}: ${d.value}`).join("\n")}`
    ).join("\n\n");

    await sendBark("九号签到结果", barkMsg);

    return NextResponse.json({
        timestamp: moment().format('YYYY-MM-DD HH:mm:ss'),
        results
    });
}

export async function GET() { return await handleSign(); }
export async function POST() { return await handleSign(); }
