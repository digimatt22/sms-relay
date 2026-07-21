"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { signIn, signOut, auth } from "@/lib/auth";
import { cancelMessage, createMessage, requeueMessage } from "@/lib/messages";
import { messageCreateSchema, gatewayCreateSchema, gatewayUpdateSchema, apiClientCreateSchema } from "@/lib/validation";
import { SUPPORTED_GATEWAY_CARRIERS, SUPPORTED_GATEWAY_HARDWARE } from "@/lib/gateway-options";
import { createGatewayKey, gatewayKeyPrefix, hashGatewayKey, hashPassword, verifyPassword } from "@/lib/security";
import { query, transaction } from "@/lib/db";
import {
  createApiClient,
  createApiClientKey,
  disableApiClient,
  enableApiClient,
  rotateApiClientKey,
  updateApiClientLimits
} from "@/lib/api-clients";
import { processPendingCallbackDeliveries, retryCallbackDelivery } from "@/lib/callbacks";
import { generateOperationalAlerts, resolveAlert } from "@/lib/alerts";
import { runMaintenanceJobs } from "@/lib/maintenance";
import { enableGateway, markGatewayMaintenance, requestGatewayCommand } from "@/lib/gateways";
import {
  createDashboardUser,
  acceptUserInvitation,
  createOrganization,
  createUserInvitation,
  ensureDefaultGatewayPool,
  getCurrentOrganizationId,
  removeOrganizationMembership,
  setCurrentOrganizationId,
  upsertOrganizationMembership
} from "@/lib/organizations";
import { hasRole, type Role } from "@/lib/rbac";
import { getAccountContext, accountHasRole } from "@/lib/account-context";
import { assertPlanCapacity } from "@/lib/plans";
import { mustChangePassword } from "@/lib/passwords";
import { getGatewayAccessLevel, hasGatewayAccessLevel } from "@/lib/gateway-access";
import { normalizePhoneNumber } from "@/lib/phone";
import { requestPasswordReset, resetPasswordWithCode } from "@/lib/password-resets";
import { requestMobileVerification, requestMobileVerificationForEmail, verifyMobileCode } from "@/lib/mobile-verification";

function redirectWithMessage(path: string, message: string): never {
  const separator = path.includes("?") ? "&" : "?";
  redirect(`${path}${separator}error=${encodeURIComponent(message)}`);
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

async function requireActionRole(minimumRole: Role) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (await mustChangePassword(session.user.id)) redirect("/change-password");
  if (!hasRole(session, minimumRole)) redirect("/messages");
  return session;
}

async function requireAccountActionRole(minimumRole: Role) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (await mustChangePassword(session.user.id)) redirect("/change-password");
  const account = await getAccountContext(session);
  if (!accountHasRole(account, minimumRole)) redirect("/messages");
  return { session, account };
}

async function requireGatewayActionAccess(gatewayId: string, minimumRole: Role) {
  const { session, account } = await requireAccountActionRole(minimumRole);
  const accessLevel = await getGatewayAccessLevel({
    gatewayId,
    organizationId: account.organizationId,
    isPlatformAdmin: account.isPlatformAdmin
  });
  if (!hasGatewayAccessLevel(accessLevel, "manage")) redirect("/gateways");
  return { session, account };
}

