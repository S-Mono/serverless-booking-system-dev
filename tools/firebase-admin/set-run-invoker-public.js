#!/usr/bin/env node
/* eslint-disable no-console */

const path = require('path');
const { GoogleAuth } = require('google-auth-library');

const PROJECT_ID = 'booking-system-dev-81786';
const REGION = 'asia-northeast1';
const SERVICES = [
  'sendtemporaryreservationservicemessage',
  'deleteuseraccount',
  'adminupdatepassword',
  'resetpasswordwithtoken',
];

const keyFileCandidates = [
  path.resolve(__dirname, '../../private-key.json'),
  path.resolve(__dirname, '../../../private-key.json'),
];

const getKeyFilePath = () => {
  for (const p of keyFileCandidates) {
    try {
      require('fs').accessSync(p);
      return p;
    } catch (_) {
      // keep looking
    }
  }
  throw new Error('private-key.json not found in expected paths');
};

const ensurePublicInvoker = async (client, serviceName) => {
  const resource = `projects/${PROJECT_ID}/locations/${REGION}/services/${serviceName}`;
  const baseUrl = `https://run.googleapis.com/v2/${resource}`;

  const getRes = await client.request({
    url: `${baseUrl}:getIamPolicy`,
    method: 'GET',
  });

  const policy = getRes.data || {};
  policy.bindings = Array.isArray(policy.bindings) ? policy.bindings : [];

  let binding = policy.bindings.find((b) => b.role === 'roles/run.invoker');
  if (!binding) {
    binding = { role: 'roles/run.invoker', members: [] };
    policy.bindings.push(binding);
  }

  binding.members = Array.isArray(binding.members) ? binding.members : [];
  if (!binding.members.includes('allUsers')) {
    binding.members.push('allUsers');
  }

  await client.request({
    url: `${baseUrl}:setIamPolicy`,
    method: 'POST',
    data: { policy },
  });

  return true;
};

(async () => {
  try {
    const keyFile = getKeyFilePath();
    const auth = new GoogleAuth({
      keyFile,
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });

    const client = await auth.getClient();
    console.log(`Using key file: ${keyFile}`);

    for (const service of SERVICES) {
      process.stdout.write(`Setting public invoker for ${service} ... `);
      await ensurePublicInvoker(client, service);
      console.log('OK');
    }

    console.log('Completed.');
  } catch (error) {
    const details = error?.response?.data || error;
    console.error('Failed to set Cloud Run invoker policy.');
    console.error(details);
    process.exit(1);
  }
})();
