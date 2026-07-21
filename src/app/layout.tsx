import type { Metadata } from "next";
import Link from "next/link";
import {
  Bell,
  Building2,
  CircleHelp,
  FileKey2,
  Gauge,
  Inbox,
  KeyRound,
  LayoutDashboard,
  Network,
  RadioTower,
  ScrollText,
  Workflow
} from "lucide-react";
import { auth } from "@/lib/auth";
import { logoutAction, switchOrganizationAction } from "@/app/actions";
import { getCurrentOrganizationId, listOrganizationsForUser } from "@/lib/organizations";
import { normalizeRole } from "@/lib/rbac";
import "./globals.css";

export const metadata: Metadata = {
  title: "RelayHub SMS",
  description: "Admin dashboard for RelayHub SMS"
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const isPlatformAdmin = normalizeRole(session?.user?.role) === "platform_admin";
  const organizations = session?.user
    ? await listOrganizationsForUser(session.user.id, session.user.role)
    : [];
  const currentOrganizationId = session?.user
    ? await getCurrentOrganizationId({ userId: session.user.id, role: session.user.role })
    : null;
  const navGroups = [
    {
      label: "Operations",
      items: [
        { href: "/", label: "Command Center", icon: LayoutDashboard },
        { href: "/messages", label: "Messages", icon: ScrollText },
        { href: "/inbox", label: "Inbox", icon: Inbox },
        { href: "/alerts", label: "Alerts", icon: Bell }
      ]
    },
    {
      label: "Infrastructure",
      items: [
        { href: "/gateways", label: "Gateways", icon: RadioTower },
        ...(isPlatformAdmin ? [{ href: "/routing", label: "Routing", icon: Network }] : []),
        { href: "/logs", label: "Logs", icon: ScrollText }
      ]
    },
    {
      label: isPlatformAdmin ? "Clients" : "Account",
      items: [
        { href: "/organizations", label: isPlatformAdmin ? "Clients" : "Users", icon: Building2 },
        { href: "/clients", label: "API Apps & Keys", icon: KeyRound },
        { href: "/usage", label: "Usage", icon: Gauge },
        ...(isPlatformAdmin ? [{ href: "/account/plan", label: "Plan & Billing", icon: FileKey2 }] : [])
      ]
    }
  ];

  return (
    <html lang="en">
      <body>
        <div className="app-shell">
          {session?.user ? (
            <aside className="sidebar">
              <div>
                <Link className="brand brand-lockup" href="/">
                  <span className="brand-mark"><Workflow size={17} /></span>
                  <span>RelayHub SMS</span>
                </Link>
                <p className="brand-subtitle">SMS relay operations</p>
                {organizations.length > 1 ? (
                  <form action={switchOrganizationAction} className="workspace-switcher">
                    <select
                      aria-label="Organization"
                      name="organizationId"
                      defaultValue={currentOrganizationId || ""}
                      style={{ width: "100%" }}
                    >
                      {organizations.map((organization: any) => (
                        <option key={organization.id} value={organization.id}>{organization.name}</option>
                      ))}
                    </select>
                    <button className="ghost-button subtle-action" type="submit">Switch workspace</button>
                  </form>
                ) : null}
                <nav>
                  {navGroups.map((group) => (
                    <div className="nav-group" key={group.label}>
                      <div className="nav-label">{group.label}</div>
                      {group.items.map((item) => {
                        const Icon = item.icon;
                        return (
                          <Link className="nav-link" href={item.href} key={`${group.label}-${item.label}`}>
                            <Icon size={16} strokeWidth={1.9} />
                            <span>{item.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  ))}
                </nav>
              </div>
              <div className="sidebar-footer">
                <Link className="nav-link support-link" href="/docs">
                  <FileKey2 size={16} />
                  <span>API Docs</span>
                </Link>
                <form action={logoutAction}>
                  <button className="ghost-button sign-out" type="submit">Sign out</button>
                </form>
              </div>
            </aside>
          ) : null}
          <main className={session?.user ? "content" : "content full"}>
            {session?.user ? (
              <div className="topbar">
                <div className="topbar-left">
                  <button className="icon-button" type="button" aria-label="Help"><CircleHelp size={16} /></button>
                  <button className="icon-button" type="button" aria-label="Alerts"><Bell size={16} /></button>
                </div>
                <div className="topbar-user">
                  <span className="avatar">{session.user.name?.slice(0, 2).toUpperCase() || "MW"}</span>
                  <span>
                    <strong>{session.user.name || "Matthew Wood"}</strong>
                    <small>{session.user.role.replace(/_/g, " ")}</small>
                  </span>
                </div>
              </div>
            ) : null}
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
