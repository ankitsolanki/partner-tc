import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import PartnerLogin from "@/pages/partner/login";
import PartnerDashboard from "@/pages/partner/dashboard";
import PartnerLicenses from "@/pages/partner/licenses";
import PartnerLicenseDetail from "@/pages/partner/license-detail";
import PartnerGenerate from "@/pages/partner/generate";
import PartnerReports from "@/pages/partner/reports";
import AdminLogin from "@/pages/admin/login";
import AdminDashboard from "@/pages/admin/dashboard";
import AdminPartners from "@/pages/admin/partners";
import AdminPartnerDetail from "@/pages/admin/partner-detail";
import AdminGenerate from "@/pages/admin/generate";
import AdminAppSumoIntegration from "@/pages/admin/appsumo-integration";
import RedeemSuccess from "@/pages/redeem-success";

function Router() {
  return (
    <Switch>
      <Route path="/">
        <Redirect to="/partner/login" />
      </Route>

      <Route path="/partner/login" component={PartnerLogin} />
      <Route path="/partner/dashboard" component={PartnerDashboard} />
      <Route path="/partner/licenses" component={PartnerLicenses} />
      <Route path="/partner/licenses/:licenseKey" component={PartnerLicenseDetail} />
      <Route path="/partner/generate" component={PartnerGenerate} />
      <Route path="/partner/reports" component={PartnerReports} />

      <Route path="/admin/login" component={AdminLogin} />
      <Route path="/admin/dashboard" component={AdminDashboard} />
      <Route path="/admin/partners" component={AdminPartners} />
      <Route path="/admin/partners/:id" component={AdminPartnerDetail} />
      <Route path="/admin/generate" component={AdminGenerate} />
      <Route path="/admin/appsumo" component={AdminAppSumoIntegration} />

      <Route path="/redeem/success" component={RedeemSuccess} />

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