export async function loginAction(_previousState: string | null, formData: FormData) {
  try {
    await signIn("credentials", {
      email: String(formData.get("email") || ""),
      password: String(formData.get("password") || ""),
      redirectTo: "/auth/continue"
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return "Invalid email or password";
    }
    throw error;
  }
  return null;
}

export async function requestPasswordResetAction(formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  if (email && email.includes("@")) {
    await requestPasswordReset(email);
  }
  redirect(`/reset-password?sent=1&email=${encodeURIComponent(email)}`);
}

export async function resetPasswordAction(formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const code = String(formData.get("code") || "").trim();
  const password = String(formData.get("password") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");
  const returnPath = `/reset-password?email=${encodeURIComponent(email)}`;
  if (!/^\d{6}$/.test(code)) redirectWithMessage(returnPath, "Enter the six-digit reset code");
  if (password.length < 12) redirectWithMessage(returnPath, "Use at least 12 characters for your new password");
  if (password !== confirmPassword) redirectWithMessage(returnPath, "Passwords do not match");

  const reset = await resetPasswordWithCode({ email, code, password });
  if (!reset) redirectWithMessage(returnPath, "Reset code is invalid, expired, or has too many attempts");
  redirect("/login?passwordReset=1");
}

export async function resendMobileVerificationAction(formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  if (email && email.includes("@")) await requestMobileVerificationForEmail(email);
  redirect(`/verify-mobile?sent=1&email=${encodeURIComponent(email)}`);
}

export async function verifyMobileAction(formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const code = String(formData.get("code") || "").trim();
  const returnPath = `/verify-mobile?email=${encodeURIComponent(email)}`;
  if (!/^\d{6}$/.test(code)) redirectWithMessage(returnPath, "Enter the six-digit verification code");
  if (!(await verifyMobileCode({ email, code }))) {
    redirectWithMessage(returnPath, "Verification code is invalid, expired, or has too many attempts");
  }
  redirect("/login?mobileVerified=1");
}

export async function changeRequiredPasswordAction(_previousState: string | null, formData: FormData) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const password = String(formData.get("password") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");
  if (password.length < 12) return "Use at least 12 characters for your new password";
  if (password !== confirmPassword) return "Passwords do not match";

  const result = await query<{ password_hash: string; must_change_password: boolean }>(
    "SELECT password_hash, must_change_password FROM admin_users WHERE id = $1",
    [session.user.id]
  );
  const user = result.rows[0];
  if (!user) redirect("/login");
  if (!user.must_change_password) redirect("/messages");
  if (verifyPassword(password, user.password_hash)) return "Choose a password different from your temporary password";

  await query(
    `UPDATE admin_users
        SET password_hash = $1,
            must_change_password = false,
            password_changed_at = now(),
            updated_at = now()
      WHERE id = $2
        AND must_change_password = true`,
    [hashPassword(password), session.user.id]
  );
  await signOut({ redirectTo: "/login?passwordChanged=1" });
  return null;
}

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}

export async function switchOrganizationAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const organizationId = String(formData.get("organizationId") || "");
  if (organizationId) {
    await setCurrentOrganizationId(organizationId);
  }
  redirect("/messages");
}

export async function createOrganizationAction(formData: FormData) {
  const session = await requireActionRole("org_admin");

  const name = String(formData.get("name") || "").trim();
  if (!name) redirect("/organizations");

  const organization = await createOrganization({
    name,
    slug: slugify(name),
    userId: session.user.role === "platform_admin" ? null : session.user.id
  });
  if (session.user.role !== "platform_admin") {
    await setCurrentOrganizationId(organization.id);
  }
  revalidatePath("/organizations");
  redirect("/organizations");
}

export async function createDashboardUserAction(formData: FormData) {
  const { account } = await requireAccountActionRole("org_admin");

  const email = String(formData.get("email") || "").trim().toLowerCase();
  const name = String(formData.get("name") || "").trim();
  const mobileNumber = String(formData.get("mobileNumber") || "");
  const password = String(formData.get("password") || "");
  const role = String(formData.get("role") || "viewer");
  const requestedOrganizationId = String(formData.get("organizationId") || "");
  const organizationId = account.isPlatformAdmin ? requestedOrganizationId : account.organizationId;
  if (!email || !password || !mobileNumber || !organizationId) redirect("/organizations");
  if (role === "platform_admin") redirect("/organizations");

  const user = await createDashboardUser({ email, name, mobileNumber, password, role });
  await upsertOrganizationMembership({ organizationId, userId: user.id, role });
  await requestMobileVerification(user.id, organizationId);
  revalidatePath("/organizations");
  redirect(`/verify-mobile?sent=1&email=${encodeURIComponent(email)}`);
}

