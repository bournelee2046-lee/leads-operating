import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Home from "@/pages/Home";
import FollowUp from "@/pages/FollowUp";
import FollowUpDistribution from "@/pages/FollowUpDistribution";

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/follow-up" element={<FollowUp />} />
        <Route path="/follow-up/distribution" element={<FollowUpDistribution />} />
        <Route path="/other" element={<div className="text-center text-xl">Other Page - Coming Soon</div>} />
      </Routes>
    </Router>
  );
}
