import React from "react";
import { NavLink } from "react-router-dom";
import { Activity, BarChart3, Clock, Hash, Layers, List } from "lucide-react";
import { cn } from "@repo/ui/lib";

interface SidebarProps {
  isOpen: boolean;
  closeSidebar: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ isOpen, closeSidebar }) => {
  const navItems = [
    {
      name: "Dashboard",
      path: "/dashboard",
      icon: <BarChart3 className="h-5 w-5" />,
    },
    { name: "Queues", path: "/queues", icon: <List className="h-5 w-5" /> },
    { name: "Topics", path: "/topics", icon: <Hash className="h-5 w-5" /> },
    {
      name: "Server Metrics",
      path: "/metrics",
      icon: <Activity className="h-5 w-5" />,
    },
  ];

  return (
    <>
      {/* Overlay */}
      <div
        className={cn(
          "fixed inset-0 bg-black/40 backdrop-blur-xs z-20 lg:hidden transition-opacity duration-300",
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none",
        )}
        onClick={closeSidebar}
      />

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed left-0 top-16 bottom-0 w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 z-30 transition-all duration-300 ease-in-out transform",
          isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        <div className="flex flex-col h-full">
          <div className="p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-slate-500 dark:text-slate-400">
                MAIN NAVIGATION
              </h2>
            </div>
          </div>

          <nav className="space-y-1 px-2 flex-1">
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={closeSidebar}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-all duration-200",
                    isActive
                      ? "bg-primary/10 text-primary dark:bg-primary/20"
                      : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800",
                  )
                }
              >
                {item.icon}
                <span>{item.name}</span>
              </NavLink>
            ))}
          </nav>

          <div className="p-4 border-t border-slate-200 dark:border-slate-800">
            <div className="glass-card p-3 space-y-2">
              <h4 className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">
                DASHBOARD NOTES
              </h4>
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-green-500" />
                  <span>Queue metrics</span>
                </div>
                <span className="font-medium">Live</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-blue-500" />
                  <span>Activity history</span>
                </div>
                <span className="font-medium">Demo label when empty</span>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
