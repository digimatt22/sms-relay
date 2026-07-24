"use client";

import { useRef } from "react";

type Workspace = {
  id: string;
  name: string;
};

export function WorkspaceSwitcher({
  action,
  currentOrganizationId,
  organizations,
  returnTo
}: {
  action: (formData: FormData) => void | Promise<void>;
  currentOrganizationId: string;
  organizations: Workspace[];
  returnTo: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={action} className="workspace-switcher">
      <input type="hidden" name="returnTo" value={returnTo} />
      <select
        aria-label="Organization"
        name="organizationId"
        defaultValue={currentOrganizationId}
        onChange={() => formRef.current?.requestSubmit()}
        style={{ width: "100%" }}
      >
        {organizations.map((organization) => (
          <option key={organization.id} value={organization.id}>{organization.name}</option>
        ))}
      </select>
    </form>
  );
}
