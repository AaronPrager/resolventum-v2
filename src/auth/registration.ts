/**
 * Whether new schools can sign up. Closed unless the server sets
 * REGISTRATION_OPEN=true, so a fresh deployment never takes accounts by accident.
 * Invitations to an existing school still work either way.
 */
export function registrationOpen(): boolean {
  return process.env.REGISTRATION_OPEN === "true";
}

export const REGISTRATION_CLOSED_MESSAGE = "Resolventum is currently not accepting new accounts. If you were invited to a school, use the link in your invitation. Otherwise write to info@resolventum.com and we will let you know when sign-up opens.";
