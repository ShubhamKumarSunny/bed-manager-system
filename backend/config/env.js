// backend/config/env.js
// Central place for environment-derived settings

const isProduction = process.env.NODE_ENV === 'production';

// True on Vercel / AWS Lambda style hosts: no long-lived process, no websockets,
// read-only filesystem.
const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

let warnedAboutSecret = false;

function getJwtSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;

  if (isProduction) {
    throw new Error('JWT_SECRET environment variable is required in production');
  }

  if (!warnedAboutSecret) {
    console.warn('⚠️  JWT_SECRET not set - using an insecure development secret');
    warnedAboutSecret = true;
  }
  return 'bedmanager-dev-secret-do-not-use-in-production';
}

module.exports = { isProduction, isServerless, getJwtSecret };
