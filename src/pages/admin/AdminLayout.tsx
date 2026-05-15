import { Link, useLocation } from 'react-router-dom'
import { ChevronLeft, FileText, Shield, Users } from 'lucide-react'

const tabs = [
  { path: '/admin/users', label: '账号管理', icon: Users },
  { path: '/admin/roles', label: '角色管理', icon: Shield },
  { path: '/admin/logs', label: '操作日志', icon: FileText },
]

export default function AdminLayout({ title, children }: { title: string; children: React.ReactNode }) {
  const location = useLocation()

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="h-16 flex items-center justify-between">
            <div className="flex items-center">
              <Link to="/" className="mr-4 p-2 hover:bg-slate-100 rounded-lg transition-colors">
                <ChevronLeft className="w-5 h-5 text-slate-600" />
              </Link>
              <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
            </div>
            <div className="flex items-center gap-2">
              {tabs.map((tab) => {
                const Icon = tab.icon
                const active = location.pathname === tab.path
                return (
                  <Link
                    key={tab.path}
                    to={tab.path}
                    className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${
                      active ? 'bg-primary-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {tab.label}
                  </Link>
                )
              })}
            </div>
          </div>
        </div>
      </div>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">{children}</main>
    </div>
  )
}

