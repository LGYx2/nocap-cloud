// Plain constants with no dependencies, safe to import from the browser.

/** Minimum password length for the admin account. */
export const PASSWORD_MIN_LENGTH = 12;

/** Limits for project names and descriptions, shared by the API and the panel forms. */
export const PROJECT_NAME_MAX = 60;
export const PROJECT_DESCRIPTION_MAX = 200;

/** Limits for applications and their environment variables. */
export const APP_NAME_MAX = 60;
export const ENV_KEY_MAX = 128;
export const ENV_VALUE_MAX = 8000;
export const ENV_VARS_MAX = 200;
