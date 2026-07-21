import Link from "next/link";
import { Building2 } from "lucide-react";
import { createOrganizationAction } from "@/app/actions";
import { requireRolePage } from "@/lib/page-auth";

export default async function NewClientPage() {
  await requireRolePage("org_admin");

  return (
    <>
      <header className="page-header">
        <div>
          <p className="muted"><Link href="/organizations">Back to Clients</Link></p>
          <h1>Create Client</h1>
          <p>Create a tenant account. Users and API apps are managed after the client exists.</p>
        </div>
      </header>

      <section className="panel">
        <form className="form" action={createOrganizationAction}>
          <div className="field">
            <label htmlFor="name">Client name</label>
            <input id="name" name="name" required placeholder="Acme Alerts" />
          </div>
          <button className="primary" type="submit"><Building2 size={16} />Create client</button>
        </form>
      </section>
    </>
  );
}
