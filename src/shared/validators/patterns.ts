/**
 * Shared regex patterns for field-level character validation.
 *
 * SQL injection protection is handled at the ORM level (Prisma uses
 * parameterized queries for every operation). These patterns add a
 * second layer by rejecting structurally invalid characters before
 * data ever reaches the database.
 */

/**
 * Spanish text: letters (Latin + accented Spanish), digits, spaces
 * and common punctuation used in names, labels and short descriptions.
 * Covers: A-Z, a-z, À-Ö, Ø-ö, ø-ÿ (includes á é í ó ú ü ñ Ñ etc.)
 */
export const SPANISH_TEXT = /^[A-Za-zÀ-ÖØ-öø-ÿ0-9 \-.,()&'"/]+$/;

/**
 * Address: same as SPANISH_TEXT plus # (exterior/interior number) and ° (degree symbol used in some MX addresses).
 */
export const ADDRESS_TEXT = /^[A-Za-zÀ-ÖØ-öø-ÿ0-9 \-.,()&#°'"/]+$/;

/**
 * Short identifier / code: alphanumeric, hyphen, underscore.
 * Used for Unit.code (L1, LP, OF-2, etc.).
 */
export const IDENTIFIER_CODE = /^[A-Za-z0-9_-]+$/;

/**
 * Cadastral key: alphanumeric, hyphen, slash, dot.
 * Municipal formats vary (e.g. "018-001-234-567" or "ABC/1234.5").
 */
export const CADASTRAL_KEY = /^[A-Za-z0-9_\-/.]+$/;

/**
 * Promoter phone: digits only (10–15). Caller pre-strips the +52 prefix.
 */
export const DIGITS_ONLY = /^[0-9]+$/;
