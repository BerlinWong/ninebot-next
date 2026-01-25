"use client";

import { useState, useEffect } from "react";
import moment from "moment";
import {
    Play, RotateCcw, CheckCircle2, Coffee, XCircle,
    ChevronDown, ChevronUp, Terminal, Calendar as CalendarIcon
} from "lucide-react";

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [autoRunDone, setAutoRunDone] = useState(false); // 防止重复触发

  const startSign = async () => {
    setLoading(true);
    setError("");
    // 保持旧数据展示直到新数据回来，体验更好
    try {
      const res = await fetch("/api/sign", { method: "POST" });
      const json = await res.json();
      if (res.ok) {
        setData(json);
      } else {
        setError(json.error || "请求失败");
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // 页面加载时自动触发一次
  useEffect(() => {
    if (!autoRunDone) {
        startSign();
        setAutoRunDone(true);
    }
  }, []);

  return (
    <main className="max-w-md mx-auto min-h-screen bg-gray-50 flex flex-col p-4 font-sans">
      {/* 头部 */}
      <div className="mb-6 mt-2 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">九号助手</h1>
          <p className="text-xs text-slate-400 mt-1">
            {moment().format("YYYY年MM月DD日 dddd")}
          </p>
        </div>
        <div className="bg-white p-2 rounded-full shadow-sm border border-gray-100">
          <Terminal size={20} className="text-slate-600" />
        </div>
      </div>

      {/* 状态面板 */}
      <div className="bg-white rounded-2xl shadow-sm p-6 mb-6 text-center border border-gray-100">
        <div className="mb-4 relative">
          <div className={`w-20 h-20 mx-auto rounded-full flex items-center justify-center transition-all duration-300 ${loading ? 'bg-blue-50 scale-110' : 'bg-slate-50'}`}>
            {loading ? (
              <RotateCcw className="animate-spin text-blue-500" size={32} />
            ) : (
              <Play className="text-slate-700 ml-1" size={32} />
            )}
          </div>
        </div>
        <h2 className="text-lg font-bold text-slate-800 mb-1">
            {loading ? "正在检测状态..." : (data ? "检测完成" : "准备就绪")}
        </h2>
        <p className="text-sm text-gray-400 mb-6 px-4">
            {loading ? "正在同步云端数据" : "页面加载已自动执行检测"}
        </p>

        <button
          onClick={startSign}
          disabled={loading}
          className="w-full py-3 bg-slate-900 hover:bg-slate-800 active:scale-95 text-white rounded-xl font-medium transition-all disabled:opacity-70 shadow-lg shadow-slate-200 text-sm"
        >
          {loading ? "处理中..." : "手动刷新状态"}
        </button>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-xl mb-4 text-sm flex items-center border border-red-100 animate-in fade-in">
          <XCircle size={18} className="mr-2 shrink-0" />
          {error}
        </div>
      )}

      {/* 结果列表 */}
      {data && data.results && (
        <div className="space-y-4 pb-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {data.results.map((item, index) => (
            <ResultCard key={index} item={item} />
          ))}
        </div>
      )}

      {!data && !loading && !error && (
        <div className="text-center text-gray-300 text-sm py-10">等待数据返回...</div>
      )}
    </main>
  );
}

