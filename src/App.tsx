import React, { useState, useEffect, useCallback } from 'react';
import { Navbar } from './components/Navbar.tsx';
import { Sidebar, ActiveTab } from './components/Sidebar.tsx';
import { LoginModal } from './components/LoginModal.tsx';
import { OverviewView } from './components/views/OverviewView.tsx';
import { InboxView } from './components/views/InboxView.tsx';
import { PendingApprovalsView } from './components/views/PendingApprovalsView.tsx';
import { KnowledgeBaseView } from './components/views/KnowledgeBaseView.tsx';
import { AISettingsView } from './components/views/AISettingsView.tsx';
import { MemoryView } from './components/views/MemoryView.tsx';
import { IntegrationsView } from './components/views/IntegrationsView.tsx';
import { SimulatorView } from './components/views/SimulatorView.tsx';
import { ResearchView } from './components/views/ResearchView.tsx';
import { AuditLogsView } from './components/views/AuditLogsView.tsx';
import {
  Contact,
  Message,
  PendingReply,
  KnowledgeItem,
  AISettings,
  ContactMemory,
  IntegrationStatus,
  AuditLog,
} from './types/index.ts';

export default function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('nayeem_desk_token'));
  const [user, setUser] = useState<{ username: string; name: string; role: string } | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');

  // App Data State
  const [stats, setStats] = useState({
    totalContacts: 0,
    totalMessages: 0,
    pendingApprovalsCount: 0,
    autoReplyEnabled: true,
    recentInboundCount: 0,
    activeErrorsCount: 0,
  });
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [pendingReplies, setPendingReplies] = useState<PendingReply[]>([]);
  const [knowledgeItems, setKnowledgeItems] = useState<KnowledgeItem[]>([]);
  const [settings, setSettings] = useState<AISettings | null>(null);
  const [memories, setMemories] = useState<ContactMemory[]>([]);
  const [integrations, setIntegrations] = useState<IntegrationStatus[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Authenticated fetch wrapper
  const authFetch = useCallback(
    async (url: string, options: RequestInit = {}) => {
      const currentToken = token || localStorage.getItem('nayeem_desk_token');
      const headers = new Headers(options.headers || {});
      if (currentToken) {
        headers.set('Authorization', `Bearer ${currentToken}`);
      }
      headers.set('Content-Type', 'application/json');

      const response = await fetch(url, { ...options, headers });
      if (response.status === 401) {
        localStorage.removeItem('nayeem_desk_token');
        setToken(null);
        setUser(null);
      }
      return response;
    },
    [token]
  );

  // Check auth session
  useEffect(() => {
    let isMounted = true;
    const checkSession = async () => {
      const storedToken = localStorage.getItem('nayeem_desk_token');
      if (!storedToken) {
        if (isMounted) setIsAuthChecking(false);
        return;
      }

      try {
        const res = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${storedToken}` },
        });
        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            setUser({ username: data.username, name: data.name, role: data.role });
            setToken(storedToken);
          }
        } else {
          localStorage.removeItem('nayeem_desk_token');
          if (isMounted) {
            setToken(null);
            setUser(null);
          }
        }
      } catch (err) {
        console.warn('Session check warning:', err);
        localStorage.removeItem('nayeem_desk_token');
        if (isMounted) {
          setToken(null);
          setUser(null);
        }
      } finally {
        if (isMounted) setIsAuthChecking(false);
      }
    };
    checkSession();
    return () => {
      isMounted = false;
    };
  }, []);

  // Fetch complete data
  const loadDashboardData = useCallback(async (silent = false) => {
    const currentToken = token || localStorage.getItem('nayeem_desk_token');
    if (!currentToken || isAuthChecking) return;
    if (!silent) {
      setIsRefreshing(true);
    }
    try {
      const [
        statsRes,
        contactsRes,
        messagesRes,
        pendingRes,
        kbRes,
        settingsRes,
        memoriesRes,
        integrationsRes,
        auditRes,
      ] = await Promise.all([
        authFetch('/api/dashboard/stats').then((r) => (r.ok ? r.json() : null)),
        authFetch('/api/contacts').then((r) => (r.ok ? r.json() : [])),
        authFetch('/api/messages').then((r) => (r.ok ? r.json() : [])),
        authFetch('/api/pending').then((r) => (r.ok ? r.json() : [])),
        authFetch('/api/knowledge').then((r) => (r.ok ? r.json() : [])),
        authFetch('/api/settings').then((r) => (r.ok ? r.json() : null)),
        authFetch('/api/memories').then((r) => (r.ok ? r.json() : [])),
        authFetch('/api/integrations/status').then((r) => (r.ok ? r.json() : [])),
        authFetch('/api/audit-logs').then((r) => (r.ok ? r.json() : [])),
      ]);

      if (statsRes?.stats) setStats(statsRes.stats);
      if (contactsRes) setContacts(contactsRes);
      if (messagesRes) setMessages(messagesRes);
      if (pendingRes) setPendingReplies(pendingRes);
      if (kbRes) setKnowledgeItems(kbRes);
      if (settingsRes) setSettings(settingsRes);
      if (memoriesRes) setMemories(memoriesRes);
      if (integrationsRes) setIntegrations(integrationsRes);
      if (auditRes) setAuditLogs(auditRes);
    } catch (err) {
      console.warn('[Dashboard Load Notice]:', err);
    } finally {
      if (!silent) {
        setIsRefreshing(false);
      }
    }
  }, [authFetch, token, isAuthChecking]);

  useEffect(() => {
    if (!token || isAuthChecking || !user) return;

    // Initial explicit load
    loadDashboardData(false);

    // Continuous real-time background sync every 3.5s
    const timer = setInterval(() => {
      loadDashboardData(true);
    }, 3500);

    // Trigger sync on tab focus
    const onFocus = () => {
      loadDashboardData(true);
    };
    window.addEventListener('focus', onFocus);

    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [token, isAuthChecking, user, loadDashboardData]);

  const handleLoginSuccess = (newToken: string, loggedUser: any) => {
    setToken(newToken);
    setUser(loggedUser);
  };

  const handleLogout = async () => {
    try {
      await authFetch('/api/auth/logout', { method: 'POST' });
    } catch (err) {
      console.error(err);
    } finally {
      localStorage.removeItem('nayeem_desk_token');
      setToken(null);
      setUser(null);
    }
  };

  // Actions
  const handleApprove = async (id: string) => {
    await authFetch(`/api/pending/${id}/approve`, { method: 'POST' });
    await loadDashboardData();
  };

  const handleReject = async (id: string, reason?: string) => {
    await authFetch(`/api/pending/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
    await loadDashboardData();
  };

  const handleEditAndSend = async (id: string, text: string) => {
    await authFetch(`/api/pending/${id}/edit`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    });
    await loadDashboardData();
  };

  const handleRegenerate = async (id: string, guidance?: string) => {
    await authFetch(`/api/pending/${id}/regenerate`, {
      method: 'POST',
      body: JSON.stringify({ guidance }),
    });
    await loadDashboardData();
  };

  const handleSendMessage = async (contactId: string, text: string) => {
    const res = await authFetch('/api/messages/send', {
      method: 'POST',
      body: JSON.stringify({ contactId, text }),
    });
    await loadDashboardData(true);
    return res.json();
  };

  const handleUpdateContactMode = async (contactId: string, mode: any) => {
    await authFetch(`/api/contacts/${contactId}/mode`, {
      method: 'POST',
      body: JSON.stringify({ mode }),
    });
    await loadDashboardData(true);
  };

  const handleMarkContactRead = async (contactId: string) => {
    await authFetch(`/api/contacts/${contactId}/mark-read`, {
      method: 'POST',
    });
    await loadDashboardData(true);
  };

  const handleToggleAutomation = async () => {
    if (!settings) return;
    const updated = await authFetch('/api/settings', {
      method: 'PUT',
      body: JSON.stringify({ autoReplyEnabled: !settings.autoReplyEnabled }),
    }).then((r) => r.json());
    setSettings(updated);
    setStats((prev) => ({ ...prev, autoReplyEnabled: updated.autoReplyEnabled }));
  };

  const handleSaveKnowledge = async (item: Partial<KnowledgeItem>) => {
    if (item.id) {
      await authFetch(`/api/knowledge/${item.id}`, {
        method: 'PUT',
        body: JSON.stringify(item),
      });
    } else {
      await authFetch('/api/knowledge', {
        method: 'POST',
        body: JSON.stringify(item),
      });
    }
    await loadDashboardData();
  };

  const handleDeleteKnowledge = async (id: string) => {
    await authFetch(`/api/knowledge/${id}`, { method: 'DELETE' });
    await loadDashboardData();
  };

  const handleResetKnowledgeDefaults = async () => {
    await authFetch('/api/knowledge/reset-defaults', { method: 'POST' });
    await loadDashboardData();
  };

  const handleSaveSettings = async (updates: Partial<AISettings>) => {
    const updated = await authFetch('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(updates),
    }).then((r) => r.json());
    setSettings(updated);
    setStats((prev) => ({ ...prev, autoReplyEnabled: updated.autoReplyEnabled }));
  };

  const handleAddMemory = async (contactId: string, memoryType: string, memoryText: string) => {
    await authFetch('/api/memories', {
      method: 'POST',
      body: JSON.stringify({ contactId, memoryType, memoryText }),
    });
    await loadDashboardData();
  };

  const handleUpdateMemory = async (id: string, memoryText: string, verified: boolean) => {
    await authFetch(`/api/memories/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ memoryText, verified }),
    });
    await loadDashboardData();
  };

  const handleDeleteMemory = async (id: string) => {
    await authFetch(`/api/memories/${id}`, { method: 'DELETE' });
    await loadDashboardData();
  };

  const handleClearContactMemories = async (contactId: string) => {
    await authFetch(`/api/contacts/${contactId}/memories/clear`, { method: 'DELETE' });
    await loadDashboardData();
  };

  if (isAuthChecking) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-zinc-950 text-white font-mono text-xs">
        INITIALIZING NAYEEM AI DESK...
      </div>
    );
  }

  if (!token) {
    return <LoginModal onLoginSuccess={handleLoginSuccess} />;
  }

  const pendingCount = pendingReplies.filter((p) => p.status === 'pending').length;

  return (
    <div className="min-h-screen bg-zinc-100 flex flex-col font-sans text-zinc-900 antialiased selection:bg-zinc-900 selection:text-white">
      <Navbar
        user={user}
        onLogout={handleLogout}
        onRefresh={loadDashboardData}
        isRefreshing={isRefreshing}
        activeErrorsCount={stats.activeErrorsCount}
      />

      <div className="flex-1 flex flex-col md:flex-row">
        <Sidebar
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          pendingCount={pendingCount}
        />

        <main className="flex-1 p-4 md:p-6 overflow-y-auto">
          {activeTab === 'overview' && (
            <OverviewView
              stats={stats}
              integrations={integrations}
              pendingApprovals={pendingReplies.filter((p) => p.status === 'pending')}
              recentMessages={messages.slice(-8).reverse()}
              contacts={contacts}
              onNavigateTab={setActiveTab}
              onApprove={handleApprove}
              onReject={handleReject}
              onToggleAutomation={handleToggleAutomation}
            />
          )}

          {activeTab === 'inbox' && (
            <InboxView
              contacts={contacts}
              messages={messages}
              memories={memories}
              token={token}
              onSendMessage={handleSendMessage}
              onUpdateContactMode={handleUpdateContactMode}
              onMarkContactRead={handleMarkContactRead}
              onAddMemory={async (cid, text) => handleAddMemory(cid, 'user_stated', text)}
            />
          )}

          {activeTab === 'pending' && (
            <PendingApprovalsView
              pendingReplies={pendingReplies}
              onApprove={handleApprove}
              onReject={handleReject}
              onEditAndSend={handleEditAndSend}
              onRegenerate={handleRegenerate}
            />
          )}

          {activeTab === 'simulator' && (
            <SimulatorView
              onSimulationComplete={loadDashboardData}
              onNavigateTab={setActiveTab}
            />
          )}

          {activeTab === 'research' && (
            <ResearchView
              contacts={contacts}
              authFetch={authFetch}
            />
          )}

          {activeTab === 'knowledge' && (
            <KnowledgeBaseView
              items={knowledgeItems}
              onSaveItem={handleSaveKnowledge}
              onDeleteItem={handleDeleteKnowledge}
              onResetDefaults={handleResetKnowledgeDefaults}
              authFetch={authFetch}
              onRefreshKnowledge={loadDashboardData}
            />
          )}

          {activeTab === 'settings' && settings && (
            <AISettingsView
              settings={settings}
              onSaveSettings={handleSaveSettings}
            />
          )}

          {activeTab === 'memory' && (
            <MemoryView
              contacts={contacts}
              memories={memories}
              onAddMemory={handleAddMemory}
              onUpdateMemory={handleUpdateMemory}
              onDeleteMemory={handleDeleteMemory}
              onClearContactMemories={handleClearContactMemories}
            />
          )}

          {activeTab === 'integrations' && (
            <IntegrationsView
              integrations={integrations}
              onRefreshIntegrations={loadDashboardData}
            />
          )}

          {activeTab === 'audit' && <AuditLogsView logs={auditLogs} />}
        </main>
      </div>
    </div>
  );
}
