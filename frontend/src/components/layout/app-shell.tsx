"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Files,
  Menu,
  MessageSquare,
  LogOut,
  FileSpreadsheet,
  User,
  PanelLeftClose,
  PanelLeftOpen,
  PlusCircle,
  RefreshCw,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUIStore } from "@/stores/ui";
import { useAuthStore } from "@/stores/useAuthStore";
import { useConversationStore } from "@/stores/useConversationStore";
import { cn } from "@/lib/utils";

function formatConversationDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return "";
    const now = new Date();
    const isToday =
      date.getDate() === now.getDate() &&
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear();

    if (isToday) {
      return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    }

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday =
      date.getDate() === yesterday.getDate() &&
      date.getMonth() === yesterday.getMonth() &&
      date.getFullYear() === yesterday.getFullYear();

    if (isYesterday) {
      return "Yesterday";
    }

    const daysDiff = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    if (daysDiff < 7) {
      return date.toLocaleDateString([], { weekday: "short" });
    }

    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { sidebarOpen, sidebarCollapsed, toggleSidebar, closeSidebar, toggleSidebarCollapse } = useUIStore();
  const { user, logout, refreshProfile } = useAuthStore();
  const {
    conversations,
    activeId,
    listLoading,
    listError,
    refreshList,
    openConversation,
    newConversation,
    initialize,
  } = useConversationStore();

  const [mounted, setMounted] = useState(false);
  const [recentChatsOpen, setRecentChatsOpen] = useState(true);

  useEffect(() => {
    setMounted(true);
    refreshProfile();
  }, [refreshProfile]);

  useEffect(() => {
    if (user) {
      initialize();
    }
  }, [user, initialize]);

  const handleNewChat = () => {
    newConversation();
    if (sidebarOpen) closeSidebar();
    if (pathname !== "/chat") {
      router.push("/chat");
    }
  };

  const handleSelectConversation = (id: string) => {
    void openConversation(id);
    if (sidebarOpen) closeSidebar();
    if (pathname !== "/chat") {
      router.push(`/chat?conversation=${id}`);
    }
  };

  // If user is not logged in, render clean full-width shell without the sidebar
  if (!mounted || !user) {
    return (
      <div className="min-h-dvh flex flex-col bg-[#faf8f5] dark:bg-[#141210] text-foreground">
        <header className="border-b border-[#e8dfd3] dark:border-[#322b22] bg-white/80 dark:bg-[#1c1916]/80 backdrop-blur-md px-6 py-4 flex items-center justify-between sticky top-0 z-30">
          <Link href="/" className="flex items-center gap-2.5 font-bold text-lg text-[#8c6d3b] dark:text-[#d4af6a]">
            <div className="w-8 h-8 rounded-lg bg-[#96743d] hover:bg-[#83632f] text-white flex items-center justify-center shadow-sm">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <span>AI-Documenter</span>
          </Link>
          <div className="flex items-center gap-3 text-xs">
            <span className="text-[#827566] hidden sm:inline">Intelligent Document RAG</span>
            <Link
              href="/"
              className="px-3 py-1.5 rounded-lg bg-[#96743d] hover:bg-[#83632f] text-white font-medium transition shadow-sm"
            >
              Sign In
            </Link>
          </div>
        </header>
        <main className="flex-1 flex flex-col w-full max-w-6xl mx-auto px-6 py-8">{children}</main>
      </div>
    );
  }

  // Authenticated: ChatGPT / Claude style collapsible sidebar with warm golden-brown accents
  return (
    <div className="min-h-dvh flex bg-[#faf8f5] dark:bg-[#141210] text-foreground overflow-x-hidden">
      {/* Mobile Backdrop */}
      {sidebarOpen && (
        <div
          onClick={closeSidebar}
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 md:hidden animate-fade-in"
        />
      )}

      {/* Collapsible Sidebar */}
      <aside
        id="sidebar"
        className={cn(
          "fixed md:sticky top-0 h-dvh z-50 md:z-20 bg-[#f7f2ea] dark:bg-[#181512] border-r border-[#e8dfd3] dark:border-[#322b22] transition-all duration-300 ease-in-out flex flex-col justify-between shrink-0",
          sidebarOpen ? "left-0 w-64 shadow-2xl" : "-left-64 md:left-0",
          sidebarCollapsed ? "md:w-16" : "md:w-64"
        )}
      >
        {/* Top & Scrollable Middle Section */}
        <div className="flex-1 flex flex-col min-h-0 p-3 overflow-hidden">
          {/* Brand & Collapse Header */}
          <div
            className={cn(
              "flex items-center gap-2 mb-3 px-2 py-1.5 shrink-0",
              sidebarCollapsed ? "justify-center" : "justify-between"
            )}
          >
            {!sidebarCollapsed && (
              <Link href="/" className="flex items-center gap-2 font-bold text-sm text-[#8c6d3b] dark:text-[#d4af6a] truncate">
                <div className="w-7 h-7 rounded-lg bg-[#96743d] text-white flex items-center justify-center shrink-0 shadow-sm">
                  <FileSpreadsheet className="w-4 h-4" />
                </div>
                <span className="truncate">AI-Documenter</span>
              </Link>
            )}

            {/* Desktop Collapse / Expand Button */}
            <button
              onClick={toggleSidebarCollapse}
              className="hidden md:inline-flex p-1.5 rounded-lg text-[#827566] hover:text-[#4a3b26] dark:hover:text-[#f3eee7] hover:bg-[#ede3d4] dark:hover:bg-[#27221b] transition cursor-pointer"
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {sidebarCollapsed ? <PanelLeftOpen className="w-5 h-5" /> : <PanelLeftClose className="w-5 h-5" />}
            </button>

            {/* Mobile Close Button */}
            <button
              onClick={closeSidebar}
              className="md:hidden p-1.5 rounded-lg text-[#827566] hover:bg-[#ede3d4]"
              aria-label="Close sidebar"
            >
              <PanelLeftClose className="w-5 h-5" />
            </button>
          </div>

          {/* Quick Action Button: New Chat */}
          <button
            onClick={handleNewChat}
            className={cn(
              "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-xs font-semibold bg-[#96743d] hover:bg-[#83632f] text-white shadow-sm transition mb-3 w-full cursor-pointer shrink-0",
              sidebarCollapsed ? "justify-center px-0" : ""
            )}
            title="New Chat"
          >
            <PlusCircle className="w-4 h-4 shrink-0" />
            {!sidebarCollapsed && <span className="truncate font-semibold">New Chat</span>}
          </button>

          {/* Main Navigation & Nested Recent Chats */}
          <nav aria-label="Main navigation" className="flex-1 flex flex-col min-h-0 space-y-1 overflow-hidden">
            {/* Chat Nav Item & Sub-list */}
            <div className="flex flex-col min-h-0">
              <div
                className={cn(
                  "flex items-center rounded-lg text-xs font-medium transition text-[#5e5141] dark:text-[#c4b5a3] hover:bg-[#ede3d4] dark:hover:bg-[#252019] group",
                  pathname === "/chat" && "bg-[#eddcc2]/70 dark:bg-[#342a1d] text-[#63491f] dark:text-[#e4c48b] font-semibold shadow-xs",
                  sidebarCollapsed ? "justify-center" : "justify-between pr-1"
                )}
              >
                <Link
                  href="/chat"
                  onClick={() => {
                    if (sidebarOpen) closeSidebar();
                  }}
                  className={cn(
                    "flex items-center gap-3 py-2 flex-1 min-w-0",
                    sidebarCollapsed ? "justify-center px-0 w-full" : "px-3"
                  )}
                  title={conversations.length > 0 ? `Chat (${conversations.length} recent)` : "Chat"}
                >
                  <MessageSquare className="w-4 h-4 shrink-0" aria-hidden="true" />
                  {!sidebarCollapsed && <span className="truncate">Chat</span>}
                </Link>

                {/* Sub-menu toggle chevron (only when expanded) */}
                {!sidebarCollapsed && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setRecentChatsOpen((prev) => !prev);
                    }}
                    className="p-1 rounded-md text-[#827566] hover:text-[#4a3b26] dark:hover:text-[#f3eee7] hover:bg-[#e4d8c7] dark:hover:bg-[#32271a] transition cursor-pointer"
                    title={recentChatsOpen ? "Collapse recent chats" : "Expand recent chats"}
                    aria-label={recentChatsOpen ? "Collapse recent chats" : "Expand recent chats"}
                  >
                    <ChevronDown
                      className={cn(
                        "w-3.5 h-3.5 transition-transform duration-200",
                        !recentChatsOpen && "-rotate-90"
                      )}
                    />
                  </button>
                )}
              </div>

              {/* Recent Chats Nested List under Chat */}
              {!sidebarCollapsed && recentChatsOpen && (
                <div className="flex-1 flex flex-col min-h-0 mt-1 mb-2 ml-2 pl-2 border-l border-[#e8dfd3] dark:border-[#322b22]">
                  {/* Recent Chats Sub-header */}
                  <div className="flex items-center justify-between px-2 py-1 text-[11px] font-semibold tracking-wider text-[#827566] dark:text-[#a89b8c] uppercase shrink-0">
                    <span className="flex items-center gap-1.5">
                      <span>Recent</span>
                      {conversations.length > 0 && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-[#ede3d4] dark:bg-[#2e261c] text-[#7a5d30] dark:text-[#d4af6a] font-normal">
                          {conversations.length}
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void refreshList();
                      }}
                      disabled={listLoading}
                      title="Refresh chats"
                      className="p-1 rounded text-[#827566] hover:text-[#4a3b26] dark:hover:text-[#f3eee7] hover:bg-[#ede3d4] dark:hover:bg-[#27221b] transition disabled:opacity-40 cursor-pointer"
                    >
                      <RefreshCw className={cn("w-3 h-3", listLoading && "animate-spin")} />
                    </button>
                  </div>

                  {/* Conversations List Scrollable Container */}
                  <div className="flex-1 overflow-y-auto max-h-[calc(100dvh-380px)] space-y-0.5 pr-1 custom-scrollbar">
                    {listLoading && conversations.length === 0 && (
                      <div className="space-y-1.5 py-1 px-2">
                        <div className="h-6 rounded bg-[#ede3d4]/60 dark:bg-[#252019] animate-pulse" />
                        <div className="h-6 rounded bg-[#ede3d4]/40 dark:bg-[#252019]/70 animate-pulse" />
                        <div className="h-6 rounded bg-[#ede3d4]/30 dark:bg-[#252019]/40 animate-pulse" />
                      </div>
                    )}

                    {listError && (
                      <div className="px-2 py-1.5 text-xs text-red-600">
                        <p className="truncate text-[11px]">{listError}</p>
                        <button
                          onClick={() => void refreshList()}
                          className="underline text-[10px] text-[#96743d] hover:text-[#7a5d30] mt-0.5 cursor-pointer"
                        >
                          Retry
                        </button>
                      </div>
                    )}

                    {!listLoading && !listError && conversations.length === 0 && (
                      <p className="px-2 py-2 text-[11px] text-[#827566] dark:text-[#a89b8c] italic">
                        No recent chats yet
                      </p>
                    )}

                    {conversations.map((conv) => {
                      const isActive = pathname === "/chat" && activeId === conv.id;
                      return (
                        <button
                          key={conv.id}
                          onClick={() => handleSelectConversation(conv.id)}
                          title={conv.title}
                          className={cn(
                            "w-full text-left rounded-lg px-2 py-1.5 text-xs transition flex items-center gap-2 group cursor-pointer",
                            isActive
                              ? "bg-[#eeddc4] dark:bg-[#342a1d] text-[#63491f] dark:text-[#e4c48b] font-semibold shadow-2xs"
                              : "text-[#5e5141] dark:text-[#c4b5a3] hover:bg-[#ede3d4]/70 dark:hover:bg-[#252019] hover:text-[#2a241e] dark:hover:text-[#f3eee7]"
                          )}
                        >
                          <MessageSquare
                            className={cn(
                              "w-3.5 h-3.5 shrink-0 transition",
                              isActive
                                ? "text-[#96743d] dark:text-[#d4af6a]"
                                : "text-[#a89b8c] group-hover:text-[#6e5d48]"
                            )}
                          />
                          <span className="truncate flex-1 min-w-0 text-[11px]">
                            {conv.title}
                          </span>
                          <span className="text-[10px] text-[#a89b8c] shrink-0 font-normal opacity-70 group-hover:opacity-100">
                            {formatConversationDate(conv.updated_at)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Documents Navigation Item */}
            <Link
              href="/documents"
              onClick={() => {
                if (sidebarOpen) closeSidebar();
              }}
              aria-current={pathname === "/documents" ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-xs font-medium transition text-[#5e5141] dark:text-[#c4b5a3] hover:bg-[#ede3d4] dark:hover:bg-[#252019] shrink-0",
                pathname === "/documents" && "bg-[#eddcc2]/70 dark:bg-[#342a1d] text-[#63491f] dark:text-[#e4c48b] font-semibold shadow-xs",
                sidebarCollapsed && "justify-center px-0"
              )}
              title="Documents"
            >
              <Files className="w-4 h-4 shrink-0" aria-hidden="true" />
              {!sidebarCollapsed && <span className="truncate">Documents</span>}
            </Link>
          </nav>
        </div>

        {/* Bottom User Profile Section */}
        <div className="p-3 border-t border-[#e8dfd3] dark:border-[#322b22] shrink-0">
          <div
            className={cn(
              "flex items-center gap-2 rounded-xl p-2 bg-white dark:bg-[#1f1b17] border border-[#e8dfd3] dark:border-[#322b22] shadow-sm",
              sidebarCollapsed ? "justify-center p-2" : "justify-between"
            )}
          >
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="w-7 h-7 rounded-full bg-[#f4ebd9] dark:bg-[#32281a] text-[#8c6d3b] dark:text-[#d4af6a] flex items-center justify-center shrink-0">
                <User className="w-3.5 h-3.5" />
              </div>
              {!sidebarCollapsed && (
                <div className="truncate text-xs leading-tight">
                  <p className="font-semibold text-[#2a241e] dark:text-[#f3eee7] truncate">{user.username}</p>
                  <p className="text-[#827566] truncate text-[11px]">{user.email}</p>
                </div>
              )}
            </div>

            {!sidebarCollapsed && (
              <button
                onClick={() => void logout()}
                className="text-[#827566] hover:text-red-600 transition p-1.5 rounded-md hover:bg-[#f5efe6] dark:hover:bg-[#2b241c] cursor-pointer"
                title="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>

          {sidebarCollapsed && (
            <button
              onClick={() => void logout()}
              className="mt-2 w-full flex justify-center p-2 text-[#827566] hover:text-red-600 rounded-lg hover:bg-[#ede3d4] dark:hover:bg-[#252019] transition cursor-pointer"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </aside>

      {/* Main Workspace Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile Top Bar */}
        <header className="flex items-center justify-between border-b border-[#e8dfd3] dark:border-[#322b22] p-3 md:hidden bg-white/80 dark:bg-[#1c1916]/80 backdrop-blur-md sticky top-0 z-30">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            aria-label="Toggle navigation"
            aria-expanded={sidebarOpen}
          >
            <Menu className="w-5 h-5 text-[#8c6d3b]" />
          </Button>
          <div className="flex items-center gap-2 font-bold text-sm text-[#8c6d3b] dark:text-[#d4af6a]">
            <FileSpreadsheet className="w-4 h-4" />
            <span>AI-Documenter</span>
          </div>
          <div className="w-7 h-7 rounded-full bg-[#f4ebd9] text-[#8c6d3b] flex items-center justify-center text-xs font-semibold">
            {user.username.charAt(0).toUpperCase()}
          </div>
        </header>

        <main
          id="main"
          className={cn(
            "flex-1 w-full min-w-0",
            pathname === "/chat"
              ? "h-[calc(100dvh-3.5rem)] md:h-dvh flex flex-col p-3 sm:p-5 md:p-6 overflow-hidden"
              : "max-w-5xl mx-auto p-4 sm:p-6 md:p-8"
          )}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