export async function createUserInvitationAction(formData: FormData) {
  const { session, account } = await requireAccountActionRole("org_admin");

  const email = String(formData.get("email") || "").trim().toLowerCase();
  const name = String(formData.get("name") || "").trim();
  const role = String(formData.get("role") || "viewer");
  const requestedOrganizationId = String(formData.get("organizationId") || "");
  const organizationId = account.isPlatformAdmin ? requestedOrganizationId : account.organizationId;
  const returnTo = String(formData.get("returnTo") || "/organizations");
  if (!email || !organizationId || role === "platform_admin") redirect("/organizations");
  try {
    await assertPlanCapacity(organizationId, account.plan, "user");
  } catch (error) {
    redirectWithMessage(returnTo, error instanceof Error ? error.message : "Account user limit exceeded");
  }

  const { token } = await createUserInvitation({
    organizationId,
    email,
    name,
    role,
    invitedByUserId: session.user.id
  });
  revalidatePath("/organizations");
  redirect(`${returnTo}?inviteToken=${encodeURIComponent(token)}`);
}

export async function resendUserInvitationAction(formData: FormData) {
  const { session, account } = await requireAccountActionRole("org_admin");

  const invitationId = String(formData.get("invitationId") || "");
  if (!invitationId) redirect("/organizations");

  const existing = await query(
    `SELECT organization_id, email, name, role
       FROM user_invitations
      WHERE id = $1
        AND status = 'pending'`,
    [invitationId]
  );
  const invitation = existing.rows[0];
  if (!invitation || (!account.isPlatformAdmin && invitation.organization_id !== account.organizationId)) {
    redirect("/organizations");
  }

  const { token } = await createUserInvitation({
    organizationId: invitation.organization_id,
    email: invitation.email,
    name: invitation.name,
    role: invitation.role,
    invitedByUserId: session.user.id
  });

  revalidatePath("/organizations");
  redirect(`/organizations?inviteToken=${encodeURIComponent(token)}`);
}

export async function revokeUserInvitationAction(formData: FormData) {
  const { account } = await requireAccountActionRole("org_admin");

  const invitationId = String(formData.get("invitationId") || "");
  if (!invitationId) redirect("/organizations");

  await query(
    `UPDATE user_invitations
        SET status = 'revoked',
            revoked_at = now(),
            updated_at = now()
      WHERE id = $1
        AND status = 'pending'
        AND ($2::boolean = true OR organization_id = $3)`,
    [invitationId, account.isPlatformAdmin, account.organizationId]
  );

  revalidatePath("/organizations");
  redirect("/organizations");
}

