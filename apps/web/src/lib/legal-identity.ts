import identityFile from "../../../../data/legal-identity.json";

/**
 * Merchant identity for the PayMongo review surfaces.
 *
 * The registration and address facts live in `data/legal-identity.json` at the
 * repo root — one file, so a legal page never hardcodes a registration number
 * and the four disclosures can never disagree with each other. The file ships
 * with the literal string "TBD" wherever ADVO's DTI/SEC paperwork has not been
 * transcribed yet; nothing in this module invents a value to fill the gap.
 */
export interface LegalIdentity {
  trade_name: string;
  legal_name: string;
  registration_number: string;
  registration_body: string;
  business_address: string;
  support_email: string;
  support_phone: string;
  effective_date: string;
}

export const legalIdentity = identityFile as LegalIdentity;

/** The placeholder vocabulary `bench:paymongo` treats as "not supplied yet". */
const pendingPattern = /^(|TODO|TBD|CHANGEME|xxx+|—|-)$/i;

export const isIdentityPending = (value: string | undefined | null): boolean =>
  pendingPattern.test(String(value ?? "").trim());

/** The value, or `null` when it is still a placeholder. Never a fabricated one. */
export const identityValue = (field: keyof LegalIdentity): string | null => {
  const value = legalIdentity[field];
  return isIdentityPending(value) ? null : value;
};

/** Every identity field still waiting on the paperwork, in document order. */
export const pendingIdentityField = (
  Object.keys(legalIdentity) as (keyof LegalIdentity)[]
).filter((field) => isIdentityPending(legalIdentity[field]));