// 结果卡片组件（包含日历）
function ResultCard({ item }) {
  const [isOpen, setIsOpen] = useState(false); // 默认不展开日志
  const [showCalendar, setShowCalendar] = useState(true); // 默认展示日历

  const getStatusConfig = (status) => {
    switch(status) {
        case 'success': return { color: 'text-green-500', bg: 'bg-green-50', icon: CheckCircle2, text: '签到成功' };
        case 'skipped': return { color: 'text-blue-500', bg: 'bg-blue-50', icon: Coffee, text: '今日已签' };
        default: return { color: 'text-red-500', bg: 'bg-red-50', icon: XCircle, text: '执行异常' };
    }
  };

  const config = getStatusConfig(item.status);
  const Icon = config.icon;

  return (
    <div className="bg-white rounded-xl overflow-hidden shadow-sm border border-gray-100">
      {/* 顶部标题栏 */}
      <div className="p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-full ${config.bg} ${config.color}`}>
            <Icon size={20} />
          </div>
          <div>
            <h4 className="font-bold text-gray-800 text-sm">{item.name}</h4>
            <div className="flex items-center gap-2">
                <span className={`text-xs font-medium ${config.color}`}>{item.summary}</span>
                {item.consecutiveDays > 0 && (
                    <span className="text-xs text-gray-400"> • 连签 {item.consecutiveDays} 天</span>
                )}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
            <button
                onClick={() => setShowCalendar(!showCalendar)}
                className={`p-1.5 rounded-md transition-colors ${showCalendar ? 'bg-slate-100 text-slate-600' : 'text-slate-300'}`}
            >
                <CalendarIcon size={18} />
            </button>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`p-1.5 rounded-md transition-colors ${isOpen ? 'bg-slate-100 text-slate-600' : 'text-slate-300'}`}
            >
                {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>
        </div>
      </div>

      {/* 日历组件区域 */}
      {showCalendar && item.status !== 'error' && (
        <div className="px-4 pb-4 animate-in fade-in">
             <MonthCalendar consecutiveDays={item.consecutiveDays || 0} />
        </div>
      )}

      {/* 日志详情 */}
      {isOpen && (
        <div className="bg-gray-50/50 px-4 py-3 border-t border-gray-100 animate-in slide-in-from-top-1">
          <div className="space-y-2">
            {item.logs.map((log, idx) => (
              <div key={idx} className="flex justify-between text-xs items-start">
                <span className="text-gray-400 min-w-[60px]">{log.name}</span>
                <span className="font-medium text-gray-600 text-right break-all ml-2">{log.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// 日历组件
function MonthCalendar({ consecutiveDays }) {
    // 获取当月信息
    const today = moment();
    const startOfMonth = moment().startOf('month');
    const endOfMonth = moment().endOf('month');
    const daysInMonth = today.daysInMonth();

    // 计算签到覆盖的日期范围：[今天 - 连签天数 + 1, 今天]
    // 注意：这里简化逻辑，假设连签天数都在本月或跨月，只要日期匹配就打钩
    const checkStartDate = moment().subtract(consecutiveDays - 1, 'days');

    // 生成日历格子
    const days = [];
    // 填充月初空白 (0-6, 0 is Sunday)
    // moment.day() returns 0 for Sunday, we want 0 for Monday usually in CN, but let's stick to Sun-Sat grid
    const startDayOfWeek = startOfMonth.day(); // 0(Sun) to 6(Sat)

    for (let i = 0; i < startDayOfWeek; i++) {
        days.push({ day: '', active: false });
    }

    for (let d = 1; d <= daysInMonth; d++) {
        const currentDay = moment().date(d);
        // 判断这一天是否在 [CheckStartDate, Today] 范围内
        // 且这一天不能是将来的日期
        const isChecked = currentDay.isSameOrAfter(checkStartDate, 'day') && currentDay.isSameOrBefore(today, 'day');
        const isToday = currentDay.isSame(today, 'day');

        days.push({
            day: d,
            checked: isChecked,
            isToday: isToday,
            future: currentDay.isAfter(today, 'day')
        });
    }

    return (
        <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
            <div className="text-xs text-center text-slate-500 mb-2 font-medium">
                {today.format("YYYY年 M月")}
            </div>
            <div className="grid grid-cols-7 gap-1 text-center mb-1">
                {['日','一','二','三','四','五','六'].map(h => (
                    <div key={h} className="text-[10px] text-slate-400">{h}</div>
                ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
                {days.map((item, idx) => {
                    if (!item.day) return <div key={idx} />; // 空白占位
                    return (
                        <div
                            key={idx}
                            className={`
                                h-7 flex items-center justify-center rounded-md text-xs relative
                                ${item.checked ? 'bg-green-500 text-white shadow-sm shadow-green-200 font-bold' : ''}
                                ${!item.checked && item.isToday ? 'bg-blue-100 text-blue-600 font-bold' : ''}
                                ${!item.checked && !item.isToday ? 'text-slate-600' : ''}
                                ${item.future ? 'opacity-30' : ''}
                            `}
                        >
                            {item.day}
                        </div>
                    );
                })}
            </div>
            {consecutiveDays > 0 && (
                <div className="text-[10px] text-right text-green-600 mt-2 flex justify-end items-center gap-1">
                    <CheckCircle2 size={10} />
                    已连续打卡 {consecutiveDays} 天
                </div>
            )}
        </div>
    );
}