export async function acceptUserInvitationAction(formData: FormData) {
  const token = String(formData.get("token") || "");
  const mobileNumberRaw = String(formData.get("mobileNumber") || "");
  const password = String(formData.get("password") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");
  if (!token) redirect("/login");
  let mobileNumber: string;
  try {
    mobileNumber = normalizePhoneNumber(mobileNumberRaw);
  } catch (error) {
    redirect(`/invitations/${encodeURIComponent(token)}?error=${encodeURIComponent(error instanceof Error ? error.message : "Mobile number is invalid")}`);
  }
  if (password.length < 12) redirect(`/invitations/${encodeURIComponent(token)}?error=Password%20must%20be%20at%20least%2012%20characters`);
  if (password !== confirmPassword) redirect(`/invitations/${encodeURIComponent(token)}?error=Passwords%20do%20not%20match`);

  const accepted = await acceptUserInvitation({ token, mobileNumber, password });
  if (!accepted) redirect(`/invitations/${encodeURIComponent(token)}?error=Invitation%20is%20invalid%20or%20expired`);
  await requestMobileVerification(accepted.user.id, accepted.invitation.organization_id);
  redirect(`/verify-mobile?sent=1&email=${encodeURIComponent(accepted.user.email)}`);
}

export async function updateOrganizationMembershipAction(formData: FormData) {
  const { account } = await requireAccountActionRole("org_admin");

  const organizationId = String(formData.get("organizationId") || "");
  const userId = String(formData.get("userId") || "");
  const role = String(formData.get("role") || "viewer");
  if (!organizationId || !userId) redirect("/organizations");
  if (!account.isPlatformAdmin && organizationId !== account.organizationId) redirect("/organizations");
  if (role === "platform_admin") redirect("/organizations");

  await upsertOrganizationMembership({ organizationId, userId, role });
  revalidatePath("/organizations");
  redirect("/organizations");
}

export async function updateClientUserAction(formData: FormData) {
  const { session, account } = await requireAccountActionRole("org_admin");
  const membershipId = String(formData.get("membershipId") || "");
  const organizationId = String(formData.get("organizationId") || "");
  const userId = String(formData.get("userId") || "");
  const name = String(formData.get("name") || "").trim();
  const requestedRole = String(formData.get("role") || "viewer");
  const requestedStatus = String(formData.get("status") || "active");
  const password = String(formData.get("password") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");
  const returnPath = `/organizations/users/${encodeURIComponent(membershipId)}/edit`;
  if (!membershipId || !organizationId || !userId || !name) redirect("/organizations");
  if (!account.isPlatformAdmin && organizationId !== account.organizationId) redirect("/organizations");
  if (!["org_admin", "operator", "viewer"].includes(requestedRole)) redirectWithMessage(returnPath, "Role is invalid");
  if (!["active", "disabled"].includes(requestedStatus)) redirectWithMessage(returnPath, "Status is invalid");
  if (password && password.length < 12) redirectWithMessage(returnPath, "Temporary password must be at least 12 characters");
  if (password !== confirmPassword) redirectWithMessage(returnPath, "Passwords do not match");

  const existing = await query<{ user_id: string; role: string }>(
    `SELECT m.user_id, m.role
       FROM organization_memberships m
       JOIN admin_users u ON u.id = m.user_id
      WHERE m.id = $1
        AND m.organization_id = $2
        AND m.user_id = $3
        AND m.role <> 'platform_admin'
        AND u.role NOT IN ('platform_admin', 'admin')`,
    [membershipId, organizationId, userId]
  );
  if (!existing.rows[0]) redirect("/organizations");

  const editingSelf = userId === session.user.id && !account.isPlatformAdmin;
  const role = editingSelf ? existing.rows[0].role : requestedRole;
  const status = editingSelf ? "active" : requestedStatus;
  await transaction(async (db) => {
    await db.query(
      `UPDATE organization_memberships
          SET role = $1,
              status = $2,
              updated_at = now()
        WHERE id = $3
          AND organization_id = $4
          AND user_id = $5`,
      [role, status, membershipId, organizationId, userId]
    );
    if (password) {
      await db.query(
        `UPDATE admin_users
            SET name = $1,
                password_hash = $2,
                must_change_password = true,
                password_changed_at = NULL,
                updated_at = now()
          WHERE id = $3`,
        [name, hashPassword(password), userId]
      );
    } else {
      await db.query("UPDATE admin_users SET name = $1, updated_at = now() WHERE id = $2", [name, userId]);
    }
  });
  revalidatePath("/organizations");
  redirect("/organizations");
}

export async function removeOrganizationMembershipAction(formData: FormData) {
  const { account } = await requireAccountActionRole("org_admin");

  const organizationId = String(formData.get("organizationId") || "");
  const userId = String(formData.get("userId") || "");
  if (!organizationId || !userId) redirect("/organizations");
  if (!account.isPlatformAdmin && organizationId !== account.organizationId) redirect("/organizations");

  await removeOrganizationMembership({ organizationId, userId });
  revalidatePath("/organizations");
  redirect("/organizations");
}

export async function createMessageAction(formData: FormData) {
  const { session, account } = await requireAccountActionRole("operator");

  let metadata: Record<string, unknown> = {};
  const metadataRaw = String(formData.get("metadata") || "").trim();
  if (metadataRaw) {
    try {
      metadata = JSON.parse(metadataRaw) as Record<string, unknown>;
    } catch {
      redirectWithMessage("/messages/new", "Metadata must be valid JSON");
    }
  }

  const scheduledAtRaw = String(formData.get("scheduledAt") || "").trim();
  const scheduledAtDate = scheduledAtRaw ? new Date(scheduledAtRaw) : null;
  if (scheduledAtDate && Number.isNaN(scheduledAtDate.getTime())) {
    redirectWithMessage("/messages/new", "Scheduled date is invalid");
  }
  const scheduledAt = scheduledAtDate ? scheduledAtDate.toISOString() : null;

  const parsed = messageCreateSchema.safeParse({
    to: formData.get("to"),
    body: formData.get("body"),
    priority: formData.get("priority") || 100,
    scheduledAt,
    idempotencyKey: String(formData.get("idempotencyKey") || "") || null,
    metadata,
    callbackUrl: String(formData.get("callbackUrl") || "") || null
  });
  if (!parsed.success) {
    const firstError = parsed.error.issues[0]?.message || "Message input is invalid";
    redirectWithMessage("/messages/new", firstError);
  }

  let message;
  const organizationId = account.organizationId;
  try {
    await assertPlanCapacity(organizationId, account.plan, "message");
    if (parsed.data.callbackUrl) {
      await assertPlanCapacity(organizationId, account.plan, "callback");
    }
    message = await createMessage({
      ...parsed.data,
      userId: session.user.id,
      organizationId
    });
  } catch (error) {
    redirectWithMessage("/messages/new", error instanceof Error ? error.message : "Message could not be created");
  }
  redirect(`/messages/${message.id}`);
}

export async function createGatewayAction(formData: FormData) {
  const { session, account } = await requireAccountActionRole("org_admin");

  const parsed = gatewayCreateSchema.parse({
    name: formData.get("name"),
    hardwareType: formData.get("hardwareType") || SUPPORTED_GATEWAY_HARDWARE[0].value,
    carrier: formData.get("carrier") || SUPPORTED_GATEWAY_CARRIERS[0].value,
    visibility: formData.get("visibility") || (account.isPlatformAdmin ? "shared" : "client_owned")
  });

  const apiKey = createGatewayKey();
  const hashedKey = hashGatewayKey(apiKey);
  const prefix = gatewayKeyPrefix(apiKey);
  const organizationId = account.organizationId;
  try {
    if (parsed.visibility === "client_owned") {
      await assertPlanCapacity(organizationId, account.plan, "gateway");
    }
  } catch (error) {
    redirectWithMessage("/gateways", error instanceof Error ? error.message : "Gateway limit exceeded");
  }
  const defaultGatewayPoolId = await ensureDefaultGatewayPool(organizationId);
  const gateway = await transaction(async (db) => {
    const result = await db.query<{ id: string }>(
      `INSERT INTO gateways (
         organization_id, owner_organization_id, visibility, name, hardware_type, carrier, apn_profile, api_key_hash, api_key_prefix
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        organizationId,
        parsed.visibility === "client_owned" ? organizationId : null,
        parsed.visibility,
        parsed.name,
        parsed.hardwareType,
        parsed.carrier,
        null,
        hashedKey,
        prefix
      ]
    );
    const created = result.rows[0];
    await db.query(
      `INSERT INTO gateway_keys (gateway_id, api_key_hash, api_key_prefix, label, created_by_user_id)
       VALUES ($1, $2, $3, 'Initial key', $4)`,
      [created.id, hashedKey, prefix, session.user.id]
    );
    await db.query(
      `INSERT INTO gateway_pool_memberships (gateway_pool_id, gateway_id)
       VALUES ($1, $2)
       ON CONFLICT (gateway_pool_id, gateway_id) DO NOTHING`,
      [defaultGatewayPoolId, created.id]
    );
    await db.query(
      `INSERT INTO gateway_access (gateway_id, organization_id, access_level)
       VALUES ($1, $2, $3)
       ON CONFLICT (gateway_id, organization_id) DO UPDATE
         SET access_level = EXCLUDED.access_level,
             updated_at = now()`,
      [created.id, organizationId, parsed.visibility === "client_owned" ? "manage" : "status_only"]
    );
    return created;
  });
  redirect(`/gateways/${gateway.id}?apiKey=${encodeURIComponent(apiKey)}`);
}

export async function updateGatewayAction(formData: FormData) {
  const gatewayId = String(formData.get("gatewayId") || "");
  if (!gatewayId) redirect("/gateways");
  await requireGatewayActionAccess(gatewayId, "operator");

  const parsed = gatewayUpdateSchema.parse({
    name: formData.get("name"),
    hardwareType: formData.get("hardwareType") || null,
    carrier: formData.get("carrier") || null,
    location: formData.get("location") || null,
    notes: formData.get("notes") || null,
    routingWeight: formData.get("routingWeight") || null,
    hourlySendLimit: formData.get("hourlySendLimit") || null
  });

  await transaction(async (db) => {
    await db.query(
      `UPDATE gateways
          SET name = $1,
              hardware_type = $2,
              carrier = $3,
              apn_profile = $4,
              location = $5,
              notes = $6,
              routing_weight = $7,
              hourly_send_limit = $8,
              updated_at = now()
        WHERE id = $9`,
      [
        parsed.name,
        parsed.hardwareType || null,
        parsed.carrier || null,
        null,
        parsed.location || null,
        parsed.notes || null,
        parsed.routingWeight || 100,
        parsed.hourlySendLimit || null,
        gatewayId
      ]
    );
  });

  revalidatePath("/gateways");
  revalidatePath(`/gateways/${gatewayId}`);
  redirect(`/gateways/${gatewayId}`);
}

export async function requeueMessageAction(formData: FormData) {
  await requireActionRole("operator");

  const messageId = String(formData.get("messageId") || "");
  if (!messageId) return;

  await requeueMessage(messageId);
  revalidatePath("/messages");
  revalidatePath(`/messages/${messageId}`);
  redirect(`/messages/${messageId}`);
}

export async function cancelMessageAction(formData: FormData) {
  await requireActionRole("operator");

  const messageId = String(formData.get("messageId") || "");
  if (!messageId) return;

  await cancelMessage(messageId);
  revalidatePath("/messages");
  revalidatePath(`/messages/${messageId}`);
  redirect(`/messages/${messageId}`);
}

export async function createApiClientAction(formData: FormData) {
  const { session, account } = await requireAccountActionRole("org_admin");

  const parsed = apiClientCreateSchema.parse({
    name: formData.get("name"),
    keyLabel: formData.get("keyLabel") || "Production"
  });
  try {
    await assertPlanCapacity(account.organizationId, account.plan, "api_key");
  } catch (error) {
    redirectWithMessage("/clients", error instanceof Error ? error.message : "API key limit exceeded");
  }

  const { client, apiKey } = await createApiClient({
    name: parsed.name,
    keyLabel: parsed.keyLabel,
    userId: session.user.id,
    organizationId: account.organizationId
  });
  redirect(`/clients?apiKey=${encodeURIComponent(apiKey)}&clientId=${encodeURIComponent(client.id)}`);
}

export async function createApiClientKeyAction(formData: FormData) {
  const { session, account } = await requireAccountActionRole("org_admin");

  const clientId = String(formData.get("clientId") || "");
  const label = String(formData.get("label") || "").trim();
  if (!clientId || !label) redirect("/clients");

  try {
    await assertPlanCapacity(account.organizationId, account.plan, "api_key");
  } catch (error) {
    redirectWithMessage(`/clients/${clientId}`, error instanceof Error ? error.message : "API key limit exceeded");
  }

  const result = await createApiClientKey({
    clientId,
    label,
    userId: session.user.id,
    organizationId: account.organizationId
  });
  if (!result) redirect(`/clients/${clientId}?error=Client%20not%20found%20or%20disabled`);

  revalidatePath("/clients");
  revalidatePath(`/clients/${clientId}`);
  redirect(`/clients/${clientId}?apiKey=${encodeURIComponent(result.apiKey)}`);
}

export async function rotateApiClientKeyAction(formData: FormData) {
  const session = await requireActionRole("org_admin");

  const clientId = String(formData.get("clientId") || "");
  if (!clientId) redirect("/clients");

  const result = await rotateApiClientKey({
    clientId,
    userId: session.user.id,
    organizationId: await getCurrentOrganizationId({ userId: session.user.id, role: session.user.role })
  });
  if (!result) redirect("/clients?error=Client%20not%20found%20or%20disabled");

  revalidatePath("/clients");
  redirect(`/clients?apiKey=${encodeURIComponent(result.apiKey)}&clientId=${encodeURIComponent(result.client.id)}`);
}

export async function disableApiClientAction(formData: FormData) {
  const session = await requireActionRole("org_admin");

  const clientId = String(formData.get("clientId") || "");
  if (!clientId) redirect("/clients");

  await disableApiClient(clientId, {
    organizationId: await getCurrentOrganizationId({ userId: session.user.id, role: session.user.role })
  });
  revalidatePath("/clients");
  redirect("/clients");
}

export async function enableApiClientAction(formData: FormData) {
  const session = await requireActionRole("org_admin");

  const clientId = String(formData.get("clientId") || "");
  if (!clientId) redirect("/clients");

  await enableApiClient(clientId, {
    organizationId: await getCurrentOrganizationId({ userId: session.user.id, role: session.user.role })
  });
  revalidatePath("/clients");
  redirect("/clients");
}

export async function updateApiClientLimitsAction(formData: FormData) {
  const session = await requireActionRole("org_admin");

  const clientId = String(formData.get("clientId") || "");
  if (!clientId) redirect("/clients");

  const hourlyRaw = String(formData.get("hourlyMessageLimit") || "").trim();
  const dailyRaw = String(formData.get("dailyMessageLimit") || "").trim();
  await updateApiClientLimits({
    clientId,
    hourlyMessageLimit: hourlyRaw ? Number(hourlyRaw) : null,
    dailyMessageLimit: dailyRaw ? Number(dailyRaw) : null,
    organizationId: await getCurrentOrganizationId({ userId: session.user.id, role: session.user.role })
  });
  revalidatePath("/clients");
  redirect("/clients");
}

export async function createGatewayPoolAction(formData: FormData) {
  const session = await requireActionRole("org_admin");

  const name = String(formData.get("name") || "").trim();
  const description = String(formData.get("description") || "").trim();
  if (!name) redirect("/routing");

  await transaction(async (db) => {
    const organizationId = await getCurrentOrganizationId({ userId: session.user.id, role: session.user.role });
    await db.query(
      `INSERT INTO gateway_pools (organization_id, name, slug, description)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (organization_id, slug) DO UPDATE
         SET name = EXCLUDED.name,
             description = EXCLUDED.description,
             updated_at = now()`,
      [organizationId, name, slugify(name), description || null]
    );
  });

  revalidatePath("/routing");
  redirect("/routing");
}

export async function addGatewayToPoolAction(formData: FormData) {
  const session = await requireActionRole("org_admin");

  const poolId = String(formData.get("poolId") || "");
  const gatewayId = String(formData.get("gatewayId") || "");
  if (!poolId || !gatewayId) redirect("/routing");
  const organizationId = await getCurrentOrganizationId({ userId: session.user.id, role: session.user.role });

  await transaction(async (db) => {
    await db.query(
      `INSERT INTO gateway_pool_memberships (gateway_pool_id, gateway_id)
       SELECT $1, $2
        WHERE EXISTS (
              SELECT 1 FROM gateway_pools
               WHERE id = $1 AND organization_id = $3
            )
          AND EXISTS (
              SELECT 1 FROM gateways
               WHERE id = $2 AND organization_id = $3
            )
       ON CONFLICT (gateway_pool_id, gateway_id) DO NOTHING`,
      [poolId, gatewayId, organizationId]
    );
  });

  revalidatePath("/routing");
  redirect("/routing");
}

export async function removeGatewayFromPoolAction(formData: FormData) {
  const session = await requireActionRole("org_admin");

  const poolId = String(formData.get("poolId") || "");
  const gatewayId = String(formData.get("gatewayId") || "");
  if (!poolId || !gatewayId) redirect("/routing");
  const organizationId = await getCurrentOrganizationId({ userId: session.user.id, role: session.user.role });

  await query(
    `DELETE FROM gateway_pool_memberships
      WHERE gateway_pool_id = $1
        AND gateway_id = $2
        AND EXISTS (
          SELECT 1 FROM gateway_pools
           WHERE id = $1 AND organization_id = $3
        )`,
    [poolId, gatewayId, organizationId]
  );

  revalidatePath("/routing");
  redirect("/routing");
}

export async function grantClientPoolAccessAction(formData: FormData) {
  const session = await requireActionRole("org_admin");

  const poolId = String(formData.get("poolId") || "");
  const clientId = String(formData.get("clientId") || "");
  const makeDefault = String(formData.get("makeDefault") || "") === "on";
  if (!poolId || !clientId) redirect("/routing");
  const organizationId = await getCurrentOrganizationId({ userId: session.user.id, role: session.user.role });

  await transaction(async (db) => {
    if (makeDefault) {
      await db.query(
        `UPDATE api_client_gateway_pool_access
            SET is_default = false
          WHERE api_client_id = $1
            AND EXISTS (
              SELECT 1 FROM api_clients
               WHERE id = $1 AND organization_id = $2
            )`,
        [clientId, organizationId]
      );
    }
    await db.query(
      `INSERT INTO api_client_gateway_pool_access (api_client_id, gateway_pool_id, is_default)
       SELECT $1, $2, $3
        WHERE EXISTS (
              SELECT 1 FROM api_clients
               WHERE id = $1 AND organization_id = $4
            )
          AND EXISTS (
              SELECT 1 FROM gateway_pools
               WHERE id = $2 AND organization_id = $4
            )
       ON CONFLICT (api_client_id, gateway_pool_id) DO UPDATE
         SET is_default = EXCLUDED.is_default`,
      [clientId, poolId, makeDefault, organizationId]
    );
  });

  revalidatePath("/routing");
  redirect("/routing");
}

export async function revokeClientPoolAccessAction(formData: FormData) {
  const session = await requireActionRole("org_admin");

  const poolId = String(formData.get("poolId") || "");
  const clientId = String(formData.get("clientId") || "");
  if (!poolId || !clientId) redirect("/routing");
  const organizationId = await getCurrentOrganizationId({ userId: session.user.id, role: session.user.role });

  await query(
    `DELETE FROM api_client_gateway_pool_access
      WHERE gateway_pool_id = $1
        AND api_client_id = $2
        AND EXISTS (
          SELECT 1 FROM gateway_pools
           WHERE id = $1 AND organization_id = $3
        )
        AND EXISTS (
          SELECT 1 FROM api_clients
           WHERE id = $2 AND organization_id = $3
        )`,
    [poolId, clientId, organizationId]
  );

  revalidatePath("/routing");
  redirect("/routing");
}

export async function processCallbacksAction() {
  await requireActionRole("operator");

  await processPendingCallbackDeliveries(25);
  revalidatePath("/callbacks");
  redirect("/callbacks");
}

export async function retryCallbackAction(formData: FormData) {
  await requireActionRole("operator");

  const deliveryId = String(formData.get("deliveryId") || "");
  if (deliveryId) {
    await retryCallbackDelivery(deliveryId);
  }
  revalidatePath("/callbacks");
  redirect("/callbacks");
}

export async function generateAlertsAction() {
  await requireActionRole("operator");

  await generateOperationalAlerts();
  revalidatePath("/alerts");
  redirect("/alerts");
}

export async function resolveAlertAction(formData: FormData) {
  await requireActionRole("operator");

  const alertId = String(formData.get("alertId") || "");
  if (alertId) {
    await resolveAlert(alertId);
  }
  revalidatePath("/alerts");
  redirect("/alerts");
}

export async function runMaintenanceAction() {
  await requireActionRole("operator");

  await runMaintenanceJobs();
  revalidatePath("/usage");
  redirect("/usage");
}

export async function enableGatewayAction(formData: FormData) {
  const gatewayId = String(formData.get("gatewayId") || "");
  if (!gatewayId) redirect("/gateways");
  await requireGatewayActionAccess(gatewayId, "operator");

  await enableGateway(gatewayId);
  revalidatePath("/gateways");
  revalidatePath(`/gateways/${gatewayId}`);
  redirect(`/gateways/${gatewayId}`);
}

export async function markGatewayMaintenanceAction(formData: FormData) {
  const gatewayId = String(formData.get("gatewayId") || "");
  if (!gatewayId) redirect("/gateways");
  await requireGatewayActionAccess(gatewayId, "operator");

  await markGatewayMaintenance(gatewayId);
  revalidatePath("/gateways");
  revalidatePath(`/gateways/${gatewayId}`);
  redirect(`/gateways/${gatewayId}`);
}

export async function requestGatewayCommandAction(formData: FormData) {
  const gatewayId = String(formData.get("gatewayId") || "");
  const commandType = String(formData.get("commandType") || "");
  if (!gatewayId || !commandType) redirect("/gateways");
  if (!["diagnostics", "reset_modem", "restart_service", "update_service"].includes(commandType)) {
    redirect(`/gateways/${gatewayId}`);
  }
  const { session } = await requireGatewayActionAccess(gatewayId, "operator");

  await requestGatewayCommand({
    gatewayId,
    commandType,
    userId: session.user.id
  });
  revalidatePath(`/gateways/${gatewayId}`);
  redirect(`/gateways/${gatewayId}`);
}
