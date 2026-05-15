import { Link } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'

export default function Unauthorized() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-8 text-center max-w-md">
        <ShieldAlert className="w-12 h-12 text-amber-500 mx-auto mb-4" />
        <h1 className="text-xl font-semibold text-slate-900">无权限访问</h1>
        <p className="text-slate-600 mt-2">当前账号没有访问该页面或操作的权限。</p>
        <Link to="/" className="inline-flex mt-6 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">
          返回首页
        </Link>
      </div>
    </div>
  )
}

