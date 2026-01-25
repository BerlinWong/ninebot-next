import './globals.css'

// 1. Metadata 仅保留标题和描述
export const metadata = {
  title: 'Ninebot Auto Sign',
  description: '九号出行自动签到助手',
}

// 2. Viewport 必须单独导出
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false, // 禁止用户缩放（可选，为了类原生APP体验）
}

export default function RootLayout({ children }) {
  return (
    <html lang="zh">
      <body className="bg-gray-50 text-gray-900 min-h-screen">{children}</body>
    </html>
  )
}
