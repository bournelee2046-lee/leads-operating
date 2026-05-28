import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/lib/auth";
import ProtectedRoute from "@/components/ProtectedRoute";
import Home from "@/pages/Home";
import FollowUp from "@/pages/FollowUp";
import FollowUpDistribution from "@/pages/FollowUpDistribution";
import OperationsData from "@/pages/OperationsData";
import CustomerVisit from "@/pages/CustomerVisit";
import VisitStats from "@/pages/VisitStats";
import OutboundCallDetail from "@/pages/OutboundCallDetail";
import OutboundCallStats from "@/pages/OutboundCallStats";
import DataQuery from "@/pages/DataQuery";
import DealerManagement from "@/pages/DealerManagement";
import DealerDailyReport from "@/pages/DealerDailyReport";
import StorePortfolioMonitor from "@/pages/StorePortfolioMonitor";
import DealerOverdueQuery from "@/pages/DealerOverdueQuery";
import StoreProfile from "@/pages/StoreProfileFresh";
import StoreDetail from "@/pages/StoreDetailFresh";
import StoreManagement from "@/pages/StoreManagement";
import VisitTrendDetail from "@/pages/VisitTrendDetail";
import KeyStoreWind from "@/pages/KeyStoreWind";
import FunnelTargetAnalysis from "@/pages/FunnelTargetAnalysis";
import Login from "@/pages/Login";
import Unauthorized from "@/pages/Unauthorized";
import AdminUsers from "@/pages/admin/AdminUsers";
import AdminRoles from "@/pages/admin/AdminRoles";
import AdminLogs from "@/pages/admin/AdminLogs";

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/unauthorized" element={<Unauthorized />} />
          <Route path="/" element={<ProtectedRoute permission="home.view"><Home /></ProtectedRoute>} />
          <Route path="/visit-trend" element={<ProtectedRoute permission="home.view"><VisitTrendDetail /></ProtectedRoute>} />
          <Route path="/follow-up" element={<ProtectedRoute permission="follow.view"><FollowUp /></ProtectedRoute>} />
          <Route path="/follow-up/tasks/:taskId" element={<ProtectedRoute permission="follow.view"><FollowUp /></ProtectedRoute>} />
          <Route path="/follow-up/distribution" element={<ProtectedRoute permission="follow.distribution.view"><FollowUpDistribution /></ProtectedRoute>} />
          <Route path="/operations-data" element={<ProtectedRoute permission="operations.view"><OperationsData /></ProtectedRoute>} />
          <Route path="/customer-visit" element={<ProtectedRoute permission="customer_visit.view"><CustomerVisit /></ProtectedRoute>} />
          <Route path="/visit-stats" element={<ProtectedRoute permission="visit_stats.view"><VisitStats /></ProtectedRoute>} />
          <Route path="/outbound-call-detail" element={<ProtectedRoute permission="outbound_call_detail.view"><OutboundCallDetail /></ProtectedRoute>} />
          <Route path="/outbound-call-stats" element={<ProtectedRoute permission="outbound_call_stats.view"><OutboundCallStats /></ProtectedRoute>} />
          <Route path="/data-query" element={<ProtectedRoute permission="data_query.view"><DataQuery /></ProtectedRoute>} />
          <Route path="/dealer-management" element={<ProtectedRoute permission="dealer_management.view"><DealerManagement /></ProtectedRoute>} />
          <Route path="/dealer-management/daily-report" element={<ProtectedRoute permission="dealer_daily_report.view"><DealerDailyReport /></ProtectedRoute>} />
          <Route path="/dealer-management/store-portfolio-monitor" element={<StorePortfolioMonitor />} />
          <Route path="/dealer-management/store-portfolio-monitor/config" element={<StorePortfolioMonitor />} />
          <Route path="/dealer-management/store-portfolio-monitor/new" element={<StorePortfolioMonitor />} />
          <Route path="/dealer-management/store-portfolio-monitor/:portfolioId/edit" element={<StorePortfolioMonitor />} />
          <Route path="/dealer-management/store-portfolio-monitor/*" element={<StorePortfolioMonitor />} />
          <Route path="/store-portfolio-monitor" element={<StorePortfolioMonitor />} />
          <Route path="/store-portfolio-monitor/config" element={<StorePortfolioMonitor />} />
          <Route path="/store-portfolio-monitor/new" element={<StorePortfolioMonitor />} />
          <Route path="/store-portfolio-monitor/:portfolioId/edit" element={<StorePortfolioMonitor />} />
          <Route path="/store-portfolio-monitor/*" element={<StorePortfolioMonitor />} />
          <Route path="/dealer-management/overdue-query" element={<ProtectedRoute permission="dealer_overdue_query.view"><DealerOverdueQuery /></ProtectedRoute>} />
          <Route path="/store_profile" element={<ProtectedRoute permission="store_profile.view"><StoreProfile /></ProtectedRoute>} />
          <Route path="/store_detail/:store_code" element={<ProtectedRoute permission="store_profile.detail.view"><StoreDetail /></ProtectedRoute>} />
          <Route path="/store_management" element={<ProtectedRoute permission="store_management.view"><StoreManagement /></ProtectedRoute>} />
          <Route path="/key-store-wind" element={<ProtectedRoute permission="key_store_wind.view"><KeyStoreWind /></ProtectedRoute>} />
          <Route path="/funnel-target-analysis" element={<ProtectedRoute permission="funnel_target.view"><FunnelTargetAnalysis /></ProtectedRoute>} />
          <Route path="/admin/users" element={<ProtectedRoute permission="admin.users.view"><AdminUsers /></ProtectedRoute>} />
          <Route path="/admin/roles" element={<ProtectedRoute permission="admin.roles.view"><AdminRoles /></ProtectedRoute>} />
          <Route path="/admin/logs" element={<ProtectedRoute permission="admin.audit_logs.view"><AdminLogs /></ProtectedRoute>} />
          <Route path="/other" element={<ProtectedRoute><div className="text-center text-xl">Other Page - Coming Soon</div></ProtectedRoute>} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}
