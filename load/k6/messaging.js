import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  scenarios: {
    workspace_traffic: {
      executor: 'constant-vus',
      vus: 20,
      duration: '30s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<800'],
  },
};

const base = __ENV.BASE_URL || 'http://localhost:8080';

export function setup() {
  const login = http.post(
    `${base}/api/auth/login`,
    JSON.stringify({
      email: __ENV.SEED_EMAIL || 'amira@kepler.io',
      password: __ENV.SEED_USER_PASSWORD,
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  check(login, { 'login succeeded': (response) => response.status === 200 });
  const token = login.json('accessToken');
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  const workspaces = http.get(`${base}/api/workspaces`, { headers });
  const workspaceId = workspaces.json()[0].id;
  const channel = http.post(
    `${base}/api/workspaces/${workspaceId}/channels`,
    JSON.stringify({
      name: `throughput-${Date.now().toString().slice(-6)}`,
      topic: 'Load lane for message throughput',
      isPrivate: true,
    }),
    { headers },
  );
  check(channel, { 'lane created': (response) => response.status === 201 });
  return { token, workspaceId, channelId: channel.json('id') };
}

export default function (data) {
  const headers = {
    Authorization: `Bearer ${data.token}`,
    'Content-Type': 'application/json',
  };
  const channels = http.get(`${base}/api/workspaces/${data.workspaceId}/channels`, { headers });
  check(channels, { 'channels listed': (response) => response.status === 200 });

  const history = http.get(`${base}/api/channels/${data.channelId}/messages`, { headers });
  check(history, { 'history loaded': (response) => response.status === 200 });

  if (__ITER % 4 === 0) {
    const posted = http.post(
      `${base}/api/channels/${data.channelId}/messages`,
      JSON.stringify({
        body: `Throughput note ${__VU}-${__ITER}: cursor stays stable while the board is being read`,
      }),
      { headers },
    );
    check(posted, { 'message accepted': (response) => response.status === 201 });
  }

  const found = http.get(`${base}/api/workspaces/${data.workspaceId}/search?q=forecast`, {
    headers,
  });
  check(found, { 'search answered': (response) => response.status === 200 });
  sleep(0.5);
}
