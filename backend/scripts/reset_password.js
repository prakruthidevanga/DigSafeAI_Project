/**
 * Secure password reset script for DigSafe AI.
 *
 * PURPOSE
 * -------
 * Resets the password for a specific user account using the same bcrypt
 * hashing cost factor (12) used by authRoutes.js. Does NOT touch any other
 * user records or any other collection.
 *
 * USAGE
 *   node scripts/reset_password.js <email> <newPassword>
 *
 * SECURITY
 * --------
 * - Passwords are hashed with bcrypt (cost 12) before writing.
 * - The plaintext password is NEVER written to the database or any log file.
 * - The bcrypt hash is NEVER printed to the console.
 * - Run this script in a private terminal; clear your terminal history afterwards.
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();
const { getMongoUri } = require('../lib/config');
const { normalizeEmail } = require('../lib/validators');

const BCRYPT_COST = 12; // Must match authRoutes.js

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 2) {
    console.error('Usage: node scripts/reset_password.js <email> <newPassword>');
    console.error('  Password must be at least 8 characters.');
    process.exit(1);
  }

  const [rawEmail, newPassword] = args;
  const email = normalizeEmail(rawEmail);

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error('ERROR: Invalid email address:', rawEmail);
    process.exit(1);
  }
  if (typeof newPassword !== 'string' || newPassword.length < 8) {
    console.error('ERROR: Password must be at least 8 characters.');
    process.exit(1);
  }

  await mongoose.connect(getMongoUri());
  const db = mongoose.connection.db;
  console.log('Connected to DB:', db.databaseName);

  const users = db.collection('users');
  const existing = await users.findOne({ email }, { projection: { _id: 1, name: 1 } });
  if (!existing) {
    console.error('ERROR: No user found with email:', email);
    const allEmails = (await users.find({}, { projection: { email: 1 } }).toArray()).map(u => u.email);
    console.error('Registered emails:', allEmails.join(', '));
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log('User found: name=' + existing.name + ', email=' + email);

  // Hash the new password — plaintext is never stored
  const hash = await bcrypt.hash(newPassword, BCRYPT_COST);

  // Verify the hash round-trips correctly before writing
  const verified = await bcrypt.compare(newPassword, hash);
  if (!verified) {
    console.error('INTERNAL ERROR: bcrypt round-trip verification failed. Password NOT changed.');
    await mongoose.disconnect();
    process.exit(1);
  }

  // Write only the new hash — no other fields touched
  const result = await users.updateOne(
    { email },
    { $set: { password: hash } }
  );

  if (result.modifiedCount !== 1) {
    console.error('ERROR: Update did not modify any document. Password NOT changed.');
    await mongoose.disconnect();
    process.exit(1);
  }

  // Final verification: read back and confirm compare works
  const updated = await users.findOne({ email }, { projection: { password: 1 } });
  const finalVerified = await bcrypt.compare(newPassword, updated.password);
  if (!finalVerified) {
    console.error('ERROR: Post-write verification failed. The stored hash does not match the new password.');
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log('');
  console.log('SUCCESS: Password updated and verified for ' + email);
  console.log('  bcrypt cost used: ' + BCRYPT_COST);
  console.log('  post-write bcrypt.compare: PASS');
  console.log('  (The plaintext password was not written to any log or database field.)');

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Script failed:', err.message);
  process.exit(1);
});
