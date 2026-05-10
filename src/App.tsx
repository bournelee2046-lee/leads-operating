import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Home from "@/pages/Home";
import FollowUp from "@/pages/FollowUp";
import FollowUpDistribution from "@/pages/FollowUpDistribution";
import OperationsData from "@/pages/OperationsData";
import CustomerVisit from "@/pages/CustomerVisit";
import VisitStats from "@/pages/VisitStats";
import DataQuery from "@/pages/DataQuery";

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/follow-up" element={<FollowUp />} />
        <Route path="/follow-up/distribution" element={<FollowUpDistribution />} />
        <Route path="/operations-data" element={<OperationsData />} />
        <Route path="/customer-visit" element={<CustomerVisit />} />
        <Route path="/visit-stats" element={<VisitStats />} />
        <Route path="/data-query" element={<DataQuery />} />
        <Route path="/other" element={<div className="text-center text-xl">Other Page - Coming Soon</div>} />
      </Routes>
    </Router>
  );
}
