import type { PrismaClient } from '../generated/prisma/client';
import type { TransactionClient } from '@/lib/db';
import { VARIABLE_PATTERN, SUPPORTED_TEMPLATE_VARIABLES } from '@/lib/email/template';

type DbClient = PrismaClient | TransactionClient;

/**
 * Missing-personalization pre-send check (§11.16, §11.25).
 *
 * Scans a template's subject + body for `{{token}}` patterns, maps them to
 * built-in and custom fields, queries the selected contacts for missing
 * values, and returns the counts. Used by both the pre-check endpoint and
 * the campaign scheduling endpoint to enforce the recheck rule.
 */

/** Built-in columns that can be "missing" (null/empty) on a contact. */
const BUILTIN_NULLABLE_COLUMNS = [] as const;

export interface MissingValueEntry {
  token: string;
  label: string;
  contactCount: number;
  contactIds: string[];
}

export interface MissingValueResult {
  missingValues: MissingValueEntry[];
  unknownTokens: string[];
  affectedContactCount: number;
  totalContactCount: number;
}

/**
 * Run the missing-value check. The caller is responsible for verifying
 * ownership of the template and contacts — this function only performs the
 * scan and value lookup.
 */
export async function runMissingValueCheck(
  prisma: DbClient,
  userId: string,
  templateSubject: string,
  templateBody: string,
  contactIds: string[]
): Promise<MissingValueResult> {
  const fieldDefs = await prisma.contactField.findMany({
    where: { user_id: userId },
    select: { id: true, name: true, label: true },
  });
  const fieldByToken = new Map(fieldDefs.map((f) => [f.name, f]));
  const knownTokens = new Set<string>([...SUPPORTED_TEMPLATE_VARIABLES, ...fieldByToken.keys()]);

  const subjectTokens = new Set(
    [...templateSubject.matchAll(VARIABLE_PATTERN)].map((m) => m[1].toLowerCase())
  );
  const bodyTokens = new Set(
    [...templateBody.matchAll(VARIABLE_PATTERN)].map((m) => m[1].toLowerCase())
  );
  const allTokens = new Set([...subjectTokens, ...bodyTokens]);

  const unknownTokens: string[] = [];
  const knownTokenList: Array<{ token: string; label: string }> = [];
  for (const token of allTokens) {
    if (knownTokens.has(token)) {
      if (fieldByToken.has(token)) {
        knownTokenList.push({ token, label: fieldByToken.get(token)!.label });
      } else if (BUILTIN_NULLABLE_COLUMNS.includes(token as typeof BUILTIN_NULLABLE_COLUMNS[number])) {
        knownTokenList.push({ token, label: token.charAt(0).toUpperCase() + token.slice(1) });
      }
    } else {
      unknownTokens.push(`{{${token}}}`);
    }
  }

  const totalContactCount = contactIds.length;

  if (knownTokenList.length === 0) {
    return {
      missingValues: [],
      unknownTokens,
      affectedContactCount: 0,
      totalContactCount,
    };
  }

  const contacts = await prisma.contact.findMany({
    where: { id: { in: contactIds }, user_id: userId },
    select: { id: true, name: true, email: true },
  });

  const fieldValues = await prisma.contactFieldValue.findMany({
    where: { contact_id: { in: contactIds } },
    select: { contact_id: true, field_id: true, value: true },
  });

  const fieldIdByToken = new Map(fieldDefs.map((f) => [f.name, f.id]));
  const valuesByContact = new Map<string, Map<string, string | null>>();
  for (const v of fieldValues) {
    const arr = valuesByContact.get(v.contact_id) ?? new Map();
    arr.set(v.field_id, v.value);
    valuesByContact.set(v.contact_id, arr);
  }

  const missingValues: MissingValueEntry[] = [];

  for (const { token, label } of knownTokenList) {
    const missingContactIds: string[] = [];
    for (const contact of contacts) {
      if (BUILTIN_NULLABLE_COLUMNS.includes(token as typeof BUILTIN_NULLABLE_COLUMNS[number])) {
        continue;
      } else {
        const fieldId = fieldIdByToken.get(token);
        if (!fieldId) continue;
        const contactValues = valuesByContact.get(contact.id);
        const value = contactValues?.get(fieldId);
        if (value == null || value.trim() === '') {
          missingContactIds.push(contact.id);
        }
      }
    }
    if (missingContactIds.length > 0) {
      missingValues.push({
        token,
        label,
        contactCount: missingContactIds.length,
        contactIds: missingContactIds,
      });
    }
  }

  const affectedContactIds = new Set<string>();
  for (const mv of missingValues) {
    for (const id of mv.contactIds) {
      affectedContactIds.add(id);
    }
  }

  return {
    missingValues,
    unknownTokens,
    affectedContactCount: affectedContactIds.size,
    totalContactCount,
  };
}

/**
 * Compute the set of contact IDs that have missing values for the template
 * tokens. Used by the campaign scheduling endpoint to filter contacts when
 * `missing_value_action: "exclude"` is submitted.
 */
export function contactsMissingValues(result: MissingValueResult): Set<string> {
  const ids = new Set<string>();
  for (const mv of result.missingValues) {
    for (const id of mv.contactIds) {
      ids.add(id);
    }
  }
  return ids;
}
