import { AdminPortal } from "@/components/admin/admin-portal";

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <AdminPortal>{children}</AdminPortal>;
}
