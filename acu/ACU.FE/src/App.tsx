import { useState } from "react";
import {
  MdDevices, MdPendingActions, MdRoute, MdCloudOff, MdSettings, MdAdd, MdMedicalServices,
} from "./icons";

import type { AppTab } from "./types";
import { useDeviceData } from "./hooks/useDeviceData";
import { useWorkflows } from "./hooks/useWorkflows";
import { useRobotWorkflows } from "./hooks/useRobotWorkflows";
import { useT } from "./i18n/I18nProvider";

import TopBar from "./components/layout/TopBar";
import NavTabs, { type NavItem } from "./components/layout/NavTabs";
import BottomNav from "./components/layout/BottomNav";
import Toast from "./components/ui/Toast";

import RequestsView  from "./features/requests/RequestsView";
import DevicesView   from "./features/devices/DevicesView";
import WorkflowsView from "./features/workflows/WorkflowsView";
import RobotWorkflowsView from "./features/workflows/robot/RobotWorkflowsView";
import SettingsView  from "./features/settings/SettingsView";
import CTCompanionView from "./features/ct/CTCompanionView";

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>("devices");
  const [creatingRobotWorkflow, setCreatingRobotWorkflow] = useState(false);
  const t = useT();
  const changeTab = (tab: AppTab) => {
    setCreatingRobotWorkflow(false);
    setActiveTab(tab);
  };

  const {
    requests, registeredDevices, lastRefreshed,
    loadingId, unregisteringId, isServerOnline, notification,
    handleApprove, handleDeny, handleUnregister,
  } = useDeviceData();
  const { workflows, saveWorkflow, deleteWorkflow } = useWorkflows();
  const robotWorkflows = useRobotWorkflows();

  const pendingRequests = requests.filter((r) => r.status === "pending");

  const navItems: NavItem[] = [
    {
      id: "devices",
      label: t("navDevices"),
      icon: <MdDevices size={20} />,
      badge: registeredDevices.length,
      badgeTone: "neutral",
    },
    {
      id: "requests",
      label: t("navRequests"),
      icon: <MdPendingActions size={20} />,
      badge: pendingRequests.length,
      badgeTone: "brand",
    },
    {
      id: "workflows",
      label: t("navWorkflows"),
      icon: <MdRoute size={20} />,
      badge: workflows.length + robotWorkflows.workflows.length,
      badgeTone: "neutral",
    },
    {
      id: "ct",
      label: t("navCtCompanion"),
      icon: <MdMedicalServices size={20} />,
    },
    {
      id: "settings",
      label: t("navSettings"),
      icon: <MdSettings size={20} />,
    },
  ];

  return (
    <div className="app-shell">
      <TopBar lastRefreshed={lastRefreshed} isServerOnline={isServerOnline} />
      {isServerOnline && <NavTabs items={navItems} active={activeTab} onChange={changeTab} />}

      {!isServerOnline && (
        <div className="offline-banner" role="alert">
          <MdCloudOff size={18} />
          {t("offlineBanner")}
        </div>
      )}

      <main className="main">
        {isServerOnline && activeTab === "devices" && (
          <DevicesView
            devices={registeredDevices}
            pendingRequests={pendingRequests}
            onApprove={handleApprove}
            onDeny={handleDeny}
            onUnregister={handleUnregister}
            loadingId={loadingId}
            unregisteringId={unregisteringId}
            workflows={workflows}
            robotWorkflows={robotWorkflows.workflows}
          />
        )}
        {isServerOnline && activeTab === "requests" && (
          <RequestsView
            requests={requests}
            onApprove={handleApprove}
            onDeny={handleDeny}
            loadingId={loadingId}
            lastRefreshed={lastRefreshed}
          />
        )}
        {isServerOnline && activeTab === "workflows" && (
          <>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-3)", justifyContent: "flex-end", marginBottom: "var(--space-3)" }}>
              <button type="button" className="btn btn-secondary" onClick={() => setCreatingRobotWorkflow(true)}>
                <MdAdd size={16} /> {t("createWorkflow")}
              </button>
            </div>
            <WorkflowsView
              workflows={workflows}
              devices={registeredDevices}
              onSave={saveWorkflow}
              onDelete={deleteWorkflow}
              additionalWorkflowCount={robotWorkflows.workflows.length}
              additionalWorkflows={<RobotWorkflowsView devices={registeredDevices}
                workflows={robotWorkflows.workflows} onChanged={robotWorkflows.reload}
                creating={creatingRobotWorkflow} onCloseCreate={() => setCreatingRobotWorkflow(false)} />}
            />
            {robotWorkflows.error && <p role="alert">{robotWorkflows.error}</p>}
          </>
        )}
        {isServerOnline && activeTab === "settings" && <SettingsView />}
        {isServerOnline && activeTab === "ct" && <CTCompanionView />}
      </main>

      {isServerOnline && <BottomNav items={navItems} active={activeTab} onChange={changeTab} />}

      {notification && <Toast type={notification.type} message={notification.message} />}
    </div>
  );
}
